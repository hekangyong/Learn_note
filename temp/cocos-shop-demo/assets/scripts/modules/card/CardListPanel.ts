import { _decorator, instantiate, Label, Node, Prefab } from 'cc'
import { MvcComponent } from '../../MvcComponent'
import { cardController } from '../../MvcRegistry'
import { CardIntents, CardItemView, CardView } from './CardController'
import { CardItemCell } from './CardItemCell'
import { CARD_RARITIES, CardRarity } from './CardModel'

const { ccclass, property } = _decorator

/** 卡牌列表面板：显示卡牌列表，按稀有度筛选，点击格子打开详情 */
@ccclass('CardListPanel')
export class CardListPanel extends MvcComponent<CardIntents> implements CardView {
    /** 卡牌格子预制体，根节点上挂 CardItemCell */
    @property(Prefab) itemPrefab: Prefab | null = null
    /** ScrollView 的 content 节点 */
    @property(Node) content: Node | null = null
    @property(Node) loadingNode: Node | null = null
    /** 显示当前筛选，例如「全部」「SSR」 */
    @property(Label) filterLabel: Label | null = null
    @property(Label) tipLabel: Label | null = null
    /** 详情界面的节点（挂 CardDetailPanel），点击格子时激活 */
    @property(Node) detailNode: Node | null = null

    private readonly cells: CardItemCell[] = []
    private readonly handleClickCard = (id: number) => {
        // 先选中再打开：详情面板 onEnable 时 attach，直接拿到选中的卡
        this.emit('cardSelect', id)
        if (this.detailNode) this.detailNode.active = true
    }

    onEnable() {
        cardController.attach(this)
    }

    onDisable() {
        cardController.detach(this)
    }

    renderList(items: readonly CardItemView[], loading: boolean, filter: CardRarity | null): void {
        if (this.loadingNode) this.loadingNode.active = loading
        if (this.filterLabel) this.filterLabel.string = filter ?? '全部'
        items.forEach((view, index) => this.cellAt(index)?.show(view, this.handleClickCard))
        // 多出来的格子隐藏起来留给下次复用
        this.cells.forEach((cell, index) => (cell.node.active = index < items.length))
    }

    showError(message: string): void {
        if (this.tipLabel) this.tipLabel.string = message
    }

    // ---- 在编辑器里把按钮的点击事件绑到下面的方法 ----

    /** 筛选按钮：CustomEventData 填 N / R / SR / SSR，「全部」按钮留空 */
    onClickFilter(_event: unknown, rarity: string) {
        const value = CARD_RARITIES.find(r => r === rarity) ?? null
        this.emit('cardFilter', value)
    }

    onClickRefresh() {
        this.emit('cardRefresh')
    }

    private cellAt(index: number): CardItemCell | null {
        if (this.cells[index]) return this.cells[index]
        if (!this.itemPrefab || !this.content) return null
        const node = instantiate(this.itemPrefab)
        node.parent = this.content
        const cell = node.getComponent(CardItemCell)
        if (!cell) throw new Error('itemPrefab 的根节点上缺少 CardItemCell 组件')
        this.cells.push(cell)
        return cell
    }
}
