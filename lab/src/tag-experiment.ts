#!/usr/bin/env node
/**
 * 데이터셋(stars-tags)에 태거 하나를 돌려 채점한다. 정답은 사람이 붙인 자유 태그라
 * 정해진 칸이 없다 — 그래서 점수가 둘이다.
 *   tag_f1_exact  표기만 맞춘 정확 일치 (싸고 결정적, 동의어를 못 본다)
 *   judge_*       LLM 판정자가 "같은 개념"으로 본 것 (동의어를 보지만 판정자도 틀린다)
 * 두 점수의 차이가 곧 "표기만 다른 정답"의 크기다.
 *
 *   node src/tag-experiment.ts --task topics                 # 기준선: GitHub 토픽 그대로
 *   node src/tag-experiment.ts --task llm --name tag-v1      # 현재 production stars-tag 프롬프트
 *   node src/tag-experiment.ts --task replay --from tag-v1 --name "tag-v1 @judge-v2"
 *     # 예전 실행의 태그 출력을 Langfuse 트레이스에서 다시 꺼내 채점만 다시 한다.
 *     # 판정자를 바꿨을 때 쓴다 — 태그를 새로 받으면 판정자 효과와 태거의 흔들림이 섞인다.
 *
 * 판정 모델은 JUDGE_MODEL (기본은 LLM_MODEL 과 같다). 저장소 정보는 데이터셋 항목에 있어 DB 가 필요 없다.
 */
import { shutdown } from './instrumentation.ts'
import { mean, tagF1Exact } from './evaluate.ts'
import { judge, type TagAnswer } from './judge.ts'
import { TAG_DATASET_NAME, requireLangfuse } from './langfuse.ts'
import { llmConfig } from './llm.ts'
import type { RepoInput } from './repos.ts'
import { tag, topicsAsTags, type Tagging } from './tag.ts'

const argv = process.argv.slice(2)
const opt = (name: string) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const task = opt('--task')
const from = opt('--from')
if ((task !== 'topics' && task !== 'llm' && task !== 'replay') || (task === 'replay' && !from)) {
  console.error('usage: node src/tag-experiment.ts --task topics|llm|replay [--from 예전실행] [--name 실행이름]')
  process.exit(1)
}
const name = opt('--name') ?? (task === 'topics' ? 'topics' : task === 'replay' ? `${from} (replay)` : `tag ${llmConfig.model}`)
const judgeModel = process.env.JUDGE_MODEL ?? llmConfig.model

const langfuse = requireLangfuse()
const dataset = await langfuse.dataset.get(TAG_DATASET_NAME)

/** 예전 실행의 tag-repo span 출력. tag() 가 metadata.experiment 에 실행 이름을 남긴다. */
async function loadReplay(experiment: string): Promise<Map<string, Tagging>> {
  const byRepo = new Map<string, Tagging>()
  let cursor: string | undefined
  do {
    const page = await langfuse.api.observations.getMany({ name: 'tag-repo', fields: 'basic,io,metadata', limit: 1000, ...(cursor ? { cursor } : {}) })
    for (const o of page.data as unknown as Array<Record<string, unknown>>) {
      const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)
      if (json(o.metadata)?.experiment !== experiment || !o.output) continue
      byRepo.set((json(o.input) as RepoInput).fullName, json(o.output) as Tagging)
    }
    cursor = (page.meta as { cursor?: string } | undefined)?.cursor
  } while (cursor)
  if (!byRepo.size) throw new Error(`실행 ${experiment} 의 tag-repo 출력을 찾지 못했다`)
  return byRepo
}
const replay = task === 'replay' ? await loadReplay(from!) : null

try {
  const result = await dataset.runExperiment({
    name,
    description:
      task === 'topics' ? 'GitHub 토픽을 그대로 태그로' : task === 'replay' ? `${from} 의 출력을 다시 채점` : `${llmConfig.label} ${llmConfig.model}`,
    metadata: { task, from: from ?? null, model: task === 'llm' ? llmConfig.model : null, judgeModel },
    maxConcurrency: 4,
    task: async ({ input }) => {
      const repo = input as RepoInput
      if (replay) {
        const t = replay.get(repo.fullName)
        if (!t) throw new Error(`${from} 에 ${repo.fullName} 출력이 없다`)
        return t
      }
      return task === 'topics' ? topicsAsTags(repo) : tag(repo, { experiment: name })
    },
    evaluators: [
      async ({ input, output, expectedOutput }) => {
        const o = output as Tagging
        const e = expectedOutput as TagAnswer
        const j = await judge(input as RepoInput, e, { primary: o.primary, tags: o.tags })
        return [
          { name: 'tag_f1_exact', value: tagF1Exact(o.tags, e.tags) },
          { name: 'judge_recall', value: j.recall, comment: j.reasoning },
          { name: 'judge_precision', value: j.precision },
          { name: 'judge_f1', value: j.f1 },
          ...(j.primaryMatch === null ? [] : [{ name: 'judge_primary_match', value: j.primaryMatch }]),
        ]
      },
    ],
    runEvaluators: [
      async ({ itemResults }) => {
        const pick = (key: string) =>
          itemResults.flatMap((r) => {
            const v = r.evaluations.find((e) => e.name === key)?.value
            return v === undefined ? [] : [Number(v)]
          })
        const primary = pick('judge_primary_match')
        return [
          { name: 'tag_f1_exact_mean', value: mean(pick('tag_f1_exact')) },
          { name: 'judge_recall_mean', value: mean(pick('judge_recall')) },
          { name: 'judge_precision_mean', value: mean(pick('judge_precision')) },
          { name: 'judge_f1_mean', value: mean(pick('judge_f1')) },
          ...(primary.length ? [{ name: 'judge_primary_accuracy', value: mean(primary) }] : []),
        ]
      },
    ],
  })
  console.log(await result.format())
} finally {
  await shutdown()
}
