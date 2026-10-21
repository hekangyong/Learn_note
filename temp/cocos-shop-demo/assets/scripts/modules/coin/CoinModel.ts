import { Model } from '../../framework/index'

interface CoinState {
    readonly amount: number
    readonly dailyClaimed: boolean
}

export class CoinModel extends Model<CoinState> {
    constructor(initial = 0) {
        super({ amount: initial, dailyClaimed: false })
    }

    add(amount: number): void {
        if (amount <= 0) throw new Error('增加的金币必须大于 0')
        this.setState(s => ({ amount: s.amount + amount }))
    }

    /** 金币不足时抛错，不会扣成负数 */
    spend(amount: number): void {
        if (amount <= 0) throw new Error('扣除的金币必须大于 0')
        if (this.state.amount < amount) throw new Error('金币不足')
        this.setState(s => ({ amount: s.amount - amount }))
    }

    claimDaily(): void {
        if (this.state.dailyClaimed) throw new Error('今日已领取')
        this.setState(s => ({ amount: s.amount + 100, dailyClaimed: true }))
    }
}
