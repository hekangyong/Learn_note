import { WebSocket } from 'ws'
import { CloseCode, Cmd, MessageMap, encode } from './protocol'

let nextId = 0

/** 一条长连接对应一个 Session */
export class Session {
    readonly id = `s${++nextId}`
    readonly connectedAt = Date.now()
    /** 最近一次收到数据（业务帧 / 心跳 / 协议层 pong）的时间 */
    lastActive = Date.now()
    /** 登录成功后赋值，null 表示未鉴权 */
    userId: string | null = null
    /** 业务自定义挂载数据 */
    readonly data = new Map<string, unknown>()

    constructor(
        readonly ws: WebSocket,
        readonly remoteAddress: string,
        private readonly maxBufferedBytes: number
    ) {}

    get authed() {
        return this.userId !== null
    }

    get alive() {
        return this.ws.readyState === WebSocket.OPEN
    }

    touch() {
        this.lastActive = Date.now()
    }

    send<C extends Cmd>(cmd: C, body: MessageMap[C], seq = 0): boolean {
        return this.sendRaw(encode(cmd, body, seq))
    }

    /** 发送已编码好的帧（广播时只编码一次） */
    sendRaw(frame: Uint8Array): boolean {
        if (!this.alive) return false
        // 背压保护：对端读得太慢，发送缓冲持续堆积，直接断开避免内存打爆
        if (this.ws.bufferedAmount > this.maxBufferedBytes) {
            this.close(CloseCode.SLOW_CONSUMER, 'slow consumer')
            return false
        }
        this.ws.send(frame, { binary: true })
        return true
    }

    close(code: number = CloseCode.NORMAL, reason = '') {
        if (
            this.ws.readyState === WebSocket.OPEN ||
            this.ws.readyState === WebSocket.CONNECTING
        ) {
            this.ws.close(code, reason)
        }
    }

    /** 不走关闭握手，直接销毁底层 socket（对端已经失联时使用） */
    terminate() {
        this.ws.terminate()
    }
}
