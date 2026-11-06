/**
 * Settings page for dsh-feishu-bot — written for the person using it, not for
 * whoever maintains it: outcome-oriented labels, one "approval style" choice
 * instead of two raw booleans, and advanced knobs tucked away.
 *
 * Talks to the host through /dsh-feishu-bot/config (src/configpage.js).
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
      padding: '8px 11px',
      borderRadius: 8,
      border: `1px solid ${T.border}`,
      background: T.bg2,
      color: T.text,
      fontSize: 13,
      fontFamily: 'inherit',
      outline: 'none',
    }

    function primaryButton(busy) {
      return {
        padding: '8px 18px',
        borderRadius: 8,
        border: '1px solid transparent',
        background: T.brand,
        color: '#fff',
        fontSize: 13,
        cursor: busy ? 'progress' : 'pointer',
        opacity: busy ? 0.7 : 1,
        fontFamily: 'inherit',
      }
    }

    function ghostButton(busy) {
      return {
        padding: '8px 14px',
        borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: T.bg2,
        color: T.text,
        fontSize: 13,
        cursor: busy ? 'progress' : 'pointer',
        opacity: busy ? 0.7 : 1,
        fontFamily: 'inherit',
      }
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
          ? h('p', { style: { margin: '0 0 14px', fontSize: 12, color: T.muted, lineHeight: 1.7 } }, props.description)
          : null,
        props.children,
      )
    }

    function Field(props) {
      return h(
        'label',
        { style: { display: 'block', marginBottom: props.last ? 0 : 16 } },
        h('div', { style: { fontSize: 13, fontWeight: 560, color: T.text, marginBottom: 4 } }, props.label),
        props.hint
          ? h('div', { style: { fontSize: 12, color: T.muted, marginBottom: 6, lineHeight: 1.6 } }, props.hint)
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
            cursor: 'pointer',
          },
        },
        h(
          'div',
          null,
          h('div', { style: { fontSize: 13, color: T.text } }, props.label),
          props.hint ? h('div', { style: { fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.6 } }, props.hint) : null,
        ),
        h('input', {
          type: 'checkbox',
          checked: Boolean(props.value),
          onChange: (event) => props.onChange(event.target.checked),
          style: { width: 16, height: 16, accentColor: T.brand, cursor: 'pointer' },
        }),
      )
    }

    function ChoiceCard(props) {
      const active = props.value === props.current
      return h(
        'button',
        {
          type: 'button',
          onClick: () => props.onChange(props.value),
          'aria-pressed': active,
          style: {
            flex: '1 1 160px',
            textAlign: 'left',
            padding: '12px 14px',
            borderRadius: 10,
            border: `1.5px solid ${active ? T.brand : T.border}`,
            background: active ? T.bg2 : 'transparent',
            color: T.text,
            cursor: 'pointer',
            fontFamily: 'inherit',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } },
          h('span', {
            style: {
              width: 14,
              height: 14,
              borderRadius: 999,
              border: `1.5px solid ${active ? T.brand : T.border}`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          }, active ? h('span', { style: { width: 7, height: 7, borderRadius: 999, background: T.brand } }) : null),
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, props.title),
        ),
        h('div', { style: { fontSize: 12, color: T.muted, lineHeight: 1.6, paddingLeft: 22 } }, props.description),
      )
    }

    function Summary(props) {
      const tone = props.tone === 'ok' ? T.ok : props.tone === 'error' ? T.error : T.warn
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '16px 18px',
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            background: T.bg,
            marginBottom: 16,
          },
        },
        h('span', {
          style: {
            width: 10,
            height: 10,
            borderRadius: 999,
            background: tone,
            marginTop: 5,
            flex: 'none',
          },
        }),
        h(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontSize: 14, fontWeight: 600, color: T.text } }, props.title),
          h('div', { style: { fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.7 } }, props.description),
        ),
      )
    }

    function HelpPanel() {
      const commands = [
        ['列表', '看当前打开的会话和运行状态'],
        ['看 <会话号> [条数]', '看最近消息，默认 14 条'],
        ['待办', '列出挂起中的审批和剩余时间'],
        ['同意 / 拒绝 / 转电脑 <码>', '处理审批，也可以直接点卡片上的按钮'],
        ['远程 开|关', '远程审批总开关'],
        ['范围 全部|只读', '哪些操作可以在手机批'],
        ['双端 开|关', '电脑和手机是否同时等'],
        ['通知 开|关', '完成 / 报错提醒'],
        ['测试审批', '发一张测试卡片，验证按钮链路'],
        ['状态', '连接状态、待审批数、绑定身份'],
      ]
      return h(
        Card,
        { title: '怎么用', description: '在飞书里给机器人发这些指令。审批卡片上有四个按钮：同意 / 拒绝 / 看上下文 / 交给电脑。' },
        h(
          'div',
          { style: { marginBottom: 18 } },
          commands.map(([cmd, desc]) =>
            h(
              'div',
              {
                key: cmd,
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'minmax(150px, 220px) 1fr',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: `1px solid ${T.border}`,
                  alignItems: 'baseline',
                },
              },
              h(
                'code',
                {
                  style: {
                    fontSize: 12,
                    padding: '2px 7px',
                    borderRadius: 6,
                    background: T.bg2,
                    border: `1px solid ${T.border}`,
                    color: T.text,
                    justifySelf: 'start',
                  },
                },
                cmd,
              ),
              h('span', { style: { fontSize: 12, color: T.muted, lineHeight: 1.6 } }, desc),
            ),
          ),
        ),
        h('div', { style: { fontSize: 13, fontWeight: 560, marginBottom: 6 } }, '一次审批会发生什么'),
        h(
          'ul',
          { style: { margin: '0 0 18px', paddingLeft: 18, fontSize: 12, color: T.muted, lineHeight: 1.8 } },
          h('li', null, '需要授权时，飞书收到一张卡片；「两端同时」时电脑也会弹出确认框。'),
          h('li', null, '谁先处理谁生效：电脑先处理，卡片同步成同样结果；手机先处理，电脑框可直接关掉。'),
          h('li', null, '都没人处理时，超过「总兜底」就放弃本次操作，不会一直卡着。'),
          h('li', null, '点「看上下文」看该会话最近 5 条消息，卡片不变，看完再决定。'),
        ),
        h('div', { style: { fontSize: 13, fontWeight: 560, marginBottom: 6 } }, '出问题先看这几条'),
        h(
          'ul',
          { style: { margin: 0, paddingLeft: 18, fontSize: 12, color: T.muted, lineHeight: 1.8 } },
          h('li', null, '收不到卡片：先看 ~/.dsh-feishu/bridge.log 里有没有 approval.req，没有说明请求没到插件。'),
          h('li', null, '飞书没反应：确认上方状态是「已连接」。'),
          h('li', null, '事件订阅不生效：开放平台改完配置后必须发布新版本。'),
        ),
      )
    }

    function SettingsPage() {
      const [loading, setLoading] = useState(true)
      const [snapshot, setSnapshot] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [saving, setSaving] = useState(false)
      const [testing, setTesting] = useState(false)
      const [form, setForm] = useState(null)
      const [secret, setSecret] = useState('')
      const [editingApp, setEditingApp] = useState(false)
      const [advanced, setAdvanced] = useState(false)
      const [helpOpen, setHelpOpen] = useState(false)

      const load = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
          const response = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          setSnapshot(data)
          const mode = data.remoteApproval === false ? 'computer' : data.dualApproval === false ? 'phone' : 'both'
          setForm({
            mode,
            scope: data.approvalScope === 'read-only' ? 'read-only' : 'all',
            notify: data.notify !== false,
            appId: data.appId ?? '',
            timeoutMin: Math.round((data.approvalTimeoutMs ?? 300000) / 60000),
            delaySec: Math.round((data.desktopDelayMs ?? 2500) / 100) / 10,
            maxWaitMin: Math.round((data.maxWaitMs ?? 1800000) / 60000),
            bindMode: data.bindMode === 'auto' ? 'auto' : 'code',
          })
          setEditingApp(!data.appId)
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

      const post = async (payload) => {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error ?? `HTTP ${response.status}`)
        return result
      }

      const save = async () => {
        if (!form) return
        setSaving(true)
        setNotice('')
        setError('')
        try {
          const result = await post({
            appId: form.appId,
            ...(secret.trim() ? { appSecret: secret.trim() } : {}),
            remoteApproval: form.mode !== 'computer',
            dualApproval: form.mode === 'both',
            approvalScope: form.scope,
            notify: form.notify,
            approvalTimeoutMs: Number(form.timeoutMin) * 60000,
            desktopDelayMs: Math.round(Number(form.delaySec) * 1000),
            maxWaitMs: Number(form.maxWaitMin) * 60000,
            bindMode: form.bindMode,
          })
          setSecret('')
          setNotice(result.restartRequired ? '已保存，正在按新配置重连…' : '已保存')
          await load()
        } catch (cause) {
          setError(`保存失败：${cause?.message ?? cause}`)
        } finally {
          setSaving(false)
        }
      }

      const testMessage = async () => {
        setTesting(true)
        setNotice('')
        setError('')
        try {
          await post({ action: 'test' })
          setNotice('测试消息已发出，去飞书看看收到没有')
        } catch (cause) {
          setError(`发送失败：${cause?.message ?? cause}`)
        } finally {
          setTesting(false)
        }
      }

      if (loading && !form) return h('div', { style: { padding: 20, color: T.muted, fontSize: 13 } }, '正在连接插件…')

      if (error && !form) {
        return h(
          'div',
          { style: { padding: 20 } },
          h('p', { style: { color: T.error, fontSize: 13, marginBottom: 12 } }, error),
          h('button', { onClick: load, style: ghostButton(false) }, '重试'),
        )
      }

      const configured = Boolean(snapshot?.appId)
      const connected = snapshot?.connection === 'connected'
      const bound = Boolean(snapshot?.openIds?.length)
      const summary = !configured
        ? {
            tone: 'warn',
            title: '还没有配置飞书应用',
            description: '先在飞书开放平台创建一个自建应用，把 App ID 和 App Secret 填到下面，大约五分钟。',
          }
        : !connected
          ? {
              tone: 'error',
              title: '飞书连接断开',
              description: '插件连不上飞书。常见原因是开放平台没有把订阅方式设为「长连接」，或者应用版本没发布。',
            }
          : !bound
            ? {
                tone: 'warn',
                title: '已连接，等你在飞书里说句话',
                description: '在飞书里找到这个机器人，发一条消息完成绑定，之后才会把通知和审批发给你。',
              }
            : {
                tone: 'ok',
                title: '一切就绪',
                description: `已连接飞书，审批会发到你的飞书。${snapshot?.pending ? ` 当前有 ${snapshot.pending} 条待处理。` : ''}`,
              }

      return h(
        'div',
        { style: { padding: '4px 4px 40px', fontSize: 13, color: T.text, maxWidth: 760 } },

        h(Summary, summary),

        configured
          ? h(
              'div',
              { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 } },
              h('button', { onClick: testMessage, disabled: testing, style: primaryButton(testing) }, testing ? '发送中…' : '发送测试消息'),
              h('button', { onClick: () => setHelpOpen((open) => !open), style: ghostButton(false) }, helpOpen ? '收起用法' : '怎么用'),
            )
          : null,

        error ? h('p', { style: { color: T.error, fontSize: 12, margin: '0 0 12px' } }, error) : null,
        notice ? h('p', { style: { color: T.ok, fontSize: 12, margin: '0 0 12px' } }, notice) : null,

        helpOpen ? h(HelpPanel) : null,

        h(
          Card,
          {
            title: configured && !editingApp ? '飞书应用' : '连接飞书',
            description:
              configured && !editingApp
                ? undefined
                : '打开飞书开放平台 → 创建企业自建应用 → 拿到 App ID 和 App Secret。保存后插件会自动重连。',
          },
          configured && !editingApp
            ? h(
                'div',
                { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } },
                h(
                  'div',
                  { style: { fontSize: 13, color: T.text } },
                  h('code', { style: { fontSize: 12, color: T.muted } }, snapshot.appId),
                  h('span', { style: { fontSize: 12, color: T.muted, marginLeft: 10 } }, '凭证已保存'),
                ),
                h('button', { onClick: () => setEditingApp(true), style: ghostButton(false) }, '更换'),
              )
            : h(
                'div',
                null,
                h(
                  Field,
                  { label: 'App ID', hint: '开放平台「凭证与基础信息」里，形如 cli_xxxxxxxx' },
                  h('input', {
                    style: inputStyle,
                    value: form.appId,
                    placeholder: 'cli_...',
                    onChange: (event) => update('appId')(event.target.value),
                  }),
                ),
                h(
                  Field,
                  { label: 'App Secret', hint: snapshot?.hasSecret ? '已保存过；留空表示不修改' : '和 App ID 在同一页，只显示一次，建议直接粘贴', last: true },
                  h('input', {
                    style: inputStyle,
                    type: 'password',
                    value: secret,
                    placeholder: snapshot?.hasSecret ? '••••••••' : '粘贴 App Secret',
                    onChange: (event) => setSecret(event.target.value),
                  }),
                ),
              ),
        ),

        h(
          Card,
          { title: '审批怎么处理', description: '需要你授权时，用哪种方式问你。' },
          h(
            'div',
            { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 } },
            h(ChoiceCard, {
              title: '两端同时',
              description: '电脑弹框、手机卡片一起等，谁先点谁生效。',
              value: 'both',
              current: form.mode,
              onChange: update('mode'),
            }),
            h(ChoiceCard, {
              title: '只在手机',
              description: '电脑不弹框，全部到飞书处理。适合离开工位。',
              value: 'phone',
              current: form.mode,
              onChange: update('mode'),
            }),
            h(ChoiceCard, {
              title: '只在电脑',
              description: '关掉飞书审批，只发通知。',
              value: 'computer',
              current: form.mode,
              onChange: update('mode'),
            }),
          ),
          h(
            Field,
            { label: '允许在手机上批准哪些操作' },
            h(
              'select',
              {
                style: inputStyle,
                value: form.scope,
                onChange: (event) => update('scope')(event.target.value),
              },
              h('option', { value: 'all' }, '所有操作'),
              h('option', { value: 'read-only' }, '只读操作（更安全，写文件/执行命令仍需在电脑确认）'),
            ),
          ),
          h(
            'div',
            { style: { borderTop: `1px solid ${T.border}`, paddingTop: 6 } },
            h(Toggle, {
              label: '完成 / 报错时通知我',
              hint: '跑的时间比较长的任务结束、或中途出错时推一条',
              value: form.notify,
              onChange: update('notify'),
            }),
          ),
        ),

        h(
          'details',
          {
            style: { border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 16px', background: T.bg, marginBottom: 16 },
            open: advanced,
            onToggle: (event) => setAdvanced(event.currentTarget.open),
          },
          h(
            'summary',
            { style: { cursor: 'pointer', fontSize: 13, color: T.muted, outline: 'none' } },
            '高级设置（一般不用改）',
          ),
          h(
            'div',
            { style: { marginTop: 14 } },
            h(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 } },
              h(
                Field,
                { label: '手机等多久算超时', hint: '只在「只在手机」时生效，单位分钟' },
                h('input', {
                  style: inputStyle,
                  type: 'number',
                  min: 1,
                  max: 1440,
                  value: form.timeoutMin,
                  onChange: (event) => update('timeoutMin')(event.target.value),
                }),
              ),
              h(
                Field,
                { label: '先给手机多少秒', hint: '「两端同时」时，过这么多秒才弹电脑框，0 表示立刻弹' },
                h('input', {
                  style: inputStyle,
                  type: 'number',
                  min: 0,
                  max: 60,
                  step: 0.5,
                  value: form.delaySec,
                  onChange: (event) => update('delaySec')(event.target.value),
                }),
              ),
              h(
                Field,
                { label: '最多等多久', hint: '两端都没人处理时，超过就放弃本次操作，单位分钟' },
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
            h(
              Field,
              { label: '第一次在飞书说话时', hint: '绑定码更安全：要求回复本机日志里的 6 位码', last: true },
              h(
                'select',
                {
                  style: inputStyle,
                  value: form.bindMode,
                  onChange: (event) => update('bindMode')(event.target.value),
                },
                h('option', { value: 'code' }, '要求绑定码（推荐）'),
                h('option', { value: 'auto' }, '自动绑定'),
              ),
            ),
          ),
        ),

        h(
          'div',
          { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
          h('button', { onClick: save, disabled: saving, style: primaryButton(saving) }, saving ? '保存中…' : '保存'),
          h('button', { onClick: load, disabled: saving, style: ghostButton(false) }, '重新读取'),
          h('span', { style: { fontSize: 12, color: T.muted } }, '审批方式即时生效；凭证和高级设置保存后会重连一次'),
        ),
      )
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
