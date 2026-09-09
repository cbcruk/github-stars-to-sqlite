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
  languageShape,
  languages,
  matches,
  search,
  topics as topicFacets,
  total,
  PAGE_SIZE,
  type Repo,
} from '@/lib/queries'
import { hueOf, type Hue } from './hues'
import { Controls } from './controls'
import { Spectrum } from './spectrum'

export const dynamic = 'force-dynamic'

type SP = Promise<{ q?: string; lang?: string; topic?: string; sort?: string }>

/** 카드에 다는 토픽 수. 많은 저장소는 열 개도 달고 있어서 카드가 무너진다. */
const CARD_TOPICS = 4

function stars(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function RepoCard({ repo, hue }: { repo: Repo; hue: Hue | undefined }) {
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
          {/* 언어 토큰의 색은 스펙트럼의 그 언어 칸과 같다. */}
          {repo.language ? (
            <Token size="sm" label={repo.language} color={hue ?? 'default'} />
          ) : null}
          {repo.topics.slice(0, CARD_TOPICS).map((t) => (
            <Token key={t} size="sm" label={t} color="default" />
          ))}
          {repo.archived ? <Badge label="archived" variant="warning" /> : null}
        </HStack>
      </VStack>
    </ClickableCard>
  )
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { q = '', lang = '', topic = '', sort = 'recent' } = await searchParams
  const query = q.trim()

  // 질의는 전부 서버에서 동기적으로 돈다. node:sqlite 는 sync API 라 await 이
  // 없고, 클라이언트로 내려가는 건 결과 행과 집계뿐이다.
  const rows = search(query, lang, topic, sort)
  const found = matches(query, lang, topic)
  const count = total()
  const langs = languages()
  const chips = topicFacets()
  const { named, rest } = languageShape()

  // 스펙트럼 순서가 곧 색 순서이고, 카드의 언어 토큰이 같은 색을 쓴다.
  const hues = new Map<string, Hue>(named.map((l, i) => [l.key, hueOf(i)]))
  const segments = named
    .map((l, i) => ({ key: l.key, label: l.key, hue: hueOf(i), n: l.n }))
    .concat(rest > 0 ? [{ key: '', label: '기타', hue: 'gray' as const, n: rest }] : [])

  const filtered = Boolean(query || lang || topic)

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
                  별표 {count.toLocaleString()}개를 GitHub 이 달아둔 언어와 토픽으로 훑는
                  목록
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
            <Spectrum segments={segments} active={lang} />
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={5}>
            <Controls langs={langs} topics={chips} />

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
                  <RepoCard
                    key={r.full_name}
                    repo={r}
                    hue={r.language ? hues.get(r.language) : undefined}
                  />
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
              언어와 토픽은 GitHub 이 갖고 있는 값을 그대로 쓴다. 우리가 도메인을 지어내
              붙이지 않는다 — 애매한 저장소를 어디에 넣을지는 사람도 쉽게 정하지 못하고,
              한번 정하면 틀린 걸 알아챌 방법이 없기 때문이다. 분류가 필요해지는 질문이
              생기면 그때 <Text type="code">repo_category</Text> 로 내려가서 만든다.
            </Text>
            <Text type="supporting">
              데이터: 커밋된 stars.db 스냅샷을 node:sqlite 로 immutable 읽기 · 상태는
              URL(?q &amp;lang &amp;topic &amp;sort)이 보관 ·{' '}
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
