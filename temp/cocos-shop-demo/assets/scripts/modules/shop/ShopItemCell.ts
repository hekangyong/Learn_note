import { _decorator, Button, Component, Label } from 'cc'
import { ShopItemView } from './ShopController'

const { ccclass, property } = _decorator

/**
 * 商品格子：普通组件，不 attach 到 Controller。
 * 由 ShopPanel 统一 attach 并把数据分发下来，格子可以随 ScrollView 回收复用，不用管注册。
 */
@ccclass('ShopItemCell')
export class ShopItemCell extends Component {
    @property(Label) nameLabel: Label | null = null
    @property(Label) priceLabel: Label | null = null
    @property(Label) limitLabel: Label | null = null
    @property(Button) buyButton: Button | null = null
    @property(Label) buyButtonLabel: Label | null = null

    private itemId = 0
    private onBuy: ((id: number) => void) | null = null

    show(view: ShopItemView, onBuy: (id: number) => void): void {
        const { item } = view
        this.itemId = item.id
        this.onBuy = onBuy
        if (this.nameLabel) this.nameLabel.string = item.name
        if (this.priceLabel) this.priceLabel.string = `${item.price}`
        if (this.priceLabel && !view.affordable) this.priceLabel.string += '（金币不足）'
        if (this.limitLabel) this.limitLabel.string = `限购 ${item.bought}/${item.limit}`
        if (this.buyButton) this.buyButton.interactable = view.canBuy
        if (this.buyButtonLabel) this.buyButtonLabel.string = view.soldOut ? '已售罄' : view.buying ? '购买中…' : '购买'
    }

    // ---- 在预制体里把购买按钮的点击事件绑到这个方法 ----
    onClickBuy() {
        this.onBuy?.(this.itemId)
    }
}
