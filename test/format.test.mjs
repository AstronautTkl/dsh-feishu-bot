import test from 'node:test'
import assert from 'node:assert/strict'

import { internals } from '../index.js'

const { clip, oneLine, messageText, renderSession, isSubagent, toolCallArguments, sessionName } = internals

test('clip 与 oneLine 截断空白', () => {
  assert.equal(clip('abcdef', 3), 'abc…')
  assert.equal(clip('abc', 3), 'abc')
  assert.equal(oneLine('  a \n b  ', 10), 'a b')
})

test('messageText 汇总文本与工具调用，忽略思考块', () => {
  const text = messageText({
    role: 'assistant',
    content: [
      { type: 'reasoning', text: '内部推理' },
      { type: 'text', text: '先读文件' },
      { type: 'tool-call', name: 'read', arguments: '{"path":"a.txt"}' },
    ],
  })
  assert.match(text, /先读文件/)
  assert.match(text, /🔧 read/)
  assert.doesNotMatch(text, /内部推理/)
})

test('renderSession 按角色渲染并截取尾部', () => {
  const session = {
    id: 'session-abcdef',
    header: { cwd: 'D:/work/project' },
    deriveMessages: () => [
      { role: 'system', content: [{ type: 'text', text: '系统提示' }] },
      { role: 'user', content: [{ type: 'text', text: '你好' }] },
      { role: 'assistant', content: [{ type: 'text', text: '做完了' }] },
    ],
  }
  const out = renderSession(session, 5)
  assert.match(out, /你：你好/)
  assert.match(out, /助手：做完了/)
  assert.doesNotMatch(out, /系统提示/)
})

test('renderSession 在会话读取失败时给出可读错误', () => {
  const session = {
    id: 's',
    header: {},
    deriveMessages: () => {
      throw new Error('boom')
    },
  }
  assert.match(renderSession(session), /读取会话失败/)
})

test('isSubagent 识别子会话', () => {
  assert.equal(isSubagent({ header: { parentSession: 'p' } }), true)
  assert.equal(isSubagent({ header: { origin: 'subagent' } }), true)
  assert.equal(isSubagent({ header: {} }), false)
  assert.equal(isSubagent(undefined), false)
})

test('sessionName 用目录名加短会话号', () => {
  const name = sessionName({ id: 'session-123456', header: { cwd: 'D:/work/project' } })
  assert.equal(name, 'project (123456)')
  assert.equal(sessionName({ id: 'session-abcdef', header: {} }), '会话 (abcdef)')
})

test('toolCallArguments 从会话日志里回查调用参数', () => {
  const session = {
    seq: 10,
    snapshotEvents: () => [
      { type: 'tool/call', data: { callId: 'c1', arguments: '{"a":1}' } },
      { type: 'tool/result', data: {} },
    ],
  }
  assert.equal(toolCallArguments(session, 'c1'), '{"a":1}')
  assert.equal(toolCallArguments(session, 'missing'), '')
  assert.equal(toolCallArguments(undefined, 'c1'), '')
})
