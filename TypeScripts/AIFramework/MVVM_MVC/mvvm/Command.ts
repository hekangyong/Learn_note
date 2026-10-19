/**
 * 命令：把「用户操作」封装成对象
 *
 * View 的按钮只调用 execute，不知道具体做了什么；canExecute 绑定到按钮的「可点击 / 置灰」。
 *
 *   Command       同步命令
 *   AsyncCommand  异步命令：自带 isRunning（加载中）、error（最近一次错误）、取消、并发策略
 *
 * execute 返回结构化结果而不是抛错：UI 事件回调里抛出的异常没人能接住，
 * 所以错误会写入 error 状态并上报，调用方需要时再看返回值。
 */
import { reportError } from '../core/errors'
import { batch, computed, ReadonlySignal, signal } from '../core/reactive'

export type CommandResult<R> =
    | { ok: true; value: R }
    /** disabled：不可执行时被调用（例如按钮置灰仍被点击）；aborted：被取消或被新的执行替换 */
    | { ok: false; reason: 'disabled' | 'aborted' }
    | { ok: false; reason: 'error'; error: unknown }

export interface CommandOptions {
    /** 能否执行：一个 signal，或者一个读取 signal 的函数（会自动转成 computed） */
    canExecute?: ReadonlySignal<boolean> | (() => boolean)
    /** 出错时是否上报到全局错误处理，默认 true */
    reportErrors?: boolean
}

const ALWAYS = computed(() => true)

function toCanExecute(option: CommandOptions['canExecute']): ReadonlySignal<boolean> {
    if (!option) return ALWAYS
    return typeof option === 'function' ? computed(option) : option
}

// ------------------------------------------------------------
// Command
// ------------------------------------------------------------

export class Command<A extends unknown[] = [], R = void> {
    readonly canExecute: ReadonlySignal<boolean>
    private readonly reportErrors: boolean

    constructor(
        private readonly action: (...args: A) => R,
        options: CommandOptions = {}
    ) {
        this.canExecute = toCanExecute(options.canExecute)
        this.reportErrors = options.reportErrors ?? true
    }

    execute(...args: A): CommandResult<R> {
        if (!this.canExecute.peek()) return { ok: false, reason: 'disabled' }
        try {
            return { ok: true, value: this.action(...args) }
        } catch (error) {
            if (this.reportErrors) reportError(error, 'Command')
            return { ok: false, reason: 'error', error }
        }
    }
}

// ------------------------------------------------------------
// AsyncCommand
// ------------------------------------------------------------

/**
 * 并发策略：
 *   drop     执行中再次调用直接忽略（默认）。适合「提交」「购买」，防止重复点击
 *   restart  取消上一次，以最新一次为准。适合「搜索」「刷新列表」
 */
export type ConcurrencyPolicy = 'drop' | 'restart'

export interface AsyncCommandOptions extends CommandOptions {
    concurrency?: ConcurrencyPolicy
}

export class AsyncCommand<A extends unknown[] = [], R = void> {
    private readonly running = signal(false)
    private readonly lastError = signal<unknown>(undefined)
    private readonly policy: ConcurrencyPolicy
    private readonly reportErrors: boolean
    private controller: AbortController | null = null
    /** 每次执行加一，用于判断回来的结果是不是已经过期 */
    private seq = 0
    private disposed = false

    /** 是否正在执行，可绑定到 loading 动画 */
    readonly isRunning: ReadonlySignal<boolean> = this.running.asReadonly()
    /** 最近一次执行的错误，成功或重新执行时清空 */
    readonly error: ReadonlySignal<unknown> = this.lastError.asReadonly()
    readonly canExecute: ReadonlySignal<boolean>

    /**
     * @param action 第一个参数是 AbortSignal：传给 fetch 等 API，取消时可以真正中断请求
     */
    constructor(
        private readonly action: (signal: AbortSignal, ...args: A) => Promise<R>,
        options: AsyncCommandOptions = {}
    ) {
        this.policy = options.concurrency ?? 'drop'
        this.reportErrors = options.reportErrors ?? true
        const allowed = toCanExecute(options.canExecute)
        this.canExecute = computed(() => allowed.value && (this.policy === 'restart' || !this.running.value))
    }

    async execute(...args: A): Promise<CommandResult<R>> {
        if (this.disposed || !this.canExecute.peek()) return { ok: false, reason: 'disabled' }
        if (this.policy === 'restart') this.controller?.abort()

        const controller = new AbortController()
        const id = ++this.seq
        this.controller = controller
        batch(() => {
            this.running.value = true
            this.lastError.value = undefined
        })

        try {
            const value = await this.action(controller.signal, ...args)
            if (controller.signal.aborted) return { ok: false, reason: 'aborted' }
            return { ok: true, value }
        } catch (error) {
            if (controller.signal.aborted) return { ok: false, reason: 'aborted' }
            if (id === this.seq) this.lastError.value = error
            if (this.reportErrors) reportError(error, 'AsyncCommand')
            return { ok: false, reason: 'error', error }
        } finally {
            // 只有最新的一次执行才能修改状态，过期的结果直接丢弃
            if (id === this.seq) this.finish()
        }
    }

    /** 取消正在进行的执行。立即恢复为可执行状态，过期的结果会被丢弃 */
    cancel(): void {
        if (!this.controller) return
        this.controller.abort()
        this.seq++
        this.finish()
    }

    /** 所属 ViewModel 销毁时调用：取消进行中的执行，之后不能再执行 */
    dispose(): void {
        this.cancel()
        this.disposed = true
    }

    private finish(): void {
        this.controller = null
        this.running.value = false
    }
}
