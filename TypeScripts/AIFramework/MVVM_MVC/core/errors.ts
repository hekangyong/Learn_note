/**
 * 统一错误出口
 *
 * 框架内部所有「不能直接抛给调用方」的错误（effect 回调、事件监听、异步命令、资源释放……）
 * 都会汇总到这里。商用项目在启动时调用 setErrorHandler 接入自己的日志 / 埋点 / Sentry 即可。
 */

/**
 * @param error   原始错误
 * @param context 出错位置的简短描述，例如 'effect'、'TodoController.add'
 */
export type ErrorHandler = (error: unknown, context: string) => void

const defaultHandler: ErrorHandler = (error, context) => {
    console.error(`[mvx] ${context}:`, error)
}

let handler: ErrorHandler = defaultHandler

/** 替换全局错误处理函数，返回旧的处理函数（测试中可以用它恢复） */
export function setErrorHandler(next: ErrorHandler | null): ErrorHandler {
    const prev = handler
    handler = next ?? defaultHandler
    return prev
}

/** 上报错误。错误处理函数自己抛错时退回 console.error，保证不会影响业务流程 */
export function reportError(error: unknown, context: string): void {
    try {
        handler(error, context)
    } catch (inner) {
        console.error(`[mvx] error handler failed while reporting ${context}:`, inner, error)
    }
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof (value as PromiseLike<unknown>).then === 'function'
    )
}
