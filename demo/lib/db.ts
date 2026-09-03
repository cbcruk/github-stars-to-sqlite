import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

// 모듈 스코프 싱글턴. 웜 인보케이션에서 재사용된다.
let handle: DatabaseSync | null = null

export function db(): DatabaseSync {
  if (handle) return handle

  const path = join(process.cwd(), 'stars.db')
  // immutable=1 이 읽기 전용 파일시스템(Vercel 함수)에서 여는 유일한 방법이다.
  // -shm/-wal 을 만들려 하지 않고 잠금 검사도 건너뛴다. 대신 -wal 은 읽지
  // 않으므로, 커밋 전에 wal_checkpoint 로 접어 두는 것이 정확성 조건이다.
  handle = new DatabaseSync(`file:${path}?immutable=1`, { readOnly: true })
  return handle
}
