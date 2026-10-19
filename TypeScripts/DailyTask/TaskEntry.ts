/**
 * 主界面上的「每日任务」入口按钮（MVC）
 *
 * 入口很简单（一个按钮 + 一个红点），用 MVC 写更直接：
 *   红点变化 -> Controller observe -> 调用 View.renderBadge
 *   点击按钮 -> View 发出 open 意图 -> Controller 打开面板，并高亮第一个可领取的任务
 */
import { Controller, MvcView } from '../MVVM_MVC'
import { popup } from '../Popup/PopupManager'
import { RedDotSystem } from '../RedDot/RedDot'
import { RedDotPath } from '../RedDot/RedDotManager'
import { redDotSignal } from '../RedDot/RedDotSignal'
import { TaskModel } from './TaskModel'

export class TaskEntryView extends MvcView<{ open: [] }> {
    renderBadge(count: number): void {
        console.log(`  [主界面·任务按钮] 红点 ${count > 0 ? count : '隐藏'}`)
    }

    /** 模拟玩家点击按钮 */
    click(): void {
        this.emit('open')
    }
}

export class TaskEntryController extends Controller<TaskEntryView> {
    constructor(
        view: TaskEntryView,
        private readonly tasks: TaskModel,
        private readonly redDots: RedDotSystem
    ) {
        super(view)
    }

    protected onStart(): void {
        const badge = this.addDisposable(redDotSignal(this.redDots, RedDotPath.Task))
        this.observe(badge, count => this.view.renderBadge(count), { immediate: true })
        this.listen('open', () => {
            popup.open('DailyTask', { focusTaskId: this.tasks.claimableIds()[0] })
        })
    }
}
