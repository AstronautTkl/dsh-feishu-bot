# dsh-feishu-bot

把 [DSH](https://deepseek.com) 的会话状态、待审批请求和会话内容接到飞书（Lark）自建应用机器人上。走**长连接**，不需要公网地址、不需要内网穿透。

- 手机收通知：会话跑完、报错
- 手机做审批：工具授权请求弹成卡片，点「同意 / 拒绝 / 交给电脑」
- 手机看内容：`看 <会话号>`、`列表`、`待办`

> English: see [README.en.md](./README.en.md).

## 它解决什么问题

DSH 只有桌面界面，审批只能在电脑前点。离开工位几小时，任务就卡在等授权上。这个插件把审批搬到飞书：**不是**把界面搬上手机，而是把「需要你决定的事」抽出来发到手机上。

## 环境要求

- 能安装插件的 DSH（在 DSH 0.1.x 上测试通过；内部事件 API 可能随版本变化，见「兼容性」）
- Node.js ≥ 20
- 一个飞书团队（免费版够用）和一个自建应用

## 一、飞书后台配置（约 5 分钟）

1. 打开 <https://open.feishu.cn/app>，用团队管理员登录
2. **创建应用 → 企业自建应用**，填名称和描述
3. **添加应用能力 → 机器人**
4. **权限管理**，开通：
   - 获取与发送单聊、群组消息 `im:message`
   - 以应用的身份发消息 `im:message:send_as_bot`
   - 读取用户发给机器人的单聊消息 `im:message.p2p_msg:readonly`
   - 获取群组中@机器人的消息 `im:message.group_at_msg:readonly`（用群时）
   - 获取群组信息 `im:chat:readonly`
5. **事件与回调**
   - 事件配置 → 订阅方式选 **长连接** → 添加事件「接收消息」`im.message.receive_v1`
   - 回调配置 → 同样选 **长连接** → 添加回调「卡片回传交互」`card.action.trigger`
6. **创建版本 → 申请发布 → 管理员审核通过**（不发布，事件订阅不生效，这是最常见的坑）
7. **凭证与基础信息** 里复制 **App ID** 和 **App Secret**

## 二、安装插件

```bash
git clone https://github.com/<you>/dsh-feishu-bot.git
cd dsh-feishu-bot
npm install --omit=dev
```

然后在 DSH 里安装这个 bundle（绝对路径指向这个目录）：

```
plugin_manager(action: "install_bundle", target: "<绝对路径>/dsh-feishu-bot")
```

长连接只对「企业自建应用」生效，国际版 Lark 不支持。

## 三、配置

推荐把 App Secret 存成 DSH 凭据，配置文件里只留 App ID：

```yaml
- insert:
    - id: dsh-feishu-bot
      name: dsh-feishu-bot
      config:
        appId: cli_xxxxxxxxxxxxxxxx
```

开发时也可以用包目录下的 `settings.local.json`（已在 `.gitignore` 里），它会覆盖上面配置：

```json
{ "appId": "cli_xxx", "appSecret": "xxx", "sdkPath": "/abs/path/to/node_modules/@larksuiteoapi/node-sdk/lib/index.js" }
```

| 键 | 默认 | 说明 |
|---|---|---|
| `appId` | — | 飞书自建应用 App ID |
| `appSecret` | — | 可选；不写则用凭据 `DSH_FEISHU_APP_SECRET` |
| `sdkPath` | — | 仅开发用：SDK 入口文件的绝对路径 |
| `remoteApproval` | `true` | 是否拦截审批并转到飞书 |
| `approvalScope` | `all` | `all` 全部工具；`read-only` 只放只读类 |
| `approvalTimeoutMs` | `300000` | 审批超时 |
| `onTimeout` | `delegate` | 超时后 `delegate` 交回电脑，`reject` 直接拒绝 |
| `bindMode` | `code` | `code` 首条消息要回本机日志里的 6 位码；`auto` 直接绑定 |
| `notify` | `true` | 完成/报错通知 |
| `notifyMinRunMs` | `45000` | 只有跑够这么久的轮次才发完成通知 |
| `approvableTools` | `[]` | 额外允许远程审批的工具名 |
| `logVerbose` | `false` | 是否把消息正文写进日志 |

## 四、命令

| 命令 | 作用 |
|---|---|
| `帮助` | 指令清单 |
| `列表` | 打开的会话 + 运行状态 |
| `看 <会话号> [条数]` | 最近消息，默认 14 条 |
| `待办` | 挂起中的审批 |
| `同意/拒绝/转电脑 <码>` | 处理审批（也可点卡片按钮） |
| `远程 开\|关` | 远程审批总开关 |
| `范围 全部\|只读` | 哪些工具可以在手机批 |
| `通知 开\|关` | 完成/报错提醒 |
| `测试审批` | 发一张测试卡片，验证按钮链路 |
| `绑定 <码>` | 首次绑定主人 |
| `状态` | 服务状态 |

## 五、安全模型

- 只认绑定过的 `open_id`，其他人发消息一律忽略
- 首次绑定要回**本机日志**里的 6 位码，防陌生人先搭话绑定
- 审批是一次性授权（`allowed-once`），码随机、随审批消亡
- 超时默认**交回电脑**而不是放行
- App Secret 存 DSH 凭据库，不落配置文件
- 状态与日志在 `~/.dsh-feishu/`（`bridge.log` 超过 2MB 自动切分）

**把审批搬到手机等于把授权通道放到手机上。** 请只在自己的设备上绑定，必要时用 `远程 关` 整体停用。

## 六、实现要点（给维护者）

1. **监听必须注册在 `ctx.root`。** `approval/request` 等带作用域的事件从 agent 自己的上下文派发，只向祖先链冒泡；插件上下文是 root 的兄弟分支，挂在它上面收不到。
2. **必须 `prepend`。** 桌面端的 answerer 在同一个 waterfall 上更靠前，它决定完不会调 `next()`，排在后面的监听器永远轮不到。
3. **飞书事件回调 3 秒内必须返回。** 任何等待（等审批结果、长任务）都必须脱离回调执行，否则飞书会重投事件，同一条消息被执行多次。
4. **消息按 `message_id` 去重**，兜住重投。
5. 审批卡片直接返回更新后的卡片，不在回调里再发一次 API。

## 七、兼容性与排查

- 内部 API（`approval/request` 的作用域、waterfall 顺序）不是稳定契约，DSH 升级后建议先发 `测试审批` 自检
- 没有卡片：先看 `~/.dsh-feishu/bridge.log` 里有没有 `approval.req`；没有说明请求没到插件，不是飞书的问题
- 没有通知：确认 `通知 开`，且轮次跑超过 45 秒
- 事件不生效：检查飞书后台是否**发布了新版本**
- `Cannot find package '@larksuiteoapi/node-sdk'`：在插件目录执行 `npm install --omit=dev`

## License

MIT
