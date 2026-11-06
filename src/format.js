/** 纯格式化函数：不碰网络、不碰 DSH 服务，方便单测。 */
import path from 'node:path'

export const clip = (text, max) => {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export const oneLine = (text, max) => clip(String(text ?? '').replace(/\s+/g, ' ').trim(), max)

export function blockText(block) {
  if (!block || typeof block !== 'object') return ''
  switch (block.type) {
    case 'text':
      return typeof block.text === 'string' ? block.text : ''
    case 'tool-call':
      return `🔧 ${block.name ?? 'tool'} ${oneLine(block.arguments, 160)}`
    case 'reasoning':
      return ''
    default:
      return ''
  }
}

export function messageText(message) {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (typeof message.text === 'string' && !Array.isArray(message.content)) return message.text
  const content = Array.isArray(message.content) ? message.content : []
  const parts = []
  for (const block of content) {
    const text = blockText(block)
    if (text) parts.push(text)
  }
  return parts.join('\n')
}

export function roleLabel(role) {
  switch (role) {
    case 'user':
      return '你'
    case 'assistant':
      return '助手'
    case 'tool':
      return '工具'
    default:
      return role ?? '?'
  }
}

export function renderSession(session, limit = 14) {
  let messages = []
  try {
    messages = session.deriveMessages() ?? []
  } catch (error) {
    return `读取会话失败：${error?.message ?? error}`
  }
  const rows = []
  for (const message of messages) {
    const role = message?.role
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') continue
    const text = messageText(message).trim()
    if (!text) continue
    rows.push(`${roleLabel(role)}：${clip(text, 420)}`)
  }
  const tail = rows.slice(-limit)
  if (tail.length === 0) return '（这个会话还没有可显示的消息）'
  return tail.join('\n\n')
}

/** 会话 id 形如 `session-<uuid>`，去掉公共前缀后才看得出是哪一条。 */
export function shortId(sessionOrId) {
  const id = typeof sessionOrId === 'string' ? sessionOrId : String(sessionOrId?.id ?? '')
  return id.replace(/^session-/, '').slice(0, 6)
}

export function sessionName(session) {
  const cwd = session?.header?.cwd ?? ''
  const base = cwd ? path.basename(cwd) : '会话'
  return `${base} (${shortId(session)})`
}

export const isSubagent = (session) =>
  Boolean(session?.header?.parentSession) || session?.header?.origin === 'subagent'

/** 手机端可以直接批准的只读类工具。写文件、执行命令这类默认留在电脑上确认。 */
export const READ_ONLY_TOOLS = new Set([
  'read', 'glob', 'grep', 'web_search', 'web_fetch', 'weather', 'research',
  'multi_search', 'platform_search', 'domain_search', 'advanced_search',
  'video_search', 'cache_search', 'free_search_test', 'look_design',
  'check_design', 'get_goal', 'job_list', 'job_output', 'list_agents',
  'schedule_list', 'schedule_view', 'queryApps', 'queryHosting', 'queryEnv',
])

/** 审批请求只带 callId，不带参数；从会话日志里回查这次调用实际要做什么。 */
export function toolCallArguments(session, callId) {
  if (!session || !callId) return ''
  try {
    const end = Number(session.seq)
    const from = Math.max(0, end - 120)
    const events = session.snapshotEvents(from, end)
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type === 'tool/call' && String(event.data?.callId) === String(callId)) {
        return String(event.data?.arguments ?? '')
      }
    }
  } catch {}
  return ''
}

/** Exposed for unit tests only. */
export const internals = {
  clip,
  oneLine,
  blockText,
  messageText,
  roleLabel,
  renderSession,
  sessionName,
  shortId,
  isSubagent,
  toolCallArguments,
  READ_ONLY_TOOLS,
}
