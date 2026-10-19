# 每日任务（Daily Task）

一个完整的业务功能示例，演示 [MVVM_MVC 框架](../MVVM_MVC/README.md)、[弹窗系统](../Popup/README.md)、[红点系统](../RedDot/README.md) 如何协同工作。

功能：每天 4 个任务，服务器推送进度；完成后可以单个领取或一键领取金币；有可领取的任务时主界面按钮亮红点；面板显示距离每日重置的倒计时；跨天自动重置。

```
FakeTaskServer ──推送 / 接口──▶ TaskModel ──syncRedDotMap──▶ redDot ──redDotSignal──▶ 入口按钮（MVC）
                                   │                                                      │ 点击
                                   │                                     popup.open('DailyTask')
                                   └──────computed──▶ TaskPanelViewModel ──绑定──▶ 任务面板（MVVM，弹窗）
```

---

## 1. 文件结构

| 文件 | 层 | 作用 |
| --- | --- | --- |
| `TaskModel.ts` | Model | 数据类型、`TaskApi` 服务器接口、`TaskModel`（任务镜像 + 领取规则）、`WalletModel` |
| `FakeTaskServer.ts` | 数据源 | 模拟服务器：实现 `TaskApi`，`simulateProgress` / `simulateDailyReset` 模拟服务器事件 |
| `Clock.ts` | 基础设施 | 时钟抽象 `Clock`、手动时钟 `ManualClock`、重置时间与倒计时格式化 |
| `TaskRedDot.ts` | 红点 | `setupTaskRedDot`：可领取任务 → `Main/Task/Item/{id}`，入口 `Main/Task` 自动汇总 |
| `TaskPanelViewModel.ts` | MVVM | 面板 ViewModel：排序后的列表、倒计时、领取 / 一键领取命令、错误提示 |
| `TaskPanel.ts` | MVVM | 面板 View + `@PopupWindow('DailyTask')` 注册 + `configureDailyTask` 依赖配置 |
| `TaskEntry.ts` | MVC | 主界面入口按钮：显示红点、点击打开面板 |
| `demo.ts` | — | 完整流程演示 |
| `test.ts` | — | ViewModel 单元测试（不依赖 UI 和弹窗管理器） |

另外在共享模块中登记了：`PopupDataMap.DailyTask` / `PopupPriority.DailyTask`（`Popup/PopupManager.ts`），`RedDotPath.Task` / `RedDotPath.TaskItem`（`RedDot/RedDotManager.ts`）。

```bash
cd TypeScripts
tsc
node dist/AIFramework/DailyTask/demo.js
node dist/AIFramework/DailyTask/test.js
```

---

## 2. 接入步骤（应用启动时）

```ts
const wallet = new WalletModel(gold)
const tasks = new TaskModel(new HttpTaskApi(), wallet)    // 真实项目实现 TaskApi 即可
configureDailyTask({ tasks, wallet, clock: systemClock }) // 面板由弹窗管理器 new，依赖在这里提供
setupTaskRedDot(redDot, tasks)                            // 红点从 TaskModel 自动推导
await tasks.load()

new TaskEntryController(entryView, tasks, redDot).start() // 主界面入口
```

之后任何地方想打开面板都只需要 `popup.open('DailyTask', { focusTaskId })`。

---

## 3. 各层职责

**Model（`TaskModel`）**
- 服务器是权威数据源，`TaskModel` 是客户端镜像：订阅推送更新进度，跨天推送整份替换；
- 业务规则集中在这里：只有 `claimable` 状态才能领取（客户端先过滤，服务器再校验）；
- 领取成功后任务状态和金币在一个 `batch` 里修改，界面不会看到"已领取但金币没到账"的中间状态；
- 任务状态 `statusOf(task)` 是派生出来的，不单独存储，避免状态不一致。

**MVVM 面板（`TaskPanelViewModel` + `TaskPanelView`）**
- `items`：可领取的排最前、已领取的沉底，并标记要高亮的任务，View 拿来直接渲染；
- `claim` / `claimAll` 是 `AsyncCommand`：默认 drop 策略防连点，并且通过 `canExecute` 互斥，任意一个请求进行中两个都不可点；
- 所有命令的错误都转成 `toast` 显示，不上报（这些是业务提示，不是程序错误）；
- 倒计时的定时器登记在 `activeDisposables`：面板被抢占或关闭时自动停止，恢复时重新开始；
- 首次激活时如果还没有数据，自动加载。

**MVC 入口（`TaskEntryController`）**
- 一个按钮 + 一个红点，用 MVC 写更直接：`observe` 红点 → `renderBadge`，`listen('open')` → `popup.open`。

**红点（`setupTaskRedDot`）**
- 用 `syncRedDotMap` 从 `TaskModel` 推导：任务变为可领取时创建红点，领取或重置后 remove，祖先自动扣减；
- 业务代码里没有任何一处手动 `redDot.set`。

---

## 4. 测试

`TaskPanelViewModel` 不引用 View，也不依赖弹窗管理器，所以测试里直接 `new` + `init` + `activate`，配合 `FakeTaskServer`（延迟为 0）和 `ManualClock`，覆盖了：

- 自动加载、倒计时走动、停用后倒计时停止；
- 推送进度后的排序和红点；
- 领取成功（金币、状态、红点、提示）、领取未完成的任务被拒绝；
- 一键领取置灰、请求进行中的互斥与防连点；
- 网络错误后数据不变、重试成功；
- 跨天重置。

---

## 5. 接入 WsProtoServer（`net/`）

用 [WsProtoServer](../WsProtoServer/README.md)（WebSocket 长连接 + Protobuf + 心跳）替换 `FakeTaskServer`，**`TaskModel` 及以上各层一行不改**。

| 文件 | 端 | 作用 |
| --- | --- | --- |
| `net/TaskModule.ts` | 服务端模块 | 按玩家保存任务；处理 `TASK_FETCH_REQ` / `TASK_CLAIM_REQ`（服务器校验领取，并调用 `WalletModule` 发金币）；订阅 `player:action` 事件或直接调用 `addProgress`，进度只推送给对应玩家；订阅 `session:login` 完成「每日登录」；跨天时推送 reset |
| `net/WalletModule.ts` | 服务端模块 | 服务器端保存金币，`add` 后发出 `wallet:changed` 事件 |
| `net/WsTaskApi.ts` | 客户端 | 用 `WsProtoClient` 实现 `TaskApi`；服务端错误信息直接作为界面提示；断线重连后重新拉取，以 `reset` 推送交给 `TaskModel` |
| `net/test.ts` | — | 端到端测试：真实网络下的推送隔离、领取校验、跨天、断线重连，以及 ViewModel 一键领取 |

协议在 `WsProtoServer/proto/message.proto` 的「每日任务」部分（`TaskInfo`、`TaskFetchRsp`、`TaskClaimReq/Rsp`、`TaskPush`）。

```ts
// 服务端：在统一入口（WsProtoServer/examples/server.ts）里注册
app.register(new TaskModule(), new WalletModule())
await app.start()
app.events.emit('player:action', userId, 'battle', 1) // 战斗模块发事件，或者：
app.get(TaskModule).addProgress(userId, 'battle')      // 直接调用

// 客户端：只换 TaskApi 的实现
const client = new WsProtoClient({ url, token })
await client.connect()
const tasks = new TaskModel(new WsTaskApi(client), wallet)
```

`net/` 依赖 `ws`，所以由 WsProtoServer 子项目检查和运行，上层 `tsconfig.json` 已经把它排除：

```bash
cd TypeScripts/AIFramework/WsProtoServer
npm run typecheck
npm run task:test
```

---

## 6. 换成真实项目时要改的地方

| 演示中的实现 | 真实项目 |
| --- | --- |
| `FakeTaskServer` | 实现 `TaskApi`：`fetch` / `claim` 走 HTTP，`subscribe` 走 WebSocket 推送 |
| `ManualClock` | `systemClock`；重置时间按服务器时区计算（`nextResetAt` 目前简化为 UTC 零点） |
| `TaskPanelView` / `TaskEntryView`（console） | 引擎里的真实界面，只需继承 `MvvmView` / `MvcView` 并实现绑定，ViewModel、Controller、Model 不用改 |
| `toast` 一直保留到下一条 | 在 View 里做自动消失的动画 |
