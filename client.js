/**
 * Settings page for dsh-feishu-bot.
 * Registered into the shell's settings.section list; talks to the host
 * through /dsh-feishu-bot/config (src/configpage.js).
 */
window.__ModuleLoader__.load({
  id: 'dsh-feishu-bot',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const ENDPOINT = '/dsh-feishu-bot/config'
    const T = {
      bg: 'var(--dsw-alias-bg-layer-1)',
      bg2: 'var(--dsw-alias-bg-layer-2)',
      border: 'var(--dsw-alias-border-l1)',
      text: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
    }

    const inputStyle = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '7px 10px',
      borderRadius: 8,
      border: `1px solid ${T.border}`,
      background: T.bg2,
      color: T.text,
      fontSize: 13,
      fontFamily: 'inherit',
      outline: 'none',
    }

    function Field(props) {
      return h(
        'label',
        { style: { display: 'block', marginBottom: 16 } },
        h('div', { style: { fontSize: 13, fontWeight: 560, color: T.text, marginBottom: 4 } }, props.label),
        props.hint
          ? h('div', { style: { fontSize: 12, color: T.muted, marginBottom: 6, lineHeight: 1.5 } }, props.hint)
          : null,
        props.children,
      )
    }

    function Toggle(props) {
      return h(
        'label',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '10px 0',
            borderBottom: `1px solid ${T.border}`,
            cursor: 'pointer',
          },
        },
        h(
          'div',
          null,
          h('div', { style: { fontSize: 13, color: T.text } }, props.label),
          props.hint ? h('div', { style: { fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.5 } }, props.hint) : null,
        ),
        h('input', {
          type: 'checkbox',
          checked: Boolean(props.value),
          onChange: (event) => props.onChange(event.target.checked),
          style: { width: 16, height: 16, accentColor: T.brand, cursor: 'pointer' },
        }),
      )
    }

    function Card(props) {
      return h(
        'section',
        {
          style: {
            background: T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: '18px 20px',
            marginBottom: 16,
          },
        },
        props.title
          ? h('h3', { style: { margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: T.text } }, props.title)
          : null,
        props.description
          ? h('p', { style: { margin: '0 0 14px', fontSize: 12, color: T.muted, lineHeight: 1.6 } }, props.description)
          : null,
        props.children,
      )
    }

    function StatusPill({ label, value, tone }) {
      const color = tone === 'ok' ? T.ok : tone === 'warn' ? T.warn : tone === 'error' ? T.error : T.muted
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${T.border}`,
            background: T.bg2,
            fontSize: 12,
            color: T.text,
          },
        },
        h('span', { style: { width: 7, height: 7, borderRadius: 999, background: color, display: 'inline-block' } }),
        `${label}：${value}`,
      )
    }

    function SettingsPage() {
      const [loading, setLoading] = useState(true)
      const [snapshot, setSnapshot] = useState(null)
      const [error, setError] = useState('')
      const [saving, setSaving] = useState(false)
      const [saved, setSaved] = useState('')
      const [secret, setSecret] = useState('')
      const [form, setForm] = useState(null)

      const load = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const response = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          setSnapshot(data)
          setForm({
            appId: data.appId ?? '',
            remoteApproval: data.remoteApproval !== false,
            dualApproval: data.dualApproval !== false,
            approvalScope: data.approvalScope === 'read-only' ? 'read-only' : 'all',
            approvalTimeoutMin: Math.round((data.approvalTimeoutMs ?? 300000) / 60000),
            desktopDelayMs: data.desktopDelayMs ?? 2500,
            maxWaitMin: Math.round((data.maxWaitMs ?? 1800000) / 60000),
            notify: data.notify !== false,
            bindMode: data.bindMode === 'auto' ? 'auto' : 'code',
          })
        } catch (cause) {
          setError(`读不到配置：${cause?.message ?? cause}（确认插件已启用）`)
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        load()
      }, [load])

      const update = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))

      const save = async () => {
        if (!form) return
        setSaving(true)
        setSaved('')
        setError('')
        try {
          const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              appId: form.appId,
              ...(secret.trim() ? { appSecret: secret.trim() } : {}),
              remoteApproval: form.remoteApproval,
              dualApproval: form.dualApproval,
              approvalScope: form.approvalScope,
              approvalTimeoutMs: Number(form.approvalTimeoutMin) * 60000,
              desktopDelayMs: Number(form.desktopDelayMs),
              maxWaitMs: Number(form.maxWaitMin) * 60000,
              notify: form.notify,
              bindMode: form.bindMode,
            }),
          })
          const result = await response.json()
          if (!response.ok) throw new Error(result?.error ?? `HTTP ${response.status}`)
          setSecret('')
          setSaved(result.restartRequired ? '已保存，插件正在按新配置重载…' : '已保存')
          await load()
        } catch (cause) {
          setError(`保存失败：${cause?.message ?? cause}`)
        } finally {
          setSaving(false)
        }
      }

      if (loading && !form) return h('div', { style: { padding: 20, color: T.muted, fontSize: 13 } }, '正在连接插件…')

      if (error && !form) {
        return h(
          'div',
          { style: { padding: 20 } },
          h('p', { style: { color: T.error, fontSize: 13, marginBottom: 12 } }, error),
          h('button', { onClick: load, style: buttonStyle() }, '重试'),
        )
      }

      const connectionTone = snapshot?.connection === 'connected' ? 'ok' : snapshot?.connection === 'reconnecting' ? 'warn' : 'error'
      const connectionText = { connected: '已连接', reconnecting: '重连中', failed: '连接失败', idle: '未启动' }[snapshot?.connection] ?? snapshot?.connection

      return h(
        'div',
        { style: { padding: '4px 4px 40px', fontSize: 13, color: T.text, maxWidth: 760 } },
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 } },
          h(StatusPill, { label: '飞书', value: connectionText, tone: connectionTone }),
          h(StatusPill, { label: '待审批', value: String(snapshot?.pending ?? 0) }),
          h(StatusPill, { label: '绑定', value: snapshot?.openIds?.length ? '已绑定' : '未绑定' }),
        ),

        h(
          Card,
          {
            title: '飞书应用',
            description: '在开放平台「凭证与基础信息」里获取。App Secret 只写不读，保存后由插件写入 settings.local.json（已 git 忽略）。',
          },
          h(
            Field,
            { label: 'App ID', hint: '形如 cli_xxxxxxxxxxxxxxxx' },
            h('input', {
              style: inputStyle,
              value: form.appId,
              placeholder: 'cli_...',
              onChange: (event) => update('appId')(event.target.value),
            }),
          ),
          h(
            Field,
            { label: 'App Secret', hint: snapshot?.hasSecret ? '已配置（留空表示不修改）' : '尚未配置' },
            h('input', {
              style: inputStyle,
              type: 'password',
              value: secret,
              placeholder: snapshot?.hasSecret ? '••••••••（不修改请留空）' : '粘贴 App Secret',
              onChange: (event) => setSecret(event.target.value),
            }),
          ),
        ),

        h(
          Card,
          { title: '审批', description: '双端模式打开时，电脑确认框和飞书卡片同时等，先处理的一侧生效。' },
          h(Toggle, {
            label: '远程审批',
            hint: '关闭后所有审批只走电脑界面',
            value: form.remoteApproval,
            onChange: update('remoteApproval'),
          }),
          h(Toggle, {
            label: '双端模式',
            hint: '电脑和手机同时等待，另一侧同步结果',
            value: form.dualApproval,
            onChange: update('dualApproval'),
          }),
          h(
            Field,
            { label: '审批范围' },
            h(
              'select',
              {
                style: inputStyle,
                value: form.approvalScope,
                onChange: (event) => update('approvalScope')(event.target.value),
              },
              h('option', { value: 'all' }, '全部工具'),
              h('option', { value: 'read-only' }, '只读类（写/执行留电脑）'),
            ),
          ),
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 } },
            h(
              Field,
              { label: '手机侧超时（分钟）', hint: '单端模式生效；双端模式由总兜底控制' },
              h('input', {
                style: inputStyle,
                type: 'number',
                min: 1,
                max: 1440,
                value: form.approvalTimeoutMin,
                onChange: (event) => update('approvalTimeoutMin')(event.target.value),
              }),
            ),
            h(
              Field,
              { label: '抢答窗口（毫秒）', hint: '给手机先处理的窗口，超时才弹电脑框；0 = 立刻弹' },
              h('input', {
                style: inputStyle,
                type: 'number',
                min: 0,
                max: 60000,
                value: form.desktopDelayMs,
                onChange: (event) => update('desktopDelayMs')(event.target.value),
              }),
            ),
            h(
              Field,
              { label: '总兜底（分钟）', hint: '两端都没人处理时，最多等这么久' },
              h('input', {
                style: inputStyle,
                type: 'number',
                min: 1,
                max: 1440,
                value: form.maxWaitMin,
                onChange: (event) => update('maxWaitMin')(event.target.value),
              }),
            ),
          ),
        ),

        h(
          Card,
          { title: '通知与绑定' },
          h(Toggle, {
            label: '完成 / 报错通知',
            hint: '跑够 45 秒的轮次结束、或出错时推一条',
            value: form.notify,
            onChange: update('notify'),
          }),
          h(
            Field,
            { label: '首次绑定方式', hint: 'code：要求回本机日志里的 6 位码；auto：谁先发消息谁绑定' },
            h(
              'select',
              {
                style: inputStyle,
                value: form.bindMode,
                onChange: (event) => update('bindMode')(event.target.value),
              },
              h('option', { value: 'code' }, '绑定码（推荐）'),
              h('option', { value: 'auto' }, '自动绑定'),
            ),
          ),
        ),

        error ? h('p', { style: { color: T.error, fontSize: 12, margin: '0 0 10px' } }, error) : null,
        saved ? h('p', { style: { color: T.ok, fontSize: 12, margin: '0 0 10px' } }, saved) : null,

        h(
          'div',
          { style: { display: 'flex', gap: 10, alignItems: 'center' } },
          h('button', { onClick: save, disabled: saving, style: buttonStyle(true, saving) }, saving ? '保存中…' : '保存'),
          h('button', { onClick: load, disabled: saving, style: buttonStyle(false) }, '重新读取'),
          h('span', { style: { fontSize: 12, color: T.muted } }, '审批开关即时生效；连接类字段保存后会重载插件'),
        ),
      )
    }

    function buttonStyle(primary, busy) {
      return {
        padding: '7px 16px',
        borderRadius: 8,
        border: `1px solid ${primary ? 'transparent' : T.border}`,
        background: primary ? T.brand : T.bg2,
        color: primary ? '#fff' : T.text,
        fontSize: 13,
        cursor: busy ? 'progress' : 'pointer',
        opacity: busy ? 0.7 : 1,
        fontFamily: 'inherit',
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-feishu-bot',
              order: 30,
              label: () => '飞书机器人',
            },
            SettingsPage,
          ),
        )
      },
    }
  },
})
