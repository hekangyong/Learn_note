/**
 * 一个 Controller 驱动多个 View
 *
 * Controller 基类和一个 View 绑在一起：每个 View 一个 Controller，Model 观察也跟着注册多次。
 * 游戏引擎（Cocos、Unity）里 View 是节点上的组件，由引擎创建 / 销毁，同一份数据又常常显示在
 * 多个界面上（主面板、HUD、小红点 ...），这时用 MultiController：
 *
 *   - Controller 全局一个，start() 时观察 Model，只注册一次；
 *   - View 显示时 attach、隐藏时 detach（Cocos 中写在 onEnable / onDisable）；
 *   - 意图处理表 intents() 只写一次，每个 attach 上来的 View 自动接线；
 *   - Model 变化时用 forEachView 广播给所有 View，新 attach 的 View 在 onAttach 里补一次当前状态；
 *   - View 的生命周期归它的创建者（引擎节点），Controller 只 detach，从不销毁 View。
 *
 * View 只需要满足 IMvcView 接口，不要求继承 MvcView：Cocos 组件必须继承 Component，
 * 自己持有一个 Emitter 实现 on 即可。
 *
 * 生命周期：
 *   start()   -> onStart()（在这里 observe Model、发起初始加载），重复调用无效
 *   attach(v) -> v.mount?.()（第一个 attach 它的 Controller 才调用）-> 接线意图 -> onAttach(v)
 *   detach(v) -> 取消意图 -> onDetach(v) -> v.unmount?.()（最后一个 detach 它的 Controller 才调用）
 *   dispose() -> detach 所有 View -> onDispose() -> 释放 observe 等资源
 */
import { DisposableLike, DisposableStore } from '../core/Disposable'
import { EventMap } from '../core/Emitter'
import { isPromiseLike, reportError } from '../core/errors'
import { ReadonlySignal, SignalListener, SubscribeOptions } from '../core/reactive'
import { IMvcView } from './MvcView'

/** 意图名 -> 处理函数。只需要写关心的意图，可以是 async 函数 */
export type IntentHandlers<I extends EventMap<I>> = { [K in keyof I]?: (...args: I[K]) => unknown }

/**
 * 每个 View 被多少个 MultiController attach。一个 View 可以同时挂在多个 Controller 上
 * （例如 HUD 同时显示金币和体力），第一个 attach 时才 mount、最后一个 detach 时才 unmount，
 * 否则从一个 Controller detach 会把 View 卸载，其他 Controller 也收不到意图了。
 */
const attachCounts = new WeakMap<object, number>()

export abstract class MultiController<I extends EventMap<I>, V extends IMvcView<I> = IMvcView<I>> {
    /** 直到 dispose 的资源（Model 观察等） */
    private readonly lifetime = new DisposableStore()
    /** 每个 View 的意图监听，detach 时释放 */
    private readonly views = new Map<V, DisposableStore>()
    private handlers: IntentHandlers<I> | null = null
    private started = false
    private disposed = false

    get isStarted(): boolean {
        return this.started
    }

    get isDisposed(): boolean {
        return this.disposed
    }

    get viewCount(): number {
        return this.views.size
    }

    /** 全局调用一次：观察 Model、发起初始加载 */
    start(): void {
        if (this.disposed) throw new Error(`${this.constructor.name} has been disposed`)
        if (this.started) return
        this.started = true
        try {
            this.onStart()
        } catch (error) {
            // 初始化失败时回滚，避免留下一半的观察；之后可以重新 start
            this.started = false
            this.lifetime.clear()
            throw error
        }
    }

    /**
     * 挂上一个 View：接线意图，并在 onAttach 里补一次当前状态。重复 attach 同一个 View 无效。
     * 可以在 start 之前调用（例如 Cocos 组件的 onEnable 先于启动逻辑执行）。
     */
    attach(view: V): void {
        if (this.disposed) throw new Error(`${this.constructor.name} has been disposed`)
        if (this.views.has(view)) return
        const session = new DisposableStore()
        this.views.set(view, session)
        const count = attachCounts.get(view) ?? 0
        attachCounts.set(view, count + 1)
        if (count === 0) view.mount?.()
        const handlers = (this.handlers ??= this.intents())
        for (const intent of Object.keys(handlers) as (keyof I & string)[]) {
            const handler = handlers[intent]
            if (!handler) continue
            session.add(view.on(intent, (...args) => this.guard(intent, () => handler(...args))))
        }
        this.guard('onAttach', () => this.onAttach(view))
    }

    /** 取下一个 View：取消意图监听。不会销毁 View */
    detach(view: V): void {
        const session = this.views.get(view)
        if (!session) return
        this.views.delete(view)
        session.dispose()
        this.guard('onDetach', () => this.onDetach(view))
        const count = (attachCounts.get(view) ?? 1) - 1
        if (count > 0) {
            attachCounts.set(view, count)
        } else {
            attachCounts.delete(view)
            view.unmount?.()
        }
    }

    dispose(): void {
        if (this.disposed) return
        for (const view of [...this.views.keys()]) this.detach(view)
        this.disposed = true
        this.started = false
        this.guard('onDispose', () => this.onDispose())
        this.lifetime.dispose()
    }

    // ---------------- 子类实现 ----------------

    /** 观察 Model、发起初始加载。只执行一次 */
    protected abstract onStart(): void
    /** 意图处理表，第一次 attach 时读取一次并缓存 */
    protected abstract intents(): IntentHandlers<I>
    /** 新 View 挂上来：把当前状态显示出来 */
    protected onAttach(_view: V): void {}
    protected onDetach(_view: V): void {}
    protected onDispose(): void {}

    /** 错误处理，默认上报。可以重写为在所有 View 上显示错误提示 */
    protected onError(error: unknown, context: string): void {
        reportError(error, `${this.constructor.name}.${context}`)
    }

    // ---------------- 工具方法 ----------------

    /** 观察状态变化，只注册一次，dispose 时取消。回调里用 forEachView 刷新 */
    protected observe<T>(source: ReadonlySignal<T>, listener: SignalListener<T>, options?: SubscribeOptions): void {
        this.lifetime.add(source.subscribe((value, old) => this.guard('observe', () => listener(value, old)), options))
    }

    /** 对每个已挂上的 View 执行 fn。单个 View 出错进入 onError，不影响其他 View */
    protected forEachView(fn: (view: V) => void): void {
        for (const view of [...this.views.keys()]) {
            // 前面的 View 刷新时可能把后面的 detach 了
            if (this.views.has(view)) this.guard('render', () => fn(view))
        }
    }

    /** 登记其他需要在 dispose 时释放的资源（定时器、长连接 ...） */
    protected addDisposable<T extends DisposableLike>(item: T): T {
        return this.lifetime.add(item)
    }

    /** 执行 fn，同步异常和 Promise 拒绝都交给 onError */
    protected guard(context: string, fn: () => unknown): void {
        try {
            const result = fn()
            if (isPromiseLike(result)) result.then(undefined, error => this.handleError(error, context))
        } catch (error) {
            this.handleError(error, context)
        }
    }

    private handleError(error: unknown, context: string): void {
        try {
            this.onError(error, context)
        } catch (inner) {
            reportError(inner, `${this.constructor.name}.onError`)
            reportError(error, `${this.constructor.name}.${context}`)
        }
    }
}
