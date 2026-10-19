/**
 * 类型安全的事件派发器。MVC 中 View 通过它把「用户意图」转发给 Controller。
 *
 * 事件表用「事件名 -> 参数元组」描述，参数个数和类型都会被检查：
 *   type TodoIntents = { add: [title: string]; toggle: [id: number]; clear: [] }
 *   const emitter = new Emitter<TodoIntents>()
 *   emitter.on('toggle', id => ...)
 *   emitter.emit('toggle', 1)
 */
import { isPromiseLike, reportError } from './errors'

export type EventMap<E> = { [K in keyof E]: unknown[] }
export type Listener<A extends unknown[]> = (...args: A) => unknown

export class Emitter<E extends EventMap<E>> {
    private readonly listeners = new Map<keyof E, Set<Listener<any>>>()

    /** 监听事件，返回取消函数 */
    on<K extends keyof E>(type: K, listener: Listener<E[K]>): () => void {
        let set = this.listeners.get(type)
        if (!set) {
            set = new Set()
            this.listeners.set(type, set)
        }
        // 每次 on 都包一层：同一个函数监听两次时，两个取消函数互不影响
        const entry: Listener<E[K]> = (...args) => listener(...args)
        set.add(entry)
        const owner = set
        return () => {
            owner.delete(entry)
            if (owner.size === 0 && this.listeners.get(type) === owner) this.listeners.delete(type)
        }
    }

    /** 只监听一次 */
    once<K extends keyof E>(type: K, listener: Listener<E[K]>): () => void {
        const off = this.on(type, (...args) => {
            off()
            return listener(...args)
        })
        return off
    }

    /**
     * 派发事件。单个监听器抛错（或返回的 Promise 被拒绝）只会上报，不影响其他监听器。
     */
    emit<K extends keyof E>(type: K, ...args: E[K]): void {
        const set = this.listeners.get(type)
        if (!set) return
        for (const listener of [...set]) {
            // 前面的监听器可能已经把后面的取消了
            if (!set.has(listener)) continue
            try {
                const result = listener(...args)
                if (isPromiseLike(result)) {
                    result.then(undefined, error => reportError(error, `event "${String(type)}"`))
                }
            } catch (error) {
                reportError(error, `event "${String(type)}"`)
            }
        }
    }

    listenerCount(type?: keyof E): number {
        if (type !== undefined) return this.listeners.get(type)?.size ?? 0
        let count = 0
        for (const set of this.listeners.values()) count += set.size
        return count
    }

    clear(): void {
        this.listeners.clear()
    }
}
