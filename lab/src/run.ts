#!/usr/bin/env node
/**
 * 몇 개 저장소를 분류해 키워드 결과와 나란히 찍는다. 트레이스가 UI 에 보이는지 확인하는 용도.
 *
 *   node src/run.ts ../stars.db [--limit 10] [--repo owner/name ...]
 */
import { shutdown, tracingEnabled } from './instrumentation.ts'
import { openDb } from '@stars/core'
import { classify } from './classify.ts'
import { llmConfig } from './llm.ts'
import { inputOf, recentRepos, reposByName } from './repos.ts'

const argv = process.argv.slice(2)
const dbPath = argv[0]
if (!dbPath || dbPath.startsWith('--')) {
  console.error('usage: node src/run.ts <stars.db> [--limit N] [--repo owner/name ...]')
  process.exit(1)
}
const limitIdx = argv.indexOf('--limit')
const limit = limitIdx === -1 ? 10 : Number(argv[limitIdx + 1])
const names = argv.flatMap((a, i) => (argv[i - 1] === '--repo' ? [a] : []))

const db = openDb(dbPath, { readonly: true })
const repos = names.length ? reposByName(db, names) : recentRepos(db, limit)
db.close()

console.log(`LLM ${llmConfig.label} / ${llmConfig.model}  트레이스 ${tracingEnabled ? '켜짐' : '꺼짐 (LANGFUSE_* 없음)'}\n`)

let failed = 0
try {
  for (const repo of repos) {
    try {
      const r = await classify(inputOf(repo), { keyword: repo.keyword })
      const same = r.primary === repo.keyword.primary ? ' ' : '≠'
      console.log(`${same} ${repo.fullName.padEnd(40)} 키워드 ${repo.keyword.primary.padEnd(7)} LLM ${r.primary}`)
    } catch (err) {
      failed++
      console.log(`✗ ${repo.fullName.padEnd(40)} ${(err as Error).message}`)
    }
  }
} finally {
  await shutdown()
}
if (failed) process.exit(1)
