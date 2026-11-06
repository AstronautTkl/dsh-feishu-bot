/** 本地状态、日志、本机覆盖配置。全部落在 ~/.dsh-feishu/ 下。 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const STATE_DIR = path.join(os.homedir(), '.dsh-feishu')
export const STATE_FILE = path.join(STATE_DIR, 'state.json')

/** Local, git-ignored overrides (App ID, secret, sdkPath) for development. */
export function loadLocalSettings() {
  try {
    const file = fileURLToPath(new URL('../settings.local.json', import.meta.url))
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

export function loadState() {
  const state = {
    openIds: [],
    chatId: '',
    remoteApproval: true,
    notify: true,
    approvalScope: '',
    dualApproval: null,
    explicit: {},
  }
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

export function saveState(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    console.error('[feishu] 保存状态失败', error)
  }
}

export function log(...parts) {
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
