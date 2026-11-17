import { LangfuseClient } from '@langfuse/client'
import { tracingEnabled } from './instrumentation.ts'

export const DATASET_NAME = 'stars-labels'
/** 같은 labels.json 을 자유 태그 정답으로 읽은 데이터셋 */
export const TAG_DATASET_NAME = 'stars-tags'

/** 데이터셋·실험·프롬프트 업로드는 Langfuse 없이는 의미가 없다. 키가 없으면 바로 멈춘다. */
export function requireLangfuse(): LangfuseClient {
  if (!tracingEnabled) {
    console.error('LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY 가 필요하다 (LANGFUSE_BASE_URL 은 기본 EU 클라우드)')
    process.exit(1)
  }
  return new LangfuseClient()
}
