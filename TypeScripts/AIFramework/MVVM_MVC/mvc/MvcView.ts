/**
 * MVC 的 View 基类
 *
 * View 只做两件事：
 *   1. 提供显示方法（renderList、showError ...），由 Controller 主动调用；
 *   2. 把用户操作翻译成「意图」（intent）发出去，不包含任何业务逻辑。
 *
 * 意图表用「意图名 -> 参数元组」声明，Controller 监听时参数类型会被检查：
 *   class TodoView extends MvcView<{ add: [title: string]; toggle: [id: number] }> { ... }
 *
 * 具体平台（DOM、React、Cocos、Unity UI ...）只需要继承本类，在 onMount 里创建 / 绑定控件，
 * 在 onUnmount 里移除控件事件，在控件回调里调用 this.emit(...)。
 */
import { Emitter, EventMap, Listener } from '../core/Emitter'

export abstract class MvcView<Intents extends EventMap<Intents> = {}> {
    /** 仅用于类型推导（Controller 据此得到意图表），运行时不存在 */
    declare readonly __intents?: Intents

    private readonly emitter = new Emitter<Intents>()
    private mounted = false
    private disposed = false

    get isMounted(): boolean {
        return this.mounted
    }

    get isDisposed(): boolean {
        return this.disposed
    }

    /** 监听用户意图，返回取消函数。通常由 Controller 调用 */
    on<K extends keyof Intents>(intent: K, handler: Listener<Intents[K]>): () => void {
        return this.emitter.on(intent, handler)
    }

    /** 发出用户意图。未挂载（例如关闭动画期间）时忽略，防止对已离开的界面做业务操作 */
    protected emit<K extends keyof Intents>(intent: K, ...args: Intents[K]): void {
        if (!this.mounted) return
        this.emitter.emit(intent, ...args)
    }

    mount(): void {
        if (this.disposed) throw new Error(`${this.constructor.name} has been disposed`)
        if (this.mounted) return
        this.mounted = true
        this.onMount()
    }

    unmount(): void {
        if (!this.mounted) return
        this.mounted = false
        this.onUnmount()
    }

    dispose(): void {
        if (this.disposed) return
        this.unmount()
        this.disposed = true
        this.emitter.clear()
        this.onDispose()
    }

    /** 显示：创建控件、绑定控件事件 */
    protected onMount(): void {}
    /** 隐藏：解除控件事件 */
    protected onUnmount(): void {}
    /** 销毁：释放控件资源 */
    protected onDispose(): void {}
}

/** 取出 View 的意图表类型 */
export type IntentsOf<V> = V extends MvcView<any> ? NonNullable<V['__intents']> : never
