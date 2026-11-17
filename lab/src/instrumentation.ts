/**
 * Langfuse 로 트레이스를 보내는 OpenTelemetry 설정. 진입점에서 가장 먼저 import 한다.
 *
 * 키(LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY)가 없으면 SDK 를 켜지 않는다. 그때도
 * `startActiveObservation` 등은 no-op 으로 돌아가므로 오프라인 확인이 된다.
 * CLI 는 짧게 끝나므로 끝날 때 반드시 `shutdown()` 으로 남은 span 을 비운다.
 */
import { NodeSDK } from '@opentelemetry/sdk-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'

export const tracingEnabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)

const processor = tracingEnabled ? new LangfuseSpanProcessor() : null
const sdk = processor ? new NodeSDK({ spanProcessors: [processor] }) : null
sdk?.start()

/** 남은 span 을 지금 보낸다. 트레이스 id 를 곧바로 다른 API(어노테이션 큐 등)에 넘길 때 쓴다. */
export async function flush(): Promise<void> {
  await processor?.forceFlush()
}

export async function shutdown(): Promise<void> {
  await sdk?.shutdown()
}
