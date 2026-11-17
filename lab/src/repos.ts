import type { DatabaseSync } from 'node:sqlite'

/** 분류기에 넣는 저장소 정보. GitHub 이 가진 값만 담는다. */
export type RepoInput = {
  fullName: string
  description: string | null
  topics: string[]
  language: string | null
}

/** 키워드 휴리스틱(repo_category)의 결과. 걸린 게 없으면 primary 가 'none'. */
export type KeywordResult = { primary: string; categories: string[] }

export type Repo = RepoInput & { repoId: number; keyword: KeywordResult }

type Row = {
  repo_id: number
  full_name: string
  description: string | null
  topics: string | null
  language: string | null
  categories: string | null
  primary_category: string | null
}

const SELECT = `
SELECT
  s.repo_id,
  s.full_name,
  json_extract(s.data, '$.description') AS description,
  json_extract(s.data, '$.topics')      AS topics,
  json_extract(s.data, '$.language')    AS language,
  (SELECT group_concat(c.category, ',') FROM (SELECT category FROM repo_category WHERE repo_id = s.repo_id ORDER BY ord) c) AS categories,
  (SELECT p.category FROM repo_primary_category p WHERE p.repo_id = s.repo_id) AS primary_category
FROM star s
WHERE s.unstarred_sync IS NULL`

function toRepo(r: Row): Repo {
  return {
    repoId: r.repo_id,
    fullName: r.full_name,
    description: r.description,
    topics: r.topics ? (JSON.parse(r.topics) as string[]) : [],
    language: r.language,
    keyword: {
      primary: r.primary_category ?? 'none',
      categories: r.categories ? r.categories.split(',') : [],
    },
  }
}

export function inputOf(repo: Repo): RepoInput {
  return { fullName: repo.fullName, description: repo.description, topics: repo.topics, language: repo.language }
}

/** 최근 별표부터. */
export function recentRepos(db: DatabaseSync, limit: number): Repo[] {
  return (db.prepare(`${SELECT} ORDER BY s.starred_at DESC LIMIT ?`).all(limit) as Row[]).map(toRepo)
}

export function reposByName(db: DatabaseSync, names: string[]): Repo[] {
  const stmt = db.prepare(`${SELECT} AND s.full_name = ?`)
  return names.map((name) => {
    const row = stmt.get(name) as Row | undefined
    if (!row) throw new Error(`stars.db 에 없는 저장소: ${name}`)
    return toRepo(row)
  })
}

export function allRepos(db: DatabaseSync): Repo[] {
  return (db.prepare(SELECT).all() as Row[]).map(toRepo)
}
