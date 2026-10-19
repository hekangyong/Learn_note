/**
 * 每日任务的 Model 层：数据类型、服务器接口、TaskModel、WalletModel
 *
 * 职责划分：
 *   - 服务器是权威数据源：任务进度由服务器推送，领取由服务器校验并发放奖励；
 *   - TaskModel 是客户端的数据镜像 + 业务规则（什么状态可以领取、跨天重置）；
 *   - 界面（MVVM 面板、MVC 入口按钮）和红点都只读 TaskModel，不直接接触服务器。
 */
import { batch, Model } from '../MVVM_MVC'

// ============================================================
// 数据类型
// ============================================================

/** 任务类型：服务器按类型累计进度，例如「完成 3 场战斗」 */
export type TaskKind = 'login' | 'battle' | 'shop' | 'share'

export interface Task {
    readonly id: number
    readonly title: string
    readonly kind: TaskKind
    /** 目标次数 */
    readonly target: number
    /** 当前进度，最大为 target */
    readonly progress: number
    /** 奖励金币 */
    readonly reward: number
    /** 奖励是否已领取 */
    readonly claimed: boolean
}

/**
 * 任务状态（派生值，不存储）：
 *   doing      进行中
 *   claimable  已完成，可以领取
 *   claimed    已领取
 */
export type TaskStatus = 'doing' | 'claimable' | 'claimed'

export function statusOf(task: Task): TaskStatus {
    if (task.claimed) return 'claimed'
    return task.progress >= task.target ? 'claimable' : 'doing'
}

// ============================================================
// 服务器接口
// ============================================================

export interface TaskSnapshot {
    readonly tasks: readonly Task[]
    /** 下次重置的时间戳 */
    readonly resetAt: number
}

/**
 * 服务器推送：
 *   progress  部分任务的进度变化
 *   reset     跨天重置，整份任务列表替换
 */
export type TaskPush = { type: 'progress'; tasks: readonly Task[] } | ({ type: 'reset' } & TaskSnapshot)

export interface ClaimResult {
    /** 实际领取成功的任务 */
    readonly claimed: readonly number[]
    /** 发放的金币总数 */
    readonly gold: number
}

export interface TaskApi {
    fetch(signal?: AbortSignal): Promise<TaskSnapshot>
    claim(taskIds: readonly number[], signal?: AbortSignal): Promise<ClaimResult>
    /** 订阅服务器推送，返回取消函数 */
    subscribe(listener: (push: TaskPush) => void): () => void
}

// ============================================================
// WalletModel
// ============================================================

export class WalletModel extends Model<{ gold: number }> {
    readonly gold = this.select(s => s.gold)

    constructor(gold = 0) {
        super({ gold })
    }

    add(amount: number): void {
        this.setState(s => ({ gold: s.gold + amount }))
    }
}

// ============================================================
// TaskModel
// ============================================================

interface TaskState {
    readonly tasks: readonly Task[]
    readonly resetAt: number
    /** 是否已从服务器拉取过数据 */
    readonly loaded: boolean
}

export class TaskModel extends Model<TaskState> {
    private readonly unsubscribe: () => void

    constructor(
        private readonly api: TaskApi,
        private readonly wallet: WalletModel
    ) {
        super({ tasks: [], resetAt: 0, loaded: false })
        this.unsubscribe = api.subscribe(push => this.applyPush(push))
    }

    /** 当前可以领取的任务 id */
    claimableIds(): number[] {
        return this.state.tasks.filter(t => statusOf(t) === 'claimable').map(t => t.id)
    }

    async load(signal?: AbortSignal): Promise<void> {
        const snapshot = await this.api.fetch(signal)
        this.setState({ tasks: snapshot.tasks, resetAt: snapshot.resetAt, loaded: true })
    }

    /**
     * 领取奖励。客户端先按业务规则过滤，服务器再校验一次（客户端数据可能过期）。
     * @returns 获得的金币
     */
    async claim(taskIds: readonly number[], signal?: AbortSignal): Promise<number> {
        const claimable = new Set(this.claimableIds())
        const ids = taskIds.filter(id => claimable.has(id))
        if (ids.length === 0) throw new Error('没有可领取的奖励')

        const result = await this.api.claim(ids, signal)
        const claimed = new Set(result.claimed)
        // 任务状态和金币在同一批中修改：界面不会看到「任务已领取但金币没到账」的中间状态
        batch(() => {
            this.setState(s => ({ tasks: s.tasks.map(t => (claimed.has(t.id) ? { ...t, claimed: true } : t)) }))
            this.wallet.add(result.gold)
        })
        return result.gold
    }

    /** 应用退出 / 切换账号时调用 */
    dispose(): void {
        this.unsubscribe()
    }

    private applyPush(push: TaskPush): void {
        if (push.type === 'reset') {
            this.setState({ tasks: push.tasks, resetAt: push.resetAt, loaded: true })
            return
        }
        // 尚未加载时忽略增量推送：之后 load 拿到的是包含这些变化的完整数据
        if (!this.state.loaded) return
        const updates = new Map(push.tasks.map(t => [t.id, t]))
        this.setState(s => ({ tasks: s.tasks.map(t => updates.get(t.id) ?? t) }))
    }
}
