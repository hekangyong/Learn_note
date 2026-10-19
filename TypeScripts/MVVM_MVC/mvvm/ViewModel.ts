/**
 * MVVM 的 ViewModel 基类
 *
 * ViewModel = 界面状态（signal / computed）+ 用户操作（Command），不引用任何 View。
 * 因此可以脱离 UI 单独做单元测试，也可以被不同平台的 View 复用。
 *
 * 生命周期：
 *   activate()    View 挂载时调用 -> onActivate()（例如开始轮询、首次加载）
 *   deactivate()  View 卸载时调用 -> 释放 activeDisposables -> onDeactivate()
 *   dispose()     所有者（页面 / 路由 / 弹窗）调用 -> 释放全部资源，取消进行中的异步命令
 *
 * ViewModel 可以比 View 活得久（例如标签页切走再切回，状态不丢失），
 * 所以 View 卸载时只 deactivate，不会 dispose。
 */
import { DisposableLike, DisposableStore, IDisposable } from '../core/Disposable'
import { Disposer, effect, EffectFn, ReadonlySignal, SignalListener, SignalOptions, SubscribeOptions, watch } from '../core/reactive'
import { AsyncCommand, AsyncCommandOptions, Command, CommandOptions } from './Command'

export abstract class ViewModel implements IDisposable {
    /** 直到 dispose 的资源 */
    protected readonly disposables = new DisposableStore()
    /** 仅在激活期间存在的资源，deactivate 时释放 */
    protected readonly activeDisposables = new DisposableStore()
    private active = false
    private disposed = false

    get isActive(): boolean {
        return this.active
    }

    get isDisposed(): boolean {
        return this.disposed
    }

    activate(): void {
        if (this.disposed) throw new Error(`${this.constructor.name} has been disposed`)
        if (this.active) return
        this.active = true
        this.onActivate()
    }

    deactivate(): void {
        if (!this.active) return
        this.active = false
        this.activeDisposables.clear()
        this.onDeactivate()
    }

    dispose(): void {
        if (this.disposed) return
        this.deactivate()
        this.disposed = true
        this.onDispose()
        this.disposables.dispose()
        this.activeDisposables.dispose()
    }

    protected onActivate(): void {}
    protected onDeactivate(): void {}
    protected onDispose(): void {}

    // ---------------- 工具方法：创建的资源自动随 ViewModel 释放 ----------------

    /** 创建 effect，dispose 时自动释放 */
    protected effect(fn: EffectFn): Disposer {
        return this.disposables.add(effect(fn))
    }

    /** 监听状态或表达式，dispose 时自动取消 */
    protected watch<T>(
        source: ReadonlySignal<T> | (() => T),
        listener: SignalListener<T>,
        options?: SubscribeOptions & SignalOptions<T>
    ): Disposer {
        return this.disposables.add(watch(source, listener, options))
    }

    protected command<A extends unknown[], R>(action: (...args: A) => R, options?: CommandOptions): Command<A, R> {
        return new Command(action, options)
    }

    /** 创建异步命令，dispose 时自动取消进行中的执行 */
    protected asyncCommand<A extends unknown[], R>(
        action: (signal: AbortSignal, ...args: A) => Promise<R>,
        options?: AsyncCommandOptions
    ): AsyncCommand<A, R> {
        return this.disposables.add(new AsyncCommand(action, options))
    }

    /** 登记其他资源 */
    protected addDisposable<T extends DisposableLike>(item: T, scope: 'lifetime' | 'active' = 'lifetime'): T {
        return (scope === 'active' ? this.activeDisposables : this.disposables).add(item)
    }
}
