/**
 * 弹窗管理系统（Popup Manager）
 *
 * ============================================================
 * 一、要解决的问题
 * ============================================================
 * 游戏/应用里各个模块都会「随时」想弹窗：升级、奖励、公告、活动、新手引导……
 * 如果各模块直接打开 UI，会出现：
 *   - 多个弹窗叠在一起，或者低优先级的公告盖住了重要的升级提示；
 *   - 新手引导进行到一半，被活动弹窗打断，玩家卡在引导里；
 *   - 同一个奖励被重复弹出两次（例如网络重发、重复触发事件）。
 * 所以所有弹窗都必须先交给管理器排队，由管理器决定「弹不弹、什么时候弹、弹哪个」。
 *
 * ============================================================
 * 二、核心能力
 * ============================================================
 *   1. 优先级队列：同一时刻只显示一个弹窗；priority 大的先弹，相同优先级先来先弹。
 *      同一段同步代码里的 open 会先合并再挑选（微任务调度），保证不会因为调用顺序先弹出低优先级的。
 *   2. 抢占：配置了 preempt 的高优先级弹窗可以把正在显示的弹窗「收起」，
 *      被收起的弹窗回到队列，之后自动恢复显示。
 *   3. 新手模式：每种弹窗声明自己在新手引导期间的策略：
 *        allow 可以弹 / defer 等引导结束再弹 / drop 直接丢弃 / 函数 按引导步骤判断。
 *      引导开始时，正在显示的不允许弹出的弹窗会被收起（或丢弃）。
 *      引导结束时，对「被引导拦下」的弹窗调用 afterTutorial 再判断一次是否还需要弹出
 *      （例如引导期间获得的新手奖励，引导里已经展示过了，结束后就不用再弹）。
 *   4. 弹出条件：每种弹窗可以配置任意多个条件（等级、是否在战斗中……），
 *      每个条件返回 show 可以弹 / wait 暂不弹、继续排队 / drop 丢弃。
 *      被 wait 卡住的弹窗不会阻塞后面的弹窗。
 *   5. 去重：同类型 + 同数据的弹窗（排队中或显示中）不会被重复打开。
 *      数据比较与对象的 key 顺序无关；也可以按类型去重，或自定义去重 key。
 *   6. 异步创建：view.show 可以返回 Promise（加载预制体、图集……），加载期间被关闭 / 抢占 / 引导收起时
 *      通过 AbortSignal 通知 UI 不要再显示；加载失败或超时丢弃该弹窗，队列不会卡死。
 *   7. 其他：排队超时 ttl、暂停/恢复（加载、战斗中）、关闭全部、异常隔离、
 *      open 返回 Promise 可以等待弹窗关闭并拿到结果。
 *
 * ============================================================
 * 三、一个弹窗的生命周期
 * ============================================================
 *   open ──> 去重检查 ──(重复)──> 返回 { ok: false, reason: 'duplicate' }
 *              │
 *              ▼
 *           按优先级插入队列 ──> schedule ──> pump（挑选下一个弹窗）
 *                                              │
 *            ┌──────── 超时 ─────── expired ◄──┤
 *            │                                 ▼
 *            │     新手策略 + 弹出条件：show / wait（留在队列）/ drop
 *            │                                 │ show
 *            │                                 ▼
 *            │                     view.show ──(返回 Promise)──> 加载中 ──(失败/超时)──> dropped
 *            │                                 │                    │ 完成
 *            ▼                                 ▼                    ▼
 *        closed Promise ◄── close ◄────── 显示中 ──(被抢占/引导开始)──> 回到队列
 *                         （加载中被关闭 / 抢占 / 引导收起：abort 加载，其余同上）
 *
 * 文件组织：
 *   Popup.ts        本文件，弹窗系统核心实现（只有类，没有副作用）
 *   PopupDecorators.ts 装饰器：@PopupWindow 把 UI 类注册为弹窗，@Condition / @AfterTutorial 声明规则
 *   PopupManager.ts 全局单例 + 弹窗数据类型表 + 优先级常量 + 绑定到单例的装饰器
 *   demo.ts         演示（手动 register）
 *   decoratorDemo.ts 演示（装饰器注册）
 *
 * 运行：npx tsc && node dist/AIFramework/Popup/demo.js
 */

// ------------------------------------------------------------
// 1. 类型定义
// ------------------------------------------------------------

/**
 * 判断结果：
 *   show 可以弹出；
 *   wait 暂时不弹，留在队列里，等条件满足后再弹（不阻塞后面的弹窗）；
 *   drop 不再需要弹出，直接从队列中移除。
 */
export type GuardResult = 'show' | 'wait' | 'drop'

/** 弹出条件。返回 boolean 时：true 等同于 show，false 等同于 wait */
export type PopupCondition<D> = (data: D) => GuardResult | boolean

/**
 * 新手引导期间的策略：
 *   allow 引导期间也可以弹（例如引导自身的弹窗、强制公告）；
 *   defer 等引导结束后再弹（默认，最安全：不打断引导，也不会丢失）；
 *   drop  引导期间触发的直接丢弃（例如时效性强、过后没有意义的提示）；
 *   函数  根据当前引导步骤判断，例如引导第 3 步之后才允许弹出奖励。
 */
export type TutorialPolicy =
    | 'allow'
    | 'defer'
    | 'drop'
    | ((step: number) => GuardResult | boolean)

/**
 * 去重方式：
 *   data 同类型 + 同数据视为重复（默认）。同一个奖励不会弹两次，不同奖励可以分别弹；
 *   type 同类型只允许存在一个，不管数据（例如「公告」只需要弹一次）；
 *   none 不去重。
 */
export type UniqueMode = 'data' | 'type' | 'none'

/**
 * 发现重复时的处理：
 *   ignore  保留旧的，忽略新的（默认）；
 *   replace 旧的还在排队时用新的替换（例如活动数据更新了，只弹最新的）；
 *           旧的已经在显示中则仍然忽略新的，不会打断玩家正在看的弹窗。
 */
export type DuplicateStrategy = 'ignore' | 'replace'

/** 某一种弹窗的配置，通过 register 注册，同类型的所有弹窗共用 */
export interface PopupConfig<D> {
    /** 优先级，越大越先弹 */
    priority: number
    /** 新手引导期间的策略，默认 defer */
    tutorial?: TutorialPolicy
    /** 弹出条件，按顺序检查，第一个不是 show 的结果生效 */
    conditions?: PopupCondition<D>[]
    /** 去重方式，默认 data */
    unique?: UniqueMode
    /** 发现重复时的处理，默认 ignore */
    onDuplicate?: DuplicateStrategy
    /**
     * 自定义去重 key。默认对 data 做「与 key 顺序无关」的序列化。
     * 数据里有 Map/Set/类实例、或者只想按部分字段（如 id）去重时使用。
     */
    dataKey?: (data: D) => string
    /** 是否可以抢占正在显示的、优先级更低的弹窗 */
    preempt?: boolean
    /** 排队超时（毫秒）：入队后超过这个时间还没弹出就丢弃。已经显示过的弹窗不受影响 */
    ttl?: number
    /**
     * 新手引导结束时，判断被引导拦下的弹窗是否还可以弹出：返回 true 继续排队，false 丢弃（dropped）。
     * 只对「引导期间因为新手策略没能弹出」或「被引导收起」的弹窗调用一次，
     * 引导开始前就已经弹完的、或引导期间被 allow 正常弹出的弹窗不受影响。
     * 不配置时默认全部保留。
     * @param data   弹窗数据
     * @param waited 已经排队的时长（毫秒），可以用来丢弃等待太久、已经过时的弹窗
     */
    afterTutorial?: (data: D, waited: number) => boolean
}

/** 暴露给外部（UI、业务代码）的弹窗信息，只读 */
export interface PopupInfo<K = string, D = unknown> {
    readonly id: number
    readonly type: K
    readonly data: D
    readonly priority: number
}

/**
 * 所有弹窗类型的 PopupInfo 联合类型。
 * UI 中 switch (popup.type) 后，popup.data 会被自动收窄为对应类型。
 */
export type AnyPopupInfo<M> = { [K in keyof M]: PopupInfo<K, M[K]> }[keyof M]

/**
 * 视图适配器：管理器不关心弹窗怎么渲染，只通过它通知 UI 层。
 *   show：显示弹窗。被抢占后恢复时会再次调用，UI 需要支持同一个弹窗多次 show。
 *   hide：弹窗离开屏幕（关闭、被抢占、引导开始被收起），UI 需要保证可以重复调用。
 * 用户点击关闭按钮时，UI 应调用 manager.close(id, result)，而不是自己销毁弹窗。
 */
export interface PopupView<M> {
    /**
     * 显示弹窗。需要异步创建（加载预制体、图集……）时返回 Promise，完成时弹窗才算真正显示：
     *   - 加载期间弹窗处于「加载中」，管理器仍把它当作当前弹窗（后面的弹窗继续排队）；
     *   - 加载期间被关闭 / 抢占 / 引导收起时 signal 会被 abort，UI 收到后不能再把它显示出来；
     *   - Promise reject 或超过 showTimeout 视为显示失败：丢弃该弹窗（dropped），继续弹下一个。
     * 被抢占后恢复时会再次调用：资源应按弹窗 id 缓存，不要重复加载、重复创建实例。
     */
    show(popup: AnyPopupInfo<M>, signal: AbortSignal): void | Promise<void>
    hide(popup: AnyPopupInfo<M>): void
    /**
     * 可选：显示过的弹窗彻底结束时调用（在 hide 之后），之后不会再 show。
     * hide 只代表离开屏幕（可能是被抢占、之后还会恢复），需要释放 UI 实例时应在这里处理。
     */
    dispose?(popup: AnyPopupInfo<M>): void
}

/**
 * 弹窗结束的原因：
 *   closed    显示后被关闭（正常流程）；
 *   cancelled 还在排队时被 close 取消；
 *   dropped   被新手策略/弹出条件丢弃，或者 view.show 出错 / 异步加载失败 / 超时；
 *   expired   排队超时；
 *   replaced  被同类型的新弹窗替换（onDuplicate: 'replace'）。
 */
export type CloseReason = 'closed' | 'cancelled' | 'dropped' | 'expired' | 'replaced'

export interface CloseResult {
    reason: CloseReason
    /** close(id, result) 传入的结果，例如玩家在确认框里点了「确定」还是「取消」 */
    result?: unknown
}

/** open 的返回值：要么成功入队，要么因为重复被拒绝 */
export type OpenResult =
    | { ok: true; id: number; closed: Promise<CloseResult> }
    | { ok: false; reason: 'duplicate'; existingId: number }

/** 调度器：决定什么时候挑选下一个弹窗。默认微任务 */
export type Scheduler = (task: () => void) => void

export interface PopupSystemOptions {
    /** view.show 返回的 Promise 最长等待时间（毫秒），超时视为显示失败。默认 10 秒 */
    showTimeout?: number
}

/** 内部记录，比 PopupInfo 多了排队和去重需要的信息 */
interface PopupRecord {
    readonly info: PopupInfo<PropertyKey, unknown>
    readonly config: PopupConfig<any>
    /** 去重 key，不去重时为 null */
    readonly dedupKey: string | null
    /** 入队序号：相同优先级时按它保证先来先弹；被抢占回到队列时保留原序号 */
    readonly seq: number
    /** 入队时间，用于 ttl 判断 */
    readonly enqueuedAt: number
    /** 是否已经显示过：显示过的弹窗被抢占回到队列后不再受 ttl 影响 */
    shown: boolean
    /** 是否被新手引导拦下过（未能弹出或被收起），引导结束时据此调用 afterTutorial */
    blockedByTutorial: boolean
    /** 异步显示中（view.show 返回的 Promise 还没完成）时，用于取消本次显示 */
    loading: AbortController | null
    /** 让 open 返回的 closed Promise 完成 */
    readonly resolve: (result: CloseResult) => void
}

// ------------------------------------------------------------
// 2. 工具函数
// ------------------------------------------------------------

/**
 * 与 key 顺序无关的序列化：{ a: 1, b: 2 } 和 { b: 2, a: 1 } 得到相同的字符串。
 * 用于默认的「同数据去重」。JSON.stringify 会按对象的 key 插入顺序输出，不能直接用。
 * 值为 undefined 的 key 会被忽略（与 JSON 一致），所以 { a: undefined } 与 {} 视为相同。
 * 不支持循环引用、Map/Set 等结构，这类数据请配置 dataKey。
 */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        // undefined、函数、symbol 时 JSON.stringify 返回 undefined，用 String 兜底
        return JSON.stringify(value) ?? String(value)
    }
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']'
    }
    if (value instanceof Date) {
        return `Date(${value.getTime()})`
    }
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
        .filter(k => obj[k] !== undefined)
        .sort()
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

/** 把条件函数的 boolean 返回值统一转换成 GuardResult */
function normalize(result: GuardResult | boolean): GuardResult {
    if (result === true) return 'show'
    if (result === false) return 'wait'
    return result
}

/** 队列排序规则：a 是否应该排在 b 前面。优先级高的在前；相同优先级时序号小（先来）的在前 */
function before(a: PopupRecord, b: PopupRecord): boolean {
    return a.info.priority > b.info.priority || (a.info.priority === b.info.priority && a.seq < b.seq)
}

// ------------------------------------------------------------
// 3. 弹窗系统
// ------------------------------------------------------------

/**
 * @typeParam M 弹窗类型表：key 是弹窗类型，value 是该类型弹窗的数据类型，例如
 *   { Reward: { itemId: number }; Notice: { title: string } }
 *   这样 open('Reward', data) 时，data 的类型会被自动检查。
 */
export class PopupSystem<M extends object> {
    /** 已注册的弹窗配置：类型 -> 配置 */
    private readonly configs = new Map<keyof M, PopupConfig<any>>()

    /**
     * 等待显示的弹窗，始终保持有序（排在前面的先弹）。
     * 用有序数组 + 二分插入而不是堆：弹窗队列通常只有几个到几十个元素，
     * 而我们经常需要「按顺序遍历、跳过 wait 的」和「从中间删除」，有序数组都更简单直接。
     */
    private readonly queue: PopupRecord[] = []

    /** id -> 记录，包含排队中和显示中的弹窗，用于 close(id) 快速查找 */
    private readonly records = new Map<number, PopupRecord>()

    /** 去重 key -> 记录，包含排队中和显示中的弹窗 */
    private readonly dedup = new Map<string, PopupRecord>()

    /** 当前正在显示的弹窗，同一时刻最多一个 */
    private current: PopupRecord | null = null

    private view: PopupView<M> | null = null
    private tutorialActive = false
    private tutorialStep = 0
    private paused = false
    /** 是否已经调度过 pump，保证同一批操作只挑选一次 */
    private scheduled = false
    private nextId = 1
    private nextSeq = 0
    private readonly showTimeout: number
    private readonly loadingListeners = new Set<(popup: AnyPopupInfo<M> | null) => void>()

    /**
     * @param scheduler 挑选弹窗的时机。默认微任务：同一段同步代码里的所有 open 先全部入队，
     *                  再统一按优先级挑选，避免先 open 的低优先级弹窗抢先弹出。
     * @param now       时间来源，默认 Date.now；单元测试可以传入假时钟来测试 ttl。
     */
    constructor(
        private readonly scheduler: Scheduler = queueMicrotask,
        private readonly now: () => number = Date.now,
        options: PopupSystemOptions = {}
    ) {
        this.showTimeout = options.showTimeout ?? 10_000
    }

    // ---------------- 配置 ----------------

    /** 设置视图适配器。在设置之前，弹窗只会排队，不会显示 */
    setView(view: PopupView<M> | null): void {
        this.view = view
        this.schedule()
    }

    /** 注册一种弹窗的配置。同类型重复注册会覆盖旧配置（只影响之后 open 的弹窗） */
    register<K extends keyof M>(type: K, config: PopupConfig<M[K]>): this {
        this.configs.set(type, config)
        return this
    }

    // ---------------- 打开 / 关闭 ----------------

    /**
     * 请求打开一个弹窗。弹窗不会立刻显示，而是进入队列，由管理器决定何时显示。
     * @returns 成功入队时返回 id 和 closed Promise（弹窗结束时完成，可以拿到结束原因和结果）；
     *          重复时返回 { ok: false }，并给出已存在的弹窗 id。
     */
    open<K extends keyof M>(type: K, data: M[K]): OpenResult {
        const config = this.configs.get(type)
        if (!config) {
            // 未注册属于开发期的编码错误，直接抛出，尽早暴露
            throw new Error(`[Popup] 未注册的弹窗类型：${String(type)}`)
        }

        const dedupKey = this.makeDedupKey(type, data, config)
        if (dedupKey !== null) {
            const existing = this.dedup.get(dedupKey)
            if (existing) {
                // 只替换还在排队、且从未显示过的；显示中（含被抢占收起的）不打断
                const replaceable =
                    config.onDuplicate === 'replace' && existing !== this.current && !existing.shown
                if (!replaceable) {
                    return { ok: false, reason: 'duplicate', existingId: existing.info.id }
                }
                this.removeFromQueue(existing)
                this.finish(existing, { reason: 'replaced' })
            }
        }

        // 先创建 Promise 拿到 resolve，再创建记录
        let resolve!: (result: CloseResult) => void
        const closed = new Promise<CloseResult>(r => (resolve = r))
        const record: PopupRecord = {
            info: { id: this.nextId++, type, data, priority: config.priority },
            config,
            dedupKey,
            seq: this.nextSeq++,
            enqueuedAt: this.now(),
            shown: false,
            blockedByTutorial: false,
            loading: null,
            resolve,
        }

        // 引导期间打开、且新手策略不允许弹出的，标记为被引导拦下
        if (this.tutorialActive) this.markIfBlockedByTutorial(record)
        this.insert(record)
        this.records.set(record.info.id, record)
        if (dedupKey !== null) this.dedup.set(dedupKey, record)
        this.schedule()
        return { ok: true, id: record.info.id, closed }
    }

    /**
     * 关闭弹窗。
     *   - 显示中的：调用 view.hide，结束原因为 closed，然后自动弹出下一个；
     *   - 排队中的：直接从队列移除，结束原因为 cancelled。
     * @param result 透传给 closed Promise 的结果
     * @returns 弹窗是否存在
     */
    close(id: number, result?: unknown): boolean {
        const record = this.records.get(id)
        if (!record) return false

        if (record === this.current) {
            this.current = null
            this.safeHide(record)
            this.finish(record, { reason: 'closed', result })
        } else {
            this.removeFromQueue(record)
            this.finish(record, { reason: 'cancelled' })
        }
        this.schedule()
        return true
    }

    /** 关闭全部弹窗（例如切换账号、返回登录界面） */
    closeAll(): void {
        // 拷贝一份再遍历：finish 不会修改 queue，但这样写更不容易出错
        for (const record of this.queue.splice(0)) {
            this.finish(record, { reason: 'cancelled' })
        }
        if (this.current) this.close(this.current.info.id)
    }

    // ---------------- 状态控制 ----------------

    /**
     * 设置新手引导状态。引导开始时，正在显示的、不允许在引导期间弹出的弹窗会被收起；
     * 引导结束时，先对被引导拦下的弹窗执行 afterTutorial 检查，再按优先级依次弹出留下来的；
     * 步骤推进时，按步骤判断的弹窗会重新检查。
     */
    setTutorial(active: boolean, step = 0): void {
        // 只在「进行中 -> 结束」的那一刻检查一次；重复调用 setTutorial(false) 不会再检查
        const ending = this.tutorialActive && !active
        this.tutorialActive = active
        this.tutorialStep = step
        if (ending) {
            this.checkAfterTutorial()
        } else if (active) {
            // 引导开始或步骤变化：引导前就在排队的弹窗，也可能从此被引导拦下
            this.queue.forEach(record => this.markIfBlockedByTutorial(record))
        }
        this.schedule()
    }

    /** 暂停弹出（加载中、战斗中、过场动画……）。已经显示的弹窗不受影响，新的弹窗只排队 */
    pause(): void {
        this.paused = true
    }

    resume(): void {
        this.paused = false
        this.schedule()
    }

    /**
     * 外部状态变化后，通知管理器重新检查弹出条件。
     * 管理器无法知道「玩家升级了」「离开了战斗」这类外部变化，
     * 在条件依赖的状态变化时调用它，被 wait 卡住的弹窗才有机会弹出。
     */
    refresh(): void {
        this.schedule()
    }

    // ---------------- 查询 ----------------

    /** 当前正在显示的弹窗 */
    get currentPopup(): AnyPopupInfo<M> | null {
        return (this.current?.info as AnyPopupInfo<M> | undefined) ?? null
    }

    /** 排队中的弹窗（按弹出顺序），用于调试面板 */
    get queuedPopups(): AnyPopupInfo<M>[] {
        return this.queue.map(r => r.info as AnyPopupInfo<M>)
    }

    /** 弹窗是否还存在（排队中或显示中） */
    has(id: number): boolean {
        return this.records.has(id)
    }

    /** 正在异步加载（view.show 的 Promise 还没完成）的当前弹窗，没有时为 null */
    get loadingPopup(): AnyPopupInfo<M> | null {
        const current = this.current
        return current?.loading ? (current.info as AnyPopupInfo<M>) : null
    }

    /**
     * 订阅加载状态：开始加载时回调弹窗信息，加载结束（完成 / 失败 / 被取消）时回调 null。
     * 用于显示加载遮罩：加载期间挡住点击，避免玩家点穿到下层界面。
     * @returns 取消订阅
     */
    onLoadingChange(listener: (popup: AnyPopupInfo<M> | null) => void): () => void {
        this.loadingListeners.add(listener)
        return () => this.loadingListeners.delete(listener)
    }

    // ---------------- 内部实现：挑选与显示 ----------------

    private schedule(): void {
        if (this.scheduled) return
        this.scheduled = true
        this.scheduler(() => this.pump())
    }

    /**
     * 挑选下一个要显示的弹窗。
     * 由 schedule 统一触发：open/close/状态变化都只是 schedule，真正的挑选只在这里发生，
     * 避免在 view 的回调里重入（例如 UI 在 show 里同步调用 close）。
     */
    private pump(): void {
        this.scheduled = false
        if (!this.view) return

        // 引导开始时，检查正在显示的弹窗是否还允许显示
        if (this.current && this.tutorialActive) {
            const verdict = this.checkTutorial(this.current)
            if (verdict !== 'show') {
                const record = this.current
                this.current = null
                this.safeHide(record)
                if (verdict === 'drop') {
                    this.finish(record, { reason: 'dropped' })
                } else {
                    record.blockedByTutorial = true
                    this.insert(record) // 收起，回到队列等引导结束
                }
            }
        }

        // 暂停中只做上面的收起检查，不弹出新的
        if (this.paused) return

        const now = this.now()
        for (let i = 0; i < this.queue.length; ) {
            const record = this.queue[i]!

            // 1. 排队超时：已经显示过的（被抢占收起的）不受影响
            if (!record.shown && record.config.ttl !== undefined && now - record.enqueuedAt > record.config.ttl) {
                this.queue.splice(i, 1)
                this.finish(record, { reason: 'expired' })
                continue // 删除后 i 不变，下一个元素已经移到了 i
            }

            // 2. 有弹窗正在显示时，只有「可抢占且优先级更高」的才有资格
            if (this.current) {
                // 队列有序：后面的优先级只会更低或相等，直接结束
                if (record.info.priority <= this.current.info.priority) break
                if (!record.config.preempt) {
                    i++
                    continue
                }
            }

            // 3. 新手策略 + 弹出条件
            const verdict = this.evaluate(record)
            if (verdict === 'wait') {
                i++ // 留在队列，不阻塞后面的弹窗
                continue
            }
            this.queue.splice(i, 1)
            if (verdict === 'drop') {
                this.finish(record, { reason: 'dropped' })
                continue
            }

            // 4. 显示。一次 pump 最多显示一个弹窗
            this.display(record)
            return
        }
    }

    /** 显示弹窗；如果有正在显示的弹窗（抢占），先把它收起放回队列 */
    private display(record: PopupRecord): void {
        if (this.current) {
            const suspended = this.current
            this.safeHide(suspended)
            // 保留原 seq 重新插入：恢复时仍排在同优先级后来者的前面
            this.insert(suspended)
        }

        this.current = record
        record.shown = true
        const controller = new AbortController()
        let pending: void | Promise<void>
        try {
            pending = this.view!.show(record.info as AnyPopupInfo<M>, controller.signal)
        } catch (e) {
            this.failShow(record, e)
            return
        }
        if (!pending || typeof pending.then !== 'function') return

        // 异步显示：等待期间仍是当前弹窗；每次 show 有自己的 controller，
        // 被 hide 取消（abort）后，旧的 Promise 不管成功还是失败都不再处理
        record.loading = controller
        this.emitLoading(record)
        const timer = setTimeout(() => {
            if (controller.signal.aborted) return
            controller.abort()
            this.failShow(record, new Error(`显示超时（${this.showTimeout}ms）`))
        }, this.showTimeout)
        pending.then(
            () => {
                clearTimeout(timer)
                if (!controller.signal.aborted) this.endLoading(record)
            },
            e => {
                clearTimeout(timer)
                if (controller.signal.aborted) return
                controller.abort()
                this.failShow(record, e)
            }
        )
    }

    /** 显示失败（同步抛错 / 异步 reject / 超时）：丢弃这个弹窗，继续弹下一个，不能让整个队列卡死 */
    private failShow(record: PopupRecord, error: unknown): void {
        console.error(`[Popup] 显示弹窗出错：${String(record.info.type)}`, error)
        this.endLoading(record)
        if (this.current === record) this.current = null
        this.finish(record, { reason: 'dropped' })
        this.schedule()
    }

    private emitLoading(record: PopupRecord | null): void {
        const info = (record?.info as AnyPopupInfo<M> | undefined) ?? null
        for (const listener of [...this.loadingListeners]) {
            try {
                listener(info)
            } catch (e) {
                console.error('[Popup] 加载状态回调出错', e)
            }
        }
    }

    /** 结束加载状态（不 abort，由调用方决定） */
    private endLoading(record: PopupRecord): void {
        if (!record.loading) return
        record.loading = null
        this.emitLoading(null)
    }

    /** 取消进行中的异步显示：通知 UI 不要再显示 */
    private cancelLoading(record: PopupRecord): void {
        const controller = record.loading
        if (!controller) return
        this.endLoading(record)
        controller.abort()
    }

    /** 依次检查新手策略和弹出条件，第一个不是 show 的结果生效 */
    private evaluate(record: PopupRecord): GuardResult {
        try {
            if (this.tutorialActive) {
                const verdict = this.checkTutorial(record)
                if (verdict !== 'show') return verdict
            }
            for (const condition of record.config.conditions ?? []) {
                const verdict = normalize(condition(record.info.data))
                if (verdict !== 'show') return verdict
            }
            return 'show'
        } catch (e) {
            // 条件函数出错时保守处理：暂不弹出，等下次检查，而不是丢弃或误弹
            console.error(`[Popup] 弹出条件出错：${String(record.info.type)}`, e)
            return 'wait'
        }
    }

    /** 根据弹窗配置的新手策略，判断引导期间能否显示 */
    private checkTutorial(record: PopupRecord): GuardResult {
        const policy = record.config.tutorial ?? 'defer'
        switch (policy) {
            case 'allow':
                return 'show'
            case 'defer':
                return 'wait'
            case 'drop':
                return 'drop'
            default:
                return normalize(policy(this.tutorialStep))
        }
    }

    /**
     * 新手策略为 wait（延后）时，标记该弹窗被引导拦下。
     * 不在 evaluate 中标记：有弹窗正在显示时，低优先级的弹窗根本不会被 evaluate，会漏标。
     * drop 的弹窗会在 pump 中直接移除，不需要标记。
     */
    private markIfBlockedByTutorial(record: PopupRecord): void {
        let verdict: GuardResult
        try {
            verdict = this.checkTutorial(record)
        } catch {
            verdict = 'wait' // 与 evaluate 一致：出错视为暂不弹出
        }
        if (verdict === 'wait') record.blockedByTutorial = true
    }

    /**
     * 引导结束时调用：对被引导拦下的弹窗执行 afterTutorial，返回 false 的直接丢弃。
     * 在 setTutorial 中同步执行（而不是等到 pump），这样被丢弃的弹窗不会有机会先弹出来，
     * 它们的 closed Promise 也能尽早完成。
     */
    private checkAfterTutorial(): void {
        const now = this.now()
        // 拷贝一份再遍历：遍历过程中会从 queue 里删除元素
        for (const record of [...this.queue]) {
            if (!record.blockedByTutorial) continue
            // 清除标记：之后再次开始引导时重新统计
            record.blockedByTutorial = false

            const check = record.config.afterTutorial
            if (!check) continue

            let keep = true
            try {
                keep = check(record.info.data, now - record.enqueuedAt)
            } catch (e) {
                // 出错时保守处理：保留弹窗，交给后续的弹出条件继续判断
                console.error(`[Popup] 引导结束检查出错：${String(record.info.type)}`, e)
            }
            if (!keep) {
                this.removeFromQueue(record)
                this.finish(record, { reason: 'dropped' })
            }
        }
    }

    // ---------------- 内部实现：队列与记录 ----------------

    /** 二分查找插入位置，保持队列有序，O(log n) 查找 + O(n) 移动 */
    private insert(record: PopupRecord): void {
        let lo = 0
        let hi = this.queue.length
        while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (before(this.queue[mid]!, record)) lo = mid + 1
            else hi = mid
        }
        this.queue.splice(lo, 0, record)
    }

    private removeFromQueue(record: PopupRecord): void {
        const index = this.queue.indexOf(record)
        if (index !== -1) this.queue.splice(index, 1)
    }

    /** 弹窗彻底结束：清理索引，并完成 closed Promise */
    private finish(record: PopupRecord, result: CloseResult): void {
        this.cancelLoading(record)
        this.records.delete(record.info.id)
        // 只删除指向自己的 key：被 replace 时，新记录可能已经占用了同一个 key
        if (record.dedupKey !== null && this.dedup.get(record.dedupKey) === record) {
            this.dedup.delete(record.dedupKey)
        }
        // 只有显示过的弹窗才有 UI 实例需要释放
        if (record.shown) {
            try {
                this.view?.dispose?.(record.info as AnyPopupInfo<M>)
            } catch (e) {
                console.error(`[Popup] 释放弹窗出错：${String(record.info.type)}`, e)
            }
        }
        record.resolve(result)
    }

    /** 调用 view.hide，并隔离 UI 异常，保证管理器自身状态始终正确。加载中的先取消加载 */
    private safeHide(record: PopupRecord): void {
        this.cancelLoading(record)
        try {
            this.view?.hide(record.info as AnyPopupInfo<M>)
        } catch (e) {
            console.error(`[Popup] 隐藏弹窗出错：${String(record.info.type)}`, e)
        }
    }

    /** 根据去重方式生成去重 key；不去重时返回 null */
    private makeDedupKey<K extends keyof M>(type: K, data: M[K], config: PopupConfig<M[K]>): string | null {
        switch (config.unique ?? 'data') {
            case 'none':
                return null
            case 'type':
                return `type:${String(type)}`
            case 'data': {
                const key = config.dataKey ? config.dataKey(data) : stableStringify(data)
                return `data:${String(type)}:${key}`
            }
        }
    }
}
