import type { Middleware } from '../Router'
import { ServerOptions, WsProtoServer } from '../WsProtoServer'
import { EventBus } from './EventBus'
import type { Module, ModuleClass } from './Module'

export interface Logger {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    child(scope: string): Logger
}

export function consoleLogger(scope = 'app', silent = false): Logger {
    const prefix = `[${scope}]`
    const noop = () => {}
    return {
        info: silent ? noop : (...a) => console.log(prefix, ...a),
        warn: silent ? noop : (...a) => console.warn(prefix, ...a),
        error: (...a) => console.error(prefix, ...a),
        child: s => consoleLogger(s, silent),
    }
}

export interface AppOptions extends ServerOptions {
    logger?: Logger
}

/**
 * 服务端应用：统一的入口
 *
 *   const app = new ServerApp({ port, authenticate })
 *   app.use(logRequests())                       // 中间件：作用于所有请求
 *      .register(new WalletModule(), new TaskModule())   // 业务模块
 *   await app.start()                            // 按依赖顺序 init -> 监听端口 -> start
 *   app.get(TaskModule).addProgress(...)         // 任何地方集中拿到模块
 *   await app.stop()                             // 逆序 stop -> 关闭连接
 */
export class ServerApp {
    readonly server: WsProtoServer
    readonly events: EventBus
    readonly logger: Logger

    private readonly modules: Module[] = []
    private readonly byClass = new Map<Function, Module>()
    private ordered: Module[] = []
    private state: 'idle' | 'starting' | 'running' | 'stopped' = 'idle'

    constructor(options: AppOptions) {
        this.logger = options.logger ?? consoleLogger()
        this.server = new WsProtoServer(options)
        this.events = new EventBus((err, event) => this.logger.error(`event ${event} listener failed`, err))

        // 会话生命周期统一转成应用事件，模块只需要订阅
        this.server.on('login', session => this.events.emit('session:login', session))
        this.server.on('disconnect', (session, code) => {
            if (session.userId) this.events.emit('session:logout', session, code)
        })
        this.server.on('sessionError', (err, session) =>
            this.logger.error(`session ${session?.id ?? '-'} error:`, err.message)
        )
    }

    get running() {
        return this.state === 'running'
    }

    register(...modules: Module[]): this {
        if (this.state !== 'idle') throw new Error('register modules before start()')
        for (const module of modules) {
            const cls = module.constructor
            if (this.byClass.has(cls)) throw new Error(`module ${module.name} registered twice`)
            module.attach(this)
            this.byClass.set(cls, module)
            this.modules.push(module)
        }
        return this
    }

    use(middleware: Middleware): this {
        this.server.router.use(middleware)
        return this
    }

    get<M extends Module>(cls: ModuleClass<M>): M {
        const module = this.byClass.get(cls)
        if (!module) throw new Error(`module ${cls.name} is not registered`)
        return module as M
    }

    has(cls: ModuleClass): boolean {
        return this.byClass.has(cls)
    }

    async start(): Promise<void> {
        if (this.state !== 'idle') throw new Error(`cannot start in state ${this.state}`)
        this.state = 'starting'
        this.ordered = this.sortByDeps()
        try {
            for (const m of this.ordered) m.onInit?.()
            await this.server.start()
            for (const m of this.ordered) await m.onStart?.()
        } catch (err) {
            this.state = 'running' // 允许 stop() 清理已经启动的部分
            await this.stop()
            throw err
        }
        this.state = 'running'
        this.logger.info(
            `listening on :${this.server.port}, modules: ${this.ordered.map(m => m.name).join(' -> ')}`
        )
    }

    async stop(): Promise<void> {
        if (this.state !== 'running') return
        this.state = 'stopped'
        for (const m of [...this.ordered].reverse()) {
            try {
                await m.onStop?.()
            } catch (err) {
                this.logger.error(`module ${m.name} stop failed`, err)
            }
            m.dispose()
        }
        await this.server.stop()
    }

    /** 拓扑排序：依赖先初始化；检测缺失依赖和循环依赖 */
    private sortByDeps(): Module[] {
        const result: Module[] = []
        const visiting = new Set<Module>()
        const done = new Set<Module>()
        const visit = (m: Module, path: string[]) => {
            if (done.has(m)) return
            if (visiting.has(m)) throw new Error(`circular module deps: ${[...path, m.name].join(' -> ')}`)
            visiting.add(m)
            for (const dep of m.deps) {
                const d = this.byClass.get(dep)
                if (!d) throw new Error(`module ${m.name} depends on ${dep.name}, which is not registered`)
                visit(d, [...path, m.name])
            }
            visiting.delete(m)
            done.add(m)
            result.push(m)
        }
        this.modules.forEach(m => visit(m, []))
        return result
    }
}
