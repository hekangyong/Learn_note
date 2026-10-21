# MVVM / MVC 框架（可商用版）

一套与平台无关的 TypeScript MVVM + MVC 基础设施，零依赖。MVC 和 MVVM **共用同一个 Model 层**，同一个项目里可以混用：简单界面用 MVC，复杂表单 / 列表用 MVVM。

```
             ┌──────────────── Model（业务数据 + 业务规则，共用）────────────────┐
             │                                                                  │
MVC ：View ─意图─> Controller ─调用─> Model ─变化─> Controller ─主动 render─> View
MVVM：View <─绑定─ ViewModel（signal / computed / Command）─读取─> Model
```

与旧版 `Popup/arch/Observable.ts`（已删除）的区别：旧版和弹窗系统绑在一起，依赖要手写列表，Computed 必须手动 dispose。新版是独立的通用框架，响应式内核自动收集依赖、没有毛刺、不会泄漏，并补齐了异步命令、错误边界和生命周期这些商用必需的部分。弹窗系统的 `MvcPopup` / `MvvmPopup` 现在就是基于本框架实现的，见 [Popup/README.md](../Popup/README.md) 第 10 节。

---

## 1. 文件结构

| 文件 | 作用 |
| --- | --- |
| `core/reactive.ts` | 响应式内核：`signal` / `computed` / `effect` / `batch` / `untracked` / `watch` |
| `core/Disposable.ts` | `DisposableStore`：统一释放订阅、定时器 |
| `core/Emitter.ts` | 类型安全的事件派发器 |
| `core/errors.ts` | 全局错误出口 `setErrorHandler`，接入日志 / Sentry |
| `model/Model.ts` | Model 基类：不可变状态、`select` / `observe` |
| `mvc/MvcView.ts`、`mvc/Controller.ts` | MVC |
| `mvc/MultiController.ts` | MVC：一个 Controller 驱动多个 View（Cocos 等组件化界面） |
| `mvvm/ViewModel.ts`、`mvvm/MvvmView.ts`、`mvvm/Command.ts` | MVVM |
| `index.ts` | 统一出口，业务代码只从这里引用 |
| `demo.ts` | 同一个 TodoModel 分别用 MVC 和 MVVM 驱动 |
| `test.ts` | 自测用例（无测试框架依赖，失败时退出码非 0） |

```bash
cd TypeScripts
tsc
node dist/AIFramework/MVVM_MVC/demo.js
node dist/AIFramework/MVVM_MVC/test.js
```

---

## 2. Model（两种架构共用）

```ts
class CartModel extends Model<{ items: readonly Item[]; coupon: string | null }> {
    constructor(private readonly api: CartApi) {
        super({ items: [], coupon: null })
    }
    /** 业务规则写在 Model 里，Controller / ViewModel 不重复写 */
    add(item: Item) {
        if (this.state.items.length >= 99) throw new Error('购物车已满')
        this.setState(s => ({ items: [...s.items, item] }))
    }
}
```

- `setState` 是 `protected` 的，外部只能通过业务方法修改数据；
- 状态浅冻结，误改（`model.state.items.push(...)`）会立刻暴露；
- 所有字段都没变时 `setState` 不通知；
- `model.select(s => s.items.length)` 只在选择结果变化时通知；选择结果是新对象 / 数组时传 `shallowEqual`。

---

## 3. MVC

```ts
type Intents = { add: [title: string]; toggle: [id: number] }

class TodoView extends MvcView<Intents> {
    renderList(items: readonly Todo[]) { /* 刷新控件 */ }
    protected onMount() { button.onclick = () => this.emit('add', input.value) }
    protected onUnmount() { button.onclick = null }
}

class TodoController extends Controller<TodoView> {
    constructor(view: TodoView, private readonly model: TodoModel) { super(view) }

    protected onStart() {
        this.listen('add', title => this.model.add(title))      // 参数类型自动推导，可以是 async
        this.observe(this.model.state$, s => this.view.renderList(s.items), { immediate: true })
    }
    protected onError(error: unknown, context: string) {         // 错误边界
        toast(`${context} 失败`)
    }
}

const controller = new TodoController(new TodoView(), model)
controller.start()    // 显示
controller.stop()     // 隐藏，监听全部释放，可以再次 start
controller.dispose()  // 销毁，连同 View 一起
```

### 3.1 一个 Controller，多个 View（MultiController）

`Controller` 和一个 View 绑在一起：构造时传入 View，`dispose` 时连 View 一起销毁。Cocos 里 View 是节点上的组件，由引擎创建、销毁，同一份数据又常常显示在多个界面上，每个界面 new 一个 Controller 就会把 Model 观察和意图处理重复注册多次。这时用 `MultiController`：

| | `Controller` | `MultiController` |
| --- | --- | --- |
| 数量 | 每个 View 一个 | 全局一个 |
| Model 观察 | 每个 View 注册一次 | `start()` 时只注册一次 |
| View | 构造时注入 | 运行时 `attach` / `detach` |
| 意图 | `onStart` 里逐个 `listen` | `intents()` 写一次，每个 View 自动接线 |
| 刷新 | `this.view.renderX()` | `this.forEachView(v => v.renderX?.())` |
| 销毁 View | 会 | 不会，View 归引擎节点管 |

```ts
interface TodoPanel extends IMvcView<TodoIntents> {
    renderList?(items: readonly Todo[]): void   // 列表面板实现
    renderCount?(remaining: number): void       // 角标实现
}

class TodoController extends MultiController<TodoIntents, TodoPanel> {
    constructor(private readonly model: TodoModel) { super() }

    protected intents(): IntentHandlers<TodoIntents> {
        return { add: title => this.model.add(title), toggle: id => this.model.toggle(id) }
    }
    protected onStart() {
        this.observe(this.model.state$, s => this.forEachView(v => this.render(v, s)))
    }
    /** Model 观察早于 View 出现，新挂上的 View 补一次当前状态 */
    protected onAttach(view: TodoPanel) {
        this.render(view, this.model.state)
    }
    private render(v: TodoPanel, s: TodoState) {
        v.renderList?.(s.items)
        v.renderCount?.(s.items.filter(t => !t.done).length)
    }
}

// 启动时执行一次
export const todoController = new TodoController(todoModel)
todoController.start()
```

Cocos 组件必须继承 `Component`，不能继承 `MvcView`。`MultiController` 只要求 View 满足 `IMvcView`（能 `on` 监听意图，`mount` / `unmount` 可选），组件自己持有一个 `Emitter` 就行：

```ts
export abstract class MvcComponent<I extends EventMap<I>> extends Component implements IMvcView<I> {
    private readonly emitter = new Emitter<I>()
    on<K extends keyof I>(intent: K, handler: Listener<I[K]>) { return this.emitter.on(intent, handler) }
    protected emit<K extends keyof I>(intent: K, ...args: I[K]) {
        if (this.enabledInHierarchy) this.emitter.emit(intent, ...args)
    }
    protected onDestroy() { this.emitter.clear() }
}

@ccclass('TodoListPanel')
export class TodoListPanel extends MvcComponent<TodoIntents> implements TodoPanel {
    onEnable()  { todoController.attach(this) }
    onDisable() { todoController.detach(this) }
    renderList(items: readonly Todo[]) { /* 刷新 ScrollView */ }
    onClickAdd() { this.emit('add', this.editBox.string) }
}
```

- 可以在 `start` 之前 `attach`（组件的 `onEnable` 先于启动逻辑执行时），意图照常接线，Model 观察在 `start` 后开始；
- 单个 View 刷新出错进入 `onError(error, 'render')`，不影响其他 View；
- 一个 View 可以同时挂在多个 Controller 上（意图表写成 `MvcView<CoinIntents & ProfileIntents>`），每个 Controller 只处理自己 `intents()` 里的意图；第一个 attach 时才 `mount`，最后一个 detach 时才 `unmount`。不同 Controller 的意图不要重名，否则会被两边同时处理；
- 各界面关心的数据差别很大时，按需 `observe(model.select(...))`，避免为了一个角标刷新整张列表。

---

## 4. MVVM

```ts
class TodoViewModel extends ViewModel {
    readonly draft = signal('')
    readonly filter = signal<'all' | 'done'>('all')
    readonly visible: ReadonlySignal<readonly Todo[]>
    readonly add: AsyncCommand

    // 用到构造参数的成员放在构造函数体里赋值（字段初始化先于参数属性赋值执行）
    constructor(private readonly model: TodoModel) {
        super()
        // 依赖自动收集：filter 和 model 任一变化都会重新计算
        this.visible = computed(() =>
            this.filter.value === 'all' ? model.state.items : model.state.items.filter(t => t.done))
        // 自带 isRunning / error / 取消
        this.add = this.asyncCommand(async signal => {
            await model.add(this.draft.peek(), signal)
            this.draft.value = ''
        }, { canExecute: () => this.draft.value.trim() !== '' })
    }
}

class TodoView extends MvvmView<TodoViewModel> {
    protected onBind(vm: TodoViewModel) {
        this.bind(vm.visible, items => renderList(items))
        this.bindTwoWay(vm.draft, v => (input.value = v), commit => {
            const handler = () => commit(input.value)
            input.addEventListener('input', handler)
            return () => input.removeEventListener('input', handler)
        })
        this.bindCommand(vm.add, enabled => (button.disabled = !enabled))
        this.bind(vm.add.isRunning, loading => (spinner.visible = loading))
    }
}

view.mount(vm)    // 绑定 + vm.activate()
view.unmount()    // 解绑 + vm.deactivate()，ViewModel 状态保留
vm.dispose()      // 由创建 ViewModel 的一方负责
```

### AsyncCommand 并发策略

| 策略 | 行为 | 适用场景 |
| --- | --- | --- |
| `drop`（默认） | 执行中再次调用直接忽略，按钮自动置灰 | 提交、购买，防止重复点击 |
| `restart` | 取消上一次（AbortSignal），以最新一次为准 | 搜索、刷新列表 |

`execute` 返回 `{ ok: true, value } | { ok: false, reason: 'disabled' | 'aborted' | 'error' }`，不会抛错。UI 事件回调里抛出的异常没人能接住，所以错误会写入 `error` 状态并上报。

---

## 5. 响应式内核的保证

| 特性 | 说明 |
| --- | --- |
| 自动依赖收集 | `computed` / `effect` 里读到什么就依赖什么，包括条件分支里的动态依赖 |
| 无毛刺 | 菱形依赖 `a → b, c → d` 修改 `a` 时 `d` 只计算一次，不会读到中间状态 |
| 惰性 + 缓存 | `computed` 被读取时才计算，依赖没变就用缓存 |
| 不泄漏 | 没有被 effect 使用的 `computed` 自动从上游脱离，不需要手动 dispose |
| 批量更新 | `batch(() => { a.value = 1; b.value = 2 })` 只触发一次 effect |
| 安全 | 循环依赖抛错；在 computed 里修改 signal 抛错；effect 死循环超过 10 万次会被打断并上报 |
| 错误隔离 | 单个 effect / 监听器出错只上报，不影响其他 |

算法是推拉结合的三色标记（CLEAN / CHECK / DIRTY），思路与 Preact Signals、Reactively 相同。

---

## 6. 接入建议

1. 启动时 `setErrorHandler((error, context) => logger.error(context, error))`；
2. Model 用单例或依赖注入容器管理，Controller / ViewModel 通过构造函数接收，测试时传入假的 Repository；
3. 平台适配只写 View：DOM、React（在 `useEffect` 里 `mount` / `unmount`）、Cocos / Unity UI 都一样；
4. 每个界面的资源都挂在 `disposables` / `addDisposable` / `addBinding` 上，不要手动管理取消函数。

## 7. 限制

- `effect` 没有父子所有权：在 effect 内部创建的 effect 需要自己释放（用 `ViewModel.effect` 就会自动释放）；
- 状态是浅冻结，深层对象需要自己保持不可变写法；
- 没有内置 DOM 模板 / 指令系统，这是有意的：框架只负责架构分层，渲染交给具体平台。
