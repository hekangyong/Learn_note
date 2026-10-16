/**
 * MVVM 弹窗基类：把弹窗管理器的生命周期（onShow/onHide/onDispose）适配成 MVVM 模式
 *
 *   Model     业务数据和规则（如 PlayerModel），与 MVC 共用同一个 Model 层
 *   ViewModel 界面状态（Observable/Computed）+ 用户操作（Command），不引用任何 View
 *   View      只做「绑定」：把 ViewModel 的状态绑定到控件上，把按钮绑定到 Command 上
 *
 * MVVM 的特点：数据流是「声明式」的 —— ViewModel 只修改状态，View 通过绑定自动刷新，
 * ViewModel 不需要知道 View 的存在，所以可以脱离 UI 单独做单元测试。
 *
 * 生命周期映射：
 *   管理器 onShow（首次） -> createViewModel -> vm.init(data) -> createView -> view.bind(vm)
 *                         -> vm.onActive -> view.show
 *   管理器 onShow（恢复） -> vm.onActive -> view.show       （状态保留在 VM 中，恢复后不丢失）
 *   管理器 onHide         -> view.hide -> vm.onInactive    （例如暂停倒计时）
 *   管理器 onDispose      -> view.destroy（解除绑定） -> vm.dispose（释放 Computed/订阅）
 */
import { PopupComponent } from '../PopupDecorators'
import { Command, DisposeBag, ReadonlyObservable } from './Observable'

// ------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------

export abstract class PopupViewModel<D> {
    /** 订阅、Computed 等资源，dispose 时自动释放 */
    protected readonly disposables = new DisposeBag()
    private closeFn: ((result?: unknown) => void) | null = null

    /** 由 MvvmPopup 调用：注入关闭函数并初始化状态 */
    init(data: D, close: (result?: unknown) => void): void {
        this.closeFn = close
        this.onInit(data)
    }

    /** 根据弹窗数据初始化状态和命令 */
    protected abstract onInit(data: D): void

    /** 弹窗显示（包括恢复）时调用，可选 */
    onActive(): void {}

    /** 弹窗离开屏幕（关闭、被抢占）时调用，可选 */
    onInactive(): void {}

    /** 弹窗彻底结束时调用，可选 */
    protected onDispose(): void {}

    /** 关闭弹窗，result 会透传给 open 返回的 closed Promise */
    protected close(result?: unknown): void {
        this.closeFn?.(result)
    }

    /** 登记需要释放的对象（例如 Computed），返回它本身，方便链式写在赋值语句里 */
    protected track<T extends { dispose(): void }>(target: T): T {
        this.disposables.add(() => target.dispose())
        return target
    }

    dispose(): void {
        this.onDispose()
        this.disposables.dispose()
        this.closeFn = null
    }
}

// ------------------------------------------------------------
// View
// ------------------------------------------------------------

export abstract class MvvmView<VM> {
    /** 所有绑定的取消函数，destroy 时统一解除 */
    private readonly bindings = new DisposeBag()

    /** 把 ViewModel 绑定到视图上，只调用一次 */
    abstract bind(vm: VM): void
    abstract show(): void
    abstract hide(): void

    /** 单向绑定：状态变化时调用 apply 更新控件（绑定时立刻用当前值调用一次） */
    protected bindValue<T>(source: ReadonlyObservable<T>, apply: (value: T) => void): void {
        this.bindings.add(source.subscribe(value => apply(value)))
    }

    /** 绑定命令的可执行状态，例如按钮的「可点击/置灰」 */
    protected bindCommand(command: Command<any>, setEnabled: (enabled: boolean) => void): void {
        this.bindValue(command.canExecute, setEnabled)
    }

    /** 解除所有绑定。子类重写时需要调用 super.destroy() */
    destroy(): void {
        this.bindings.dispose()
    }
}

// ------------------------------------------------------------
// 弹窗基类：组装 ViewModel 和 View
// ------------------------------------------------------------

export abstract class MvvmPopup<D, VM extends PopupViewModel<D>, V extends MvvmView<VM>>
    implements PopupComponent<D>
{
    private vm: VM | null = null
    private view: V | null = null

    /** 创建 ViewModel。Model 等依赖在这里注入，便于测试时替换 */
    protected abstract createViewModel(): VM

    /** 创建 View */
    protected abstract createView(): V

    onShow(data: D, close: (result?: unknown) => void): void {
        if (!this.vm || !this.view) {
            // 先初始化 VM 再绑定 View：绑定时 VM 的状态已经就绪
            this.vm = this.createViewModel()
            this.vm.init(data, close)
            this.view = this.createView()
            this.view.bind(this.vm)
        }
        this.vm.onActive()
        this.view.show()
    }

    onHide(): void {
        this.view?.hide()
        this.vm?.onInactive()
    }

    onDispose(): void {
        // 先解除 View 的绑定，再释放 VM：避免 VM 释放过程中的状态变化还触发 View 刷新
        this.view?.destroy()
        this.vm?.dispose()
        this.view = null
        this.vm = null
    }
}
