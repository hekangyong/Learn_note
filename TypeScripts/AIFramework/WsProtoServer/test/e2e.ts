import assert from 'assert'
import { WebSocket } from 'ws'
import {
    CloseCode,
    Cmd,
    ErrorCode,
    Module,
    ServerApp,
    ServerError,
    WsProtoClient,
    consoleLogger,
    decode,
    encode,
    rateLimit,
} from '../src'
import { SyncClient } from '../examples/sync/SyncClient'
import { SyncModule } from '../examples/sync/SyncModule'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function waitFor(cond: () => boolean, timeout = 3000) {
    const start = Date.now()
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout')
        await sleep(20)
    }
}

/** 不实现任何心跳、也不自动回协议层 pong 的"哑"客户端 */
function rawSocket(url: string) {
    const ws = new WebSocket(url, { autoPong: false })
    const closed = new Promise<number>(r => ws.on('close', code => r(code)))
    const opened = new Promise<void>(r => ws.on('open', () => r()))
    return { ws, closed, opened }
}

async function main() {
    const app = new ServerApp({
        port: 0,
        heartbeatInterval: 200,
        heartbeatTimeout: 600,
        authTimeout: 500,
        logger: consoleLogger('app', true),
        authenticate: t => (t.startsWith('user:') ? t.slice(5) : null),
    })
    // 只对 limited 用户限流，避免影响其他用例
    const limiter = rateLimit(1, 2)
    app.use((ctx, next) => (ctx.session.userId === 'limited' ? limiter(ctx, next) : next()))
    app.register(new SyncModule())
    const server = app.server
    const disconnects: number[] = []
    server.on('disconnect', (_s, code) => disconnects.push(code))
    await app.start()
    const url = `ws://127.0.0.1:${server.port}`
    const mk = (user: string) =>
        new WsProtoClient({ url, token: `user:${user}`, reconnectBaseDelay: 50 })

    const tests: [string, () => Promise<void>][] = [
        ['codec roundtrip', async () => {
            const p = decode(encode(Cmd.SYNC_PUSH, { version: 3, entries: [{ key: 'a', value: '1', version: 3 }] }, 7))
            assert.equal(p.cmd, Cmd.SYNC_PUSH)
            assert.equal(p.seq, 7)
            assert.deepEqual((p.body as any).entries[0], { key: 'a', value: '1', version: 3, deleted: false })
        }],

        ['login fail -> fatal', async () => {
            const c = new WsProtoClient({ url, token: 'bad' })
            await assert.rejects(c.connect(), (e: any) => e instanceof ServerError && e.code === ErrorCode.AUTH_FAILED)
        }],

        ['request before login -> NOT_LOGIN', async () => {
            const { ws, opened } = rawSocket(url)
            await opened
            const rsp = new Promise<any>(r => ws.once('message', d => r(decode(d as Buffer))))
            ws.send(encode(Cmd.SYNC_REQ, { sinceVersion: 0 }, 1))
            const p = await rsp
            assert.equal(p.cmd, Cmd.ERROR)
            assert.equal(p.seq, 1)
            assert.equal(p.body.code, ErrorCode.NOT_LOGIN)
            ws.close()
        }],

        ['push sync between clients', async () => {
            const a = new SyncClient(mk('a1'))
            const b = new SyncClient(mk('b1'))
            await Promise.all([a.client.connect(), b.client.connect()])
            await a.set('k1', 'v1')
            await a.set('k2', 'v2')
            const { version } = await a.delete('k1')
            await waitFor(() => a.version === version && b.version === version)
            assert.deepEqual([...b.state], [['k2', 'v2']])
            assert.deepEqual([...a.state], [...b.state])
            a.client.close()
            b.client.close()
        }],

        ['reconnect -> incremental resync', async () => {
            const a = new SyncClient(mk('a2'))
            const b = new SyncClient(mk('b2'))
            await Promise.all([a.client.connect(), b.client.connect()])
            await waitFor(() => b.version === a.version)
            let reconnected = false
            b.client.on('ready', (_r, re) => (reconnected = re))
            ;(b.client as any).ws.terminate() // 模拟断网
            const { version } = await a.set('offline', 'yes')
            await waitFor(() => reconnected && a.version === version && b.version === version)
            assert.equal(b.state.get('offline'), 'yes')
            a.client.close()
            b.client.close()
        }],

        ['heartbeat keeps client alive', async () => {
            const c = mk('hb')
            let rtt = 0
            c.on('rtt', ms => (rtt = ms))
            await c.connect()
            await sleep(1200) // 2 倍超时时间
            assert.ok(c.connected)
            assert.ok(rtt >= 0 && server.getSession('hb'))
            c.close()
        }],

        ['dead client -> HEARTBEAT_TIMEOUT', async () => {
            const { ws, opened, closed } = rawSocket(url)
            await opened
            ws.send(encode(Cmd.LOGIN_REQ, { token: 'user:dead' }, 1))
            await waitFor(() => !!server.getSession('dead'))
            const n = disconnects.length
            await closed // 不发心跳、不回 pong
            await waitFor(() => disconnects.length > n)
            assert.equal(disconnects.at(-1), CloseCode.HEARTBEAT_TIMEOUT)
            assert.equal(server.getSession('dead'), undefined)
        }],

        ['no login -> AUTH_TIMEOUT', async () => {
            const { closed } = rawSocket(url)
            assert.equal(await closed, CloseCode.AUTH_TIMEOUT)
        }],

        ['same user login twice -> old kicked', async () => {
            const c1 = mk('dup')
            const c2 = mk('dup')
            await c1.connect()
            const kicked = new Promise<number>(r => c1.on('disconnect', code => r(code)))
            await c2.connect()
            assert.equal(await kicked, CloseCode.KICKED)
            assert.ok(c2.connected)
            c2.close()
        }],

        ['middleware: rate limit', async () => {
            const c = mk('limited')
            await c.connect() // 登录时还没有 userId，不计入
            await c.request(Cmd.SYNC_REQ, { sinceVersion: 0 })
            await c.request(Cmd.SYNC_REQ, { sinceVersion: 0 })
            await assert.rejects(
                c.request(Cmd.SYNC_REQ, { sinceVersion: 0 }),
                (e: any) => e instanceof ServerError && e.code === ErrorCode.RATE_LIMITED
            )
            c.close()
        }],

        ['app: modules start in dependency order, stop in reverse', async () => {
            const calls: string[] = []
            class A extends Module {
                name = 'a'
                onInit() { calls.push('init a') }
                onStop() { calls.push('stop a') }
            }
            class B extends Module {
                name = 'b'
                deps = [A]
                onInit() { calls.push('init b') }
                onStop() { calls.push('stop b') }
            }
            const app2 = new ServerApp({ port: 0, logger: consoleLogger('app2', true), authenticate: () => null })
            await app2.register(new B(), new A()).start()
            assert.equal(app2.get(A).name, 'a')
            await app2.stop()
            assert.deepEqual(calls, ['init a', 'init b', 'stop b', 'stop a'])
        }],

        ['app: missing dependency fails fast', async () => {
            class Dep extends Module { name = 'dep' }
            class User extends Module { name = 'user'; deps = [Dep] }
            const app3 = new ServerApp({ port: 0, logger: consoleLogger('app3', true), authenticate: () => null })
            await assert.rejects(app3.register(new User()).start(), /depends on Dep/)
        }],
    ]

    let failed = 0
    for (const [name, fn] of tests) {
        try {
            await fn()
            console.log(`  ✓ ${name}`)
        } catch (err) {
            failed++
            console.log(`  ✗ ${name}\n    ${(err as Error).stack}`)
        }
    }
    await app.stop()
    console.log(failed ? `\n${failed} failed` : `\nall ${tests.length} passed`)
    process.exit(failed ? 1 : 0)
}

main()
