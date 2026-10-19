import { WsProtoClient } from '../src'
import { SyncClient } from './sync/SyncClient'

// 用法: npm run client -- alice
const user = process.argv[2] ?? 'alice'
const client = new WsProtoClient({
    url: process.env.URL ?? 'ws://localhost:8080',
    token: `user:${user}`,
})
const sync = new SyncClient(client)

client
    .on('ready', (rsp, reconnected) =>
        console.log(`[ready] user=${rsp.userId} heartbeat=${rsp.heartbeatInterval}ms reconnected=${reconnected}`)
    )
    .on('disconnect', (code, reason) => console.log(`[disconnect] ${code} ${reason}`))
    .on('reconnecting', (n, delay) => console.log(`[reconnecting] #${n} in ${delay}ms`))
    .on('rtt', ms => console.log(`[heartbeat] rtt=${ms}ms`))
    .on('fatal', err => console.error(`[fatal] ${err.message}`))

sync.on('change', entries =>
    console.log(`[sync v${sync.version}]`, entries.map(e => `${e.key}=${e.deleted ? '<deleted>' : e.value}`).join(', '))
)

client.connect().then(async () => {
    // 每 3 秒写一次数据，其他客户端会收到推送
    let n = 0
    setInterval(() => {
        sync.set(`${user}.counter`, String(++n)).catch(err => console.error(err.message))
    }, 3000)
})
