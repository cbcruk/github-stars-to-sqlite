import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { tx } from './db.ts'
import type { StarItem } from './github.ts'
import { normalize, epochOf } from './normalize.ts'

type DB = DatabaseSync

export type SyncMode = 'full' | 'incremental' | 'file'
export type PageResult = { seen: number; added: number; changed: number }

export function beginSync(db: DB, mode: SyncMode): number {
  return Number(db.prepare('INSERT INTO sync (mode) VALUES (?)').run(mode).lastInsertRowid)
}

/** 증분 동기화의 컷오프. 이 시각 이하의 별표를 만나면 그 뒤는 이미 가진 것들이다. */
export function latestStarredAt(db: DB): number | null {
  const row = db.prepare('SELECT max(starred_at) AS t FROM star').get() as
    | { t: number | null }
    | undefined
  return row?.t ?? null
}

type PrevRow = { sha256: string; unstarred_sync: number | null }

/**
 * 페이지 하나가 트랜잭션 하나다. 중간에 끊겨도 반쪽 페이지는 남지 않고,
 * ok=0 으로 남은 동기화는 언스타 판정의 근거가 되지 못한다.
 */
export function ingestPage(db: DB, syncId: number, items: StarItem[]): PageResult {
  const find = db.prepare('SELECT sha256, unstarred_sync FROM star WHERE repo_id = ?')
  const insert = db.prepare(`
    INSERT INTO star (repo_id, full_name, starred_at, sha256, data, first_sync, last_sync)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const touch = db.prepare('UPDATE star SET last_sync = ? WHERE repo_id = ?')
  const update = db.prepare(`
    UPDATE star
       SET full_name = ?, starred_at = ?, sha256 = ?, data = ?,
           last_sync = ?, unstarred_sync = NULL
     WHERE repo_id = ?
  `)
  const bump = db.prepare(
    'UPDATE sync SET pages = pages + 1, seen = seen + ?, added = added + ?, changed = changed + ? WHERE id = ?',
  )

  return tx(db, (): PageResult => {
    const r: PageResult = { seen: 0, added: 0, changed: 0 }

    for (const item of items) {
      const data = normalize(item.repo)
      const repoId = Number(data.id)
      const fullName = String(data.full_name)
      const starredAt = epochOf(item.starred_at)
      const json = JSON.stringify(data)
      const sha256 = createHash('sha256').update(json).digest('hex')

      r.seen++
      const prev = find.get(repoId) as PrevRow | undefined

      if (!prev) {
        insert.run(repoId, fullName, starredAt, sha256, json, syncId, syncId)
        r.added++
      } else if (prev.sha256 === sha256 && prev.unstarred_sync === null) {
        touch.run(syncId, repoId)
      } else {
        // 페이로드가 바뀌었거나, 뺐던 별표를 다시 누른 경우.
        // first_sync 는 건드리지 않는다 — 처음 본 시점은 그대로 남긴다.
        update.run(fullName, starredAt, sha256, json, syncId, repoId)
        if (prev.unstarred_sync === null) r.changed++
        else r.added++
      }
    }

    bump.run(r.seen, r.added, r.changed, syncId)
    return r
  })
}

/**
 * 목록 전체를 본 동기화만 언스타를 판정한다. 증분은 앞부분만 보므로
 * last_sync 가 뒤처진 repo 가 정상이고, 판정하면 전부 오탐이 된다.
 */
export function finishSync(db: DB, syncId: number, complete: boolean): { gone: number } {
  return tx(db, (): { gone: number } => {
    const gone = complete
      ? Number(
          db
            .prepare('UPDATE star SET unstarred_sync = ? WHERE unstarred_sync IS NULL AND last_sync < ?')
            .run(syncId, syncId).changes,
        )
      : 0

    db.prepare('UPDATE sync SET finished_at = unixepoch(), gone = ?, ok = 1 WHERE id = ?').run(
      gone,
      syncId,
    )
    return { gone }
  })
}
