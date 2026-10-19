import type { Session } from '../Session'

/**
 * 应用内事件表：事件名 -> 参数元组
 *
 * 框架内置会话事件；业务模块通过声明合并扩展自己的事件，例如：
 *   declare module '.../WsProtoServer/src/app/EventBus' {
 *       interface AppEvents { 'battle:finish': [userId: string, win: boolean] }
 *   }
 * 模块之间用事件解耦：发布方不需要知道谁在订阅。
 */
export interface AppEvents {
    'session:login': [session: Session]
    'session:logout': [session: Session, code: number]
}

export type AppEventName = keyof AppEvents
type Args<K extends AppEventName> = Extract<AppEvents[K], unknown[]>
type Listener<K extends AppEventName> = (...args: Args<K>) => void

export class EventBus {
    private readonly listeners = new Map<AppEventName, Set<Listener<any>>>()

    constructor(private readonly onError: (err: unknown, event: AppEventName) => void) {}

    /** 订阅，返回取消函数 */
    on<K extends AppEventName>(event: K, listener: Listener<K>): () => void {
        let set = this.listeners.get(event)
        if (!set) this.listeners.set(event, (set = new Set()))
        set.add(listener)
        return () => set!.delete(listener)
    }

    /** 同步派发；某个订阅者出错不影响其他订阅者 */
    emit<K extends AppEventName>(event: K, ...args: Args<K>): void {
        for (const listener of [...(this.listeners.get(event) ?? [])]) {
            try {
                listener(...args)
            } catch (err) {
                this.onError(err, event)
            }
        }
    }
}
