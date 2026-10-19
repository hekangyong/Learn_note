/**
 * 红点系统与 MVVM_MVC 框架的桥接
 *
 *   Model（框架） ──写入桥──▶ RedDotSystem（不改动） ──读取桥──▶ ViewModel / Controller（框架）
 *
 * 为什么只在边界桥接，而不用 signal / computed 重写红点树：
 *   红点树的增量求和（O(深度)）、跨微任务 / 按帧的写合并、可替换的调度器，
 *   都是 computed 求和（每次遍历全部子节点）和同步传播的 signal 做不到的。
 *   所以红点系统保持原样，只在两端做转换。
 *
 * 读取桥：redDotSignal(system, path)
 *   把一个红点节点变成框架的 ReadonlySignal<number>，可以在 computed 中和其他状态组合、
 *   在 View 中 bind、在 Controller 中 observe。它同时是 IDisposable，直接登记到
 *   ViewModel / Controller 的 addDisposable，界面结束时自动取消对红点的监听。
 *
 * 写入桥：syncRedDot / syncRedDotMap
 *   用 effect 把 Model 状态推导成红点数值：Model 一变，红点自动跟着变，
 *   业务代码不再需要记得手动调用 redDot.set。高频写入仍由红点系统合并，性能不受影响。
 */
import { Disposer, effect, IDisposable, ReadonlySignal, signal, SignalListener, SubscribeOptions } from '../MVVM_MVC'
import { RedDotSystem } from './RedDot'

// ------------------------------------------------------------
// 读取桥
// ------------------------------------------------------------

/** 红点节点对应的只读状态，值为节点的汇总值（自身 + 子树） */
export class RedDotSignal implements ReadonlySignal<number>, IDisposable {
    private readonly count = signal(0)
    private off: (() => void) | null

    constructor(
        system: RedDotSystem,
        readonly path: string
    ) {
        // 初始值取已提交的值；尚在 pending 中的修改会在红点系统 flush 时通过 on 回调送达
        this.count.set(system.get(path))
        this.off = system.on(path, value => this.count.set(value), false)
    }

    get value(): number {
        return this.count.value
    }

    peek(): number {
        return this.count.peek()
    }

    subscribe(listener: SignalListener<number>, options?: SubscribeOptions): Disposer {
        return this.count.subscribe(listener, options)
    }

    /** 取消对红点系统的监听，之后值不再变化 */
    dispose(): void {
        this.off?.()
        this.off = null
    }
}

/**
 * 创建红点节点的只读状态。用完必须 dispose，推荐直接登记到所属对象上：
 *   ViewModel：  readonly mailDot = this.addDisposable(redDotSignal(redDot, RedDotPath.Mail))
 *   Controller： const dot = this.addDisposable(redDotSignal(redDot, RedDotPath.Mail))
 *
 * 注意：与 redDot.on 相同，绑定的节点（或其祖先）被 remove 后不会再收到通知。
 */
export function redDotSignal(system: RedDotSystem, path: string): RedDotSignal {
    return new RedDotSignal(system, path)
}

// ------------------------------------------------------------
// 写入桥
// ------------------------------------------------------------

/**
 * 把一个表达式的结果同步到红点叶子上。compute 中读取的 signal / Model 状态会自动成为依赖。
 * 返回取消函数；取消后红点保留最后的值（需要归零时自己 set(path, 0)）。
 *
 *   syncRedDot(redDot, RedDotPath.MailSystem, () => mailModel.state.mails.filter(m => !m.read).length)
 */
export function syncRedDot(system: RedDotSystem, path: string, compute: () => number): Disposer {
    return effect(() => {
        system.set(path, compute())
    })
}

/**
 * 把一组动态红点（例如每个新道具一个红点）同步到红点树上。
 * 结果中新出现的 key 会创建节点，消失的 key 会 remove 对应节点（祖先自动扣减）。
 *
 *   syncRedDotMap(redDot, RedDotPath.BagItem, () => bagModel.state.newItems)   // { [itemId]: 1 }
 *
 * @param pathOf  key -> 红点路径
 * @param compute 返回 key -> 数值；数值为 0 的 key 会保留节点（set 0），不会 remove
 */
export function syncRedDotMap<K extends string | number>(
    system: RedDotSystem,
    pathOf: (key: K) => string,
    compute: () => ReadonlyMap<K, number> | Readonly<Record<K, number>>
): Disposer {
    let previous = new Map<K, string>()
    const stop = effect(() => {
        const result = compute()
        const entries: [K, number][] =
            result instanceof Map ? [...result] : (Object.entries(result) as [string, number][]).map(([k, v]) => [toKey<K>(k), v])
        const next = new Map<K, string>()
        for (const [key, value] of entries) {
            const path = pathOf(key)
            next.set(key, path)
            system.set(path, value)
        }
        for (const [key, path] of previous) if (!next.has(key)) system.remove(path)
        previous = next
    })
    return () => {
        stop()
        previous = new Map()
    }
}

/** Object.entries 的 key 都是字符串；数字 key（如道具 id）转换回数字，保证 pathOf 拿到原始类型 */
function toKey<K extends string | number>(raw: string): K {
    const num = Number(raw)
    return (raw !== '' && String(num) === raw ? num : raw) as K
}
