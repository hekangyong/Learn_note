/**
 * MVVM 的 View 基类
 *
 * View 只做「绑定」：
 *   ViewModel 的状态 ──bind──> 控件属性      （状态变化时自动刷新，View 不判断「什么时候刷新」）
 *   控件输入       ──bindTwoWay──> 状态      （输入框等双向绑定）
 *   按钮点击       ──> command.execute()     （按钮可用状态用 bindCommand 绑定）
 *
 * 生命周期：
 *   mount(vm)  -> vm.activate() -> onBind(vm)
 *   unmount()  -> 解除所有绑定 -> onUnbind() -> vm.deactivate()
 *   dispose()  -> unmount() -> onDispose()
 * View 不负责销毁 ViewModel：ViewModel 由创建它的一方（页面 / 路由）dispose。
 *
 * 具体平台只需要继承本类，在 onBind 里把状态绑定到控件上。
 */
import { DisposableLike, DisposableStore } from '../core/Disposable'
import { effect, EffectFn, ReadonlySignal, Signal, SignalListener } from '../core/reactive'
import { ViewModel } from './ViewModel'

export abstract class MvvmView<VM extends ViewModel> {
    private readonly bindings = new DisposableStore()
    private current: VM | null = null
    private disposed = false

    get isMounted(): boolean {
        return this.current !== null
    }

    /** 当前绑定的 ViewModel，未挂载时访问会抛错 */
    protected get vm(): VM {
        if (!this.current) throw new Error(`${this.constructor.name} is not mounted`)
        return this.current
    }

    mount(vm: VM): void {
        if (this.disposed) throw new Error(`${this.constructor.name} has been disposed`)
        if (this.current === vm) return
        if (this.current) this.unmount()
        this.current = vm
        vm.activate()
        try {
            this.onBind(vm)
        } catch (error) {
            // 绑定失败时回滚，避免留下一半的绑定
            this.unmount()
            throw error
        }
    }

    unmount(): void {
        const vm = this.current
        if (!vm) return
        this.bindings.clear()
        this.onUnbind()
        this.current = null
        vm.deactivate()
    }

    dispose(): void {
        if (this.disposed) return
        this.unmount()
        this.disposed = true
        this.bindings.dispose()
        this.onDispose()
    }

    /** 建立所有绑定，每次 mount 调用一次 */
    protected abstract onBind(vm: VM): void
    protected onUnbind(): void {}
    protected onDispose(): void {}

    // ---------------- 绑定工具：unmount 时自动解除 ----------------

    /** 单向绑定：绑定时立刻用当前值调用一次 apply，之后每次变化调用 */
    protected bind<T>(source: ReadonlySignal<T>, apply: SignalListener<T>): void {
        this.bindings.add(source.subscribe(apply, { immediate: true }))
    }

    /** 绑定一段同时依赖多个状态的刷新逻辑，fn 中读到的状态都会成为依赖 */
    protected bindEffect(fn: EffectFn): void {
        this.bindings.add(effect(fn))
    }

    /** 绑定命令的可执行状态，例如按钮的「可点击 / 置灰」 */
    protected bindCommand(command: { readonly canExecute: ReadonlySignal<boolean> }, setEnabled: (enabled: boolean) => void): void {
        this.bind(command.canExecute, enabled => setEnabled(enabled))
    }

    /**
     * 双向绑定
     * @param target 可写状态
     * @param apply  状态 -> 控件
     * @param listen 控件 -> 状态：注册控件的输入回调，在回调里调用 commit(新值)，返回取消注册的函数
     */
    protected bindTwoWay<T>(
        target: Signal<T>,
        apply: (value: T) => void,
        listen: (commit: (value: T) => void) => DisposableLike
    ): void {
        this.bind(target, value => apply(value))
        this.bindings.add(listen(value => target.set(value)))
    }

    /** 登记其他随绑定一起释放的资源 */
    protected addBinding<T extends DisposableLike>(item: T): T {
        return this.bindings.add(item)
    }
}
