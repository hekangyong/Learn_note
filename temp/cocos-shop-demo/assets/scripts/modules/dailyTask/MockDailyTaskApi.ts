/**
 * 模拟服务器：实现 DailyTaskApi，联调前和测试中使用。换成真实接口后 Model 以上不用改。
 * simulate 开头的方法模拟服务器端发生的事情（打完一场战斗、跨天），会推送给客户端；可以接到调试按钮上。
 */
import { Clock, nextResetAt } from '../../common/Clock'
import { ClaimResult, DailyTaskApi, statusOf, Task, TaskKind, TaskPush, TaskSnapshot } from './DailyTaskModel'

export type TaskDefinition = Omit<Task, 'progress' | 'claimed'>

export const DEFAULT_TASKS: readonly TaskDefinition[] = [
    { id: 1, title: '每日登录', kind: 'login', target: 1, reward: 50 },
    { id: 2, title: '完成 3 场战斗', kind: 'battle', target: 3, reward: 100 },
    { id: 3, title: '在商城购买 1 次', kind: 'shop', target: 1, reward: 80 },
    { id: 4, title: '分享游戏', kind: 'share', target: 1, reward: 30 },
]

export class MockDailyTaskApi implements DailyTaskApi {
    private tasks: Task[] = []
    private resetAt = 0
    private readonly listeners = new Set<(push: TaskPush) => void>()
    /** 下一次 claim 请求失败（模拟网络错误） */
    failNextClaim = false

    constructor(
        private readonly clock: Clock,
        private readonly definitions: readonly TaskDefinition[] = DEFAULT_TASKS,
        private readonly latency = 200
    ) {
        this.resetTasks()
    }

    async fetch(): Promise<TaskSnapshot> {
        await this.delay()
        // 拉取即视为登录
        this.addProgress('login', 1)
        return this.snapshot()
    }

    async claim(taskIds: readonly number[]): Promise<ClaimResult> {
        await this.delay()
        if (this.failNextClaim) {
            this.failNextClaim = false
            throw new Error('网络异常，请稍后重试')
        }
        // 服务器校验：只发放真正可以领取的任务
        const claimed: number[] = []
        let coins = 0
        this.tasks = this.tasks.map(task => {
            if (!taskIds.includes(task.id) || statusOf(task) !== 'claimable') return task
            claimed.push(task.id)
            coins += task.reward
            return { ...task, claimed: true }
        })
        if (claimed.length === 0) throw new Error('奖励已领取或任务未完成')
        return { claimed, coins }
    }

    subscribe(listener: (push: TaskPush) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /** 玩家完成了某种行为，相关任务进度 +count，并推送 */
    simulateProgress(kind: TaskKind, count = 1): void {
        const changed = this.addProgress(kind, count)
        if (changed.length > 0) this.push({ type: 'progress', tasks: changed })
    }

    /** 跨天：重置全部任务并推送 */
    simulateDailyReset(): void {
        this.resetTasks()
        this.push({ type: 'reset', ...this.snapshot() })
    }

    private addProgress(kind: TaskKind, count: number): Task[] {
        const changed: Task[] = []
        this.tasks = this.tasks.map(task => {
            if (task.kind !== kind || task.progress >= task.target) return task
            const next = { ...task, progress: Math.min(task.target, task.progress + count) }
            changed.push(next)
            return next
        })
        return changed
    }

    private resetTasks(): void {
        this.tasks = this.definitions.map(d => ({ ...d, progress: 0, claimed: false }))
        this.resetAt = nextResetAt(this.clock.now())
    }

    private snapshot(): TaskSnapshot {
        return { tasks: [...this.tasks], resetAt: this.resetAt }
    }

    private push(push: TaskPush): void {
        this.listeners.forEach(listener => listener(push))
    }

    private delay(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, this.latency))
    }
}
