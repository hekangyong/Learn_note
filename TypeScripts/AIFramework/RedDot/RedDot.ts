/**
 * 红点系统（Red Dot / Badge System）—— 面向「子红点高频更新」场景的性能优化版
 *
 * ============================================================
 * 一、红点是一棵树
 * ============================================================
 *   Main
 *   ├── Mail
 *   │   ├── System      (叶子：系统邮件未读数)
 *   │   └── Friend      (叶子：好友邮件未读数)
 *   └── Bag
 *       └── Item/1001   (叶子：某个道具是否是新的)
 *
 * 每个节点用「路径」唯一标识，如 'Main/Mail/System'。
 * 父节点的数值 = 自身数值 + 所有子节点数值之和。
 * UI 只关心「我绑定的那个节点的数值变了没有」，变了就刷新显示。
 *
 * ============================================================
 * 二、朴素实现的问题
 * ============================================================
 * 每次叶子变化都：
 *   a) 从根开始按路径逐层查找节点；
 *   b) 对每个祖先「重新遍历整棵子树求和」；
 *   c) 立刻通知所有相关 UI 刷新。
 * 如果一帧内同一个叶子被改 1000 次（例如批量领取邮件、背包刷新），
 * 就会触发 1000 次遍历 + 1000 次 UI 刷新，而用户最终只看得到最后一次的结果。
 *
 * ============================================================
 * 三、本实现的优化点
 * ============================================================
 *   1. 路径缓存：路径 -> 节点 用 Map 缓存，更新时 O(1) 定位，不再每次 split 路径、逐层查找。
 *   2. 增量更新：父节点不重新求和，只沿父链加上差值 delta，代价 O(深度)，与兄弟节点数量无关。
 *   3. 写合并：set/add 只把「节点的最新值」记到 pending 里，同一节点多次修改只保留最后一次，
 *      真正的向上传播推迟到 flush 时只做一次。
 *   4. 批量通知：默认在微任务里 flush（可换成 requestAnimationFrame 等帧调度），
 *      一批更新结束后每个节点最多通知一次。
 *   5. 只比较最终结果：节点数值与「上次通知的值」相同时不通知
 *      （例如 +1 再 -1、或兄弟节点一增一减，父节点都不会刷新 UI）。
 *   6. 只追踪有监听者的节点：没人监听的节点只更新数字，不进入待通知集合。
 *
 * ============================================================
 * 四、数据流（一次更新的完整生命周期）
 * ============================================================
 *   set/add ──> pending（只记最新值） ──> schedule（每批只调度一次）
 *                                              │
 *                                              ▼
 *   flush：pending 逐个算 delta ──> propagate 沿父链累加 ──> 有监听者的节点进入 dirty
 *                                              │
 *                                              ▼
 *          遍历 dirty：count !== notified 才回调监听者
 *
 * 文件组织：
 *   RedDot.ts        本文件，红点系统核心实现（只有类，没有副作用）
 *   RedDotManager.ts 全局单例 + 路径常量，业务代码和 UI 只从这里引用
 *   demo.ts          演示与性能对比
 *
 * 运行：npx tsc && node dist/Framework/RedDot/demo.js
 */

// ------------------------------------------------------------
// 1. 类型定义
// ------------------------------------------------------------

/**
 * 监听者回调：节点汇总值变化时调用。
 * @param count 节点最新的汇总值（自身 + 子树）
 * @param path  节点路径，同一个回调绑定多个节点时可用来区分
 */
export type RedDotListener = (count: number, path: string) => void

/**
 * 调度器：决定「什么时候」执行 flush。
 * 系统只负责告诉调度器「有更新了，请在合适的时机调用 flush」，
 * 具体是微任务、下一帧、还是定时器，由使用者决定。
 */
export type Scheduler = (flush: () => void) => void

/** 路径分隔符：'Main/Mail/System' */
export const SEPARATOR = '/'

// ------------------------------------------------------------
// 2. 树节点
// ------------------------------------------------------------

/**
 * 红点树中的一个节点。
 * 只作为数据容器，所有逻辑都放在 RedDotSystem 中，避免节点之间互相调用导致逻辑分散。
 */
class RedDotNode {
    /** 子节点：key 是路径中的一段（如 'Mail'），用 Map 保证 O(1) 查找 */
    readonly children = new Map<string, RedDotNode>()

    /**
     * 节点「自身」的值，即使用者通过 set/add 直接设置的值。
     * 通常只有叶子会设置；中间节点也允许设置（例如某个页签自己也有一个提醒）。
     */
    selfCount = 0

    /**
     * 节点的「汇总值」= selfCount + 所有子节点的 count 之和。
     * 它不是每次重新计算出来的，而是在 propagate 中通过差值增量维护的。
     */
    count = 0

    /**
     * 上一次通知给监听者时的 count。
     * flush 时拿 count 和它比较：相等说明对 UI 来说没有变化，可以跳过通知。
     * 这样「先 +1 再 -1」这类中间状态不会引起任何 UI 刷新。
     */
    notified = 0

    /**
     * 监听者集合。懒创建：一棵红点树里通常只有少数节点绑定了 UI，
     * 为每个节点都创建 Set 会浪费内存；同时 null 也被用作「是否需要通知」的快速判断。
     */
    listeners: Set<RedDotListener> | null = null

    constructor(
        /** 路径中的最后一段，如 'System'，用于从父节点的 children 中删除自己 */
        readonly key: string,
        /** 完整路径，如 'Main/Mail/System'，用于 nodes 缓存和回调参数 */
        readonly path: string,
        /** 父节点。根节点为 null；其他节点的父节点至少是根节点 */
        readonly parent: RedDotNode | null
    ) {}
}

// ------------------------------------------------------------
// 3. 红点系统
// ------------------------------------------------------------

export class RedDotSystem {
    /**
     * 虚拟根节点：不对外暴露、不能被监听，只是为了让 'Main'、'Activity' 等
     * 多个顶层节点有一个共同的父节点，统一树的处理逻辑。
     */
    private readonly root = new RedDotNode('', '', null)

    /**
     * 路径 -> 节点 的扁平缓存（不包含 root）。
     * 高频更新时绝大多数路径都已经存在，命中缓存就是一次 Map 查找，
     * 省去了 split 字符串和逐层查找 children 的开销。
     */
    private readonly nodes = new Map<string, RedDotNode>()

    /**
     * 待提交的修改：节点 -> 节点自身的最新值（selfCount）。
     * 同一个节点在一批内被修改多少次，这里都只有一条记录（写合并），
     * 最终只会做一次 O(深度) 的向上传播。
     * 不用 readonly：flush 时会整体换成新的 Map（见 flush 中的说明）。
     */
    private pending = new Map<RedDotNode, number>()

    /**
     * 本批次中「汇总值可能变化、且有监听者」的节点。
     * 用 Set 去重：同一个祖先被多个叶子的变化经过，也只记录一次，只检查一次。
     */
    private dirty = new Set<RedDotNode>()

    /**
     * 是否已经向调度器申请过 flush。
     * 保证一批更新只调度一次：1000 次 set 只会产生 1 个微任务，而不是 1000 个。
     */
    private scheduled = false

    /**
     * @param scheduler 决定何时 flush。
     *   - 默认 queueMicrotask：同一段同步代码里的所有更新合并成一批，在当前任务结束后统一提交。
     *     对使用者几乎透明（await 一下就能拿到结果），适合大多数 UI 场景。
     *   - 游戏/动画场景可传入 cb => requestAnimationFrame(() => cb())，
     *     把一整帧内的所有更新合并成一批，每帧最多刷新一次 UI。
     *   - 传入空函数 () => {} 则完全手动控制，由使用者自己调用 flush()（见下方 benchmark）。
     */
    constructor(private readonly scheduler: Scheduler = queueMicrotask) {}

    // ---------------- 写入 ----------------

    /**
     * 设置节点自身的值（一般用于叶子）。
     * 注意：这里不会立刻修改 count、也不会通知 UI，只是把最新值记到 pending 里，
     * 等 flush 时再统一处理。
     */
    set(path: string, value: number): void {
        const node = this.getOrCreate(path)

        // 与「当前最新值」比较：如果本批次已经有待提交的值，以它为准；否则以已提交的值为准。
        // 值没变就直接返回，连调度都不需要。
        const latest = this.pending.get(node) ?? node.selfCount
        if (latest === value) return

        // Map.set 对已存在的 key 是覆盖：同一节点多次修改，只保留最后一次（写合并的关键）
        this.pending.set(node, value)
        this.schedule()
    }

    /**
     * 在节点自身的值上增加 delta（可以为负数）。
     * 基准值必须是「尚未提交的最新值」而不是 selfCount：
     * 否则同一批里连续 add(1)、add(1)，两次读到的 selfCount 都是旧值，结果会少加一次。
     */
    add(path: string, delta: number): void {
        const node = this.getOrCreate(path)
        this.set(path, (this.pending.get(node) ?? node.selfCount) + delta)
    }

    /**
     * 删除节点及其整棵子树（例如道具被用掉、邮件被删除），祖先的数值会相应减少。
     * 删除后再 set 同一路径，会重新创建一个全新的节点。
     */
    remove(path: string): void {
        const node = this.nodes.get(path)
        if (!node) return

        // 遍历整棵子树做清理：
        //   - pending：子树里尚未提交的修改直接丢弃（节点都要删了，提交它们没有意义）；
        //   - dirty：  被删除的节点不需要再通知；
        //   - nodes：  从路径缓存中移除，之后访问同一路径会重新创建节点。
        this.walk(node, n => {
            this.pending.delete(n)
            this.dirty.delete(n)
            this.nodes.delete(n.path)
        })

        // 从父节点上摘下整棵子树。nodes 中不包含 root，所以这里的 parent 一定存在。
        node.parent!.children.delete(node.key)

        // 祖先的 count 中包含的是这棵子树「已提交」的汇总值（pending 的从未加进去），
        // 所以扣掉 node.count 即可，与 pending 中丢弃了什么无关。
        this.propagate(node.parent, -node.count)

        // 祖先被加入了 dirty，需要一次 flush 来通知 UI
        this.schedule()
    }

    /**
     * 把所有节点的自身值清零（例如切换账号、重新登录）。
     * 与 remove 不同：树结构和监听者都保留，UI 不需要重新绑定，
     * 只会在下一次 flush 时收到「变为 0」的通知 —— 这也是单例无需被替换的原因。
     * 清零同样走 pending，和其他更新一起合并，不会逐个节点刷新 UI。
     */
    clear(): void {
        this.nodes.forEach(node => this.set(node.path, 0))
    }

    // ---------------- 读取 ----------------

    /**
     * 读取已提交的汇总值；路径不存在时返回 0。
     * 由于写入是延迟提交的，同一段同步代码里 set 之后立刻 get 读到的仍是旧值，
     * 需要立刻读到最新值时先调用 flush()。
     * 使用 nodes.get 而不是 getOrCreate：读取操作不应该在树上创建出空节点。
     */
    get(path: string): number {
        return this.nodes.get(path)?.count ?? 0
    }

    /** 是否需要显示红点：汇总值大于 0 */
    isShow(path: string): boolean {
        return this.get(path) > 0
    }

    // ---------------- 监听 ----------------

    /**
     * 监听节点数值变化，返回取消监听的函数（UI 销毁时务必调用，避免内存泄漏）。
     * 路径不存在时会先创建节点，所以可以先绑定 UI、之后再有数据。
     * @param immediate 是否立刻用当前值回调一次（UI 初始化时通常需要，用于显示初始状态）
     */
    on(path: string, listener: RedDotListener, immediate = true): () => void {
        const node = this.getOrCreate(path)
        if (!node.listeners) {
            node.listeners = new Set()
            // 没有监听者期间 notified 不会被更新，可能是很久以前的值。
            // 第一个监听者绑定时，以当前 count 作为基准，之后只通知真正的变化。
            node.notified = node.count
        }
        node.listeners.add(listener)
        if (immediate) listener(node.count, node.path)

        return () => {
            // 节点可能已经被 remove，或者 listeners 已经因为清空被置为 null
            if (!node.listeners) return
            node.listeners.delete(listener)
            // 最后一个监听者离开时置为 null：之后 propagate 不再把该节点加入 dirty
            if (node.listeners.size === 0) node.listeners = null
        }
    }

    // ---------------- 提交 ----------------

    /**
     * 立即提交所有待处理的更新并通知监听者（调度器触发时也是调用它）。
     * 分两个阶段：
     *   阶段一：把 pending 中的值写入节点，并沿父链增量更新 count；
     *   阶段二：对 dirty 中的节点比较新旧值，真正变化了才通知。
     * 先把所有数值算完再通知，保证监听者回调里 get 任何节点都能读到一致的最新值。
     */
    flush(): void {
        // 先复位：回调里如果又产生了新的更新，可以重新调度下一次 flush
        this.scheduled = false

        // ===== 阶段一：提交数值 =====
        // 先换出 pending：监听者回调里再 set 的值会进入新的一批，不会干扰本次遍历
        // （边遍历 Map 边往里写，可能导致新写入的项在本轮被处理，也可能不被处理，行为难以预测）
        const pending = this.pending
        this.pending = new Map()
        pending.forEach((value, node) => {
            // pending 里存的是最终值，与已提交的 selfCount 相减得到本批次的净变化量
            const delta = value - node.selfCount
            // 例如同一批里先 set(3) 又 set 回原值，净变化为 0，不需要传播
            if (delta === 0) return
            node.selfCount = value
            this.propagate(node, delta)
        })

        // ===== 阶段二：通知监听者 =====
        // 同样先换出 dirty，原因同上
        const dirty = this.dirty
        this.dirty = new Set()
        dirty.forEach(node => {
            // 两种情况跳过：
            //   - listeners 为 null：加入 dirty 之后监听者被取消了；
            //   - count === notified：数值绕了一圈又回到原值（如兄弟节点一增一减），UI 无需刷新。
            if (!node.listeners || node.count === node.notified) return
            node.notified = node.count
            node.listeners.forEach(listener => {
                // 隔离单个监听者的异常：一个 UI 组件出错，不能影响其他组件收到通知
                try {
                    listener(node.count, node.path)
                } catch (e) {
                    console.error(`[RedDot] 监听者执行出错：${node.path}`, e)
                }
            })
        })
    }

    // ---------------- 内部实现 ----------------

    /**
     * 沿父链增量更新汇总值，O(深度)。
     * 核心思想：子节点变化了 delta，那么它的每一个祖先的汇总值也恰好变化 delta，
     * 不需要重新遍历兄弟节点求和。树再宽（比如背包里有 1000 个道具），一次更新的代价也只和深度有关。
     * @param from 从哪个节点开始累加（包含它自身），null 表示什么也不做
     */
    private propagate(from: RedDotNode | null, delta: number): void {
        // 到 root 为止：root 不对外暴露、不能被监听，不需要维护它的 count
        for (let n = from; n && n !== this.root; n = n.parent) {
            n.count += delta
            // 只有被监听的节点才需要在阶段二检查，没人监听的节点只改数字
            if (n.listeners) this.dirty.add(n)
        }
    }

    /** 向调度器申请一次 flush；同一批次内重复调用会被 scheduled 标记挡住 */
    private schedule(): void {
        if (this.scheduled) return
        this.scheduled = true
        // 用箭头函数包一层以绑定 this；不能直接传 this.flush（会丢失 this）
        this.scheduler(() => this.flush())
    }

    /**
     * 根据路径获取节点，不存在则沿路径逐层创建（包括中间节点）。
     * 命中缓存时 O(1)；只有第一次出现的路径才需要 split 和逐层创建。
     * 例如第一次访问 'Main/Mail/System' 时，会依次创建 Main、Main/Mail、Main/Mail/System
     * 三个节点，并全部写入 nodes 缓存，之后访问 'Main/Mail' 也能直接命中。
     */
    private getOrCreate(path: string): RedDotNode {
        const cached = this.nodes.get(path)
        if (cached) return cached

        let node = this.root
        for (const key of path.split(SEPARATOR)) {
            let child = node.children.get(key)
            if (!child) {
                // root 的 path 是空串，顶层节点的路径就是 key 本身，不能拼成 '/Main'
                const childPath = node === this.root ? key : node.path + SEPARATOR + key
                child = new RedDotNode(key, childPath, node)
                node.children.set(key, child)
                this.nodes.set(childPath, child)
            }
            node = child
        }
        return node
    }

    /** 深度优先遍历以 node 为根的子树（包含 node 自身） */
    private walk(node: RedDotNode, fn: (n: RedDotNode) => void): void {
        fn(node)
        node.children.forEach(child => this.walk(child, fn))
    }
}
