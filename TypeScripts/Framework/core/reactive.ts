export type EqualityFn<T> = (a: T, b: T) => boolean
/** 任意 signal 被修改时加一， 供【未被观察的computed】判断缓存是否可能过期 */
let globalVersion = 0
let currentObserver: Observer | null = null
let batchDepth = 0
let flushing = false
const pendingEffects: EffectNode[] = []

const CLEAN = 0
const CHECK = 1
const DIRTY = 2

type NodeState = typeof CLEAN | typeof CHECK | typeof DIRTY

interface Observer {
    source: Set<SourceNode>
    pending: Set<SourceNode> | null
    state: NodeState
    readonly disposed: boolean
    mark(state: NodeState): void
}

export type EffectFn = () => void | (() => void)

abstract class SourceNode {
    readonly observer = new Set<Observer>()

    /** 确保自己的值是最新的（拉阶段调用） */
    abstract refresh(): void

    /** 第一个下游订阅时触发：computed 借此去订阅它的上游 */
    protected onObserverd(): void {}

    /** 最后一个下游取消订阅时触发：computed 借此取消订阅它的上游 */
    protected onUnObserverd(): void {}

    addObserver(observer: Observer): void {
        this.observer.add(observer)
        if (this.observer.size === 1) {
            this.onObserverd()
        }
    }

    removeObserver(observer: Observer): void {
        if (this.observer.delete(observer) && this.observer.size == 0) {
            this.onUnObserverd()
        }
    }

    /** 被读取时调用：如果当前有observer在收集依赖，就把自己记为它的依赖 */
    protected track(): void {
        currentObserver?.pending?.add(this)
    }
}

/**
 * 以 observer 身份执行 fn，收集依赖；subscribe 为 true 时同步更新订阅关系
 *
 * 每次执行都重新收集一遍依赖（而不是累加），所以天然支持动态依赖：
 *   if (a.value) b.value else c.value  —— a 为真时只依赖 a、b，不会因为 c 变化而重新执行
 */
function runTracked<R>(observer: Observer, fn: () => R, subscribe: boolean): R {
    const preObserver = currentObserver
    const next = new Set<SourceNode>()
    observer.pending = next
    currentObserver = observer

    try {
        return fn()
    } finally {
        currentObserver = preObserver
        observer.pending = null
        if (observer.disposed) {
            observer.source = new Set()
        } else {
            if (subscribe) {
                for (const source of observer.source) {
                    if (!next.has(source)) {
                        source.removeObserver(observer)
                    }
                }
                for (const source of next) {
                    if (!observer.source.has(source)) {
                        source.addObserver(observer)
                    }
                }
            }
            observer.source = next
        }
    }
}

function checkSources(observer: Observer) {
    for (const source of observer.source) {
        source.refresh()
        if (observer.state === DIRTY) {
            return
        }
    }
}

function flush(): void {
    if (batchDepth > 0 || flushing) return
    flushing = true
    try {
        for(let i = 0 ; i < pendingEffects.length; i++) {
            // pendingEffects[i].refresh()
        }
    } finally {
    }
}

class ComputedNode<T> extends SourceNode implements Observer {
    source = new Set<SourceNode>()
    pending: Set<SourceNode> | null = null
    state: NodeState = DIRTY
    disposed = false

    /** 缓存的计算结果 */
    private value: T | undefined = undefined
    private hasValue = false
    /** 缓存的计算异常，读取时重新抛出s */
    private error: unknown = undefined
    private hasError = false
    /** 正在计算中：计算期间又被refresh 说明在循环依赖 */
    private computing = false
    /** 上次计算式的globalVersion */
    private computedAt = -1

    constructor(
        private readonly fn: () => T,
        private readonly equals: EqualityFn<T>
    ) {
        super()
    }

    /** 是否有下游在使用自己：只有attached 时才真正订阅上游 */
    private get attached(): boolean {
        return this.observer.size > 0
    }

    mark(state: NodeState): void {
        if (this.state >= state) return
        this.state = state
        for (const observer of this.observer) {
            observer.mark(CHECK)
        }
    }

    refresh(): void {
        if (this.computing) {
            throw new Error('Cycle detected in computed()')
        }
        if (this.attached) {
            if (this.state === CHECK) {
                checkSources(this)
            }
            if (this.state === DIRTY) {
                this.recompute()
            }
            this.state = CLEAN
        } else if (this.state === DIRTY || this.computedAt !== globalVersion) {
            /** 未被观察：没有订阅上游，只要期间有任何signal 变化过就保守地重新计算 */
            this.recompute()
        }
    }

    read(): T {
        this.refresh()
        this.track()
        if (this.hasError) {
            throw this.error
        }
        return this.value as T
    }

    private recompute(): boolean {
        const oldValue = this.value
        const hadValue = this.hasValue
        const hadError = this.hasError
        let changed: boolean
        this.computing = true
        try {
            const next = runTracked(this, this.fn, this.attached)
            changed = !hadValue || hadError || !this.equals(oldValue as T, next)
            if (changed) {
                this.value = next
            }
            this.hasValue = true
            this.hasError = false
            this.error = undefined
        } catch (error) {
            changed = true
            this.hasError = true
            this.error = error
        } finally {
            this.computing = false
        }
        this.computedAt = globalVersion
        this.state = CLEAN
        if (changed) {
            for (const observer of this.observer) {
                observer.mark(CHECK)
            }
        }

        return false
    }

    protected override onObserverd(): void {
        for (const source of this.source) {
            source.addObserver(this)
        }
        if (this.computedAt !== globalVersion) {
            this.state = DIRTY
            if (this.recompute()) {
                for (const observer of this.observer) {
                    observer.mark(CHECK)
                }
            }
        } else {
            this.state = CLEAN
        }
    }

    protected override onUnObserverd(): void {
        for (const source of this.source) {
            source.removeObserver(this)
        }
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
            throw new Error(
                'Cannot write to a signal inside computed(); computed must be side-effect free'
            )
        }
        if (this.equals(this.value, next)) return
        this.value = next
        globalVersion++
        for (const observer of this.observer) {
            observer.mark(DIRTY)
        }
        flush()
    }
}


class EffectNode implements Observer {
    source: Set<SourceNode> = new Set()
    pending: Set<SourceNode> | null = null
    state: NodeState = DIRTY
    disposed: boolean = false

    private cleaup: (() => void) | null = null

    constructor(private readonly fn: () => void) {}

    mark(state: NodeState): void {
    }
}