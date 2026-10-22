import { Model } from '../../framework/index'

export type CardRarity = 'N' | 'R' | 'SR' | 'SSR'

/** 筛选按钮的顺序 */
export const CARD_RARITIES: readonly CardRarity[] = ['N', 'R', 'SR', 'SSR']

export interface Card {
    readonly id: number
    readonly name: string
    readonly rarity: CardRarity
    readonly level: number
    readonly maxLevel: number
    readonly attack: number
    readonly hp: number
    readonly description: string
}

interface CardState {
    readonly cards: readonly Card[]
    readonly loading: boolean
    /** 详情界面显示的卡牌 */
    readonly selectedId: number | null
    /** 正在升级的卡牌，升级请求返回前不能再升（防止连点重复扣金币） */
    readonly upgradingId: number | null
    /** 列表只显示这个稀有度，null 表示全部 */
    readonly rarityFilter: CardRarity | null
}

/** 数据来源抽象：生产环境接 HTTP，测试和联调前用 MockCardRepository */
export interface CardRepository {
    fetchCards(): Promise<Card[]>
    /** 升级一级，返回服务器算好属性的新卡牌 */
    upgrade(id: number): Promise<Card>
}

export class HttpCardRepository implements CardRepository {
    async fetchCards(): Promise<Card[]> {
        throw new Error('TODO: 接入卡牌列表接口')
    }
    async upgrade(_id: number): Promise<Card> {
        throw new Error('TODO: 接入卡牌升级接口')
    }
}

export class MockCardRepository implements CardRepository {
    private readonly rows: Card[] = [
        { id: 1, name: '见习剑士', rarity: 'N', level: 1, maxLevel: 20, attack: 30, hp: 200, description: '刚入门的剑士，胜在勤奋。' },
        { id: 2, name: '森林弓手', rarity: 'R', level: 3, maxLevel: 30, attack: 55, hp: 260, description: '擅长在林间远程狙击。' },
        { id: 3, name: '冰霜法师', rarity: 'SR', level: 1, maxLevel: 40, attack: 90, hp: 320, description: '攻击附带减速效果。' },
        { id: 4, name: '圣骑士', rarity: 'SR', level: 5, maxLevel: 40, attack: 70, hp: 520, description: '为队友提供护盾。' },
        { id: 5, name: '炎龙', rarity: 'SSR', level: 1, maxLevel: 50, attack: 150, hp: 600, description: '传说中的巨龙，吐息可焚尽一切。' },
    ]

    constructor(private readonly latency = 200) {}

    async fetchCards(): Promise<Card[]> {
        await new Promise(resolve => setTimeout(resolve, this.latency))
        return this.rows.map(r => ({ ...r }))
    }

    async upgrade(id: number): Promise<Card> {
        await new Promise(resolve => setTimeout(resolve, this.latency))
        const index = this.rows.findIndex(r => r.id === id)
        if (index < 0) throw new Error(`卡牌 ${id} 不存在`)
        const row = this.rows[index]
        if (isMaxLevel(row)) throw new Error(`「${row.name}」已满级`)
        const upgraded = { ...row, level: row.level + 1, attack: Math.round(row.attack * 1.08), hp: Math.round(row.hp * 1.08) }
        this.rows[index] = upgraded
        return { ...upgraded }
    }
}

const COST_PER_LEVEL: Record<CardRarity, number> = { N: 10, R: 20, SR: 40, SSR: 80 }

/** 升到下一级要花的金币 */
export function upgradeCost(card: Card): number {
    return COST_PER_LEVEL[card.rarity] * card.level
}

export function isMaxLevel(card: Card): boolean {
    return card.level >= card.maxLevel
}

export class CardModel extends Model<CardState> {
    private loadSeq = 0

    constructor(private readonly repo: CardRepository) {
        super({ cards: [], loading: false, selectedId: null, upgradingId: null, rarityFilter: null })
    }

    /** 选中的卡牌；没选或者刷新后不存在了返回 null */
    get selectedCard(): Card | null {
        const { cards, selectedId } = this.state
        return cards.find(c => c.id === selectedId) ?? null
    }

    async load(): Promise<void> {
        const seq = ++this.loadSeq
        this.setState({ loading: true })
        try {
            const cards = await this.repo.fetchCards()
            // 连续刷新时只采用最后一次请求的结果
            if (seq === this.loadSeq) this.setState({ cards, loading: false })
        } catch (error) {
            if (seq === this.loadSeq) this.setState({ loading: false })
            throw error
        }
    }

    selectCard(id: number): void {
        if (!this.state.cards.some(c => c.id === id)) throw new Error(`卡牌 ${id} 不存在`)
        this.setState({ selectedId: id })
    }

    filterByRarity(rarity: CardRarity | null): void {
        this.setState({ rarityFilter: rarity })
    }

    /** 检查卡牌能不能升级（不存在、已满级、正在升级都会抛错），返回卡牌 */
    checkUpgradable(id: number): Card {
        const card = this.state.cards.find(c => c.id === id)
        if (!card) throw new Error(`卡牌 ${id} 不存在`)
        if (isMaxLevel(card)) throw new Error(`「${card.name}」已满级`)
        if (this.state.upgradingId !== null) throw new Error('正在升级，请稍候')
        return card
    }

    /** 向服务器升级并替换为新属性。扣金币由调用方（CardController）负责 */
    async upgrade(id: number): Promise<Card> {
        this.checkUpgradable(id)
        this.setState({ upgradingId: id })
        try {
            const upgraded = await this.repo.upgrade(id)
            this.setState(s => ({
                cards: s.cards.map(c => (c.id === id ? upgraded : c)),
                upgradingId: null,
            }))
            return upgraded
        } catch (error) {
            this.setState({ upgradingId: null })
            throw error
        }
    }
}
