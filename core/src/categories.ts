/**
 * 별표 컬렉션을 도메인으로 가르는 키워드 휴리스틱.
 *
 * 여기가 유일한 정의고, `core/sql/views.sql` 의 생성 구간은 이 파일에서
 * `make-views.ts` 가 찍어낸다. 분류를 고칠 때는 이 파일만 고치고 다시 돌린다.
 *
 * 분류는 이름·설명·토픽을 이어 붙인 문자열에 대한 단어 단위 매칭이다. repo
 * 하나가 여러 도메인에 걸릴 수 있고(전체 소속은 `repo_category`), 대표 도메인은
 * CATEGORIES 순서에서 가장 먼저 걸린 것이다(`repo_primary_category`). 순서가
 * 곧 우선순위라 좁은 도메인을 앞에, 넓은 도메인을 뒤에 둔다 — react 가 ui 로
 * 먼저 걸려버리면 차트 라이브러리도 전부 ui 가 된다.
 */

/** Astryx 의 색 계열 이름. Token/ClickableCard 의 color·variant 로 그대로 간다. */
export type Hue =
  | 'blue' | 'cyan' | 'gray' | 'green' | 'orange'
  | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'

export type Category = {
  id: string
  label: string
  hue: Hue
  /**
   * 소문자 단어. 공백은 원문의 `-`/`_`/`.` 자리에도 맞는다(정규화가 전부
   * 공백으로 바꾸므로 `react-native` 는 `react native` 로 걸린다).
   * 끝의 `*` 는 접두 매칭이다 — `test*` 가 test/tests/testing 을 함께 잡는다.
   */
  keywords: string[]
}

/** 순서 = 우선순위. 앞이 좁고 뒤가 넓다. */
export const CATEGORIES: readonly Category[] = [
  {
    id: 'ai',
    label: 'AI',
    hue: 'purple',
    keywords: [
      'ai', 'llm', 'llms', 'gpt', 'gpt 4', 'chatgpt', 'openai', 'anthropic',
      'claude', 'gemini', 'ollama', 'langchain', 'rag', 'embedding*',
      'machine learning', 'deep learning', 'neural*', 'transformer*',
      'diffusion', 'stable diffusion', 'copilot', 'mcp', 'agentic',
    ],
  },
  {
    id: 'editor',
    label: '에디터 · 텍스트',
    hue: 'pink',
    keywords: [
      'editor', 'editors', 'wysiwyg', 'rich text', 'contenteditable',
      'prosemirror', 'codemirror', 'monaco', 'slate', 'lexical', 'tiptap',
      'quill', 'markdown', 'mdx', 'remark', 'rehype', 'syntax highlight*',
      'highlight js', 'prism', 'shiki', 'vim', 'neovim', 'emacs', 'vscode',
      'textarea', 'diff',
    ],
  },
  {
    id: 'viz',
    label: '시각화 · 그래픽',
    hue: 'cyan',
    keywords: [
      'chart', 'charts', 'charting', 'graph', 'graphs', 'plot', 'plots',
      'plotting', 'visualization', 'visualisation', 'dataviz', 'data viz',
      'd3', 'echarts', 'chartjs', 'visx', 'canvas', 'webgl', 'webgpu',
      'three js', 'shader*', 'svg', 'geospatial', 'cartograph*',
      'diagram*', 'animation', 'animations', 'motion', 'gsap',
      'easing', 'lottie', 'sprite*',
    ],
  },
  {
    id: 'test',
    label: '테스트',
    hue: 'green',
    keywords: [
      'test*', 'jest', 'vitest', 'mocha', 'jasmine', 'karma', 'playwright',
      'puppeteer', 'cypress', 'selenium', 'webdriver', 'e2e', 'mock*',
      'stub*', 'fixture*', 'assertion*', 'coverage', 'snapshot testing',
      'benchmark*', 'fuzz*',
    ],
  },
  {
    id: 'cli',
    label: 'CLI · 터미널',
    hue: 'teal',
    keywords: [
      'cli', 'command line', 'commandline', 'terminal', 'tui', 'shell',
      'bash', 'zsh', 'fish', 'dotfiles', 'prompt', 'ansi', 'tty', 'curses',
      'scaffold*', 'generator', 'boilerplate', 'starter',
    ],
  },
  {
    id: 'build',
    label: '빌드 · 툴링',
    hue: 'yellow',
    keywords: [
      'bundler', 'bundling', 'webpack', 'rollup', 'vite', 'esbuild', 'swc',
      'parcel', 'turbopack', 'babel', 'compiler', 'transpil*',
      'eslint', 'lint*', 'prettier', 'formatter', 'monorepo',
      'workspace*', 'pnpm', 'yarn', 'package manager', 'build tool',
      'codemod', 'ast', 'minif*', 'tree shaking', 'polyfill*',
    ],
  },
  {
    id: 'native',
    label: '네이티브 · 모바일',
    hue: 'red',
    keywords: [
      'ios', 'android', 'swift', 'swiftui', 'objective c', 'kotlin', 'flutter',
      'react native', 'expo', 'electron', 'tauri', 'macos', 'windows', 'linux',
      'desktop', 'mobile', 'native', 'xcode', 'gtk', 'qt', 'wasm', 'webassembly',
    ],
  },
  {
    id: 'server',
    label: '서버 · 데이터',
    hue: 'blue',
    keywords: [
      'server', 'backend', 'api', 'rest', 'graphql', 'grpc', 'rpc', 'http',
      'https', 'websocket*', 'database', 'db', 'sql', 'sqlite', 'postgres*',
      'mysql', 'redis', 'mongodb', 'orm', 'query builder', 'migration*',
      'auth', 'authentication', 'oauth', 'jwt', 'session*', 'cache', 'caching',
      'queue', 'proxy', 'router', 'routing', 'serverless', 'docker',
      'kubernetes', 'deploy*', 'nginx', 'middleware',
    ],
  },
  {
    id: 'docs',
    label: '문서 · 학습',
    hue: 'gray',
    keywords: [
      'awesome', 'awesome list', 'curated', 'documentation', 'docs',
      'tutorial*', 'guide', 'guides', 'book', 'books', 'course', 'courses',
      'cheatsheet', 'cheat sheet', 'learn', 'learning', 'roadmap',
      'interview', 'interviews', 'example*', 'demo', 'demos', 'blog',
      'handbook', 'reference', 'spec', 'rfc',
    ],
  },
  {
    id: 'ui',
    label: 'UI · 컴포넌트',
    hue: 'orange',
    keywords: [
      'ui', 'ui kit', 'component', 'components', 'design system', 'react',
      'reactjs', 'vue', 'vuejs', 'svelte', 'angular', 'solid', 'preact',
      'headless', 'shadcn', 'radix', 'chakra', 'mui', 'material ui',
      'ant design', 'bootstrap', 'tailwind', 'tailwindcss', 'css', 'scss',
      'sass', 'css in js', 'styled components', 'emotion', 'stylex',
      'storybook', 'form', 'forms', 'modal', 'dialog', 'dropdown', 'tooltip',
      'accessibility', 'a11y', 'aria', 'layout', 'grid', 'flexbox', 'theme',
      'theming', 'dark mode', 'icon', 'icons', 'font', 'fonts', 'typography',
      'hooks', 'state management', 'frontend', 'web components',
    ],
  },
]

/** 영숫자가 아닌 문자 하나. GLOB 의 문자 클래스가 그대로 단어 경계가 된다. */
const EDGE = '[^a-z0-9]'

/** SQL 문자열 리터럴. node:sqlite 는 큰따옴표를 컬럼명으로 읽으므로 홑따옴표만 쓴다. */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/**
 * 키워드 하나를 GLOB 술어로.
 *
 * LIKE 로 단어 경계를 만들려면 haystack 쪽에서 구분자를 전부 공백으로 펴야 하고,
 * 그건 replace() 를 서른 번 겹치는 일이다. 그렇게 만든 뷰는 sqlite3 CLI 의 파서
 * 스택을 넘겨서 스키마를 아예 못 읽는다("parser stack overflow"). GLOB 은 문자
 * 클래스를 지원하므로 경계를 패턴 쪽에 적으면 된다 — 중첩이 사라지고, 키워드
 * 안의 공백도 `[^a-z0-9]` 로 바뀌어 `react-native`/`react native` 를 함께 잡는다.
 *
 * hay 는 lower() 된 뒤 양끝에 공백이 붙어 있으므로 문자열 처음과 끝도 경계다.
 */
function predicate(keyword: string): string {
  const prefix = keyword.endsWith('*')
  const word = prefix ? keyword.slice(0, -1) : keyword
  if (!/^[a-z0-9]+( [a-z0-9]+)*$/.test(word)) {
    throw new Error(`키워드는 소문자·숫자·공백만: ${keyword}`)
  }
  const body = word.split(' ').join(EDGE)
  return `hay GLOB ${lit(`*${EDGE}${body}${prefix ? '' : EDGE}*`)}`
}

/**
 * views.sql 의 생성 구간.
 *
 * `repo_text`(정규화된 검색 문자열)와 `repo_match`(GLOB 규칙)가 분류의 정의고,
 * `repo_category` 는 그걸 굳혀 둔 테이블이다. 규칙 뷰를 그대로 질의하면 repo
 * 하나마다 패턴 수백 개를 GLOB 으로 훑어 2초가 걸린다 — 요청마다 도는 web 에는
 * 못 쓴다. 정의는 뷰로 남겨 들여다볼 수 있게 두고, 읽기는 인덱스가 붙은 표로
 * 받는다. 표를 채우는 건 `make-views.ts` 다.
 */
export function categoryViewsSql(): string {
  const topics = `(SELECT group_concat(j.value, ' ') FROM json_each(s.data, '$.topics') j)`
  const raw = `lower(s.full_name || ' ' || coalesce(json_extract(s.data, '$.description'), '') || ' ' || coalesce(${topics}, ''))`

  const branches = CATEGORIES.map((c, i) => {
    const where = c.keywords.map(predicate).join('\n    OR ')
    return `SELECT repo_id, full_name, ${lit(c.id)} AS category, ${i + 1} AS ord\nFROM repo_text WHERE ${where}`
  }).join('\nUNION ALL\n')

  return `-- 이름·설명·토픽을 이어 붙인 검색용 문자열. 양끝의 공백이 문자열 처음·끝의
-- 단어 경계다. 구분자는 펴지 않는다 — 경계는 GLOB 패턴 쪽이 갖는다.
CREATE VIEW IF NOT EXISTS repo_text AS
SELECT
  s.repo_id,
  s.full_name,
  ' ' || ${raw} || ' ' AS hay
FROM star s
WHERE s.unstarred_sync IS NULL;

-- 분류의 정의. 느리지만 authoritative 다 — repo_category 는 이걸 굳힌 것이다.
-- repo 하나가 여러 도메인에 걸린다. ord 는 CATEGORIES 순서(= 우선순위).
CREATE VIEW IF NOT EXISTS repo_match AS
${branches};

-- 굳힌 분류. make-views.ts 가 repo_match 로 채운다.
CREATE TABLE IF NOT EXISTS repo_category (
  repo_id   INTEGER NOT NULL,
  full_name TEXT    NOT NULL,
  category  TEXT    NOT NULL,
  ord       INTEGER NOT NULL,
  PRIMARY KEY (repo_id, category)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS repo_category_category ON repo_category(category);

-- 대표 도메인. SQLite 는 min() 과 함께 쓴 bare column 을 그 최소 행에서 가져온다.
CREATE VIEW IF NOT EXISTS repo_primary_category AS
SELECT repo_id, full_name, category, min(ord) AS ord
FROM repo_category
GROUP BY repo_id;`
}

/** repo_match 를 repo_category 로 굳히는 SQL. 매번 통째로 다시 채운다. */
export const REFILL_CATEGORIES = `
DELETE FROM repo_category;
INSERT INTO repo_category (repo_id, full_name, category, ord)
SELECT repo_id, full_name, category, ord FROM repo_match;`
