/**
 * 响应式内核：signal / computed / effect
 *
 *   signal    可读写的状态
 *   computed  派生状态，自动收集依赖，惰性计算 + 缓存
 *   effect    副作用（刷新 UI、写日志……），依赖变化时自动重新执行
 *   batch     批量修改，结束后统一触发一次 effect
 *   untracked 读取但不建立依赖
 *
 * 与旧版 Popup/arch/Observable.ts 相比，解决了商用场景下的几个问题：
 *   1. 自动依赖收集：不用手写依赖列表，也支持「条件分支里才读到的依赖」（动态依赖）；
 *   2. 无毛刺（glitch-free）：菱形依赖 a -> b,c -> d 修改 a 时 d 只计算一次，不会读到中间状态；
 *   3. 惰性 + 自动脱离：没有被任何 effect 使用的 computed 不会订阅上游，
 *      短生命周期的 ViewModel 依赖长生命周期的 Model 也不会造成内存泄漏，无需手动 dispose；
 *   4. 批量更新、死循环保护、循环依赖检测、错误隔离（单个 effect 出错不影响其他）。
 *
 * 算法：推拉结合的三色标记（CLEAN / CHECK / DIRTY）。
 *   写 signal 时只「推」脏标记：直接下游标 DIRTY，更远的下游标 CHECK，effect 进入待执行队列；
 *   执行 effect 时再「拉」：CHECK 的节点先让上游刷新，确认上游值真的变了才重新计算。
 */
import { reportError } from './errors'

export type Disposer = () => void
export type EqualityFn<T> = (a: T, b: T) => boolean

export type SignalListener<T> = (value: T, oldValue: T | undefined) => void

export interface SubscribeOptions {
    /** 订阅时是否立刻用当前值回调一次，默认 false。绑定 UI 时通常传 true 用于显示初始值 */
    immediate?: boolean
}

/** 只读状态：View 只能读取和订阅 */
export interface ReadonlySignal<T> {
    /** 读取当前值；在 computed / effect 中读取会自动建立依赖 */
    readonly value: T
    /** 读取当前值，但不建立依赖 */
    peek(): T
    /** 订阅值的变化（值相同不会通知），返回取消函数 */
    subscribe(listener: SignalListener<T>, options?: SubscribeOptions): Disposer
}

export interface Signal<T> extends ReadonlySignal<T> {
    value: T
    set(value: T): void
    update(updater: (value: T) => T): void
    /** 只读视图：把状态暴露给外部时使用，防止外部直接修改 */
    asReadonly(): ReadonlySignal<T>
}

export interface SignalOptions<T> {
    /** 判断新旧值是否相同，相同则不通知。默认 Object.is；对象可用 shallowEqual */
    equals?: EqualityFn<T>
}

export type EffectFn = () => void | (() => void)

// ------------------------------------------------------------
// 内部实现
// ------------------------------------------------------------

const CLEAN = 0
const CHECK = 1
const DIRTY = 2
type NodeState = typeof CLEAN | typeof CHECK | typeof DIRTY

/** 单次 flush 中 effect 最多执行的次数，超过视为死循环（effect 修改了自己依赖的状态） */
const MAX_EFFECT_RUNS = 100_000

/** 当前正在执行、需要收集依赖的节点 */
let currentObserver: Observer | null = null
let batchDepth = 0
let flushing = false
/** 任意 signal 被修改时加一，供「未被观察的 computed」判断缓存是否可能过期 */
let globalVersion = 0
const pendingEffects: EffectNode[] = []

interface Observer {
    sources: Set<SourceNode>
    /** 本次执行中新收集到的依赖 */
    pending: Set<SourceNode> | null
    state: NodeState
    readonly disposed: boolean
    mark(state: NodeState): void
}

abstract class SourceNode {
    readonly observers = new Set<Observer>()

    /** 确保自己的值是最新的 */
    abstract refresh(): void

    protected onObserved(): void {}
    protected onUnobserved(): void {}

    addObserver(observer: Observer): void {
        this.observers.add(observer)
        if (this.observers.size === 1) this.onObserved()
    }

    removeObserver(observer: Observer): void {
        if (this.observers.delete(observer) && this.observers.size === 0) this.onUnobserved()
    }

    protected track(): void {
        currentObserver?.pending?.add(this)
    }
}

/** 以 observer 身份执行 fn，收集依赖；subscribe 为 true 时同步更新订阅关系 */
function runTracked<R>(observer: Observer, fn: () => R, subscribe: boolean): R {
    const prevObserver = currentObserver
    const next = new Set<SourceNode>()
    observer.pending = next
    currentObserver = observer
    try {
        return fn()
    } finally {
        currentObserver = prevObserver
        observer.pending = null
        if (observer.disposed) {
            // 执行过程中被释放了（例如订阅回调里取消订阅），不再建立任何依赖
            observer.sources = new Set()
        } else {
            if (subscribe) {
                for (const source of observer.sources) if (!next.has(source)) source.removeObserver(observer)
                for (const source of next) if (!observer.sources.has(source)) source.addObserver(observer)
            }
            observer.sources = next
        }
    }
}

/** CHECK 状态：逐个刷新上游，一旦发现自己被标成 DIRTY 就不必继续检查 */
function checkSources(observer: Observer): void {
    for (const source of observer.sources) {
        source.refresh()
        if (observer.state === DIRTY) return
    }
}

class SignalNode<T> extends SourceNode {
    constructor(
        public value: T,
        private readonly equals: EqualityFn<T>
    ) {
        super()
    }

    refresh(): void {}

    read(): T {
        this.track()
        return this.value
    }

    write(next: T): void {
        if (currentObserver instanceof ComputedNode) {
            throw new Error('Cannot write to a signal inside computed(); computed must be side-effect free')
        }
        if (this.equals(this.value, next)) return
        this.value = next
        globalVersion++
        for (const observer of this.observers) observer.mark(DIRTY)
        flush()
    }
}

class ComputedNode<T> extends SourceNode implements Observer {
    sources = new Set<SourceNode>()
    pending: Set<SourceNode> | null = null
    state: NodeState = DIRTY
    readonly disposed = false

    private value: T | undefined = undefined
    private hasValue = false
    private error: unknown = undefined
    private hasError = false
    private computing = false
    /** 上次计算时的 globalVersion */
    private computedAt = -1

    constructor(
        private readonly fn: () => T,
        private readonly equals: EqualityFn<T>
    ) {
        super()
    }

    private get attached(): boolean {
        return this.observers.size > 0
    }

    mark(state: NodeState): void {
        if (this.state >= state) return
        this.state = state
        for (const observer of this.observers) observer.mark(CHECK)
    }

    refresh(): void {
        if (this.computing) throw new Error('Cycle detected in computed()')
        if (this.attached) {
            // 被观察：订阅着上游，脏标记是准确的
            if (this.state === CHECK) checkSources(this)
            if (this.state === DIRTY) this.recompute()
            this.state = CLEAN
        } else if (this.state === DIRTY || this.computedAt !== globalVersion) {
            // 未被观察：没有订阅上游，只要期间有任何 signal 变化过就保守地重新计算
            this.recompute()
        }
    }

    read(): T {
        this.refresh()
        this.track()
        if (this.hasError) throw this.error
        return this.value as T
    }

    /**
     * 重新计算，返回值是否变化。
     * 值变化时只把处于 CHECK 的下游升级为 DIRTY：CLEAN 的下游要么正在执行（此刻读到的就是新值），
     * 要么根本没有在等这次变化，再标脏会导致同一次修改让 effect 执行两遍。
     */
    private recompute(): boolean {
        const oldValue = this.value
        const hadValue = this.hasValue
        const hadError = this.hasError
        let changed: boolean
        this.computing = true
        try {
            const next = runTracked(this, this.fn, this.attached)
            changed = !hadValue || hadError || !this.equals(oldValue as T, next)
            // 值相同时保留旧引用，下游拿到的对象身份保持稳定
            if (changed) this.value = next
            this.hasValue = true
            this.hasError = false
            this.error = undefined
        } catch (error) {
            // 缓存错误：读取时重新抛出，依赖变化后会再次尝试计算
            changed = true
            this.hasError = true
            this.error = error
        } finally {
            this.computing = false
        }
        this.computedAt = globalVersion
        this.state = CLEAN
        if (changed) {
            for (const observer of this.observers) if (observer.state === CHECK) observer.mark(DIRTY)
        }
        return changed
    }

    protected override onObserved(): void {
        for (const source of this.sources) source.addObserver(this)
        // 脱离期间可能错过了上游的变化：立刻补算，值变了要让刚订阅的下游重新执行
        if (this.computedAt !== globalVersion) {
            this.state = DIRTY
            if (this.recompute()) for (const observer of this.observers) observer.mark(DIRTY)
        } else {
            this.state = CLEAN
        }
    }

    protected override onUnobserved(): void {
        // 没人用了就从上游脱离，让自己可以被垃圾回收
        for (const source of this.sources) source.removeObserver(this)
    }
}

class EffectNode implements Observer {
    sources = new Set<SourceNode>()
    pending: Set<SourceNode> | null = null
    state: NodeState = CLEAN
    disposed = false
    private cleanup: (() => void) | undefined = undefined

    constructor(private readonly fn: EffectFn) {}

    mark(state: NodeState): void {
        if (this.disposed || this.state >= state) return
        if (this.state === CLEAN) pendingEffects.push(this)
        this.state = state
    }

    refresh(): void {
        if (this.disposed) return
        if (this.state === CHECK) checkSources(this)
        const dirty = this.state === DIRTY
        // 先置为 CLEAN 再执行：执行过程中依赖又变化时能重新进入队列
        this.state = CLEAN
        if (dirty) this.execute()
    }

    execute(): void {
        this.runCleanup()
        try {
            const result = runTracked(this, this.fn, true)
            if (typeof result === 'function') this.cleanup = result
        } catch (error) {
            reportError(error, 'effect')
        }
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.runCleanup()
        for (const source of this.sources) source.removeObserver(this)
        this.sources.clear()
    }

    private runCleanup(): void {
        const cleanup = this.cleanup
        this.cleanup = undefined
        if (!cleanup) return
        try {
            untracked(cleanup)
        } catch (error) {
            reportError(error, 'effect cleanup')
        }
    }
}

function flush(): void {
    if (batchDepth > 0 || flushing) return
    flushing = true
    try {
        // 执行过程中新加入的 effect 会追加到数组末尾，同一个循环里一并处理
        for (let i = 0; i < pendingEffects.length; i++) {
            if (i >= MAX_EFFECT_RUNS) {
                reportError(
                    new Error(`Effects ran more than ${MAX_EFFECT_RUNS} times in one flush; probable infinite loop`),
                    'effect'
                )
                break
            }
            pendingEffects[i].refresh()
        }
    } finally {
        pendingEffects.length = 0
        flushing = false
    }
}

function subscribeTo<T>(source: ReadonlySignal<T>, listener: SignalListener<T>, options?: SubscribeOptions): Disposer {
    let initialized = false
    let last: T | undefined
    return effect(() => {
        const value = source.value
        const prev = last
        last = value
        if (!initialized) {
            initialized = true
            if (!options?.immediate) return
        }
        // 监听器内部读取的状态不应该成为这次订阅的依赖
        untracked(() => listener(value, prev))
    })
}

class SignalImpl<T> implements Signal<T> {
    private readonly node: SignalNode<T>
    private readonlyView: ReadonlySignal<T> | null = null

    constructor(initial: T, options?: SignalOptions<T>) {
        this.node = new SignalNode(initial, options?.equals ?? Object.is)
    }

    get value(): T {
        return this.node.read()
    }

    set value(next: T) {
        this.node.write(next)
    }

    peek(): T {
        return this.node.value
    }

    set(next: T): void {
        this.node.write(next)
    }

    update(updater: (value: T) => T): void {
        this.node.write(updater(this.node.value))
    }

    subscribe(listener: SignalListener<T>, options?: SubscribeOptions): Disposer {
        return subscribeTo(this, listener, options)
    }

    asReadonly(): ReadonlySignal<T> {
        if (!this.readonlyView) {
            const self = this
            this.readonlyView = {
                get value() {
                    return self.value
                },
                peek: () => self.peek(),
                subscribe: (listener, options) => self.subscribe(listener, options),
            }
        }
        return this.readonlyView
    }
}

class ComputedImpl<T> implements ReadonlySignal<T> {
    private readonly node: ComputedNode<T>

    constructor(fn: () => T, options?: SignalOptions<T>) {
        this.node = new ComputedNode(fn, options?.equals ?? Object.is)
    }

    get value(): T {
        return this.node.read()
    }

    peek(): T {
        return untracked(() => this.node.read())
    }

    subscribe(listener: SignalListener<T>, options?: SubscribeOptions): Disposer {
        return subscribeTo(this, listener, options)
    }
}

// ------------------------------------------------------------
// 公开 API
// ------------------------------------------------------------

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
    return new SignalImpl(initial, options)
}

/**
 * 派生状态。fn 中读取到的所有 signal / computed 都会自动成为依赖。
 * fn 必须是纯函数：不能修改 signal，否则抛错。
 */
export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
    return new ComputedImpl(fn, options)
}

/**
 * 立即执行一次 fn，之后依赖变化时自动重新执行。
 * fn 可以返回清理函数：下次执行前、以及 dispose 时调用。
 * 返回 dispose 函数，必须在不再需要时调用（ViewModel / Controller 会自动处理）。
 */
export function effect(fn: EffectFn): Disposer {
    const node = new EffectNode(fn)
    node.execute()
    // 首次执行期间可能有 effect 进入队列（例如刚订阅的 computed 补算后值变了），统一执行掉
    flush()
    return () => node.dispose()
}

/** 批量修改：fn 执行期间的所有修改合并为一次 effect 执行。可以嵌套 */
export function batch<R>(fn: () => R): R {
    batchDepth++
    try {
        return fn()
    } finally {
        batchDepth--
        flush()
    }
}

/** 执行 fn，期间读取的状态不会成为当前 computed / effect 的依赖 */
export function untracked<R>(fn: () => R): R {
    const prev = currentObserver
    currentObserver = null
    try {
        return fn()
    } finally {
        currentObserver = prev
    }
}

/** 监听一个表达式的结果变化，相当于 computed(getter).subscribe(listener) */
export function watch<T>(
    source: ReadonlySignal<T> | (() => T),
    listener: SignalListener<T>,
    options?: SubscribeOptions & SignalOptions<T>
): Disposer {
    const target = typeof source === 'function' ? computed(source, options) : source
    return target.subscribe(listener, options)
}

export function isReadonlySignal(value: unknown): value is ReadonlySignal<unknown> {
    return value instanceof SignalImpl || value instanceof ComputedImpl
}

/** 浅比较：数组按元素、普通对象按自有属性用 Object.is 比较。用于返回新对象/数组的 computed */
export function shallowEqual<T>(a: T, b: T): boolean {
    if (Object.is(a, b)) return true
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
    if (Array.isArray(a) !== Array.isArray(b)) return false
    const keysA = Object.keys(a) as (keyof T)[]
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]))
}
