# 代码模板

以「邮件」模块为例：Model 依赖一个仓库接口，领取时调用 CoinModel 加金币。邮件列表面板和主界面红点两个组件共用一个 Controller。生成时把 `Mail` / `mail` 换成实际模块名，字段和意图换成第 2 步确认的内容。

`FRAMEWORK` 表示框架入口 `index.ts` 的相对路径（不带 `.ts`），按文件位置计算。

目录

1. MvcComponent 基类（一次性）
2. MvcRegistry 注册表（一次性）
3. MvcBootstrap 启动组件（一次性）
4. Model
5. Controller
6. 界面组件
7. 一个组件挂多个 Controller
8. 非 Cocos 项目的 View

---

## 1. MvcComponent 基类（一次性）

```ts
import { _decorator, Component } from 'cc'
import { Emitter, EventMap, IMvcView, Listener } from 'FRAMEWORK'

const { ccclass } = _decorator

/**
 * 界面组件基类：让 Cocos 组件满足 IMvcView，可以 attach 到 MultiController 上。
 * 子类在 onEnable 里 attach、onDisable 里 detach，按钮回调里调用 emit。
 */
@ccclass('MvcComponent')
export abstract class MvcComponent<I extends EventMap<I>> extends Component implements IMvcView<I> {
    private readonly emitter = new Emitter<I>()

    on<K extends keyof I>(intent: K, handler: Listener<I[K]>): () => void {
        return this.emitter.on(intent, handler)
    }

    /** 节点未激活（例如关闭动画期间）时忽略，防止对已离开的界面做业务操作 */
    protected emit<K extends keyof I>(intent: K, ...args: I[K]): void {
        if (this.enabledInHierarchy) this.emitter.emit(intent, ...args)
    }

    /** 子类重写时调用 super.onDestroy() */
    protected onDestroy(): void {
        this.emitter.clear()
    }
}
```

## 2. MvcRegistry 注册表（一次性）

所有 Model 和 Controller 在这里创建，全项目只有这一处。组件只从这里导入单例。

```ts
import { CoinModel } from './modules/coin/CoinModel'
import { MailController } from './modules/mail/MailController'
import { HttpMailRepository, MailModel } from './modules/mail/MailModel'

// ---- Model（先于依赖它的 Controller 创建）----
export const coinModel = new CoinModel()
export const mailModel = new MailModel(new HttpMailRepository())

// ---- Controller ----
export const mailController = new MailController(mailModel, coinModel)

let booted = false

/** 游戏启动时调用一次。组件可以在这之前 attach，Model 观察在 start 后开始 */
export function bootstrapMvc(): void {
    if (booted) return
    booted = true
    mailController.start()
}
```

已有注册表时只追加：import、单例，以及 `bootstrapMvc` 里的一行 `start()`。

## 3. MvcBootstrap 启动组件（一次性）

只在项目里还没有调用 `bootstrapMvc()` 的地方时创建，并提醒用户挂到启动场景。

```ts
import { _decorator, Component, director } from 'cc'
import { bootstrapMvc } from './MvcRegistry'

const { ccclass } = _decorator

@ccclass('MvcBootstrap')
export class MvcBootstrap extends Component {
    onLoad() {
        director.addPersistRootNode(this.node)
        bootstrapMvc()
    }
}
```

## 4. Model

```ts
import { Model } from 'FRAMEWORK'

export interface Mail {
    readonly id: number
    readonly title: string
    readonly read: boolean
    readonly coins: number
}

interface MailState {
    readonly mails: readonly Mail[]
    readonly loading: boolean
}

/** 数据来源抽象：生产环境接 HTTP，测试时传入内存实现 */
export interface MailRepository {
    fetchAll(): Promise<Mail[]>
    markRead(id: number): Promise<void>
}

export class HttpMailRepository implements MailRepository {
    async fetchAll(): Promise<Mail[]> {
        throw new Error('TODO: 接入邮件接口')
    }
    async markRead(_id: number): Promise<void> {
        throw new Error('TODO: 接入邮件接口')
    }
}

export class MailModel extends Model<MailState> {
    constructor(private readonly repo: MailRepository) {
        super({ mails: [], loading: false })
    }

    get unreadCount(): number {
        return this.state.mails.filter(m => !m.read).length
    }

    async load(): Promise<void> {
        this.setState({ loading: true })
        try {
            this.setState({ mails: await this.repo.fetchAll(), loading: false })
        } catch (error) {
            this.setState({ loading: false })
            throw error
        }
    }

    /** 业务规则写在这里，Controller 不重复写 */
    async read(id: number): Promise<Mail> {
        const mail = this.state.mails.find(m => m.id === id)
        if (!mail) throw new Error(`邮件 ${id} 不存在`)
        if (!mail.read) {
            await this.repo.markRead(id)
            this.setState(s => ({ mails: s.mails.map(m => (m.id === id ? { ...m, read: true } : m)) }))
        }
        return mail
    }
}
```

要点：状态字段全部 `readonly`；`setState` 是 protected 的，外部只能调用业务方法；会失败的操作直接抛错，由 Controller 的 `onError` 统一处理。

## 5. Controller

```ts
import { IMvcView, IntentHandlers, MultiController } from 'FRAMEWORK'
import { CoinModel } from '../coin/CoinModel'
import { Mail, MailModel } from './MailModel'

/** 意图名加模块前缀：一个组件挂多个 Controller 时意图表会合并，重名会被重复处理 */
export type MailIntents = {
    mailRead: [id: number]
    mailClaimAll: []
}

/** 显示方法全部可选：列表面板实现 renderList，红点只实现 renderUnread */
export interface MailView extends IMvcView<MailIntents> {
    renderList?(mails: readonly Mail[], loading: boolean): void
    renderUnread?(count: number): void
    showError?(message: string): void
}

export class MailController extends MultiController<MailIntents, MailView> {
    constructor(
        private readonly mail: MailModel,
        private readonly coin: CoinModel
    ) {
        super()
    }

    protected intents(): IntentHandlers<MailIntents> {
        return {
            mailRead: id => this.mail.read(id),
            mailClaimAll: () => this.claimAll(),
        }
    }

    protected onStart(): void {
        // 列表和红点分开观察：只有未读数变化时才刷新红点
        this.observe(this.mail.state$, () => this.forEachView(v => this.renderList(v)))
        this.observe(
            this.mail.select(s => s.mails.filter(m => !m.read).length),
            n => this.forEachView(v => v.renderUnread?.(n))
        )
        this.guard('load', () => this.mail.load())
    }

    /** Model 观察早于 View 出现，新挂上的 View 补一次当前状态 */
    protected override onAttach(view: MailView): void {
        this.renderList(view)
        view.renderUnread?.(this.mail.unreadCount)
    }

    protected override onError(error: unknown, context: string): void {
        const message = error instanceof Error ? error.message : String(error)
        this.forEachView(v => v.showError?.(`${context} 失败：${message}`))
    }

    /** 跨 Model 的流程放在 Controller，单个 Model 内的规则放在 Model */
    private async claimAll(): Promise<void> {
        let total = 0
        for (const m of this.mail.state.mails) {
            if (!m.read) total += (await this.mail.read(m.id)).coins
        }
        if (total > 0) this.coin.add(total)
    }

    private renderList(view: MailView): void {
        view.renderList?.(this.mail.state.mails, this.mail.state.loading)
    }
}
```

只有一个 Model、各界面显示的数据差不多时，可以只 `observe(model.state$, ...)` 一次，在一个 `render(view, state)` 里调用所有可选显示方法。

## 6. 界面组件

```ts
import { _decorator, Label, Node } from 'cc'
import { MvcComponent } from '../../MvcComponent'
import { mailController } from '../../MvcRegistry'
import { Mail } from './MailModel'
import { MailIntents, MailView } from './MailController'

const { ccclass, property } = _decorator

@ccclass('MailListPanel')
export class MailListPanel extends MvcComponent<MailIntents> implements MailView {
    @property(Node) listRoot: Node | null = null
    @property(Node) loadingNode: Node | null = null
    @property(Label) errorLabel: Label | null = null

    onEnable() {
        mailController.attach(this)
    }

    onDisable() {
        mailController.detach(this)
    }

    renderList(mails: readonly Mail[], loading: boolean): void {
        if (this.loadingNode) this.loadingNode.active = loading
        // TODO: 刷新列表项
    }

    showError(message: string): void {
        if (this.errorLabel) this.errorLabel.string = message
    }

    // ---- 在编辑器里把按钮的点击事件绑到下面的方法 ----
    onClickItem(id: number) {
        this.emit('mailRead', id)
    }

    onClickClaimAll() {
        this.emit('mailClaimAll')
    }
}
```

```ts
@ccclass('MailRedDot')
export class MailRedDot extends MvcComponent<MailIntents> implements MailView {
    /** 红点图标是子节点：隐藏它不会触发本组件的 onDisable */
    @property(Node) dotNode: Node | null = null
    @property(Label) countLabel: Label | null = null

    onEnable() {
        mailController.attach(this)
    }

    onDisable() {
        mailController.detach(this)
    }

    renderUnread(count: number): void {
        if (this.dotNode) this.dotNode.active = count > 0
        if (this.countLabel) this.countLabel.string = `${count}`
    }
}
```

注意：显示方法里不要修改组件自身的 `this.node.active`。节点隐藏会触发 `onDisable` → detach，之后就收不到更新了（例如未读数从 0 变成 1 时红点不会再出现）。要隐藏就隐藏子节点。

## 7. 一个组件挂多个 Controller

```ts
@ccclass('MainHud')
export class MainHud extends MvcComponent<MailIntents & CoinIntents> implements MailView, CoinView {
    onEnable() {
        mailController.attach(this)
        coinController.attach(this)
    }

    onDisable() {
        coinController.detach(this)
        mailController.detach(this)
    }

    renderUnread(count: number): void { /* 来自 mailController */ }
    renderCoin(amount: number): void { /* 来自 coinController */ }
}
```

每个 Controller 只处理自己 `intents()` 里的意图，只调用自己 View 接口里的方法。框架会给 View 计数：第一个 attach 时才 mount，最后一个 detach 时才 unmount，所以从一个 Controller detach 不会影响另一个。

## 8. 非 Cocos 项目的 View

没有 `cc` 时，View 继承框架的 `MvcView`，由创建它的一方负责 attach / detach / dispose：

```ts
import { MvcView } from 'FRAMEWORK'
import { MailIntents, MailView } from './MailController'
import { Mail } from './MailModel'

export class ConsoleMailView extends MvcView<MailIntents> implements MailView {
    renderList(mails: readonly Mail[], loading: boolean): void {
        console.log(loading ? '加载中…' : mails.map(m => m.title).join(', '))
    }

    clickItem(id: number): void {
        this.emit('mailRead', id)
    }
}

// 使用
// mailController.attach(view)   显示时
// mailController.detach(view)   隐藏时
// view.dispose()                销毁时，由创建者负责
```
