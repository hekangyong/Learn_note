/**
 * 弹窗管理系统演示：MVC 与 MVVM 两种架构共存
 *
 * 兼容的关键：
 *   1. 弹窗管理器只依赖 PopupComponent 接口（onShow/onHide/onDispose），不关心 UI 用什么架构写；
 *   2. MvcPopup、MvvmPopup 是两个「适配器」基类，各自把这套生命周期转换成自己的模式；
 *   3. Model 层（PlayerModel）两种架构共用：MVC 的 Controller 订阅它手动刷新 View，
 *      MVVM 的 ViewModel 用 Computed 依赖它自动刷新；
 *   4. 注册方式完全相同：都是 @PopupWindow；业务代码完全相同：都是 popup.open(type, data)。
 *
 *   ┌─────────── 业务代码：popup.open('Reward' | 'Shop', data) ───────────┐
 *   │                     PopupSystem（优先级/新手/去重）                   │
 *   │                         PopupComponent 接口                          │
 *   │          ┌────────────────────┴────────────────────┐                │
 *   │      MvcPopup                                  MvvmPopup            │
 *   │   Controller ─命令式调用─> View          ViewModel <─绑定─ View      │
 *   │          └──────────────> PlayerModel（共享）<─────┘                │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * 运行：npx tsc && node dist/Popup/archDemo.js
 */
import { Command, Computed, Observable } from './arch/Observable'
import { MvcPopup, MvcView } from './arch/MvcPopup'
import { MvvmPopup, MvvmView, PopupViewModel } from './arch/MvvmPopup'
import { popup, PopupDataMap, PopupPriority, popupView, PopupWindow } from './PopupManager'

type RewardData = PopupDataMap['Reward']
type ShopData = PopupDataMap['Shop']

/** 道具 id 为 1 表示金币 */
const GOLD_ID = 1

/** 模拟屏幕：记录当前显示的 View，演示中用它模拟玩家点击 */
const screen: { reward: RewardView | null; shop: ShopView | null } = { reward: null, shop: null }

// ============================================================
// Model：两种架构共享，与任何界面无关
// ============================================================
class PlayerModel {
    /** 金币用 Observable：MVC 和 MVVM 都可以订阅它的变化 */
    readonly gold = new Observable(100)
    private readonly bag = new Map<number, number>()

    addItem(itemId: number, count: number): void {
        if (itemId === GOLD_ID) this.gold.value += count
        else this.bag.set(itemId, this.itemCount(itemId) + count)
    }

    /** 购买：金币不足返回 false。业务规则放在 Model 中，不放在 Controller/ViewModel 里 */
    buy(itemId: number, count: number, price: number): boolean {
        const cost = count * price
        if (this.gold.value < cost) return false
        this.gold.value -= cost
        this.addItem(itemId, count)
        return true
    }

    itemCount(itemId: number): number {
        return this.bag.get(itemId) ?? 0
    }
}

const player = new PlayerModel()

// ============================================================
// MVC：奖励弹窗
// ============================================================

/** View：只负责显示，用户操作通过事件转发给 Controller */
class RewardView implements MvcView {
    /** 「领取」按钮点击事件，由 Controller 赋值 */
    onClaim: () => void = () => {}

    render(text: string, gold: number): void {
        console.log(`  [MVC View] ${text}（当前金币 ${gold}）`)
    }
    show(): void {
        screen.reward = this
        console.log('  [MVC View] 显示')
    }
    hide(): void {
        console.log('  [MVC View] 隐藏')
    }
    destroy(): void {
        screen.reward = null
        console.log('  [MVC View] 销毁')
    }

    /** 模拟玩家点击「领取」 */
    clickClaim(): void {
        this.onClaim()
    }
}

/** Controller：接收操作 -> 修改 Model -> 主动刷新 View */
@PopupWindow('Reward', { priority: PopupPriority.Reward })
class RewardPopup extends MvcPopup<RewardData, RewardView> {
    protected createView(): RewardView {
        return new RewardView()
    }

    protected onCreate(): void {
        this.view.onClaim = () => this.claim()
        // 订阅 Model：金币变化时由 Controller 主动刷新 View（弹窗结束时自动取消订阅）
        this.disposables.add(player.gold.subscribe(() => this.render(), false))
    }

    protected render(): void {
        const name = this.data.itemId === GOLD_ID ? '金币' : `道具 ${this.data.itemId}`
        this.view.render(`获得 ${name} x${this.data.count}`, player.gold.value)
    }

    private claim(): void {
        player.addItem(this.data.itemId, this.data.count)
        this.close('claimed')
    }
}

// ============================================================
// MVVM：商店弹窗
// ============================================================

/** ViewModel：只有状态和命令，不引用 View，可以脱离 UI 单独测试 */
class ShopViewModel extends PopupViewModel<ShopData> {
    readonly title = new Observable('')
    readonly count = new Observable(1)
    totalPrice!: Computed<number>
    canBuy!: Computed<boolean>
    increase!: Command
    decrease!: Command
    buy!: Command

    /** Model 通过构造函数注入：测试时可以传入假的 Model */
    constructor(private readonly model: PlayerModel) {
        super()
    }

    protected onInit(data: ShopData): void {
        this.title.value = `购买道具 ${data.itemId}（单价 ${data.price}）`
        this.totalPrice = this.track(new Computed([this.count], () => this.count.value * data.price))
        // 同时依赖 ViewModel 自己的状态和共享的 Model：任意一个变化都会重新计算
        this.canBuy = this.track(
            new Computed([this.totalPrice, this.model.gold], () => this.model.gold.value >= this.totalPrice.value)
        )
        const canDecrease = this.track(new Computed([this.count], () => this.count.value > 1))

        this.increase = new Command(() => this.count.value++)
        this.decrease = new Command(() => this.count.value--, canDecrease)
        this.buy = new Command(() => {
            if (this.model.buy(data.itemId, this.count.value, data.price)) this.close('bought')
        }, this.canBuy)
    }
}

/** View：只做绑定，不写任何「什么时候刷新」的逻辑 */
class ShopView extends MvvmView<ShopViewModel> {
    private vm!: ShopViewModel

    bind(vm: ShopViewModel): void {
        this.vm = vm
        this.bindValue(vm.title, v => console.log(`  [MVVM View] 标题 = ${v}`))
        this.bindValue(vm.count, v => console.log(`  [MVVM View] 数量 = ${v}`))
        this.bindValue(vm.totalPrice, v => console.log(`  [MVVM View] 总价 = ${v}`))
        this.bindCommand(vm.buy, enabled =>
            console.log(`  [MVVM View] 购买按钮 = ${enabled ? '可点击' : '置灰'}`)
        )
    }
    show(): void {
        screen.shop = this
        console.log('  [MVVM View] 显示')
    }
    hide(): void {
        console.log('  [MVVM View] 隐藏')
    }
    override destroy(): void {
        super.destroy() // 解除所有绑定
        screen.shop = null
        console.log('  [MVVM View] 销毁')
    }

    // 模拟玩家点击：View 只把操作转发给 Command
    clickPlus(): void {
        this.vm.increase.execute()
    }
    clickBuy(): void {
        if (!this.vm.buy.execute()) console.log('  [MVVM View] 按钮置灰，点击无效')
    }
}

/** 组装：注册方式与 MVC 弹窗完全相同 */
@PopupWindow('Shop', { priority: PopupPriority.Shop })
class ShopPopup extends MvvmPopup<ShopData, ShopViewModel, ShopView> {
    protected createViewModel(): ShopViewModel {
        return new ShopViewModel(player)
    }
    protected createView(): ShopView {
        return new ShopView()
    }
}

// 类只需要被定义就会完成注册；这里引用一下，避免「声明了但未使用」的提示
void [RewardPopup, ShopPopup]

// ============================================================
// 演示
// ============================================================
popup.setView(popupView)

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

async function demo() {
    console.log('1. 业务代码对两种架构完全一样：同时 open，按优先级先弹奖励（MVC）')
    const reward = popup.open('Reward', { itemId: GOLD_ID, count: 20 })
    const shop = popup.open('Shop', { itemId: 7, price: 30 })
    await tick()

    console.log('2. MVC：点击领取 -> Controller 修改 Model -> 订阅触发 Controller 刷新 View -> 关闭')
    screen.reward!.clickClaim()
    if (reward.ok) console.log(`  奖励结果：${String((await reward.closed).result)}`)
    await tick()

    console.log('3. MVVM：点击 + -> ViewModel 修改状态 -> 绑定自动刷新 View')
    const shopView = screen.shop!
    shopView.clickPlus()
    shopView.clickPlus()
    shopView.clickPlus()
    shopView.clickPlus() // 5 x 30 = 150 > 120，购买按钮置灰
    shopView.clickBuy()

    console.log('4. 共享 Model：服务器推送金币 +50，MVVM 自动重新计算（已关闭的 MVC 弹窗不再刷新）')
    player.gold.value += 50
    shopView.clickBuy()
    if (shop.ok) console.log(`  商店结果：${String((await shop.closed).result)}`)
    console.log(`  剩余金币 ${player.gold.value}，道具 7 数量 ${player.itemCount(7)}`)
}

demo()
