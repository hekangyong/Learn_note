import { Model } from '../../framework/index'

export interface ShopItem {
    readonly id: number
    readonly name: string
    readonly price: number
    /** 限购次数 */
    readonly limit: number
    /** 已购次数 */
    readonly bought: number
}

interface ShopState {
    readonly items: readonly ShopItem[]
    readonly loading: boolean
    /** 正在购买的商品，购买请求返回前不能再买（防止连点超出限购） */
    readonly buyingId: number | null
}

/** 数据来源抽象：生产环境接 HTTP，测试和联调前用 MockShopRepository */
export interface ShopRepository {
    fetchItems(): Promise<ShopItem[]>
    purchase(id: number): Promise<void>
}

export class HttpShopRepository implements ShopRepository {
    async fetchItems(): Promise<ShopItem[]> {
        throw new Error('TODO: 接入商城接口')
    }
    async purchase(_id: number): Promise<void> {
        throw new Error('TODO: 接入购买接口')
    }
}

export class MockShopRepository implements ShopRepository {
    private readonly rows: ShopItem[] = [
        { id: 1, name: '体力药水', price: 50, limit: 5, bought: 0 },
        { id: 2, name: '经验书', price: 120, limit: 3, bought: 0 },
        { id: 3, name: '稀有宝箱', price: 800, limit: 1, bought: 0 },
    ]

    constructor(private readonly latency = 200) {}

    async fetchItems(): Promise<ShopItem[]> {
        await new Promise(resolve => setTimeout(resolve, this.latency))
        return this.rows.map(r => ({ ...r }))
    }

    async purchase(id: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, this.latency))
        const row = this.rows.find(r => r.id === id)
        if (!row) throw new Error(`商品 ${id} 不存在`)
        this.rows[this.rows.indexOf(row)] = { ...row, bought: row.bought + 1 }
    }
}

export function isSoldOut(item: ShopItem): boolean {
    return item.bought >= item.limit
}

export class ShopModel extends Model<ShopState> {
    private loadSeq = 0

    constructor(private readonly repo: ShopRepository) {
        super({ items: [], loading: false, buyingId: null })
    }

    async load(): Promise<void> {
        const seq = ++this.loadSeq
        this.setState({ loading: true })
        try {
            const items = await this.repo.fetchItems()
            // 连续刷新时只采用最后一次请求的结果
            if (seq === this.loadSeq) this.setState({ items, loading: false })
        } catch (error) {
            if (seq === this.loadSeq) this.setState({ loading: false })
            throw error
        }
    }

    /** 检查商品能不能买（不存在、已售罄、正在购买都会抛错），返回商品 */
    checkBuyable(id: number): ShopItem {
        const item = this.state.items.find(i => i.id === id)
        if (!item) throw new Error(`商品 ${id} 不存在`)
        if (isSoldOut(item)) throw new Error(`「${item.name}」已售罄`)
        if (this.state.buyingId !== null) throw new Error('正在购买，请稍候')
        return item
    }

    /** 向服务器购买并记录已购次数。扣金币由调用方（ShopController）负责 */
    async buy(id: number): Promise<ShopItem> {
        const item = this.checkBuyable(id)
        this.setState({ buyingId: id })
        try {
            await this.repo.purchase(id)
            this.setState(s => ({
                items: s.items.map(i => (i.id === id ? { ...i, bought: i.bought + 1 } : i)),
                buyingId: null,
            }))
            return item
        } catch (error) {
            this.setState({ buyingId: null })
            throw error
        }
    }
}
