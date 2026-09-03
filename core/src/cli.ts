#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { openDb } from './db.ts'
import { fetchPages, resolveToken, type StarItem } from './github.ts'
import { beginSync, finishSync, ingestPage, latestStarredAt, type SyncMode } from './ingest.ts'
import { epochOf } from './normalize.ts'

const argv = process.argv.slice(2)
const fromIdx = argv.indexOf('--from')
const fromFile = fromIdx === -1 ? null : argv[fromIdx + 1]
const wantFull = argv.includes('--full')
const dbPath = argv.find((a) => !a.startsWith('--') && a !== fromFile)

if (!dbPath || (fromIdx !== -1 && !fromFile)) {
  console.error('usage: github-stars-to-sqlite <db.sqlite> [--full] [--from <stars.json>]')
  process.exit(1)
}

const db = openDb(dbPath)
const cutoff = latestStarredAt(db)
// 빈 DB 에는 증분이 의미가 없다. --from 은 파일이 목록 전체라고 보고 전체로 취급한다.
const mode: SyncMode = fromFile ? 'file' : wantFull || cutoff === null ? 'full' : 'incremental'

const syncId = beginSync(db, mode)
const total = { seen: 0, added: 0, changed: 0 }
let complete = false

try {
  if (fromFile) {
    const items = JSON.parse(readFileSync(fromFile, 'utf8')) as StarItem[]
    const r = ingestPage(db, syncId, items)
    total.seen += r.seen
    total.added += r.added
    total.changed += r.changed
    complete = true
  } else {
    const token = resolveToken()
    const direction = mode === 'full' ? 'asc' : 'desc'

    for await (const page of fetchPages(token, direction)) {
      // 증분은 desc 라 새 별표가 앞에 몰려 있다. 컷오프에 닿으면 뒤는 볼 필요가 없다.
      const fresh =
        mode === 'incremental' && cutoff !== null
          ? page.items.filter((i) => epochOf(i.starred_at) >= cutoff)
          : page.items
      const exhausted = fresh.length < page.items.length

      const r = ingestPage(db, syncId, fresh)
      total.seen += r.seen
      total.added += r.added
      total.changed += r.changed

      console.log(
        `페이지 ${page.number}  ${r.seen}건  신규 ${r.added}  변경 ${r.changed}` +
          `  남은 요청 ${page.rateRemaining}`,
      )

      if (exhausted) break
    }

    complete = mode === 'full'
  }
} catch (err) {
  // ok=0 으로 남긴다. 반쪽 목록으로 언스타를 판정하는 것보다 판정하지 않는 편이 낫다.
  db.close()
  console.error(`\n동기화 #${syncId} 중단: ${(err as Error).message}`)
  process.exit(1)
}

const { gone } = finishSync(db, syncId, complete)
const live = (
  db.prepare('SELECT count(*) AS n FROM star WHERE unstarred_sync IS NULL').get() as { n: number }
).n
db.close()

console.log(
  `\n동기화 #${syncId} (${mode})  본 것 ${total.seen} / 신규 ${total.added} / 변경 ${total.changed}` +
    (complete ? ` / 언스타 ${gone}` : '') +
    `\n현재 별표 ${live}`,
)
