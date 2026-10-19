/**
 * 红点系统接入 MVVM_MVC 框架的演示
 *
 *   MailModel / BagModel ──syncRedDot / syncRedDotMap──▶ redDot ──redDotSignal──▶ MVVM 主界面 / MVC 邮件页签
 *
 * 演示要点：
 *   1. 写入桥：业务代码只改 Model，红点自动跟着变，不再手动调用 redDot.set；
 *   2. 高频写入仍由红点系统合并：收 1000 封邮件，UI 只刷新一次；
 *   3. 读取桥：红点变成 signal 后可以和其他状态组合（战斗中隐藏主界面红点）；
 *   4. 生命周期：红点监听登记在 ViewModel / Controller 上，界面结束时自动取消。
 *
 * 运行：tsc && node dist/Framework/RedDot/bridgeDemo.js
 */
import { computed, Controller, Model, MvcView, MvvmView, ReadonlySignal, ViewModel } from '../MVVM_MVC'
import { redDot, RedDotPath } from './RedDotManager'
import { redDotSignal, syncRedDot, syncRedDotMap } from './RedDotSignal'

// ============================================================
// Model：只管业务数据，不知道红点的存在
// ============================================================

interface Mail {
    readonly id: number
    readonly kind: 'system' | 'friend'
    readonly read: boolean
}

class MailModel extends Model<{ mails: readonly Mail[] }> {
    private nextId = 1

    constructor() {
        super({ mails: [] })
    }

    receive(kind: Mail['kind']): void {
        const mail = { id: this.nextId++, kind, read: false }
        this.setState(s => ({ mails: [...s.mails, mail] }))
    }

    readAll(): void {
        this.setState(s => ({ mails: s.mails.map(m => (m.read ? m : { ...m, read: true })) }))
    }

    unread(kind: Mail['kind']): number {
        return this.state.mails.filter(m => m.kind === kind && !m.read).length
    }
}

class BagModel extends Model<{ newItems: Readonly<Record<number, number>> }> {
    constructor() {
        super({ newItems: {} })
    }

    /** 获得道具：标记为新道具 */
    obtain(itemId: number): void {
        this.setState(s => ({ newItems: { ...s.newItems, [itemId]: 1 } }))
    }

    /** 查看道具：不再是新道具 */
    view(itemId: number): void {
        this.setState(s => {
            const { [itemId]: _, ...rest } = s.newItems
            return { newItems: rest }
        })
    }
}

class GameModel extends Model<{ inBattle: boolean }> {
    constructor() {
        super({ inBattle: false })
    }

    setBattle(inBattle: boolean): void {
        this.setState({ inBattle })
    }
}

const mail = new MailModel()
const bag = new BagModel()
const game = new GameModel()

// ============================================================
// 写入桥：应用启动时建立一次，Model -> 红点
// ============================================================

const bridges = [
    syncRedDot(redDot, RedDotPath.MailSystem, () => mail.unread('system')),
    syncRedDot(redDot, RedDotPath.MailFriend, () => mail.unread('friend')),
    syncRedDotMap(redDot, RedDotPath.BagItem, () => bag.state.newItems),
]

// ============================================================
// MVVM：主界面按钮
// ============================================================

class MainMenuViewModel extends ViewModel {
    readonly count: ReadonlySignal<number>
    /** 红点和其他状态组合：战斗中不显示主界面红点 */
    readonly showBadge: ReadonlySignal<boolean>
    readonly badgeText: ReadonlySignal<string>

    constructor(game: GameModel) {
        super()
        // 登记到 ViewModel：dispose 时自动取消对红点系统的监听
        this.count = this.addDisposable(redDotSignal(redDot, RedDotPath.Main))
        this.showBadge = computed(() => this.count.value > 0 && !game.state.inBattle)
        this.badgeText = computed(() => (this.count.value > 99 ? '99+' : String(this.count.value)))
    }
}

class MainMenuView extends MvvmView<MainMenuViewModel> {
    renders = 0

    protected onBind(vm: MainMenuViewModel): void {
        this.bindEffect(() => {
            this.renders++
            const text = vm.showBadge.value ? `显示 ${vm.badgeText.value}` : '隐藏'
            console.log(`  [MVVM 主界面] 红点 ${text}`)
        })
    }
}

// ============================================================
// MVC：邮件页签
// ============================================================

class MailTabView extends MvcView<{ readAll: [] }> {
    renders = 0

    renderBadge(count: number): void {
        this.renders++
        console.log(`  [MVC 邮件页签] 红点 ${count > 0 ? count : '隐藏'}`)
    }

    /** 模拟点击「全部已读」 */
    clickReadAll(): void {
        this.emit('readAll')
    }
}

class MailTabController extends Controller<MailTabView> {
    constructor(
        view: MailTabView,
        private readonly mails: MailModel
    ) {
        super(view)
    }

    protected onStart(): void {
        // 登记到 session：stop 时自动取消监听，下次 start 重新建立
        const dot = this.addDisposable(redDotSignal(redDot, RedDotPath.Mail))
        this.observe(dot, count => this.view.renderBadge(count), { immediate: true })
        this.listen('readAll', () => this.mails.readAll())
    }
}

// ============================================================
// 演示
// ============================================================

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

async function demo() {
    const menuVm = new MainMenuViewModel(game)
    const menuView = new MainMenuView()
    const tabView = new MailTabView()
    const tabController = new MailTabController(tabView, mail)

    console.log('1. 挂载界面，显示初始状态')
    menuView.mount(menuVm)
    tabController.start()

    console.log('2. 连续收到 1000 封系统邮件：Model 改了 1000 次，红点系统合并后 UI 各只刷新一次')
    const before = [menuView.renders, tabView.renders]
    for (let i = 0; i < 1000; i++) mail.receive('system')
    await flush()
    console.log(`  主界面刷新 ${menuView.renders - before[0]} 次，邮件页签刷新 ${tabView.renders - before[1]} 次`)

    console.log('3. 获得两个新道具：动态红点自动创建，主界面汇总')
    bag.obtain(1001)
    bag.obtain(1002)
    await flush()
    console.log(`  Main = ${redDot.get(RedDotPath.Main)}，但显示文字仍是 99+，computed 结果没变，界面不重复刷新`)

    console.log('4. 进入战斗：红点数值不变，但和战斗状态组合后主界面红点隐藏')
    game.setBattle(true)
    game.setBattle(false)
    game.setBattle(true)

    console.log('5. MVC 点击「全部已读」：Controller -> Model -> 写入桥 -> 红点 -> 两个界面')
    tabView.clickReadAll()
    await flush()

    console.log('6. 离开战斗、查看道具 1001：新道具红点被 remove，祖先自动扣减')
    game.setBattle(false)
    bag.view(1001)
    await flush()

    console.log('7. 关闭界面后红点监听自动取消，再收到邮件不会刷新已关闭的界面')
    tabController.dispose()
    menuView.dispose()
    menuVm.dispose()
    mail.receive('friend')
    await flush()
    console.log(`  红点系统中 Main = ${redDot.get(RedDotPath.Main)}（数据照常更新，只是没有界面在听）`)

    bridges.forEach(stop => stop())
}

demo()
