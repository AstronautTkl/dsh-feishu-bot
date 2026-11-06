# dsh-feishu-bot

[![test](https://github.com/AstronautTkl/dsh-feishu-bot/actions/workflows/test.yml/badge.svg)](https://github.com/AstronautTkl/dsh-feishu-bot/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](#requirements)
[![version](https://img.shields.io/github/package-json/v/AstronautTkl/dsh-feishu-bot?filename=package.json)](https://github.com/AstronautTkl/dsh-feishu-bot/releases)

Put DSH's **approvals** and **progress** into Feishu (Lark): get notified when a run finishes, approve tool calls from your phone, and stop babysitting the desktop.

> For people who run long DSH tasks and are not always at the keyboard.
> Uses Feishu's long connection — **no public URL, no tunnel**.

---

## What it does

| When | What you get |
|---|---|
| A tool needs authorization | A Feishu card: `Approve / Reject / Context / Hand to desktop` |
| A long run finishes | "Turn finished" plus the last few messages |
| Something errors | A short error summary |
| You want to check in | Send `list` / `view 3f2a` to read sessions and messages |

The desktop is unaffected: in "both" mode it still shows its own confirmation, and whichever side answers first wins.

---

## Five-minute setup

### 1. Create a bot in Feishu (~3 min)

1. Open <https://open.feishu.cn/app> as a team admin
2. **Create app → Enterprise self-built app**
3. **Add app capability → Bot**
4. **Permissions**: send/receive messages (`im:message`, `im:message:send_as_bot`), read messages sent to the bot (`im:message.p2p_msg:readonly`), group mentions (`im:message.group_at_msg:readonly`), chat info (`im:chat:readonly`)
5. **Events & Callbacks**
   - Event configuration → subscription mode **Long connection** → event `im.message.receive_v1`
   - Callback configuration → **Long connection** → callback `card.action.trigger`
6. **Create version → request release → approve as admin**

   > The step people miss. Without a released version, subscriptions do not fire and the plugin looks "connected but deaf".

7. Copy **App ID** and **App Secret**

### 2. Install into DSH

```bash
git clone https://github.com/<you>/dsh-feishu-bot.git
cd dsh-feishu-bot
npm install --omit=dev
```

Then install the bundle with its absolute path:

```
plugin_manager(action: "install_bundle", target: "/abs/path/dsh-feishu-bot")
```

### 3. Configure in Settings

Open **Settings → Feishu bot**, paste App ID and App Secret, save. The status should turn into **"Everything is ready"**.

### 4. Bind your account in Feishu

Send `help` to the bot in a direct chat. The first time it asks for a binding code: open `~/.dsh-feishu/bridge.log`, find the last `bind.code`, and reply `bind 123456`.

### 5. Verify

- Settings → **Send test message** → Feishu should receive it immediately
- Send `test-approval` in Feishu → approve the card → it should turn green

---

## Day-to-day

Commands: `list` · `view <id> [n]` · `pending` · `approve/reject/delegate <code>` · `remote on|off` · `scope all|read-only` · `dual on|off` · `notify on|off` · `test-approval` · `status`

The approval card has four buttons: **Approve**, **Reject**, **Context** (last 5 messages), **Hand to desktop**.

### Approval styles

| Style | Feishu | Desktop | Good for |
|---|---|---|---|
| **Both** (default) | card | prompt | most of the time; first answer wins |
| **Phone only** | card | none | away from the desk |
| **Desktop only** | notification | prompt | approvals must not leave the machine |

"Both" gives the phone a 2.5 s head start: answer there and the desktop prompt never appears. Configurable in Advanced.

---

## Troubleshooting

- **Nothing arrives**: check the status is "connected"; usually the subscription mode is not "long connection", or the app version was never released.
- **Card buttons do nothing**: look for `card.action` in `~/.dsh-feishu/bridge.log`; if missing, the callback (`card.action.trigger`) is not configured or not released.
- **Connection dropped**: `ws.state` in the log. `reconnecting` retries automatically; `failed` usually means wrong credentials.
- **Too noisy**: notifications only fire for runs longer than 45 s or on errors. `notify off` disables them.

## Security

- Only the bound Feishu account is served; binding needs a code printed in the local log.
- Approvals are one-shot; nothing is remembered.
- Timeouts delegate to the desktop instead of allowing.
- The app secret is write-only in the UI.
- Want tighter control? Set the approval scope to **read-only**.

## Uninstall

```
plugin_manager(action: "remove_bundle", target: "dsh-feishu-bot")
```
Optionally delete `~/.dsh-feishu/`.

## Development

```
index.js          entry: connection, commands, approval coordination, listeners
client.js         settings page (registered into the DSH settings sidebar)
src/format.js     pure formatting helpers
src/state.js      local state / log / settings.local.json
src/cards.js      Feishu card builders
src/configpage.js HTTP endpoints behind the settings page
test/             unit tests
```

```bash
node --test     # no Feishu SDK, no network
```

Three traps worth reading before changing code:

1. Scoped events such as `approval/request` must be registered on **`ctx.root`**.
2. They must **prepend**, or the desktop answerer decides first and never calls `next()`.
3. Feishu callbacks must answer within **3 seconds**; anything slow has to be detached.

## License

MIT
