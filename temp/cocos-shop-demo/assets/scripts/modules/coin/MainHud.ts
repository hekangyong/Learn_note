import { _decorator, Button, Label, Node } from 'cc'
import { MvcComponent } from '../../MvcComponent'
import { coinController, dailyTaskController, shopController } from '../../MvcRegistry'
import { DailyTaskIntents, DailyTaskView } from '../dailyTask/DailyTaskController'
import { ShopIntents, ShopView } from '../shop/ShopController'
import { CoinIntents, CoinView } from './CoinController'

const { ccclass, property } = _decorator

/** 主界面顶栏：显示金币，领取每日奖励；商城入口红点；日常任务入口红点 */
@ccclass('MainHud')
export class MainHud
    extends MvcComponent<CoinIntents & ShopIntents & DailyTaskIntents>
    implements CoinView, ShopView, DailyTaskView
{
    @property(Label) coinLabel: Label | null = null
    @property(Button) dailyButton: Button | null = null
    /** 商城入口上的红点（子节点：隐藏它不会触发本组件的 onDisable） */
    @property(Node) shopDot: Node | null = null
    /** 日常任务入口上的红点（子节点）和可领取数量 */
    @property(Node) taskDot: Node | null = null
    @property(Label) taskDotLabel: Label | null = null

    onEnable() {
        coinController.attach(this)
        shopController.attach(this)
        dailyTaskController.attach(this)
    }

    onDisable() {
        dailyTaskController.detach(this)
        shopController.detach(this)
        coinController.detach(this)
    }

    renderBuyableDot(hasBuyable: boolean): void {
        if (this.shopDot) this.shopDot.active = hasBuyable
    }

    renderClaimableDot(count: number): void {
        if (this.taskDot) this.taskDot.active = count > 0
        if (this.taskDotLabel) this.taskDotLabel.string = `${count}`
    }

    renderCoin(amount: number): void {
        if (this.coinLabel) this.coinLabel.string = `${amount}`
    }

    renderDailyClaimed(claimed: boolean): void {
        if (this.dailyButton) this.dailyButton.interactable = !claimed
    }

    // ---- 在编辑器里把按钮的点击事件绑到下面的方法 ----
    onClickDaily() {
        this.emit('coinClaimDaily')
    }
}
