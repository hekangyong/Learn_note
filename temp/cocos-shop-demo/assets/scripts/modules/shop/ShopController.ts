import { computed, IMvcView, IntentHandlers, MultiController, ReadonlySignal } from '../../framework/index'
import { CoinModel } from '../coin/CoinModel'
import { isSoldOut, ShopItem, ShopModel } from './ShopModel'

/** 意图名加模块前缀：一个组件挂多个 Controller 时意图表会合并，重名会被重复处理 */
export type ShopIntents = {
    shopBuy: [id: number]
    shopRefresh: []
}

/** 列表格子需要的显示数据：商品 + 结合金币算出的按钮状态 */
export interface ShopItemView {
    readonly item: ShopItem
    readonly soldOut: boolean
    readonly affordable: boolean
    readonly buying: boolean
    /** 购买按钮是否可点 */
    readonly canBuy: boolean
}

/** 显示方法全部可选：商城面板实现列表和提示，主界面只实现红点 */
export interface ShopView extends IMvcView<ShopIntents> {
    renderItems?(items: readonly ShopItemView[], loading: boolean): void
    renderBuyableDot?(hasBuyable: boolean): void
    showPurchased?(item: ShopItem): void
    showError?(message: string): void
}

export class ShopController extends MultiController<ShopIntents, ShopView> {
    /** 同时依赖商城和金币两个 Model：任意一个变化都会重新计算 */
    private readonly itemViews: ReadonlySignal<readonly ShopItemView[]>
    /** 列表和 loading 合在一起：加载完成时两者同时变化，只刷新一次 */
    private readonly list: ReadonlySignal<{ items: readonly ShopItemView[]; loading: boolean }>
    private readonly hasBuyable: ReadonlySignal<boolean>

    constructor(
        private readonly shop: ShopModel,
        private readonly coin: CoinModel
    ) {
        super()
        this.itemViews = computed(() => {
            const { items, buyingId } = this.shop.state
            const amount = this.coin.state.amount
            return items.map(item => {
                const soldOut = isSoldOut(item)
                const affordable = amount >= item.price
                const buying = buyingId === item.id
                return { item, soldOut, affordable, buying, canBuy: !soldOut && affordable && buyingId === null }
            })
        })
        this.list = computed(() => ({ items: this.itemViews.value, loading: this.shop.state.loading }))
        this.hasBuyable = computed(() => this.itemViews.value.some(v => !v.soldOut && v.affordable))
    }

    protected intents(): IntentHandlers<ShopIntents> {
        return {
            shopBuy: id => this.buy(id),
            shopRefresh: () => this.shop.load(),
        }
    }

    protected onStart(): void {
        // 列表和红点分开观察：红点只在「有没有可买的」变化时刷新
        this.observe(this.list, () => this.forEachView(v => this.renderItems(v)))
        this.observe(this.hasBuyable, b => this.forEachView(v => v.renderBuyableDot?.(b)))
        this.guard('load', () => this.shop.load())
    }

    /** Model 观察早于 View 出现，新挂上的 View 补一次当前状态 */
    protected override onAttach(view: ShopView): void {
        this.renderItems(view)
        view.renderBuyableDot?.(this.hasBuyable.value)
    }

    protected override onError(error: unknown, context: string): void {
        const message = error instanceof Error ? error.message : String(error)
        this.forEachView(v => v.showError?.(context === 'shopBuy' ? message : `${context} 失败：${message}`))
    }

    /** 跨 Model 的流程放在 Controller：先扣金币，购买失败退回 */
    private async buy(id: number): Promise<void> {
        const item = this.shop.checkBuyable(id)
        this.coin.spend(item.price)
        try {
            await this.shop.buy(id)
        } catch (error) {
            this.coin.add(item.price)
            throw error
        }
        this.forEachView(v => v.showPurchased?.(item))
    }

    private renderItems(view: ShopView): void {
        const { items, loading } = this.list.value
        view.renderItems?.(items, loading)
    }
}
