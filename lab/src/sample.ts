#!/usr/bin/env node
/**
 * 정답을 붙일 표본을 뽑아 labels.json 에 더한다. 층마다 같은 수를 뽑는다.
 * 이미 있는 항목은 건드리지 않는다(붙인 정답을 지우지 않는다). 순서는 고정 해시라 다시 돌려도 같다.
 *
 *   node src/sample.ts ../stars.db [--per-stratum 20] [--out labels.json]
 */
import { createHash } from 'node:crypto'
import { openDb } from '@stars/core'
import { readLabels, writeLabels, type Label, type Stratum } from './labels.ts'
import { allRepos, type Repo } from './repos.ts'

const argv = process.argv.slice(2)
const dbPath = argv[0]
if (!dbPath || dbPath.startsWith('--')) {
  console.error('usage: node src/sample.ts <stars.db> [--per-stratum N] [--out labels.json]')
  process.exit(1)
}
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]!
}
const perStratum = Number(opt('--per-stratum', '20'))
const out = opt('--out', new URL('../labels.json', import.meta.url).pathname)

const db = openDb(dbPath, { readonly: true })
const repos = allRepos(db)
db.close()

const stratumOf = (r: Repo): Stratum =>
  r.keyword.categories.length === 0 ? 'keyword-none' : r.keyword.categories.length === 1 ? 'keyword-single' : 'keyword-multi'
const order = (r: Repo) => createHash('sha256').update(r.fullName).digest('hex')

const labels = readLabels(out)
const have = new Set(labels.map((l) => l.repo))
const added: Record<Stratum, number> = { 'keyword-single': 0, 'keyword-multi': 0, 'keyword-none': 0 }

for (const stratum of Object.keys(added) as Stratum[]) {
  const already = labels.filter((l) => l.stratum === stratum).length
  const pool = repos
    .filter((r) => stratumOf(r) === stratum && !have.has(r.fullName))
    .sort((a, b) => order(a).localeCompare(order(b)))
  for (const r of pool.slice(0, Math.max(0, perStratum - already))) {
    labels.push({
      repo: r.fullName,
      stratum,
      primary: null,
      categories: [],
      note: '',
      context: { description: r.description, topics: r.topics, language: r.language },
    } satisfies Label)
    added[stratum]++
  }
}

writeLabels(out, labels)
const todo = labels.filter((l) => l.primary === null).length
console.log(`${out}\n추가 ${JSON.stringify(added)}  전체 ${labels.length}  남은 정답 ${todo}`)
