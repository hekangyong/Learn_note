import { _decorator, Button, instantiate, Label, Node, Prefab } from 'cc'
import { MvcComponent } from '../../MvcComponent'
import { dailyTaskController } from '../../MvcRegistry'
import { DailyTaskCell } from './DailyTaskCell'
import { DailyTaskIntents, DailyTaskItemView, DailyTaskView } from './DailyTaskController'

const { ccclass, property } = _decorator

/** 日常任务面板：任务列表、重置倒计时、一键领取、提示 */
@ccclass('DailyTaskPanel')
export class DailyTaskPanel extends MvcComponent<DailyTaskIntents> implements DailyTaskView {
    /** 任务格子预制体，根节点上挂 DailyTaskCell */
    @property(Prefab) itemPrefab: Prefab | null = null
    /** ScrollView 的 content 节点 */
    @property(Node) content: Node | null = null
    @property(Node) loadingNode: Node | null = null
    @property(Label) countdownLabel: Label | null = null
    @property(Button) claimAllButton: Button | null = null
    @property(Label) tipLabel: Label | null = null

    private readonly cells: DailyTaskCell[] = []
    private readonly handleClaim = (id: number) => this.emit('dailyTaskClaim', id)

    onEnable() {
        dailyTaskController.attach(this)
    }

    onDisable() {
        dailyTaskController.detach(this)
    }

    renderTasks(items: readonly DailyTaskItemView[], loading: boolean): void {
        if (this.loadingNode) this.loadingNode.active = loading
        items.forEach((view, index) => this.cellAt(index)?.show(view, this.handleClaim))
        // 多出来的格子隐藏起来留给下次复用
        this.cells.forEach((cell, index) => (cell.node.active = index < items.length))
    }

    renderClaimAll(enabled: boolean): void {
        if (this.claimAllButton) this.claimAllButton.interactable = enabled
    }

    renderCountdown(text: string): void {
        if (this.countdownLabel) this.countdownLabel.string = `${text} 后重置`
    }

    showClaimed(coins: number): void {
        if (this.tipLabel) this.tipLabel.string = `领取成功：金币 +${coins}`
    }

    showError(message: string): void {
        if (this.tipLabel) this.tipLabel.string = message
    }

    // ---- 在编辑器里把按钮的点击事件绑到下面的方法 ----
    onClickClaimAll() {
        this.emit('dailyTaskClaimAll')
    }

    onClickRefresh() {
        this.emit('dailyTaskRefresh')
    }

    private cellAt(index: number): DailyTaskCell | null {
        if (this.cells[index]) return this.cells[index]
        if (!this.itemPrefab || !this.content) return null
        const node = instantiate(this.itemPrefab)
        node.parent = this.content
        const cell = node.getComponent(DailyTaskCell)
        if (!cell) throw new Error('itemPrefab 的根节点上缺少 DailyTaskCell 组件')
        this.cells.push(cell)
        return cell
    }
}
