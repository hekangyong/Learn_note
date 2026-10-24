/**
 * 响应式内核：signal / computed / effect
 *
 *   signal    可读写的状态
 *   computed  派生状态，自动收集依赖，惰性计算 + 缓存
 *   effect    副作用（刷新 UI、写日志……），依赖变化时自动重新执行
 *   batch     批量修改，结束后统一触发一次 effect
 *   untracked 读取但不建立依赖
 *
 * 与旧版 Popup/arch/Observable.ts（已删除）相比，解决了商用场景下的几个问题：
 *   1. 自动依赖收集：不用手写依赖列表，也支持「条件分支里才读到的依赖」（动态依赖）；
 *   2. 无毛刺（glitch-free）：菱形依赖 a -> b,c -> d 修改 a 时 d 只计算一次，不会读到中间状态；
 *   3. 惰性 + 自动脱离：没有被任何 effect 使用的 computed 不会订阅上游，
 *      短生命周期的 ViewModel 依赖长生命周期的 Model 也不会造成内存泄漏，无需手动 dispose；
 *   4. 批量更新、死循环保护、循环依赖检测、错误隔离（单个 effect 出错不影响其他）；
 *   5. 未被观察的 computed 靠上游版本号判断缓存是否过期，无关 signal 变化不会触发重算。
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

// 节点的三色状态，数值越大越「脏」，mark() 只会把状态往大调（CLEAN -> CHECK -> DIRTY）
/** 值是最新的，无需处理 */
const CLEAN = 0
/** 间接上游变了，自己「可能」需要重算：要先检查上游值是否真的变化 */
const CHECK = 1
/** 直接上游确定变了，必须重算 / 重新执行 */
const DIRTY = 2
type NodeState = typeof CLEAN | typeof CHECK | typeof DIRTY

/**
 * 单次 flush 中同一个 effect 最多执行的次数，超过视为死循环（effect 修改了自己依赖的状态）。
 * 按 effect 计数而不是按总数：大批量 effect 正常执行不会误报，死循环在 100 次内就会被发现，
 * 并且只停掉出问题的那个 effect，队列里其他 effect 照常执行。
 */
const MAX_EFFECT_RUNS_PER_FLUSH = 100

/**
 * 当前正在执行、需要收集依赖的节点。
 * 依赖收集的关键：signal / computed 被读取时，把自己登记到这个 observer 上（见 SourceNode.track）
 */
let currentObserver: Observer | null = null
/** batch 嵌套层数，大于 0 时暂缓 flush，等最外层 batch 结束再统一执行 */
let batchDepth = 0
/** 是否正在 flush，防止 effect 里写 signal 时重入 flush */
let flushing = false
/** 任意 signal 被修改时加一：未被观察的 computed 用它快速判断「期间什么都没变」，不必逐个检查上游 */
let globalVersion = 0
/** 每次 flush 加一，供 effect 统计自己在本次 flush 中的执行次数 */
let flushId = 0
/** 待执行的 effect 队列（被标脏后进入，flush 时依次执行） */
const pendingEffects: EffectNode[] = []

/**
 * 观察者：会读取别人、依赖别人的节点（computed、effect）。
 * 依赖图中的「下游」。
 */
interface Observer {
    /** 依赖 -> 读取时该依赖的 version */
    sources: Map<SourceNode, number>
    /** 本次执行中新收集到的依赖 */
    pending: Map<SourceNode, number> | null
    state: NodeState
    readonly disposed: boolean
    /** 被上游通知「可能变了 / 确定变了」，推阶段调用 */
    mark(state: NodeState): void
}

/**
 * 数据源：可以被读取、被依赖的节点（signal、computed）。
 * 依赖图中的「上游」；computed 既是 SourceNode 又是 Observer。
 */
abstract class SourceNode {
    /** 依赖自己的下游 */
    readonly observers = new Set<Observer>()
    /** 值每变化一次加一；未被观察的 computed 比较它来判断上游是否真的变过 */
    version = 0

    /** 确保自己的值是最新的（拉阶段调用） */
    abstract refresh(): void

    /** 第一个下游订阅时触发：computed 借此去订阅它的上游 */
    protected onObserved(): void {}
    /** 最后一个下游取消时触发：computed 借此从上游脱离，避免内存泄漏 */
    protected onUnobserved(): void {}

    addObserver(observer: Observer): void {
        this.observers.add(observer)
        if (this.observers.size === 1) this.onObserved()
    }

    removeObserver(observer: Observer): void {
        if (this.observers.delete(observer) && this.observers.size === 0)
            this.onUnobserved()
    }

    /** 被读取时调用：如果当前有 observer 在收集依赖，就把自己记为它的依赖 */
    protected track(): void {
        const pending = currentObserver?.pending
        // 同一次执行中多次读取只记第一次的版本号：中途被改过的话，下次检查时能发现
        if (pending && !pending.has(this)) pending.set(this, this.version)
    }
}

/**
 * 以 observer 身份执行 fn，收集依赖；subscribe 为 true 时同步更新订阅关系
 *
 * 每次执行都重新收集一遍依赖（而不是累加），所以天然支持动态依赖：
 *   if (a.value) b.value else c.value  —— a 为真时只依赖 a、b，不会因为 c 变化而重新执行
 */
function runTracked<R>(observer: Observer, fn: () => R, subscribe: boolean): R {
    // 保存外层 observer，支持嵌套（effect 里读 computed，computed 再读 signal）
    const prevObserver = currentObserver
    const next = new Map<SourceNode, number>()
    observer.pending = next
    currentObserver = observer
    try {
        return fn()
    } finally {
        currentObserver = prevObserver
        observer.pending = null
        if (observer.disposed) {
            // 执行过程中被释放了（例如订阅回调里取消订阅），不再建立任何依赖
            observer.sources = new Map()
        } else {
            if (subscribe) {
                // 新旧依赖做差集：不再依赖的取消订阅，新增的建立订阅
                for (const source of observer.sources.keys())
                    if (!next.has(source)) source.removeObserver(observer)
                for (const source of next.keys())
                    if (!observer.sources.has(source))
                        source.addObserver(observer)
            }
            observer.sources = next
        }
    }
}

/**
 * CHECK 状态：逐个刷新上游，一旦发现自己被标成 DIRTY 就不必继续检查
 *
 * 上游 computed 在 refresh -> recompute 中如果发现值真的变了，会把 CHECK 的下游升级成 DIRTY；
 * 所以这里不用比较返回值，只看自己的 state 有没有被改成 DIRTY 即可。
 * 若所有上游刷新完自己仍是 CHECK，说明上游值都没变，可以跳过重算（这就是「拉」带来的剪枝）。
 */
function checkSources(observer: Observer): void {
    for (const source of observer.sources.keys()) {
        source.refresh()
        if (observer.state === DIRTY) return
    }
}

/** signal 的内部节点：依赖图的叶子（只有下游，没有上游） */
class SignalNode<T> extends SourceNode {
    constructor(
        public value: T,
        private readonly equals: EqualityFn<T>
    ) {
        super()
    }

    // signal 的值总是最新的，无需刷新
    refresh(): void {}

    read(): T {
        this.track()
        return this.value
    }

    write(next: T): void {
        if (currentObserver instanceof ComputedNode) {
            throw new Error(
                'Cannot write to a signal inside computed(); computed must be side-effect free'
            )
        }
        // 值没变不通知，避免无意义的重算
        if (this.equals(this.value, next)) return
        this.value = next
        this.version++
        globalVersion++
        // 推阶段：直接下游标 DIRTY（computed 会继续把它的下游标 CHECK，effect 会进入队列）
        for (const observer of this.observers) observer.mark(DIRTY)
        // 拉阶段：执行队列中的 effect（batch 中会被推迟）
        flush()
    }
}

/** computed 的内部节点：既是上游（被 effect / computed 读取），也是下游（读取 signal / computed） */
class ComputedNode<T> extends SourceNode implements Observer {
    sources = new Map<SourceNode, number>()
    pending: Map<SourceNode, number> | null = null
    state: NodeState = DIRTY
    readonly disposed = false

    /** 缓存的计算结果 */
    private value: T | undefined = undefined
    private hasValue = false
    /** 缓存的计算异常，读取时重新抛出 */
    private error: unknown = undefined
    private hasError = false
    /** 正在计算中；计算期间又被 refresh 说明存在循环依赖 */
    private computing = false
    /** 上次计算时的 globalVersion */
    private computedAt = -1

    constructor(
        private readonly fn: () => T,
        private readonly equals: EqualityFn<T>
    ) {
        super()
    }

    /** 是否有下游在使用自己；只有 attached 时才真正订阅上游 */
    private get attached(): boolean {
        return this.observers.size > 0
    }

    /**
     * 推阶段：自己被标脏后，下游一律只标 CHECK —— 此时还不知道自己的值是否真的会变。
     * 已经是同等或更脏的状态就直接返回，保证每个节点在一次修改中只被传播一次。
     */
    mark(state: NodeState): void {
        if (this.state >= state) return
        this.state = state
        for (const observer of this.observers) observer.mark(CHECK)
    }

    /** 拉阶段：按需把自己更新到最新值 */
    refresh(): void {
        if (this.computing) throw new Error('Cycle detected in computed()')
        if (this.attached) {
            // 被观察：订阅着上游，脏标记是准确的
            if (this.state === CHECK) checkSources(this)
            if (this.state === DIRTY) this.recompute()
            this.state = CLEAN
        } else if (this.isStale()) {
            // 未被观察：没有订阅上游、收不到脏标记，靠上游版本号判断
            this.recompute()
        }
    }

    /**
     * 未被观察时判断缓存是否过期。
     * globalVersion 没变说明期间没有任何 signal 被修改，直接复用缓存；
     * 否则逐个刷新上游并比较版本号，只有自己读过的上游真的变了才需要重算。
     */
    private isStale(): boolean {
        if (this.state === DIRTY) return true
        if (this.computedAt !== globalVersion) {
            for (const [source, version] of this.sources) {
                source.refresh()
                if (source.version !== version) return true
            }
        }
        this.state = CLEAN
        this.computedAt = globalVersion
        return false
    }

    read(): T {
        // 先确保值最新（惰性：只在被读取时才计算），再登记依赖
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
            // 未被观察时只收集依赖、不订阅上游（subscribe = false），这样不会被上游持有引用
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
            this.version++
            for (const observer of this.observers)
                if (observer.state === CHECK) observer.mark(DIRTY)
        }
        return changed
    }

    protected override onObserved(): void {
        for (const source of this.sources.keys()) source.addObserver(this)
        // 脱离期间可能错过了上游的变化：上游真的变了就补算，值变了要让刚订阅的下游重新执行
        if (this.isStale() && this.recompute())
            for (const observer of this.observers) observer.mark(DIRTY)
    }

    protected override onUnobserved(): void {
        // 没人用了就从上游脱离，让自己可以被垃圾回收
        for (const source of this.sources.keys()) source.removeObserver(this)
    }
}

/** effect 的内部节点：依赖图的终点（只有上游，没有下游），负责真正执行副作用 */
class EffectNode implements Observer {
    sources = new Map<SourceNode, number>()
    pending: Map<SourceNode, number> | null = null
    state: NodeState = CLEAN
    disposed = false
    /** 上次执行 fn 返回的清理函数 */
    private cleanup: (() => void) | undefined = undefined
    /** 最近一次执行所在的 flush，以及在该 flush 中已执行的次数（死循环保护） */
    private runFlushId = -1
    private runsInFlush = 0

    constructor(private readonly fn: EffectFn) {}

    /**
     * 推阶段：effect 被标脏时不立即执行，而是进入队列等 flush。
     * 只在从 CLEAN 变脏时入队一次，同一次修改多条路径到达也不会重复入队。
     */
    mark(state: NodeState): void {
        if (this.disposed || this.state >= state) return
        if (this.state === CLEAN) pendingEffects.push(this)
        this.state = state
    }

    /** 拉阶段：CHECK 时先确认上游是否真的变了，确实是 DIRTY 才执行 */
    refresh(): void {
        if (this.disposed) return
        if (this.state === CHECK) checkSources(this)
        const dirty = this.state === DIRTY
        // 先置为 CLEAN 再执行：执行过程中依赖又变化时能重新进入队列
        this.state = CLEAN
        if (!dirty) return
        if (this.runFlushId !== flushId) {
            this.runFlushId = flushId
            this.runsInFlush = 0
        }
        if (++this.runsInFlush > MAX_EFFECT_RUNS_PER_FLUSH) {
            // 只停掉这一个 effect：状态已是 CLEAN、依赖仍在，之后依赖再变化时会恢复执行
            reportError(
                new Error(
                    `Effect ran more than ${MAX_EFFECT_RUNS_PER_FLUSH} times in one flush; probable infinite loop`
                ),
                'effect'
            )
            return
        }
        this.execute()
    }

    execute(): void {
        // 先清理上一次执行留下的副作用（如取消定时器、移除监听）
        this.runCleanup()
        try {
            const result = runTracked(this, this.fn, true)
            if (typeof result === 'function') {
                this.cleanup = result
                // 执行过程中被 dispose 了：dispose 时还没有这个清理函数，这里补调，避免泄漏
                if (this.disposed) this.runCleanup()
            }
        } catch (error) {
            // 错误隔离：只上报不抛出，队列中其他 effect 照常执行
            reportError(error, 'effect')
        }
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.runCleanup()
        for (const source of this.sources.keys()) source.removeObserver(this)
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

/** 调度器：依次执行待执行队列中的 effect。batch 中或已在 flush 中时直接返回 */
function flush(): void {
    if (batchDepth > 0 || flushing) return
    flushing = true
    flushId++
    try {
        // 执行过程中新加入的 effect 会追加到数组末尾，同一个循环里一并处理。
        // 死循环由每个 effect 自己的执行次数上限打断，队列总能走到末尾，不会丢弃还没执行的 effect
        for (let i = 0; i < pendingEffects.length; i++) {
            try {
                pendingEffects[i].refresh()
            } catch (error) {
                // 例如检查上游时遇到循环依赖。不能让异常中断队列：
                // 后面的 effect 会停在脏状态，mark() 不会再让它们入队，从此再也不执行
                reportError(error, 'effect')
            }
        }
    } finally {
        pendingEffects.length = 0
        flushing = false
    }
}

/**
 * subscribe 的实现：用一个只读取 source 的 effect 包装 listener。
 * 因为 effect 只依赖 source，source 值不变（equals 判定相同）时 listener 不会被调用
 */
function subscribeTo<T>(
    source: ReadonlySignal<T>,
    listener: SignalListener<T>,
    options?: SubscribeOptions
): Disposer {
    let initialized = false
    /** 上一次的值，作为 listener 的 oldValue */
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

    subscribe(
        listener: SignalListener<T>,
        options?: SubscribeOptions
    ): Disposer {
        return subscribeTo(this, listener, options)
    }

    asReadonly(): ReadonlySignal<T> {
        return (this.readonlyView ??= new ReadonlySignalView(this))
    }
}

/** signal 的只读视图：只转发读取和订阅，不暴露写方法 */
class ReadonlySignalView<T> implements ReadonlySignal<T> {
    constructor(private readonly target: SignalImpl<T>) {}

    get value(): T {
        return this.target.value
    }

    peek(): T {
        return this.target.peek()
    }

    subscribe(
        listener: SignalListener<T>,
        options?: SubscribeOptions
    ): Disposer {
        return this.target.subscribe(listener, options)
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

    subscribe(
        listener: SignalListener<T>,
        options?: SubscribeOptions
    ): Disposer {
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
export function computed<T>(
    fn: () => T,
    options?: SignalOptions<T>
): ReadonlySignal<T> {
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
    const target =
        typeof source === 'function' ? computed(source, options) : source
    return target.subscribe(listener, options)
}

/**
 * 是否为本模块创建的响应式值：signal、computed、signal.asReadonly() 的只读视图都返回 true。
 * 按来源而不是形状判断：手写的 { value, peek, subscribe } 对象不会参与依赖收集，返回 false。
 * 可写的 signal 同样返回 true（它也满足 ReadonlySignal 接口），返回 true 不代表「不可写」。
 */
export function isReadonlySignal(
    value: unknown
): value is ReadonlySignal<unknown> {
    return (
        value instanceof SignalImpl ||
        value instanceof ComputedImpl ||
        value instanceof ReadonlySignalView
    )
}

/**
 * 浅比较，用于返回新对象/数组的 computed，元素和属性都用 Object.is 比较：
 *   数组按下标逐个比较，长度不同即不等；普通对象按自有可枚举属性比较；
 *   Map、Set、Date、类实例等状态不在自有属性上，只按引用比较，宁可多通知一次也不漏掉变化。
 */
export function shallowEqual<T>(a: T, b: T): boolean {
    if (Object.is(a, b)) return true
    if (
        typeof a !== 'object' ||
        typeof b !== 'object' ||
        a === null ||
        b === null
    ) {
        return false
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return false
        // 按下标而不是 Object.keys 比较：空位读出来是 undefined；
        // 用 keys 的话 new Array(3) 和 [] 的 keys 都为空，会被误判为相等
        for (let i = 0; i < a.length; i++)
            if (!Object.is(a[i], b[i])) return false
        return true
    }
    if (!isPlainObject(a) || !isPlainObject(b)) return false
    const keysA = Object.keys(a) as (keyof T)[]
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every(
        key =>
            Object.prototype.hasOwnProperty.call(b, key) &&
            Object.is(a[key], b[key])
    )
}

function isPlainObject(value: object): boolean {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}
