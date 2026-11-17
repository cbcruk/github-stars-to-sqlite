/**
 * LLM-as-a-judge: 정답 태그와 예측 태그가 "같은 개념"인지 모델에게 판정시킨다.
 * 정확 일치(evaluate.ts 의 tagF1Exact)는 gesture/gestures 같은 표기 차이만 맞추고
 * 동의어(i18n/internationalization)는 못 맞춘다 — 그 빈틈을 메운다.
 *
 * 모델은 판정만 하고 점수는 여기서 계산한다(scoreJudgement). 모델에게 숫자를 매기게 하면
 * 같은 판정에도 점수가 흔들리고, 왜 그 점수인지 되짚을 수 없다.
 */
import { startActiveObservation } from '@langfuse/tracing'
import { z } from 'zod'
import { generate } from './generate.ts'
import { JUDGE_PROMPT } from './prompt.ts'
import type { RepoInput } from './repos.ts'

export type TagAnswer = { primary: string | null; tags: string[] }

const JudgementSchema = z.object({
  expected: z.array(z.object({ tag: z.string(), covered_by: z.string().nullable() })),
  primary_same: z.boolean(),
  reasoning: z.string(),
})
export type Judgement = z.infer<typeof JudgementSchema>

export type JudgeScores = {
  /** 정답 태그 중 예측이 덮은 비율 */
  recall: number
  /** 예측 태그 중 어떤 정답을 덮은 비율 */
  precision: number
  f1: number
  /** 예측에 대표 태그가 없으면 null — 점수를 남기지 않는다(0 으로 치면 기준선이 억울하다) */
  primaryMatch: number | null
}

/**
 * 판정을 점수로. 모델이 정답에 없는 태그를 지어내거나 predicted 에 없는 covered_by 를 적으면
 * 덮지 않은 것으로 본다(관대하게 고치면 판정자의 실수가 점수에 숨는다).
 */
export function scoreJudgement(j: Judgement, expected: TagAnswer, predicted: TagAnswer): JudgeScores {
  const predictedSet = new Set(predicted.tags)
  const coverOf = new Map(j.expected.map((e) => [e.tag, e.covered_by]))
  const covering = new Set<string>()
  let covered = 0
  for (const t of expected.tags) {
    const by = coverOf.get(t)
    if (by && predictedSet.has(by)) {
      covered++
      covering.add(by)
    }
  }
  const recall = expected.tags.length ? covered / expected.tags.length : 0
  const precision = predicted.tags.length ? covering.size / predicted.tags.length : 0
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0
  return { recall, precision, f1, primaryMatch: predicted.primary === null ? null : j.primary_same ? 1 : 0 }
}

const JUDGE_MODEL = process.env.JUDGE_MODEL

/** 판정 한 번 = 트레이스 하나 (judge-tags > judge). 예측이 비었으면 부르지 않는다. */
export function judge(repo: RepoInput, expected: TagAnswer, predicted: TagAnswer): Promise<JudgeScores & { reasoning: string }> {
  if (!predicted.tags.length) {
    return Promise.resolve({ recall: 0, precision: 0, f1: 0, primaryMatch: predicted.primary === null ? null : 0, reasoning: '예측 태그 없음' })
  }
  return startActiveObservation('judge-tags', async (span) => {
    span.update({ input: { repo: repo.fullName, expected, predicted } })
    const { content } = await generate(
      'judge',
      JUDGE_PROMPT,
      { repo: JSON.stringify(repo), expected: JSON.stringify(expected), predicted: JSON.stringify(predicted) },
      {
        schema: JudgementSchema,
        fake: { expected: expected.tags.map((tag) => ({ tag, covered_by: null })), primary_same: false, reasoning: 'fake' },
        ...(JUDGE_MODEL ? { model: JUDGE_MODEL } : {}),
      },
    )
    const j = JudgementSchema.parse(JSON.parse(content))
    const scores = { ...scoreJudgement(j, expected, predicted), reasoning: j.reasoning }
    span.update({ output: { judgement: j, scores } })
    return scores
  })
}
