import { db } from './db'
import searchSql from '../queries/search.sql'
import matchesSql from '../queries/matches.sql'
import topicsSql from '../queries/topics.sql'
import languagesSql from '../queries/languages.sql'
import languageShapeSql from '../queries/language_shape.sql'
import totalSql from '../queries/total.sql'

// SQL 은 queries/*.sql 에 있고, 행 타입은 reylo 가 db 에 걸린 뷰에서 추론한다.
// 손으로 쓴 행 타입은 없다. 뷰를 고치면 core/make-views.ts 로 stars.db 에 다시
// 적용해야 타입이 따라온다.
//
// 분류는 GitHub 이 갖고 있는 것만 쓴다 — 언어(repo 당 0 또는 1개)와 토픽(여러 개).
// 우리가 지어낸 도메인은 화면에서 쓰지 않는다. 정의는 core/src/categories.ts 에
// 그대로 남아 있고 repo_category 로 질의할 수 있다. 분석이 필요해지면 그때 쓴다.

type SearchRow = ReturnType<typeof searchSql.runSync>[number]

/** 행 타입은 queries/search.sql 에서 추론된다. topic_list 만 배열로 편다. */
export type Repo = Omit<SearchRow, 'topic_list'> & {
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

export function search(q: string, lang: string, topic: string, sort: string): Repo[] {
  const rows = searchSql.runSync(db(), { q, lang, topic, sort, limit: PAGE_SIZE })
  return rows.map(({ topic_list, ...r }) => {
    const own = (topic_list ?? '').split(' ').filter(Boolean)
    // 카드에서도 언어와 겹치는 토픽은 뺀다. 바로 옆에 언어가 이미 있다.
    const lower = r.language?.toLowerCase()
    return { ...r, topics: own.filter((t) => t !== lower) }
  })
}

export function matches(q: string, lang: string, topic: string): number {
  return matchesSql.runSync(db(), { q, lang, topic }).n
}

export function topics(limit = TOPIC_CHIPS): Facet[] {
  return topicsSql.runSync(db(), { limit })
}

export function languages(): Facet[] {
  return languagesSql.runSync(db())
}

/**
 * 스펙트럼. 언어는 repo 당 0 또는 1개라 겹치지 않는다 — 컬렉션을 그대로 나눈다.
 * 59개를 전부 그리면 실오라기가 되므로 상위 몇 개만 이름을 갖고 나머지는 합친다.
 * 합친 칸은 필터가 되지 않는다. '그 외 전부'는 눌러서 볼 만한 묶음이 아니다.
 */
export function languageShape(): { named: Facet[]; rest: number } {
  const all = languageShapeSql.runSync(db())
  const named = all.filter((f) => f.key !== '').slice(0, SPECTRUM_LANGS)
  const rest = all.reduce((a, f) => a + f.n, 0) - named.reduce((a, f) => a + f.n, 0)
  return { named, rest }
}

export function total(): number {
  return totalSql.runSync(db()).n
}
