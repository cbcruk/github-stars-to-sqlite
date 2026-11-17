import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryF1, missed, primaryMatch } from './evaluate.ts'
import { parseClassification } from './classify.ts'

const a = (primary: string, ...categories: string[]) => ({ primary, categories })

test('대표 도메인 일치', () => {
  assert.equal(primaryMatch(a('ai', 'ai'), a('ai', 'ai', 'cli')), 1)
  assert.equal(primaryMatch(a('cli', 'cli'), a('ai', 'ai')), 0)
})

test('F1: 둘 다 none 이면 1, 겹침 없으면 0, 일부 겹침', () => {
  assert.equal(categoryF1(a('none'), a('none')), 1)
  assert.equal(categoryF1(a('ui', 'ui'), a('ai', 'ai')), 0)
  assert.equal(categoryF1(a('ai', 'ai', 'cli'), a('ai', 'ai')), 2 / 3)
})

test('놓침: 정답에 도메인이 있는데 none', () => {
  assert.equal(missed(a('none'), a('ai', 'ai')), 1)
  assert.equal(missed(a('none'), a('none')), 0)
  assert.equal(missed(a('ui', 'ui'), a('ai', 'ai')), 0)
})

test('모델 출력: 모르는 id 는 버리고 assumptions 에 남긴다', () => {
  const r = parseClassification('{"primary":"devops","categories":["devops","cli"],"assumptions":[]}')
  assert.equal(r.primary, 'none')
  assert.deepEqual(r.categories, ['cli'])
  assert.equal(r.assumptions.length, 2)
})

test('모델 출력: primary 가 categories 에 없으면 앞에 넣는다', () => {
  const r = parseClassification('{"primary":"ai","categories":["cli"],"assumptions":[]}')
  assert.deepEqual(r.categories, ['ai', 'cli'])
})
