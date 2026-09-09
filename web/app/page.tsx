import { CATEGORIES } from '@stars/core'
import { Layout, LayoutHeader, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text, Heading } from '@astryxdesign/core/Text'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Token } from '@astryxdesign/core/Token'
import { Badge } from '@astryxdesign/core/Badge'
import { Grid } from '@astryxdesign/core/Grid'
import { Center } from '@astryxdesign/core/Center'
import { Divider } from '@astryxdesign/core/Divider'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import {
  languages,
  matches,
  memberships,
  search,
  shape,
  total,
  PAGE_SIZE,
  type Repo,
} from '@/lib/queries'
import { Controls } from './controls'
import { Spectrum } from './spectrum'

export const dynamic = 'force-dynamic'

type SP = Promise<{ q?: string; lang?: string; cat?: string; sort?: string }>

const byId = new Map(CATEGORIES.map((c) => [c.id, c]))

function stars(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function RepoCard({ repo }: { repo: Repo }) {
  const name = repo.full_name.slice(repo.owner.length + 1)
  return (
    <ClickableCard href={repo.url} target="_blank" label={repo.full_name} padding={4}>
      <VStack gap={2} height="100%">
        <HStack gap={3} justify="between" align="start">
          <Text weight="semibold" wordBreak="break-word">
            <Text color="secondary">{repo.owner}/</Text>
            {name}
          </Text>
          <Text type="supporting" hasTabularNumbers textWrap="nowrap">
            ★ {stars(repo.stars)}
          </Text>
        </HStack>

        <StackItem size="fill">
          <Text type="supporting" maxLines={3} display="block">
            {repo.description ?? '설명 없음'}
          </Text>
        </StackItem>

        <HStack gap={2} wrap="wrap" vAlign="center">
          {repo.language ? <Text type="supporting">{repo.language}</Text> : null}
          {repo.categories.map((id) => {
            const c = byId.get(id)
            if (!c) return null
            // 대표 도메인만 색을 갖는다. 나머지는 "여기에도 걸린다"는 표시다.
            return (
              <Token
                key={id}
                size="sm"
                label={c.label}
                color={id === repo.category ? c.hue : 'default'}
              />
            )
          })}
          {repo.archived ? <Badge label="archived" variant="warning" /> : null}
        </HStack>
      </VStack>
    </ClickableCard>
  )
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { q = '', lang = '', cat = '', sort = 'stars' } = await searchParams
  const query = q.trim()

  // 질의는 전부 서버에서 동기적으로 돈다. node:sqlite 는 sync API 라 await 이
  // 없고, 클라이언트로 내려가는 건 결과 행과 집계뿐이다.
  const rows = search(query, lang, cat, sort)
  const found = matches(query, lang, cat)
  const count = total()
  const langs = languages()
  const segments = shape()
  const owned = memberships()

  const chips = CATEGORIES.filter((c) => owned.has(c.id)).map((c) => ({
    key: c.id,
    label: c.label,
    n: owned.get(c.id) ?? 0,
  }))

  const filtered = Boolean(query || lang || cat)

  return (
    <Layout
      contentWidth={1240}
      header={
        <LayoutHeader hasDivider padding={6}>
          <VStack gap={6}>
            <HStack justify="between" align="end" gap={6} wrap="wrap">
              <VStack gap={1}>
                <Text type="label" color="secondary">
                  github-stars-to-sqlite · RSC + node:sqlite
                </Text>
                <Heading level={1}>★ Star Index</Heading>
                <Text type="supporting">
                  별표 {count.toLocaleString()}개를 {CATEGORIES.length}개 도메인과{' '}
                  {langs.length}개 언어로 갈라 둔 목록
                </Text>
              </VStack>
              <VStack gap={0} align="end">
                <Text type="display-2" hasTabularNumbers>
                  {count.toLocaleString()}
                </Text>
                <Text type="label" color="secondary">
                  STARRED
                </Text>
              </VStack>
            </HStack>
            <Spectrum
              segments={segments.map((s) => ({
                key: s.key,
                label: byId.get(s.key)?.label ?? s.key,
                hue: byId.get(s.key)?.hue ?? 'gray',
                n: s.n,
              }))}
              active={cat}
            />
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={5}>
            <Controls langs={langs} chips={chips} />

            <HStack justify="between" vAlign="center" gap={4} wrap="wrap">
              <Text type="supporting">
                {found.toLocaleString()}개 일치
                {found > PAGE_SIZE ? ` · 상위 ${PAGE_SIZE}개 표시` : ''}
              </Text>
              {filtered ? <Button href="/" label="필터 초기화" variant="ghost" size="sm" /> : null}
            </HStack>

            <Divider />

            {rows.length === 0 ? (
              <Center>
                <VStack gap={3} align="center" padding={10}>
                  <Text weight="semibold">조건에 맞는 저장소가 없어요</Text>
                  <Text type="supporting">검색어나 필터를 넓혀보세요.</Text>
                  <Button href="/" label="필터 초기화" />
                </VStack>
              </Center>
            ) : (
              <Grid columns={{ minWidth: 320 }} gap={4}>
                {rows.map((r) => (
                  <RepoCard key={r.full_name} repo={r} />
                ))}
              </Grid>
            )}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider padding={6}>
          <VStack gap={2}>
            <Text type="supporting">
              분류는 저장소 이름·설명·토픽에 대한 키워드 휴리스틱이고, 대표 도메인은 그중
              먼저 걸린 하나다. 하나의 저장소가 여러 도메인에 속할 수 있어 카드의 토큰이
              전체 소속을 보여준다 — 경계는 사람이 다시 봐야 한다.
            </Text>
            <Text type="supporting">
              데이터: 커밋된 stars.db 스냅샷을 node:sqlite 로 immutable 읽기 · 상태는
              URL(?q &amp;lang &amp;cat &amp;sort)이 보관 ·{' '}
              <Link href="https://github.com/cbcruk?tab=stars" target="_blank">
                github.com/cbcruk?tab=stars
              </Link>
            </Text>
          </VStack>
        </LayoutFooter>
      }
    />
  )
}
