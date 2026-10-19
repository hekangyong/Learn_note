/**
 * 弹窗系统测试：重点覆盖异步创建（view.show 返回 Promise）
 *
 * 运行：cd TypeScripts && tsc && node dist/AIFramework/Popup/test.js
 */
import { AnyPopupInfo, PopupSystem, PopupView } from './Popup'
import { createPopupDecorators, PopupComponent } from './PopupDecorators'

type M = { Slow: { n: number }; Urgent: { n: number }; Next: { n: number } }

let passed = 0
let failed = 0

function assertEqual<T>(actual: T, expected: T, message = ''): void {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 模拟真实引擎的视图：show 里异步加载 loadMs 毫秒后才显示到屏幕；
 * 按约定在加载完成后检查 signal，被取消就不显示
 */
function asyncView(sys: PopupSystem<M>, loadMs: Partial<Record<keyof M, number>>, fail: (keyof M)[] = []) {
    const onScreen = new Set<string>()
    const shows: string[] = []
    const view: PopupView<M> = {
        async show(p, signal) {
            const name = `${p.type}#${p.id}`
            shows.push(name)
            const ms = loadMs[p.type] ?? 0
            if (ms > 0) await sleep(ms)
            if (fail.includes(p.type)) throw new Error(`load ${name} failed`)
            if (!signal.aborted) onScreen.add(name)
        },
        hide(p) {
            onScreen.delete(`${p.type}#${p.id}`)
        },
    }
    sys.setView(view)
    return { onScreen, shows }
}

function newSystem(showTimeout = 1000) {
    const sys = new PopupSystem<M>(undefined, undefined, { showTimeout })
    sys.register('Slow', { priority: 1 })
        .register('Next', { priority: 1 })
        .register('Urgent', { priority: 9, preempt: true })
    return sys
}

async function test(name: string, fn: () => Promise<void>) {
    // 失败用例会打印 console.error，测试里静音
    const error = console.error
    console.error = () => {}
    try {
        await fn()
        passed++
        console.log(`  ✓ ${name}`)
    } catch (e) {
        failed++
        console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.stack : String(e)}`)
    } finally {
        console.error = error
    }
}

async function main() {
    console.log('Popup 异步创建')

    await test('加载中被抢占：慢的不会叠在上面，抢占者关闭后恢复显示', async () => {
        const sys = newSystem()
        const v = asyncView(sys, { Slow: 100, Urgent: 10 })
        sys.open('Slow', { n: 1 })
        await sleep(30)
        const urgent = sys.open('Urgent', { n: 1 })
        await sleep(150) // Slow 的第一次加载已经完成，但被取消了
        assertEqual([...v.onScreen], ['Urgent#2'])
        if (urgent.ok) sys.close(urgent.id)
        await sleep(150)
        assertEqual([...v.onScreen], ['Slow#1'])
        assertEqual(sys.currentPopup?.type, 'Slow')
    })

    await test('加载中被关闭：不会出现幽灵弹窗', async () => {
        const sys = newSystem()
        const v = asyncView(sys, { Slow: 100 })
        const r = sys.open('Slow', { n: 1 })
        await sleep(30)
        assertEqual(sys.loadingPopup?.type, 'Slow')
        if (r.ok) sys.close(r.id)
        await sleep(150)
        assertEqual([...v.onScreen], [])
        assertEqual(sys.currentPopup, null)
        if (r.ok) assertEqual((await r.closed).reason, 'closed')
    })

    await test('加载失败：丢弃并继续弹下一个，队列不卡死', async () => {
        const sys = newSystem()
        const v = asyncView(sys, { Slow: 30 }, ['Slow'])
        const slow = sys.open('Slow', { n: 1 })
        sys.open('Next', { n: 1 })
        await sleep(100)
        if (slow.ok) assertEqual((await slow.closed).reason, 'dropped')
        assertEqual(sys.currentPopup?.type, 'Next')
        assertEqual([...v.onScreen], ['Next#2'])
    })

    await test('加载超时：丢弃并继续弹下一个，迟到的加载结果不会显示', async () => {
        const sys = newSystem(50)
        const v = asyncView(sys, { Slow: 200 })
        const slow = sys.open('Slow', { n: 1 })
        sys.open('Next', { n: 1 })
        await sleep(100)
        if (slow.ok) assertEqual((await slow.closed).reason, 'dropped')
        assertEqual(sys.currentPopup?.type, 'Next')
        await sleep(200)
        assertEqual([...v.onScreen], ['Next#2'])
    })

    await test('onLoadingChange：开始加载通知弹窗，结束通知 null（可用于加载遮罩）', async () => {
        const sys = newSystem()
        asyncView(sys, { Slow: 30 })
        const events: (string | null)[] = []
        sys.onLoadingChange(p => events.push(p ? String(p.type) : null))
        sys.open('Slow', { n: 1 })
        await sleep(80)
        assertEqual(events, ['Slow', null])
        assertEqual(sys.loadingPopup, null)
    })

    await test('同步视图行为不变：没有加载状态', async () => {
        const sys = newSystem()
        const shown: string[] = []
        const events: unknown[] = []
        sys.onLoadingChange(p => events.push(p))
        sys.setView({ show: (p: AnyPopupInfo<M>) => void shown.push(String(p.type)), hide() {} })
        sys.open('Slow', { n: 1 })
        await sleep(0)
        assertEqual(shown, ['Slow'])
        assertEqual(events, [])
    })

    await test('装饰器 onLoad：被抢占又恢复只加载一次，加载完成后才 onShow', async () => {
        const sys = newSystem()
        const { PopupWindow, view } = createPopupDecorators(sys)
        const log: string[] = []

        @PopupWindow('Slow', { priority: 1 })
        class SlowPopup implements PopupComponent<M['Slow']> {
            async onLoad() {
                log.push('load')
                await sleep(100)
            }
            onShow() {
                log.push('show')
            }
            onHide() {
                log.push('hide')
            }
        }
        @PopupWindow('Urgent', { priority: 9, preempt: true })
        class UrgentPopup implements PopupComponent<M['Urgent']> {
            onShow() {
                log.push('urgent')
            }
        }
        void SlowPopup, UrgentPopup

        sys.setView(view)
        sys.open('Slow', { n: 1 })
        await sleep(30)
        const urgent = sys.open('Urgent', { n: 1 })
        await sleep(30)
        if (urgent.ok) sys.close(urgent.id) // Slow 还在加载中就恢复
        await sleep(150)
        assertEqual(log, ['load', 'hide', 'urgent', 'show'])
    })

    await test('装饰器 onLoad：加载中被关闭，signal 被 abort，不会 onShow', async () => {
        const sys = newSystem()
        const { PopupWindow, view } = createPopupDecorators(sys)
        const log: string[] = []

        @PopupWindow('Slow', { priority: 1 })
        class SlowPopup implements PopupComponent<M['Slow']> {
            async onLoad(_data: M['Slow'], signal: AbortSignal) {
                signal.addEventListener('abort', () => log.push('abort'))
                await sleep(100)
            }
            onShow() {
                log.push('show')
            }
            onDispose() {
                log.push('dispose')
            }
        }
        void SlowPopup

        sys.setView(view)
        const r = sys.open('Slow', { n: 1 })
        await sleep(30)
        if (r.ok) sys.close(r.id)
        await sleep(150)
        assertEqual(log, ['abort', 'dispose'])
    })

    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) throw new Error(`${failed} test(s) failed`)
}

main().catch(error => {
    console.error(error)
    return Promise.reject(error)
})
