import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // core 는 빌드 산물 없이 .ts 를 그대로 노출한다. Next 가 그걸 컴파일하도록.
  transpilePackages: ['@stars/core'],

  // Next 16 은 Turbopack 이 빌드 기본값이다. 모노레포에서 프로젝트 루트를
  // 명시하지 않으면 빌드와 next start 가 RSC 매니페스트 경로를 다르게 잡아
  // "Could not find ... in the React Client Manifest" 가 난다. 저장소 루트로
  // 못박아 next·core 호이스팅을 포함한 하나의 루트로 통일한다.
  turbopack: { root: join(here, '..') },

  // 모노레포 루트를 트레이싱 루트로 명시한다. next 와 워크스페이스 의존(core)이
  // 루트 node_modules 로 호이스팅되므로, 그 위에서 트레이스해야 번들이 완결된다.
  // Vercel 이 Root Directory=web 로 모노레포를 다루는 방식과도 일치한다.
  outputFileTracingRoot: join(here, '..'),

  // 서버리스 함수 번들에 stars.db 를 강제로 포함한다. import 되지 않는 바이너리라
  // 명시하지 않으면 트레이싱이 놓친다. omoji(c7676dc)가 밟은 길과 같은 방법이되,
  // 이쪽은 네이티브 바인딩이 아니라 node:sqlite 로 읽는다.
  outputFileTracingIncludes: {
    '/**': ['./stars.db'],
  },
}

export default nextConfig
