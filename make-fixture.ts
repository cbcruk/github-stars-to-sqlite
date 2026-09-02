// 네트워크 없이 파이프라인을 확인하기 위한 합성 별표 목록.
// 실제 응답과 같은 모양이어야 normalize 가 지우는 URL 템플릿까지 검증된다.
//
//   bun make-fixture.ts && bun src/cli.ts test.db --from fixture.json

const TEMPLATE_URLS = [
  'forks', 'keys{/key_id}', 'collaborators{/collaborator}', 'teams', 'hooks',
  'issue_events{/number}', 'events', 'assignees{/user}', 'branches{/branch}',
  'tags', 'git/blobs{/sha}', 'git/tags{/sha}', 'git/refs{/sha}', 'git/trees{/sha}',
  'statuses/{sha}', 'languages', 'stargazers', 'contributors', 'subscribers',
  'subscription', 'commits{/sha}', 'git/commits{/sha}', 'comments{/number}',
  'issues/comments{/number}', 'contents/{+path}', 'compare/{base}...{head}',
  'merges', '{archive_format}{/ref}', 'downloads', 'issues{/number}',
  'pulls{/number}', 'milestones{/number}', 'notifications{?since,all,participating}',
  'labels{/name}', 'releases{/id}', 'deployments',
]

const urlKey = (path: string) =>
  `${path.split('/')[0].split('{')[0].replace(/\+|\.\.\./g, '') || 'archive'}_url`

const REPOS = [
  { name: 'ripgrep',  owner: 'BurntSushi', lang: 'Rust',       topics: ['cli', 'search'], license: 'MIT',        stars: 52000, archived: false, fork: false, homepage: '' },
  { name: 'zod',      owner: 'colinhacks', lang: 'TypeScript', topics: ['validation', 'typescript'], license: 'MIT', stars: 38000, archived: false, fork: false, homepage: 'https://zod.dev' },
  { name: 'moment',   owner: 'moment',     lang: 'JavaScript', topics: [],                license: 'MIT',        stars: 48000, archived: true,  fork: false, homepage: 'https://momentjs.com' },
  { name: 'sqlite',   owner: 'sqlite',     lang: 'C',          topics: ['database'],      license: null,         stars: 7000,  archived: false, fork: false, homepage: null },
  { name: 'linux',    owner: 'torvalds',   lang: 'C',          topics: [],                license: 'NOASSERTION', stars: 180000, archived: false, fork: true,  homepage: null },
]

const t0 = Date.parse('2026-01-01T00:00:00Z')

const stars = REPOS.map((r, i) => {
  const fullName = `${r.owner}/${r.name}`
  const api = `https://api.github.com/repos/${fullName}`
  const ownerApi = `https://api.github.com/users/${r.owner}`

  const repo: Record<string, unknown> = {
    id: 100 + i,
    node_id: `R_kgDO${i}`,
    name: r.name,
    full_name: fullName,
    private: false,
    owner: {
      login: r.owner,
      id: 900 + i,
      node_id: `U_kgDO${i}`,
      avatar_url: `https://avatars.githubusercontent.com/u/${900 + i}?v=4`,
      gravatar_id: '',
      url: ownerApi,
      html_url: `https://github.com/${r.owner}`,
      followers_url: `${ownerApi}/followers`,
      repos_url: `${ownerApi}/repos`,
      type: 'User',
      site_admin: false,
    },
    html_url: `https://github.com/${fullName}`,
    description: `${r.name} 설명`,
    fork: r.fork,
    url: api,
    ...Object.fromEntries(TEMPLATE_URLS.map((p) => [urlKey(p), `${api}/${p}`])),
    created_at: '2015-06-01T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
    pushed_at: r.archived ? '2020-09-30T00:00:00Z' : '2026-09-01T00:00:00Z',
    git_url: `git://github.com/${fullName}.git`,
    ssh_url: `git@github.com:${fullName}.git`,
    clone_url: `https://github.com/${fullName}.git`,
    svn_url: `https://github.com/${fullName}`,
    homepage: r.homepage,
    size: 1000 + i * 137,
    stargazers_count: r.stars,
    watchers_count: r.stars,
    language: r.lang,
    has_issues: true,
    forks_count: Math.floor(r.stars / 20),
    mirror_url: null,
    archived: r.archived,
    disabled: false,
    open_issues_count: i * 3,
    license: r.license && {
      key: r.license.toLowerCase(),
      name: `${r.license} License`,
      spdx_id: r.license,
      url: `https://api.github.com/licenses/${r.license.toLowerCase()}`,
      node_id: 'MDc6TGljZW5zZTEz',
    },
    topics: r.topics,
    visibility: 'public',
    forks: Math.floor(r.stars / 20),
    open_issues: i * 3,
    watchers: r.stars,
    default_branch: 'main',
    permissions: { admin: false, maintain: false, push: false, triage: false, pull: true },
  }

  return { starred_at: new Date(t0 + i * 86400_000).toISOString(), repo }
})

await Bun.write('fixture.json', JSON.stringify(stars, null, 2))
console.log(`fixture.json 생성 (repo ${stars.length})`)

export {}
