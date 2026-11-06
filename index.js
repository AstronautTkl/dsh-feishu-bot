/**
 * dsh-feishu-bot — bridges DSH session status, approvals, and conversation
 * content to a Feishu self-built bot over a long connection (no public URL).
 *
 * Host-only plugin. Registers:
 *  - approval/request waterfall listener (optional remote approval)
 *  - agent/status and agent/error observers (notifications)
 *  - a Feishu WS client for text commands and card actions
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const name = 'dsh-feishu-bot'
export const inject = ['sessions']

/**
 * The Feishu SDK resolves from the package's own dependencies when installed
 * from npm. A local `settings.local.json` may carry `sdkPath` for development
 * (e.g. when the bundle is linked from a checkout whose dependencies the
 * profile installer does not resolve).
 */
async function loadSdk(config) {
  if (config.sdkPath) return import(pathToFileURL(config.sdkPath).href)
  try {
    return await import('@larksuiteoapi/node-sdk')
  } catch (error) {
    throw new Error(
      '@larksuiteoapi/node-sdk 未安装：在插件目录执行 `npm install --omit=dev`，'
        + '或在 settings.local.json 里用 sdkPath 指向它的入口文件。'
        + ` 原始错误：${error?.message ?? error}`,
    )
  }
}

/** Local, git-ignored overrides (App ID, secret, sdkPath) for development. */
function loadLocalSettings() {
  try {
    const file = fileURLToPath(new URL('./settings.local.json', import.meta.url))
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

const STATE_DIR = path.join(os.homedir(), '.dsh-feishu')
const STATE_FILE = path.join(STATE_DIR, 'state.json')

const DEFAULTS = {
  appId: '',
  appSecret: '',
  allowedOpenIds: [],
  remoteApproval: true,
  approvalTimeoutMs: 300000,
  // 'read-only' 只允许把只读类工具带到飞书批准；'all' 放开全部工具。
  approvalScope: 'all',
  // 双端同时等待：电脑端弹确认框、飞书发卡片，先处理的一侧生效，另一侧同步结果。
  dualApproval: true,
  // 超时后：'delegate' 交回界面确认，'reject' 直接拒绝。
  onTimeout: 'delegate',
  // 首条消息如何绑定主人：'code' 需要回一个本机日志里的绑定码，'auto' 直接绑定。
  bindMode: 'code',
  notify: true,
  notifyMinRunMs: 45000,
  approvableTools: [],
  quiet: false,
  logVerbose: false,
}

/** 手机端可以直接批准的只读类工具。写文件、执行命令这类默认留在电脑上确认。 */
const READ_ONLY_TOOLS = new Set([
  'read', 'glob', 'grep', 'web_search', 'web_fetch', 'weather', 'research',
  'multi_search', 'platform_search', 'domain_search', 'advanced_search',
  'video_search', 'cache_search', 'free_search_test', 'look_design',
  'check_design', 'get_goal', 'job_list', 'job_output', 'list_agents',
  'schedule_list', 'schedule_view', 'queryApps', 'queryHosting', 'queryEnv',
])

const isSubagent = (session) =>
  Boolean(session?.header?.parentSession) || session?.header?.origin === 'subagent'

/** 审批请求只带 callId，不带参数；从会话日志里回查这次调用实际要做什么。 */
function toolCallArguments(session, callId) {
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

function loadState() {
  const state = { openIds: [], chatId: '', remoteApproval: true, notify: true, approvalScope: '', dualApproval: null, explicit: {} }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (Array.isArray(raw.openIds)) state.openIds = raw.openIds.filter((v) => typeof v === 'string')
    if (typeof raw.chatId === 'string') state.chatId = raw.chatId
    if (typeof raw.remoteApproval === 'boolean') state.remoteApproval = raw.remoteApproval
    if (typeof raw.notify === 'boolean') state.notify = raw.notify
    if (typeof raw.approvalScope === 'string') state.approvalScope = raw.approvalScope
    if (typeof raw.dualApproval === 'boolean') state.dualApproval = raw.dualApproval
    if (raw.explicit && typeof raw.explicit === 'object') state.explicit = raw.explicit
  } catch {}
  return state
}

function log(...parts) {
  const line = `${new Date().toISOString()} ${parts
    .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
    .join(' ')}\n`
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    const file = path.join(STATE_DIR, 'bridge.log')
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) fs.renameSync(file, `${file}.1`)
    } catch {}
    fs.appendFileSync(file, line)
  } catch {}
}

function saveState(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    console.error('[feishu] 保存状态失败', error)
  }
}

const clip = (text, max) => {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

const oneLine = (text, max) => clip(String(text ?? '').replace(/\s+/g, ' ').trim(), max)

function blockText(block) {
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

function messageText(message) {
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

function roleLabel(role) {
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

function renderSession(session, limit = 14) {
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
function shortId(sessionOrId) {
  const id = typeof sessionOrId === 'string' ? sessionOrId : String(sessionOrId?.id ?? '')
  return id.replace(/^session-/, '').slice(0, 6)
}

function sessionName(session) {
  const cwd = session?.header?.cwd ?? ''
  const base = cwd ? path.basename(cwd) : '会话'
  return `${base} (${shortId(session)})`
}

function cardText(content) {
  return { tag: 'div', text: { tag: 'lark_md', content } }
}

function button(label, type, value) {
  return { tag: 'button', text: { tag: 'plain_text', content: label }, type, value }
}

export function apply(ctx, rawConfig = {}) {
  const config = { ...DEFAULTS, ...rawConfig, ...loadLocalSettings() }
  const state = loadState()
  if (Array.isArray(config.allowedOpenIds) && config.allowedOpenIds.length > 0) {
    state.openIds = [...new Set([...config.allowedOpenIds, ...state.openIds])]
  }
  if (!state.explicit.remoteApproval && typeof config.remoteApproval === 'boolean') {
    state.remoteApproval = config.remoteApproval
  }
  if (!state.explicit.notify && typeof config.notify === 'boolean') {
    state.notify = config.notify
  }
  if (!state.approvalScope) {
    state.approvalScope = config.approvalScope === 'all' ? 'all' : 'read-only'
  }
  if (typeof state.dualApproval !== 'boolean') {
    state.dualApproval = config.dualApproval !== false
  }

  if (!config.appId) {
    console.error('[feishu] 缺少 appId，插件未启动')
    return
  }

  let client
  const pending = new Map()
  const seenMessages = new Map()
  const lastStatus = new Map()
  const runStartedAt = new Map()
  let wsClient = null
  let disposed = false
  let bindRequest = null

  /**
   * App Secret 优先从凭据库取（不落配置文件）；配置里给了就顺手存进凭据库，
   * 下次就能把 appSecret 从 cordis.patch.yml 删掉。
   */
  async function resolveAppSecret() {
    const store = ctx.get('credentials')
    const ref = 'DSH_FEISHU_APP_SECRET'
    if (store) {
      try {
        const hit = await store.resolve(ref)
        if (hit?.value) return hit.value
        if (config.appSecret) {
          await store.set(ref, config.appSecret)
          log('cred.stored', ref)
          return config.appSecret
        }
      } catch (error) {
        log('cred.error', String(error?.message ?? error))
      }
    }
    return config.appSecret || ''
  }

  const targetId = () => state.chatId || state.openIds[0] || ''
  const isOpenIdTarget = (id) => String(id).startsWith('ou_')
  const canUse = (openId) => state.openIds.includes(openId)

  async function sendCard(card, id = targetId(), idType) {
    if (!id) throw new Error('还没有可用的飞书会话，请先给机器人发一条消息')
    const receiveIdType = idType ?? (isOpenIdTarget(id) ? 'open_id' : 'chat_id')
    const response = await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: id,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    })
    return response?.data?.message_id
  }

  async function sendText(text, id = targetId(), idType) {
    if (!id) return undefined
    const receiveIdType = idType ?? (isOpenIdTarget(id) ? 'open_id' : 'chat_id')
    try {
      const response = await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: { receive_id: id, msg_type: 'text', content: JSON.stringify({ text }) },
      })
      return response?.data?.message_id
    } catch (error) {
      console.error('[feishu] 发消息失败', error?.message ?? error)
      return undefined
    }
  }

  async function patchCard(messageId, card) {
    if (!messageId) return
    try {
      await client.im.message.patch({
        path: { message_id: messageId },
        data: { content: JSON.stringify(card) },
      })
    } catch (error) {
      console.error('[feishu] 更新卡片失败', error?.message ?? error)
    }
  }

  function makeCode() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = Math.random().toString(36).slice(2, 6).toUpperCase()
      if (!pending.has(code)) return code
    }
    return String(Date.now()).slice(-4)
  }

  function doneCard(entry, outcome, byWhom) {
    const state =
      outcome === 'allowed-once'
        ? 'approved'
        : outcome === 'delegate'
          ? 'delegated'
          : outcome === 'timeout'
            ? 'timeout'
            : 'rejected'
    const title =
      state === 'approved'
        ? '✅ 已同意'
        : state === 'delegated'
          ? '⏳ 已转交电脑'
          : state === 'timeout'
            ? '⌛ 手机侧已超时'
            : '⛔ 已拒绝'
    const template = state === 'approved' ? 'green' : state === 'delegated' ? 'blue' : state === 'timeout' ? 'grey' : 'red'
    const note =
      state === 'delegated'
        ? '已交回 DSH 界面等待确认'
        : state === 'timeout'
          ? '电脑端仍在等待确认'
          : '两端已同步'
    return {
      config: { wide_screen_mode: true },
      header: {
        template,
        title: { tag: 'plain_text', content: title },
      },
      elements: [
        cardText(`**会话**：${entry.sessionName}\n**工具**：\`${entry.toolName}\`\n**码**：${entry.code}${byWhom ? `\n**操作人**：${byWhom}` : ''}`),
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: note }],
        },
      ],
    }
  }

  function settle(code, outcome, byWhom = '', options = {}) {
    const entry = pending.get(code)
    if (!entry) return false
    pending.delete(code)
    if (entry.timer) clearTimeout(entry.timer)
    entry.signal?.removeEventListener?.('abort', entry.onAbort)
    log('settle', code, outcome, byWhom)
    if (!options.skipPatch) patchCard(entry.messageId, doneCard(entry, outcome, byWhom))
    entry.resolve(outcome)
    return true
  }

  function buildSessionList() {
    let sessions = []
    try {
      sessions = ctx.sessions.list().filter((session) => !isSubagent(session))
    } catch (error) {
      return `读取会话列表失败：${error?.message ?? error}`
    }
    if (sessions.length === 0) return '现在没有打开的会话。'
    const lines = sessions.map((session) => {
      const status = lastStatus.get(String(session.id)) === 'running' ? '🏃 运行中' : '💤 空闲'
      return `${status}  ${sessionName(session)}`
    })
    return lines.join('\n')
  }

  function findSession(key) {
    let sessions = []
    try {
      sessions = ctx.sessions.list()
    } catch {
      return undefined
    }
    const needle = String(key ?? '').toLowerCase()
    if (!needle) return sessions.find((session) => !isSubagent(session)) ?? sessions[0]
    return (
      sessions.find((session) => String(session.id).toLowerCase().startsWith(needle)) ??
      sessions.find((session) => String(session.id).toLowerCase().includes(needle))
    )
  }

  async function handleCommand(text, replyId) {
    const trimmed = String(text ?? '').replace(/@_user_\d+/g, '').trim()
    if (!trimmed) return
    const [head, ...rest] = trimmed.split(/\s+/)
    const arg = rest.join(' ').trim()
    const lower = head.toLowerCase()

    if (['帮助', 'help', '?', '？'].includes(head)) {
      return sendText(
        [
          'DSH 飞书助手',
          '',
          '列表 —— 看当前打开的会话',
          '看 <会话号> [条数] —— 看最近消息',
          '待办 —— 列出所有等待批准的请求',
          '同意/拒绝/转电脑 <码> —— 处理审批',
          '远程 开|关 —— 远程审批总开关',
          '范围 全部|只读 —— 哪些工具可以在手机批',
          '双端 开|关 —— 电脑和手机是否同时等审批',
          '征求 开|关 —— 强制每次工具调用都走审批（调试用）',
          '通知 开|关 —— 完成/报错提醒',
          '测试审批 —— 发一张测试卡片，验证按钮',
          '绑定 <码> —— 首次绑定主人',
          '状态 —— 服务状态',
        ].join('\n'),
        replyId.chatId,
        replyId.chatId ? 'chat_id' : undefined,
      )
    }

    if (['列表', 'list', 'ls', '会话'].includes(head)) {
      return sendText(buildSessionList(), replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (['看', 'view', 'show', '内容'].includes(head) || lower === 'view') {
      const [key, limitRaw] = rest
      const session = findSession(key)
      if (!session) return sendText(`没找到会话 ${key ?? ''}`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      const limit = Number.parseInt(limitRaw ?? '', 10)
      const body = renderSession(session, Number.isFinite(limit) && limit > 0 ? Math.min(limit, 40) : 14)
      return sendText(`📄 ${sessionName(session)}\n\n${body}`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (['待办', 'todo', 'pending'].includes(head)) {      if (pending.size === 0) return sendText('没有待处理的审批。', replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      const rows = [...pending.values()].map((entry) => {
        const left = Math.max(0, Math.round((entry.expiresAt - Date.now()) / 60000))
        return `${entry.code}  ${entry.toolName}  ${entry.sessionName}  剩 ${left} 分钟`
      })
      return sendText(`待审批 ${pending.size} 条：\n${rows.join('\n')}`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (head === '转电脑' || (head === '交给电脑' && arg)) {
      const code = (arg || (pending.size === 1 ? [...pending.keys()][0] : '')).toUpperCase()
      if (!code) return sendText('用法：转电脑 <码>', replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      const ok = settle(code, 'delegate', '飞书文字')
      return sendText(ok ? `已转交电脑 ${code}` : `码 ${code} 不存在或已过期`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (['同意', 'approve', 'y', 'yes'].includes(lower) || ['同意', 'approve'].includes(head)) {
      const code = (arg || (pending.size === 1 ? [...pending.keys()][0] : '')).toUpperCase()
      if (!code) return sendText('用法：同意 <码>', replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      const ok = settle(code, 'allowed-once', '飞书文字')
      return sendText(ok ? `已同意 ${code}` : `码 ${code} 不存在或已过期`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (['拒绝', 'reject', 'n', 'no'].includes(lower) || ['拒绝', 'reject'].includes(head)) {
      const code = (arg || (pending.size === 1 ? [...pending.keys()][0] : '')).toUpperCase()
      if (!code) return sendText('用法：拒绝 <码>', replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      const ok = settle(code, 'rejected', '飞书文字')
      return sendText(ok ? `已拒绝 ${code}` : `码 ${code} 不存在或已过期`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (head === '远程') {
      if (arg === '开') {
        state.remoteApproval = true
        state.explicit.remoteApproval = true
      } else if (arg === '关') {
        state.remoteApproval = false
        state.explicit.remoteApproval = true
      }
      saveState(state)
      return sendText(`远程审批：${state.remoteApproval ? '已开启' : '已关闭'}`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (head === '通知') {
      if (arg === '开') {
        state.notify = true
        state.explicit.notify = true
      } else if (arg === '关') {
        state.notify = false
        state.explicit.notify = true
      }
      saveState(state)
      return sendText(`完成/报错通知：${state.notify ? '已开启' : '已关闭'}`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
    }

    if (head === '征求') {
      // 调试/严格模式开关：把当前会话的审批策略强制设为 ask，用来验证 approval/request 链路。
      const approval = ctx.get('approval')
      const agents = ctx.get('agents')
      if (!approval || !agents) {
        return sendText('这个环境没有 approval/agents 服务，无法切换策略。', replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      }
      const policy = arg === '关' ? 'never' : 'ask'
      let changed = 0
      for (const agent of agents.list()) {
        try {
          approval.setPolicy(agent, policy)
          changed += 1
        } catch (error) {
          log('policy.error', String(error?.message ?? error))
        }
      }
      log('policy.set', policy, changed)
      return sendText(
        `已把 ${changed} 个会话的审批策略设为 ${policy}（电脑端可能也会同步变化）`,
        replyId.chatId,
        replyId.chatId ? 'chat_id' : undefined,
      )
    }

    if (head === '双端') {
      if (arg === '开') state.dualApproval = true
      else if (arg === '关') state.dualApproval = false
      saveState(state)
      return sendText(
        `双端模式：${state.dualApproval ? '开（电脑+手机同时等，先处理的一侧生效）' : '关（只走手机）'}`,
        replyId.chatId,
        replyId.chatId ? 'chat_id' : undefined,
      )
    }

    if (head === '范围') {
      if (arg === '全部') state.approvalScope = 'all'
      else if (arg === '只读') state.approvalScope = 'read-only'
      saveState(state)
      return sendText(
        `审批范围：${state.approvalScope === 'all' ? '全部工具' : '只读类（写/执行留电脑）'}`,
        replyId.chatId,
        replyId.chatId ? 'chat_id' : undefined,
      )
    }

    if (['状态', 'status'].includes(head)) {
      return sendText(
        [
          `远程审批：${state.remoteApproval ? '开' : '关'}`,
          `双端模式：${state.dualApproval ? '开（电脑+手机同时等）' : '关（只走手机）'}`,
          `审批范围：${state.approvalScope === 'all' ? '全部工具' : '只读类（写/执行留电脑）'}`,
          `超时策略：${state.dualApproval ? '由电脑端兜底' : config.onTimeout === 'delegate' ? '交回电脑' : '拒绝'}`,
          `通知：${state.notify ? '开' : '关'}`,
          `待审批：${pending.size}`,
          `已知会话：${(() => { try { return ctx.sessions.list().filter((session) => !isSubagent(session)).length } catch { return '?' } })()}`,
          `身份：${state.openIds.join(', ') || '(未绑定)'}`,
        ].join('\n'),
        replyId.chatId,
        replyId.chatId ? 'chat_id' : undefined,
      )
    }

    if (['测试审批', 'test-approval'].includes(trimmed)) {
      await sendText('发一张测试审批卡片，60 秒内点按钮试试。', replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      // 关键：绝不在飞书事件回调里等待审批结果。飞书要求回调 3 秒内响应，
      // 等下去会被判超时并重投，同一个指令于是被执行第二次、又发一张卡片。
      requestApprovalCard({
        toolName: 'demo-tool',
        reason: '链路自测，不会真的执行任何操作',
        sessionName: '测试会话',
        timeoutMs: 60000,
      }).then((result) => {
        const label =
          result?.outcome === 'allowed-once'
            ? '✅ 已同意'
            : result?.outcome === 'delegate'
              ? '⏳ 已转交电脑确认'
              : result?.outcome === 'rejected'
                ? '⛔ 已拒绝'
                : result
                  ? '⌛ 超时或取消'
                  : '⚠️ 卡片没发出去（还没绑定会话？）'
        return sendText(`测试结果：${label}`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
      }).catch((error) => log('test-approval.error', String(error?.message ?? error)))
      return
    }

    return sendText(`不认识的指令：${trimmed}\n发「帮助」看用法`, replyId.chatId, replyId.chatId ? 'chat_id' : undefined)
  }

  async function onMessage(data) {
    if (disposed) return
    const message = data?.message
    const chatId = message?.chat_id ?? ''
    const chatType = message?.chat_type ?? ''
    const openId = data?.sender?.sender_id?.open_id ?? ''
    if (!chatId || !message) return
    if (chatType === 'group' && !message?.mentions?.length) return

    const messageId = String(message.message_id ?? '')
    if (messageId) {
      if (seenMessages.has(messageId)) {
        log('msg.dup', messageId)
        return
      }
      seenMessages.set(messageId, Date.now())
      if (seenMessages.size > 400) {
        const cutoff = Date.now() - 300000
        for (const [key, time] of seenMessages) {
          if (time < cutoff) seenMessages.delete(key)
        }
      }
    }

    let text = ''
    try {
      text = JSON.parse(message.content ?? '{}').text ?? ''
    } catch {
      text = ''
    }
    log('msg', { openId, len: String(text ?? '').length })
    if (config.logVerbose) log('msg.body', { openId, text: clip(text, 120) })

    if (!canUse(openId)) {
      if (state.openIds.length === 0 && config.bindMode === 'auto') {
        state.openIds = [openId]
        state.chatId = chatId
        saveState(state)
        await sendText(`已绑定到你的飞书账号（${openId}）。发「帮助」看用法。`, chatId, 'chat_id')
        return
      }

      const bindMatch = /^绑定\s*([0-9]{6})$/.exec(text.trim())
      if (bindMatch) {
        if (
          bindRequest &&
          bindRequest.code === bindMatch[1] &&
          bindRequest.openId === openId &&
          Date.now() < bindRequest.expiresAt
        ) {
          state.openIds = [...new Set([...state.openIds, openId])]
          state.chatId = chatId
          saveState(state)
          bindRequest = null
          log('bind.ok', openId)
          await sendText(`绑定成功。发「帮助」看用法。`, chatId, 'chat_id')
          return
        }
        log('bind.bad-code', openId)
        await sendText('绑定码不对或已过期。在电脑上看 `~/.dsh-feishu/bridge.log` 里的 bind.code 那一行。', chatId, 'chat_id')
        return
      }

      if (state.openIds.length === 0) {
        // 首次使用：不给陌生人直接绑定，先发一个只在电脑上能看到的码。
        const code = String(Math.floor(100000 + Math.random() * 900000))
        bindRequest = { code, openId, chatId, expiresAt: Date.now() + 10 * 60000 }
        log('bind.code', code, openId)
        console.warn(`[feishu] 首次绑定码：${code}（对方 ${openId}）`)
        await sendText(
          `这个机器人还没有绑定主人。\n请在电脑上打开 C:\\Users\\${os.userInfo().username}\\.dsh-feishu\\bridge.log，找到最后一条 bind.code，把 6 位码发成「绑定 123456」。\n10 分钟内有效。`,
          chatId,
          'chat_id',
        )
        return
      }

      await sendText('这个机器人只服务它的主人，忽略。', chatId, 'chat_id')
      console.warn('[feishu] 拒绝未授权用户', openId)
      return
    }

    state.chatId = chatId
    saveState(state)
    await handleCommand(text, { chatId })
  }

  async function onCardAction(data) {
    const startedAt = Date.now()
    try {
      const openId = data?.operator?.open_id ?? ''
      const value = data?.action?.value ?? {}
      log('card.action', { openId, value })
      if (!canUse(openId)) {
        return { toast: { type: 'warning', content: '这个机器人只服务它的主人' } }
      }
      const code = String(value.code ?? '').toUpperCase()
      const entry = pending.get(code)
      if (!entry) return { toast: { type: 'info', content: '这条审批已经处理过，或已过期' } }
      const op = String(value.op ?? '')
      const outcome = op === 'approve' ? 'allowed-once' : op === 'delegate' ? 'delegate' : 'rejected'
      const card = doneCard(entry, outcome, '飞书按钮')
      const ok = settle(code, outcome, '飞书按钮', { skipPatch: true })
      const toast =
        op === 'delegate'
          ? { type: 'info', content: ok ? '已转交电脑确认' : '处理失败' }
          : { type: op === 'approve' ? 'success' : 'warning', content: ok ? (op === 'approve' ? '已同意' : '已拒绝') : '处理失败' }
      return { toast, card: { type: 'raw', data: card } }
    } catch (error) {
      log('card.action.error', String(error?.message ?? error))
      return { toast: { type: 'error', content: '处理失败' } }
    } finally {
      log('card.action.ms', Date.now() - startedAt)
    }
  }

  function approvalCardText(entry) {
    const lines = [
      `**会话**：${entry.sessionName}`,
      `**工具**：\`${entry.toolName}\`${entry.risky ? '  ⚠️ 写操作/执行类' : ''}`,
    ]
    if (entry.summary) lines.push(`**要执行**：${entry.summary}`)
    if (entry.reason) lines.push(`**原因**：${entry.reason}`)
    lines.push(`**码**：${entry.code}`)
    return lines.join('\n')
  }

  function buildApprovalCard(entry, timeoutMs) {
    return {
      config: { wide_screen_mode: true, update_multi: true },
      header: { template: 'orange', title: { tag: 'plain_text', content: '⚠️ 需要你授权' } },
      elements: [
        cardText(approvalCardText(entry)),
        {
          tag: 'action',
          actions: [
            button('同意', 'primary', { op: 'approve', code: entry.code }),
            button('拒绝', 'danger', { op: 'reject', code: entry.code }),
            button('交给电脑', 'default', { op: 'delegate', code: entry.code }),
          ],
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: state.dualApproval
                ? '电脑端和手机端同时在等，任一侧处理即生效'
                : config.onTimeout === 'delegate'
                  ? `${Math.max(1, Math.round(timeoutMs / 60000))} 分钟没操作会自动交回电脑确认`
                  : `${Math.max(1, Math.round(timeoutMs / 60000))} 分钟没操作视为拒绝`,
            },
          ],
        },
      ],
    }
  }

  /**
   * 发一张审批卡片并返回它的决定 Promise。
   * options.timeoutMs 传 null 表示手机侧不设超时（双端模式由电脑端兜底）。
   */
  async function openApprovalCard(options) {
    const target = targetId()
    if (!target) return null
    const noTimeout = options.timeoutMs === null
    const timeoutMs = noTimeout ? 30 * 60000 : Number.isFinite(options.timeoutMs) ? options.timeoutMs : config.approvalTimeoutMs
    const entry = {
      code: makeCode(),
      toolName: options.toolName,
      reason: options.reason ?? '',
      summary: options.summary ?? '',
      risky: options.risky === true,
      sessionName: options.sessionName ?? '会话',
      expiresAt: Date.now() + timeoutMs,
      messageId: undefined,
      signal: options.signal,
      resolve: undefined,
    }
    const card = buildApprovalCard(entry, timeoutMs)
    let messageId
    try {
      messageId = await sendCard(card, target)
    } catch (error) {
      console.error('[feishu] 审批卡片发送失败', error?.message ?? error)
      return null
    }
    entry.messageId = messageId
    log('approval.card.sent', entry.code, options.toolName)
    const timeoutOutcome = config.onTimeout === 'delegate' ? 'delegate' : 'rejected'
    const decision = new Promise((resolve) => {
      entry.resolve = resolve
      if (options.signal?.aborted) {
        resolve('cancelled')
        return
      }
      const onAbort = () => settle(entry.code, 'cancelled', 'signal')
      entry.onAbort = onAbort
      options.signal?.addEventListener?.('abort', onAbort, { once: true })
      if (!noTimeout) {
        entry.timer = setTimeout(() => settle(entry.code, timeoutOutcome, '超时'), timeoutMs)
      }
      pending.set(entry.code, entry)
    })
    return { entry, decision }
  }

  async function requestApprovalCard(options) {
    const opened = await openApprovalCard(options)
    if (!opened) return null
    const outcome = await opened.decision
    return { outcome, code: opened.entry.code }
  }

  async function handleApproval(req, next) {
    try {
      log('approval.req', { tool: req?.toolName, callId: String(req?.callId ?? ''), remote: state.remoteApproval, scope: state.approvalScope, dual: state.dualApproval })
      if (!state.remoteApproval) return next()
      const toolName = String(req?.toolName ?? 'tool')
      const allowList = Array.isArray(config.approvableTools) ? config.approvableTools : []
      const inScope =
        state.approvalScope === 'all' || READ_ONLY_TOOLS.has(toolName) || allowList.includes(toolName)
      if (!inScope) {
        log('approval.skip.scope', toolName)
        return next()
      }

      let session
      try {
        session = ctx.sessions.get(req.agent?.id)
      } catch {}
      const sessionLabel = session ? sessionName(session) : '会话'
      const summary = oneLine(toolCallArguments(session, req?.callId), 120)
      const options = {
        toolName,
        reason: req?.reason ?? req?.displayReason?.zh ?? req?.displayReason?.en ?? '',
        summary,
        risky: !READ_ONLY_TOOLS.has(toolName),
        sessionName: sessionLabel,
        signal: req?.signal,
      }

      if (!state.dualApproval) {
        const result = await requestApprovalCard(options)
        if (!result) return next()
        if (result.outcome === 'delegate') return next()
        return result.outcome
      }

      // 双端模式：电脑端确认框和飞书卡片同时等，先处理的一侧生效。
      const opened = await openApprovalCard({ ...options, timeoutMs: null })
      if (!opened) return next()
      const desktop = Promise.resolve().then(() => next())
      const winner = await Promise.race([
        opened.decision.then((outcome) => ({ from: 'phone', outcome })),
        desktop.then((outcome) => ({ from: 'desktop', outcome })),
      ])
      log('approval.winner', winner.from, winner.outcome)

      if (winner.from === 'desktop') {
        // 电脑端先处理：把飞书卡片改成同样的结果。
        settle(opened.entry.code, winner.outcome ?? 'cancelled', '电脑端')
        return winner.outcome
      }

      if (winner.outcome === 'delegate') {
        // 手机点了「交给电脑」：电脑端本来就在等，直接等它的结果并回写卡片。
        const desktopOutcome = await desktop
        patchCard(opened.entry.messageId, doneCard(opened.entry, desktopOutcome ?? 'cancelled', '电脑端'))
        log('approval.desktop.after-delegate', desktopOutcome)
        return desktopOutcome
      }

      // 手机先决定：电脑端确认框稍后会被用户点到，结果忽略即可。
      desktop
        .then((late) => log('approval.desktop.late', late))
        .catch((error) => log('approval.desktop.late-error', String(error?.message ?? error)))
      return winner.outcome
    } catch (error) {
      console.error('[feishu] 审批处理异常', error)
      return next()
    }
  }

  async function notifyDone(sessionId) {
    if (!state.notify) return
    const target = targetId()
    if (!target) return
    let session
    try {
      session = ctx.sessions.get(sessionId)
    } catch {}
    if (!session) return
    if (isSubagent(session)) return
    const body = renderSession(session, 3)
    const card = {
      config: { wide_screen_mode: true },
      header: { template: 'blue', title: { tag: 'plain_text', content: '✅ 本轮结束' } },
      elements: [cardText(`**${sessionName(session)}**\n\n${clip(body, 900)}`), { tag: 'note', elements: [{ tag: 'plain_text', content: '发「看 ' + shortId(session) + '」查看更多' }] }],
    }
    try {
      await sendCard(card, target)
    } catch (error) {
      console.error('[feishu] 通知发送失败', error?.message ?? error)
    }
  }

  const disposers = []

  // 关键：agent 作用域的事件（含 approval/request）由 agent 自己的上下文派发，
  // 只有它祖先上的监听器收得到。插件上下文是 root 的兄弟分支，挂在它上面收不到，
  // 所以这些监听必须注册在 root 上。
  const bus = ctx.root ?? ctx

  // 桌面端的确认框如果也是同一个 waterfall 上的 answerer，它会先决定、不调 next()，
  // 后面的监听器就永远轮不到。prepend 让我们排在它前面。
  let approvalDisposer
  try {
    approvalDisposer = bus.on('approval/request', (req, next) => handleApproval(req, next), true)
    log('approval.prepend', true)
  } catch {
    approvalDisposer = bus.on('approval/request', (req, next) => handleApproval(req, next))
    log('approval.prepend', false)
  }
  disposers.push(approvalDisposer)

  disposers.push(
    bus.on('agent/status', (payload) => {
      const agent = payload?.agent
      const status = payload?.status
      if (!agent) return
      const id = String(agent.id)
      const previous = lastStatus.get(id)
      lastStatus.set(id, status)
      log('status', id.slice(0, 8), status)
      if (status === 'running' && previous !== 'running') {
        runStartedAt.set(id, Date.now())
        return
      }
      if (status === 'idle' && previous === 'running') {
        const began = runStartedAt.get(id) ?? Date.now()
        runStartedAt.delete(id)
        const durationMs = Date.now() - began
        // 每轮都推会变成刷屏；只有跑得够久的轮次才值得一条「完成」通知。
        if (durationMs < (config.notifyMinRunMs ?? 45000)) return
        setTimeout(() => { notifyDone(id).catch(() => {}) }, 1500)
      }
    }),
  )

  disposers.push(
    bus.on('agent/error', (payload) => {
      if (!state.notify) return
      const agent = payload?.agent
      if (!agent) return
      try {
        const session = ctx.sessions.get(agent.id)
        if (session && isSubagent(session)) return
      } catch {}
      const message = payload?.error?.message ?? String(payload?.error ?? '未知错误')
      sendText(`❌ 会话 ${shortId(agent.id)} 出错：${clip(message, 300)}`).catch(() => {})
    }),
  )

  const start = async () => {
    try {
      const Lark = await loadSdk(config)
      const appSecret = await resolveAppSecret()
      if (!appSecret) {
        log('start.no-secret')
        console.error('[feishu] 没有可用的 App Secret：请先运行一次带 appSecret 的配置，或写入凭据 DSH_FEISHU_APP_SECRET')
        return
      }
      client = new Lark.Client({ appId: config.appId, appSecret })
      const dispatcher = new Lark.EventDispatcher({}).register({
        // 不 await：飞书回调要 3 秒内返回，慢操作一律脱离回调执行。
        'im.message.receive_v1': (data) => {
          onMessage(data).catch((error) => log('msg.error', String(error?.message ?? error)))
        },
        'card.action.trigger': onCardAction,
      })
      wsClient = new Lark.WSClient({
        appId: config.appId,
        appSecret,
        loggerLevel: Lark.LoggerLevel.info,
      })
      await wsClient.start({ eventDispatcher: dispatcher })
      log('ws.ready')
      console.log('[feishu] 长连接已启动')
      if (state.openIds.length > 0) {
        await sendText('DSH 飞书助手已上线。发「帮助」看用法。').catch(() => {})
      }
    } catch (error) {
      log('ws.error', String(error?.message ?? error))
      console.error('[feishu] 长连接启动失败（检查开放平台是否选了「长连接」订阅方式，或 sdkPath 配置）', error?.message ?? error)
    }
  }

  ctx.effect(() => {
    start()
    return () => {
      disposed = true
      for (const code of [...pending.keys()]) settle(code, 'cancelled', '插件卸载')
      try {
        wsClient?.close?.()
      } catch {}
      for (const dispose of disposers) {
        try {
          dispose?.()
        } catch {}
      }
      console.log('[feishu] 插件已卸载')
    }
  })
}

/** Exposed for unit tests only; not part of the plugin contract. */
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
