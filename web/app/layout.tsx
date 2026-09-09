import type { Metadata } from 'next'
import { AppTheme } from './theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Star Index',
  description: 'cbcruk 의 GitHub 별표를 서버에서 직접 검색',
}

// 폰트는 테마가 갖는다. neutral 은 시스템 폰트라 웹폰트 요청이 없다.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppTheme>{children}</AppTheme>
      </body>
    </html>
  )
}
