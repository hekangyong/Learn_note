/**
 * MVVM 弹窗基类：把弹窗管理器的生命周期（onShow/onHide/onDispose）适配到 MVVM_MVC 框架
 *
 *   Model     业务数据和规则（如 PlayerModel），与 MVC 共用同一个 Model 层
 *   ViewModel PopupViewModel 的子类：界面状态（signal / computed）+ 用户操作（Command / AsyncCommand），不引用 View
 *   View      继承框架的 MvvmView：只做绑定，状态变化时自动刷新
 *
 * 生命周期映射：
 *   管理器 onShow（首次） -> createViewModel -> vm.init(data, close) -> createView -> view.mount(vm)
 *   管理器 onShow（恢复） -> view.mount(vm)       （状态保留在 VM 中，重新绑定后立即显示最新状态）
 *   管理器 onHide         -> view.unmount()       （解除绑定 -> vm.deactivate，例如暂停倒计时）
 *   管理器 onDispose      -> view.dispose() -> vm.dispose()（取消进行中的异步命令、释放所有订阅）
 *
 * view.mount 会调用 vm.activate()，view.unmount 会调用 vm.deactivate()，
 * 所以「显示期间才需要的资源」写在 ViewModel 的 onActivate 中，并登记到 activeDisposables。
 */
import { MvvmView, ViewModel } from '../../MVVM_MVC'
import { PopupComponent } from '../PopupDecorators'

// ------------------------------------------------------------
// ViewModel
// ------------------------------------------------------------

export abstract class PopupViewModel<D> extends ViewModel {
    private closeFn: ((result?: unknown) => void) | null = null

    /** 由 MvvmPopup 调用：注入关闭函数并初始化状态 */
    init(data: D, close: (result?: unknown) => void): void {
        this.closeFn = close
        this.onInit(data)
    }

    /** 根据弹窗数据初始化状态和命令 */
    protected abstract onInit(data: D): void

    /** 关闭弹窗，result 会透传给 open 返回的 closed Promise */
    protected close(result?: unknown): void {
        this.closeFn?.(result)
    }

    override dispose(): void {
        super.dispose()
        this.closeFn = null
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
            // 先初始化 VM 再创建 View：绑定时 VM 的状态已经就绪
            const vm = this.createViewModel()
            vm.init(data, close)
            this.vm = vm
            this.view = this.createView()
        }
        this.view.mount(this.vm)
    }

    onHide(): void {
        this.view?.unmount()
    }

    onDispose(): void {
        // 先销毁 View（解除绑定），再释放 VM：避免 VM 释放过程中的状态变化还触发 View 刷新
        this.view?.dispose()
        this.vm?.dispose()
        this.view = null
        this.vm = null
    }
}
