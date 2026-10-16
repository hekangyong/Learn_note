/**
 * 极简响应式工具：MVVM 的数据绑定基础，也可以给 MVC 的 Model 使用
 *
 *   Observable  可观察的值：值变化时通知订阅者（值相同不通知）
 *   Computed    派生值：由若干个 Observable 计算得出，依赖变化时自动重新计算
 *   Command     命令：把「用户操作」封装成对象，并带有「当前能否执行」的可观察状态
 *   DisposeBag  统一收集取消订阅函数，销毁时一次性释放，避免内存泄漏
 *
 * Computed 采用「显式声明依赖」而不是 Vue/MobX 那样的自动依赖收集：
 * 实现简单、行为可预测，依赖关系一眼可见，适合作为学习和中小项目的基础设施。
 */

/** 取消订阅 */
export type Unsubscribe = () => void

export type ObservableListener<T> = (value: T, oldValue: T) => void

/** 只读的可观察值：View 只能读取和订阅，不能修改 */
export interface ReadonlyObservable<T> {
    readonly value: T
    /**
     * 订阅值的变化。
     * @param immediate 是否立刻用当前值回调一次（绑定 UI 时通常需要，用于显示初始值）
     */
    subscribe(listener: ObservableListener<T>, immediate?: boolean): Unsubscribe
}

// ------------------------------------------------------------
// Observable
// ------------------------------------------------------------

export class Observable<T> implements ReadonlyObservable<T> {
    private readonly listeners = new Set<ObservableListener<T>>()

    /**
     * @param current 初始值
     * @param equals  判断新旧值是否相同，相同则不通知。默认 Object.is；
     *                对象/数组需要按内容比较时可以传入自定义比较函数
     */
    constructor(
        private current: T,
        private readonly equals: (a: T, b: T) => boolean = Object.is
    ) {}

    get value(): T {
        return this.current
    }

    set value(next: T) {
        if (this.equals(this.current, next)) return
        const old = this.current
        this.current = next
        // 拷贝一份再遍历：回调里取消订阅或新增订阅，不影响本次通知
        for (const listener of [...this.listeners]) listener(next, old)
    }

    subscribe(listener: ObservableListener<T>, immediate = true): Unsubscribe {
        this.listeners.add(listener)
        if (immediate) listener(this.current, this.current)
        return () => {
            this.listeners.delete(listener)
        }
    }
}

// ------------------------------------------------------------
// Computed
// ------------------------------------------------------------

/**
 * 派生值。例如 总价 = 数量 × 单价，可购买 = 金币 >= 总价。
 * 依赖变化时重新计算；计算结果没变时不会通知下游（由内部 Observable 保证）。
 * 订阅了依赖，所以不再使用时必须 dispose。
 */
export class Computed<T> implements ReadonlyObservable<T> {
    private readonly inner: Observable<T>
    private readonly unsubscribes: Unsubscribe[]

    /**
     * @param sources 依赖的可观察值（显式声明）
     * @param compute 计算函数，只能读取 sources 中的值，否则依赖变化时不会重新计算
     */
    constructor(
        sources: ReadonlyObservable<unknown>[],
        private readonly compute: () => T
    ) {
        this.inner = new Observable(compute())
        this.unsubscribes = sources.map(source =>
            source.subscribe(() => (this.inner.value = this.compute()), false)
        )
    }

    get value(): T {
        return this.inner.value
    }

    subscribe(listener: ObservableListener<T>, immediate = true): Unsubscribe {
        return this.inner.subscribe(listener, immediate)
    }

    dispose(): void {
        this.unsubscribes.forEach(unsubscribe => unsubscribe())
    }
}

// ------------------------------------------------------------
// Command
// ------------------------------------------------------------

/**
 * 命令：View 的按钮只调用 execute，不知道具体做了什么；
 * canExecute 可以绑定到按钮的「可点击/置灰」状态上。
 */
export class Command<A extends unknown[] = []> {
    readonly canExecute: ReadonlyObservable<boolean>

    /**
     * @param action     执行的操作
     * @param canExecute 能否执行，默认始终可以
     */
    constructor(
        private readonly action: (...args: A) => void,
        canExecute?: ReadonlyObservable<boolean>
    ) {
        this.canExecute = canExecute ?? new Observable(true)
    }

    /** 执行命令。不能执行时（例如按钮置灰仍被点击）直接返回 false，不会执行操作 */
    execute(...args: A): boolean {
        if (!this.canExecute.value) return false
        this.action(...args)
        return true
    }
}

// ------------------------------------------------------------
// DisposeBag
// ------------------------------------------------------------

/** 收集需要释放的资源（取消订阅、Computed、定时器……），dispose 时一次性释放 */
export class DisposeBag {
    private items: (() => void)[] = []

    add(...disposers: (() => void)[]): void {
        this.items.push(...disposers)
    }

    dispose(): void {
        // 先换出再执行：释放过程中再 add 的会留到下一次 dispose
        const items = this.items
        this.items = []
        items.forEach(dispose => dispose())
    }
}
