# github-stars-to-sqlite

GitHub 별표를 SQLite 파일 하나에 적재하고, 그 위에서 검색한다.

```
github-stars-to-sqlite/     # pnpm workspaces
├─ core/     CLI + 적재 — GitHub → stars.db. 런타임 의존성 없음
├─ web/      Next 앱 — stars.db 를 RSC 에서 직접 읽는 검색 뷰
└─ stars.db  스냅샷 (커밋됨). core 가 쓰고, web 이 읽는다
```

```bash
pnpm install
pnpm --filter @stars/core sync --full   # 전체 동기화
pnpm --filter @stars/core sync          # 증분 동기화
pnpm --filter @stars/web dev            # http://localhost:3000
```

런타임은 Node 24 다. `.ts` 를 타입 스트리핑으로 바로 실행하고, SQLite 는 `node:sqlite`, HTTP 는 `fetch` 를 쓴다. 빌드 단계는 없다.

동작 명세는 [SPEC.md](./SPEC.md) 에 있다.

## 토큰

`GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token` 순으로 찾는다. 필요한 권한은 `starring:read` 하나다.

## stars.db 스냅샷

`stars.db` 는 커밋한다. 5MB 안쪽이라 클론하면 뷰까지 적용된 상태로 바로 질의할 수 있다. 갱신은 수동이다.

```bash
pnpm --filter @stars/core sync
node core/make-views.ts ./stars.db
sqlite3 stars.db 'PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'
git commit -am "stars 스냅샷 갱신"
```

- WAL 을 접지 않고 커밋하면 마지막 동기화가 빠진다. `-wal`/`-shm` 은 `.gitignore` 에 있다.
- `VACUUM` 은 커밋마다 쌓이는 블롭 크기를 줄이려고 넣는다.
- 원본은 루트의 `stars.db` 하나다. web 은 빌드 때 `web/scripts/copy-db.mjs` 로 복사해 번들에 넣는다.

## 스키마

```
sync(id, mode, started_at, finished_at, pages, seen, added, changed, gone, ok)
star(repo_id PK, full_name, starred_at, sha256, data JSON,
     first_sync, last_sync, unstarred_sync)
```

repo 하나가 row 하나이고, `data` 는 GitHub 응답을 필드명 그대로 담은 JSON 이다. 자주 쓰는 필드는 `core/sql/views.sql` 의 뷰로 꺼내고, 느리면 생성 컬럼으로 승격한다. 어느 쪽도 재적재가 필요 없다.

```sql
ALTER TABLE star ADD COLUMN language TEXT
  GENERATED ALWAYS AS (json_extract(data, '$.language')) VIRTUAL;
CREATE INDEX star_language ON star(language) WHERE unstarred_sync IS NULL;
```

### 별표 타임라인

| 컬럼 | 뜻 |
| --- | --- |
| `first_sync` | 이 repo 를 처음 목록에서 본 동기화 |
| `last_sync` | 목록에서 마지막으로 확인된 동기화 |
| `unstarred_sync` | 사라진 걸 알아챈 동기화. `NULL` 이면 현재 별표 |

별표를 빼도 row 는 지우지 않는다. 다시 누르면 `unstarred_sync` 만 `NULL` 로 돌리고 `first_sync` 는 유지한다. `starred_at` 은 새 값으로 바뀐다 — GitHub 가 원래 시각을 돌려주지 않는다.

```sql
SELECT * FROM starred;    -- 현재 별표
SELECT * FROM unstarred;  -- 뺀 별표
```

## 동기화

```bash
pnpm --filter @stars/core sync --full   # 전체. 언스타까지 판정
pnpm --filter @stars/core sync          # 새 별표만. 보통 1페이지
```

- **언스타 판정은 전체 동기화에서만 한다.** 증분은 목록 앞부분만 보므로 판정하면 전부 오탐이다. DB 가 비어 있으면 `--full` 없이도 전체로 돈다.
- **정렬 방향이 모드마다 다르다.** `sort=created` 는 별표를 누른 시각 기준이다. `desc` 는 동기화 도중 새 별표가 생기면 페이지가 밀려 repo 하나를 건너뛸 수 있어서, 정확성이 필요한 전체 동기화는 `asc` 를 쓴다. 증분은 `desc` 로 앞부분만 훑고, `max(starred_at)` 이상인 항목까지 넣은 뒤 멈춘다.
- **페이지 하나가 트랜잭션 하나다.** 중간에 끊기면 앞 페이지는 남고 그 동기화는 `ok=0` 으로 끝난다. `ok=0` 인 동기화는 언스타를 판정하지 않는다. 다시 돌리면 된다.
- **멱등이다.** `repo_id` 가 기준이고, 페이로드 변경은 정규화된 JSON 의 `sha256` 으로 판정한다. 변경 이력은 남기지 않고 최신값으로 덮어쓴다 — `stargazers_count` 같은 값이 늘 바뀌어 회당 수 MB 가 쌓이기 때문이다. 변한 건수만 `sync.changed` 에 남는다.

레이트 리밋에 걸리면 복구 시각을 계산해서 알려준다.

## 정규화

`core/src/normalize.ts` 는 `url` 또는 `*_url` 인 키를 재귀적으로 지운다. 예외는 복원할 수 없는 `mirror_url` 하나다. 나머지 URL 은 `full_name` 과 `owner.id` 로 복원되며, 이것만으로 repo 당 평균 5,370B → 1,283B 가 된다.

```
html_url   = https://github.com/{full_name}
clone_url  = https://github.com/{full_name}.git
avatar_url = https://avatars.githubusercontent.com/u/{owner.id}?v=4
*_url(API) = https://api.github.com/repos/{full_name}/...
```

`starred_at` 만 unix epoch(초)로 바꿔 컬럼으로 뽑는다. 나머지 시각은 ISO 문자열 그대로 두고 뷰에서 `date()` 로 읽는다.

## 분류 (분석용)

이름·설명·토픽에 키워드를 걸어 열 개 도메인으로 나누는 휴리스틱이다. 정의는 `core/src/categories.ts` 이고, 뷰는 거기서 생성한다. **web 화면은 쓰지 않는다** — 이유는 [SPEC.md](./SPEC.md#분류를-왜-안-만들었나) 에 있다.

```bash
node core/make-views.ts              # views.sql 의 생성 구간만 갱신
node core/make-views.ts ./stars.db   # 갱신 후 그 db 에 적용
```

| 이름 | 종류 | 역할 |
| --- | --- | --- |
| `repo_text` | 뷰 | 이름·설명·토픽을 이어 붙인 검색 문자열 |
| `repo_match` | 뷰 | GLOB 규칙 (느리다, 2초) |
| `repo_category` | 표 | `repo_match` 결과를 굳힌 것. 인덱스 있음 (3ms) |
| `repo_primary_category` | 뷰 | 대표 도메인 하나 |

```sql
SELECT category, count(*) FROM repo_primary_category GROUP BY 1;
SELECT * FROM repo_category WHERE repo_id = 45300;
```

- 단어 경계는 GLOB 문자 클래스로 건다: `'*[^a-z0-9]ai[^a-z0-9]*'`. 키워드 안의 공백도 같은 클래스가 되어 `react native` 가 `react-native`·`react_native` 를 함께 잡는다. 끝에 `*` 를 붙이면 접두 매칭이다.
- `CATEGORIES` 배열 순서가 우선순위다. 좁은 도메인을 앞에 둔다.
- 키워드를 고치면 `make-views.ts` 만 다시 돌린다. 재동기화는 필요 없다.

## 예시 질의

`core/sql/views.sql` 적용 후. 해별 언어 비중:

```sql
WITH y AS (SELECT strftime('%Y', starred_at) AS yr, language FROM starred WHERE language IS NOT NULL)
SELECT yr, count(*) AS n,
       round(100.0 * sum(language='TypeScript') / count(*), 1) AS ts_pct,
       round(100.0 * sum(language='JavaScript') / count(*), 1) AS js_pct
FROM y GROUP BY yr HAVING n > 30 ORDER BY yr;
```

별표 이후 멈춘 저장소:

```sql
SELECT full_name, language, stars, last_push
FROM starred
WHERE archived OR last_push < date('now', '-4 years')
ORDER BY stars DESC;
```

토픽 분포:

```sql
SELECT topic, count(*) n FROM topic GROUP BY 1 ORDER BY n DESC LIMIT 20;
```

## 테스트 픽스처

`make-fixture.ts` 가 실제 응답과 같은 모양의 repo 5개를 만든다. `--from` 은 파일을 목록 전체로 보고 전체 동기화로 취급한다.

```bash
cd core
node make-fixture.ts
node src/cli.ts test.db --from fixture.json
jq '.[0:3]' fixture.json > less.json
node src/cli.ts test.db --from less.json    # 언스타 2
node src/cli.ts test.db --from fixture.json # 신규 2 (재스타), first_sync 는 보존
```

## web

Next 앱이 커밋된 `stars.db` 를 RSC 에서 `node:sqlite` 로 직접 질의한다.

- 상태는 URL(`?q &lang &topic &sort`)에 둔다. 클라이언트 컴포넌트는 `router.replace` 로 URL 만 바꾸고, 필터는 전부 SQL 에서 건다.
- 스펙트럼 막대는 언어 분포, 칩은 토픽 상위 20개다. 언어 이름과 같은 토픽은 칩에서 뺀다.
- UI 는 [Astryx](https://github.com/facebook/astryx) 로 짰다. `web/app/globals.css` 는 `@import` 세 줄뿐이고 색·간격·타이포는 `theme-neutral` 토큰에서 온다. 예외로 `web/app/spectrum.tsx` 는 `style` + `var(--color-*)` 로 직접 칠한다.
- DB 는 core 의 `openDb(path, { readonly: true })` 로 열고, `web/lib/db.ts` 가 모듈 싱글턴으로 재사용한다.

Vercel 배포 설정 (`next.config.ts`):

| 설정 | 이유 |
| --- | --- |
| `outputFileTracingIncludes` | import 되지 않는 `stars.db` 를 함수 번들에 넣는다 |
| `transpilePackages: ['@stars/core']` | core 의 `.ts` 를 Next 가 컴파일한다 |
| `outputFileTracingRoot` | pnpm 스토어와 워크스페이스 심링크가 루트 아래 있다 |
| `turbopack.root` | 없으면 `next start` 가 RSC 매니페스트를 못 찾아 빈 페이지가 된다 |

## node:sqlite 주의

- `db.transaction()` 이 없다. `core/src/db.ts` 의 `tx()` 가 `BEGIN`/`COMMIT`/`ROLLBACK` 을 건다.
- `prepare` 는 제네릭을 받지 않으므로 결과를 캐스팅한다. 없는 row 는 `undefined` 다.
- `.all()`/`.get()` 은 null-prototype 객체를 돌려준다. 클라이언트 컴포넌트로 넘기기 전에 `{ ...r }` 로 펴야 직렬화된다.
- SQL 문자열 리터럴은 홑따옴표로 쓴다. 큰따옴표는 컬럼명으로 해석된다.
- boolean 은 바인딩할 수 없다. 플래그는 `1`/`0` 으로 넣는다.
- `foreign_keys` 는 기본으로 켜져 있고, `journal_mode`/`synchronous` 는 직접 건다.
