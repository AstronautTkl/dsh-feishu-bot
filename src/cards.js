/** 飞书卡片构造：纯函数，输入 entry 与展示选项，输出卡片 JSON。 */

export function cardText(content) {
  return { tag: 'div', text: { tag: 'lark_md', content } }
}

export function button(label, type, value) {
  return { tag: 'button', text: { tag: 'plain_text', content: label }, type, value }
}

export function approvalCardText(entry) {
  const lines = [
    `**会话**：${entry.sessionName}`,
    `**工具**：\`${entry.toolName}\`${entry.risky ? '  ⚠️ 写操作/执行类' : ''}`,
  ]
  if (entry.summary) lines.push(`**要执行**：${entry.summary}`)
  if (entry.reason) lines.push(`**原因**：${entry.reason}`)
  lines.push(`**码**：${entry.code}`)
  return lines.join('\n')
}

/**
 * @param entry 审批条目
 * @param timeoutMs 手机侧超时（毫秒，用于文案）
 * @param display {{ dual: boolean, onTimeout: 'delegate' | 'reject' }}
 */
export function buildApprovalCard(entry, timeoutMs, display = {}) {
  const minutes = Math.max(1, Math.round(timeoutMs / 60000))
  const note = display.dual
    ? '电脑端和手机端同时在等，任一侧处理即生效'
    : display.onTimeout === 'delegate'
      ? `${minutes} 分钟没操作会自动交回电脑确认`
      : `${minutes} 分钟没操作视为拒绝`
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
          button('看上下文', 'default', { op: 'context', code: entry.code }),
          button('交给电脑', 'default', { op: 'delegate', code: entry.code }),
        ],
      },
      { tag: 'note', elements: [{ tag: 'plain_text', content: note }] },
    ],
  }
}

export function doneCard(entry, outcome, byWhom) {
  const state =
    outcome === 'allowed-once'
      ? 'approved'
      : outcome === 'delegate'
        ? 'delegated'
        : outcome === 'timeout' || outcome === 'expired'
          ? 'timeout'
          : outcome === 'cancelled'
            ? 'cancelled'
            : 'rejected'
  const title =
    state === 'approved'
      ? '✅ 已同意'
      : state === 'delegated'
        ? '⏳ 已转交电脑'
        : state === 'timeout'
          ? '⌛ 手机侧已超时'
          : state === 'cancelled'
            ? '⌛ 已取消或超时'
            : '⛔ 已拒绝'
  const template = state === 'approved' ? 'green' : state === 'delegated' ? 'blue' : state === 'timeout' || state === 'cancelled' ? 'grey' : 'red'
  const note =
    state === 'delegated'
      ? '已交回 DSH 界面等待确认'
      : state === 'timeout'
        ? '电脑端仍在等待确认'
        : state === 'cancelled'
          ? byWhom === '总超时' ? '两端都没人处理，已放弃本次调用' : '本次调用已取消'
          : '两端已同步'
  return {
    config: { wide_screen_mode: true },
    header: { template, title: { tag: 'plain_text', content: title } },
    elements: [
      cardText(`**会话**：${entry.sessionName}\n**工具**：\`${entry.toolName}\`\n**码**：${entry.code}${byWhom ? `\n**操作人**：${byWhom}` : ''}`),
      { tag: 'note', elements: [{ tag: 'plain_text', content: note }] },
    ],
  }
}
