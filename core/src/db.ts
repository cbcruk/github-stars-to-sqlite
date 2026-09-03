import { DatabaseSync } from 'node:sqlite'

export const SCHEMA = `
-- 동기화 1회 = row 하나. ok=1 인 full 동기화만 언스타 판정의 근거가 된다.
CREATE TABLE IF NOT EXISTS sync (
  id          INTEGER PRIMARY KEY,
  mode        TEXT    NOT NULL,          -- 'full' | 'incremental' | 'file'
  started_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER,
  pages       INTEGER NOT NULL DEFAULT 0,
  seen        INTEGER NOT NULL DEFAULT 0,
  added       INTEGER NOT NULL DEFAULT 0,
  changed     INTEGER NOT NULL DEFAULT 0,
  gone        INTEGER NOT NULL DEFAULT 0,
  ok          INTEGER NOT NULL DEFAULT 0
);

-- repo 하나 = row 하나. 본문은 GitHub 응답 필드명 그대로의 JSON.
-- last_sync 는 "목록에서 마지막으로 확인된 동기화"라, full 동기화가 끝나면
-- last_sync < 이번 id 인 row 가 곧 그 사이에 별표를 뺀 repo 다.
CREATE TABLE IF NOT EXISTS star (
  repo_id        INTEGER PRIMARY KEY,
  full_name      TEXT    NOT NULL,
  starred_at     INTEGER NOT NULL,
  sha256         TEXT    NOT NULL,
  data           TEXT    NOT NULL,
  first_sync     INTEGER NOT NULL REFERENCES sync(id),
  last_sync      INTEGER NOT NULL REFERENCES sync(id),
  unstarred_sync INTEGER          REFERENCES sync(id)
);

CREATE INDEX IF NOT EXISTS star_starred_at ON star(starred_at);
CREATE INDEX IF NOT EXISTS star_full_name  ON star(full_name);
CREATE INDEX IF NOT EXISTS star_live       ON star(last_sync) WHERE unstarred_sync IS NULL;
`

export type OpenOpts = { readonly?: boolean }

/**
 * 쓰기(적재)와 읽기(web) 양쪽이 이 함수 하나로 연다.
 *
 * 읽기 전용은 `immutable=1` URI 로 연다. Vercel 함수처럼 읽기 전용 파일시스템
 * 에서 SQLite 가 -shm/-wal 을 만들려다 실패하는 걸 막는 유일한 방법이다.
 * 대신 이 모드는 -wal 을 읽지 않으므로, 적재 후 wal_checkpoint 로 접어 두는
 * 것이 정확성 조건이다.
 */
export function openDb(path: string, opts: OpenOpts = {}): DatabaseSync {
  if (opts.readonly) {
    return new DatabaseSync(`file:${path}?immutable=1`, { readOnly: true })
  }
  // node:sqlite 에는 better-sqlite3 의 .pragma() 헬퍼가 없다. exec 로 직접 건다.
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

/**
 * node:sqlite 에는 bun:sqlite / better-sqlite3 의 db.transaction() 헬퍼가
 * 없다. BEGIN/COMMIT 을 직접 건다. 예외가 나면 ROLLBACK 하고 다시 던진다.
 */
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
