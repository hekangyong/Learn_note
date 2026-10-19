/**
 * 弹窗装饰器：用装饰器把一个 UI 类声明为弹窗，注册和显示都交给管理器
 *
 * 用法：
 *   declare module './PopupManager' {                            // 登记弹窗类型（声明合并）
 *       interface PopupDataMap { Reward: RewardData }
 *   }
 *
 *   @PopupWindow('Reward', { priority: popupPriority('Reward') })
 *   class RewardPopup implements PopupComponent<RewardData> {
 *       @Condition
 *       static notInBattle() { return !player.inBattle }        // 弹出条件
 *
 *       @AfterTutorial
 *       static keepAfterTutorial(data, waited) { return ... }   // 引导结束时是否还弹
 *
 *       onShow(data, close) { ... }                              // 显示，close(result) 关闭
 *       onHide() { ... }                                         // 离开屏幕（可能还会恢复）
 *       onDispose() { ... }                                      // 彻底结束，释放资源
 *   }
 *
 * 与手动 register 相比：
 *   - 「这个类是弹窗、它的优先级和弹出规则」都写在类旁边，打开 UI 类就能看到全部规则；
 *   - 管理器根据 type 自动创建 UI 实例，业务代码仍然只调用 popup.open(type, data)；
 *   - 类型安全：onShow 的 data 类型必须与 PopupDataMap 中声明的一致，写错会编译报错。
 *
 * 实现原理（旧版装饰器 experimentalDecorators，与 SerializeDTO/02-DecoratorDTO.ts 相同）：
 *   1. 装饰器在「类定义时」执行一次，不是在 new 的时候；
 *   2. 执行顺序：先成员装饰器（@Condition、@AfterTutorial），后类装饰器（@PopupWindow）；
 *   3. 所以成员装饰器只把方法记到 pendingMeta 里，类装饰器执行时再一起取出、合并到配置中注册。
 *   4. 装饰 static 方法时，target 是类本身（构造函数）；装饰实例方法时，target 是原型对象。
 *      这里把 target 声明为 Function，装饰实例方法会直接编译报错，保证条件都是 static 方法。
 */
import { GuardResult, PopupCondition, PopupConfig, PopupSystem, PopupView } from './Popup'

// ------------------------------------------------------------
// 1. 类型定义
// ------------------------------------------------------------

/** 用装饰器注册的弹窗 UI 类需要实现的接口 */
export interface PopupComponent<D> {
    /**
     * 可选：首次显示前异步加载资源（预制体、图集、配置……），完成后才调用 onShow。
     * 每个实例只调用一次：加载中被抢占、之后恢复，会继续等同一次加载，不会重复加载。
     * @param signal 弹窗彻底结束（关闭、丢弃）时 abort，可以用来中断下载
     */
    onLoad?(data: D, signal: AbortSignal): Promise<void>
    /**
     * 显示弹窗。被抢占或被引导收起后恢复显示时会再次调用（同一个实例）。
     * @param close 关闭这个弹窗，result 会透传给 open 返回的 closed Promise
     */
    onShow(data: D, close: (result?: unknown) => void): void
    /** 离开屏幕：关闭、被抢占、被引导收起都会调用。之后可能还会再次 onShow */
    onHide?(): void
    /** 彻底结束，之后不会再使用这个实例，在这里释放资源 */
    onDispose?(): void
}

/** 弹窗 UI 类：管理器负责 new，所以构造函数不能有参数 */
export type PopupComponentClass<D> = new () => PopupComponent<D>

/** 成员装饰器收集到的、等待类装饰器取走的配置 */
interface PendingMeta {
    conditions: PopupCondition<any>[]
    afterTutorial?: (data: any, waited: number) => boolean
}

// ------------------------------------------------------------
// 2. 装饰器工厂
// ------------------------------------------------------------

/**
 * 创建绑定到某个 PopupSystem 实例的一组装饰器。
 * 用工厂而不是直接写死单例：装饰器与具体实例解耦，单元测试可以绑定到一个新的实例上。
 */
export function createPopupDecorators<M extends object>(system: PopupSystem<M>) {
    /** 弹窗类型 -> UI 类 */
    const classes = new Map<keyof M, PopupComponentClass<any>>()
    /** UI 类 -> 成员装饰器收集到的配置。WeakMap：不阻止类被回收 */
    const pendingMeta = new WeakMap<Function, PendingMeta>()
    /**
     * 弹窗 id -> UI 实例。同一个弹窗被抢占后恢复，复用同一个实例，保留 UI 状态；
     * loaded 缓存 onLoad 的 Promise，保证只加载一次；controller 在 dispose 时中断加载。
     */
    const instances = new Map<
        number,
        { component: PopupComponent<any>; loaded: Promise<void> | null; controller: AbortController }
    >()

    function getMeta(ctor: Function): PendingMeta {
        let meta = pendingMeta.get(ctor)
        if (!meta) {
            meta = { conditions: [] }
            pendingMeta.set(ctor, meta)
        }
        return meta
    }

    /**
     * 类装饰器：把 UI 类注册为某种弹窗。
     * config 与手动 register 的配置完全相同；@Condition 声明的条件会追加在 config.conditions 之后。
     * 泛型 K 由 type 参数推断，ctor 的 onShow(data) 类型必须与 M[K] 一致。
     */
    function PopupWindow<K extends keyof M>(type: K, config: PopupConfig<M[K]>) {
        return (ctor: PopupComponentClass<M[K]>): void => {
            if (classes.has(type)) {
                throw new Error(`[Popup] 弹窗类型 ${String(type)} 被重复注册：${ctor.name}`)
            }
            const meta = pendingMeta.get(ctor)
            if (meta?.afterTutorial && config.afterTutorial) {
                throw new Error(`[Popup] ${ctor.name} 同时在配置和 @AfterTutorial 中声明了引导结束检查`)
            }

            system.register(type, {
                ...config,
                conditions: [...(config.conditions ?? []), ...(meta?.conditions ?? [])],
                afterTutorial: meta?.afterTutorial ?? config.afterTutorial,
            })
            classes.set(type, ctor)
            pendingMeta.delete(ctor) // 已经合并进配置，不再需要
        }
    }

    /**
     * 方法装饰器：把 static 方法声明为弹出条件。可以声明多个，按声明顺序检查。
     * 方法签名与 PopupCondition 相同：(data) => 'show' | 'wait' | 'drop' | boolean，也可以不接收 data。
     * 泛型 F 是整个方法的类型：TypedPropertyDescriptor<T> 对 T 是「不变」的（既读又写），
     * 如果直接写成 TypedPropertyDescriptor<(data: D) => ...>，无参方法、只返回 boolean 的方法都会报错。
     */
    function Condition<F extends (data: any) => GuardResult | boolean>(
        target: Function,
        _key: string,
        descriptor: TypedPropertyDescriptor<F>
    ): void {
        const method = descriptor.value!
        // 用 call 绑定 this 为类本身，static 方法里可以用 this 调用其他 static 成员
        getMeta(target).conditions.push(data => method.call(target, data))
    }

    /**
     * 方法装饰器：把 static 方法声明为「引导结束时是否还可以弹出」的检查，每个类最多一个。
     * 方法签名与配置中的 afterTutorial 相同：(data, waited) => boolean。
     */
    function AfterTutorial<F extends (data: any, waited: number) => boolean>(
        target: Function,
        key: string,
        descriptor: TypedPropertyDescriptor<F>
    ): void {
        const meta = getMeta(target)
        if (meta.afterTutorial) {
            throw new Error(`[Popup] ${target.name}.${key}：每个弹窗只能有一个 @AfterTutorial`)
        }
        const method = descriptor.value!
        meta.afterTutorial = (data, waited) => method.call(target, data, waited)
    }

    /**
     * 视图适配器：根据弹窗类型找到 UI 类，创建实例并转发生命周期。
     * 使用装饰器模式时，调用 system.setView(view) 即可，不需要再手写视图。
     */
    const view: PopupView<M> = {
        show(info, signal) {
            let entry = instances.get(info.id)
            if (!entry) {
                const ctor = classes.get(info.type)
                if (!ctor) {
                    // 抛出后由管理器丢弃这个弹窗并打印错误，不会卡住队列
                    throw new Error(`[Popup] 弹窗类型 ${String(info.type)} 没有用 @PopupWindow 注册 UI 类`)
                }
                const component = new ctor()
                const controller = new AbortController()
                entry = { component, controller, loaded: null }
                instances.set(info.id, entry)
                entry.loaded = component.onLoad?.(info.data, controller.signal) ?? null
            }
            const { component, loaded } = entry
            const display = () => component.onShow(info.data, result => system.close(info.id, result))
            if (!loaded) return display()
            // 本次 show 被取消（加载期间被关闭 / 抢占 / 收起）时不显示；加载结果仍缓存，恢复时直接用
            return loaded.then(() => {
                if (!signal.aborted) display()
            })
        },
        hide(info) {
            instances.get(info.id)?.component.onHide?.()
        },
        dispose(info) {
            const entry = instances.get(info.id)
            instances.delete(info.id)
            entry?.controller.abort()
            entry?.component.onDispose?.()
        },
    }

    return { PopupWindow, Condition, AfterTutorial, view }
}
