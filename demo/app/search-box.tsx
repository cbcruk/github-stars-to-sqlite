'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// 클라이언트는 URL 만 갱신한다. 데이터는 서버가 searchParams 로 다시 그린다.
// 타이핑마다 왕복하지 않도록 220ms debounce 만 건다.
export function SearchBox({ langs }: { langs: { language: string; n: number }[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const push = (next: URLSearchParams) => {
    const s = next.toString()
    router.replace(s ? `/?${s}` : '/')
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(Array.from(params.entries()))
      if (q) next.set('q', q)
      else next.delete('q')
      if (next.toString() !== params.toString()) push(next)
    }, 220)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(Array.from(params.entries()))
    if (value) next.set(key, value)
    else next.delete(key)
    push(next)
  }

  return (
    <div className="bar">
      <label className="search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 · 설명 · 저자로 검색…"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <select
        value={params.get('lang') ?? ''}
        onChange={(e) => set('lang', e.target.value)}
        aria-label="언어"
      >
        <option value="">모든 언어</option>
        {langs.map((l) => (
          <option key={l.language} value={l.language}>
            {l.language} · {l.n}
          </option>
        ))}
      </select>
      <select
        value={params.get('sort') ?? 'stars'}
        onChange={(e) => set('sort', e.target.value)}
        aria-label="정렬"
      >
        <option value="stars">★ 스타순</option>
        <option value="recent">최근 star순</option>
      </select>
    </div>
  )
}
