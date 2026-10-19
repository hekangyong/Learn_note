/**
 * 客户端：用 WsProtoClient 实现 TaskApi，直接替换 FakeTaskServer，TaskModel 及以上各层不用改。
 *
 *   fetch / claim  -> request（seq 匹配响应，服务端错误转为 Error，message 直接作为界面提示）
 *   subscribe      -> TASK_PUSH 推送
 *   断线重连       -> 断开期间的推送已丢失，重新拉取一次，作为 reset 推送交给 TaskModel 整份替换
 */
import { Cmd, TaskInfo, TaskPushType, WsProtoClient } from '../../WsProtoServer/src'
import { ClaimResult, Task, TaskApi, TaskKind, TaskPush, TaskSnapshot } from '../TaskModel'

function toTask(info: TaskInfo): Task {
    return { ...info, kind: info.kind as TaskKind }
}

/** 让请求可以被 AbortSignal 取消（服务端仍会处理，只是客户端不再关心结果） */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise
    if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
        signal.addEventListener('abort', onAbort, { once: true })
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
    })
}

export class WsTaskApi implements TaskApi {
    constructor(private readonly client: WsProtoClient) {}

    async fetch(signal?: AbortSignal): Promise<TaskSnapshot> {
        const rsp = await abortable(this.client.request(Cmd.TASK_FETCH_REQ, {}), signal)
        return { tasks: rsp.tasks.map(toTask), resetAt: rsp.resetAt }
    }

    async claim(taskIds: readonly number[], signal?: AbortSignal): Promise<ClaimResult> {
        const rsp = await abortable(this.client.request(Cmd.TASK_CLAIM_REQ, { taskIds: [...taskIds] }), signal)
        return { claimed: rsp.claimed, gold: rsp.gold }
    }

    subscribe(listener: (push: TaskPush) => void): () => void {
        const offPush = this.client.onPush(Cmd.TASK_PUSH, push => {
            const tasks = push.tasks.map(toTask)
            listener(push.type === TaskPushType.RESET ? { type: 'reset', tasks, resetAt: push.resetAt } : { type: 'progress', tasks })
        })
        const onReady = (_rsp: unknown, reconnected: boolean) => {
            if (!reconnected) return
            this.fetch()
                .then(snapshot => listener({ type: 'reset', ...snapshot }))
                .catch(() => {}) // 再次断线会再次触发 ready
        }
        this.client.on('ready', onReady)
        return () => {
            offPush()
            this.client.off('ready', onReady)
        }
    }
}
