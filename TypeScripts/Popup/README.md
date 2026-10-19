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
| `PopupManager.ts` | 全局单例 `popup`、弹窗数据类型表 `PopupDataMap`、优先级常量 `PopupPriority`、绑定到单例的装饰器 |
| `PopupDecorators.ts` | 装饰器工厂 `createPopupDecorators`：`@PopupWindow` / `@Condition` / `@AfterTutorial` + 自动生成的视图适配器 |
| `arch/Observable.ts` | 极简响应式工具：`Observable` / `Computed` / `Command` / `DisposeBag` |
| `arch/MvcPopup.ts` | MVC 弹窗基类：把管理器生命周期适配成 Controller 模式 |
| `arch/MvvmPopup.ts` | MVVM 弹窗基类：`PopupViewModel` + `MvvmView` + `MvvmPopup` |
| `demo.ts` | 演示：手动 `register` + 手写视图适配器，覆盖全部功能 |
| `decoratorDemo.ts` | 演示：用装饰器注册弹窗 |
| `archDemo.ts` | 演示：MVC 与 MVVM 两种写法的弹窗共存 |

分层关系：

```
业务代码 ──popup.open(type, data)──▶ PopupSystem（排队 / 优先级 / 新手 / 去重 / 条件）
                                          │  PopupView 接口（show / hide / dispose）
                         ┌────────────────┴────────────────┐
                 手写视图适配器（demo.ts）        装饰器生成的 view（PopupDecorators.ts）
                                                          │  PopupComponent 接口（onShow / onHide / onDispose）
                                              ┌───────────┴───────────┐
                                          MvcPopup                MvvmPopup
```

管理器只认识 `PopupView`，不关心 UI 如何渲染；装饰器层只认识 `PopupComponent`，不关心 UI 用什么架构写。

运行演示：

```bash
cd TypeScripts
npx tsc
node dist/Popup/demo.js
node dist/Popup/decoratorDemo.js
node dist/Popup/archDemo.js
```

---

## 2. 快速上手

### 2.1 新增一种弹窗的步骤

1. 在 `PopupManager.ts` 的 `PopupDataMap` 中声明数据类型：
   ```ts
   export interface PopupDataMap {
       // ...
       Mail: { mailId: number }
   }
   ```
2. 在 `PopupPriority` 中登记优先级（`satisfies Record<keyof PopupDataMap, number>` 保证不会漏登记）：
   ```ts
   Mail: 120,
   ```
3. 注册配置（二选一，见下面两节）。
4. 业务代码只调用：
   ```ts
   popup.open('Mail', { mailId: 42 })   // data 类型会被编译器检查
   ```

### 2.2 方式一：手动 register

```ts
popup.register('LevelUp', {
    priority: PopupPriority.LevelUp,
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
@PopupWindow('Reward', { priority: PopupPriority.Reward, tutorial: step => step >= 3 })
class RewardPopup implements PopupComponent<PopupDataMap['Reward']> {
    @Condition
    static notInBattle() { return !player.inBattle }

    @AfterTutorial
    static keep(data: PopupDataMap['Reward'], waited: number) {
        return data.itemId !== NEWBIE_GIFT_ID
    }

    onShow(data: PopupDataMap['Reward'], close: (result?: unknown) => void) { /* 显示 */ }
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
| `tutorial` | `'allow' \| 'defer' \| 'drop' \| (step) => GuardResult \| boolean` | `'defer'` | 新手引导期间的策略，见第 6 节 |
| `conditions` | `PopupCondition<D>[]` | `[]` | 弹出条件，按顺序检查，第一个不是 `show` 的结果生效 |
| `unique` | `'data' \| 'type' \| 'none'` | `'data'` | 去重方式，见第 7 节 |
| `onDuplicate` | `'ignore' \| 'replace'` | `'ignore'` | 发现重复时保留旧的，还是用新的替换排队中的旧的 |
| `dataKey` | `(data) => string` | 稳定序列化 | 自定义去重 key（数据含 Map/Set/类实例，或只按 id 去重时使用） |
| `preempt` | `boolean` | `false` | 能否抢占正在显示的、优先级**更低**的弹窗 |
| `ttl` | `number`（毫秒） | 无 | 排队超时：入队后超过该时间仍未弹出则丢弃；显示过的弹窗不受影响 |
| `afterTutorial` | `(data, waited) => boolean` | 全部保留 | 引导结束时，被引导拦下的弹窗是否还要弹，`false` 丢弃 |

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
new PopupSystem<M>(scheduler = queueMicrotask, now = Date.now)
```

- `scheduler`：何时执行挑选。默认微任务——同一段同步代码里的多个 `open` 先全部入队，再统一按优先级挑选。
- `now`：时间来源，测试 `ttl` 时可以传入假时钟。

### 方法

| 方法 | 说明 |
| --- | --- |
| `setView(view)` | 设置视图适配器。设置前弹窗只排队不显示 |
| `register(type, config)` | 注册配置；重复注册覆盖旧配置（只影响之后 `open` 的弹窗）。返回 `this` 可链式调用 |
| `open(type, data)` | 请求打开，返回 `OpenResult`。未注册的类型直接抛异常（开发期错误，尽早暴露） |
| `close(id, result?)` | 显示中的 → `hide` 并以 `closed` 结束；排队中的 → 以 `cancelled` 结束。返回弹窗是否存在 |
| `closeAll()` | 关闭全部（切换账号、回登录界面） |
| `setTutorial(active, step = 0)` | 设置新手引导状态与当前步骤 |
| `pause()` / `resume()` | 暂停/恢复弹出（加载、战斗、过场）。已显示的不受影响 |
| `refresh()` | 外部状态变化后通知重新检查条件，让被 `wait` 卡住的弹窗有机会弹出 |
| `currentPopup` | 当前显示的弹窗信息或 `null` |
| `queuedPopups` | 排队中的弹窗（按弹出顺序），用于调试面板 |
| `has(id)` | 弹窗是否还存在（排队中或显示中） |

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
| `dropped` | 被新手策略、弹出条件或 `afterTutorial` 丢弃，或 `view.show` 抛异常 |
| `expired` | 排队超过 `ttl` |
| `replaced` | 被同类型新弹窗替换（`onDuplicate: 'replace'`） |

### 视图适配器 `PopupView<M>`

| 方法 | 调用时机 | UI 需要保证 |
| --- | --- | --- |
| `show(info)` | 弹出；被抢占/被引导收起后**恢复时会再次调用** | 支持同一个弹窗多次 `show` |
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

`pump` 的流程（`Popup.ts:463`）：

1. 没有 `view` → 直接返回。
2. 引导进行中且有弹窗正在显示 → 用新手策略重新检查它：
   `defer`/`wait` → 收起放回队列并标记 `blockedByTutorial`；`drop` → 丢弃。
3. 暂停中 → 到此为止，不弹出新的。
4. 从队首开始遍历队列：
   1. 未显示过且超过 `ttl` → 移除，`expired`；
   2. 有弹窗在显示时，只有**优先级更高且 `preempt: true`** 的才有资格。由于队列有序，遇到优先级 ≤ 当前的就可以直接 `break`；
   3. `evaluate`（新手策略 → 各个条件）：`wait` 跳过看下一个，`drop` 移除，`show` 进入下一步；
   4. `display` 显示，**一次 pump 最多显示一个**。

`display`（`Popup.ts:526`）：如果是抢占，先 `hide` 当前弹窗并以**原 `seq`** 插回队列，因此恢复时它仍排在同优先级后来者前面。

### 5.3 队列实现

队列是「有序数组 + 二分插入」，排序规则 `before(a, b)`：优先级高的在前，相同优先级 `seq` 小（先来）的在前。

没有用堆，因为弹窗队列通常只有几个到几十个元素，而 `pump` 需要「按顺序遍历、跳过 `wait` 的」和「从中间删除」，有序数组更简单直接。

### 5.4 内部索引

| 字段 | 作用 |
| --- | --- |
| `queue` | 排队中的记录，始终有序 |
| `current` | 正在显示的记录（最多一个） |
| `records` | `id → 记录`，排队中 + 显示中，用于 `close(id)` |
| `dedup` | `去重 key → 记录`，排队中 + 显示中 |

所有「弹窗彻底结束」都走 `finish()`（`Popup.ts:646`）：清理 `records` 和 `dedup`、对显示过的弹窗调用 `view.dispose`、完成 `closed` Promise。

---

## 6. 新手引导模式

每种弹窗通过 `tutorial` 声明引导期间的策略：

| 策略 | 行为 | 适用 |
| --- | --- | --- |
| `allow` | 引导期间也可以弹 | 引导自身的弹窗、强制公告 |
| `defer`（默认） | 等引导结束再弹 | 大多数弹窗：不打断引导，也不会丢失 |
| `drop` | 引导期间触发的直接丢弃 | 时效性强、过后没有意义的提示 |
| 函数 `(step) => …` | 按当前引导步骤判断 | 例如第 3 步（领奖教学）之后才允许弹奖励 |

`setTutorial(active, step)` 的三种情况：

- **引导开始 / 步骤推进**：遍历队列，把会被新手策略拦下的记录标记 `blockedByTutorial`；正在显示的、不再允许的弹窗会在下一次 `pump` 中被收起或丢弃。
- **引导结束**（只在「进行中 → 结束」那一刻）：同步执行 `checkAfterTutorial`，对标记过的记录调用 `afterTutorial(data, waited)`，返回 `false` 的立即以 `dropped` 结束。同步执行是为了让被丢弃的弹窗没有机会先弹出来。
- 之后再 `schedule`，按优先级依次弹出剩下的。

为什么在 `open` / `setTutorial` 中打标记，而不是在 `evaluate` 中？因为有弹窗正在显示时，低优先级弹窗根本走不到 `evaluate`，会漏标（见 `Popup.ts:581` 的注释）。

`afterTutorial` 的典型用法：

```ts
afterTutorial: (data, waited) =>
    data.itemId !== NEWBIE_GIFT_ID    // 新手礼包在引导中已经展示过
    && waited < 10 * 60_000           // 被拦了 10 分钟以上的已经过时
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
| `view.show` | 打印错误，以 `dropped` 结束该弹窗，继续弹下一个 |
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

管理器只依赖 `PopupComponent` 接口，所以 UI 用什么架构写都可以。`MvcPopup` 和 `MvvmPopup` 是两个适配器基类，注册方式（`@PopupWindow`）和业务调用方式（`popup.open`）完全相同，Model 层两种写法共用。

### MVC：`MvcPopup<D, V>`

子类实现 `createView`、`onCreate`（绑定 View 事件、订阅 Model）、`render`（把数据推给 View），可选 `onDestroy`。

| 管理器回调 | MvcPopup 内部 |
| --- | --- |
| `onShow`（首次） | `createView` → `onCreate` → `render` → `view.show` |
| `onShow`（恢复） | `render` → `view.show` |
| `onHide` | `view.hide` |
| `onDispose` | `onDestroy` → 释放订阅（`disposables`） → `view.destroy` |

数据流是**命令式**的：Controller 收到 Model 变化后主动调用 `render`。

### MVVM：`MvvmPopup<D, VM, V>`

- `PopupViewModel<D>`：实现 `onInit(data)`，用 `Observable` / `Computed` 表示状态、`Command` 表示操作，可选 `onActive` / `onInactive` / `onDispose`；用 `track()` 登记需要释放的 `Computed`。
- `MvvmView<VM>`：实现 `bind(vm)`、`show`、`hide`，用 `bindValue` / `bindCommand` 绑定。
- `MvvmPopup`：实现 `createViewModel`、`createView`，负责组装。

| 管理器回调 | MvvmPopup 内部 |
| --- | --- |
| `onShow`（首次） | `createViewModel` → `vm.init` → `createView` → `view.bind(vm)` → `vm.onActive` → `view.show` |
| `onShow`（恢复） | `vm.onActive` → `view.show`（状态保留在 VM 中） |
| `onHide` | `view.hide` → `vm.onInactive`（例如暂停倒计时） |
| `onDispose` | `view.destroy`（先解除绑定）→ `vm.dispose` |

数据流是**声明式**的：ViewModel 只改状态，View 通过绑定自动刷新；ViewModel 不引用 View，可以脱离 UI 单测。

### 响应式工具（`arch/Observable.ts`）

| 类 | 说明 |
| --- | --- |
| `Observable<T>` | 可观察值，值相同（默认 `Object.is`）不通知；`subscribe(listener, immediate = true)` |
| `Computed<T>` | 派生值，**显式声明依赖**（不做自动依赖收集），用完必须 `dispose` |
| `Command<A>` | 封装用户操作 + `canExecute` 可观察状态；不可执行时 `execute` 返回 `false` |
| `DisposeBag` | 收集取消函数，`dispose` 时一次性释放 |

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
