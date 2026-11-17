import { startActiveObservation } from '@langfuse/tracing'
import { CATEGORIES } from '@stars/core'
import { z } from 'zod'
import { generate } from './generate.ts'
import { CLASSIFY_PROMPT, categoryList } from './prompt.ts'
import type { RepoInput } from './repos.ts'

/** 분류 결과. primary 는 CATEGORIES 의 id 이거나 'none'. */
export type Classification = { primary: string; categories: string[]; assumptions: string[] }

const IDS = new Set(CATEGORIES.map((c) => c.id))

/**
 * 모델 출력을 검사한다. 모르는 id 는 버리고 그 사실을 assumptions 에 남긴다 —
 * 조용히 고치면 프롬프트가 틀린 걸 실험이 못 본다.
 */
export function parseClassification(content: string): Classification {
  const raw = JSON.parse(content) as Partial<Record<keyof Classification, unknown>>
  const notes: string[] = []
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

  const categories = strings(raw.categories).filter((id) => {
    if (IDS.has(id)) return true
    notes.push(`모르는 도메인 버림: ${id}`)
    return false
  })
  let primary = typeof raw.primary === 'string' ? raw.primary : 'none'
  if (primary !== 'none' && !IDS.has(primary)) {
    notes.push(`모르는 대표 도메인 버림: ${primary}`)
    primary = 'none'
  }
  if (primary !== 'none' && !categories.includes(primary)) categories.unshift(primary)

  return { primary, categories, assumptions: [...strings(raw.assumptions), ...notes] }
}

const ids = CATEGORIES.map((c) => c.id) as [string, ...string[]]

/** 구조화 출력 스키마. 도메인 id 를 enum 으로 묶어 Claude 가 모르는 id 를 낼 수 없게 한다. */
const ClassificationSchema = z.object({
  primary: z.enum([...ids, 'none']),
  categories: z.array(z.enum(ids)),
  assumptions: z.array(z.string()),
})

/** 저장소 하나 = 트레이스 하나. 루트 span 아래 LLM 호출이 generation 으로 붙는다. */
export function classify(repo: RepoInput, metadata: Record<string, unknown> = {}): Promise<Classification> {
  return startActiveObservation('classify-repo', async (span) => {
    span.update({ input: repo, metadata })
    const content = await generate(
      'llm',
      CLASSIFY_PROMPT,
      { categories: categoryList(), repo: JSON.stringify(repo) },
      { schema: ClassificationSchema, fake: { primary: 'none', categories: [], assumptions: ['fake 응답'] } },
    )
    const result = parseClassification(content)
    span.update({ output: result })
    return result
  })
}
