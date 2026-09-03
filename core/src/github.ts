import { execFileSync } from 'node:child_process'

const API = 'https://api.github.com/user/starred'

export type StarItem = { starred_at: string; repo: Record<string, unknown> }

/**
 * 토큰은 GITHUB_TOKEN / GH_TOKEN 을 먼저 보고, 없으면 `gh auth token` 을 쓴다.
 * gh 로 이미 로그인한 환경에서는 아무 설정 없이 동작한다.
 */
export function resolveToken(): string {
  const env = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (env) return env

  let token = ''
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
  } catch {
    // gh 미설치/미로그인. 아래에서 던진다.
  }
  if (token) return token

  throw new Error('토큰 없음: GITHUB_TOKEN 을 설정하거나 gh auth login 을 실행한다')
}

const nextLink = (link: string | null): string | null =>
  link?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null

export type Page = { number: number; items: StarItem[]; rateRemaining: number }

/**
 * `sort=created` 는 repo 생성이 아니라 별표를 누른 시각 기준이다.
 *
 * direction 이 페이지네이션 안정성을 가른다. desc(최신 우선)에서는 동기화 도중
 * 별표를 하나 누르면 전체가 한 칸씩 밀려서 repo 하나를 건너뛸 수 있다.
 * asc 는 새 별표가 마지막 페이지 뒤에 붙으므로 앞 페이지가 흔들리지 않는다.
 * 그래서 전체 동기화는 asc, 앞부분만 훑고 빠지는 증분은 desc 를 쓴다.
 */
export async function* fetchPages(
  token: string,
  direction: 'asc' | 'desc',
  perPage = 100,
): AsyncGenerator<Page> {
  let url: string | null = `${API}?sort=created&direction=${direction}&per_page=${perPage}`
  let number = 0

  while (url) {
    const res = await fetch(url, {
      headers: {
        // star+json 을 빼면 starred_at 없이 repo 객체만 온다.
        Accept: 'application/vnd.github.star+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!res.ok) throw new Error(await describe(res))

    yield {
      number: ++number,
      items: (await res.json()) as StarItem[],
      rateRemaining: Number(res.headers.get('x-ratelimit-remaining') ?? -1),
    }

    url = nextLink(res.headers.get('link'))
  }
}

async function describe(res: Response): Promise<string> {
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0)
    if (remaining === '0' && reset) {
      const wait = Math.max(0, Math.ceil(reset * 1000 - Date.now()) / 1000)
      return `레이트 리밋 소진. ${new Date(reset * 1000).toLocaleTimeString()} 에 복구 (${Math.ceil(wait / 60)}분 후)`
    }
  }
  const body = await res.text().catch(() => '')
  const message = body.slice(0, 200)
  return `GitHub ${res.status} ${res.statusText}${message ? `: ${message}` : ''}`
}
