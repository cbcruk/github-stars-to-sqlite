import { search, languages, total } from '@/lib/queries'
import { SearchBox } from './search-box'

export const dynamic = 'force-dynamic'

type SP = Promise<{ q?: string; lang?: string; sort?: string }>

function star(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + 'k'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { q = '', lang = '', sort = 'stars' } = await searchParams

  // 세 질의 모두 서버에서 동기적으로 실행된다. node:sqlite 는 sync API 라
  // await 도 없다. 클라이언트로 내려가는 건 결과 행뿐이다.
  const rows = search(q.trim(), lang, sort)
  const langs = languages()
  const count = total()

  return (
    <div className="wrap">
      <header>
        <span className="eyebrow">github-stars-to-sqlite · RSC + node:sqlite</span>
        <h1>
          <span className="star">★</span> Star Index
        </h1>
        <p className="sub">
          <b>{count.toLocaleString()}</b> repositories · 서버에서 커밋된{' '}
          <b>stars.db</b> 를 직접 질의합니다
        </p>
      </header>

      <div className="controls">
        <SearchBox langs={langs} />
      </div>

      <p className="shown" style={{ margin: '0 0 14px' }}>
        <b>{rows.length}</b> shown
        {q ? ` · "${q}"` : ''}
        {lang ? ` · ${lang}` : ''}
      </p>

      {rows.length === 0 ? (
        <div className="empty">
          <h3>조건에 맞는 저장소가 없어요</h3>
          <p>검색어나 필터를 넓혀보세요.</p>
        </div>
      ) : (
        <div className="grid">
          {rows.map((r) => (
            <a
              key={r.full_name}
              className={`card${r.archived ? ' arch' : ''}`}
              href={r.url}
              target="_blank"
              rel="noopener"
            >
              <div className="top">
                <span className="repo">
                  <span className="owner">{r.owner}/</span>
                  <span className="name">{r.full_name.split('/')[1]}</span>
                </span>
                <span className="stars">★ {star(r.stars)}</span>
              </div>
              {r.description ? <p className="desc">{r.description}</p> : null}
              <div className="meta">
                {r.language ? <span>{r.language}</span> : null}
                {r.archived ? <span className="arch-tag">archived</span> : null}
              </div>
            </a>
          ))}
        </div>
      )}

      <footer>
        데이터: 별표 {count.toLocaleString()}개 스냅샷 · node:sqlite 로 immutable
        읽기 · 상태는 URL(?q &amp;lang &amp;sort)이 보관
      </footer>
    </div>
  )
}
