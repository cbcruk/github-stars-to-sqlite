'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * 상태는 전부 URL 이 갖는다. 클라이언트는 파라미터만 갱신하고, 데이터는 서버가
 * searchParams 를 다시 읽어 그린다. 컨트롤과 스펙트럼이 같은 훅을 쓴다.
 */
export function useUrlState() {
  const router = useRouter()
  const params = useSearchParams()

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(Array.from(params.entries()))
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (next.toString() === params.toString()) return
    const s = next.toString()
    router.replace(s ? `/?${s}` : '/', { scroll: false })
  }

  return { params, set }
}
