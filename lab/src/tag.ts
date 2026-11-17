import { startActiveObservation } from '@langfuse/tracing'
import { z } from 'zod'
import { generate } from './generate.ts'
import { TAG_PROMPT } from './prompt.ts'
import type { RepoInput } from './repos.ts'

/** 태그 예측. primary 가 null 이면 대표 태그를 고르지 않은 것(토픽 기준선). */
export type Tagging = { primary: string | null; tags: string[]; assumptions: string[] }

const TagSchema = z.object({
  primary: z.string(),
  tags: z.array(z.string()),
  assumptions: z.array(z.string()),
})

/** 모델 출력을 검사한다. 빈 태그는 버리고, primary 가 tags 에 없으면 앞에 넣는다. */
export function parseTagging(content: string): Tagging {
  const raw = TagSchema.partial().parse(JSON.parse(content))
  const tags = [...new Set((raw.tags ?? []).map((t) => t.trim()).filter(Boolean))]
  const primary = raw.primary?.trim() || tags[0] || null
  if (primary && !tags.includes(primary)) tags.unshift(primary)
  return { primary, tags, assumptions: raw.assumptions ?? [] }
}

/** 기준선: GitHub 토픽을 그대로 태그로 본다. 토픽은 정렬돼 있어 대표를 고를 근거가 없다. */
export function topicsAsTags(repo: RepoInput): Tagging {
  return { primary: null, tags: repo.topics, assumptions: [] }
}

/** 저장소 하나 = 트레이스 하나 (tag-repo > llm). */
export async function tag(repo: RepoInput, metadata: Record<string, unknown> = {}): Promise<Tagging> {
  return (await tagTraced(repo, metadata)).result
}

/** tag 와 같고, 사람 평가(어노테이션 큐)에 넣을 트레이스 id 도 돌려준다. */
export function tagTraced(repo: RepoInput, metadata: Record<string, unknown> = {}): Promise<{ result: Tagging; traceId: string }> {
  return startActiveObservation('tag-repo', async (span) => {
    span.update({ input: repo, metadata })
    const content = await generate(
      'llm',
      TAG_PROMPT,
      { repo: JSON.stringify(repo) },
      { schema: TagSchema, fake: { primary: 'fake', tags: ['fake'], assumptions: ['fake 응답'] } },
    )
    const result = parseTagging(content)
    span.update({ output: result })
    return { result, traceId: span.traceId }
  })
}
