import { Database } from 'bun:sqlite'

const SCHEMA = `
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

export function openDb(path: string): Database {
  const db = new Database(path, { create: true })
  // bun:sqlite 에는 better-sqlite3 의 .pragma() 헬퍼가 없다. exec 로 직접 건다.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
