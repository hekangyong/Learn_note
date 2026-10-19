/**
 * 服务端统一入口：所有业务模块在这里集中注册
 *
 * 运行：npm run server
 */
import { CloseCode, consoleLogger, logRequests, rateLimit, ServerApp } from '../src'
import { TaskModule } from '../../DailyTask/net/TaskModule'
import { WalletModule } from '../../DailyTask/net/WalletModule'
import { SyncModule } from './sync/SyncModule'

const logger = consoleLogger()

const app = new ServerApp({
    port: Number(process.env.PORT ?? 8080),
    heartbeatInterval: 5_000,
    heartbeatTimeout: 15_000,
    logger,
    // 示例鉴权：token 形如 "user:alice"
    authenticate: token => (token.startsWith('user:') ? token.slice(5) : null),
})

app.use(logRequests(logger.child('req')))
    .use(rateLimit(20, 40))
    // 注册顺序无所谓，启动时按 deps 排序：wallet -> task
    .register(new SyncModule(), new TaskModule(), new WalletModule())

app.events.on('session:login', s => logger.info(`login ${s.userId} (${s.id} ${s.remoteAddress})`))
app.events.on('session:logout', (s, code) => logger.info(`logout ${s.userId} ${CloseCode[code] ?? code}`))
app.events.on('wallet:changed', (userId, gold, delta, reason) =>
    logger.info(`wallet ${userId} ${delta >= 0 ? '+' : ''}${delta} = ${gold} (${reason})`)
)

app.start().catch(err => {
    logger.error('start failed', err)
    process.exit(1)
})

process.on('SIGINT', async () => {
    await app.stop()
    process.exit(0)
})
