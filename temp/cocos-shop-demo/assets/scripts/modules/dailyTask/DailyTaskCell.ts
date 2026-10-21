import { _decorator, Button, Component, Label } from 'cc'
import { DailyTaskItemView } from './DailyTaskController'

const { ccclass, property } = _decorator

const BUTTON_TEXT = { doing: '未完成', claimable: '领取', claimed: '已领取' } as const

/**
 * 任务格子：普通组件，不 attach 到 Controller。
 * 由 DailyTaskPanel 统一 attach 并把数据分发下来，格子可以随 ScrollView 回收复用。
 */
@ccclass('DailyTaskCell')
export class DailyTaskCell extends Component {
    @property(Label) titleLabel: Label | null = null
    @property(Label) progressLabel: Label | null = null
    @property(Label) rewardLabel: Label | null = null
    @property(Button) claimButton: Button | null = null
    @property(Label) claimButtonLabel: Label | null = null

    private taskId = 0
    private onClaim: ((id: number) => void) | null = null

    show(view: DailyTaskItemView, onClaim: (id: number) => void): void {
        const { task } = view
        this.taskId = task.id
        this.onClaim = onClaim
        if (this.titleLabel) this.titleLabel.string = task.title
        if (this.progressLabel) this.progressLabel.string = `${task.progress}/${task.target}`
        if (this.rewardLabel) this.rewardLabel.string = `${task.reward}`
        if (this.claimButton) this.claimButton.interactable = view.canClaim
        if (this.claimButtonLabel) this.claimButtonLabel.string = BUTTON_TEXT[view.status]
    }

    // ---- 在预制体里把领取按钮的点击事件绑到这个方法 ----
    onClickClaim() {
        this.onClaim?.(this.taskId)
    }
}
