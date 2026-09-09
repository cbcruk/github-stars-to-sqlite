'use client'

import { Theme } from '@astryxdesign/core'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

// 테마 객체는 RSC 경계를 넘기지 않는다. 클라이언트에서 직접 import 해야
// 직렬화가 걸리지 않는다. /built + theme.css 조합이라 런타임 주입도 없다.
export function AppTheme({ children }: { children: React.ReactNode }) {
  return <Theme theme={neutralTheme}>{children}</Theme>
}
