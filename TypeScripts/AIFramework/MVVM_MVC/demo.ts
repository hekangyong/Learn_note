/**
 * 演示：同一个 TodoModel，分别用 MVC 和 MVVM 驱动「待办列表」界面
 *
 *            ┌──────────── TodoModel（业务规则，两种架构共用）────────────┐
 *            │                                                          │
 *   MVC：View ─意图─> Controller ─调用─> Model ─变化─> Controller ─render─> View
 *   MVVM：View <─绑定─ ViewModel（signal / computed / Command）─读取─> Model
 *
 * View 用 console 模拟；换成 DOM / React / 游戏引擎时只需重写 View 类，Model 和
 * Controller / ViewModel 一行都不用改。
 *
 * 运行：cd TypeScripts && tsc && node dist/AIFramework/MVVM_MVC/demo.js
 */
import {
    AsyncCommand,
    Command,
    computed,
    Controller,
    IMvcView,
    IntentHandlers,
    Model,
    MultiController,
    MvcView,
    MvvmView,
    ReadonlySignal,
    signal,
    ViewModel,
} from './index'

// ============================================================
// Model 层
// ============================================================

export interface Todo {
    readonly id: number
    readonly title: string
    readonly done: boolean
}

interface TodoState {
    readonly items: readonly Todo[]
    readonly loading: boolean
}

/** 数据来源抽象：生产环境接 HTTP，测试中用内存实现 */
export interface TodoRepository {
    fetchAll(signal?: AbortSignal): Promise<Todo[]>
    create(title: string, signal?: AbortSignal): Promise<Todo>
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
        const timer = setTimeout(resolve, ms)
        signal?.addEventListener(
            'abort',
            () => {
                clearTimeout(timer)
                reject(new DOMException('Aborted', 'AbortError'))
            },
            { once: true }
        )
    })
}

export class InMemoryTodoRepository implements TodoRepository {
    private nextId = 1
    private readonly rows: Todo[] = []

    constructor(
        seed: string[] = [],
        private readonly latency = 10
    ) {
        for (const title of seed) this.rows.push({ id: this.nextId++, title, done: false })
    }

    async fetchAll(signal?: AbortSignal): Promise<Todo[]> {
        await delay(this.latency, signal)
        return [...this.rows]
    }

    async create(title: string, signal?: AbortSignal): Promise<Todo> {
        await delay(this.latency, signal)
        const todo = { id: this.nextId++, title, done: false }
        this.rows.push(todo)
        return todo
    }
}

export class TodoModel extends Model<TodoState> {
    private loadSeq = 0

    constructor(private readonly repo: TodoRepository) {
        super({ items: [], loading: false })
    }

    async load(signal?: AbortSignal): Promise<void> {
        const seq = ++this.loadSeq
        this.setState({ loading: true })
        try {
            const items = await this.repo.fetchAll(signal)
            // 数据和 loading 一起写入，界面不会出现「加载中 + 已有数据」的中间帧
            if (seq === this.loadSeq) this.setState({ items, loading: false })
        } catch (error) {
            // 并发加载时只让最后一次请求结束 loading
            if (seq === this.loadSeq) this.setState({ loading: false })
            throw error
        }
    }

    /** 业务规则（标题不能为空、不能重复）写在 Model 里，MVC 和 MVVM 都不用再写一遍 */
    async add(title: string, signal?: AbortSignal): Promise<Todo> {
        const text = title.trim()
        if (!text) throw new Error('标题不能为空')
        if (this.state.items.some(t => t.title === text)) throw new Error(`「${text}」已存在`)
        const todo = await this.repo.create(text, signal)
        this.setState(s => ({ items: [...s.items, todo] }))
        return todo
    }

    toggle(id: number): void {
        this.setState(s => ({ items: s.items.map(t => (t.id === id ? { ...t, done: !t.done } : t)) }))
    }

    clearCompleted(): void {
        this.setState(s => ({ items: s.items.filter(t => !t.done) }))
    }
}

function formatList(items: readonly Todo[]): string {
    return items.map(t => `${t.done ? '☑' : '☐'} ${t.id}.${t.title}`).join('  ') || '（空）'
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

// ============================================================
// MVC
// ============================================================

type TodoIntents = {
    add: [title: string]
    toggle: [id: number]
    clearCompleted: []
}

/** View：显示方法由 Controller 调用；用户操作翻译成意图发出 */
class ConsoleTodoView extends MvcView<TodoIntents> {
    renderList(items: readonly Todo[], loading: boolean): void {
        console.log(`  [MVC View] ${loading ? '加载中… ' : ''}${formatList(items)}`)
    }

    showError(message: string): void {
        console.log(`  [MVC View] ⚠ ${message}`)
    }

    protected override onMount(): void {
        console.log('  [MVC View] 挂载')
    }

    protected override onUnmount(): void {
        console.log('  [MVC View] 卸载')
    }

    // ---- 模拟用户操作 ----
    submit(title: string): void {
        this.emit('add', title)
    }
    clickItem(id: number): void {
        this.emit('toggle', id)
    }
    clickClear(): void {
        this.emit('clearCompleted')
    }
}

/** Controller：意图 -> Model；Model 变化 -> 主动刷新 View */
class TodoController extends Controller<ConsoleTodoView> {
    constructor(
        view: ConsoleTodoView,
        private readonly model: TodoModel
    ) {
        super(view)
    }

    protected onStart(): void {
        this.listen('add', title => this.model.add(title))
        this.listen('toggle', id => this.model.toggle(id))
        this.listen('clearCompleted', () => this.model.clearCompleted())
        this.observe(this.model.state$, state => this.view.renderList(state.items, state.loading), { immediate: true })
        this.guard('load', () => this.model.load())
    }

    /** 错误边界：任何意图处理失败都在界面上提示 */
    protected override onError(error: unknown, context: string): void {
        this.view.showError(`${context} 失败：${messageOf(error)}`)
    }
}

// ============================================================
// MVVM
// ============================================================

type Filter = 'all' | 'active' | 'done'

/** ViewModel：只有状态和命令，不引用 View */
class TodoViewModel extends ViewModel {
    readonly draft = signal('')
    readonly filter = signal<Filter>('all')
    readonly loading: ReadonlySignal<boolean>
    readonly visibleItems: ReadonlySignal<readonly Todo[]>
    readonly remaining: ReadonlySignal<number>

    readonly load: AsyncCommand
    readonly add: AsyncCommand<[], Todo>
    readonly toggle: Command<[id: number]>

    /** Model 通过构造函数注入：测试时可以传入用假仓库构造的 Model */
    constructor(private readonly model: TodoModel) {
        super()
        this.loading = model.select(s => s.loading)
        // 同时依赖 ViewModel 自己的 filter 和共享的 Model，任意一个变化都会重新计算
        this.visibleItems = computed(() => {
            const items = model.state.items
            switch (this.filter.value) {
                case 'active':
                    return items.filter(t => !t.done)
                case 'done':
                    return items.filter(t => t.done)
                default:
                    return items
            }
        })
        this.remaining = model.select(s => s.items.filter(t => !t.done).length)

        this.load = this.asyncCommand(signal => model.load(signal), { concurrency: 'restart' })
        this.add = this.asyncCommand(
            async signal => {
                const todo = await model.add(this.draft.peek(), signal)
                this.draft.value = ''
                return todo
            },
            // 业务校验交给 Model；这里只控制按钮是否可点，并且错误只显示在界面上，不上报
            { canExecute: () => this.draft.value.trim().length > 0, reportErrors: false }
        )
        this.toggle = this.command((id: number) => model.toggle(id))
    }

    protected override onActivate(): void {
        if (this.model.state.items.length === 0) void this.load.execute()
    }
}

/** 模拟一个输入框控件 */
class FakeInput {
    value = ''
    private readonly listeners = new Set<(value: string) => void>()

    onInput(listener: (value: string) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    type(text: string): void {
        this.value = text
        this.listeners.forEach(listener => listener(text))
    }
}

/** View：只做绑定，不写任何「什么时候刷新」的逻辑 */
class ConsoleTodoMvvmView extends MvvmView<TodoViewModel> {
    private readonly input = new FakeInput()

    protected onBind(vm: TodoViewModel): void {
        this.bindTwoWay(vm.draft, value => (this.input.value = value), commit => this.input.onInput(commit))
        this.bindEffect(() => {
            const prefix = vm.loading.value ? '加载中… ' : ''
            console.log(`  [MVVM View] ${prefix}[${vm.filter.value}] ${formatList(vm.visibleItems.value)}`)
        })
        this.bind(vm.remaining, n => console.log(`  [MVVM View] 剩余 ${n} 项`))
        this.bindCommand(vm.add, enabled => console.log(`  [MVVM View] 添加按钮 = ${enabled ? '可点击' : '置灰'}`))
        this.bind(vm.add.error, error => error && console.log(`  [MVVM View] ⚠ ${messageOf(error)}`))
    }

    // ---- 模拟用户操作：View 只把操作转发给 ViewModel ----
    type(text: string): void {
        this.input.type(text)
    }
    pressAdd() {
        return this.vm.add.execute()
    }
    clickItem(id: number): void {
        this.vm.toggle.execute(id)
    }
    switchFilter(filter: Filter): void {
        this.vm.filter.value = filter
    }
}

// ============================================================
// MVC：一个 Controller 驱动多个 View（Cocos 等引擎的组件化界面）
// ============================================================

/**
 * 所有界面共用的 View 接口。显示方法都是可选的：列表面板实现 renderList，角标只实现 renderCount。
 * Cocos 中由组件实现：class TodoListPanel extends Component implements TodoPanel
 */
interface TodoPanel extends IMvcView<TodoIntents> {
    renderList?(items: readonly Todo[], loading: boolean): void
    renderCount?(remaining: number): void
    showError?(message: string): void
}

/** 列表面板 */
class ConsoleTodoListPanel extends MvcView<TodoIntents> implements TodoPanel {
    renderList(items: readonly Todo[], loading: boolean): void {
        console.log(`  [列表面板] ${loading ? '加载中… ' : ''}${formatList(items)}`)
    }
    showError(message: string): void {
        console.log(`  [列表面板] ⚠ ${message}`)
    }
    submit(title: string): void {
        this.emit('add', title)
    }
    clickItem(id: number): void {
        this.emit('toggle', id)
    }
}

/** 主界面上的角标：只显示剩余数量，只发出「清除已完成」 */
class ConsoleTodoBadge extends MvcView<TodoIntents> implements TodoPanel {
    renderCount(remaining: number): void {
        console.log(`  [角标] 剩余 ${remaining}`)
    }
    clickClear(): void {
        this.emit('clearCompleted')
    }
}

/** 全局只创建一个：Model 观察和意图处理都只注册一次 */
class SharedTodoController extends MultiController<TodoIntents, TodoPanel> {
    constructor(private readonly model: TodoModel) {
        super()
    }

    protected intents(): IntentHandlers<TodoIntents> {
        return {
            add: title => this.model.add(title),
            toggle: id => this.model.toggle(id),
            clearCompleted: () => this.model.clearCompleted(),
        }
    }

    protected onStart(): void {
        this.observe(this.model.state$, state => this.forEachView(view => this.render(view, state)))
        this.guard('load', () => this.model.load())
    }

    /** Model 观察在 View 出现之前就注册了，新挂上的 View 要补一次当前状态 */
    protected override onAttach(view: TodoPanel): void {
        this.render(view, this.model.state)
    }

    protected override onError(error: unknown, context: string): void {
        this.forEachView(view => view.showError?.(`${context} 失败：${messageOf(error)}`))
    }

    private render(view: TodoPanel, state: TodoState): void {
        view.renderList?.(state.items, state.loading)
        view.renderCount?.(state.items.filter(t => !t.done).length)
    }
}

// ============================================================
// 运行
// ============================================================

const settle = () => delay(30)

async function runMvc(): Promise<void> {
    console.log('\n========== MVC ==========')
    const model = new TodoModel(new InMemoryTodoRepository(['写周报', '修 Bug']))
    const view = new ConsoleTodoView()
    const controller = new TodoController(view, model)

    console.log('1. start：挂载 View 并加载数据')
    controller.start()
    await settle()

    console.log('2. 添加：意图 -> Controller -> Model -> Controller 刷新 View')
    view.submit('发版本')
    await settle()

    console.log('3. 业务规则校验失败：错误进入 Controller.onError，显示在界面上')
    view.submit('写周报')
    await settle()

    console.log('4. 勾选并清除已完成')
    view.clickItem(1)
    view.clickClear()

    console.log('5. stop 之后的点击会被忽略，Model 变化也不再刷新 View')
    controller.stop()
    view.clickItem(2)
    controller.dispose()
}

async function runMvvm(): Promise<void> {
    console.log('\n========== MVVM ==========')
    const model = new TodoModel(new InMemoryTodoRepository(['写周报', '修 Bug']))
    const vm = new TodoViewModel(model)
    const view = new ConsoleTodoMvvmView()

    console.log('1. mount：建立绑定，ViewModel 激活后自动加载')
    view.mount(vm)
    await settle()

    console.log('2. 输入：双向绑定写入 draft -> 添加按钮自动变为可点击')
    view.type('发版本')
    await view.pressAdd()

    console.log('3. 勾选：只改 Model，列表 / 剩余数量自动刷新')
    view.clickItem(1)

    console.log('4. 切换过滤：只改 ViewModel 的 filter')
    view.switchFilter('active')

    console.log('5. 重复标题：Model 抛错 -> 写入 add.error -> 界面显示')
    view.type('修 Bug')
    await view.pressAdd()

    console.log('6. 卸载后 ViewModel 状态保留，重新挂载立即恢复（不会重复加载）')
    view.unmount()
    view.mount(vm)

    view.dispose()
    vm.dispose()
}

async function runMultiView(): Promise<void> {
    console.log('\n========== MVC：一个 Controller，多个 View ==========')
    // 游戏启动时执行一次（Cocos 中放在常驻节点的启动组件里）
    const model = new TodoModel(new InMemoryTodoRepository(['写周报', '修 Bug']))
    const controller = new SharedTodoController(model)
    controller.start()

    // 界面组件各自 attach / detach（Cocos 中写在 onEnable / onDisable）
    const badge = new ConsoleTodoBadge()
    const list = new ConsoleTodoListPanel()

    console.log('1. 主界面的角标先显示')
    controller.attach(badge)
    await settle()

    console.log('2. 打开列表面板：attach 时立即显示当前数据，不重新注册 Model 观察')
    controller.attach(list)

    console.log('3. 在列表面板里操作：两个 View 都刷新')
    list.submit('发版本')
    await settle()
    list.clickItem(1)

    console.log('4. 在角标上操作：同一个 Controller 处理')
    badge.clickClear()

    console.log('5. 关闭列表面板后只剩角标刷新；重新打开也只是再 attach 一次')
    controller.detach(list)
    list.clickItem(2) // 已 detach，忽略
    controller.attach(list)

    console.log('6. 业务校验失败：错误显示在所有实现了 showError 的 View 上')
    list.submit('修 Bug')
    await settle()

    // View 由界面自己销毁，Controller 不会销毁它们
    controller.dispose()
    list.dispose()
    badge.dispose()
}

async function main(): Promise<void> {
    await runMvc()
    await runMvvm()
    await runMultiView()
}

main().catch(error => console.error(error))
