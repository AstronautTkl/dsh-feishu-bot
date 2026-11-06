import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApprovalCard, doneCard } from '../src/cards.js'

const entry = {
  code: 'A1B2',
  toolName: 'write',
  reason: '需要写文件',
  summary: '{"path":"a.txt"}',
  risky: true,
  sessionName: 'project (abc123)',
}

test('审批卡片包含四个操作与参数摘要', () => {
  const card = buildApprovalCard(entry, 300000, { dual: true, onTimeout: 'delegate' })
  const actions = card.elements.find((el) => el.tag === 'action').actions
  assert.deepEqual(actions.map((a) => a.value.op), ['approve', 'reject', 'context', 'delegate'])
  const text = card.elements[0].text.content
  assert.match(text, /write/)
  assert.match(text, /a\.txt/)
  assert.match(text, /⚠️/)
})

test('双端模式与单端模式的提示不同', () => {
  const dual = buildApprovalCard(entry, 300000, { dual: true })
  const single = buildApprovalCard(entry, 300000, { dual: false, onTimeout: 'delegate' })
  assert.match(dual.elements.at(-1).elements[0].content, /同时在等/)
  assert.match(single.elements.at(-1).elements[0].content, /自动交回电脑/)
})

test('结果卡片按结局着色', () => {
  const approved = doneCard(entry, 'allowed-once', '飞书按钮')
  assert.equal(approved.header.template, 'green')
  assert.match(approved.header.title.content, /已同意/)

  const rejected = doneCard(entry, 'rejected')
  assert.equal(rejected.header.template, 'red')

  const delegated = doneCard(entry, 'delegate')
  assert.equal(delegated.header.template, 'blue')

  const expired = doneCard(entry, 'cancelled', '总超时')
  assert.equal(expired.header.template, 'grey')
  assert.match(expired.elements.at(-1).elements[0].content, /放弃本次调用/)
})
