/**
 * 每日任务模块（服务端）
 *
 *   - 每个玩家一份任务数据，服务器是权威数据源；
 *   - TASK_FETCH_REQ / TASK_CLAIM_REQ 走请求-响应，领取时服务器再校验，并调用 WalletModule 发放金币；
 *   - 进度来源：其他模块发出的 'player:action' 事件，或直接调用 addProgress；
 *   - 订阅 'session:login' 完成「每日登录」；跨天时把 reset 推送给所有在线玩家。
 *
 * 任务定义、状态规则、重置时间与客户端共用（DEFAULT_TASKS / statusOf / nextResetAt）。
 */
import { BizError, Cmd, ErrorCode, Module, TaskPushType } from '../../WsProtoServer/src'
import { Clock, nextResetAt, systemClock } from '../Clock'
import { DEFAULT_TASKS, TaskDefinition } from '../FakeTaskServer'
import { statusOf, Task, TaskKind } from '../TaskModel'
import { WalletModule } from './WalletModule'

declare module '../../WsProtoServer/src/app/EventBus' {
    interface AppEvents {
        /** 玩家行为（战斗结算、商店购买、分享……），由对应业务模块发出 */
        'player:action': [userId: string, kind: TaskKind, count: number]
    }
}

export class TaskModule extends Module {
    readonly name = 'task'
    readonly deps = [WalletModule]

    private readonly users = new Map<string, Task[]>()
    private resetAt: number

    constructor(
        private readonly clock: Clock = systemClock,
        private readonly definitions: readonly TaskDefinition[] = DEFAULT_TASKS
    ) {
        super()
        this.resetAt = nextResetAt(clock.now())
    }

    onInit() {
        this.handle(Cmd.TASK_FETCH_REQ, ctx => {
            ctx.reply(Cmd.TASK_FETCH_RSP, { tasks: this.tasksOf(ctx.session.userId!), resetAt: this.resetAt })
        })
        this.handle(Cmd.TASK_CLAIM_REQ, (ctx, req) => {
            ctx.reply(Cmd.TASK_CLAIM_RSP, this.claim(ctx.session.userId!, req.taskIds))
        })

        this.on('session:login', session => this.addProgress(session.userId!, 'login'))
        this.on('player:action', (userId, kind, count) => this.addProgress(userId, kind, count))
    }

    onStart() {
        // 每秒检查一次是否跨天（ManualClock 下由 advance 驱动）
        this.addDisposer(
            this.clock.every(1000, () => {
                if (this.clock.now() >= this.resetAt) this.dailyReset()
            })
        )
    }

    claim(userId: string, taskIds: readonly number[]) {
        const ids = new Set(taskIds)
        const claimed: number[] = []
        let gold = 0
        const tasks = this.tasksOf(userId).map(task => {
            if (!ids.has(task.id) || statusOf(task) !== 'claimable') return task
            claimed.push(task.id)
            gold += task.reward
            return { ...task, claimed: true }
        })
        if (claimed.length === 0) throw new BizError(ErrorCode.TASK_NOT_CLAIMABLE, '奖励已领取或任务未完成')
        this.users.set(userId, tasks)
        this.get(WalletModule).add(userId, gold, `task:${claimed.join(',')}`)
        return { claimed, gold }
    }

    /** 进度 +count 并推送给该玩家 */
    addProgress(userId: string, kind: TaskKind, count = 1): void {
        const changed: Task[] = []
        const tasks = this.tasksOf(userId).map(task => {
            if (task.kind !== kind || task.progress >= task.target) return task
            const next = { ...task, progress: Math.min(task.target, task.progress + count) }
            changed.push(next)
            return next
        })
        if (changed.length === 0) return
        this.users.set(userId, tasks)
        this.sendToUser(userId, Cmd.TASK_PUSH, { type: TaskPushType.PROGRESS, tasks: changed, resetAt: this.resetAt })
    }

    /** 跨天：清空所有玩家的任务（下次访问时按定义重新生成），并推送给在线玩家 */
    dailyReset(): void {
        this.resetAt = nextResetAt(this.clock.now())
        const userIds = [...this.users.keys()]
        this.users.clear()
        for (const userId of userIds) {
            this.sendToUser(userId, Cmd.TASK_PUSH, {
                type: TaskPushType.RESET,
                tasks: this.tasksOf(userId),
                resetAt: this.resetAt,
            })
        }
        this.log.info(`daily reset, next at ${new Date(this.resetAt).toISOString()}`)
    }

    private tasksOf(userId: string): Task[] {
        let tasks = this.users.get(userId)
        if (!tasks) {
            tasks = this.definitions.map(d => ({ ...d, progress: 0, claimed: false }))
            this.users.set(userId, tasks)
        }
        return tasks
    }
}
