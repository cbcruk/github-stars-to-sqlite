/**
 * 분류 모델 호출. 공급자는 환경 변수로 고른다(위가 먼저).
 *
 *   LLM_BASE_URL=fake            네트워크 없이 호출한 쪽이 준 고정 응답 (파이프라인 확인용)
 *   LLM_BASE_URL=<url>           OpenAI 호환 chat completions (Ollama 등). LLM_MODEL, LLM_API_KEY
 *   ANTHROPIC_API_KEY            Claude (공식 SDK). 모델은 LLM_MODEL, 기본 claude-opus-5-5
 *   (아무것도 없음)               fake
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type ChatResult = {
  /** 모델이 낸 JSON 문자열. 검사는 classify.ts 의 parseClassification 이 한다. */
  content: string
  model: string
  usage: Record<string, number> | null
}

type Provider = 'fake' | 'openai' | 'anthropic'

const provider: Provider = process.env.LLM_BASE_URL
  ? process.env.LLM_BASE_URL === 'fake'
    ? 'fake'
    : 'openai'
  : process.env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : 'fake'

const DEFAULT_MODEL: Record<Provider, string> = { fake: 'fake', openai: 'qwen3:8b', anthropic: 'claude-opus-5-5' }

export const llmConfig = {
  provider,
  model: process.env.LLM_MODEL ?? DEFAULT_MODEL[provider],
  /** generation 에 기록하는 호출 설정. 공급자마다 다르다. */
  modelParameters: (provider === 'anthropic'
    ? { effort: 'low', max_tokens: 4096 }
    : { temperature: 0 }) as Record<string, string | number>,
  label: provider === 'openai' ? `${process.env.LLM_BASE_URL} / ${process.env.LLM_MODEL ?? DEFAULT_MODEL.openai}` : provider,
}

/**
 * 무엇을 받을지. Claude 는 schema 로 구조화 출력을 강제하고, OpenAI 호환은 JSON 모드만 건다
 * (검사는 호출한 쪽이 한다). fake 는 네트워크 없이 이 값을 그대로 돌려준다.
 */
export type OutputSpec = { schema: z.ZodType; fake: unknown; model?: string }

export function chat(messages: ChatMessage[], output: OutputSpec): Promise<ChatResult> {
  const model = output.model ?? llmConfig.model
  switch (provider) {
    case 'fake':
      return Promise.resolve({ content: JSON.stringify(output.fake), model: 'fake', usage: { input: 0, output: 0 } })
    case 'openai':
      return openAiChat(messages, model)
    case 'anthropic':
      return claudeChat(messages, output.schema, model)
  }
}

// --- Claude ---------------------------------------------------------------

let anthropic: Anthropic | null = null

async function claudeChat(messages: ChatMessage[], schema: z.ZodType, model: string): Promise<ChatResult> {
  // SDK 도 OpenTelemetry span(anthropic.messages.create)을 내보낸다. Langfuse 는 그것도 generation 으로
  // 집계하므로 그대로 두면 토큰·비용이 두 번 잡힌다. 기록은 classify.ts 의 llm generation 하나로 한다.
  anthropic ??= new Anthropic({ openTelemetry: false })
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const response = await anthropic.beta.messages.parse({
    model,
    max_tokens: 4096,
    system,
    messages: turns,
    output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
    // 안전 분류기가 거절하면 서버가 대체 모델로 다시 돌린다. 공개 저장소 메타데이터라 드물다.
    // Haiku 에는 서버 쪽 대체가 없어 보내지 않는다.
    ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude 거절: ${response.stop_details?.category ?? 'unknown'}`)
  }
  if (response.stop_reason === 'max_tokens') throw new Error('max_tokens 에 걸려 출력이 잘렸다')
  if (!response.parsed_output) throw new Error('구조화 출력이 비었다')

  const u = response.usage
  return {
    content: JSON.stringify(response.parsed_output),
    model: response.model,
    usage: {
      input: u.input_tokens,
      output: u.output_tokens,
      ...(u.cache_read_input_tokens ? { cache_read_input_tokens: u.cache_read_input_tokens } : {}),
    },
  }
}

// --- OpenAI 호환 ------------------------------------------------------------

type Completion = {
  model?: string
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

async function openAiChat(messages: ChatMessage[], model: string): Promise<ChatResult> {
  const apiKey = process.env.LLM_API_KEY
  const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
      stream: false,
    }),
  })
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)

  const body = (await res.json()) as Completion
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('LLM 응답에 choices[0].message.content 가 없다')

  const u = body.usage
  return {
    content,
    model: body.model ?? model,
    usage: u ? { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0 } : null,
  }
}
