# dsh-feishu-bot

Bring DSH session status, pending approvals and conversation content to a Feishu (Lark) self-built bot over a **long connection** — no public URL, no tunnel.

- Notifications on your phone when a run finishes or errors
- Approve tool calls from your phone: cards with **Approve / Reject / Hand to desktop**
- Read conversations: `list`, `view <session>`, `pending`

## What it solves

DSH's UI is desktop-only, so approvals wait until you are back at the keyboard. This plugin moves the decisions — not the whole UI — to Feishu, so a long task can keep moving while you are away.

## Requirements

- DSH with plugin support (tested on DSH 0.1.x)
- Node.js ≥ 20
- A Feishu team (free tier is enough) and a self-built app

## 1. Feishu console

1. Open <https://open.feishu.cn/app> and sign in as a team admin
2. **Create app → Enterprise self-built app**
3. **Add app capability → Bot**
4. **Permissions**: `im:message`, `im:message:send_as_bot`, `im:message.p2p_msg:readonly`, `im:message.group_at_msg:readonly` (groups), `im:chat:readonly`
5. **Events & Callbacks**
   - Event configuration → subscription mode **Long connection** → event `im.message.receive_v1`
   - Callback configuration → **Long connection** → callback `card.action.trigger`
6. **Create version → request release → approve as admin** (nothing works before the release is live)
7. Copy **App ID** and **App Secret** from Credentials

## 2. Install

```bash
git clone https://github.com/<you>/dsh-feishu-bot.git
cd dsh-feishu-bot
npm install --omit=dev
```

Then install the bundle in DSH with its absolute path:

```
plugin_manager(action: "install_bundle", target: "<abs-path>/dsh-feishu-bot")
```

Long connection is only available for self-built apps on the China site; Lark (international) does not support it.

## 3. Configure

```yaml
- insert:
    - id: dsh-feishu-bot
      name: dsh-feishu-bot
      config:
        appId: cli_xxxxxxxxxxxxxxxx
```

For development you can put `appId`, `appSecret` and `sdkPath` in `settings.local.json` next to the package (git-ignored); it overrides the config above.

| Key | Default | Meaning |
|---|---|---|
| `appId` | — | Feishu app ID |
| `appSecret` | — | Optional; otherwise the credential `DSH_FEISHU_APP_SECRET` is used |
| `sdkPath` | — | Development only: absolute path to the SDK entry file |
| `remoteApproval` | `true` | Route approvals to Feishu |
| `approvalScope` | `all` | `all` or `read-only` |
| `dualApproval` | `true` | Desktop prompt and Feishu card wait together; the first decision wins and the other side is synced |
| `desktopDelayMs` | `2500` | Grace window for the phone before the desktop prompt opens; `0` opens it immediately |
| `approvalTimeoutMs` | `300000` | Approval timeout |
| `onTimeout` | `delegate` | `delegate` back to desktop, or `reject` |
| `bindMode` | `code` | `code` requires the 6-digit code from the local log on first contact |
| `notify` | `true` | Completion/error notifications |
| `notifyMinRunMs` | `45000` | Only notify for runs at least this long |
| `approvableTools` | `[]` | Extra tools allowed for remote approval |
| `logVerbose` | `false` | Log message bodies |

## 4. Commands

`help` · `list` · `view <id> [n]` · `pending` · `approve/reject/delegate <code>` · `remote on|off` · `scope all|read-only` · `dual on|off` · `notify on|off` · `test-approval` · `bind <code>` · `status`

## 5. Security

- Only the bound `open_id` is served
- First binding requires a 6-digit code printed in the local log
- Approvals are one-shot (`allowed-once`)
- Timeout delegates back to the desktop instead of allowing
- App Secret lives in DSH's credential store, not in configuration

Moving approvals to a phone moves the authorization channel to a phone. Bind only your own device, and use `remote off` when you don't need it.

## 6. Implementation notes

1. Listeners must be registered on **`ctx.root`**: scoped events dispatch from the agent's own context and only bubble to ancestors.
2. They must **prepend**: the desktop answerer sits earlier in the same waterfall and never calls `next()`.
3. Feishu callbacks must answer within **3 seconds**; anything slow has to be detached, or Feishu re-delivers and commands run twice.
4. Messages are de-duplicated by `message_id`.
5. Card callbacks return the updated card inline instead of issuing another API call.
6. **Dual mode**: `next()` opens the desktop prompt while a Feishu card is sent; `Promise.race` takes the first decision, and a desktop-first outcome patches the card through `settle`. A phone-first outcome leaves the desktop prompt to be dismissed, and its late answer is ignored.

## 7. Troubleshooting

- No card: check `~/.dsh-feishu/bridge.log` for `approval.req`; missing means the request never reached the plugin
- No notification: `notify on`, and the run must exceed 45 seconds
- Events not arriving: make sure a new app **version was released**
- `Cannot find package '@larksuiteoapi/node-sdk'`: run `npm install --omit=dev` in the package directory

## License

MIT
