# 红点系统（Red Dot / Badge System）代码说明

红点按「路径」组织成一棵树：父节点的数值 = 自身数值 + 所有子节点数值之和。业务代码只修改叶子，UI 只监听自己绑定的节点，祖先的汇总和刷新都由系统完成。

本实现主要针对**子红点高频更新**的场景做了优化（批量领取邮件、背包刷新时，一帧内同一个叶子可能被修改上千次）。

```
Main
├── Mail
│   ├── System      （叶子：系统邮件未读数）
│   └── Friend      （叶子：好友邮件未读数）
└── Bag
    └── Item/1001   （叶子：某个道具是否是新的）
```

---

## 1. 文件结构

| 文件 | 作用 |
| --- | --- |
| `RedDot.ts` | 核心实现 `RedDotSystem` 和内部的 `RedDotNode`。只有类，没有副作用，可在测试中随意 `new` |
| `RedDotManager.ts` | 全局单例 `redDot` + 路径常量 `RedDotPath`。业务代码和 UI 只从这里引用 |
| `demo.ts` | 功能演示 + 与朴素实现的性能对比 |
| `RedDotSignal.ts` | 与 [MVVM_MVC 框架](../MVVM_MVC/README.md) 的桥接：`redDotSignal`（读取）、`syncRedDot` / `syncRedDotMap`（写入），见第 9 节 |
| `bridgeDemo.ts` | 演示：Model 驱动红点，MVVM 主界面和 MVC 邮件页签同时显示 |

运行演示：

```bash
cd TypeScripts
npx tsc
node dist/AIFramework/RedDot/demo.js
node dist/AIFramework/RedDot/bridgeDemo.js
```

---

## 2. 快速上手

### 2.1 新增一个红点

1. 在 `RedDotManager.ts` 的 `RedDotPath` 中登记路径。路径本身就决定了父子关系，这个对象同时也是整棵红点树的「目录」：
   ```ts
   export const RedDotPath = {
       // ...
       Task: 'Main/Task',
       TaskDaily: 'Main/Task/Daily',
       /** 动态路径用函数生成，保证格式统一 */
       TaskItem: (taskId: number) => `Main/Task/Item/${taskId}`,
   } as const
   ```
2. 业务代码修改叶子的值：
   ```ts
   redDot.set(RedDotPath.TaskDaily, unfinishedCount)   // 直接设置
   redDot.add(RedDotPath.MailSystem, 1)                // 在当前值上增减
   redDot.remove(RedDotPath.BagItem(1001))             // 删除节点及其子树
   ```
3. UI 监听节点，销毁时取消监听：
   ```ts
   const off = redDot.on(RedDotPath.Main, count => {
       dot.visible = count > 0
       dot.text = String(count)
   })
   // 组件销毁时
   off()
   ```

不需要手动创建中间节点：第一次访问 `Main/Task/Daily` 时，`Main`、`Main/Task` 会自动创建。

### 2.2 为什么用模块级常量做单例

- 主界面按钮要汇总所有模块的红点，只有挂在同一棵树上才能自动累加；
- 所有更新进入同一个 `pending`，一批只 flush 一次，合并效果最好；
- ES 模块只执行一次并被缓存，任何地方 `import` 拿到的都是同一个 `redDot`，不需要 `getInstance()` 和判空；
- `RedDotSystem` 仍是普通类，测试（以及 `demo.ts` 中的性能测试）可以 `new` 一个干净的实例。

---

## 3. API 参考（`RedDotSystem`）

### 构造

```ts
new RedDotSystem(scheduler = queueMicrotask)
```

`scheduler` 决定什么时候执行 `flush`：

| 调度方式 | 写法 | 效果 |
| --- | --- | --- |
| 微任务（默认） | `queueMicrotask` | 同一段同步代码里的所有更新合并成一批，适合普通 UI |
| 按帧 | `flush => requestAnimationFrame(() => flush())` | 一整帧的更新合并成一批，每帧最多刷新一次 UI，适合游戏/动画 |
| 手动 | `() => {}` | 不自动提交，由使用者自己调用 `flush()` |

全局使用哪种调度方式，统一在 `RedDotManager.ts` 中决定。

### 方法

| 方法 | 说明 |
| --- | --- |
| `set(path, value)` | 设置节点**自身**的值。只记入 `pending`，不立即生效；值没变则什么也不做 |
| `add(path, delta)` | 在「尚未提交的最新值」上增减（`delta` 可为负数） |
| `remove(path)` | 删除节点及整棵子树，祖先扣掉这棵子树已提交的汇总值 |
| `clear()` | 把所有节点的自身值清零。树结构和监听者都保留（切换账号时使用） |
| `get(path)` | 读取**已提交**的汇总值；路径不存在返回 `0`，且不会创建节点 |
| `isShow(path)` | `get(path) > 0` |
| `on(path, listener, immediate = true)` | 监听汇总值变化，返回取消函数。路径不存在会先创建，可以先绑定 UI 再有数据 |
| `flush()` | 立即提交所有待处理的更新并通知监听者 |

监听者签名：

```ts
type RedDotListener = (count: number, path: string) => void
```

`path` 用于同一个回调绑定多个节点时区分来源。

---

## 4. 优化思路

### 4.1 朴素实现的问题

每次叶子变化都：

1. 从根开始 `split` 路径、逐层查找节点；
2. 对每个祖先**重新遍历整棵子树求和**；
3. **立即**通知所有相关 UI。

同一个叶子在一帧内被改 1000 次，就会触发 1000 次遍历 + 1000 次 UI 刷新，而用户只看得到最后一次的结果。

### 4.2 本实现的六个优化

| # | 优化 | 实现 | 效果 |
| --- | --- | --- | --- |
| 1 | 路径缓存 | `nodes: Map<路径, 节点>` | 更新时 O(1) 定位，只有第一次出现的路径才 `split` |
| 2 | 增量更新 | `propagate` 沿父链加上差值 `delta` | 代价 O(深度)，与兄弟节点数量无关 |
| 3 | 写合并 | `pending: Map<节点, 最新自身值>` | 同一节点多次修改只保留最后一次，只传播一次 |
| 4 | 批量通知 | `schedule` + `scheduled` 标记 | 1000 次 `set` 只产生 1 次 flush，每个节点最多通知一次 |
| 5 | 只比较最终结果 | `count !== notified` 才通知 | `+1` 再 `-1`、兄弟一增一减时父节点不刷新 |
| 6 | 只追踪有监听者的节点 | `listeners` 懒创建，`null` 表示无人监听 | 没人监听的节点只改数字，不进入 `dirty` |

---

## 5. 数据结构

### 5.1 节点 `RedDotNode`

节点只是数据容器，逻辑全部放在 `RedDotSystem` 中。

| 字段 | 含义 |
| --- | --- |
| `key` | 路径中的最后一段（如 `System`），用于从父节点的 `children` 中删除自己 |
| `path` | 完整路径（如 `Main/Mail/System`） |
| `parent` | 父节点；顶层节点的父节点是虚拟根 |
| `children` | `Map<key, 子节点>` |
| `selfCount` | 自身的值，即通过 `set`/`add` 设置的值。通常只有叶子会设置，中间节点也可以（例如页签自己也有提醒） |
| `count` | 汇总值 = `selfCount` + 子节点 `count` 之和。**不是算出来的，而是增量维护的** |
| `notified` | 上一次通知监听者时的 `count`，用来判断 UI 是否真的需要刷新 |
| `listeners` | 监听者集合，懒创建；`null` 表示无人监听 |

### 5.2 系统 `RedDotSystem`

| 字段 | 含义 |
| --- | --- |
| `root` | 虚拟根节点，让多个顶层节点有共同的父节点。不对外暴露、不能监听，也不维护它的 `count` |
| `nodes` | 路径 → 节点的扁平缓存（不含 `root`） |
| `pending` | 本批次待提交的修改：节点 → 最新的自身值 |
| `dirty` | 本批次汇总值可能变化、且有监听者的节点 |
| `scheduled` | 是否已经向调度器申请过 flush |

---

## 6. 一次更新的完整流程

```
set / add ──▶ pending（只记最新值） ──▶ schedule（每批只调度一次）
                                              │
                                              ▼
flush 阶段一：pending 逐个算 delta ──▶ propagate 沿父链累加 ──▶ 有监听者的节点进入 dirty
                                              │
                                              ▼
flush 阶段二：遍历 dirty，count !== notified 才回调监听者
```

### 6.1 写入：`set` / `add`（`RedDot.ts:183`）

- `set` 先与**当前最新值**比较：本批次已有待提交的值就以它为准，否则以 `selfCount` 为准。值没变直接返回，连调度都不需要。
- `pending.set` 覆盖同一个 key，实现写合并。
- `add` 的基准值必须是 `pending` 中的值而不是 `selfCount`：否则同一批里连续两次 `add(1)` 读到的都是旧的 `selfCount`，结果会少加一次。

### 6.2 提交：`flush`（`RedDot.ts:298`）

分两个阶段，**先把所有数值算完再通知**，保证监听者回调里 `get` 任何节点都能读到一致的最新值：

1. **阶段一 提交数值**：对 `pending` 中的每个节点，`delta = 最新值 - selfCount`；`delta` 为 0（例如先改成 3 又改回原值）则跳过，否则写入 `selfCount` 并 `propagate(node, delta)`。
2. **阶段二 通知**：遍历 `dirty`，跳过已无监听者、或 `count === notified` 的节点；其余更新 `notified` 并依次回调。单个监听者抛异常会被捕获并打印，不影响其他监听者。

两个细节：

- 开头先把 `scheduled` 复位，回调里产生的新更新可以调度下一次 flush。
- `pending` 和 `dirty` 都是**先换出成新容器再遍历**。回调里再 `set` 的值进入下一批，不会出现「边遍历 Map 边写入」导致的不确定行为。

### 6.3 增量传播：`propagate`（`RedDot.ts:345`）

```ts
for (let n = from; n && n !== this.root; n = n.parent) {
    n.count += delta
    if (n.listeners) this.dirty.add(n)
}
```

子节点变化了 `delta`，它的每个祖先的汇总值也恰好变化 `delta`，不需要重新遍历兄弟节点求和。背包里有 1000 个道具时，一次更新的代价也只和树的深度有关。

### 6.4 删除：`remove`（`RedDot.ts:210`）

1. 遍历子树：丢弃子树在 `pending` 中尚未提交的修改、从 `dirty` 和 `nodes` 缓存中移除；
2. 从父节点的 `children` 中摘下整棵子树；
3. 对祖先执行 `propagate(parent, -node.count)`。祖先的 `count` 中只包含子树**已提交**的值（`pending` 中的从未加进去），所以扣掉 `node.count` 即可；
4. `schedule` 一次，通知祖先的监听者。

### 6.5 监听：`on`（`RedDot.ts:269`）

- 第一个监听者绑定时，把 `notified` 设为当前 `count`：无人监听期间 `notified` 不会更新，可能是很久以前的值。
- `immediate = true` 时立刻用当前值回调一次，用于 UI 显示初始状态。
- 最后一个监听者取消时把 `listeners` 置回 `null`，之后 `propagate` 不再把它加入 `dirty`。

---

## 7. 性能对比

`demo.ts` 中的 benchmark：200 个叶子（`Main/Mail`、`Main/Bag` 下各约 100 个），20 万次随机更新，分 50 帧提交，监听 `Main`、`Main/Mail`、`Main/Bag` 三个节点。

| | 朴素实现 | 红点系统 |
| --- | --- | --- |
| 定位节点 | 每次 `split` + 逐层查找 | `Map` 命中 |
| 祖先求和 | 每次重新遍历子树 | 沿父链加 `delta` |
| UI 通知次数 | 每次更新通知 2 个被监听的祖先（`Main` + `Main/Mail` 或 `Main/Bag`）= 40 万次 | 最多 3 个节点 × 50 帧 = **150** 次（值不变的帧不通知，实际可能更少） |

两种实现使用完全相同的更新序列，耗时以本机实际运行结果为准。

---

## 8. 使用注意事项

- **写入是延迟生效的**：同一段同步代码里 `set` 之后立刻 `get` 读到的仍是旧值。需要立刻读到最新值时先调用 `flush()`，或 `await` 一次（默认微任务调度时）。
- **UI 销毁时务必调用 `on` 返回的取消函数**，否则节点会一直引用回调，造成内存泄漏和无效刷新。
- **路径一律使用 `RedDotPath` 中的常量**，不要手写字符串。拼错的路径会静默创建一个新节点，而不会报错。
- **`remove` 后，绑定在被删除节点（及其子树）上的监听者不会再收到任何通知**，也不会收到「变为 0」的通知；之后对同一路径 `set` 会创建一个全新的节点，旧监听者不会自动迁移过去。只有祖先节点的监听者能感知删除。所以：
  - 动态节点（如 `BagItem(id)`）的 UI 应在删除前自行取消监听；
  - 需要保留绑定、只是数值归零时，用 `set(path, 0)` 而不是 `remove`。
- **切换账号用 `clear()` 而不是重新 `new`**：`clear` 保留树结构和监听者，UI 不需要重新绑定，只会在下一次 flush 收到「变为 0」的通知；单例也因此永远不需要被替换。
- **系统不限制数值范围**：`add` 减到负数不会被截断为 0，负数会照样累加到祖先。业务层需要保证不会多减。
- **`on` 和 `set` 会创建节点，节点不会被自动回收**：大量一次性的动态路径用完后应 `remove`。`get` 不会创建节点，可以放心读取。
- **中间节点也可以有自身的值**：例如 `set('Main/Mail', 1)` 表示邮件页签自己有一个提醒，它的汇总值 = 1 + 子节点之和。

---

## 9. 接入 MVVM_MVC 框架（`RedDotSignal.ts`）

红点系统本身**不改动**，只在两端桥接：

```
Model（框架） ──syncRedDot / syncRedDotMap──▶ redDot ──redDotSignal──▶ ViewModel / Controller（框架）
```

为什么不用 `signal` / `computed` 重写红点树：父节点增量求和是 O(深度)，`computed` 求和要遍历全部子节点；红点系统能跨微任务、按帧合并写入，`signal` 是同步传播的，`batch` 只能合并同一段同步代码；可替换的调度器也是框架没有的。两者各管各的：红点树负责计数和合并，框架负责界面状态和生命周期。

### 9.1 读取桥：红点 -> signal

`redDotSignal(system, path)` 返回 `RedDotSignal`，它既是 `ReadonlySignal<number>`，也是 `IDisposable`，直接登记到所属对象上，界面结束时自动取消监听：

```ts
class MainMenuViewModel extends ViewModel {
    readonly count: ReadonlySignal<number>
    readonly showBadge: ReadonlySignal<boolean>

    constructor(game: GameModel) {
        super()
        this.count = this.addDisposable(redDotSignal(redDot, RedDotPath.Main))   // dispose 时取消
        // 红点可以和其他状态组合：战斗中不显示
        this.showBadge = computed(() => this.count.value > 0 && !game.state.inBattle)
    }
}

class MailTabController extends Controller<MailTabView> {
    protected onStart() {
        const dot = this.addDisposable(redDotSignal(redDot, RedDotPath.Mail))     // stop 时取消
        this.observe(dot, n => this.view.renderBadge(n), { immediate: true })
    }
}
```

### 9.2 写入桥：Model -> 红点

应用启动时建立一次，之后业务代码只改 Model，不再手动调用 `redDot.set`：

```ts
syncRedDot(redDot, RedDotPath.MailSystem, () => mailModel.unread('system'))
// 动态红点：结果中新出现的 key 创建节点，消失的 key 自动 remove
syncRedDotMap(redDot, RedDotPath.BagItem, () => bagModel.state.newItems)   // { [itemId]: 1 }
```

`compute` 中读取的 Model 状态自动成为依赖。Model 每次变化都会同步调用一次 `redDot.set`，但红点系统会把它们合并：演示中连续收 1000 封邮件，界面只刷新一次。

### 9.3 注意事项

- 一次变化会先等红点系统 flush（默认微任务），再同步传给界面，所以修改 Model 后要 `await` 一次才能看到界面变化；
- `syncRedDotMap` 对消失的 key 调用 `remove`，与第 8 节相同：绑定在被删除节点上的 `redDotSignal` 不会再收到通知。动态节点的界面应随数据一起销毁；需要保留绑定时，让 `compute` 返回 0 而不是删掉这个 key；
- 写入桥的取消函数调用后，红点保留最后的值，需要归零时自己 `set(path, 0)`；
- `syncRedDot` 管理的叶子不要再在别处手动 `set`，否则两边会互相覆盖。
