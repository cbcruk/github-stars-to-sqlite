import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // 서버리스 함수 번들에 stars.db 를 강제로 포함한다. import 되지 않는
  // 바이너리라 명시하지 않으면 트레이싱이 놓친다. omoji(c7676dc)가 밟은 길과
  // 같은 방법이되, 이쪽은 네이티브 바인딩이 아니라 node:sqlite 로 읽는다.
  // 루트의 bun.lock 때문에 트레이싱 루트가 저장소 루트로 잡히면 standalone
  // 레이아웃과 Vercel 번들 경로가 달라진다. demo/ 로 못박아 둘을 일치시킨다.
  outputFileTracingRoot: here,
  outputFileTracingIncludes: {
    '/**': ['./stars.db'],
  },
  // standalone 은 로컬에서 "Vercel 이 무엇을 번들에 넣는가"를 그대로 재현하는
  // 검증 수단이다. .next/standalone 에 stars.db 가 들어가는지로 판정한다.
  output: 'standalone',
}

export default nextConfig
