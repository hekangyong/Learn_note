/**
 * MVC 的 Controller 基类
 *
 * 数据流（命令式）：
 *   View 发出意图 -> Controller 调用 Model 的业务方法 -> Model 状态变化
 *   -> Controller 观察到变化 -> Controller 主动调用 View 的显示方法
 *
 * 生命周期：
 *   start()   -> view.mount() -> onStart()（在这里 listen 意图、observe 状态）
 *   stop()    -> 释放 start 期间的监听 -> view.unmount() -> onStop()
 *   dispose() -> stop() -> onDispose() -> 释放 lifetime 资源 -> view.dispose()
 *   stop 之后可以再次 start（例如切换标签页）。
 *
 * 错误边界：意图处理函数（包括 async 函数）和状态回调里抛出的错误统一进入 onError，
 * 默认上报到全局错误处理；子类可以重写成「弹提示」等界面反馈。
 */
import { DisposableLike, DisposableStore } from '../core/Disposable'
import { isPromiseLike, reportError } from '../core/errors'
import { ReadonlySignal, SignalListener, SubscribeOptions } from '../core/reactive'
import { IntentsOf, MvcView } from './MvcView'

export abstract class Controller<V extends MvcView<any>> {
    /** start ~ stop 期间的资源 */
    private readonly session = new DisposableStore()
    /** 直到 dispose 的资源 */
    private readonly lifetime = new DisposableStore()
    private started = false
    private disposed = false

    constructor(protected readonly view: V) {}

    get isStarted(): boolean {
        return this.started
    }

    get isDisposed(): boolean {
        return this.disposed
    }

    start(): void {
        if (this.disposed) throw new Error(`${this.constructor.name} has been disposed`)
        if (this.started) return
        this.started = true
        this.view.mount()
        try {
            this.onStart()
        } catch (error) {
            // 初始化失败时回滚，避免留下一半的监听
            this.stop()
            throw error
        }
    }

    stop(): void {
        if (!this.started) return
        this.started = false
        this.session.clear()
        this.view.unmount()
        this.guard('onStop', () => this.onStop())
    }

    dispose(): void {
        if (this.disposed) return
        this.stop()
        this.disposed = true
        this.guard('onDispose', () => this.onDispose())
        this.lifetime.dispose()
        this.view.dispose()
    }

    // ---------------- 子类实现 ----------------

    /** 监听意图、观察状态、发起初始加载 */
    protected abstract onStart(): void
    protected onStop(): void {}
    protected onDispose(): void {}

    /** 错误处理，默认上报。可以重写为在 View 上显示错误提示 */
    protected onError(error: unknown, context: string): void {
        reportError(error, `${this.constructor.name}.${context}`)
    }

    // ---------------- 工具方法 ----------------

    /** 监听 View 的意图，stop 时自动取消。handler 可以是 async 函数，错误进入 onError */
    protected listen<K extends keyof IntentsOf<V>>(
        intent: K,
        handler: (...args: IntentsOf<V>[K] & unknown[]) => unknown
    ): void {
        this.session.add(
            this.view.on(intent, (...args: any[]) => this.guard(String(intent), () => handler(...(args as any))))
        )
    }

    /** 观察状态变化，stop 时自动取消 */
    protected observe<T>(source: ReadonlySignal<T>, listener: SignalListener<T>, options?: SubscribeOptions): void {
        this.session.add(source.subscribe((value, old) => this.guard('observe', () => listener(value, old)), options))
    }

    /**
     * 登记其他需要释放的资源（定时器、网络长连接 ...）
     * @param scope 'session' 在 stop 时释放（默认），'lifetime' 在 dispose 时释放
     */
    protected addDisposable<T extends DisposableLike>(item: T, scope: 'session' | 'lifetime' = 'session'): T {
        return (scope === 'session' ? this.session : this.lifetime).add(item)
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
