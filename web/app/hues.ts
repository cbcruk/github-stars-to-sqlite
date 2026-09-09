/**
 * 스펙트럼 칸과 카드의 언어 토큰이 같은 색을 쓰도록 하나로 모아 둔다.
 * 파이썬 칸이 시안이면 파이썬 카드의 언어 토큰도 시안이다.
 *
 * Astryx 가 주는 색 계열은 열 개다. 스펙트럼도 상위 9개 + 기타로 열 칸이라
 * 색이 겹치지 않는다. 기타는 항상 gray 다.
 */
export const HUES = [
  'blue',
  'green',
  'orange',
  'purple',
  'red',
  'cyan',
  'yellow',
  'pink',
  'teal',
] as const

export type Hue = (typeof HUES)[number] | 'gray'

/** 스펙트럼 순서(= 저장소 수 내림차순)가 곧 색 순서다. */
export function hueOf(index: number): Hue {
  return HUES[index % HUES.length]
}
