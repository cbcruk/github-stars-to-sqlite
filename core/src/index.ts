// web(읽기)이 쓰는 공개 표면. 적재 전용 모듈(github/ingest)은 노출하지 않는다.
export { openDb, tx, SCHEMA, type OpenOpts } from './db.ts'

// 분류 정의. 뷰(repo_category)는 이 목록에서 찍어내므로 라벨·색도 여기서 온다.
export {
  CATEGORIES,
  categoryViewsSql,
  REFILL_CATEGORIES,
  type Category,
  type Hue,
} from './categories.ts'

/** star 테이블 한 행. data 는 GitHub 응답 필드명 그대로의 JSON 문자열. */
export type StarRow = {
  repo_id: number
  full_name: string
  starred_at: number
  sha256: string
  data: string
  first_sync: number
  last_sync: number
  unstarred_sync: number | null
}
