#!/usr/bin/env node
/**
 * labels.json 의 다 붙인 정답을 Langfuse 데이터셋으로 올린다.
 *   --kind domain (기본) → stars-labels, expectedOutput { primary, categories }
 *   --kind tags          → stars-tags,   expectedOutput { primary, tags }
 * 항목 id 는 `repo-<repo_id>` 라 다시 돌리면 덮어쓴다(정답을 고쳐도 같은 항목).
 * input 은 지금 stars.db 의 값으로 다시 읽는다 — labels.json 의 context 는 참고용이다.
 *
 *   node src/sync-dataset.ts ../stars.db [--kind domain|tags] [--labels labels.json]
 */
import { shutdown } from './instrumentation.ts'
import { openDb } from '@stars/core'
import { completedLabels, completedTagLabels, readLabels, tagsOf } from './labels.ts'
import { DATASET_NAME, TAG_DATASET_NAME, requireLangfuse } from './langfuse.ts'
import { inputOf, reposByName } from './repos.ts'

const argv = process.argv.slice(2)
const dbPath = argv[0]
if (!dbPath || dbPath.startsWith('--')) {
  console.error('usage: node src/sync-dataset.ts <stars.db> [--kind domain|tags] [--labels labels.json]')
  process.exit(1)
}
const li = argv.indexOf('--labels')
const labelsPath = li === -1 ? new URL('../labels.json', import.meta.url).pathname : argv[li + 1]!

const ki = argv.indexOf('--kind')
const kind = ki === -1 ? 'domain' : argv[ki + 1]
if (kind !== 'domain' && kind !== 'tags') {
  console.error('--kind 는 domain 또는 tags')
  process.exit(1)
}
const datasetName = kind === 'tags' ? TAG_DATASET_NAME : DATASET_NAME

const labels = (kind === 'tags' ? completedTagLabels : completedLabels)(readLabels(labelsPath))
if (!labels.length) {
  console.error('정답을 붙인 항목이 없다. labels.json 의 primary/categories 를 채운다')
  process.exit(1)
}

const langfuse = requireLangfuse()
const db = openDb(dbPath, { readonly: true })
const repos = reposByName(db, labels.map((l) => l.repo))
db.close()

try {
  await langfuse.api.datasets.get(datasetName)
} catch {
  const what = kind === 'tags' ? '자유 태그' : '도메인'
  await langfuse.api.datasets.create({ name: datasetName, description: `사람이 붙인 별표 저장소 ${what} 정답 (labels.json)` })
  console.log(`데이터셋 ${datasetName} 만듦`)
}

for (const [i, label] of labels.entries()) {
  const repo = repos[i]!
  await langfuse.dataset.createItem({
    datasetName,
    id: `repo-${repo.repoId}`,
    input: inputOf(repo),
    expectedOutput:
      kind === 'tags'
        ? { primary: label.primary, tags: tagsOf(label) }
        : { primary: label.primary, categories: label.categories },
    metadata: { stratum: label.stratum, note: label.note },
  })
}
console.log(`${labels.length}건 올림 → ${datasetName}`)
await shutdown()
