# WsProtoServer

WebSocket 长连接 + Protobuf 数据同步服务端框架（Node.js / TypeScript），内置心跳检测、鉴权、单点登录、断线重连与增量同步示例。

## 运行

```bash
npm install
npm test                 # 端到端测试
npm run server           # 启动示例服务 ws://localhost:8080
npm run client -- alice  # 另开终端，可启动多个不同用户观察同步
```

## 目录

```
proto/message.proto          协议定义：Envelope{cmd, seq, payload} + 各消息体
src/protocol.ts              Cmd/错误码/关闭码、类型映射、编解码
src/Session.ts               单连接封装（发送、背压保护、关闭）
src/Heartbeat.ts             心跳 & 登录超时检测
src/Router.ts                cmd -> handler 路由、洋葱模型中间件、BizError 统一回错
src/WsProtoServer.ts         网络层：连接管理、内置 PING/LOGIN、广播
src/app/ServerApp.ts         应用层：模块注册、按依赖排序的生命周期、统一入口
src/app/Module.ts            业务模块基类
src/app/EventBus.ts          模块间事件（可通过声明合并扩展）
src/app/middlewares.ts       内置中间件：请求日志、令牌桶限流
src/client/WsProtoClient.ts  配套客户端：请求响应匹配、心跳、指数退避重连
examples/server.ts           服务端统一入口：集中注册所有模块
examples/sync/               数据同步模块示例（版本号 + 变更日志 + 推送）
test/e2e.ts                  端到端测试
```

业务模块不一定放在这个目录里，例如每日任务的 `TaskModule` / `WalletModule` 在 `../DailyTask/net/`。

## 协议

每一帧都是一个二进制的 `Envelope`：

| 字段 | 说明 |
| --- | --- |
| `cmd` | 命令号，决定 `payload` 用哪个 message 解码 |
| `seq` | 客户端请求自增序号，服务端响应原样带回；主动推送为 0 |
| `payload` | 内层消息体的 protobuf 二进制 |

处理出错时，服务端返回 `cmd = ERROR` 且 `seq` 与原请求相同，客户端据此 reject 对应的 Promise。

新增消息：先在 `message.proto` 中添加 message 和 Cmd，再在 `protocol.ts` 中同步 `Cmd`、`MessageMap`、`CMD_TYPE`（请求响应型的还要加 `ResponseMap`）。

## 心跳检测

| 层 | 机制 |
| --- | --- |
| 应用层 | 客户端每 `heartbeatInterval` 发送 `HEARTBEAT_PING`，服务端回复 `PONG`（附带 RTT）；间隔值在登录响应中由服务端下发 |
| 协议层兜底 | 服务端发现连接空闲超过 `interval` 时发送 WebSocket ping 帧，浏览器和 ws 库会自动回 pong |
| 服务端判定 | 任何入站数据都会刷新 `lastActive`；空闲超过 `heartbeatTimeout` 就 `terminate`（关闭码记为 4000） |
| 客户端判定 | 连续 `heartbeatMaxMiss` 个周期收不到任何数据，就主动断开并重连 |
| 登录超时 | 建连后 `authTimeout` 内没有完成登录，关闭连接（4001） |

## 使用：ServerApp（推荐）

```
            ServerApp（统一入口：register / use / get / start / stop）
   ┌──────────────┬───────────────┼────────────────┐
 中间件链       EventBus        Module × N          WsProtoServer（网络层）
 日志/限流     模块间事件     sync / wallet / task    连接、心跳、路由
```

```ts
const app = new ServerApp({ port: 8080, authenticate })
app.use(logRequests(logger)).use(rateLimit(20, 40))      // 所有请求都会经过
   .register(new SyncModule(), new TaskModule(), new WalletModule())
await app.start()   // 按 deps 排序：init -> 监听端口 -> start；缺依赖或循环依赖直接报错
await app.stop()    // 逆序 stop，自动取消模块的事件订阅和定时器
```

写一个模块：

```ts
export class TaskModule extends Module {
    readonly name = 'task'
    readonly deps = [WalletModule]                        // 保证 wallet 先初始化

    onInit() {
        this.handle(Cmd.TASK_CLAIM_REQ, (ctx, req) => {...})  // 注册协议处理器
        this.on('session:login', s => ...)                // 订阅事件，stop 时自动取消
    }
    onStart() { this.addDisposer(startTimer()) }          // 定时器等

    claim(userId, ids) {
        this.get(WalletModule).add(userId, gold, 'task')  // 直接调用其他模块
    }
}
```

模块间调用有两种方式：

| 方式 | 用法 | 适用场景 |
| --- | --- | --- |
| 直接调用 | 声明 `deps`，然后 `this.get(X).method()` | 需要返回值，强依赖 |
| 事件 | `this.emit('player:action', ...)` / `this.on(...)` | 通知类，发布方不关心谁在处理 |

事件类型通过声明合并扩展，`emit` 和 `on` 的参数都有类型检查：

```ts
declare module '../../WsProtoServer/src/app/EventBus' {
    interface AppEvents { 'player:action': [userId: string, kind: TaskKind, count: number] }
}
```

中间件采用洋葱模型（`await next()` 之前处理请求，之后处理响应），作用于所有请求，包括登录和心跳：

```ts
app.use(async (ctx, next) => {
    const start = Date.now()
    await next()                       // handler 抛出的错误也会经过这里
    console.log(Cmd[ctx.cmd], Date.now() - start)
})
```

## 使用：只用网络层

```ts
const server = new WsProtoServer({
    port: 8080,
    heartbeatInterval: 15_000,
    authenticate: async token => verifyToken(token), // 返回 userId 或 null
})

server.handle(Cmd.SYNC_REQ, (ctx, req) => {          // req 类型自动推导为 SyncReq
    ctx.reply(Cmd.SYNC_RSP, { version: 1, entries: [], full: true })
})
server.broadcast(Cmd.SYNC_PUSH, { version: 2, entries: [...] })
server.sendToUser('alice', Cmd.SYNC_PUSH, {...})

await server.start()
```

## 数据同步流程（examples/sync）

1. 服务端为每次修改分配递增的 `version`，并写入有长度上限的变更日志。
2. 客户端每次 `ready`（包括重连之后）发送 `SYNC_REQ{sinceVersion: 本地版本}`。如果日志还能覆盖这个版本，就返回增量；否则返回全量快照（`full = true`）。
3. `UPDATE_REQ` 提交修改后，服务端向所有在线连接广播 `SYNC_PUSH`。
4. 客户端收到推送时检查版本是否连续，发现缺口就重新拉取。同步过程中收到的推送先缓存，同步完成后再回放。
