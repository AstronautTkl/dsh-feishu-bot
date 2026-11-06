/**
 * Settings page backend: one JSON pair of routes the browser page in
 * client.js calls. The page can only do two things — read the effective
 * configuration and write a validated subset of it.
 */
import fs from 'node:fs'
import path from 'node:path'

import { SETTINGS_FILE } from './state.js'

export const CONFIG_PATH = '/dsh-feishu-bot/config'

const MAX_BODY = 64 * 1024

function readSettingsFile() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeSettingsFile(next) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

const clampInt = (value, min, max, fallback) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

/**
 * @param {object} options
 * @param {{ getOrigin(): string, register(route: object): () => void }} options.webServer
 * @param {object} options.config 生效中的配置
 * @param {object} options.state  本地运行状态
 * @param {(state: object) => void} options.saveState
 * @param {string[]} options.openIds
 * @param {() => { wsState: string, pending: number }} options.status
 * @param {(line: string) => void} options.log
 * @param {() => void} options.reload 让插件重新加载（应用需要重启的字段）
 */
export function registerConfigPage({ webServer, config, state, saveState, openIds, status, log, reload, sendTest }) {
  const sameOrigin = (req) => {
    const origin = req.headers.origin
    if (!origin) return true
    try {
      return origin === webServer.getOrigin()
    } catch {
      return true
    }
  }

  const snapshot = () => {
    const { wsState, pending } = status()
    const file = readSettingsFile()
    return {
      appId: config.appId || '',
      hasSecret: Boolean(file.appSecret || config.appSecret),
      remoteApproval: state.remoteApproval,
      dualApproval: state.dualApproval,
      approvalScope: state.approvalScope,
      approvalTimeoutMs: config.approvalTimeoutMs,
      desktopDelayMs: config.desktopDelayMs,
      maxWaitMs: config.maxWaitMs,
      notify: state.notify,
      bindMode: config.bindMode,
      connection: wsState,
      pending,
      openIds,
      version: config.version ?? '',
    }
  }

  const disposer = webServer.register({
    kind: 'exact',
    path: CONFIG_PATH,
    async handler(req, res) {
      if (!sameOrigin(req)) {
        sendJson(res, 403, { error: '只接受来自本应用的请求' })
        return
      }

      if (req.method === 'GET') {
        sendJson(res, 200, snapshot())
        return
      }

      if (req.method !== 'POST') {
        sendJson(res, 405, { error: '只支持 GET / POST' })
        return
      }

      let body
      try {
        body = await readBody(req)
      } catch (error) {
        sendJson(res, 400, { error: error.message })
        return
      }

      // 页面的「发送测试消息」：走和正式通知一样的发送路径。
      if (body.action === 'test') {
        try {
          await sendTest()
          sendJson(res, 200, { ok: true })
        } catch (error) {
          sendJson(res, 500, { error: `发送测试消息失败：${error?.message ?? error}` })
        }
        return
      }

      // 运行时开关：立刻生效，只写 state.json。
      const runtime = {}
      for (const key of ['remoteApproval', 'dualApproval', 'notify']) {
        if (typeof body[key] === 'boolean' && body[key] !== state[key]) {
          state[key] = body[key]
          runtime[key] = body[key]
        }
      }
      if (body.approvalScope === 'all' || body.approvalScope === 'read-only') {
        if (body.approvalScope !== state.approvalScope) {
          state.approvalScope = body.approvalScope
          runtime.approvalScope = body.approvalScope
        }
      }
      if (Object.keys(runtime).length > 0) {
        saveState(state)
        log('settings.runtime', runtime)
      }

      // 需要重启插件的字段：写 settings.local.json（该文件 git 忽略）。
      const file = readSettingsFile()
      const next = { ...file }
      let restart = false
      const set = (key, value) => {
        if (next[key] !== value) {
          next[key] = value
          restart = true
        }
      }

      if (typeof body.appId === 'string' && body.appId.trim() && body.appId.trim() !== config.appId) {
        set('appId', body.appId.trim())
      }
      if (typeof body.appSecret === 'string' && body.appSecret.trim()) {
        set('appSecret', body.appSecret.trim())
      }
      if (body.approvalTimeoutMs !== undefined) {
        const minutes = clampInt(body.approvalTimeoutMs, 1, 1440, config.approvalTimeoutMs / 60000)
        set('approvalTimeoutMs', minutes * 60000)
      }
      if (body.desktopDelayMs !== undefined) {
        const ms = clampInt(body.desktopDelayMs, 0, 60000, config.desktopDelayMs)
        set('desktopDelayMs', ms)
      }
      if (body.maxWaitMs !== undefined) {
        const minutes = clampInt(body.maxWaitMs, 1, 1440, config.maxWaitMs / 60000)
        set('maxWaitMs', minutes * 60000)
      }
      if (body.bindMode === 'code' || body.bindMode === 'auto') {
        set('bindMode', body.bindMode)
      }

      if (restart) {
        try {
          writeSettingsFile(next)
          log('settings.file', Object.keys(next))
        } catch (error) {
          sendJson(res, 500, { error: `写入 settings.local.json 失败：${error?.message ?? error}` })
          return
        }
      }

      sendJson(res, 200, { ok: true, restartRequired: restart, runtime })
      if (restart) {
        // 给响应一点时间落地，再让插件按新配置重载。
        setTimeout(() => {
          try {
            reload()
          } catch (error) {
            log('settings.reload.error', String(error?.message ?? error))
          }
        }, 400)
      }
    },
  })

  return disposer
}
