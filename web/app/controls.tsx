'use client'

import { useEffect, useRef, useState } from 'react'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton'
import { OverflowList } from '@astryxdesign/core/OverflowList'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { useUrlState } from './url-state'
import type { Facet } from '@/lib/queries'

export type Chip = { key: string; label: string; n: number }

// 첫 항목이 기본값이다. 기본값은 URL 에 남기지 않는다.
const SORTS = [
  { value: 'recent', label: '최근 star순' },
  { value: 'stars', label: '스타순' },
  { value: 'name', label: '이름순' },
]
const DEFAULT_SORT = SORTS[0].value

export function Controls({ langs, chips }: { langs: Facet[]; chips: Chip[] }) {
  const { params, set } = useUrlState()
  const [q, setQ] = useState(params.get('q') ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 타이핑마다 서버로 왕복하지 않도록 220ms 만 미뤄서 URL 을 민다.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => set({ q }), 220)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const cat = params.get('cat') ?? ''
  const options = [{ value: '', label: '모든 언어' }].concat(
    langs.map((l) => ({ value: l.key, label: `${l.key} · ${l.n}` })),
  )

  return (
    <VStack gap={4}>
      {/* 검색과 두 셀렉터가 한 줄, 도메인 칩이 그 아래 한 줄을 통째로 쓴다.
          칩이 열 개라 셀렉터와 폭을 나누면 마지막 칩이 넘쳐 흐른다. */}
      <HStack gap={3} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <TextInput
            label="검색"
            isLabelHidden
            placeholder="이름 · 설명 · 저자로 검색…"
            value={q}
            onChange={setQ}
            startIcon="search"
            size="lg"
            hasClear
          />
        </StackItem>
        <Selector
          label="언어"
          isLabelHidden
          options={options}
          value={params.get('lang') ?? ''}
          onChange={(v) => set({ lang: v ?? '' })}
          size="lg"
        />
        <Selector
          label="정렬"
          isLabelHidden
          options={SORTS}
          value={params.get('sort') ?? DEFAULT_SORT}
          onChange={(v) => set({ sort: v === DEFAULT_SORT ? '' : (v ?? '') })}
          size="lg"
        />
      </HStack>
      <ToggleButtonGroup
        label="도메인으로 거르기"
        value={cat}
        onChange={(v) => set({ cat: typeof v === 'string' ? v : '' })}
      >
        <OverflowList
          gap={1}
          behavior="observeParent"
          overflowRenderer={(hidden) => (
            <DropdownMenu
              button={{ label: `+${hidden.length}`, variant: 'ghost', size: 'lg' }}
              items={hidden.map(({ index }) => ({
                label: `${chips[index].label} · ${chips[index].n}`,
                onClick: () => set({ cat: chips[index].key }),
              }))}
            />
          )}
        >
          {chips.map((c) => (
            <ToggleButton key={c.key} value={c.key} label={`${c.label} · ${c.n}`} size="lg" />
          ))}
        </OverflowList>
      </ToggleButtonGroup>
    </VStack>
  )
}
