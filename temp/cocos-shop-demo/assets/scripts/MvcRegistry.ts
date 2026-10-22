/**
 * 所有 Model 和 Controller 在这里创建，全项目只有这一处。组件只从这里导入单例。
 */
import { systemClock } from './common/Clock'
import { CardController } from './modules/card/CardController'
import { CardModel, MockCardRepository } from './modules/card/CardModel'
import { CoinController } from './modules/coin/CoinController'
import { CoinModel } from './modules/coin/CoinModel'
import { DailyTaskController } from './modules/dailyTask/DailyTaskController'
import { DailyTaskModel } from './modules/dailyTask/DailyTaskModel'
import { MockDailyTaskApi } from './modules/dailyTask/MockDailyTaskApi'
import { ShopController } from './modules/shop/ShopController'
import { MockShopRepository, ShopModel } from './modules/shop/ShopModel'

// ---- 数据源（接口联调后换成 HttpShopRepository / HttpDailyTaskApi / HttpCardRepository）----
/** 导出是为了调试：可以在调试按钮里调用 simulateProgress / simulateDailyReset */
export const dailyTaskApi = new MockDailyTaskApi(systemClock)

// ---- Model（先于依赖它的 Controller 创建）----
export const coinModel = new CoinModel(500)
export const shopModel = new ShopModel(new MockShopRepository())
export const dailyTaskModel = new DailyTaskModel(dailyTaskApi, coinModel)
export const cardModel = new CardModel(new MockCardRepository())

// ---- Controller ----
export const coinController = new CoinController(coinModel)
export const shopController = new ShopController(shopModel, coinModel)
export const dailyTaskController = new DailyTaskController(dailyTaskModel, systemClock)
export const cardController = new CardController(cardModel, coinModel)

let booted = false

/** 游戏启动时调用一次。组件可以在这之前 attach，Model 观察在 start 后开始 */
export function bootstrapMvc(): void {
    if (booted) return
    booted = true
    coinController.start()
    shopController.start()
    dailyTaskController.start()
    cardController.start()
}
