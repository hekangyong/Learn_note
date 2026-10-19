/**
 * 每日任务面板：View（MVVM）+ 弹窗注册
 *
 * 面板是一个弹窗，统一由弹窗管理器调度（优先级、去重、新手引导期间延后），
 * 业务代码只需要 popup.open('DailyTask', { focusTaskId })。
 *
 * View 用 console 模拟；换成真实引擎时只重写 TaskPanelView，ViewModel 一行不用改。
 */
import { MvvmView } from '../MVVM_MVC'
import { MvvmPopup } from '../Popup/arch/MvvmPopup'
import { popupPriority, PopupWindow } from '../Popup/PopupManager'
import { Clock } from './Clock'
import { TaskModel, TaskStatus, WalletModel } from './TaskModel'
import { DailyTaskData, TaskPanelViewModel } from './TaskPanelViewModel'

// ============================================================
// 依赖配置
// ============================================================

/**
 * 弹窗类由管理器 new，无法通过构造函数注入依赖，
 * 所以由应用启动时调用 configureDailyTask 一次性提供。
 */
export interface DailyTaskDeps {
    tasks: TaskModel
    wallet: WalletModel
    clock: Clock
}

let deps: DailyTaskDeps | null = null

export function configureDailyTask(next: DailyTaskDeps): void {
    deps = next
}

function requireDeps(): DailyTaskDeps {
    if (!deps) throw new Error('[DailyTask] configureDailyTask must be called before opening the panel')
    return deps
}

// ============================================================
// View
// ============================================================

const BUTTON_TEXT: Record<TaskStatus, string> = { claimable: '[领取]', doing: '[前往]', claimed: '[已领取]' }

/** 当前打开的面板，演示中用它模拟玩家点击 */
export let openedPanel: TaskPanelView | null = null

export class TaskPanelView extends MvvmView<TaskPanelViewModel> {
    protected onBind(vm: TaskPanelViewModel): void {
        openedPanel = this
        console.log('  ┌ [任务面板] 打开')
        this.bindEffect(() => {
            if (vm.loading.value) {
                console.log('  │ 加载中…')
                return
            }
            for (const item of vm.items.value) {
                const focus = item.focused ? '▶' : ' '
                console.log(`  │ ${focus} ${BUTTON_TEXT[item.status].padEnd(5)} ${item.progressText}  +${item.reward} 金币  ${item.title}`)
            }
        })
        this.bind(vm.gold, gold => console.log(`  │ 金币：${gold}`))
        this.bind(vm.countdown, text => console.log(`  │ 距离重置：${text}`))
        this.bindCommand(vm.claimAll, enabled => console.log(`  │ 一键领取：${enabled ? '可点击' : '置灰'}`))
        this.bind(vm.toast, toast => toast && console.log(`  │ ${toast.kind === 'error' ? '⚠' : '✔'} ${toast.text}`))
    }

    protected override onUnbind(): void {
        if (openedPanel === this) openedPanel = null
        console.log('  └ [任务面板] 关闭')
    }

    // ---- 模拟玩家操作：只转发给 ViewModel 的命令 ----
    clickClaim(taskId: number) {
        return this.vm.claim.execute(taskId)
    }
    clickClaimAll() {
        return this.vm.claimAll.execute()
    }
    clickClose(): void {
        this.vm.closePanel.execute()
    }
}

// ============================================================
// 弹窗注册
// ============================================================

declare module '../Popup/PopupManager' {
    interface PopupDataMap {
        /** 每日任务面板 */
        DailyTask: DailyTaskData
    }
}

// 比普通功能面板稍高，仍低于所有奖励类弹窗
@PopupWindow('DailyTask', { priority: popupPriority('Panel', 20) })
export class DailyTaskPopup extends MvvmPopup<DailyTaskData, TaskPanelViewModel, TaskPanelView> {
    protected createViewModel(): TaskPanelViewModel {
        const { tasks, wallet, clock } = requireDeps()
        return new TaskPanelViewModel(tasks, wallet, clock)
    }

    protected createView(): TaskPanelView {
        return new TaskPanelView()
    }
}
