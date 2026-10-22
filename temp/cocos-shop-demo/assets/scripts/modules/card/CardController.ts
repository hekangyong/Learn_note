import { computed, IMvcView, IntentHandlers, MultiController, ReadonlySignal } from '../../framework/index'
import { CoinModel } from '../coin/CoinModel'
import { Card, CardModel, CardRarity, isMaxLevel, upgradeCost } from './CardModel'

/** 意图名加模块前缀：一个组件挂多个 Controller 时意图表会合并，重名会被重复处理 */
export type CardIntents = {
    cardSelect: [id: number]
    cardFilter: [rarity: CardRarity | null]
    cardRefresh: []
    cardUpgrade: [id: number]
}

/** 列表格子需要的显示数据 */
export interface CardItemView {
    readonly card: Card
    readonly selected: boolean
}

/** 详情界面需要的显示数据：卡牌 + 结合金币算出的升级按钮状态 */
export interface CardDetailView {
    readonly card: Card
    readonly maxLevel: boolean
    /** 满级时为 0 */
    readonly cost: number
    readonly affordable: boolean
    readonly upgrading: boolean
    /** 升级按钮是否可点 */
    readonly canUpgrade: boolean
}

/** 显示方法全部可选：列表面板实现 renderList，详情面板实现 renderDetail 和提示 */
export interface CardView extends IMvcView<CardIntents> {
    renderList?(items: readonly CardItemView[], loading: boolean, filter: CardRarity | null): void
    /** 没有选中卡牌（或选中的卡刷新后不存在了）时为 null */
    renderDetail?(detail: CardDetailView | null): void
    showUpgraded?(card: Card): void
    showError?(message: string): void
}

export class CardController extends MultiController<CardIntents, CardView> {
    /** 列表、loading、筛选合在一起：加载完成时同时变化，只刷新一次 */
    private readonly list: ReadonlySignal<{
        items: readonly CardItemView[]
        loading: boolean
        filter: CardRarity | null
    }>
    /** 同时依赖卡牌和金币两个 Model：任意一个变化都会重新计算 */
    private readonly detail: ReadonlySignal<CardDetailView | null>

    constructor(
        private readonly card: CardModel,
        private readonly coin: CoinModel
    ) {
        super()
        this.list = computed(() => {
            const { cards, loading, selectedId, rarityFilter } = this.card.state
            const items = cards
                .filter(card => rarityFilter === null || card.rarity === rarityFilter)
                .map(card => ({ card, selected: card.id === selectedId }))
            return { items, loading, filter: rarityFilter }
        })
        this.detail = computed(() => {
            const card = this.card.selectedCard
            if (!card) return null
            const maxLevel = isMaxLevel(card)
            const cost = maxLevel ? 0 : upgradeCost(card)
            const affordable = this.coin.state.amount >= cost
            const { upgradingId } = this.card.state
            const upgrading = upgradingId === card.id
            return { card, maxLevel, cost, affordable, upgrading, canUpgrade: !maxLevel && affordable && upgradingId === null }
        })
    }

    protected intents(): IntentHandlers<CardIntents> {
        return {
            cardSelect: id => this.card.selectCard(id),
            cardFilter: rarity => this.card.filterByRarity(rarity),
            cardRefresh: () => this.card.load(),
            cardUpgrade: id => this.upgrade(id),
        }
    }

    protected onStart(): void {
        // 列表和详情分开观察：金币变化、升级中只刷新详情，不重建整张列表
        this.observe(this.list, () => this.forEachView(v => this.renderList(v)))
        this.observe(this.detail, d => this.forEachView(v => v.renderDetail?.(d)))
        this.guard('load', () => this.card.load())
    }

    /** Model 观察早于 View 出现，新挂上的 View 补一次当前状态 */
    protected override onAttach(view: CardView): void {
        this.renderList(view)
        view.renderDetail?.(this.detail.value)
    }

    protected override onError(error: unknown, context: string): void {
        const message = error instanceof Error ? error.message : String(error)
        this.forEachView(v => v.showError?.(context === 'cardUpgrade' ? message : `${context} 失败：${message}`))
    }

    /** 跨 Model 的流程放在 Controller：先扣金币，升级失败退回 */
    private async upgrade(id: number): Promise<void> {
        const cost = upgradeCost(this.card.checkUpgradable(id))
        this.coin.spend(cost)
        let upgraded: Card
        try {
            upgraded = await this.card.upgrade(id)
        } catch (error) {
            this.coin.add(cost)
            throw error
        }
        this.forEachView(v => v.showUpgraded?.(upgraded))
    }

    private renderList(view: CardView): void {
        const { items, loading, filter } = this.list.value
        view.renderList?.(items, loading, filter)
    }
}
