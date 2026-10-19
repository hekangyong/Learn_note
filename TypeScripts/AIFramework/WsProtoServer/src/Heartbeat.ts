import { CloseCode } from './protocol'
import { Session } from './Session'

export interface HeartbeatOptions {
    /** 心跳间隔：空闲超过该时间，服务端补发协议层 ping 探测 */
    interval: number
    /** 心跳超时：空闲超过该时间判定连接失效 */
    timeout: number
    /** 建连后必须在该时间内完成登录 */
    authTimeout: number
}

/**
 * 心跳检测（服务端）
 *
 * 两层机制：
 * 1. 应用层：客户端每 interval 发一个 HEARTBEAT_PING，服务端回 PONG；
 *    任何入站帧都会刷新 session.lastActive。
 * 2. 协议层兜底：空闲超过 interval 时，服务端发 WebSocket ping 帧，
 *    浏览器 / ws 库会自动回 pong（同样刷新 lastActive）。
 *    这样即使客户端没实现应用层心跳，也能检测出半开连接（拔网线、进程被杀等）。
 *
 * 空闲超过 timeout 仍无任何数据 -> 直接 terminate。
 */
export class HeartbeatMonitor {
    private timer?: NodeJS.Timeout

    constructor(
        private readonly sessions: () => Iterable<Session>,
        private readonly opts: HeartbeatOptions,
        private readonly onTimeout: (session: Session, code: CloseCode) => void
    ) {}

    start() {
        if (this.timer) return
        // 检测粒度取间隔的一半，误差不超过 interval / 2
        const tick = Math.max(50, Math.floor(this.opts.interval / 2))
        this.timer = setInterval(() => this.check(), tick)
        this.timer.unref()
    }

    stop() {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }

    check(now = Date.now()) {
        for (const session of this.sessions()) {
            if (!session.authed && now - session.connectedAt > this.opts.authTimeout) {
                this.onTimeout(session, CloseCode.AUTH_TIMEOUT)
                continue
            }
            const idle = now - session.lastActive
            if (idle > this.opts.timeout) {
                this.onTimeout(session, CloseCode.HEARTBEAT_TIMEOUT)
            } else if (idle > this.opts.interval && session.alive) {
                session.ws.ping()
            }
        }
    }
}
