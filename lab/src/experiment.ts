#!/usr/bin/env node
/**
 * 데이터셋(stars-labels)에 분류기 하나를 돌려 채점한다. 같은 데이터셋에 여러 번 돌려
 * Langfuse 의 실험 비교 화면에서 나란히 본다.
 *
 *   node src/experiment.ts ../stars.db --task keyword            # 기준선
 *   node src/experiment.ts ../stars.db --task llm --name llm-v1  # 현재 production 프롬프트
 */
import { shutdown } from './instrumentation.ts'
import { openDb } from '@stars/core'
import { classify } from './classify.ts'
import { categoryF1, mean, missed, primaryMatch, type Answer } from './evaluate.ts'
import { DATASET_NAME, requireLangfuse } from './langfuse.ts'
import { llmConfig } from './llm.ts'
import { allRepos, type RepoInput } from './repos.ts'

const argv = process.argv.slice(2)
const dbPath = argv[0]
const opt = (name: string) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const task = opt('--task')
if (!dbPath || dbPath.startsWith('--') || (task !== 'keyword' && task !== 'llm')) {
  console.error('usage: node src/experiment.ts <stars.db> --task keyword|llm [--name 실행이름]')
  process.exit(1)
}
const name = opt('--name') ?? (task === 'keyword' ? 'keyword' : `llm ${llmConfig.model}`)

const db = openDb(dbPath, { readonly: true })
const keywordOf = new Map(allRepos(db).map((r) => [r.fullName, r.keyword]))
db.close()

const langfuse = requireLangfuse()
const dataset = await langfuse.dataset.get(DATASET_NAME)

try {
  const result = await dataset.runExperiment({
    name,
    description: task === 'keyword' ? 'categories.ts 키워드 휴리스틱' : `${llmConfig.label} ${llmConfig.model}`,
    metadata: { task, model: task === 'llm' ? llmConfig.model : null },
    maxConcurrency: task === 'llm' ? 4 : 20,
    task: async ({ input }) => {
      const repo = input as RepoInput
      if (task === 'keyword') {
        const k = keywordOf.get(repo.fullName)
        if (!k) throw new Error(`stars.db 에 없는 저장소: ${repo.fullName}`)
        return k
      }
      return classify(repo, { experiment: name })
    },
    evaluators: [
      async ({ output, expectedOutput }) => {
        const [o, e] = [output as Answer, expectedOutput as Answer]
        return [
          { name: 'primary_match', value: primaryMatch(o, e) },
          { name: 'category_f1', value: categoryF1(o, e) },
          { name: 'missed', value: missed(o, e) },
        ]
      },
    ],
    runEvaluators: [
      async ({ itemResults }) => {
        const pick = (key: string) =>
          itemResults.map((r) => Number(r.evaluations.find((e) => e.name === key)?.value ?? 0))
        return [
          { name: 'primary_accuracy', value: mean(pick('primary_match')) },
          { name: 'category_f1_mean', value: mean(pick('category_f1')) },
          { name: 'miss_rate', value: mean(pick('missed')) },
        ]
      },
    ],
  })
  console.log(await result.format())
} finally {
  await shutdown()
}
