# lab

키워드 분류(`core/src/categories.ts`)와 LLM 분류를 **사람이 붙인 정답**으로 채점하는 분석용 실험. 화면(web)과 `stars.db` 는 건드리지 않는다. 왜 하는지는 [SPEC B10](../SPEC.md#b10-llm-분류를-실험한다-분석용).

```
src/
├─ instrumentation.ts  OpenTelemetry + LangfuseSpanProcessor. 키 없으면 꺼짐
├─ llm.ts              모델 호출: Claude(공식 SDK, 구조화 출력) / OpenAI 호환 fetch / fake
├─ prompt.ts           프롬프트 3개: stars-classify / stars-tag / stars-tag-judge (Langfuse 원본, 로컬 v1 은 fallback)
├─ generate.ts         프롬프트 채우기 + 모델 호출 + generation 기록
├─ classify.ts         도메인 분류. 저장소 1개 = 트레이스 1개 (span → generation)
├─ tag.ts              자유 태그 붙이기 + 토픽 기준선
├─ judge.ts            LLM-as-a-judge: 정답 태그와 예측 태그가 같은 개념인지 판정 → 점수
├─ repos.ts            stars.db 읽기 + 키워드 결과(repo_category)
├─ labels.ts           labels.json 형식과 검사
├─ evaluate.ts         채점 함수 (primary_match, category_f1, missed)
├─ run.ts              몇 개 분류해 키워드와 나란히 찍기
├─ sample.ts           층별 표본 → labels.json
├─ push-prompt.ts      로컬 프롬프트 → Langfuse 새 버전 (production)
├─ sync-dataset.ts     labels.json → 데이터셋 stars-labels (--kind tags 면 stars-tags)
├─ experiment.ts       stars-labels 에 keyword / llm 실행 + 채점
└─ tag-experiment.ts   stars-tags 에 topics / llm 실행 + 채점
labels.json            정답 원본 (커밋)
```

## 준비

```bash
cp .env.example .env   # 키 채우기. .env 는 커밋되지 않는다
```

- **Langfuse** — [Cloud](https://cloud.langfuse.com) 무료 플랜이면 된다(별표 데이터는 공개 정보). 직접 띄우려면 langfuse 저장소를 클론해 `docker compose up` 후 `http://localhost:3000`. JS SDK v6 은 서버 v4.59 이상이 필요하다
- **모델** — `ANTHROPIC_API_KEY` 가 있으면 Claude(기본 `claude-opus-5-5`, `LLM_MODEL` 로 바꾼다). Console 의 API 키라 Claude 구독과 별개로 과금된다. 출력은 도메인 id 를 enum 으로 묶은 구조화 출력이라 모르는 id 가 나오지 않는다. OpenAI 호환(Ollama 등)은 `LLM_BASE_URL`
- Anthropic SDK 의 자체 OpenTelemetry span 은 끈다(`openTelemetry: false`). 켜 두면 Langfuse 가 같은 호출을 generation 두 개로 집계해 토큰·비용이 두 번 잡힌다

## 순서

```bash
# 0. 키 없이 파이프라인 확인 (fake LLM, 트레이스 꺼짐)
node src/run.ts ../stars.db --limit 3

# 1. 트레이스 보기 — Langfuse UI 의 Tracing 에 저장소마다 classify-repo 가 뜬다
node --env-file=.env src/run.ts ../stars.db --limit 10

# 2. 프롬프트를 Langfuse 로. 이후 버전은 UI 에서 고쳐도 되고, generation 에 버전이 연결된다
node --env-file=.env src/push-prompt.ts --message "v1"

# 3. 정답 붙이기 — 층마다 20개(키워드 1개 / 여러 개 / 0개)
node src/sample.ts ../stars.db
#    labels.json 에서 primary(도메인 id 또는 none)와 categories 를 채운다
node --env-file=.env src/sync-dataset.ts ../stars.db

# 4. 실험 — Langfuse 의 Datasets > stars-labels 에서 실행끼리 비교
node --env-file=.env src/experiment.ts ../stars.db --task keyword
node --env-file=.env src/experiment.ts ../stars.db --task llm --name llm-v1
```

## 정답 붙이기

도메인 id 는 `ai editor viz test cli build native server docs ui`, 어디에도 안 맞으면 `none`.

```json
{ "repo": "lucaong/minisearch", "primary": "server", "categories": ["server"], "note": "검색 엔진. 애매함" }
```

- `primary` 는 `categories` 안에 있어야 한다. `none` 이면 `categories` 는 비운다
- 애매하면 `note` 에 적는다 — 애매한 건이 많은 도메인이 곧 정의가 흐린 도메인이다
- `context` 는 붙일 때 보라고 넣은 값이다. 키워드 결과는 일부러 안 넣었다(보면 끌려간다)

## 채점

| 점수 | 항목별 | 실행 전체 |
| --- | --- | --- |
| 대표 도메인 일치 | `primary_match` 0/1 | `primary_accuracy` |
| 다중 분류 | `category_f1` | `category_f1_mean` |
| 놓침 (정답엔 있는데 `none`) | `missed` 0/1 | `miss_rate` |

```bash
pnpm test        # 채점·출력 파싱 테스트 (Langfuse 불필요)
pnpm typecheck
```

## 태그 실험 (stars-tags)

`labels.json` 을 도메인 id 대신 **자유 태그**로 붙였을 때의 실험이다. 정답 태그는 `primary` 와 `categories` 의 합집합.
정해진 칸이 없어 정확 일치로는 동의어(i18n / internationalization)를 못 맞히므로, 점수를 둘로 낸다.

```bash
node --env-file=.env src/push-prompt.ts --prompt tag --message "v1"
node --env-file=.env src/push-prompt.ts --prompt judge --message "v1"
node --env-file=.env src/sync-dataset.ts ../stars.db --kind tags
node --env-file=.env src/tag-experiment.ts --task topics                # 기준선: GitHub 토픽 그대로
node --env-file=.env src/tag-experiment.ts --task llm --name tag-v1
```

| 점수 | 뜻 |
| --- | --- |
| `tag_f1_exact` | 표기(대소문자·하이픈·복수 s)만 맞춘 정확 일치 F1 |
| `judge_recall` | 정답 태그 중 판정자가 "같은 개념"이 예측에 있다고 본 비율 |
| `judge_precision` | 예측 태그 중 정답 하나를 덮은 비율 |
| `judge_primary_match` | 대표 태그가 같은 개념인가. 토픽 기준선은 대표가 없어 안 매긴다 |

- 판정자는 덮였는지만 답하고 점수는 코드가 계산한다(`scoreJudgement`). 판정자가 예측에 없는 태그를 대면 덮지 않은 것으로 친다
- 판정자 프롬프트를 바꾸면 이전 실행과 점수를 비교할 수 없다. 바꿨으면 기준선부터 다시 돌린다
- 판정 모델은 `JUDGE_MODEL` (기본은 `LLM_MODEL` 과 같다)

### 첫 결과 (2026-11-17, 60건, claude-opus-5-5)

| 실행 | exact F1 | judge recall | judge precision | judge F1 | 대표 일치 |
| --- | --- | --- | --- | --- | --- |
| topics | 0.264 | 0.600 | 0.207 | 0.282 | — |
| tag-v1 | 0.210 | 0.739 | 0.244 | 0.355 | 0.300 |
| tag-v2 | 0.525 | 0.724 | 0.511 | 0.575 | 0.400 |
| tag-v3 | 0.562 | 0.792 | 0.533 | 0.614 | 0.383 |

- 정답은 평균 1.9개, 짧고 넓은 낱말(`svg`, `chart`, `cors`). tag-v1 은 평균 5.5개, 좁은 합성어(`html-to-svg`, `cors-proxy`)에 언어 이름(`javascript`)까지 붙인다 → precision 과 대표 일치가 낮다
- tag-v2 (1~3개, 넓은 낱말, 언어 이름 제외): 평균 2.6개. recall 은 그대로 두고 precision 이 두 배가 됐다
- tag-v2 의 대표 불일치 36건 중 약 11건은 정답이 **프로젝트 자기 이름**이다(`msw`, `remix`, `grunt`, `quokka`, `electron` …). 모델은 넓은 범주(`mock`, `framework`, `task-runner`)를 고른다 — 고유 이름이 곧 찾는 낱말인 경우가 있다
- tag-v3 ("알려진 도구는 자기 이름을 대표로"): 이름을 태그에 더해 recall·precision 은 올랐지만 대표 일치는 그대로다.
  고친 만큼(`remix`, `grunt`, `electron`) 새로 틀렸다 — `uplot`, `lunr`, `aos`, `cline` 처럼 작은 라이브러리도 이름을 대표로 삼았다.
  정답 쪽도 일관되지 않다(`cline/cline` 은 `agent`, `mswjs/msw` 는 `msw`). "어느 이름이 충분히 알려졌나"는 붙인 사람 머릿속에만 있어 프롬프트로 옮기기 어렵다 — 대표 일치에는 천장이 있다
- **production 은 v3 로 둔다** (2026-11-17). 대표 하나보다 태그 목록 전체가 맞는 쪽을 택했다
- 프롬프트를 이 60건을 보고 고치므로 점수는 낙관적이다. 일반화를 보려면 고칠 때 안 본 표본이 따로 필요하다
- 판정자가 일관되지 않다: `search → search-engine` 은 덮었다고 보면서 `file → file-upload` 는 아니라고 봤다. 덮음은 관대하고 대표 판정은 엄격하다

### 판정자 v2 로 다시 채점 (같은 날)

판정자 v1 은 `search → search-engine` 은 덮었다고, `file → file-upload` 는 아니라고 봤다. v2 는 관계를
**같은 개념 / 정답의 한 종류(is-a) / 그 밖**으로 나누고 앞의 둘을 덮었다고 보며, 대표 판정에도 같은 규칙을 쓴다.
태그를 새로 받지 않고 예전 실행의 출력을 다시 채점했다(`--task replay`) — 판정자 효과만 보려고.

| 실행 | exact F1 | judge recall | judge precision | judge F1 | 대표 일치 |
| --- | --- | --- | --- | --- | --- |
| topics | 0.264 | 0.622 | 0.211 | 0.288 | — |
| tag-v1 | 0.210 | 0.828 | 0.274 | 0.397 | 0.467 |
| tag-v2 | 0.525 | 0.738 | 0.519 | 0.586 | 0.417 |
| tag-v3 | 0.562 | 0.806 | 0.542 | 0.625 | 0.467 |

- 판정이 규칙대로 일관된다: `search ← full-text-search`, `plugin ← webpack-plugin`, `agent ← coding-agent` 는 덮고 `file ← file-upload`, `webpack ← webpack-plugin` 은 안 덮는다
- **대표 일치의 순위가 판정자에 따라 뒤집혔다.** 판정자 v1 로는 v2(0.400) > v3(0.383) 이라 "v3 가 과하게 고쳤다"고 읽었는데,
  v2 로는 v3 = v1(0.467) > v2(0.417) 다. v1 은 좁은 대표(`coding-agent`)를 골라 판정자 v1 에서 손해를 봤던 것이다
- 태그 목록 점수(judge F1)는 판정자를 바꿔도 순위가 같다(v3 > v2 > v1 > topics). 이 결론은 판정자에 덜 민감하다
- 교훈: 점수 차가 작을 때(0.38 대 0.40)는 판정자 한 번 바꾸면 뒤집힌다. 판정자도 실험 대상이다

### 검증: 처음 보는 저장소 (어노테이션 큐)

위 점수는 프롬프트를 고칠 때 본 60건으로 잰 것이라 낙관적이다. 정답을 새로 적는 대신 사람이
Langfuse **어노테이션 큐**에서 production 출력을 좋음 / 애매 / 나쁨으로 매긴다(점수 `tag_quality`).

```bash
node --env-file=.env src/holdout.ts create ../stars.db   # 36건 태그 → 큐 stars-tag-holdout, holdout.json
# Langfuse > Annotation Queues > stars-tag-holdout 에서 매긴다
node --env-file=.env src/holdout.ts report               # seen / new 비교
```

- 큐에는 **new**(labels.json 에 없는 24건)와 **seen**(labels.json 에 있는 12건)을 섞어 넣는다. 화면에서는 구별되지 않는다
- seen 과 new 의 "좋음" 비율 차이가 곧 위 점수의 낙관 정도다. 어느 쪽인지는 `holdout.json` 에만 있다 — 매기기 전에 열어 보지 않는다

결과 (2026-11-17, stars-tag v3, 36건 모두 매김):

| 무리 | n | 좋음 | 애매 | 나쁨 |
| --- | --- | --- | --- | --- |
| seen | 12 | 12 | 0 | 0 |
| new | 24 | 22 | 2 | 0 |

- 처음 보는 저장소에서도 92% 가 "좋음"이다. seen(100%)과의 차이는 1건이 4%p 인 표본 크기에서 잡음 범위다 — **60건에 맞춘 흔적은 보이지 않는다**
- 애매 2건: `HelloCSV` (설명이 URL 뿐, 토픽 없음 → `csv, import`), `neverthrow` (이름이 대표 → `neverthrow, error-handling, result`). 둘 다 틀렸다기보다 근거가 얇다
- judge F1(0.625)과 사람 평가(92~100%)가 크게 다르다. F1 은 "내가 붙였을 태그를 재현했나"라 엄격하고, 사람 평가는 "쓸 만한가"라 너그럽다.
  보이는 출력을 매기면 받아들이기 쉬운 쪽으로 기운다는 점도 있다. 그래서 역할을 나눈다: **프롬프트 버전 비교는 F1**(민감하다), **충분히 좋은가의 판단은 사람 평가**(v2·v3 처럼 둘 다 좋으면 구별 못 한다)

