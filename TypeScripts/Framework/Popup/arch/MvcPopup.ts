/**
 * MVC 弹窗基类：把弹窗管理器的生命周期（onShow/onHide/onDispose）适配到 MVVM_MVC 框架的 Controller
 *
 *   Model      业务数据和规则（如 PlayerModel，继承框架的 Model），与弹窗无关，可被多个界面共享
 *   View       继承框架的 MvcView：只负责显示，把用户操作作为「意图」发出，不包含业务逻辑
 *   Controller 本类的子类：listen 意图 -> 调用 Model -> observe 状态变化 -> 主动调用 View 刷新
 *
 * 生命周期映射：
 *   管理器 onShow    -> controller.start()   -> view.mount() -> onStart()（listen 意图、observe Model）
 *   管理器 onHide    -> controller.stop()    -> 释放 onStart 中的监听 -> view.unmount()
 *   管理器 onDispose -> controller.dispose() -> onDispose() -> view.dispose()
 *
 * 被抢占 / 被引导收起后恢复时，管理器会再次 onShow：Controller 重新 start，
 * observe 用 { immediate: true } 时会立刻按最新数据刷新一次，隐藏期间错过的变化不会丢。
 *
 * 管理器负责 new 弹窗类，构造函数不能有参数，所以子类在无参构造函数里创建 View：
 *   class RewardPopup extends MvcPopup<RewardData, RewardView> {
 *       constructor() { super(new RewardView()) }
 *       protected onStart() { ... }
 *   }
 */
import { Controller, MvcView } from '../../MVVM_MVC'
import { PopupComponent } from '../PopupDecorators'

export abstract class MvcPopup<D, V extends MvcView<any>> extends Controller<V> implements PopupComponent<D> {
    private currentData: D | undefined = undefined
    private hasData = false
    private closeFn: ((result?: unknown) => void) | null = null

    /** 弹窗数据，onShow 之后（即 onStart 中）可用 */
    protected get data(): D {
        if (!this.hasData) throw new Error(`${this.constructor.name}: data is not available before onShow`)
        return this.currentData as D
    }

    /** 关闭弹窗，result 会透传给 open 返回的 closed Promise */
    protected close(result?: unknown): void {
        this.closeFn?.(result)
    }

    // ---------------- 适配弹窗管理器的生命周期 ----------------

    onShow(data: D, close: (result?: unknown) => void): void {
        this.currentData = data
        this.hasData = true
        this.closeFn = close
        this.start()
    }

    onHide(): void {
        this.stop()
    }

    onDispose(): void {
        this.dispose()
        this.closeFn = null
    }
}
