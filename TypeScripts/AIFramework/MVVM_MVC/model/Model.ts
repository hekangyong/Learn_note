/**
 * Model 基类：业务数据 + 业务规则。MVC 与 MVVM 共用同一个 Model 层。
 *
 * 约定：
 *   - 状态是不可变的（每次修改生成新对象，并做浅冻结），方便比较、调试、做撤销；
 *   - setState 是 protected 的：外部只能调用 Model 的业务方法（add / toggle / buy ...）修改数据，
 *     业务规则集中在 Model 里，不会散落到 Controller / ViewModel；
 *   - 状态底层是 signal：MVC 的 Controller 可以 observe 它手动刷新 View，
 *     MVVM 的 ViewModel 可以直接在 computed 中读取 model.state，依赖自动建立。
 */
import { computed, Disposer, EqualityFn, ReadonlySignal, Signal, signal, SignalListener, SubscribeOptions } from '../core/reactive'

export abstract class Model<S extends object> {
    private readonly store: Signal<S>
    /** 整个状态的只读 signal */
    readonly state$: ReadonlySignal<S>

    protected constructor(initial: S) {
        this.store = signal(Object.freeze({ ...initial }))
        this.state$ = this.store.asReadonly()
    }

    /** 当前状态。在 computed / effect 中读取会自动建立依赖 */
    get state(): S {
        return this.store.value
    }

    /**
     * 合并修改状态。所有字段都与当前值相同时什么都不做，返回 false。
     * @param patch 要修改的字段，或者根据当前状态计算修改的函数
     */
    protected setState(patch: Partial<S> | ((state: S) => Partial<S>)): boolean {
        const prev = this.store.peek()
        const changes = typeof patch === 'function' ? patch(prev) : patch
        const keys = Object.keys(changes) as (keyof S)[]
        if (!keys.some(key => !Object.is(prev[key], changes[key]))) return false
        this.store.value = Object.freeze({ ...prev, ...changes })
        return true
    }

    /**
     * 选择状态的一部分。只有选择结果变化时才会通知，避免无关字段变化引起刷新。
     * 选择结果是新建的对象/数组时，传入 shallowEqual 作为 equals。
     */
    select<R>(selector: (state: S) => R, equals?: EqualityFn<R>): ReadonlySignal<R> {
        return computed(() => selector(this.state), { equals })
    }

    /** 监听状态的一部分，返回取消函数 */
    observe<R>(
        selector: (state: S) => R,
        listener: SignalListener<R>,
        options?: SubscribeOptions & { equals?: EqualityFn<R> }
    ): Disposer {
        return this.select(selector, options?.equals).subscribe(listener, options)
    }
}
