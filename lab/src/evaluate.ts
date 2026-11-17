/**
 * 채점. 실험(experiment.ts)이 쓰고, Langfuse 없이도 테스트할 수 있게 순수 함수로 둔다.
 */
export type Answer = { primary: string; categories: string[] }

/** 대표 도메인이 같은가. */
export function primaryMatch(output: Answer, expected: Answer): number {
  return output.primary === expected.primary ? 1 : 0
}

/** 다중 분류 F1. 둘 다 비었으면(= 둘 다 none) 1. */
export function categoryF1(output: Answer, expected: Answer): number {
  const got = new Set(output.categories)
  const want = new Set(expected.categories)
  if (got.size === 0 && want.size === 0) return 1
  const hit = [...got].filter((c) => want.has(c)).length
  if (hit === 0) return 0
  const precision = hit / got.size
  const recall = hit / want.size
  return (2 * precision * recall) / (precision + recall)
}

/** 정답은 도메인이 있는데 none 이라 답했나 — 놓친 것. 키워드의 "보이지 않는 누락"을 잰다. */
export function missed(output: Answer, expected: Answer): number {
  return expected.primary !== 'none' && output.primary === 'none' ? 1 : 0
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

// --- 자유 태그 (stars-tags) --------------------------------------------------

/** 표기만 맞춘다: 소문자, 공백·밑줄 → 하이픈, 끝의 복수 s 제거. 뜻은 judge.ts 몫이다. */
export function normalizeTag(tag: string): string {
  const t = tag.trim().toLowerCase().replace(/[\s_]+/g, '-')
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t
}

/** 표기를 맞춘 뒤 정확히 겹치는 태그로 F1. 예측이 비었으면 0. */
export function tagF1Exact(predicted: string[], expected: string[]): number {
  const got = new Set(predicted.map(normalizeTag))
  const want = new Set(expected.map(normalizeTag))
  const hit = [...got].filter((t) => want.has(t)).length
  if (hit === 0) return 0
  const precision = hit / got.size
  const recall = hit / want.size
  return (2 * precision * recall) / (precision + recall)
}
