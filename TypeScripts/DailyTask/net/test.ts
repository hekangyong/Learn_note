/**
 * 每日任务接入 WsProtoServer 的端到端测试：真实 WebSocket + Protobuf，
 * 客户端的 TaskModel / TaskPanelViewModel 与 FakeTaskServer 版本完全相同，只是 TaskApi 换成了 WsTaskApi。
 *
 * 运行：cd TypeScripts/WsProtoServer && npm run task:test
 */
import { setErrorHandler } from '../../MVVM_MVC'
import { consoleLogger, ServerApp, WsProtoClient } from '../../WsProtoServer/src'
import { ManualClock } from '../Clock'
import { TaskModel, WalletModel } from '../TaskModel'
import { TaskPanelViewModel } from '../TaskPanelViewModel'
import { TaskModule } from './TaskModule'
import { WalletModule } from './WalletModule'
import { WsTaskApi } from './WsTaskApi'

let passed = 0
let failed = 0

function assertEqual<T>(actual: T, expected: T, message = ''): void {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`)
}

async function waitFor(cond: () => boolean, timeout = 3000) {
    const start = Date.now()
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout')
        await new Promise(resolve => setTimeout(resolve, 10))
    }
}

/** 每个用例独立一套服务器 + 客户端 */
async function setup() {
    const clock = new ManualClock(Date.UTC(2026, 9, 19, 23, 59, 50))
    const app = new ServerApp({
        port: 0,
        logger: consoleLogger('app', true),
        authenticate: token => (token.startsWith('user:') ? token.slice(5) : null),
    })
    app.register(new TaskModule(clock), new WalletModule(100))
    await app.start()
    const server = app.server
    const taskModule = app.get(TaskModule)

    const clients: WsProtoClient[] = []
    const models: TaskModel[] = []
    /** 登录一个玩家，返回已加载好数据的 TaskModel */
    const login = async (user: string) => {
        const client = new WsProtoClient({ url: `ws://127.0.0.1:${server.port}`, token: `user:${user}`, reconnectBaseDelay: 20 })
        await client.connect()
        const api = new WsTaskApi(client)
        const wallet = new WalletModel(100)
        const tasks = new TaskModel(api, wallet)
        await tasks.load()
        clients.push(client)
        models.push(tasks)
        return { client, api, wallet, tasks }
    }
    const dispose = async () => {
        models.forEach(m => m.dispose())
        clients.forEach(c => c.close())
        await app.stop()
    }
    return { clock, app, taskModule, login, dispose }
}

async function test(name: string, fn: (env: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
    const prev = setErrorHandler(() => {})
    const env = await setup()
    try {
        await fn(env)
        passed++
        console.log(`  ✓ ${name}`)
    } catch (error) {
        failed++
        console.log(`  ✗ ${name}\n    ${error instanceof Error ? error.stack : String(error)}`)
    } finally {
        await env.dispose()
        setErrorHandler(prev)
    }
}

const progressOf = (tasks: TaskModel, id: number) => tasks.state.tasks.find(t => t.id === id)?.progress

async function main() {
    console.log('DailyTask over WsProtoServer')

    await test('登录即完成「每日登录」，拉取到 4 个任务', async ({ login }) => {
        const { tasks } = await login('alice')
        assertEqual(tasks.state.tasks.length, 4)
        assertEqual(tasks.claimableIds(), [1])
    })

    await test('其他模块发出 player:action 事件，进度只推送给对应玩家', async ({ login, app }) => {
        const alice = await login('alice')
        const bob = await login('bob')
        app.events.emit('player:action', 'alice', 'battle', 3)
        await waitFor(() => progressOf(alice.tasks, 2) === 3)
        assertEqual(alice.tasks.claimableIds(), [1, 2])
        assertEqual(progressOf(bob.tasks, 2), 0)
    })

    await test('领取：服务端钱包和客户端金币都到账；重复领取被服务器拒绝', async ({ login, app }) => {
        const { tasks, wallet, api } = await login('alice')
        assertEqual(await tasks.claim([1]), 50)
        assertEqual(wallet.state.gold, 150)
        assertEqual(app.get(WalletModule).goldOf('alice'), 150)
        assertEqual(tasks.claimableIds(), [])
        // 绕过客户端过滤，直接请求服务器
        let error = ''
        await api.claim([1]).catch(e => (error = e.message))
        assertEqual(error, '奖励已领取或任务未完成')
    })

    await test('跨天：服务器推送 reset，客户端整份替换', async ({ login, clock }) => {
        const { tasks } = await login('alice')
        const before = tasks.state.resetAt
        clock.advance(10_000)
        await waitFor(() => tasks.state.resetAt !== before)
        assertEqual(tasks.state.resetAt - before, 24 * 60 * 60 * 1000)
        assertEqual(tasks.claimableIds(), [])
    })

    await test('断线期间的进度：重连后自动重新拉取', async ({ login, taskModule }) => {
        const { client, tasks } = await login('alice')
        let reconnected = false
        client.on('ready', (_rsp, re) => (reconnected = re))
        ;(client as any).ws.terminate() // 模拟断网
        await waitFor(() => !client.connected)
        taskModule.addProgress('alice', 'shop') // 此时推送发不出去
        await waitFor(() => reconnected && progressOf(tasks, 3) === 1)
        assertEqual(tasks.claimableIds(), [1, 3])
    })

    await test('界面层不改：ViewModel 一键领取走真实网络', async ({ login, taskModule, clock }) => {
        const { tasks, wallet } = await login('alice')
        const vm = new TaskPanelViewModel(tasks, wallet, clock)
        vm.init({}, () => {})
        vm.activate()
        taskModule.addProgress('alice', 'share')
        await waitFor(() => vm.claimableCount.value === 2)
        assertEqual(await vm.claimAll.execute(), { ok: true, value: 80 })
        assertEqual(wallet.state.gold, 180)
        assertEqual(vm.toast.value?.kind, 'success')
        vm.dispose()
    })

    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(failed > 0 ? 1 : 0)
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
