'use client'

import { Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { useUrlState } from './url-state'

export type Segment = {
  /** 필터로 걸 언어. 빈 문자열이면 '기타' 라 누를 수 없다. */
  key: string
  label: string
  hue: string
  n: number
}

/**
 * 컬렉션의 모양. 언어는 repo 당 0 또는 1개라 겹치지 않고, 폭이 곧 비중이다.
 * 예전에는 우리가 지어낸 도메인을 그렸는데, 절반 가까이가 여러 도메인에 걸려서
 * 대표를 배열 순서로 갈랐다 — 측정값처럼 보이지만 사실은 우리 순서였다.
 * 언어는 GitHub 이 정하고 겹치지 않으므로 그런 주장을 하지 않아도 된다.
 *
 * 여기가 이 앱에서 유일하게 컴포넌트 대신 DOM 을 직접 쓰는 곳이다. 비율로
 * 늘어나는 막대에 해당하는 컴포넌트가 없다(ProgressBar 는 값 하나짜리다).
 * 이 프로젝트에는 StyleX 컴파일러가 없어 xstyle 도 못 쓰므로, Astryx 가
 * 문서에서 허용하는 마지막 경로인 style + 토큰 var() 로만 칠한다 — 색·간격·
 * 반경에 raw 값이 없고, flexGrow 만 데이터에서 온다.
 */
export function Spectrum({ segments, active }: { segments: Segment[]; active: string }) {
  const { set } = useUrlState()

  return (
    <VStack gap={2}>
      <HStack justify="between" align="end" gap={4} wrap="wrap">
        <Text type="label" color="secondary">
          언어 분포
        </Text>
        <Text type="supporting">눌러서 언어로 걸러보기</Text>
      </HStack>
      <div
        style={{
          display: 'flex',
          overflow: 'hidden',
          height: 'var(--spacing-6)',
          borderRadius: 'var(--radius-container)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-background-muted)',
        }}
      >
        {segments.map((s) => {
          const isActive = !!s.key && active === s.key
          const clickable = !!s.key
          return (
            <button
              key={s.label}
              type="button"
              disabled={!clickable}
              title={`${s.label} · ${s.n.toLocaleString()}`}
              aria-label={
                clickable
                  ? `${s.label} 언어로 거르기 · ${s.n}개`
                  : `${s.label} · ${s.n}개`
              }
              aria-pressed={clickable ? isActive : undefined}
              onClick={() => clickable && set({ lang: isActive ? '' : s.key })}
              style={{
                flexGrow: s.n,
                flexBasis: 0,
                border: 'none',
                padding: 0,
                cursor: clickable ? 'pointer' : 'default',
                background: `var(--color-icon-${s.hue})`,
                opacity: !active || isActive ? 1 : 0.25,
                outlineOffset: 'calc(-1 * var(--spacing-0-5))',
                outline: isActive ? '2px solid var(--color-text-primary)' : 'none',
              }}
            />
          )
        })}
      </div>
    </VStack>
  )
}
