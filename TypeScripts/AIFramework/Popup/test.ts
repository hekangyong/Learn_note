/**
 * 弹窗系统测试：重点覆盖异步创建（view.show 返回 Promise）
 *
 * 运行：cd TypeScripts && tsc && node dist/AIFramework/Popup/test.js
 */
import { AnyPopupInfo, PopupConfig, PopupSystem, PopupView, TutorialContext } from './Popup'
import { createPopupDecorators, PopupComponent } from './PopupDecorators'
import { popupPriority } from './PopupManager'

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
        assertEqual(sys.loadingPopups.map(p => p.type), ['Slow'])
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

    await test('onLoadingChange：回调当前正在加载的全部弹窗（可用于加载遮罩）', async () => {
        const sys = newSystem()
        asyncView(sys, { Slow: 30 })
        const events: string[] = []
        sys.onLoadingChange(list => events.push(list.map(p => p.type).join(',')))
        sys.open('Slow', { n: 1 })
        await sleep(80)
        assertEqual(events, ['Slow', ''])
        assertEqual(sys.loadingPopups, [])
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

    console.log('\nPopup 多弹窗共存（层）')

    /** 同步视图：记录屏幕上的弹窗（按显示顺序） */
    function syncView<T extends object>(sys: PopupSystem<T>) {
        const onScreen: string[] = []
        sys.setView({
            show: p => void onScreen.push(`${String(p.type)}#${p.id}`),
            hide: p => {
                const i = onScreen.indexOf(`${String(p.type)}#${p.id}`)
                if (i !== -1) onScreen.splice(i, 1)
            },
        })
        return onScreen
    }

    type L = { Dialog: { n: number }; Shop: { n: number }; Toast: { n: number }; BigToast: { n: number } }
    function layeredSystem() {
        const sys = new PopupSystem<L>(undefined, undefined, { layers: { toast: 2 } })
        sys.register('Dialog', { priority: 10, unique: 'none' })
            .register('Shop', { priority: 5, unique: 'none' })
            .register('Toast', { priority: 1, layer: 'toast', unique: 'none' })
            .register('BigToast', { priority: 9, layer: 'toast', preempt: true, unique: 'none' })
        return sys
    }

    await test('不同层互不阻塞：main 一次一个，toast 层同时显示 2 条', async () => {
        const sys = layeredSystem()
        const onScreen = syncView(sys)
        sys.open('Dialog', { n: 1 })
        sys.open('Shop', { n: 1 })
        sys.open('Toast', { n: 1 })
        sys.open('Toast', { n: 2 })
        sys.open('Toast', { n: 3 })
        await sleep(0)
        assertEqual(onScreen, ['Dialog#1', 'Toast#3', 'Toast#4'])
        assertEqual(sys.queuedPopups.map(p => p.id), [2, 5])
        assertEqual(sys.currentPopupOf('main')?.id, 1)
        assertEqual(sys.showingPopups.map(p => p.layer), ['main', 'toast', 'toast'])

        sys.close(3) // 关掉一条 toast，只补 toast 层，main 不受影响
        await sleep(0)
        assertEqual(onScreen, ['Dialog#1', 'Toast#4', 'Toast#5'])
        sys.close(1)
        await sleep(0)
        assertEqual(onScreen, ['Toast#4', 'Toast#5', 'Shop#2'])
    })

    await test('层内抢占：层满时挤掉该层优先级最低的，抢占者关闭后恢复', async () => {
        const sys = layeredSystem()
        const onScreen = syncView(sys)
        sys.open('Dialog', { n: 1 })
        sys.open('Toast', { n: 1 })
        sys.open('Toast', { n: 2 })
        await sleep(0)
        const big = sys.open('BigToast', { n: 1 })
        await sleep(0)
        // 两条 Toast 优先级相同，最后显示的（Toast#3）先让位；main 层的 Dialog 不受影响
        assertEqual(onScreen, ['Dialog#1', 'Toast#2', 'BigToast#4'])
        if (big.ok) sys.close(big.id)
        await sleep(0)
        assertEqual(onScreen, ['Dialog#1', 'Toast#2', 'Toast#3'])
    })

    await test('按层暂停 / 关闭：战斗中暂停 main，toast 照常；closeAll(layer) 只清该层', async () => {
        const sys = layeredSystem()
        const onScreen = syncView(sys)
        sys.pause('main')
        sys.open('Dialog', { n: 1 })
        sys.open('Toast', { n: 1 })
        await sleep(0)
        assertEqual(onScreen, ['Toast#2'])
        sys.resume('main')
        await sleep(0)
        assertEqual(onScreen, ['Toast#2', 'Dialog#1'])
        sys.closeAll('toast')
        await sleep(0)
        assertEqual(onScreen, ['Dialog#1'])
    })

    await test('新手引导开始：各层显示中不允许的弹窗都被收起', async () => {
        const sys = new PopupSystem<L>(undefined, undefined, { layers: { toast: 2 } })
        sys.register('Dialog', { priority: 10 }).register('Toast', { priority: 1, layer: 'toast', tutorial: 'allow' })
        const onScreen = syncView(sys)
        sys.open('Dialog', { n: 1 })
        sys.open('Toast', { n: 1 })
        await sleep(0)
        sys.setTutorial({ guideId: 'main', stepId: 'intro' })
        await sleep(0)
        assertEqual(onScreen, ['Toast#2'])
        sys.setTutorial(null)
        await sleep(0)
        assertEqual(onScreen, ['Toast#2', 'Dialog#1'])
    })

    console.log('\nPopup 类型登记与优先级档位')

    await test('popupPriority：档位 + 偏移，越过上一档时报错', async () => {
        assertEqual(popupPriority('Panel'), 100)
        assertEqual(popupPriority('Panel', 20), 120)
        assertEqual(popupPriority('Guide', 5000), 6000) // 最高档没有上限
        let error = ''
        try {
            popupPriority('Panel', 100) // 200 = Reward 档的基准值
        } catch (e) {
            error = (e as Error).message
        }
        assertEqual(error.includes('Panel(100) + 100'), true)
    })

    await test('registrations：分散登记的弹窗按优先级汇总', async () => {
        const sys = layeredSystem()
        assertEqual(
            sys.registrations.map(r => `${String(r.type)}:${r.priority}:${r.layer}${r.preempt ? ':preempt' : ''}`),
            ['Dialog:10:main', 'BigToast:9:toast:preempt', 'Shop:5:main', 'Toast:1:toast']
        )
    })

    console.log('\nPopup 新手引导上下文')

    type G = { Reward: { itemId: number }; LevelUp: { level: number }; Tip: { text: string } }
    function guideSystem(config: { reward?: Partial<PopupConfig<G['Reward']>> } = {}) {
        const sys = new PopupSystem<G>()
        sys.register('Reward', { priority: 20, ...config.reward })
            .register('LevelUp', { priority: 10 })
            .register('Tip', { priority: 5, tutorial: ctx => ctx.guideId !== 'main' })
        return sys
    }
    const main = (stepId: string, extra: Partial<TutorialContext<keyof G>> = {}): TutorialContext<keyof G> => ({
        guideId: 'main',
        stepId,
        ...extra,
    })

    await test('引导侧放行：这一步的 allowPopups 放行奖励，其他弹窗仍然延后；下一步不再放行', async () => {
        const sys = guideSystem()
        const onScreen = syncView(sys)
        sys.setTutorial(main('intro'))
        sys.open('Reward', { itemId: 1 })
        sys.open('LevelUp', { level: 2 })
        await sleep(0)
        assertEqual(onScreen, [])
        sys.setTutorial(main('claim_reward', { allowPopups: ['Reward'] }))
        await sleep(0)
        assertEqual(onScreen, ['Reward#1'])
        sys.close(1)
        sys.open('Reward', { itemId: 2 })
        sys.setTutorial(main('next'))
        await sleep(0)
        assertEqual(onScreen, []) // 放行只对那一步有效
        sys.setTutorial(null)
        await sleep(0)
        assertEqual(onScreen, ['Reward#3'])
    })

    await test('多个引导：函数策略按 guideId 区分，功能引导期间照常弹，主线期间延后', async () => {
        const sys = guideSystem()
        const onScreen = syncView(sys)
        sys.setTutorial({ guideId: 'smithy', stepId: 'forge' })
        sys.open('Tip', { text: 'a' })
        await sleep(0)
        assertEqual(onScreen, ['Tip#1'])
        sys.setTutorial(main('intro')) // 切换到主线：显示中的提示被收起
        await sleep(0)
        assertEqual(onScreen, [])
        assertEqual(sys.currentTutorial?.guideId, 'main')
    })

    await test('弱引导不拦弹窗；强引导切换为弱引导视为引导结束（执行 afterTutorial）', async () => {
        const ended: string[] = []
        const sys = guideSystem({
            reward: { afterTutorial: (_d, _w, guide) => (ended.push(`${guide.guideId}/${guide.stepId}`), true) },
        })
        const onScreen = syncView(sys)
        sys.setTutorial({ guideId: 'hint', stepId: 'bag', forced: false })
        sys.open('LevelUp', { level: 2 })
        await sleep(0)
        assertEqual(onScreen, ['LevelUp#1'])
        sys.close(1)
        sys.setTutorial(main('intro'))
        sys.open('Reward', { itemId: 1 })
        await sleep(0)
        assertEqual(onScreen, [])
        sys.setTutorial({ guideId: 'hint', stepId: 'shop', forced: false })
        await sleep(0)
        assertEqual(ended, ['main/intro']) // afterTutorial 拿到刚结束的强引导
        assertEqual(onScreen, ['Reward#2'])
    })

    await test('afterTutorial 按引导区分：只在主线新手结束时丢弃新手礼包', async () => {
        const GIFT = 9001
        const sys = guideSystem({
            reward: { afterTutorial: (data, _w, guide) => !(guide.guideId === 'main' && data.itemId === GIFT) },
        })
        syncView(sys)
        sys.setTutorial({ guideId: 'smithy', stepId: 'forge' })
        const a = sys.open('Reward', { itemId: GIFT })
        sys.setTutorial(null) // 功能引导结束：保留
        await sleep(0)
        assertEqual(sys.currentPopup?.type, 'Reward')
        if (a.ok) sys.close(a.id)
        sys.setTutorial(main('intro'))
        const b = sys.open('Reward', { itemId: GIFT })
        sys.setTutorial(null) // 主线结束：丢弃
        if (b.ok) assertEqual((await b.closed).reason, 'dropped')
    })

    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) throw new Error(`${failed} test(s) failed`)
}

main().catch(error => {
    console.error(error)
    return Promise.reject(error)
})
