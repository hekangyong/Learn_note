/**
 * 每日任务面板的 ViewModel（MVVM）
 *
 * 只有状态和命令，不引用任何 View，也不依赖弹窗管理器的运行时：
 * 测试中直接 new + init 就能验证全部界面逻辑（见 test.ts）。
 *
 *   状态：items（排序后的任务列表）、claimableCount、gold、countdown、loading、toast
 *   命令：load、claim(taskId)、claimAll、closePanel
 */
import { AsyncCommand, Command, computed, ReadonlySignal, signal } from '../MVVM_MVC'
import { PopupViewModel } from '../Popup/arch/MvvmPopup'
import { Clock, formatDuration } from './Clock'
import { statusOf, Task, TaskModel, TaskStatus, WalletModel } from './TaskModel'

/** 打开每日任务面板时的数据（弹窗类型登记在 TaskPanel.ts） */
export interface DailyTaskData {
    /** 打开后高亮的任务 */
    focusTaskId?: number
}

/** 面板中一行任务的显示数据：View 直接拿来渲染，不再做任何计算 */
export interface TaskItem {
    readonly id: number
    readonly title: string
    readonly progressText: string
    readonly reward: number
    readonly status: TaskStatus
    /** 打开面板时要高亮的任务 */
    readonly focused: boolean
}

export interface Toast {
    readonly text: string
    readonly kind: 'success' | 'error'
}

/** 排序：可领取的排最前，已领取的沉底 */
const STATUS_ORDER: Record<TaskStatus, number> = { claimable: 0, doing: 1, claimed: 2 }

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export class TaskPanelViewModel extends PopupViewModel<DailyTaskData> {
    /** 当前时间，仅在面板显示期间每秒更新 */
    private readonly now = signal(0)
    private readonly focusTaskId = signal<number | undefined>(undefined)

    /** 提示信息；每次都是新对象，相同文字连续出现也会通知 */
    readonly toast = signal<Toast | null>(null)
    readonly gold: ReadonlySignal<number>

    items!: ReadonlySignal<readonly TaskItem[]>
    claimableCount!: ReadonlySignal<number>
    countdown!: ReadonlySignal<string>
    loading!: ReadonlySignal<boolean>

    load!: AsyncCommand
    claim!: AsyncCommand<[taskId: number], number>
    claimAll!: AsyncCommand<[], number>
    closePanel!: Command

    /** 依赖通过构造函数注入，测试时传入假的服务器和手动时钟 */
    constructor(
        private readonly tasks: TaskModel,
        wallet: WalletModel,
        private readonly clock: Clock
    ) {
        super()
        this.gold = wallet.gold
    }

    protected onInit(data: DailyTaskData): void {
        const tasks = this.tasks
        this.focusTaskId.set(data.focusTaskId)

        this.items = computed(() => {
            const focus = this.focusTaskId.value
            return [...tasks.state.tasks]
                .sort((a, b) => STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)] || a.id - b.id)
                .map(task => this.toItem(task, focus))
        })
        this.claimableCount = computed(() => tasks.state.tasks.filter(t => statusOf(t) === 'claimable').length)
        this.countdown = computed(() =>
            tasks.state.loaded ? formatDuration(tasks.state.resetAt - this.now.value) : '--:--:--'
        )

        // 错误统一转成 toast 显示在界面上，不上报（属于业务提示，不是程序错误）
        this.load = this.asyncCommand(signal => tasks.load(signal), { concurrency: 'restart', reportErrors: false })
        this.loading = this.load.isRunning

        // 单个领取和一键领取互斥：任意一个请求进行中，两个都不可点（drop 策略同时防止连点）
        this.claim = this.asyncCommand(
            async (signal, taskId: number) => {
                const gold = await tasks.claim([taskId], signal)
                this.showToast(`领取成功，金币 +${gold}`)
                return gold
            },
            { canExecute: () => !this.claimAll.isRunning.value, reportErrors: false }
        )
        this.claimAll = this.asyncCommand(
            async signal => {
                const ids = tasks.claimableIds()
                const gold = await tasks.claim(ids, signal)
                this.showToast(`一键领取 ${ids.length} 个奖励，金币 +${gold}`)
                return gold
            },
            { canExecute: () => this.claimableCount.value > 0 && !this.claim.isRunning.value, reportErrors: false }
        )
        this.closePanel = this.command(() => this.close())

        for (const command of [this.load, this.claim, this.claimAll]) {
            this.watch(command.error, error => {
                if (error) this.showToast(messageOf(error), 'error')
            })
        }
    }

    protected override onActivate(): void {
        // 倒计时只在面板显示期间走：被抢占 / 关闭时 activeDisposables 自动停止定时器
        this.now.set(this.clock.now())
        this.activeDisposables.add(this.clock.every(1000, () => this.now.set(this.clock.now())))
        if (!this.tasks.state.loaded) void this.load.execute()
    }

    private showToast(text: string, kind: Toast['kind'] = 'success'): void {
        this.toast.set({ text, kind })
    }

    private toItem(task: Task, focus: number | undefined): TaskItem {
        return {
            id: task.id,
            title: task.title,
            progressText: `${task.progress}/${task.target}`,
            reward: task.reward,
            status: statusOf(task),
            focused: task.id === focus,
        }
    }
}
