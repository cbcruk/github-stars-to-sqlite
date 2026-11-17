#!/usr/bin/env node
/**
 * production 태그 프롬프트(stars-tag)로 살아 있는 별표에 태그를 붙여 stars.db 에 쓴다 (SPEC B11).
 * 화면은 이 태그를 읽지 않는다 — repo_category 처럼 sqlite3 로 질의할 때 쓴다.
 *
 *   repo_tag      (repo_id, tag, is_primary)                       태그. 저장소당 1~3개
 *   repo_tag_run  (repo_id, prompt_version, model, tagged_at)      어느 프롬프트·모델로 붙였나
 *
 * 아직 안 붙인 저장소만 붙인다. 끊겨도 다시 돌리면 이어진다(저장소 하나씩 커밋).
 * --refresh 를 주면 지금 production 버전보다 옛 버전으로 붙인 것도 다시 붙인다.
 *
 *   LLM_MODEL=claude-haiku-5-5 node --env-file=.env src/write-tags.ts ../stars.db [--limit N] [--refresh]
 *
 * 모델은 Haiku 를 권한다: stars-tags 에서 Opus 와 judge F1 이 같고(0.610 / 0.625) 값은 1/30 이다.
 */
import { flush, shutdown } from './instrumentation.ts'
import { openDb, tx } from '@stars/core'
import { requireLangfuse } from './langfuse.ts'
import { llmConfig } from './llm.ts'
import { TAG_PROMPT } from './prompt.ts'
import { allRepos, inputOf } from './repos.ts'
import { tagTraced } from './tag.ts'

const DDL = `
CREATE TABLE IF NOT EXISTS repo_tag (
  repo_id    INTEGER NOT NULL,
  tag        TEXT    NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_id, tag)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS repo_tag_tag ON repo_tag(tag);
CREATE TABLE IF NOT EXISTS repo_tag_run (
  repo_id        INTEGER PRIMARY KEY,
  prompt_version INTEGER NOT NULL,
  model          TEXT    NOT NULL,
  tagged_at      INTEGER NOT NULL
);`

const argv = process.argv.slice(2)
const dbPath = argv[0]
if (!dbPath || dbPath.startsWith('--')) {
  console.error('usage: node src/write-tags.ts <stars.db> [--limit N] [--refresh]')
  process.exit(1)
}
const li = argv.indexOf('--limit')
const limit = li === -1 ? Infinity : Number(argv[li + 1])
const refresh = argv.includes('--refresh')
const CONCURRENCY = 8

const db = openDb(dbPath)
db.exec(DDL)

// 지금 production 버전을 알아야 --refresh 가 뭘 다시 붙일지 안다
const currentVersion = (await requireLangfuse().prompt.get(TAG_PROMPT.name, { type: 'chat' })).version
const done = new Map(
  (db.prepare('SELECT repo_id, prompt_version FROM repo_tag_run').all() as Array<{ repo_id: number; prompt_version: number }>).map(
    (r) => [r.repo_id, r.prompt_version],
  ),
)
const repos = allRepos(db)
const todo = repos
  .filter((r) => {
    const v = done.get(r.repoId)
    return v === undefined || (refresh && v < currentVersion)
  })
  .slice(0, limit)

const del = db.prepare('DELETE FROM repo_tag WHERE repo_id = ?')
const ins = db.prepare('INSERT OR IGNORE INTO repo_tag (repo_id, tag, is_primary) VALUES (?, ?, ?)')
const run = db.prepare('INSERT OR REPLACE INTO repo_tag_run (repo_id, prompt_version, model, tagged_at) VALUES (?, ?, ?, ?)')

console.log(`${llmConfig.model}  stars-tag v${currentVersion}  붙일 저장소 ${todo.length} / 살아 있는 별표 ${repos.length}`)

let ok = 0
const failed: string[] = []
const queue = [...todo]
async function worker() {
  for (let repo = queue.shift(); repo; repo = queue.shift()) {
    try {
      const { result, prompt } = await tagTraced(inputOf(repo), { experiment: 'write-tags' })
      if (!prompt || prompt.isFallback) throw new Error('Langfuse 프롬프트를 못 읽었다 — 로컬 fallback 으로는 쓰지 않는다')
      if (!result.tags.length) throw new Error('태그가 비었다')
      tx(db, () => {
        del.run(repo.repoId)
        for (const t of result.tags) ins.run(repo.repoId, t.toLowerCase(), t === result.primary ? 1 : 0)
        run.run(repo.repoId, prompt.version, llmConfig.model, Date.now())
      })
      done.set(repo.repoId, prompt.version)
      ok++
    } catch (err) {
      failed.push(`${repo.fullName}: ${(err as Error).message}`)
    }
    process.stdout.write(`\r붙임 ${ok}  실패 ${failed.length}  남음 ${queue.length}   `)
  }
}

try {
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log()
  for (const f of failed.slice(0, 20)) console.log(`  실패 ${f}`)
  const { n, tags } = db.prepare('SELECT COUNT(DISTINCT repo_id) AS n, COUNT(*) AS tags FROM repo_tag').get() as { n: number; tags: number }
  console.log(`repo_tag: 저장소 ${n}, 태그 ${tags}. 다시 돌리면 실패한 것만 이어 붙인다`)
  await flush()
} finally {
  db.close()
  await shutdown()
}
