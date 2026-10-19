/**
 * 弹窗管理系统演示：MVC 与 MVVM 两种架构共存（基于 MVVM_MVC 框架）
 *
 * 兼容的关键：
 *   1. 弹窗管理器只依赖 PopupComponent 接口（onShow/onHide/onDispose），不关心 UI 用什么架构写；
 *   2. MvcPopup、MvvmPopup 是两个「适配器」基类，把这套生命周期接到框架的 Controller / ViewModel 上；
 *   3. Model 层（PlayerModel，继承框架的 Model）两种架构共用：MVC 的 Controller observe 它手动刷新 View，
 *      MVVM 的 ViewModel 在 computed 中直接读取它，依赖自动建立；
 *   4. 注册方式完全相同：都是 @PopupWindow；业务代码完全相同：都是 popup.open(type, data)。
 *
 *   ┌─────────── 业务代码：popup.open('Reward' | 'Shop', data) ───────────┐
 *   │                     PopupSystem（优先级/新手/去重）                   │
 *   │                         PopupComponent 接口                          │
 *   │          ┌────────────────────┴────────────────────┐                │
 *   │   MvcPopup（Controller）                    MvvmPopup               │
 *   │   Controller ─命令式调用─> View          ViewModel <─绑定─ View      │
 *   │          └──────────────> PlayerModel（共享）<─────┘                │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * 运行：tsc && node dist/Framework/Popup/archDemo.js
 */
import { AsyncCommand, Command, computed, Model, MvcView, MvvmView, ReadonlySignal, signal } from '../MVVM_MVC'
import { MvcPopup } from './arch/MvcPopup'
import { MvvmPopup, PopupViewModel } from './arch/MvvmPopup'
import { popup, PopupDataMap, PopupPriority, popupView, PopupWindow } from './PopupManager'

type RewardData = PopupDataMap['Reward']
type ShopData = PopupDataMap['Shop']

/** 道具 id 为 1 表示金币 */
const GOLD_ID = 1

/** 模拟屏幕：记录当前显示的 View，演示中用它模拟玩家点击 */
const screen: { reward: RewardView | null; shop: ShopView | null } = { reward: null, shop: null }

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============================================================
// Model：两种架构共享，与任何界面无关
// ============================================================

interface PlayerState {
    readonly gold: number
    readonly bag: Readonly<Record<number, number>>
}

class PlayerModel extends Model<PlayerState> {
    /** 金币：只在金币变化时通知，背包变化不会触发 */
    readonly gold = this.select(s => s.gold)

    constructor() {
        super({ gold: 100, bag: {} })
    }

    addItem(itemId: number, count: number): void {
        if (itemId === GOLD_ID) this.setState(s => ({ gold: s.gold + count }))
        else this.setState(s => ({ bag: { ...s.bag, [itemId]: (s.bag[itemId] ?? 0) + count } }))
    }

    /**
     * 购买：模拟向服务器请求，金币不足时抛错。
     * 业务规则放在 Model 中，不放在 Controller / ViewModel 里。
     */
    async buy(itemId: number, count: number, price: number): Promise<void> {
        const cost = count * price
        if (this.state.gold < cost) throw new Error('金币不足')
        await delay(10)
        // 金币和道具在一次 setState 中修改，界面不会看到「扣了钱还没到账」的中间状态
        this.setState(s => ({ gold: s.gold - cost, bag: { ...s.bag, [itemId]: (s.bag[itemId] ?? 0) + count } }))
    }

    itemCount(itemId: number): number {
        return this.state.bag[itemId] ?? 0
    }
}

const player = new PlayerModel()

// ============================================================
// MVC：奖励弹窗
// ============================================================

/** View：只负责显示，用户操作作为意图发给 Controller */
class RewardView extends MvcView<{ claim: [] }> {
    render(text: string, gold: number): void {
        console.log(`  [MVC View] ${text}（当前金币 ${gold}）`)
    }

    protected override onMount(): void {
        screen.reward = this
        console.log('  [MVC View] 显示')
    }
    protected override onUnmount(): void {
        if (screen.reward === this) screen.reward = null
        console.log('  [MVC View] 隐藏')
    }
    protected override onDispose(): void {
        console.log('  [MVC View] 销毁')
    }

    /** 模拟玩家点击「领取」 */
    clickClaim(): void {
        this.emit('claim')
    }
}

/** Controller：意图 -> 修改 Model；Model 变化 -> 主动刷新 View */
@PopupWindow('Reward', { priority: PopupPriority.Reward })
class RewardPopup extends MvcPopup<RewardData, RewardView> {
    constructor() {
        super(new RewardView())
    }

    protected onStart(): void {
        this.listen('claim', () => {
            player.addItem(this.data.itemId, this.data.count)
            this.close('claimed')
        })
        // 金币变化时主动刷新 View；隐藏 / 关闭时自动取消，恢复显示时立即按最新数据刷新
        this.observe(player.gold, () => this.render(), { immediate: true })
    }

    private render(): void {
        const name = this.data.itemId === GOLD_ID ? '金币' : `道具 ${this.data.itemId}`
        this.view.render(`获得 ${name} x${this.data.count}`, player.state.gold)
    }
}

// ============================================================
// MVVM：商店弹窗
// ============================================================

/** ViewModel：只有状态和命令，不引用 View，可以脱离 UI 单独测试 */
class ShopViewModel extends PopupViewModel<ShopData> {
    readonly count = signal(1)
    title!: ReadonlySignal<string>
    totalPrice!: ReadonlySignal<number>
    canAfford!: ReadonlySignal<boolean>
    increase!: Command
    decrease!: Command
    buy!: AsyncCommand

    /** Model 通过构造函数注入：测试时可以传入假的 Model */
    constructor(private readonly model: PlayerModel) {
        super()
    }

    protected onInit(data: ShopData): void {
        this.title = computed(() => `购买道具 ${data.itemId}（单价 ${data.price}，已拥有 ${this.model.itemCount(data.itemId)}）`)
        this.totalPrice = computed(() => this.count.value * data.price)
        // 同时依赖 ViewModel 自己的状态和共享的 Model，依赖自动收集，任意一个变化都会重新计算
        this.canAfford = computed(() => this.model.gold.value >= this.totalPrice.value)

        this.increase = this.command(() => this.count.update(n => n + 1))
        this.decrease = this.command(() => this.count.update(n => n - 1), { canExecute: () => this.count.value > 1 })
        // 默认 drop 策略：请求进行中按钮自动置灰，重复点击被忽略
        this.buy = this.asyncCommand(
            async () => {
                await this.model.buy(data.itemId, this.count.peek(), data.price)
                this.close('bought')
            },
            { canExecute: this.canAfford }
        )
    }
}

/** View：只做绑定，不写任何「什么时候刷新」的逻辑 */
class ShopView extends MvvmView<ShopViewModel> {
    protected onBind(vm: ShopViewModel): void {
        screen.shop = this
        console.log('  [MVVM View] 显示')
        this.bind(vm.title, v => console.log(`  [MVVM View] 标题 = ${v}`))
        this.bind(vm.count, v => console.log(`  [MVVM View] 数量 = ${v}`))
        this.bind(vm.totalPrice, v => console.log(`  [MVVM View] 总价 = ${v}`))
        this.bindCommand(vm.buy, enabled => console.log(`  [MVVM View] 购买按钮 = ${enabled ? '可点击' : '置灰'}`))
        this.bind(vm.buy.isRunning, running => running && console.log('  [MVVM View] 请求中…'))
    }

    protected override onUnbind(): void {
        if (screen.shop === this) screen.shop = null
        console.log('  [MVVM View] 隐藏')
    }

    protected override onDispose(): void {
        console.log('  [MVVM View] 销毁')
    }

    // 模拟玩家点击：View 只把操作转发给 Command
    clickPlus(): void {
        this.vm.increase.execute()
    }
    clickBuy() {
        return this.vm.buy.execute().then(result => {
            if (!result.ok && result.reason === 'disabled') console.log('  [MVVM View] 按钮置灰，点击无效')
            return result
        })
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

    console.log('2. MVC：点击领取 -> Controller 修改 Model -> observe 触发 Controller 刷新 View -> 关闭')
    screen.reward!.clickClaim()
    if (reward.ok) console.log(`  奖励结果：${String((await reward.closed).result)}`)
    await tick()

    console.log('3. MVVM：点击 + -> ViewModel 修改状态 -> 绑定自动刷新 View')
    const shopView = screen.shop!
    shopView.clickPlus()
    shopView.clickPlus()
    shopView.clickPlus()
    shopView.clickPlus() // 5 x 30 = 150 > 120，购买按钮置灰
    await shopView.clickBuy()

    console.log('4. 共享 Model：服务器推送金币 +50，MVVM 自动重新计算（已关闭的 MVC 弹窗不再刷新）')
    player.addItem(GOLD_ID, 50)

    console.log('5. 连点两次购买：第一次发出请求，第二次因请求进行中被忽略')
    const first = shopView.clickBuy()
    await shopView.clickBuy()
    await first
    if (shop.ok) console.log(`  商店结果：${String((await shop.closed).result)}`)
    console.log(`  剩余金币 ${player.state.gold}，道具 7 数量 ${player.itemCount(7)}`)
}

demo()
