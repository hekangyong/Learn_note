import type { Handler, HandlerOptions } from '../Router'
import type { Cmd, MessageMap } from '../protocol'
import type { AppEventName, AppEvents } from './EventBus'
import type { ServerApp } from './ServerApp'

export type ModuleClass<M extends Module = Module> = abstract new (...args: any[]) => M

/**
 * 业务模块基类：一个业务功能（任务、钱包、同步……）一个模块
 *
 * 生命周期（由 ServerApp 统一调度，按依赖顺序）：
 *   onInit   注册协议处理器、订阅事件（此时还没开始监听端口）
 *   onStart  启动定时器、加载数据等
 *   onStop   逆序调用；通过 this.on 订阅的事件会自动取消
 *
 * 模块之间的两种调用方式：
 *   - 直接调用：声明 deps，再 this.get(OtherModule).method()（需要返回值、强依赖）
 *   - 事件：this.emit / this.on（通知类、发布方不关心谁处理）
 */
export abstract class Module {
    /** 日志里显示的名字 */
    abstract readonly name: string
    /** 依赖的模块：保证它们先初始化、后停止；缺失时启动报错 */
    readonly deps: readonly ModuleClass[] = []

    private _app?: ServerApp
    private readonly disposers: (() => void)[] = []

    protected get app(): ServerApp {
        if (!this._app) throw new Error(`module ${this.name} is not registered`)
        return this._app
    }

    onInit?(): void
    onStart?(): void | Promise<void>
    onStop?(): void | Promise<void>

    /** @internal ServerApp 调用 */
    attach(app: ServerApp) {
        if (this._app) throw new Error(`module ${this.name} already registered`)
        this._app = app
    }

    /** @internal ServerApp 调用 */
    dispose() {
        this.disposers.splice(0).forEach(fn => fn())
    }

    // ---------------- 便捷方法 ----------------

    protected get<M extends Module>(cls: ModuleClass<M>): M {
        return this.app.get(cls)
    }

    protected handle<C extends Cmd>(cmd: C, handler: Handler<C>, opts?: HandlerOptions) {
        this.app.server.handle(cmd, handler, opts)
    }

    protected on<K extends AppEventName>(event: K, listener: (...args: Extract<AppEvents[K], unknown[]>) => void) {
        this.disposers.push(this.app.events.on(event, listener))
    }

    protected emit<K extends AppEventName>(event: K, ...args: Extract<AppEvents[K], unknown[]>) {
        this.app.events.emit(event, ...args)
    }

    protected sendToUser<C extends Cmd>(userId: string, cmd: C, body: MessageMap[C]) {
        return this.app.server.sendToUser(userId, cmd, body)
    }

    protected broadcast<C extends Cmd>(cmd: C, body: MessageMap[C]) {
        return this.app.server.broadcast(cmd, body)
    }

    /** 登记一个在停止时执行的清理函数（定时器等） */
    protected addDisposer(fn: () => void) {
        this.disposers.push(fn)
    }

    protected get log() {
        return this.app.logger.child(this.name)
    }
}
