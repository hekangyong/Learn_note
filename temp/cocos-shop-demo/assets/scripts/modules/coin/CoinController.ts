import { IMvcView, IntentHandlers, MultiController } from '../../framework/index'
import { CoinModel } from './CoinModel'

export type CoinIntents = {
    coinClaimDaily: []
}

export interface CoinView extends IMvcView<CoinIntents> {
    renderCoin?(amount: number): void
    renderDailyClaimed?(claimed: boolean): void
}

export class CoinController extends MultiController<CoinIntents, CoinView> {
    constructor(private readonly coin: CoinModel) {
        super()
    }

    protected intents(): IntentHandlers<CoinIntents> {
        return {
            coinClaimDaily: () => this.coin.claimDaily(),
        }
    }

    protected onStart(): void {
        this.observe(this.coin.select(s => s.amount), n => this.forEachView(v => v.renderCoin?.(n)))
        this.observe(this.coin.select(s => s.dailyClaimed), c => this.forEachView(v => v.renderDailyClaimed?.(c)))
    }

    protected override onAttach(view: CoinView): void {
        view.renderCoin?.(this.coin.state.amount)
        view.renderDailyClaimed?.(this.coin.state.dailyClaimed)
    }
}
