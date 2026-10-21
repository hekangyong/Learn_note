import { computed, IMvcView, IntentHandlers, MultiController, ReadonlySignal } from '../../framework/index'
import { Clock, formatDuration } from '../../common/Clock'
import { DailyTaskModel, statusOf, Task, TaskStatus } from './DailyTaskModel'

/** 意图名加模块前缀：一个组件挂多个 Controller 时意图表会合并，重名会被重复处理 */
export type DailyTaskIntents = {
    dailyTaskClaim: [id: number]
    dailyTaskClaimAll: []
    dailyTaskRefresh: []
}

/** 列表格子需要的显示数据 */
export interface DailyTaskItemView {
    readonly task: Task
    readonly status: TaskStatus
    /** 领取按钮是否可点 */
    readonly canClaim: boolean
}

/** 显示方法全部可选：任务面板实现列表 / 倒计时 / 一键领取，主界面只实现红点 */
export interface DailyTaskView extends IMvcView<DailyTaskIntents> {
    renderTasks?(items: readonly DailyTaskItemView[], loading: boolean): void
    renderClaimAll?(enabled: boolean): void
    /** 实现了这个方法的 View 挂上来时才会启动每秒一次的倒计时 */
    renderCountdown?(text: string): void
    renderClaimableDot?(count: number): void
    showClaimed?(coins: number): void
    showError?(message: string): void
}

const STATUS_ORDER: Record<TaskStatus, number> = { claimable: 0, doing: 1, claimed: 2 }

export class DailyTaskController extends MultiController<DailyTaskIntents, DailyTaskView> {
    private readonly list: ReadonlySignal<{ items: readonly DailyTaskItemView[]; loading: boolean }>
    private readonly claimableCount: ReadonlySignal<number>
    private readonly canClaimAll: ReadonlySignal<boolean>

    /** 正在显示倒计时的 View 数量：没有 View 显示倒计时时停掉定时器 */
    private countdownViews = 0
    private stopCountdown: (() => void) | null = null
    /** 已经为哪个重置时间点触发过兜底刷新，避免每秒重复请求 */
    private reloadedFor = 0

    constructor(
        private readonly tasks: DailyTaskModel,
        private readonly clock: Clock
    ) {
        super()
        this.list = computed(() => {
            const { tasks, claiming, loading } = this.tasks.state
            const items = tasks
                .map(task => {
                    const status = statusOf(task)
                    return { task, status, canClaim: status === 'claimable' && !claiming }
                })
                // 可领取的排最前，已领取的沉底
                .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.task.id - b.task.id)
            return { items, loading }
        })
        this.claimableCount = this.tasks.select(s => s.tasks.filter(t => statusOf(t) === 'claimable').length)
        this.canClaimAll = computed(() => this.claimableCount.value > 0 && !this.tasks.state.claiming)
    }

    protected intents(): IntentHandlers<DailyTaskIntents> {
        return {
            dailyTaskClaim: id => this.claim(() => this.tasks.claim(id)),
            dailyTaskClaimAll: () => this.claim(() => this.tasks.claimAll()),
            dailyTaskRefresh: () => this.tasks.load(),
        }
    }

    protected onStart(): void {
        this.observe(this.list, () => this.forEachView(v => this.renderTasks(v)))
        this.observe(this.canClaimAll, b => this.forEachView(v => v.renderClaimAll?.(b)))
        this.observe(this.claimableCount, n => this.forEachView(v => v.renderClaimableDot?.(n)))
        // 跨天推送替换了重置时间：立即刷新倒计时，不等下一秒
        this.observe(this.tasks.select(s => s.resetAt), () => this.tick())
        this.guard('load', () => this.tasks.load())
    }

    /** Model 观察早于 View 出现，新挂上的 View 补一次当前状态 */
    protected override onAttach(view: DailyTaskView): void {
        this.renderTasks(view)
        view.renderClaimAll?.(this.canClaimAll.value)
        view.renderClaimableDot?.(this.claimableCount.value)
        if (view.renderCountdown) {
            view.renderCountdown(this.countdownText())
            if (this.countdownViews++ === 0) this.stopCountdown = this.clock.every(1000, () => this.tick())
        }
    }

    protected override onDetach(view: DailyTaskView): void {
        if (view.renderCountdown && --this.countdownViews === 0) {
            this.stopCountdown?.()
            this.stopCountdown = null
        }
    }

    protected override onError(error: unknown, context: string): void {
        const message = error instanceof Error ? error.message : String(error)
        const isClaim = context === 'dailyTaskClaim' || context === 'dailyTaskClaimAll'
        this.forEachView(v => v.showError?.(isClaim ? message : `${context} 失败：${message}`))
    }

    private async claim(run: () => Promise<number>): Promise<void> {
        const coins = await run()
        this.forEachView(v => v.showClaimed?.(coins))
    }

    private tick(): void {
        const text = this.countdownText()
        this.forEachView(v => v.renderCountdown?.(text))
        // 兜底：到了重置时间还没收到跨天推送（例如断线），主动重新拉取一次
        const { resetAt, loaded, loading } = this.tasks.state
        if (loaded && !loading && resetAt > 0 && this.clock.now() >= resetAt && this.reloadedFor !== resetAt) {
            this.reloadedFor = resetAt
            this.guard('reset', () => this.tasks.load())
        }
    }

    private countdownText(): string {
        const { resetAt } = this.tasks.state
        return resetAt > 0 ? formatDuration(resetAt - this.clock.now()) : '--:--:--'
    }

    private renderTasks(view: DailyTaskView): void {
        const { items, loading } = this.list.value
        view.renderTasks?.(items, loading)
    }
}
