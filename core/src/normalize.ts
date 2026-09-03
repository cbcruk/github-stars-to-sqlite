/**
 * 응답 payload 의 대부분은 `full_name` 과 `owner.login` 에서 기계적으로 복원되는
 * URL 템플릿이다(`forks_url`, `git_refs_url`, `archive_url` … repo 당 40여 개).
 * 이것만 걷어내도 저장량이 1/3 로 줄고, 남는 필드는 전부 실제 정보다.
 *
 * 규칙은 하나다: `url` 또는 `*_url` 인 키를 재귀적으로 지운다.
 * 예외는 `mirror_url` 뿐이다 — 유일하게 복원할 수 없는 URL 이다.
 *
 * 지운 것들의 복원식:
 *   html_url    = https://github.com/{full_name}
 *   clone_url   = https://github.com/{full_name}.git
 *   avatar_url  = https://avatars.githubusercontent.com/u/{owner.id}?v=4
 *   *_url (API) = https://api.github.com/repos/{full_name}/...
 *
 * `homepage` 는 키 이름이 `_url` 로 끝나지 않으므로 규칙에 걸리지 않는다.
 */
const KEEP = new Set(['mirror_url'])

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip)
  if (value === null || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!KEEP.has(k) && (k === 'url' || k.endsWith('_url'))) continue
    out[k] = strip(v)
  }
  return out
}

export function normalize(repo: Record<string, unknown>): Record<string, unknown> {
  return strip(repo) as Record<string, unknown>
}

/** starred_at 은 ISO 8601 문자열로 온다. 인덱싱용 unix epoch(초)로 바꾼다. */
export function epochOf(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`starred_at 파싱 실패: ${iso}`)
  return Math.floor(ms / 1000)
}
