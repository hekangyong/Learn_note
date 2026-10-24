/**
 * 资源释放
 *
 * 界面类代码最常见的线上问题是「界面关了，订阅还在」：内存泄漏、对已销毁的控件赋值报错。
 * 所有订阅 / 定时器 / 事件监听都登记到 DisposableStore，生命周期结束时一次性释放。
 */
import { reportError } from './errors'

export interface IDisposable {
    dispose(): void
}

/** 可释放的东西：带 dispose 方法的对象，或者一个取消函数 */
export type DisposableLike = IDisposable | (() => void)

export function disposeSafely(item: DisposableLike): void {
    try {
        if (typeof item === 'function') item()
        else item.dispose()
    } catch (error) {
        reportError(error, 'dispose')
    }
}

export class DisposableStore implements IDisposable {
    private items: DisposableLike[] = []
    private disposed = false

    get isDisposed(): boolean {
        return this.disposed
    }

    get size(): number {
        return this.items.length
    }

    /**
     * 登记资源，返回它本身，方便写成 `const x = store.add(create())`。
     * 已经释放过的 store 会立即释放传入的资源并上报：这通常说明有异步回调在对象销毁后才返回。
     */
    add<T extends DisposableLike>(item: T): T {
        if (this.disposed) {
            disposeSafely(item)
            reportError(
                new Error(
                    'Resource added to a disposed DisposableStore; it was disposed immediately'
                ),
                'DisposableStore'
            )
            return item
        }
        this.items.push(item)
        return item
    }

    /** 释放并移除单个资源 */
    delete(item: DisposableLike): void {
        const index = this.items.indexOf(item)
        if (index < 0) return
        this.items.splice(index, 1)
        disposeSafely(item)
    }

    /** 释放当前所有资源，store 之后仍可继续使用（用于「每次显示」级别的资源） */
    clear(): void {
        // 先换出再释放：释放过程中新 add 的资源留到下一次 clear
        const items = this.items
        this.items = []
        // 后登记的先释放（LIFO），与创建顺序相反，依赖关系更安全
        for (let i = items.length - 1; i >= 0; i--) disposeSafely(items[i])
    }

    /** 释放所有资源，之后 store 不能再使用 */
    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.clear()
    }
}
