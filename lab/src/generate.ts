import { startObservation } from '@langfuse/tracing'
import { chat, llmConfig, type OutputSpec } from './llm.ts'
import { buildMessages, type PromptDef, type PromptRef } from './prompt.ts'

/**
 * 프롬프트 하나를 채워 모델을 부르고, 그 호출을 generation 으로 남긴다(모델·토큰·프롬프트 버전).
 * 현재 활성 span 아래에 붙으므로 부르는 쪽이 startActiveObservation 안에서 부른다.
 * 돌려주는 건 모델이 낸 JSON 문자열(검사는 부르는 쪽 몫)과 쓴 프롬프트 버전이다.
 */
export async function generate(
  name: string,
  def: PromptDef,
  vars: Record<string, string>,
  output: OutputSpec,
): Promise<{ content: string; prompt: PromptRef | null }> {
  const { messages, ref } = await buildMessages(def, vars)
  const generation = startObservation(
    name,
    {
      model: output.model ?? llmConfig.model,
      modelParameters: llmConfig.modelParameters,
      input: messages,
      ...(ref ? { prompt: ref } : {}),
    },
    { asType: 'generation' },
  )
  try {
    const res = await chat(messages, output)
    generation.update({ model: res.model, output: res.content, ...(res.usage ? { usageDetails: res.usage } : {}) })
    return { content: res.content, prompt: ref }
  } catch (err) {
    generation.update({ level: 'ERROR', statusMessage: (err as Error).message })
    throw err
  } finally {
    generation.end()
  }
}
