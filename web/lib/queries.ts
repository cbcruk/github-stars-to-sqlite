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
  /** 이 저장소에 GitHub 에 실제로 달려 있는 토픽. 언어와 이름이 겹치는 것은 뺀다. */
  topics: string[]
}

export type Facet = { key: string; n: number }

/** 화면에 한 번에 그리는 카드 수. 나머지는 검색·필터로 좁혀서 본다. */
export const PAGE_SIZE = 120

/** 칩으로 내보내는 토픽 수. 넘치면 OverflowList 가 +N 으로 접는다. */
export const TOPIC_CHIPS = 20

/** 스펙트럼에 이름을 갖고 나오는 언어 수. 나머지는 '기타' 로 합친다. */
export const SPECTRUM_LANGS = 9

// node:sqlite 는 SQL 안의 큰따옴표를 컬럼명으로 해석한다. 문자열 리터럴은
// 반드시 홑따옴표로 쓴다.
//
// 분류는 GitHub 이 갖고 있는 것만 쓴다 — 언어(repo 당 0 또는 1개)와 토픽(여러 개).
// 우리가 지어낸 도메인은 화면에서 쓰지 않는다. 정의는 core/src/categories.ts 에
// 그대로 남아 있고 repo_category 로 질의할 수 있다. 분석이 필요해지면 그때 쓴다.
const WHERE = `
  WHERE (?1 = '' OR s.full_name LIKE ?2 OR s.description LIKE ?2 OR s.owner LIKE ?2)
    AND (?3 = '' OR s.language = ?3)
    AND (?4 = '' OR EXISTS (
          SELECT 1 FROM topic t WHERE t.repo_id = s.repo_id AND t.topic = ?4))`

const SEARCH = `
  SELECT s.full_name, s.url, s.owner, s.description, s.language, s.stars,
         s.archived, s.starred_at,
         (SELECT group_concat(t.topic, ' ')
            FROM topic t WHERE t.repo_id = s.repo_id) AS topic_list
  FROM starred s
  ${WHERE}
  ORDER BY
    CASE ?5 WHEN 'recent' THEN s.starred_at END DESC,
    CASE ?5 WHEN 'name' THEN lower(s.full_name) END ASC,
    s.stars DESC
  LIMIT ${PAGE_SIZE}`

const MATCHES = `SELECT count(*) AS n FROM starred s ${WHERE}`

// 언어 이름과 같은 토픽은 뺀다. 'javascript' 칩과 JavaScript 언어 필터가 같은
// 자리를 두고 다투기 때문이다. 이름 비교뿐이라 판단이 들어가지 않는다.
const LANGUAGE_NAMES = `SELECT lower(language) FROM starred WHERE language IS NOT NULL`

const TOPICS = `
  SELECT topic AS key, count(*) AS n
  FROM topic
  WHERE lower(topic) NOT IN (${LANGUAGE_NAMES})
  GROUP BY topic
  ORDER BY n DESC, topic ASC
  LIMIT ?`

const LANGS = `
  SELECT language AS key, count(*) AS n
  FROM starred
  WHERE language IS NOT NULL
  GROUP BY language
  ORDER BY n DESC
  LIMIT 20`

// 스펙트럼용. 언어 없는 repo 까지 세야 합이 전체와 맞는다.
const LANG_SHAPE = `
  SELECT coalesce(language, '') AS key, count(*) AS n
  FROM starred
  GROUP BY language
  ORDER BY n DESC`

const TOTAL = `SELECT count(*) AS n FROM starred`

/** .all() 은 null-prototype 객체를 준다. 클라이언트로 넘기기 전에 평범하게 만든다. */
function plain<T>(rows: unknown[]): T[] {
  return rows.map((r) => ({ ...(r as object) })) as T[]
}

export function search(q: string, lang: string, topic: string, sort: string): Repo[] {
  const rows = db().prepare(SEARCH).all(q, `%${q}%`, lang, topic, sort)
  return plain<Repo & { topic_list: string | null }>(rows).map(({ topic_list, ...r }) => {
    const own = (topic_list ?? '').split(' ').filter(Boolean)
    // 카드에서도 언어와 겹치는 토픽은 뺀다. 바로 옆에 언어가 이미 있다.
    const lower = r.language?.toLowerCase()
    return { ...r, topics: own.filter((t) => t !== lower) }
  })
}

export function matches(q: string, lang: string, topic: string): number {
  return (db().prepare(MATCHES).get(q, `%${q}%`, lang, topic) as { n: number }).n
}

export function topics(limit = TOPIC_CHIPS): Facet[] {
  return plain<Facet>(db().prepare(TOPICS).all(limit))
}

export function languages(): Facet[] {
  return plain<Facet>(db().prepare(LANGS).all())
}

/**
 * 스펙트럼. 언어는 repo 당 0 또는 1개라 겹치지 않는다 — 컬렉션을 그대로 나눈다.
 * 59개를 전부 그리면 실오라기가 되므로 상위 몇 개만 이름을 갖고 나머지는 합친다.
 * 합친 칸은 필터가 되지 않는다. '그 외 전부'는 눌러서 볼 만한 묶음이 아니다.
 */
export function languageShape(): { named: Facet[]; rest: number } {
  const all = plain<Facet>(db().prepare(LANG_SHAPE).all())
  const named = all.filter((f) => f.key !== '').slice(0, SPECTRUM_LANGS)
  const rest = all.reduce((a, f) => a + f.n, 0) - named.reduce((a, f) => a + f.n, 0)
  return { named, rest }
}

export function total(): number {
  return (db().prepare(TOTAL).get() as { n: number }).n
}
