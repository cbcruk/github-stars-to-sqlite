#!/usr/bin/env node
/**
 * prompt.ts 의 프롬프트 하나(local)를 Langfuse 에 새 버전으로 올리고 production 라벨을 붙인다.
 * 이후 버전은 Langfuse UI 에서 고쳐도 된다 — 그때부터 원본은 Langfuse 다.
 *
 *   node src/push-prompt.ts --prompt classify|tag|judge [--message "변경 이유"]
 */
import { shutdown } from './instrumentation.ts'
import { requireLangfuse } from './langfuse.ts'
import { PROMPTS } from './prompt.ts'

const argv = process.argv.slice(2)
const i = argv.indexOf('--message')
const pi = argv.indexOf('--prompt')
const key = pi === -1 ? 'classify' : argv[pi + 1]
if (!key || !(key in PROMPTS)) {
  console.error(`--prompt 는 ${Object.keys(PROMPTS).join(' | ')}`)
  process.exit(1)
}
const def = PROMPTS[key as keyof typeof PROMPTS]
const langfuse = requireLangfuse()

const prompt = await langfuse.prompt.create({
  name: def.name,
  type: 'chat',
  prompt: def.local,
  labels: ['production'],
  ...(i === -1 ? {} : { commitMessage: argv[i + 1] }),
})
console.log(`${prompt.name} v${prompt.version} 올림 (production)`)
await shutdown()
