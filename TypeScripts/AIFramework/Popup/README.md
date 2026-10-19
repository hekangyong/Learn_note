# 弹窗管理系统（Popup Manager）代码说明

所有模块想弹窗时，都不直接打开 UI，而是调用 `popup.open(type, data)` 交给管理器排队，由管理器决定**弹不弹、什么时候弹、弹哪个**。

解决的问题：

- 多个弹窗叠在一起，或低优先级的公告盖住了重要的升级提示；
- 新手引导进行到一半被活动弹窗打断，玩家卡在引导里；
- 同一个奖励因网络重发、事件重复触发被弹两次。

---

## 1. 文件结构

| 文件 | 作用 |
| --- | --- |
| `Popup.ts` | 核心实现 `PopupSystem` 及全部类型定义。只有类，没有副作用，可在测试中随意 `new` |
| `PopupManager.ts` | 全局单例 `popup`、空的弹窗类型表 `PopupDataMap`（由各模块声明合并）、优先级档位 `PopupPriority` + `popupPriority()`、绑定到单例的装饰器 |
| `PopupDecorators.ts` | 装饰器工厂 `createPopupDecorators`：`@PopupWindow` / `@Condition` / `@AfterTutorial` + 自动生成的视图适配器 |
| `arch/MvcPopup.ts` | MVC 弹窗基类：继承 [MVVM_MVC](../MVVM_MVC/README.md) 的 `Controller`，把管理器生命周期映射为 start / stop / dispose |
| `arch/MvvmPopup.ts` | MVVM 弹窗基类：`PopupViewModel`（继承框架的 `ViewModel`）+ `MvvmPopup`，View 直接使用框架的 `MvvmView` |
| `demo.ts` | 演示：手动 `register` + 手写视图适配器，覆盖全部功能 |
| `decoratorDemo.ts` | 演示：用装饰器注册弹窗 |
| `archDemo.ts` | 演示：MVC 与 MVVM 两种写法的弹窗共存 |
| `demoPopups.ts` | 三个演示共用的弹窗类型登记和优先级（相当于一个业务模块） |
| `test.ts` | 测试：异步创建、多弹窗共存（层）、优先级档位与登记汇总 |

分层关系：

```
业务代码 ──popup.open(type, data)──▶ PopupSystem（排队 / 优先级 / 新手 / 去重 / 条件）
                                          │  PopupView 接口（show / hide / dispose）
                         ┌────────────────┴────────────────┐
                 手写视图适配器（demo.ts）        装饰器生成的 view（PopupDecorators.ts）
                                                          │  PopupComponent 接口（onShow / onHide / onDispose）
                                              ┌───────────┴───────────┐
                                          MvcPopup                MvvmPopup
                                              │  MVVM_MVC 框架（Model / Controller / ViewModel / 响应式内核）
```

管理器只认识 `PopupView`，不关心 UI 如何渲染；装饰器层只认识 `PopupComponent`，不关心 UI 用什么架构写。

运行演示：

```bash
cd TypeScripts
npx tsc
node dist/AIFramework/Popup/demo.js
node dist/AIFramework/Popup/decoratorDemo.js
node dist/AIFramework/Popup/archDemo.js
node dist/AIFramework/Popup/test.js
```

---

## 2. 快速上手

### 2.1 新增一种弹窗的步骤

全部写在业务模块自己的文件里，**不需要改框架文件**：

1. 通过声明合并把弹窗类型登记到 `PopupDataMap`（路径是从当前文件到 `PopupManager.ts` 的相对路径）：
   ```ts
   // Mail/MailPopup.ts
   export interface MailData { mailId: number }

   declare module '../Popup/PopupManager' {
       interface PopupDataMap {
           Mail: MailData
       }
   }
   ```
2. 选择优先级档位，用 `popupPriority(档位, 偏移)` 计算优先级：
   ```ts
   const priority = popupPriority('Panel', 10)   // 110：比普通面板高一点，仍低于所有奖励类
   ```
3. 注册配置（二选一，见下面两节）。
4. 业务代码只调用：
   ```ts
   popup.open('Mail', { mailId: 42 })   // data 类型会被编译器检查
   ```

为什么不把所有弹窗写在一张中心表里：表本身没有运行时开销，几百项也不影响编译速度；
问题在于**谁来维护**。集中在框架文件里会让框架依赖业务、多人同时改同一个文件、删功能时容易漏删。
分散登记后：

| 关注点 | 怎么保证 |
| --- | --- |
| 类型安全 | 与集中写法完全相同：`open` 的数据、`onShow` 的参数都按登记的类型检查，未登记的类型直接报错 |
| 撞名 | 两个模块登记同名、但类型不同的弹窗时编译报错（TS2717）。建议名字带模块前缀，如 `'Mail.Detail'` |
| 优先级总览 | 档位集中定义在 `PopupPriority`；具体每个弹窗的值用 `popup.registrations` 在调试面板 / 启动日志中打印 |
| 优先级越界 | `popupPriority` 检查偏移不越过上一档，越界在注册时直接抛异常 |

优先级档位（`PopupManager.ts`）：

| 档位 | 基准值 | 用途 |
| --- | --- | --- |
| `Guide` | 1000 | 新手引导 |
| `System` | 500 | 断线重连、强制更新、二次确认 |
| `Reward` | 200 | 奖励、升级等结算类 |
| `Panel` | 100 | 功能面板、活动 |
| `Notice` | 50 | 公告、提示 |

### 2.2 方式一：手动 register

```ts
popup.register('LevelUp', {
    priority: popupPriority('Reward', 100),
    conditions: [() => !player.inBattle],   // 战斗中不弹
})

popup.setView({
    show(info) {
        switch (info.type) {               // switch 后 info.data 自动收窄
            case 'LevelUp': openLevelUpUI(info.data.level, info.id); break
            // ...
        }
    },
    hide(info) { hideUI(info.id) },
    dispose(info) { destroyUI(info.id) },  // 可选
})

// UI 的关闭按钮：
popup.close(id, result)
```

### 2.3 方式二：装饰器

```ts
@PopupWindow('Reward', { priority: popupPriority('Reward'), tutorial: ctx => ctx.guideId !== 'main' })
class RewardPopup implements PopupComponent<RewardData> {
    @Condition
    static notInBattle() { return !player.inBattle }

    @AfterTutorial
    static keep(data: RewardData, waited: number) {
        return data.itemId !== NEWBIE_GIFT_ID
    }

    onShow(data: RewardData, close: (result?: unknown) => void) { /* 显示 */ }
    onHide() { /* 离开屏幕，之后可能还会 onShow */ }
    onDispose() { /* 彻底结束，释放资源 */ }
}

popup.setView(popupView)   // UI 启动时调用一次
```

装饰器模式下，管理器根据 `type` 自动 `new` UI 类（所以构造函数不能有参数），并且同一个弹窗被抢占后恢复时**复用同一个实例**，UI 状态不会丢失。

---

## 3. 配置项 `PopupConfig<D>`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `priority` | `number` | 必填 | 越大越先弹；相同优先级先来先弹 |
| `tutorial` | `'allow' \| 'defer' \| 'drop' \| (ctx: TutorialContext) => GuardResult \| boolean` | `'defer'` | 强引导期间的策略（引导这一步没有用 `allowPopups` 放行时），见第 6 节 |
| `conditions` | `PopupCondition<D>[]` | `[]` | 弹出条件，按顺序检查，第一个不是 `show` 的结果生效 |
| `unique` | `'data' \| 'type' \| 'none'` | `'data'` | 去重方式，见第 7 节 |
| `onDuplicate` | `'ignore' \| 'replace'` | `'ignore'` | 发现重复时保留旧的，还是用新的替换排队中的旧的 |
| `dataKey` | `(data) => string` | 稳定序列化 | 自定义去重 key（数据含 Map/Set/类实例，或只按 id 去重时使用） |
| `layer` | `string` | `'main'` | 所在的层。每层独立排队、有自己的容量，见 [5.6](#56-多弹窗共存层) |
| `preempt` | `boolean` | `false` | 所在层已满时，能否抢占该层正在显示的、优先级**更低**的弹窗 |
| `ttl` | `number`（毫秒） | 无 | 排队超时：入队后超过该时间仍未弹出则丢弃；显示过的弹窗不受影响 |
| `afterTutorial` | `(data, waited, guide) => boolean` | 全部保留 | 强引导结束时，被引导拦下的弹窗是否还要弹，`false` 丢弃；`guide` 是刚结束的引导 |

条件函数的返回值 `GuardResult`：

| 返回值 | 含义 |
| --- | --- |
| `'show'` / `true` | 可以弹出 |
| `'wait'` / `false` | 暂不弹，留在队列里；**不阻塞**后面的弹窗 |
| `'drop'` | 不再需要，直接移除（结束原因 `dropped`） |

---

## 4. API 参考（`PopupSystem<M>`）

### 构造

```ts
new PopupSystem<M>(scheduler = queueMicrotask, now = Date.now, { showTimeout = 10_000, layers = {} } = {})
```

- `scheduler`：何时执行挑选。默认微任务——同一段同步代码里的多个 `open` 先全部入队，再统一按优先级挑选。
- `now`：时间来源，测试 `ttl` 时可以传入假时钟。
- `showTimeout`：异步 `view.show` 最长等待时间，超时视为显示失败（见 [5.5](#55-异步创建)）。
- `layers`：各层容量（同时显示的最大数量），未列出的层为 1，可以填 `Infinity`（见 [5.6](#56-多弹窗共存层)）。

### 方法

| 方法 | 说明 |
| --- | --- |
| `setView(view)` | 设置视图适配器。设置前弹窗只排队不显示 |
| `register(type, config)` | 注册配置；重复注册覆盖旧配置（只影响之后 `open` 的弹窗）。返回 `this` 可链式调用 |
| `open(type, data)` | 请求打开，返回 `OpenResult`。未注册的类型直接抛异常（开发期错误，尽早暴露） |
| `close(id, result?)` | 显示中的 → `hide` 并以 `closed` 结束；排队中的 → 以 `cancelled` 结束。返回弹窗是否存在 |
| `closeAll(layer?)` | 关闭全部（切换账号、回登录界面）；传入 `layer` 只关闭该层 |
| `setTutorial(ctx \| null)` | 设置当前引导（哪个引导、哪一步、是否强引导、这一步放行哪些弹窗），结束时传 `null`，见第 6 节 |
| `currentTutorial` | 当前引导上下文或 `null` |
| `pause(layer?)` / `resume(layer?)` | 暂停/恢复弹出（加载、战斗、过场）。已显示的不受影响；传入 `layer` 只暂停/恢复该层，`resume()` 恢复全部 |
| `refresh()` | 外部状态变化后通知重新检查条件，让被 `wait` 卡住的弹窗有机会弹出 |
| `currentPopup` | 最上层（最后显示）的弹窗或 `null`；只用 `main` 层时就是当前弹窗 |
| `currentPopupOf(layer?)` | 某一层最上层的弹窗或 `null` |
| `showingPopups` | 所有正在显示的弹窗，按显示先后排列（最后一个在最上层） |
| `queuedPopups` | 排队中的弹窗（按弹出顺序），用于调试面板 |
| `has(id)` | 弹窗是否还存在（排队中或显示中） |
| `loadingPopups` | 正在异步加载的弹窗 |
| `onLoadingChange(fn)` | 订阅加载状态：有弹窗开始或结束加载时，回调正在加载的全部弹窗，用于加载遮罩。返回取消函数 |

### `open` 的返回值

```ts
type OpenResult =
    | { ok: true; id: number; closed: Promise<CloseResult> }
    | { ok: false; reason: 'duplicate'; existingId: number }
```

`closed` 在弹窗彻底结束时完成，可以用来实现「等待确认框结果」：

```ts
const r = popup.open('Notice', { title: '确认购买？' })
if (r.ok) {
    const { reason, result } = await r.closed
    if (reason === 'closed' && result === 'yes') buy()
}
```

结束原因 `CloseReason`：

| 值 | 触发场景 |
| --- | --- |
| `closed` | 显示后被 `close`（正常流程），`result` 为 `close` 传入的值 |
| `cancelled` | 还在排队时被 `close` / `closeAll` 取消 |
| `dropped` | 被新手策略、弹出条件或 `afterTutorial` 丢弃，或 `view.show` 抛异常 / 异步加载失败 / 超时 |
| `expired` | 排队超过 `ttl` |
| `replaced` | 被同类型新弹窗替换（`onDuplicate: 'replace'`） |

### 视图适配器 `PopupView<M>`

| 方法 | 调用时机 | UI 需要保证 |
| --- | --- | --- |
| `show(info, signal)` | 弹出；被抢占/被引导收起后**恢复时会再次调用**。可以返回 Promise（异步创建） | 支持同一个弹窗多次 `show`；异步时完成前检查 `signal.aborted`，被取消就不显示；按 `info.layer` 放到对应的层节点，后显示的在上面 |
| `hide(info)` | 关闭、被抢占、引导开始被收起 | 可以重复调用 |
| `dispose?(info)` | 显示过的弹窗彻底结束（在 `hide` 之后），之后不会再 `show` | 在这里释放 UI 实例 |

> `hide` ≠ 销毁。`hide` 只表示离开屏幕，之后可能还会恢复；释放资源请放在 `dispose`。

---

## 5. 生命周期与调度

### 5.1 一个弹窗的生命周期

```
open ──▶ 去重检查 ──(重复)──▶ { ok: false, reason: 'duplicate' }
            │
            ▼
       按优先级插入队列 ──▶ schedule ──▶ pump（挑选）
                                          │
        ┌─────── 超时 ──── expired ◀──────┤
        │                                 ▼
        │           新手策略 + 弹出条件：show / wait（留在队列）/ drop
        │                                 │ show
        ▼                                 ▼
  closed Promise ◀── close ◀──── view.show 显示中 ──(被抢占 / 引导开始)──▶ 回到队列
```

### 5.2 `schedule` 与 `pump`

所有会影响「下一个弹哪个」的操作（`open`、`close`、`setView`、`setTutorial`、`resume`、`refresh`）都只调用 `schedule()`；真正的挑选只在 `pump()` 中发生。

- `schedule` 用 `scheduled` 标记合并：同一批操作只触发一次 `pump`。
- 好处一：**批量合并**。先 `open` 公告、再 `open` 升级，仍然先弹升级。
- 好处二：**避免重入**。UI 在 `show` 回调里同步调用 `close` 时，不会在管理器状态更新到一半时再次进入挑选逻辑。

`pump` 的流程（`Popup.ts:552`）：

1. 没有 `view` → 直接返回。
2. 引导进行中 → 用新手策略重新检查**所有层**正在显示的弹窗：
   `defer`/`wait` → 收起放回队列并标记 `blockedByTutorial`；`drop` → 丢弃。
3. 全部暂停中 → 到此为止，不弹出新的。
4. 从队首开始遍历整个队列：
   1. 未显示过且超过 `ttl` → 移除，`expired`；
   2. 所在层被单独暂停 → 跳过；
   3. 所在层已满 → 只有 **`preempt: true` 且优先级高于该层显示中最低的** 才有资格，否则跳过（不 `break`：后面可能是其他层的弹窗）；
   4. `evaluate`（新手策略 → 各个条件）：`wait` 跳过看下一个，`drop` 移除，`show` 进入下一步；
   5. 如果是抢占，先 `suspend` 该层最低的那个；然后 `display`，**继续遍历**，同一次 pump 可以在各层填满空位。

`suspend`（`Popup.ts:622`）：`hide` 被挤掉的弹窗并以**原 `seq`** 插回队列，因此恢复时它仍排在同优先级后来者前面。
它的优先级比抢占者低，插回的位置一定在当前遍历位置之后，本轮后面还会检查到它（层仍是满的，所以会继续排队）。

### 5.3 队列实现

队列是「有序数组 + 二分插入」，排序规则 `before(a, b)`：优先级高的在前，相同优先级 `seq` 小（先来）的在前。

没有用堆，因为弹窗队列通常只有几个到几十个元素，而 `pump` 需要「按顺序遍历、跳过 `wait` 的」和「从中间删除」，有序数组更简单直接。

### 5.4 内部索引

| 字段 | 作用 |
| --- | --- |
| `queue` | 排队中的记录，始终有序 |
| `showing` | 正在显示的记录，按显示先后排列（最后一个在最上层）；每层数量不超过该层容量 |
| `records` | `id → 记录`，排队中 + 显示中，用于 `close(id)` |
| `dedup` | `去重 key → 记录`，排队中 + 显示中 |

所有「弹窗彻底结束」都走 `finish()`（`Popup.ts:826`）：清理 `records` 和 `dedup`、对显示过的弹窗调用 `view.dispose`、完成 `closed` Promise。

### 5.5 异步创建

真实引擎里创建弹窗往往要先加载预制体、图集，`view.show` 可以返回 Promise，完成时弹窗才算真正显示。
加载期间管理器仍把它当作当前弹窗（后面的弹窗继续排队），并处理好加载期间发生的各种事情：

| 加载期间发生 | 处理 | 不处理会怎样 |
| --- | --- | --- |
| 被 `close` / 被抢占 / 引导开始被收起 | abort 本次 show 的 `signal`，加载完成后 UI 检查到已取消就不显示 | 关闭了却又显示出来的「幽灵弹窗」、两个弹窗叠在一起 |
| 加载失败（reject） | 以 `dropped` 结束，继续弹下一个 | 当前弹窗永远不结束，**整个队列卡死** |
| 超过 `showTimeout` | 同上，并 abort，迟到的结果被忽略 | 同上 |
| 被抢占后恢复 | 再次调用 `show`，装饰器视图复用同一次加载 | 重复加载、创建两份实例 |

用装饰器时，在弹窗类上实现 `onLoad` 即可，不用直接接触 `signal`：

```ts
@PopupWindow('Shop', { priority: popupPriority('Panel', 50) })
class ShopPopup implements PopupComponent<ShopData> {
    private prefab!: Prefab

    // 首次显示前调用一次，完成后才 onShow；signal 在弹窗彻底结束时 abort
    async onLoad(data, signal) {
        this.prefab = await loadPrefab('ui/shop', signal)
    }
    onShow(data, close) { /* 用 this.prefab 实例化并显示 */ }
}
```

加载中屏幕上什么都没有，玩家可能点穿到下层界面，可以用加载状态显示遮罩：

```ts
// 只有 main 层的弹窗加载时才需要遮罩，toast 之类不挡操作
popup.onLoadingChange(list => loadingMask.setVisible(list.some(p => p.layer === 'main')))
```

### 5.6 多弹窗共存（层）

默认所有弹窗都在 `main` 层，容量 1，即「同一时刻只显示一个」。需要共存的弹窗放到其他层：

```ts
const popup = new PopupSystem<PopupDataMap>(undefined, undefined, {
    layers: { main: 1, toast: 3, overlay: Infinity },   // 未列出的层容量为 1
})
popup.register('Reward', { priority: 200 })                        // main：模态，一次一个
popup.register('Tips',   { priority: 10, layer: 'toast' })          // 最多同时 3 条
popup.register('BigTip', { priority: 90, layer: 'toast', preempt: true })
popup.register('Confirm', { priority: 500, layer: 'overlay' })      // 叠在任何弹窗上，不限数量
```

| 规则 | 说明 |
| --- | --- |
| 层与层互不阻塞 | `main` 有弹窗显示时，`toast` 层照常弹出；一层满了只影响这一层 |
| 层内仍按优先级排队 | 空位出现时，该层队列里优先级最高的先上 |
| 抢占只发生在层内 | 层满且 `preempt: true`、优先级高于该层显示中最低的 → 挤掉最低的（相同优先级时最后显示的先让位），它回到队列，之后自动恢复 |
| 去重、新手策略、弹出条件、`ttl`、异步创建 | 对每个弹窗照常生效，与层无关；引导开始时检查**所有层**正在显示的弹窗 |
| 按层控制 | `pause('main')`（战斗中只停模态弹窗）、`closeAll('toast')`、`currentPopupOf('main')` |

UI 侧：每层对应一个节点，`show` 时按 `info.layer` 挂到对应节点，同层后显示的在上面；层与层之间的上下关系（如 `overlay` 在 `main` 之上）由 UI 固定。

> 「随父弹窗一起关闭」的子弹窗（例如商店里点开的道具详情）不在层的职责里：需要的话在父弹窗的 `onHide` / `onDispose` 中关闭自己打开的子弹窗。

---

## 6. 新手引导模式

### 6.1 引导上下文

引导模块在每一步开始时调用 `popup.setTutorial(ctx)`，引导结束时调用 `popup.setTutorial(null)`：

```ts
interface TutorialContext {
    guideId: string          // 哪个引导：'main'（主线新手）/ 'smithy'（铁匠铺功能引导）…
    stepId: string           // 步骤的稳定 id：'claim_reward'
    step?: number            // 序号，只用于调试显示
    forced?: boolean         // 默认 true；弱引导（手指提示、气泡）传 false，不拦弹窗
    allowPopups?: (keyof PopupDataMap)[]   // 这一步允许弹出的弹窗
}
```

为什么不只传「第几步」：

| 只用步骤序号的问题 | 现在的做法 |
| --- | --- |
| 有多个引导时，「第 3 步」在不同引导里含义不同，`step >= 3` 会在别的引导里误放行 | 用 `guideId` 区分引导 |
| 策划插入一步后序号整体后移，按序号写的判断悄悄出错 | 用稳定的 `stepId`；或者干脆由引导配置用 `allowPopups` 声明 |
| 分支、可跳过的引导，`>=` 没有意义 | 同上 |
| 弱引导（只是提示）也会拦住所有弹窗 | `forced: false` 的引导不影响弹窗 |
| 弹窗要知道引导内部「领奖是第几步」，改引导要翻遍弹窗模块 | 引导的这一步写 `allowPopups: ['Reward']`，弹窗不需要知道引导 |

### 6.2 判断顺序

强引导期间，弹窗能否显示：

1. 当前这一步的 `allowPopups` 包含该类型 → 可以弹（**引导配置优先**）；
2. 否则按弹窗自己的 `tutorial` 策略：

| 策略 | 行为 | 适用 |
| --- | --- | --- |
| `allow` | 引导期间也可以弹 | 引导自身的弹窗、强制公告 |
| `defer`（默认） | 等引导结束再弹 | 大多数弹窗：不打断引导，也不会丢失 |
| `drop` | 引导期间触发的直接丢弃 | 时效性强、过后没有意义的提示 |
| 函数 `(ctx) => …` | 根据引导上下文判断 | 例如 `ctx => ctx.guideId !== 'main'`：只在主线新手期间延后，功能引导期间照常弹 |

`allowPopups` 只对那一步有效，推进到下一步后不再放行。

「玩家**完成过**某一步之后才弹」是持久状态，不属于引导期间的策略，用弹出条件表达，引导模块在步骤完成时调用 `popup.refresh()`：

```ts
conditions: [() => guide.isCompleted('main', 'claim_reward')]
```

### 6.3 `setTutorial` 的几种情况

- **强引导开始 / 推进到下一步 / 切换到另一个引导**：遍历队列，把会被拦下的记录标记 `blockedByTutorial`；正在显示的、不再允许的弹窗会在下一次 `pump` 中被收起或丢弃，这一步放行的弹窗弹出。
- **强引导结束**（传 `null`，或切换为弱引导；只在「强引导中 → 不再拦截」那一刻）：同步执行 `checkAfterTutorial`，对标记过的记录调用 `afterTutorial(data, waited, guide)`（`guide` 是刚结束的那一步），返回 `false` 的立即以 `dropped` 结束。同步执行是为了让被丢弃的弹窗没有机会先弹出来。
- 之后再 `schedule`，按优先级依次弹出剩下的。
- **弱引导**：对弹窗没有任何影响。

为什么在 `open` / `setTutorial` 中打标记，而不是在 `evaluate` 中？因为有弹窗正在显示时，低优先级弹窗根本走不到 `evaluate`，会漏标（见 `Popup.ts:821` 的注释）。

`afterTutorial` 的典型用法：

```ts
afterTutorial: (data, waited, guide) =>
    !(guide.guideId === 'main' && data.itemId === NEWBIE_GIFT_ID)   // 新手礼包在主线引导中已经展示过
    && waited < 10 * 60_000                                          // 被拦了 10 分钟以上的已经过时
```

---

## 7. 去重

| `unique` | 去重 key | 效果 |
| --- | --- | --- |
| `data`（默认） | `data:类型:序列化(data)` | 同类型 + 同数据不重复；不同数据可分别弹 |
| `type` | `type:类型` | 同类型只存在一个 |
| `none` | 无 | 不去重 |

- 默认序列化 `stableStringify` 与对象 key 的顺序无关：`{ a: 1, b: 2 }` 与 `{ b: 2, a: 1 }` 视为相同；值为 `undefined` 的 key 被忽略；`Date` 按时间戳比较。**不支持**循环引用、Map/Set，这类数据请配置 `dataKey`。
- 去重范围包括**排队中和显示中**的弹窗；弹窗结束后同样的数据可以再次弹出。
- `onDuplicate: 'replace'` 只替换**还在排队、从未显示过**的旧弹窗；正在显示（包括被抢占收起）的不会被打断，新的仍被拒绝。
- `finish` 只删除指向自己的去重 key，避免 `replace` 时误删新记录占用的同一个 key。

---

## 8. 异常隔离

管理器保证 UI 或业务代码出错时，自身状态始终正确、队列不会卡死：

| 出错位置 | 处理 |
| --- | --- |
| `view.show`（同步抛错、异步 reject、超过 `showTimeout`） | 打印错误，以 `dropped` 结束该弹窗，继续弹下一个 |
| `view.hide` / `view.dispose` | 打印错误，状态照常更新 |
| 弹出条件 / 新手策略函数 | 视为 `wait`（保守：不误弹也不丢失） |
| `afterTutorial` | 视为保留，交给后续条件判断 |
| `open` 未注册的类型 | **直接抛出**（属于编码错误，应在开发期暴露） |

---

## 9. 装饰器实现原理（`PopupDecorators.ts`）

使用旧版装饰器（`experimentalDecorators`）：

1. 装饰器在**类定义时**执行一次，不是在 `new` 的时候。
2. 执行顺序：先成员装饰器（`@Condition`、`@AfterTutorial`），后类装饰器（`@PopupWindow`）。
3. 所以成员装饰器只把方法记到 `pendingMeta`（`WeakMap<类, 元数据>`）里，`@PopupWindow` 执行时再取出、与配置合并后调用 `system.register`。
4. `@Condition` 的条件追加在 `config.conditions` 之后；`@AfterTutorial` 每个类最多一个，且不能与配置中的 `afterTutorial` 同时存在（否则抛异常）。
5. 成员装饰器的 `target` 声明为 `Function`：装饰实例方法会编译报错，保证条件都是 `static` 方法；调用时 `this` 绑定为类本身。
6. 用工厂 `createPopupDecorators(system)` 而不是写死单例，测试时可以绑定到新的实例。

自动生成的 `view`：

- `show`：按 `info.id` 查找实例，没有则按 `info.type` 找到类并 `new`，再调用 `onShow(data, close)`；
- `hide` → `onHide()`；
- `dispose` → 删除实例并调用 `onDispose()`。

同一个类型重复 `@PopupWindow` 会抛异常。

---

## 10. MVC / MVVM 适配（`arch/`）

管理器只依赖 `PopupComponent` 接口，所以 UI 用什么架构写都可以。`MvcPopup` 和 `MvvmPopup` 是两个适配器基类，把管理器生命周期接到 [MVVM_MVC 框架](../MVVM_MVC/README.md) 上。注册方式（`@PopupWindow`）和业务调用方式（`popup.open`）完全相同，Model 层（继承框架的 `Model`）两种写法共用。

响应式工具（`signal` / `computed` / `Command` / `AsyncCommand` / `DisposableStore`）全部来自框架，从 `'../MVVM_MVC'` 引用。

### MVC：`MvcPopup<D, V>`

`MvcPopup` 继承框架的 `Controller<V>`。View 继承框架的 `MvcView<意图表>`，用 `this.emit(...)` 发出用户意图。

```ts
class RewardView extends MvcView<{ claim: [] }> { ... }

@PopupWindow('Reward', { priority: popupPriority('Reward') })
class RewardPopup extends MvcPopup<RewardData, RewardView> {
    constructor() { super(new RewardView()) }      // 管理器负责 new，构造函数不能有参数
    protected onStart() {
        this.listen('claim', () => { player.addItem(...); this.close('claimed') })
        this.observe(player.gold, () => this.render(), { immediate: true })
    }
}
```

| 管理器回调 | MvcPopup 内部 |
| --- | --- |
| `onShow`（首次 / 恢复） | 保存 `data`、`close` → `start()` → `view.mount()` → `onStart()` |
| `onHide` | `stop()` → 释放 `listen` / `observe` → `view.unmount()` |
| `onDispose` | `dispose()` → `onDispose()` → `view.dispose()` |

数据流是**命令式**的：Controller 观察到 Model 变化后主动调用 View。恢复显示时 `observe(..., { immediate: true })` 会立刻按最新数据刷新，隐藏期间错过的变化不会丢。意图处理（包括 async）抛出的错误统一进入 `onError`。

### MVVM：`MvvmPopup<D, VM, V>`

- `PopupViewModel<D>`：继承框架的 `ViewModel`。实现 `onInit(data)`，用 `signal` / `computed` 表示状态，用 `this.command` / `this.asyncCommand` 表示操作，用 `this.close(result)` 关闭弹窗。可选重写 `onActivate` / `onDeactivate` / `onDispose`，只在显示期间需要的资源登记到 `activeDisposables`。
- View：直接继承框架的 `MvvmView<VM>`，在 `onBind(vm)` 中用 `bind` / `bindCommand` / `bindTwoWay` 绑定。
- `MvvmPopup`：实现 `createViewModel`、`createView`，负责组装。

| 管理器回调 | MvvmPopup 内部 |
| --- | --- |
| `onShow`（首次） | `createViewModel` → `vm.init(data, close)` → `createView` → `view.mount(vm)`（`vm.activate` → `onBind`） |
| `onShow`（恢复） | `view.mount(vm)`（状态保留在 VM 中，重新绑定后立即显示最新状态） |
| `onHide` | `view.unmount()`（解除绑定 → `vm.deactivate`，例如暂停倒计时） |
| `onDispose` | `view.dispose()`（先解除绑定）→ `vm.dispose()`（取消进行中的异步命令） |

数据流是**声明式**的：ViewModel 只改状态，View 通过绑定自动刷新；ViewModel 不引用 View，可以脱离 UI 单测。`AsyncCommand` 默认的 `drop` 策略让请求进行中的按钮自动置灰，防止重复购买。

### 从旧版迁移

| 旧版（`arch/Observable.ts`，已删除） | 新版（MVVM_MVC 框架） |
| --- | --- |
| `new Observable(v)` | `signal(v)` |
| `new Computed([deps], fn)` + `track()` | `computed(fn)`，依赖自动收集，不需要 dispose |
| `new Command(fn, canExecute)`，返回 `boolean` | `this.command(fn, { canExecute })`，返回 `{ ok, ... }` |
| `DisposeBag` | `DisposableStore` |
| MVC：`createView` / `onCreate` / `render` / `onDestroy` | 构造函数 `super(new View())` / `onStart` / 自己的 `render` / `onDispose` |
| MVC View：实现 `show` / `hide` / `destroy` | 继承 `MvcView`，重写 `onMount` / `onUnmount` / `onDispose` |
| MVVM：`onActive` / `onInactive` | `onActivate` / `onDeactivate` |
| MVVM View：`bind(vm)` + `show` / `hide`，`bindValue` | `onBind(vm)` / `onUnbind`，`bind` |

---

## 11. 使用注意事项

- **不要绕过管理器直接打开弹窗 UI**，也不要在 UI 里自己销毁弹窗：关闭按钮调用 `popup.close(id, result)`（装饰器模式下调用 `onShow` 传入的 `close`）。
- **条件依赖的外部状态变化后要调用 `popup.refresh()`**。管理器不会轮询，被 `wait` 卡住的弹窗只在有 `schedule` 时才会重新检查。
- **`ttl` 只在 `pump` 时检查**，没有定时器。超时的弹窗会在下一次挑选时被移除（`closed` 也在那时完成），而不是到点立即移除。
- **`open` 是异步显示的**：调用后在当前同步代码中 `currentPopup` 还没变化，要等微任务之后才显示（demo 中用 `await tick()` 等待）。
- **UI 需要支持同一个弹窗多次 `show`**（抢占恢复、引导结束恢复），并在 `dispose` 而不是 `hide` 中释放资源。
- **`preempt` 只对优先级严格更高的生效**；同优先级不会互相抢占。
- **重复 `register` 只影响之后 `open` 的弹窗**，已在队列中的仍使用旧配置。
- 优先级数值之间留出间隔（如 300 / 200 / 150），以后插入新弹窗时不必改动已有数值。
