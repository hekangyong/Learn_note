import { BizError, Middleware } from '../Router'
import { Cmd, ErrorCode } from '../protocol'
import type { Logger } from './ServerApp'

/** 请求日志：耗时、用户、结果；心跳不记录 */
export function logRequests(logger: Logger, slowMs = 200): Middleware {
    return async (ctx, next) => {
        if (ctx.cmd === Cmd.HEARTBEAT_PING) return next()
        const start = Date.now()
        const who = ctx.session.userId ?? ctx.session.id
        try {
            await next()
            const cost = Date.now() - start
            const line = `${Cmd[ctx.cmd]} user=${who} ${cost}ms`
            if (cost >= slowMs) logger.warn(`slow ${line}`)
            else logger.info(line)
        } catch (err) {
            logger.warn(`${Cmd[ctx.cmd]} user=${who} failed: ${(err as Error).message}`)
            throw err
        }
    }
}

/** 单连接限流（令牌桶）：每秒 ratePerSec 个请求，允许 burst 的突发；心跳不计数 */
export function rateLimit(ratePerSec: number, burst = ratePerSec): Middleware {
    const buckets = new WeakMap<object, { tokens: number; at: number }>()
    return (ctx, next) => {
        if (ctx.cmd === Cmd.HEARTBEAT_PING) return next()
        const now = Date.now()
        const b = buckets.get(ctx.session) ?? { tokens: burst, at: now }
        b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * ratePerSec)
        b.at = now
        buckets.set(ctx.session, b)
        if (b.tokens < 1) throw new BizError(ErrorCode.RATE_LIMITED, 'too many requests')
        b.tokens -= 1
        return next()
    }
}
