/**
 * 프롬프트. 원본은 Langfuse 프롬프트 관리(label=production)다.
 * 여기 `local` 은 처음 올릴 v1 이자, Langfuse 에 닿지 못할 때의 fallback 이다.
 * 올리는 건 `push-prompt.ts --prompt <key>`.
 */
import { LangfuseClient } from '@langfuse/client'
import { CATEGORIES } from '@stars/core'
import { tracingEnabled } from './instrumentation.ts'
import type { ChatMessage } from './llm.ts'

export type PromptDef = { name: string; local: ChatMessage[] }

/** 도메인 분류 (stars-labels 실험). 변수: categories, repo */
export const CLASSIFY_PROMPT: PromptDef = {
  name: 'stars-classify',
  local: [
    {
      role: 'system',
      content: `GitHub 저장소를 아래 도메인으로 분류한다.

{{categories}}
none: 위 어느 것에도 맞지 않음 (언어·런타임, 범용 유틸리티, 데브옵스 등)

규칙:
- 주어진 이름·설명·토픽·언어만 근거로 쓴다. 저장소를 안다고 추측해 보태지 않는다
- categories 는 해당하는 도메인 전부, primary 는 그중 가장 대표적인 하나
- 근거가 약해 추측한 부분은 assumptions 에 적는다. 확신이 없으면 primary 를 none 으로 둔다
- JSON 객체 하나만 답한다: {"primary": string, "categories": string[], "assumptions": string[]}`,
    },
    { role: 'user', content: '{{repo}}' },
  ],
}

/**
 * 자유 태그 (stars-tags 실험). 변수: repo
 * v1 → v2: v1 은 평균 5.5개, 좁은 합성어(html-to-svg)에 언어 이름까지 붙여 정답(평균 1.9개,
 * 넓은 낱말)과 단위가 달랐다. 개수를 줄이고 넓은 낱말을 먼저 고르게 한다.
 * v2 → v3: 대표 불일치 36건 중 약 11건은 정답이 프로젝트 자기 이름이었다(msw, remix, grunt).
 * 널리 알려진 도구는 그 이름이 곧 찾는 낱말이다.
 */
export const TAG_PROMPT: PromptDef = {
  name: 'stars-tag',
  local: [
    {
      role: 'system',
      content: `GitHub 저장소에 태그를 붙인다. 이 저장소에 별표한 사람이 나중에 다시 찾을 때 떠올릴 낱말이다.

규칙:
- 1~3개. 대부분은 1~2개로 충분하다
- 짧고 넓은 낱말을 고른다. 한 낱말이 가장 좋다: html-to-svg 보다 svg, cors-proxy 보다 cors, time-series-chart 보다 chart
- 저장소가 다루는 대상(무엇에 관한 것인가)을 태그로 한다. 구현 언어·런타임(javascript, typescript, nodejs, python)은 그 자체가 대상일 때만 붙인다
- 영어 소문자, 여러 낱말이 꼭 필요하면 하이픈으로 잇는다
- 주어진 이름·설명·토픽·언어만 근거로 쓴다
- 널리 알려진 도구·프레임워크·라이브러리 자체이면(예: remix, grunt, electron, msw) 그 이름을 태그에 넣고 primary 로 삼는다. 이름을 소문자로 쓴다
- 그 밖에는 primary 가 tags 중 가장 대표적인 하나 — 가장 넓은 낱말
- 근거가 약해 추측한 부분은 assumptions 에 적는다
- JSON 객체 하나만 답한다: {"primary": string, "tags": string[], "assumptions": string[]}`,
    },
    { role: 'user', content: '{{repo}}' },
  ],
}

/**
 * 태그 채점 (LLM-as-a-judge). 변수: repo, expected, predicted
 * v1 → v2: v1 은 "상위·하위 개념은 다르다"고 해 놓고 search → search-engine 은 덮었다고,
 * file → file-upload 는 아니라고 봤다. 대표 판정은 덮음보다 엄격했다.
 * 관계를 "같은 개념 / 정답의 한 종류 / 그 밖"으로 나누고, 앞의 둘을 덮었다고 본다.
 * 같은 규칙을 대표 판정에도 쓴다. 정답 태그는 넓은 낱말이 많아(평균 1.9개) 좁은 예측이
 * 그 한 종류이면 찾는 사람에게는 맞은 것이다.
 */
export const JUDGE_PROMPT: PromptDef = {
  name: 'stars-tag-judge',
  local: [
    {
      role: 'system',
      content: `한 GitHub 저장소에 대해 사람이 붙인 정답 태그(expected)와 예측 태그(predicted)를 비교한다.

정답 태그 E 와 예측 태그 P 의 관계는 셋 중 하나다:
1. 같은 개념 — 표기 차이(단수·복수, 하이픈, 대소문자, 흔한 약어)와 동의어
   gesture = gestures, i18n = internationalization, chart = charting
2. P 가 E 의 한 종류 — P 를 들으면 "그것도 E 다"라고 할 수 있다
   E=search, P=fuzzy-search / E=plugin, P=webpack-plugin / E=agent, P=coding-agent
3. 그 밖 — 관련만 있거나, P 가 E 보다 넓거나, E 를 위한 도구일 뿐이다
   E=fuzzy-search, P=search (더 넓다) / E=file, P=file-upload (업로드는 파일의 한 종류가 아니다) / E=webpack, P=webpack-plugin (웹팩의 한 종류가 아니다) / E=test, P=vue

1 과 2 는 덮였다고 본다. 3 은 덮이지 않았다.

정답 태그마다 하나씩 판정한다: 덮는 P 가 있으면 covered_by 에 predicted 에 적힌 그대로 적고, 없으면 null.
여럿이 덮으면 관계 1 을 먼저 고른다.

primary_same: predicted.primary 가 expected.primary 를 위 기준으로 덮으면 true. predicted.primary 가 null 이면 false.
reasoning: 관계 2 나 3 사이에서 망설인 곳만 한두 문장으로.
저장소 정보(repo)는 태그의 뜻이 애매할 때만 참고한다.`,
    },
    { role: 'user', content: 'repo: {{repo}}\nexpected: {{expected}}\npredicted: {{predicted}}' },
  ],
}

export const PROMPTS = { classify: CLASSIFY_PROMPT, tag: TAG_PROMPT, judge: JUDGE_PROMPT } as const

export type PromptRef = { name: string; version: number; isFallback: boolean }

export function categoryList(): string {
  return CATEGORIES.map((c) => `${c.id}: ${c.label}`).join('\n')
}

const langfuse = tracingEnabled ? new LangfuseClient() : null

function compileLocal(def: PromptDef, vars: Record<string, string>): ChatMessage[] {
  return def.local.map((m) => ({
    ...m,
    content: m.content.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? ''),
  }))
}

/** 프롬프트를 채운 메시지와, generation 에 연결할 프롬프트 참조. */
export async function buildMessages(
  def: PromptDef,
  vars: Record<string, string>,
): Promise<{ messages: ChatMessage[]; ref: PromptRef | null }> {
  if (!langfuse) return { messages: compileLocal(def, vars), ref: null }

  const prompt = await langfuse.prompt.get(def.name, { type: 'chat', fallback: def.local })
  return {
    messages: prompt.compile(vars) as ChatMessage[],
    ref: { name: prompt.name, version: prompt.version, isFallback: prompt.isFallback },
  }
}
