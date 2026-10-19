/**
 * 每日任务测试：ViewModel 不依赖任何 UI 和弹窗管理器，直接 new + init 测试全部界面逻辑
 *
 * 运行：cd TypeScripts && tsc && node dist/Framework/DailyTask/test.js
 */
import { setErrorHandler } from '../MVVM_MVC'
import { RedDotSystem } from '../RedDot/RedDot'
import { RedDotPath } from '../RedDot/RedDotManager'
import { ManualClock } from './Clock'
import { FakeTaskServer } from './FakeTaskServer'
import { TaskModel, WalletModel } from './TaskModel'
import { TaskPanelViewModel } from './TaskPanelViewModel'
import { setupTaskRedDot } from './TaskRedDot'

let passed = 0
let failed = 0

function assertEqual<T>(actual: T, expected: T, message = ''): void {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`)
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

/** 搭建一套干净的环境：服务器延迟为 0，红点系统独立实例 */
async function setup() {
    const clock = new ManualClock(Date.UTC(2026, 9, 19, 23, 59, 50))
    const server = new FakeTaskServer(clock, undefined, 0)
    const wallet = new WalletModel(100)
    const tasks = new TaskModel(server, wallet)
    const redDots = new RedDotSystem()
    const stopRedDot = setupTaskRedDot(redDots, tasks)
    const vm = new TaskPanelViewModel(tasks, wallet, clock)
    const closed: unknown[] = []
    vm.init({}, result => closed.push(result))
    vm.activate() // 激活时自动加载
    await tick()
    const dispose = () => {
        vm.dispose()
        stopRedDot()
        tasks.dispose()
    }
    return { clock, server, wallet, tasks, redDots, vm, closed, dispose }
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
        env.dispose()
        setErrorHandler(prev)
    }
}

async function main() {
    console.log('DailyTask')

    await test('激活时自动加载，倒计时随时钟走动', async ({ vm, clock }) => {
        assertEqual(vm.items.value.length, 4)
        assertEqual(vm.countdown.value, '00:00:10')
        clock.advance(3000)
        assertEqual(vm.countdown.value, '00:00:07')
    })

    await test('停用后倒计时停止', async ({ vm, clock }) => {
        vm.deactivate()
        clock.advance(3000)
        assertEqual(vm.countdown.value, '00:00:10')
    })

    await test('服务器推送进度：任务变为可领取并排到最前，红点出现', async ({ vm, server, redDots }) => {
        server.simulateProgress('battle', 3)
        await tick()
        assertEqual(vm.items.value[0].id, 2)
        assertEqual(vm.items.value[0].status, 'claimable')
        assertEqual(vm.claimableCount.value, 1)
        assertEqual(redDots.get(RedDotPath.Task), 1)
    })

    await test('领取：金币到账、状态变为已领取、红点消失', async ({ vm, server, wallet, redDots }) => {
        server.simulateProgress('login')
        await tick()
        const result = await vm.claim.execute(1)
        await tick()
        assertEqual(result, { ok: true, value: 50 })
        assertEqual(wallet.state.gold, 150)
        assertEqual(vm.items.value.find(i => i.id === 1)?.status, 'claimed')
        assertEqual(redDots.get(RedDotPath.Task), 0)
        assertEqual(vm.toast.value?.kind, 'success')
    })

    await test('没有可领取的任务时一键领取置灰', async ({ vm }) => {
        assertEqual(vm.claimAll.canExecute.value, false)
        assertEqual(await vm.claimAll.execute(), { ok: false, reason: 'disabled' })
    })

    await test('领取未完成的任务：Model 拒绝，错误显示为 toast', async ({ vm, wallet }) => {
        const result = await vm.claim.execute(2)
        assertEqual(result.ok, false)
        assertEqual(vm.toast.value, { text: '没有可领取的奖励', kind: 'error' })
        assertEqual(wallet.state.gold, 100)
    })

    await test('一键领取期间：再次点击和单个领取都被拦截', async ({ vm, server, wallet }) => {
        server.simulateProgress('login')
        server.simulateProgress('share')
        await tick()
        const first = vm.claimAll.execute()
        assertEqual(vm.claim.canExecute.value, false)
        assertEqual(await vm.claimAll.execute(), { ok: false, reason: 'disabled' })
        assertEqual(await first, { ok: true, value: 80 })
        assertEqual(wallet.state.gold, 180)
    })

    await test('网络错误：显示错误，数据不变，重试成功', async ({ vm, server, wallet }) => {
        server.simulateProgress('login')
        await tick()
        server.failNextClaim = true
        await vm.claimAll.execute()
        assertEqual(vm.toast.value?.kind, 'error')
        assertEqual(wallet.state.gold, 100)
        assertEqual((await vm.claimAll.execute()).ok, true)
        assertEqual(wallet.state.gold, 150)
    })

    await test('跨天重置：任务恢复初始状态，红点清空，倒计时指向下一天', async ({ vm, server, clock, redDots }) => {
        server.simulateProgress('login')
        await tick()
        clock.advance(10_000)
        server.simulateDailyReset()
        await tick()
        assertEqual(vm.claimableCount.value, 0)
        assertEqual(redDots.get(RedDotPath.Task), 0)
        assertEqual(vm.countdown.value, '24:00:00')
    })

    await test('未指定高亮任务时没有高亮项，关闭命令触发 close', async ({ vm, closed }) => {
        vm.closePanel.execute()
        assertEqual(closed.length, 1)
        assertEqual(vm.items.value.some(i => i.focused), false)
    })

    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) throw new Error(`${failed} test(s) failed`)
}

main().catch(error => {
    console.error(error)
    return Promise.reject(error)
})
