import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTag, tagF1Exact } from './evaluate.ts'
import { scoreJudgement } from './judge.ts'
import { parseTagging } from './tag.ts'

test('표기 맞추기: 대소문자·공백·복수 s', () => {
  assert.equal(normalizeTag('Gestures'), 'gesture')
  assert.equal(normalizeTag('fuzzy search'), 'fuzzy-search')
  assert.equal(normalizeTag('cors'), 'cor') // 한계: 단수가 s 로 끝나면 깎인다. 양쪽이 같이 깎여 일치에는 문제없다
  assert.equal(normalizeTag('css'), 'css')
  assert.equal(normalizeTag('class'), 'class')
})

test('정확 일치 F1', () => {
  assert.equal(tagF1Exact(['gestures', 'react'], ['gesture']), 2 / 3)
  assert.equal(tagF1Exact([], ['x']), 0)
  assert.equal(tagF1Exact(['i18n'], ['internationalization']), 0)
})

test('판정 → 점수: predicted 에 없는 covered_by 는 덮지 않은 것', () => {
  const s = scoreJudgement(
    {
      expected: [
        { tag: 'drag', covered_by: 'dragging' },
        { tag: 'gestures', covered_by: 'gesture' },
        { tag: 'zoom', covered_by: 'pinch-zoom' }, // 지어낸 태그
      ],
      primary_same: true,
      reasoning: '',
    },
    { primary: 'gestures', tags: ['drag', 'gestures', 'zoom'] },
    { primary: 'gesture', tags: ['dragging', 'gesture', 'react', 'hooks'] },
  )
  assert.equal(s.recall, 2 / 3)
  assert.equal(s.precision, 2 / 4)
  assert.equal(s.primaryMatch, 1)
})

test('판정 → 점수: 대표가 없으면 primaryMatch 는 null', () => {
  const s = scoreJudgement({ expected: [], primary_same: false, reasoning: '' }, { primary: 'x', tags: ['x'] }, { primary: null, tags: ['y'] })
  assert.equal(s.primaryMatch, null)
  assert.equal(s.f1, 0)
})

test('태그 출력 정리: 중복·빈 값 제거, primary 를 tags 에 넣는다', () => {
  assert.deepEqual(parseTagging('{"primary":"svg","tags":["html"," ","html"],"assumptions":[]}'), {
    primary: 'svg',
    tags: ['svg', 'html'],
    assumptions: [],
  })
})
