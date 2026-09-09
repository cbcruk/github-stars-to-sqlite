import { CATEGORIES } from '@stars/core'
import { db } from './db'

export type Repo = {
  full_name: string
  url: string
  owner: string
  description: string | null
  language: string | null
  stars: number
  archived: number
  starred_at: string
  /** 대표 도메인. 어떤 키워드에도 걸리지 않으면 null. */
  category: string | null
  /** 전체 소속. CATEGORIES 순서로 정렬된다. */
  categories: string[]
}

export type Facet = { key: string; n: number }

/** 화면에 한 번에 그리는 카드 수. 나머지는 검색·필터로 좁혀서 본다. */
export const PAGE_SIZE = 120

// node:sqlite 는 SQL 안의 큰따옴표를 컬럼명으로 해석한다. 문자열 리터럴은
// 반드시 홑따옴표로 쓴다.
//
// 분류는 repo_category(전체 소속)와 repo_primary_category(대표) 두 뷰가 갖는다.
// 정의는 core/src/categories.ts 고 뷰는 거기서 찍어낸 것이다 — 여기서는 조인만
// 한다. 필터는 소속 기준이라 chip 을 누르면 대표가 아닌 repo 도 함께 나온다.
const WHERE = `
  WHERE (?1 = '' OR s.full_name LIKE ?2 OR s.description LIKE ?2 OR s.owner LIKE ?2)
    AND (?3 = '' OR s.language = ?3)
    AND (?4 = '' OR EXISTS (
          SELECT 1 FROM repo_category c
          WHERE c.repo_id = s.repo_id AND c.category = ?4))`

const SEARCH = `
  SELECT s.full_name, s.url, s.owner, s.description, s.language, s.stars,
         s.archived, s.starred_at,
         p.category AS category,
         (SELECT group_concat(c.category, ' ')
            FROM repo_category c WHERE c.repo_id = s.repo_id) AS memberships
  FROM starred s
  LEFT JOIN repo_primary_category p ON p.repo_id = s.repo_id
  ${WHERE}
  ORDER BY
    CASE ?5 WHEN 'recent' THEN s.starred_at END DESC,
    CASE ?5 WHEN 'name' THEN lower(s.full_name) END ASC,
    s.stars DESC
  LIMIT ${PAGE_SIZE}`

const MATCHES = `SELECT count(*) AS n FROM starred s ${WHERE}`

const LANGS = `
  SELECT language AS key, count(*) AS n
  FROM starred
  WHERE language IS NOT NULL
  GROUP BY language
  ORDER BY n DESC
  LIMIT 20`

// 스펙트럼은 대표 도메인이라 겹치지 않는다 — 컬렉션의 모양을 그대로 나눈다.
const SHAPE = `
  SELECT category AS key, count(*) AS n
  FROM repo_primary_category
  GROUP BY category`

// chip 의 숫자는 소속 기준이다. 눌렀을 때 나오는 수와 같아야 하기 때문이다.
const MEMBERSHIPS = `
  SELECT category AS key, count(*) AS n
  FROM repo_category
  GROUP BY category`

const TOTAL = `SELECT count(*) AS n FROM starred`

const rank = new Map(CATEGORIES.map((c, i) => [c.id, i]))

/** .all() 은 null-prototype 객체를 준다. 클라이언트로 넘기기 전에 평범하게 만든다. */
function plain<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) })) as T[]
}

export function search(q: string, lang: string, cat: string, sort: string): Repo[] {
  const rows = db().prepare(SEARCH).all(q, `%${q}%`, lang, cat, sort)
  return plain<Repo & { memberships: string | null }>(rows).map(
    ({ memberships, ...r }) => ({
      ...r,
      categories: (memberships ?? '')
        .split(' ')
        .filter(Boolean)
        .sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99)),
    }),
  )
}

export function matches(q: string, lang: string, cat: string): number {
  return (db().prepare(MATCHES).get(q, `%${q}%`, lang, cat) as { n: number }).n
}

export function languages(): Facet[] {
  return plain<Facet>(db().prepare(LANGS).all())
}

export function shape(): Facet[] {
  const counts = new Map(plain<Facet>(db().prepare(SHAPE).all()).map((f) => [f.key, f.n]))
  // CATEGORIES 순서로 낸다. 스펙트럼의 색 배열이 매번 같아야 읽힌다.
  return CATEGORIES.map((c) => ({ key: c.id, n: counts.get(c.id) ?? 0 })).filter((f) => f.n > 0)
}

export function memberships(): Map<string, number> {
  return new Map(plain<Facet>(db().prepare(MEMBERSHIPS).all()).map((f) => [f.key, f.n]))
}

export function total(): number {
  return (db().prepare(TOTAL).get() as { n: number }).n
}
