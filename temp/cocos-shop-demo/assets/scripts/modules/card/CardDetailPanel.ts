import { _decorator, Button, Label } from 'cc'
import { MvcComponent } from '../../MvcComponent'
import { cardController } from '../../MvcRegistry'
import { CardDetailView, CardIntents, CardView } from './CardController'
import { Card } from './CardModel'

const { ccclass, property } = _decorator

/** 卡牌详情面板：显示选中卡牌的属性，升级（消耗金币），显示提示 */
@ccclass('CardDetailPanel')
export class CardDetailPanel extends MvcComponent<CardIntents> implements CardView {
    @property(Label) nameLabel: Label | null = null
    @property(Label) rarityLabel: Label | null = null
    @property(Label) levelLabel: Label | null = null
    @property(Label) attackLabel: Label | null = null
    @property(Label) hpLabel: Label | null = null
    @property(Label) descriptionLabel: Label | null = null
    @property(Label) costLabel: Label | null = null
    @property(Button) upgradeButton: Button | null = null
    @property(Label) upgradeButtonLabel: Label | null = null
    @property(Label) tipLabel: Label | null = null

    private cardId: number | null = null

    onEnable() {
        if (this.tipLabel) this.tipLabel.string = ''
        cardController.attach(this)
    }

    onDisable() {
        cardController.detach(this)
    }

    renderDetail(detail: CardDetailView | null): void {
        this.cardId = detail?.card.id ?? null
        if (!detail) {
            // 不修改自身 node.active：隐藏会触发 onDisable，之后就收不到更新了
            if (this.nameLabel) this.nameLabel.string = '未选择卡牌'
            if (this.upgradeButton) this.upgradeButton.interactable = false
            return
        }
        const { card } = detail
        if (this.nameLabel) this.nameLabel.string = card.name
        if (this.rarityLabel) this.rarityLabel.string = card.rarity
        if (this.levelLabel) this.levelLabel.string = `Lv.${card.level} / ${card.maxLevel}`
        if (this.attackLabel) this.attackLabel.string = `攻击 ${card.attack}`
        if (this.hpLabel) this.hpLabel.string = `生命 ${card.hp}`
        if (this.descriptionLabel) this.descriptionLabel.string = card.description
        if (this.costLabel) {
            this.costLabel.string = detail.maxLevel ? '' : `${detail.cost} 金币${detail.affordable ? '' : '（金币不足）'}`
        }
        if (this.upgradeButton) this.upgradeButton.interactable = detail.canUpgrade
        if (this.upgradeButtonLabel) {
            this.upgradeButtonLabel.string = detail.maxLevel ? '已满级' : detail.upgrading ? '升级中…' : '升级'
        }
    }

    showUpgraded(card: Card): void {
        if (this.tipLabel) this.tipLabel.string = `升级成功：${card.name} Lv.${card.level}`
    }

    showError(message: string): void {
        if (this.tipLabel) this.tipLabel.string = message
    }

    // ---- 在编辑器里把按钮的点击事件绑到下面的方法 ----
    onClickUpgrade() {
        if (this.cardId !== null) this.emit('cardUpgrade', this.cardId)
    }

    /** 关闭详情：节点隐藏后 onDisable 里自动 detach */
    onClickClose() {
        this.node.active = false
    }
}
