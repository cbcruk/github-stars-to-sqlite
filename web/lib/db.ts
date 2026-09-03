import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '@stars/core'

// 모듈 스코프 싱글턴. 웜 인보케이션에서 재사용된다.
let handle: DatabaseSync | null = null

export function db(): DatabaseSync {
  if (handle) return handle
  // 열기 로직(immutable=1 읽기 전용)은 core 가 갖는다. web 은 경로만 준다.
  handle = openDb(join(process.cwd(), 'stars.db'), { readonly: true })
  return handle
}
