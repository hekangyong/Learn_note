/**
 * 自测用例：不依赖测试框架，直接运行
 *   cd TypeScripts && tsc && node dist/AIFramework/MVVM_MVC/test.js
 * 有失败时进程以非 0 退出码结束，可以直接放进 CI。
 */
import {
    AsyncCommand,
    batch,
    computed,
    Controller,
    DisposableStore,
    effect,
    Emitter,
    IMvcView,
    IntentHandlers,
    Model,
    MultiController,
    MvcView,
    MvvmView,
    setErrorHandler,
    shallowEqual,
    signal,
    ViewModel,
} from './index'

let failed = 0
let passed = 0

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
    // 用例中预期内的上报错误不打印，避免刷屏；需要断言错误的用例用 captureErrors
    const prev = setErrorHandler(() => {})
    try {
        await fn()
        passed++
        console.log(`  ✓ ${name}`)
    } catch (error) {
        failed++
        console.log(`  ✗ ${name}\n    ${error instanceof Error ? error.stack : String(error)}`)
    } finally {
        setErrorHandler(prev)
    }
}

/** 在用例里拿到当前收集到的错误 */
function captureErrors(): { errors: unknown[]; restore: () => void } {
    const errors: unknown[] = []
    const prev = setErrorHandler(error => errors.push(error))
    return { errors, restore: () => setErrorHandler(prev) }
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message = ''): void {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a !== e) throw new Error(`${message} expected ${e}, got ${a}`)
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

async function main(): Promise<void> {
    console.log('reactive')

    await test('signal 值相同不通知', () => {
        const s = signal(1)
        const seen: number[] = []
        const off = s.subscribe(v => seen.push(v))
        s.value = 1
        s.value = 2
        s.update(v => v + 1)
        off()
        s.value = 4
        assertEqual(seen, [2, 3])
    })

    await test('菱形依赖无毛刺：只计算一次，不读到中间状态', () => {
        const a = signal(1)
        const b = computed(() => a.value * 2)
        const c = computed(() => a.value + 1)
        let dRuns = 0
        const d = computed(() => {
            dRuns++
            return b.value + c.value
        })
        const seen: number[] = []
        const off = effect(() => void seen.push(d.value))
        a.value = 2
        off()
        assertEqual(seen, [4, 7])
        assertEqual(dRuns, 2)
    })

    await test('effect 同时读 signal 和它的 computed：一次修改只执行一次', () => {
        const filter = signal('all')
        const label = computed(() => `filter=${filter.value}`)
        let runs = 0
        const off = effect(() => {
            filter.value
            label.value
            runs++
        })
        filter.value = 'active'
        off()
        assertEqual(runs, 2)
    })

    await test('computed 惰性计算并缓存', () => {
        const a = signal(1)
        let runs = 0
        const double = computed(() => {
            runs++
            return a.value * 2
        })
        assertEqual(runs, 0, '未读取时不计算')
        assertEqual(double.value, 2)
        assertEqual(double.value, 2)
        assertEqual(runs, 1, '依赖未变时使用缓存')
        a.value = 5
        assertEqual(double.value, 10)
        assertEqual(runs, 2)
    })

    await test('computed 结果不变时下游不重新执行', () => {
        const n = signal(1)
        const isPositive = computed(() => n.value > 0)
        let runs = 0
        const off = effect(() => {
            isPositive.value
            runs++
        })
        n.value = 2
        n.value = 3
        off()
        assertEqual(runs, 1)
    })

    await test('动态依赖：分支切换后不再依赖旧分支', () => {
        const useX = signal(true)
        const x = signal('x')
        const y = signal('y')
        let runs = 0
        const off = effect(() => {
            runs++
            void (useX.value ? x.value : y.value)
        })
        useX.value = false
        x.value = 'x2' // 已经不依赖 x
        y.value = 'y2'
        off()
        assertEqual(runs, 3)
    })

    await test('batch 合并多次修改为一次 effect', () => {
        const a = signal(1)
        const b = signal(2)
        let runs = 0
        const off = effect(() => {
            a.value + b.value
            runs++
        })
        batch(() => {
            a.value = 10
            b.value = 20
            batch(() => (a.value = 100))
        })
        off()
        assertEqual(runs, 2)
    })

    await test('effect 清理函数在重新执行前和 dispose 时调用', () => {
        const s = signal(0)
        const log: string[] = []
        const off = effect(() => {
            const v = s.value
            log.push(`run ${v}`)
            return () => log.push(`cleanup ${v}`)
        })
        s.value = 1
        off()
        s.value = 2
        assertEqual(log, ['run 0', 'cleanup 0', 'run 1', 'cleanup 1'])
    })

    await test('未被观察的 computed 自动脱离上游（不泄漏）', () => {
        const source = signal(1)
        let runs = 0
        const derived = computed(() => {
            runs++
            return source.value
        })
        const off = derived.subscribe(() => {})
        assertEqual(runs, 1)
        off()
        source.value = 2
        source.value = 3
        assertEqual(runs, 1, '取消订阅后上游变化不会触发计算')
        assertEqual(derived.value, 3, '再次读取时拿到最新值')
    })

    await test('effect 首次执行时修改了 computed 的上游：会补跑一次拿到最新值', () => {
        const a = signal(0)
        const double = computed(() => a.value * 2)
        const seen: number[] = []
        const off = effect(() => {
            seen.push(double.value)
            if (a.peek() === 0) a.value = 1
        })
        off()
        assertEqual(seen, [0, 2])
    })

    await test('循环依赖抛错', () => {
        const self: { c: { value: number } } = { c: computed(() => 0) }
        self.c = computed((): number => self.c.value + 1)
        let threw = false
        try {
            self.c.value
        } catch (error) {
            threw = String(error).includes('Cycle')
        }
        assert(threw, '应该检测到循环依赖')
    })

    await test('computed 错误被缓存，依赖变化后恢复', () => {
        const s = signal(0)
        const c = computed(() => {
            if (s.value === 0) throw new Error('zero')
            return 10 / s.value
        })
        let threw = false
        try {
            c.value
        } catch {
            threw = true
        }
        assert(threw, '应抛出计算错误')
        s.value = 2
        assertEqual(c.value, 5)
    })

    await test('computed 中修改 signal 抛错', () => {
        const a = signal(0)
        const bad = computed(() => (a.value = 1))
        let threw = false
        try {
            bad.value
        } catch {
            threw = true
        }
        assert(threw, 'computed 必须无副作用')
    })

    await test('effect 出错只上报，不影响其他 effect；死循环会被打断', () => {
        const { errors, restore } = captureErrors()
        try {
            const s = signal(0)
            let healthy = 0
            const off1 = effect(() => {
                if (s.value === 1) throw new Error('boom')
            })
            const off2 = effect(() => void (healthy = s.value))
            s.value = 1
            assertEqual(healthy, 1)
            assertEqual(errors.length, 1)

            const loop = signal(0)
            const off3 = effect(() => {
                loop.value = loop.peek() + 1 // 依赖自己又修改自己
                loop.value
            })
            loop.value = -1
            assert(errors.some(e => String(e).includes('infinite loop')), '应检测到死循环')
            off1()
            off2()
            off3()
        } finally {
            restore()
        }
    })

    await test('shallowEqual', () => {
        assert(shallowEqual([1, 2], [1, 2]), '数组')
        assert(shallowEqual({ a: 1 }, { a: 1 }), '对象')
        assert(!shallowEqual({ a: 1 }, { a: 2 }), '对象不等')
        assert(!shallowEqual([1], { 0: 1 }), '数组与对象')
    })

    console.log('core')

    await test('DisposableStore 逆序释放、错误隔离', () => {
        const { errors, restore } = captureErrors()
        try {
            const store = new DisposableStore()
            const log: number[] = []
            store.add(() => log.push(1))
            store.add(() => {
                throw new Error('x')
            })
            store.add({ dispose: () => log.push(3) })
            store.dispose()
            assertEqual(log, [3, 1])
            assertEqual(errors.length, 1)
            store.add(() => log.push(4)) // 释放后添加：立即释放并上报
            assertEqual(log, [3, 1, 4])
            assertEqual(errors.length, 2)
        } finally {
            restore()
        }
    })

    await test('Emitter 监听器出错不影响其他监听器，取消函数相互独立', () => {
        const { errors, restore } = captureErrors()
        try {
            const emitter = new Emitter<{ ping: [n: number] }>()
            const seen: number[] = []
            const listener = (n: number) => void seen.push(n)
            const off1 = emitter.on('ping', listener)
            emitter.on('ping', () => {
                throw new Error('bad')
            })
            emitter.on('ping', listener)
            emitter.emit('ping', 1)
            off1()
            emitter.emit('ping', 2)
            assertEqual(seen, [1, 1, 2])
            assertEqual(errors.length, 2)
        } finally {
            restore()
        }
    })

    console.log('model')

    class CounterModel extends Model<{ count: number; name: string }> {
        constructor() {
            super({ count: 0, name: 'a' })
        }
        inc() {
            this.setState(s => ({ count: s.count + 1 }))
        }
        rename(name: string) {
            return this.setState({ name })
        }
    }

    await test('Model：相同值不通知，select 只关心选中字段，状态被冻结', () => {
        const model = new CounterModel()
        const counts: number[] = []
        const off = model.observe(s => s.count, v => counts.push(v))
        assertEqual(model.rename('a'), false)
        model.rename('b')
        model.inc()
        off()
        assertEqual(counts, [1])
        assert(Object.isFrozen(model.state), '状态应被冻结')
    })

    console.log('mvc')

    await test('Controller：意图路由、错误边界、stop 后不再响应', async () => {
        class V extends MvcView<{ inc: []; fail: [reason: string] }> {
            rendered: number[] = []
            render(n: number) {
                this.rendered.push(n)
            }
            click() {
                this.emit('inc')
            }
            clickFail(reason: string) {
                this.emit('fail', reason)
            }
        }
        class C extends Controller<V> {
            errors: string[] = []
            constructor(
                view: V,
                private readonly model: CounterModel
            ) {
                super(view)
            }
            protected onStart() {
                this.listen('inc', () => this.model.inc())
                this.listen('fail', async reason => {
                    await tick()
                    throw new Error(reason)
                })
                this.observe(this.model.state$, s => this.view.render(s.count), { immediate: true })
            }
            protected override onError(error: unknown, context: string) {
                this.errors.push(`${context}:${(error as Error).message}`)
            }
        }
        const model = new CounterModel()
        const view = new V()
        const controller = new C(view, model)
        controller.start()
        view.click()
        view.clickFail('oops')
        await tick()
        await tick()
        controller.stop()
        view.click() // 未挂载，忽略
        model.inc() // 已取消观察
        assertEqual(view.rendered, [0, 1])
        assertEqual(controller.errors, ['fail:oops'])
        controller.start() // 可以重新 start
        assertEqual(view.rendered, [0, 1, 2])
        controller.dispose()
        assert(view.isDisposed, 'dispose 应同时销毁 View')
    })

    type CounterIntents = { inc: []; fail: [reason: string] }

    class CounterPanel extends MvcView<CounterIntents> {
        rendered: number[] = []
        render(n: number) {
            this.rendered.push(n)
        }
        click() {
            this.emit('inc')
        }
        clickFail(reason: string) {
            this.emit('fail', reason)
        }
    }

    type CounterView = IMvcView<CounterIntents> & { render(n: number): void }

    class SharedCounterController extends MultiController<CounterIntents, CounterView> {
        errors: string[] = []
        intentsCalls = 0
        constructor(readonly model: CounterModel) {
            super()
        }
        protected intents(): IntentHandlers<CounterIntents> {
            this.intentsCalls++
            return {
                inc: () => this.model.inc(),
                fail: async reason => {
                    await tick()
                    throw new Error(reason)
                },
            }
        }
        protected onStart() {
            this.observe(this.model.state$, s => this.forEachView(v => v.render(s.count)))
        }
        protected override onAttach(view: CounterView) {
            view.render(this.model.state.count)
        }
        protected override onError(error: unknown, context: string) {
            this.errors.push(`${context}:${(error as Error).message}`)
        }
    }

    await test('MultiController：多个 View 共用一次注册，attach 补当前状态', () => {
        const model = new CounterModel()
        const controller = new SharedCounterController(model)
        const a = new CounterPanel()
        const b = new CounterPanel()
        controller.start()
        controller.start() // 重复 start 不会重复观察
        controller.attach(a)
        controller.attach(a) // 重复 attach 不会重复接线
        a.click()
        controller.attach(b)
        b.click()
        assertEqual(a.rendered, [0, 1, 2])
        assertEqual(b.rendered, [1, 2], 'attach 时立即显示当前状态')
        assertEqual(model.state.count, 2, '每次点击只处理一次')
        assertEqual(controller.intentsCalls, 1, '意图表只读取一次')
        assertEqual(controller.viewCount, 2)
        controller.dispose()
    })

    await test('MultiController：detach 后不再刷新也不再响应，可以再次 attach', () => {
        const model = new CounterModel()
        const controller = new SharedCounterController(model)
        const a = new CounterPanel()
        const b = new CounterPanel()
        controller.start()
        controller.attach(a)
        controller.attach(b)
        controller.detach(b)
        assert(!b.isMounted, 'detach 应卸载 MvcView')
        assert(!b.isDisposed, 'detach 不应销毁 View')
        b.click() // 未挂载，忽略
        model.inc() // 只刷新 a
        assertEqual(a.rendered, [0, 1])
        assertEqual(b.rendered, [0])
        controller.attach(b)
        b.click()
        assertEqual(model.state.count, 2)
        assertEqual(a.rendered, [0, 1, 2])
        assertEqual(b.rendered, [0, 1, 2])
        controller.dispose()
    })

    await test('MultiController：意图异常进入 onError，单个 View 刷新出错不影响其他 View', async () => {
        const model = new CounterModel()
        const controller = new SharedCounterController(model)
        class BrokenPanel extends CounterPanel {
            override render(_n: number): void {
                throw new Error('broken')
            }
        }
        const broken = new BrokenPanel()
        const ok = new CounterPanel()
        controller.start()
        controller.attach(broken)
        controller.attach(ok)
        ok.clickFail('oops')
        await tick()
        await tick()
        model.inc()
        assertEqual(ok.rendered, [0, 1])
        assertEqual(controller.errors, ['onAttach:broken', 'fail:oops', 'render:broken'])
        controller.dispose()
    })

    await test('MultiController：start 之前可以 attach；dispose 卸载但不销毁 View', () => {
        const model = new CounterModel()
        const controller = new SharedCounterController(model)
        const a = new CounterPanel()
        controller.attach(a) // 例如 Cocos 组件的 onEnable 先于启动逻辑执行
        a.click() // 意图已接线
        assertEqual(a.rendered, [0], '未 start 时还没有观察 Model')
        controller.start()
        model.inc()
        assertEqual(a.rendered, [0, 2])
        controller.dispose()
        assert(!a.isMounted && !a.isDisposed, 'dispose 只卸载 View')
        assertEqual(controller.viewCount, 0)
        model.inc()
        assertEqual(a.rendered, [0, 2], 'dispose 后不再观察')
        let threw = false
        try {
            controller.attach(a)
        } catch {
            threw = true
        }
        assert(threw, 'dispose 后 attach 应抛错')
        a.dispose()
    })

    await test('MultiController：一个 View 挂在多个 Controller 上，各自处理自己的意图和 Model', () => {
        type ProfileIntents = { rename: [name: string] }
        class ProfileController extends MultiController<ProfileIntents, IMvcView<ProfileIntents> & { renderName(n: string): void }> {
            constructor(readonly model: CounterModel) {
                super()
            }
            protected intents(): IntentHandlers<ProfileIntents> {
                return { rename: name => this.model.rename(name) }
            }
            protected onStart() {
                this.observe(this.model.state$, s => this.forEachView(v => v.renderName(s.name)))
            }
            protected override onAttach(view: { renderName(n: string): void }) {
                view.renderName(this.model.state.name)
            }
        }
        /** 同时显示计数（CounterModel）和昵称（另一个 Model） */
        class HudPanel extends MvcView<CounterIntents & ProfileIntents> {
            rendered: number[] = []
            names: string[] = []
            render(n: number) {
                this.rendered.push(n)
            }
            renderName(name: string) {
                this.names.push(name)
            }
            click() {
                this.emit('inc')
            }
            rename(name: string) {
                this.emit('rename', name)
            }
        }
        const counterModel = new CounterModel()
        const profileModel = new CounterModel()
        const counter = new SharedCounterController(counterModel)
        const profile = new ProfileController(profileModel)
        counter.start()
        profile.start()
        const hud = new HudPanel()
        counter.attach(hud)
        profile.attach(hud)
        hud.click()
        hud.rename('b')
        assertEqual(counterModel.state.count, 1)
        assertEqual(profileModel.state.name, 'b')
        assertEqual(profileModel.state.count, 0, '意图只由声明了它的 Controller 处理')
        assertEqual(hud.rendered, [0, 1])
        assertEqual(hud.names, ['a', 'b'])
        // 从一个 Controller detach 不能影响另一个
        profile.detach(hud)
        assert(hud.isMounted, '还挂在 counter 上，不应被卸载')
        hud.click()
        assertEqual(counterModel.state.count, 2)
        counter.detach(hud)
        assert(!hud.isMounted, '最后一个 Controller detach 后才卸载')
        counter.dispose()
        profile.dispose()
        hud.dispose()
    })

    await test('MultiController：onStart 抛错时回滚，可以重新 start', () => {
        const model = new CounterModel()
        let fail = true
        class C extends SharedCounterController {
            protected override onStart() {
                super.onStart()
                if (fail) throw new Error('init')
            }
        }
        const controller = new C(model)
        const a = new CounterPanel()
        controller.attach(a)
        let threw = false
        try {
            controller.start()
        } catch {
            threw = true
        }
        assert(threw && !controller.isStarted, 'start 失败应回滚')
        model.inc()
        assertEqual(a.rendered, [0], '回滚后不应留下观察')
        fail = false
        controller.start()
        model.inc()
        assertEqual(a.rendered, [0, 2])
        controller.dispose()
    })

    console.log('mvvm')

    await test('AsyncCommand drop：执行中再次调用被忽略', async () => {
        let calls = 0
        const cmd = new AsyncCommand(async () => {
            calls++
            await tick()
            return calls
        })
        const first = cmd.execute()
        assertEqual(cmd.isRunning.value, true)
        assertEqual(cmd.canExecute.value, false)
        const second = await cmd.execute()
        assertEqual(second, { ok: false, reason: 'disabled' })
        assertEqual(await first, { ok: true, value: 1 })
        assertEqual(cmd.isRunning.value, false)
    })

    await test('AsyncCommand restart：新的执行取消旧的', async () => {
        const aborted: number[] = []
        const cmd = new AsyncCommand(
            async (signal, n: number) => {
                signal.addEventListener('abort', () => aborted.push(n))
                await tick()
                return n
            },
            { concurrency: 'restart' }
        )
        const p1 = cmd.execute(1)
        const p2 = cmd.execute(2)
        assertEqual(await p1, { ok: false, reason: 'aborted' })
        assertEqual(await p2, { ok: true, value: 2 })
        assertEqual(aborted, [1])
    })

    await test('AsyncCommand：错误写入 error 状态，cancel 立即恢复', async () => {
        const cmd = new AsyncCommand(
            async (_signal, fail: boolean) => {
                await tick()
                if (fail) throw new Error('nope')
            },
            { reportErrors: false }
        )
        const result = await cmd.execute(true)
        assert(!result.ok && result.reason === 'error', '应返回错误结果')
        assertEqual((cmd.error.value as Error).message, 'nope')

        const pending = cmd.execute(false)
        assertEqual(cmd.error.value, undefined, '重新执行时清空错误')
        cmd.cancel()
        assertEqual(cmd.isRunning.value, false)
        assertEqual(await pending, { ok: false, reason: 'aborted' })
    })

    await test('MvvmView：mount 绑定并激活，unmount 解绑并停用，ViewModel 状态保留', () => {
        class VM extends ViewModel {
            readonly count = signal(0)
            readonly label = computed(() => `count=${this.count.value}`)
            activations = 0
            protected override onActivate() {
                this.activations++
            }
        }
        class V extends MvvmView<VM> {
            text = ''
            protected onBind(vm: VM) {
                this.bind(vm.label, v => (this.text = v))
            }
        }
        const vm = new VM()
        const view = new V()
        view.mount(vm)
        assertEqual(view.text, 'count=0')
        vm.count.value = 1
        assertEqual(view.text, 'count=1')
        view.unmount()
        assert(!vm.isActive, '卸载后应停用')
        vm.count.value = 2
        assertEqual(view.text, 'count=1', '卸载后不再刷新')
        view.mount(vm)
        assertEqual(view.text, 'count=2', '重新挂载显示最新状态')
        assertEqual(vm.activations, 2)
        view.dispose()
        vm.dispose()
    })

    await test('ViewModel dispose 取消进行中的异步命令', async () => {
        class VM extends ViewModel {
            readonly save = this.asyncCommand(async signal => {
                await tick()
                return signal.aborted
            })
        }
        const vm = new VM()
        const pending = vm.save.execute()
        vm.dispose()
        assertEqual(await pending, { ok: false, reason: 'aborted' })
        assertEqual(await vm.save.execute(), { ok: false, reason: 'disabled' })
    })

    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) throw new Error(`${failed} test(s) failed`)
}

main().catch(error => {
    console.error(error)
    // 未捕获的拒绝会让 Node 以非 0 退出码结束
    return Promise.reject(error)
})
