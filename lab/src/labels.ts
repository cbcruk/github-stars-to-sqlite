import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { CATEGORIES } from '@stars/core'

/**
 * 사람이 붙인 정답 한 건. 두 가지로 읽는다:
 *   도메인 실험(stars-labels): primary/categories 가 CATEGORIES id — completedLabels
 *   태그 실험(stars-tags):     primary/categories 가 자유 태그     — completedTagLabels
 * `labels.json` 이 원본이고 Langfuse 데이터셋은 그 사본이다.
 * primary 가 null 이면 아직 안 붙인 것 — 동기화에서 빠진다.
 * `context` 는 붙일 때 보라고 적어 둔 값이라 정답이 아니다. 키워드 결과는 일부러 넣지 않는다
 * (보면 거기에 끌려간다).
 */
export type Label = {
  repo: string
  stratum: Stratum
  primary: string | null
  categories: string[]
  note: string
  context: { description: string | null; topics: string[]; language: string | null }
}

/** 표본 층. 키워드가 하나만 건 것 / 여럿 건 것 / 하나도 못 건 것. */
export type Stratum = 'keyword-single' | 'keyword-multi' | 'keyword-none'

export const VALID = new Set([...CATEGORIES.map((c) => c.id), 'none'])

export function readLabels(path: string): Label[] {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Label[]) : []
}

export function writeLabels(path: string, labels: Label[]): void {
  writeFileSync(path, JSON.stringify(labels, null, 2) + '\n')
}

/** 다 붙인 정답만 돌려준다. 틀린 id 가 있으면 어느 건인지 모아 던진다. */
export function completedLabels(labels: Label[]): Label[] {
  const errors: string[] = []
  const done = labels.filter((l) => l.primary !== null)
  for (const l of done) {
    for (const id of [l.primary!, ...l.categories]) {
      if (!VALID.has(id)) errors.push(`${l.repo}: 모르는 도메인 ${id}`)
    }
    if (l.primary !== 'none' && !l.categories.includes(l.primary!)) {
      errors.push(`${l.repo}: primary(${l.primary}) 가 categories 에 없다`)
    }
    if (l.primary === 'none' && l.categories.length) errors.push(`${l.repo}: none 인데 categories 가 있다`)
  }
  if (errors.length) throw new Error(`labels.json 오류\n${errors.join('\n')}`)
  return done
}

/**
 * 태그로 읽는다. 정답 태그는 primary 와 categories 의 합집합이다 — 대표 태그만 적고
 * 목록에 다시 안 적는 경우가 있어서, 도메인 실험처럼 오류로 보지 않는다.
 */
export function tagsOf(l: Label): string[] {
  return [...new Set([l.primary!, ...l.categories])]
}

export function completedTagLabels(labels: Label[]): Label[] {
  const errors: string[] = []
  const done = labels.filter((l) => l.primary !== null)
  for (const l of done) {
    if (!l.primary!.trim()) errors.push(`${l.repo}: primary 가 비었다`)
  }
  if (errors.length) throw new Error(`labels.json 오류\n${errors.join('\n')}`)
  return done
}
