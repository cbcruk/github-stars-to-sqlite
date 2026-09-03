# github-stars-to-sqlite

GitHub 에 눌러둔 별표를 SQLite 하나에 적재하고, 그 위에서 검색한다. 적재와 조회를 분리해 [fit-to-sqlite](https://github.com/cbcruk/fit-to-sqlite) 의 "적재는 이 저장소 책임, 분석은 `.db` 받는 쪽" 원칙을 두 패키지로 나눴다.

```
github-stars-to-sqlite/     # pnpm workspaces
├─ core/     CLI + 적재 — GitHub → stars.db. react 의존 없음
├─ web/      Next 앱 — stars.db 를 RSC 에서 직접 읽는 검색 뷰
└─ stars.db  캐넌컬 스냅샷 (커밋됨). core 가 쓰고, web 이 읽는다
```

```bash
pnpm install                            # 워크스페이스 전체
pnpm --filter @stars/core sync --full   # 전체 동기화 (루트 stars.db)
pnpm --filter @stars/core sync          # 이후에는 증분
pnpm --filter @stars/web dev            # 검색 앱 (http://localhost:3000)
```

런타임은 Node 24 다. 타입 스트리핑으로 `.ts` 를 그대로 실행하므로 빌드 단계가 없고, SQLite 는 내장 `node:sqlite`, HTTP 는 내장 `fetch` 를 쓴다 — core 는 런타임 의존성이 없다. 예전엔 Bun 이었지만, Node 24 가 `.ts` 직접 실행과 내장 SQLite 를 둘 다 갖추면서 web(Node/Vercel)과 런타임·바인딩을 통일할 수 있게 돼 옮겼다.

## 저장소에 포함된 stars.db

`stars.db` 는 커밋해서 관리한다. 개인용이고 5MB 안쪽이라 재현 스크립트를 두는 것보다
스냅샷을 그대로 들고 다니는 편이 낫다 — 클론하면 바로 질의가 되고, 뷰도 적용된 상태다.

갱신은 수동이다. 동기화한 뒤 WAL 을 접고 커밋한다.

```bash
pnpm --filter @stars/core sync
sqlite3 stars.db 'PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'
git commit -am "stars 스냅샷 갱신"
```

`sync` 스크립트는 루트의 `stars.db` 를 대상으로 돈다. web 은 이 파일을 빌드 때 자기 디렉터리로 복사해(`web/scripts/copy-db.mjs`) 번들에 넣으므로, 원본은 루트 하나뿐이다.

`VACUUM` 은 선택이지만 매 커밋이 4.5MB 블롭을 새로 쌓으므로 넣어둔다.
`-wal`/`-shm` 은 `.gitignore` 에 있다 — 접지 않고 커밋하면 마지막 동기화가
빠진 파일이 올라간다.

## 토큰

`GITHUB_TOKEN` 또는 `GH_TOKEN` 을 먼저 보고, 없으면 `gh auth token` 을 부른다. `gh auth login` 이 되어 있으면 아무 설정 없이 돌아간다. 필요한 권한은 `starring:read` 하나뿐이다.

## 스키마

테이블은 둘뿐이다.

```
sync(id, mode, started_at, finished_at, pages, seen, added, changed, gone, ok)
star(repo_id PK, full_name, starred_at, sha256, data JSON,
     first_sync, last_sync, unstarred_sync)
```

repo 하나가 row 하나고, 본문은 GitHub 응답 필드명 그대로의 JSON 이다(`stargazers_count`, `pushed_at` … 스네이크로 온 걸 그대로 둔다). 어떤 필드를 컬럼으로 승격할지 미리 정하지 않는다. 질의를 몇 번 돌려서 실제 쓰는 필드가 드러난 다음 `core/sql/views.sql` 에 뷰로 굳히고, 그래도 느리면 생성 컬럼으로 승격한다. 셋 다 재적재가 필요 없다.

```sql
ALTER TABLE star ADD COLUMN language TEXT
  GENERATED ALWAYS AS (json_extract(data, '$.language')) VIRTUAL;
CREATE INDEX star_language ON star(language) WHERE unstarred_sync IS NULL;
```

## 별표 타임라인

`.fit` 파일과 다른 점은 원본이 파일이 아니라 계속 변하는 원격 목록이라는 것이다. 그래서 "지금 별표한 것"만으로는 부족하고, 언제부터 보였고 언제 사라졌는지가 남아야 한다. 세 컬럼이 그 일을 한다.

| 컬럼 | 뜻 |
| --- | --- |
| `first_sync` | 이 repo 를 처음 목록에서 본 동기화 |
| `last_sync` | 목록에서 마지막으로 확인된 동기화 |
| `unstarred_sync` | 사라진 걸 알아챈 동기화. `NULL` 이면 현재 별표 |

별표를 빼도 row 는 지우지 않는다. 그래서 "작년에 뺀 게 뭐였더라"가 조회 가능하다.

```sql
SELECT * FROM starred;    -- 현재 별표 (unstarred_sync IS NULL)
SELECT * FROM unstarred;  -- 뺀 별표 + 알아챈 시각
```

뺐던 별표를 다시 누르면 `unstarred_sync` 만 `NULL` 로 돌리고 `first_sync` 는 그대로 둔다. 처음 본 시점을 덮어쓰지 않기 위해서다. 대신 `starred_at` 은 새 값으로 바뀐다 — GitHub 가 원래 누른 시각을 기억하지 않기 때문이다.

## 두 가지 동기화

```bash
pnpm --filter @stars/core sync --full   # 전체 24페이지. 언스타까지 판정
pnpm --filter @stars/core sync          # 새 별표만. 보통 1페이지
```

차이는 조회량이 아니라 **판정 범위**다. 증분은 목록의 앞부분만 보므로 `last_sync` 가 뒤처진 repo 가 있는 게 정상이다. 여기서 언스타를 판정하면 전부 오탐이 된다. 그래서 `finishSync` 는 목록 전체를 본 동기화에서만 판정한다.

```sql
UPDATE star SET unstarred_sync = ? WHERE unstarred_sync IS NULL AND last_sync < ?
```

DB 가 비어 있으면 `--full` 없이도 전체로 돈다. 증분은 비교할 컷오프가 없기 때문이다.

### direction 이 왜 모드마다 다른가

`sort=created` 는 repo 생성이 아니라 **별표를 누른 시각** 기준이다. 여기까지는 문서대로인데, `direction` 은 페이지네이션 안정성까지 바꾼다.

- **`desc`(기본)** — 새 별표가 맨 앞에 붙는다. 동기화 도중에 별표를 하나 누르면 뒤의 전체가 한 칸씩 밀려서 경계에 걸친 repo 하나를 통째로 건너뛴다.
- **`asc`** — 새 별표가 마지막 페이지 뒤에 붙는다. 앞 페이지가 흔들리지 않는다.

전체 동기화는 정확성이 목적이므로 `asc`, 증분은 앞부분만 훑고 빠지는 게 목적이므로 `desc` 를 쓴다. 증분의 컷오프는 `max(starred_at)` 이고, 그 값 **이상**인 항목까지 적재한 뒤 멈춘다. 같은 초에 별표 둘이 걸린 경우를 놓치지 않기 위해 경계를 다시 넣는데, 재적재는 멱등이라 비용이 없다.

`asc` 도 동기화 도중 별표를 **빼면** 밀린다. 다만 그 경우 놓친 repo 는 다음 전체 동기화에서 다시 잡히고, 그 사이에 오탐으로 언스타 판정되는 일은 없다 — 판정은 목록에 없는 repo 를 대상으로 하기 때문이다.

## 정규화 범위

`core/src/normalize.ts` 가 하는 일은 하나다. **`url` 또는 `*_url` 인 키를 재귀적으로 지운다.** 예외는 `mirror_url` 하나다.

응답 payload 의 3/4 가 `full_name` 과 `owner.id` 에서 기계적으로 복원되는 URL 템플릿이다. repo 당 40여 개가 이렇게 생겼다.

```json
"git_refs_url": "https://api.github.com/repos/shadcn-ui/cn/git/refs{/sha}",
"archive_url":  "https://api.github.com/repos/shadcn-ui/cn/{archive_format}{/ref}",
"notifications_url": "https://api.github.com/repos/shadcn-ui/cn/notifications{?since,all,participating}",
```

실측으로 repo 당 평균 **5,370B → 1,283B (24%)** 다. 복원식은 이렇다.

```
html_url   = https://github.com/{full_name}
clone_url  = https://github.com/{full_name}.git
avatar_url = https://avatars.githubusercontent.com/u/{owner.id}?v=4
*_url(API) = https://api.github.com/repos/{full_name}/...
```

`homepage` 는 키 이름이 `_url` 로 끝나지 않아 규칙에 걸리지 않고, `mirror_url` 은 유일하게 복원 불가라 예외로 남긴다. `core/sql/views.sql` 의 `starred.url` 이 `'https://github.com/' || full_name` 으로 복원한다.

`starred_at` 만 ISO 8601 → unix epoch(초)로 바꿔 컬럼으로 뽑는다. 인덱스와 범위 질의를 위해서다. 나머지 시각(`pushed_at`, `created_at`)은 ISO 문자열 그대로 두고 뷰에서 `date()` 로 판다 — SQLite 가 `Z` 접미사를 그대로 읽는다.

## 멱등성

`repo_id` 가 기준이다. 같은 목록을 다시 넣으면 `last_sync` 만 갱신되고 페이로드는 손대지 않는다. 페이로드가 바뀌었는지는 정규화된 JSON 의 `sha256` 으로 판정한다.

페이지 하나가 트랜잭션 하나다. 24페이지 중 17페이지에서 네트워크가 끊기면 앞 16페이지는 남고 그 동기화는 `ok=0` 으로 끝난다. **`ok=0` 인 동기화는 언스타를 판정하지 않는다** — 반쪽 목록으로 판정하면 못 본 repo 전부가 언스타로 오탐되기 때문이다. 다시 돌리면 된다.

## 변경 이력을 남기지 않는 이유

`sha256` 이 바뀔 때마다 새 버전 row 를 append 하는 안을 검토했다가 뺐다. `stargazers_count` 와 `pushed_at` 이 늘 움직여서 동기화 1회에 거의 전 repo 가 새 row 를 만든다. 2,344개 기준 회당 +3MB 가 쌓이는데, 그 3MB 의 대부분은 남의 저장소 인기 추이지 내 별표 기록이 아니다.

지금은 페이로드를 최신값으로 덮어쓰고, 변한 건수만 `sync.changed` 에 남긴다. 나중에 필요해지면 `star_version(repo_id, sync_id, sha256, data)` 를 추가하고 `ingestPage` 의 UPDATE 자리에서 INSERT 를 하나 더 하면 된다. 기존 데이터는 그대로 쓸 수 있다.

## 저장 비용

별표 2,344개 기준.

```
전체 동기화   24 요청 / 60초 / 레이트 리밋 5,000 중 24 소모
JSON 합계     3.0MB (평균 1,298B)
stars.db      4.51MB (VACUUM 후)
```

증분은 1 요청 / 2.5초다. 시간당 5,000 요청이라 리밋은 사실상 걸리지 않는다. 그래도 소진되면 복구 시각을 계산해서 알려준다.

## 예시 질의

`core/sql/views.sql` 적용 후. 별표를 누른 해별로 언어 비중이 어떻게 움직였는지:

```sql
WITH y AS (SELECT strftime('%Y', starred_at) AS yr, language FROM starred WHERE language IS NOT NULL)
SELECT yr, count(*) AS n,
       round(100.0 * sum(language='TypeScript') / count(*), 1) AS ts_pct,
       round(100.0 * sum(language='JavaScript') / count(*), 1) AS js_pct
FROM y GROUP BY yr HAVING n > 30 ORDER BY yr;
```

```
2016   62   19.4   46.8
2019  250   33.2   44.8
2022  205   50.7   29.8
2026  197   53.8    8.1
```

별표는 눌렀는데 그 뒤로 죽은 저장소:

```sql
SELECT full_name, language, stars, last_push
FROM starred
WHERE archived OR last_push < date('now', '-4 years')
ORDER BY stars DESC;
```

토픽 분포는 `topic` 뷰가 `json_each` 로 배열을 펴 둔다.

```sql
SELECT topic, count(*) n FROM topic GROUP BY 1 ORDER BY n DESC LIMIT 20;
```

## 테스트 픽스처

네트워크 없이 확인하려면 합성 목록을 만든다. `make-fixture.ts` 가 URL 템플릿까지 실제 응답과 같은 모양으로 repo 5개를 찍는다.

```bash
cd core
node make-fixture.ts
node src/cli.ts test.db --from fixture.json
```

`--from` 은 파일이 목록 전체라고 보고 전체 동기화로 취급하므로, 항목을 지운 파일로 다시 돌리면 언스타 판정까지 확인된다.

```bash
jq '.[0:3]' fixture.json > less.json
node src/cli.ts test.db --from less.json    # 언스타 2
node src/cli.ts test.db --from fixture.json # 신규 2 (재스타), first_sync 는 보존
```

## web — RSC 로 stars.db 직접 읽기

`web/` 는 Next 앱이고, 커밋된 `stars.db` 를 RSC 에서 `node:sqlite` 로 직접 질의한다. Turso 같은 원격도, 정적 JSON 주입도 없다 — 파일을 그대로 읽는다. 상태는 URL(`?q &lang &sort`)이 갖고, 클라이언트 컴포넌트는 `router.replace` 로 URL 만 갱신한다.

읽기 열기 로직(`immutable=1` 읽기 전용)은 core 의 `openDb(path, { readonly: true })` 하나이고, web 은 그걸 import 해 경로만 준다. `web/lib/db.ts` 가 모듈 스코프 싱글턴으로 감싸 웜 인보케이션에서 재사용한다.

배포 대상은 Vercel 이다. 함수 번들에 `stars.db` 를 넣기 위해 `next.config.ts` 가 `outputFileTracingIncludes` 로 명시하고(import 되지 않는 바이너리라 트레이싱이 자동으로 잡지 못한다), `transpilePackages: ['@stars/core']` 로 core 의 `.ts` 를 Next 가 컴파일하게 한다.

모노레포라 루트 설정 둘을 저장소 루트로 못박는다. `outputFileTracingRoot` 는 pnpm 의 `.pnpm` 스토어와 워크스페이스 심링크가 전부 루트 아래 있으므로 그 위에서 트레이스해야 완결된다. `turbopack.root` 는 Next 16 에서 필수다 — Turbopack 이 빌드 기본값인데 프로젝트 루트를 명시하지 않으면 `next build` 와 `next start` 가 RSC 클라이언트 매니페스트 경로를 다르게 잡아 런타임이 통째로 빈 페이지가 된다(`Could not find … in the React Client Manifest`).

이 경로는 [cbcruk/omoji](https://github.com/cbcruk/omoji) 가 한 번 좌초해 Turso 로 우회했던 길이다. 차이는 바인딩 하나다: omoji 는 `better-sqlite3`(네이티브)였고, 여기는 `node:sqlite`(무바인딩, Node 24 stable)를 쓴다. 네이티브 컴파일이 없어 환경을 타지 않는다.

## node:sqlite 주의

`bun:sqlite`/`better-sqlite3` 에서 옮겨올 때 걸리는 곳이 셋 있다.

`db.transaction()` 헬퍼가 없다. `BEGIN`/`COMMIT`/`ROLLBACK` 을 직접 건다(`core/src/db.ts` 의 `tx()`). `prepare` 는 제네릭 타입을 받지 않으므로 결과는 캐스팅한다.

```ts
const prev = find.get(repoId) as PrevRow | undefined
```

그리고 `.all()`/`.get()` 은 **null-prototype 객체**를 돌려준다. RSC 에서 이 값을 클라이언트 컴포넌트로 넘기면 직렬화가 막히므로, 넘기기 전에 `.map(r => ({ ...r }))` 로 평범한 객체로 바꾼다. SQL 문자열 리터럴은 홑따옴표로 — `node:sqlite` 는 큰따옴표를 컬럼명으로 해석한다.

## 범위에 대한 미결

- **README 본문 수집.** 별표 목록 API 는 설명과 토픽까지만 준다. README 를 가져오면 전문 검색이 되지만 repo 당 요청 1회(2,344회)에 FTS5 인덱스가 붙고, 그건 적재라기보다 수집이다. 어디까지가 이 저장소의 일인지 정하지 않았다.
- **삭제·비공개 전환된 repo.** 지금은 목록에서 사라지므로 언스타와 구분되지 않는다. `/repositories/{id}` 로 404 인지 확인하면 갈라낼 수 있는데, 언스타 건수가 쌓이기 전에는 판단할 근거가 없다.
- **`gone` 판정의 오탐 창.** 전체 동기화 도중 별표를 빼면 페이지가 밀려 무관한 repo 하나가 누락될 수 있고, 그 repo 는 그 회차에 언스타로 잡힌다. 다음 동기화에서 자동 복구되지만(`unstarred_sync` 가 `NULL` 로 돌아온다) `unstarred` 뷰에 잠깐 뜬다. 동기화 전후로 `starred_at` 최대값을 비교해 목록이 움직였는지 감지하는 안이 있는데, 실제로 부딪히기 전까지는 두고 본다.
