#!/usr/bin/env node
/**
 * 검증: production 태그 프롬프트가 처음 보는 저장소에도 통하나. 정답을 새로 적는 대신
 * 사람이 Langfuse 어노테이션 큐에서 출력을 좋음 / 애매 / 나쁨으로 매긴다.
 *
 * 큐에는 두 무리를 섞어 넣는다. 어느 쪽인지 화면에 드러나지 않는다(같은 메타데이터, 섞인 순서).
 *   new   labels.json 에 없는 저장소 — 프롬프트를 고칠 때 못 본 것
 *   seen  labels.json 에 있는 저장소 — 프롬프트를 이것들을 보고 고쳤다
 * 두 무리의 "좋음" 비율 차이가 곧 labels.json 점수가 얼마나 낙관적인지다.
 *
 *   node src/holdout.ts create ../stars.db [--new-per-stratum 8] [--seen-per-stratum 4]
 *   node src/holdout.ts report
 *
 * 어떤 저장소가 어느 무리인지는 holdout.json 에 남긴다(커밋). 큐 화면에서는 안 본다.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { flush, shutdown } from './instrumentation.ts'
import { openDb } from '@stars/core'
import { readLabels, type Stratum } from './labels.ts'
import { requireLangfuse } from './langfuse.ts'
import { allRepos, inputOf, type Repo } from './repos.ts'
import { tagTraced } from './tag.ts'

const QUEUE_NAME = 'stars-tag-holdout'
const SCORE_NAME = 'tag_quality'
const CATEGORIES = [
  { value: 1, label: '좋음' },
  { value: 0.5, label: '애매' },
  { value: 0, label: '나쁨' },
]

type Group = 'new' | 'seen'
type HoldoutItem = { repo: string; group: Group; stratum: Stratum; traceId: string }

const HOLDOUT_PATH = new URL('../holdout.json', import.meta.url).pathname
const LABELS_PATH = new URL('../labels.json', import.meta.url).pathname

const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = (name: string, fallback: string) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]!
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const stratumOf = (r: Repo): Stratum =>
  r.keyword.categories.length === 0 ? 'keyword-none' : r.keyword.categories.length === 1 ? 'keyword-single' : 'keyword-multi'
const STRATA: Stratum[] = ['keyword-single', 'keyword-multi', 'keyword-none']

const langfuse = requireLangfuse()

async function ensureScoreConfig(): Promise<string> {
  const existing = await langfuse.api.scoreConfigs.get({ limit: 100 })
  const found = existing.data.find((c) => c.name === SCORE_NAME && !c.isArchived)
  if (found) return found.id
  const created = await langfuse.api.scoreConfigs.create({
    name: SCORE_NAME,
    dataType: 'CATEGORICAL',
    categories: CATEGORIES,
    description: '태그가 이 저장소를 다시 찾을 때 쓸 만한가. 좋음: 그대로 쓰겠다 / 애매: 하나쯤 고치겠다 / 나쁨: 다시 붙이겠다',
  })
  return created.id
}

async function ensureQueue(configId: string): Promise<string> {
  const queues = await langfuse.api.annotationQueues.listQueues({ limit: 100 })
  const found = queues.data.find((q) => q.name === QUEUE_NAME)
  if (found) return found.id
  const created = await langfuse.api.annotationQueues.createQueue({
    name: QUEUE_NAME,
    description: 'stars-tag production 출력을 사람이 매긴다. 어느 저장소가 프롬프트 수정에 쓰였는지는 일부러 숨겼다',
    scoreConfigIds: [configId],
  })
  return created.id
}

async function create(dbPath: string) {
  if (existsSync(HOLDOUT_PATH)) {
    console.error(`${HOLDOUT_PATH} 가 이미 있다. 다시 뽑으려면 지우고 큐도 비운다`)
    process.exit(1)
  }
  const newPer = Number(opt('--new-per-stratum', '8'))
  const seenPer = Number(opt('--seen-per-stratum', '4'))

  const db = openDb(dbPath, { readonly: true })
  const repos = allRepos(db)
  db.close()
  const byName = new Map(repos.map((r) => [r.fullName, r]))
  const labels = readLabels(LABELS_PATH).filter((l) => l.primary !== null)
  const labeled = new Set(labels.map((l) => l.repo))

  // sample.ts 와 다른 순서(접두어)로 뽑아 labels.json 의 다음 순번에 몰리지 않게 한다
  const order = (name: string) => hash(`holdout:${name}`)
  const picks: Array<{ repo: Repo; group: Group; stratum: Stratum }> = []
  for (const stratum of STRATA) {
    const fresh = repos
      .filter((r) => stratumOf(r) === stratum && !labeled.has(r.fullName))
      .sort((a, b) => order(a.fullName).localeCompare(order(b.fullName)))
      .slice(0, newPer)
    const seen = labels
      .filter((l) => l.stratum === stratum && byName.has(l.repo))
      .sort((a, b) => order(a.repo).localeCompare(order(b.repo)))
      .slice(0, seenPer)
    picks.push(...fresh.map((repo) => ({ repo, group: 'new' as const, stratum })))
    picks.push(...seen.map((l) => ({ repo: byName.get(l.repo)!, group: 'seen' as const, stratum })))
  }
  // 큐 순서로 무리가 드러나지 않게 섞는다
  picks.sort((a, b) => hash(`queue:${a.repo.fullName}`).localeCompare(hash(`queue:${b.repo.fullName}`)))

  const items: HoldoutItem[] = []
  for (let i = 0; i < picks.length; i += 4) {
    const batch = await Promise.all(
      picks.slice(i, i + 4).map(async (p) => {
        const { traceId } = await tagTraced(inputOf(p.repo), { experiment: 'holdout-review' })
        return { repo: p.repo.fullName, group: p.group, stratum: p.stratum, traceId }
      }),
    )
    items.push(...batch)
    process.stdout.write(`\r태그 ${items.length}/${picks.length}`)
  }
  console.log()
  // 트레이스가 Langfuse 에 도착한 뒤 큐에 넣는다
  await flush()

  const queueId = await ensureQueue(await ensureScoreConfig())
  for (const it of items) {
    await langfuse.api.annotationQueues.createQueueItem(queueId, { objectId: it.traceId, objectType: 'TRACE' })
  }
  writeFileSync(HOLDOUT_PATH, JSON.stringify(items, null, 2) + '\n')

  const projects = await langfuse.api.projects.get()
  const projectId = projects.data[0]?.id
  const base = (process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com').replace(/\/$/, '')
  console.log(`큐 ${QUEUE_NAME} 에 ${items.length}건 (new ${items.filter((i) => i.group === 'new').length}, seen ${items.filter((i) => i.group === 'seen').length})`)
  console.log(`${base}/project/${projectId}/annotation-queues/${queueId}`)
}

async function report() {
  const items = JSON.parse(readFileSync(HOLDOUT_PATH, 'utf8')) as HoldoutItem[]
  const byTrace = new Map(items.map((i) => [i.traceId, i]))
  const scores = new Map<string, number>()
  let cursor: string | undefined
  do {
    // 트레이스 id 는 subject 묶음에 있다. 범주형 점수의 value 는 숫자가 아니라 라벨("좋음")로 온다
    const page = await langfuse.api.scores.getMany({ name: SCORE_NAME, fields: 'subject', limit: 100, ...(cursor ? { cursor } : {}) })
    for (const s of page.data as unknown as Array<Record<string, unknown>>) {
      const subject = s.subject as { kind?: string; id?: string } | undefined
      const traceId = (s.traceId as string | undefined) ?? (subject?.kind === 'trace' ? subject.id : undefined)
      const value = typeof s.value === 'number' ? s.value : CATEGORIES.find((c) => c.label === s.value)?.value
      if (traceId && byTrace.has(traceId) && value !== undefined) scores.set(traceId, value)
    }
    cursor = (page.meta as { cursor?: string } | undefined)?.cursor
  } while (cursor)

  console.log(`매긴 것 ${scores.size}/${items.length}\n`)
  const row = (label: string, xs: HoldoutItem[]) => {
    const vs = xs.flatMap((i) => (scores.has(i.traceId) ? [scores.get(i.traceId)!] : []))
    const n = (v: number) => vs.filter((x) => x === v).length
    const mean = vs.length ? (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2) : '—'
    console.log(`${label.padEnd(16)} n=${String(vs.length).padStart(2)}  좋음 ${n(1)}  애매 ${n(0.5)}  나쁨 ${n(0)}  평균 ${mean}`)
  }
  for (const g of ['seen', 'new'] as Group[]) row(g, items.filter((i) => i.group === g))
  console.log()
  for (const s of STRATA) row(`new ${s.replace('keyword-', '')}`, items.filter((i) => i.group === 'new' && i.stratum === s))
}

try {
  if (cmd === 'create' && argv[1]) await create(argv[1])
  else if (cmd === 'report') await report()
  else {
    console.error('usage: node src/holdout.ts create <stars.db> [--new-per-stratum 8] [--seen-per-stratum 4] | report')
    process.exitCode = 1
  }
} finally {
  await shutdown()
}
