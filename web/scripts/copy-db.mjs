// 저장소 루트의 stars.db 를 web/ 로 복사한다.
// 앱은 자기 디렉터리의 stars.db 만 알면 되고(번들 포함이 단순해진다),
// 원본은 루트 하나로 유지된다. 복사본은 gitignore 한다.
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', 'stars.db')
const dest = join(here, '..', 'stars.db')

if (!existsSync(src)) {
  console.error(`[copy-db] 원본이 없다: ${src}`)
  process.exit(1)
}
copyFileSync(src, dest)
console.log(`[copy-db] stars.db ${(statSync(dest).size / 1048576).toFixed(2)}MB 복사됨`)
