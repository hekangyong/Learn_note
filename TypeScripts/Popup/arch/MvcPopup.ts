/**
 * MVC 弹窗基类：把弹窗管理器的生命周期（onShow/onHide/onDispose）适配成 MVC 模式
 *
 *   Model      业务数据和规则（如 PlayerModel），与弹窗无关，可被多个界面共享
 *   View       只负责显示和把用户操作「转发」出去（事件），不包含任何业务逻辑
 *   Controller 本类的子类：接收用户操作 -> 调用 Model -> 主动调用 View 刷新显示
 *
 * MVC 的特点：数据流由 Controller「命令式」驱动，View 被动接受 Controller 的调用。
 *
 * 生命周期映射：
 *   管理器 onShow（首次） -> createView -> onCreate（绑定 View 事件、订阅 Model） -> render -> view.show
 *   管理器 onShow（恢复） -> render -> view.show            （被抢占/引导收起后恢复）
 *   管理器 onHide         -> view.hide
 *   管理器 onDispose      -> onDestroy -> 释放订阅 -> view.destroy
 */
import { PopupComponent } from '../PopupDecorators'
import { DisposeBag } from './Observable'

/** MVC 中的 View 需要实现的接口。显示内容和事件由各个 View 自己定义 */
export interface MvcView {
    show(): void
    hide(): void
    destroy(): void
}

export abstract class MvcPopup<D, V extends MvcView> implements PopupComponent<D> {
    /** 视图，createView 之后可用 */
    protected view!: V
    /** 弹窗数据，onShow 之后可用 */
    protected data!: D
    /** 订阅等资源，弹窗结束时自动释放 */
    protected readonly disposables = new DisposeBag()

    private closeFn: ((result?: unknown) => void) | null = null
    private created = false

    // ---------------- 子类实现 ----------------

    /** 创建视图，每个弹窗实例只调用一次 */
    protected abstract createView(): V

    /** 视图创建后调用一次：绑定 View 的事件、订阅 Model */
    protected abstract onCreate(): void

    /** 把当前数据推给 View。每次显示（包括恢复）、以及 Model 变化时由子类主动调用 */
    protected abstract render(): void

    /** 弹窗彻底结束前调用，可选 */
    protected onDestroy(): void {}

    /** 关闭弹窗，result 会透传给 open 返回的 closed Promise */
    protected close(result?: unknown): void {
        this.closeFn?.(result)
    }

    // ---------------- 适配弹窗管理器的生命周期 ----------------

    onShow(data: D, close: (result?: unknown) => void): void {
        this.data = data
        this.closeFn = close
        if (!this.created) {
            this.created = true
            this.view = this.createView()
            this.onCreate()
        }
        this.render()
        this.view.show()
    }

    onHide(): void {
        this.view.hide()
    }

    onDispose(): void {
        this.onDestroy()
        this.disposables.dispose() // 取消对 Model 的订阅，避免弹窗关闭后还在刷新
        this.view.destroy()
        this.closeFn = null
    }
}
