import { _decorator, Component } from 'cc'
import { Emitter, EventMap, IMvcView, Listener } from './framework/index'

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
