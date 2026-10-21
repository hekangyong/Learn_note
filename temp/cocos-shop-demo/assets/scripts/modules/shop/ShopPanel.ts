import { _decorator, instantiate, Label, Node, Prefab } from 'cc'
import { MvcComponent } from '../../MvcComponent'
import { shopController } from '../../MvcRegistry'
import { ShopIntents, ShopItemView, ShopView } from './ShopController'
import { ShopItemCell } from './ShopItemCell'
import { ShopItem } from './ShopModel'

const { ccclass, property } = _decorator

/** 商城面板：显示商品列表，购买、刷新，显示提示 */
@ccclass('ShopPanel')
export class ShopPanel extends MvcComponent<ShopIntents> implements ShopView {
    /** 商品格子预制体，根节点上挂 ShopItemCell */
    @property(Prefab) itemPrefab: Prefab | null = null
    /** ScrollView 的 content 节点 */
    @property(Node) content: Node | null = null
    @property(Node) loadingNode: Node | null = null
    @property(Label) tipLabel: Label | null = null

    private readonly cells: ShopItemCell[] = []
    private readonly handleBuy = (id: number) => this.emit('shopBuy', id)

    onEnable() {
        shopController.attach(this)
    }

    onDisable() {
        shopController.detach(this)
    }

    renderItems(items: readonly ShopItemView[], loading: boolean): void {
        if (this.loadingNode) this.loadingNode.active = loading
        items.forEach((view, index) => this.cellAt(index)?.show(view, this.handleBuy))
        // 多出来的格子隐藏起来留给下次复用
        this.cells.forEach((cell, index) => (cell.node.active = index < items.length))
    }

    showPurchased(item: ShopItem): void {
        if (this.tipLabel) this.tipLabel.string = `购买成功：${item.name}`
    }

    showError(message: string): void {
        if (this.tipLabel) this.tipLabel.string = message
    }

    // ---- 在编辑器里把刷新按钮的点击事件绑到这个方法 ----
    onClickRefresh() {
        this.emit('shopRefresh')
    }

    private cellAt(index: number): ShopItemCell | null {
        if (this.cells[index]) return this.cells[index]
        if (!this.itemPrefab || !this.content) return null
        const node = instantiate(this.itemPrefab)
        node.parent = this.content
        const cell = node.getComponent(ShopItemCell)
        if (!cell) throw new Error('itemPrefab 的根节点上缺少 ShopItemCell 组件')
        this.cells.push(cell)
        return cell
    }
}
