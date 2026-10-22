import { _decorator, Component, Label, Node } from 'cc'
import { CardItemView } from './CardController'

const { ccclass, property } = _decorator

/**
 * 卡牌格子：普通组件，不 attach 到 Controller。
 * 由 CardListPanel 统一 attach 并把数据分发下来，格子可以随 ScrollView 回收复用，不用管注册。
 */
@ccclass('CardItemCell')
export class CardItemCell extends Component {
    @property(Label) nameLabel: Label | null = null
    @property(Label) rarityLabel: Label | null = null
    @property(Label) levelLabel: Label | null = null
    /** 选中高亮框（子节点） */
    @property(Node) selectedNode: Node | null = null

    private cardId = 0
    private onClick: ((id: number) => void) | null = null

    show(view: CardItemView, onClick: (id: number) => void): void {
        const { card } = view
        this.cardId = card.id
        this.onClick = onClick
        if (this.nameLabel) this.nameLabel.string = card.name
        if (this.rarityLabel) this.rarityLabel.string = card.rarity
        if (this.levelLabel) this.levelLabel.string = `Lv.${card.level}`
        if (this.selectedNode) this.selectedNode.active = view.selected
    }

    // ---- 在预制体里把格子按钮的点击事件绑到这个方法 ----
    onClickCard() {
        this.onClick?.(this.cardId)
    }
}
