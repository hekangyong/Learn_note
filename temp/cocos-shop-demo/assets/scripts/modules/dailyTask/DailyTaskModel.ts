import { batch, Model } from '../../framework/index'
import { CoinModel } from '../coin/CoinModel'

/** 任务类型：服务器按类型累计进度，例如「完成 3 场战斗」 */
export type TaskKind = 'login' | 'battle' | 'shop' | 'share'

export interface Task {
    readonly id: number
    readonly title: string
    readonly kind: TaskKind
    readonly target: number
    /** 当前进度，最大为 target */
    readonly progress: number
    /** 奖励金币 */
    readonly reward: number
    /** 奖励是否已领取 */
    readonly claimed: boolean
}

/** 任务状态由数据派生，不单独存储，避免不一致 */
export type TaskStatus = 'doing' | 'claimable' | 'claimed'

export function statusOf(task: Task): TaskStatus {
    if (task.claimed) return 'claimed'
    return task.progress >= task.target ? 'claimable' : 'doing'
}

export interface TaskSnapshot {
    readonly tasks: readonly Task[]
    /** 下次重置的时间戳 */
    readonly resetAt: number
}

/** 服务器推送：progress 部分任务进度变化；reset 跨天整份替换 */
export type TaskPush =
    | { type: 'progress'; tasks: readonly Task[] }
    | ({ type: 'reset' } & TaskSnapshot)

export interface ClaimResult {
    /** 实际领取成功的任务 */
    readonly claimed: readonly number[]
    /** 发放的金币总数 */
    readonly coins: number
}

/** 数据来源抽象：生产环境 HTTP + 长连接推送，联调前用 MockDailyTaskApi */
export interface DailyTaskApi {
    fetch(): Promise<TaskSnapshot>
    claim(taskIds: readonly number[]): Promise<ClaimResult>
    /** 订阅服务器推送，返回取消函数 */
    subscribe(listener: (push: TaskPush) => void): () => void
}

export class HttpDailyTaskApi implements DailyTaskApi {
    async fetch(): Promise<TaskSnapshot> {
        throw new Error('TODO: 接入任务接口')
    }
    async claim(_taskIds: readonly number[]): Promise<ClaimResult> {
        throw new Error('TODO: 接入领取接口')
    }
    subscribe(_listener: (push: TaskPush) => void): () => void {
        // TODO: 接入长连接推送
        return () => {}
    }
}

interface DailyTaskState {
    readonly tasks: readonly Task[]
    readonly resetAt: number
    /** 是否已从服务器拉取过数据 */
    readonly loaded: boolean
    readonly loading: boolean
    /** 领取请求进行中：单个领取和一键领取互斥，防止重复领取 */
    readonly claiming: boolean
}

export class DailyTaskModel extends Model<DailyTaskState> {
    private readonly unsubscribe: () => void
    private loadSeq = 0

    constructor(
        private readonly api: DailyTaskApi,
        private readonly coin: CoinModel
    ) {
        super({
            tasks: [],
            resetAt: 0,
            loaded: false,
            loading: false,
            claiming: false,
        })
        this.unsubscribe = api.subscribe(push =>
            push.type === 'reset'
                ? this.reset(push)
                : this.applyProgress(push.tasks)
        )
    }

    claimableIds(): number[] {
        return this.state.tasks
            .filter(t => statusOf(t) === 'claimable')
            .map(t => t.id)
    }

    async load(): Promise<void> {
        const seq = ++this.loadSeq
        this.setState({ loading: true })
        try {
            const snapshot = await this.api.fetch()
            if (seq === this.loadSeq)
                this.setState({ ...snapshot, loaded: true, loading: false })
        } catch (error) {
            if (seq === this.loadSeq) this.setState({ loading: false })
            throw error
        }
    }

    /** 领取单个任务。只有已完成且未领取的才能领 */
    async claim(id: number): Promise<number> {
        const task = this.state.tasks.find(t => t.id === id)
        if (!task) throw new Error(`任务 ${id} 不存在`)
        const status = statusOf(task)
        if (status === 'claimed') throw new Error('奖励已领取')
        if (status === 'doing') throw new Error('任务未完成')
        return this.claimIds([id])
    }

    /** 一次请求领取所有可领取的任务 */
    async claimAll(): Promise<number> {
        const ids = this.claimableIds()
        if (ids.length === 0) throw new Error('没有可领取的奖励')
        return this.claimIds(ids)
    }

    /** 服务器推送进度。尚未加载时忽略：之后 load 拿到的是包含这些变化的完整数据 */
    applyProgress(tasks: readonly Task[]): void {
        if (!this.state.loaded) return
        const updates = new Map(tasks.map(t => [t.id, t]))
        this.setState(s => ({
            tasks: s.tasks.map(t => updates.get(t.id) ?? t),
        }))
    }

    /** 跨天：整份替换 */
    reset(snapshot: TaskSnapshot): void {
        this.setState({
            tasks: snapshot.tasks,
            resetAt: snapshot.resetAt,
            loaded: true,
        })
    }

    /** 退出登录 / 切换账号时调用 */
    dispose(): void {
        this.unsubscribe()
    }

    /** 客户端先校验，服务器再校验一次（客户端数据可能过期），返回获得的金币 */
    private async claimIds(ids: readonly number[]): Promise<number> {
        if (this.state.claiming) throw new Error('正在领取，请稍候')
        this.setState({ claiming: true })
        try {
            const result = await this.api.claim(ids)
            const claimed = new Set(result.claimed)
            // 任务状态和金币在同一批中修改：界面不会看到「已领取但金币没到账」的中间状态
            batch(() => {
                this.setState(s => ({
                    tasks: s.tasks.map(t =>
                        claimed.has(t.id) ? { ...t, claimed: true } : t
                    ),
                    claiming: false,
                }))
                if (result.coins > 0) this.coin.add(result.coins)
            })
            return result.coins
        } catch (error) {
            this.setState({ claiming: false })
            throw error
        }
    }
}
