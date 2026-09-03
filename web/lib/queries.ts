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
}

export type LangFacet = { language: string; n: number }

// node:sqlite 는 SQL 안의 큰따옴표를 컬럼명으로 해석한다. 문자열 리터럴은
// 반드시 홑따옴표로 쓴다. JSON 경로도 마찬가지($.stargazers_count).
const SEARCH = `
  SELECT full_name, url, owner, description, language, stars, archived,
         starred_at
  FROM starred
  WHERE (?1 = '' OR full_name LIKE ?2 OR description LIKE ?2 OR owner LIKE ?2)
    AND (?3 = '' OR language = ?3)
  ORDER BY
    CASE ?4 WHEN 'recent' THEN starred_at END DESC,
    stars DESC
  LIMIT 60`

const LANGS = `
  SELECT language, count(*) AS n
  FROM starred
  WHERE language IS NOT NULL
  GROUP BY language
  ORDER BY n DESC
  LIMIT 12`

const TOTAL = `SELECT count(*) AS n FROM starred`

export function search(q: string, lang: string, sort: string): Repo[] {
  const rows = db().prepare(SEARCH).all(q, `%${q}%`, lang, sort)
  return rows.map((r) => ({ ...r })) as unknown as Repo[]
}

export function languages(): LangFacet[] {
  return db()
    .prepare(LANGS)
    .all()
    .map((r) => ({ ...r })) as unknown as LangFacet[]
}

export function total(): number {
  return (db().prepare(TOTAL).get() as { n: number }).n
}
