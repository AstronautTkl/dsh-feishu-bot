/** 本地状态、日志、本机覆盖配置。全部落在 ~/.dsh-feishu/ 下。 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const STATE_DIR = path.join(os.homedir(), '.dsh-feishu')
export const STATE_FILE = path.join(STATE_DIR, 'state.json')
/**
 * 设置页写入的覆盖配置。放在用户目录而不是包目录：
 * 从 npm 安装时包在 node_modules 里，重装/升级会把它冲掉。
 * 开发时仍允许包根目录的 settings.local.json 作为兜底。
 */
export const SETTINGS_FILE = path.join(STATE_DIR, 'settings.local.json')
const PACKAGE_SETTINGS_FILE = fileURLToPath(new URL('../settings.local.json', import.meta.url))

/** Local overrides (App ID, secret, sdkPath). 用户目录优先，其次包目录。 */
export function loadLocalSettings() {
  for (const file of [SETTINGS_FILE, PACKAGE_SETTINGS_FILE]) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {}
  }
  return {}
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
