import { EventEmitter } from 'events'
import { WebSocket } from 'ws'
import {
    CloseCode,
    Cmd,
    ErrorCode,
    LoginRsp,
    MessageMap,
    Packet,
    RequestCmd,
    ResponseMap,
    decode,
    encode,
} from '../protocol'

export interface ClientOptions {
    url: string
    token: string
    /** 登录前使用的心跳间隔，登录后以服务端下发为准 */
    heartbeatInterval?: number
    /** 连续多少个心跳周期收不到任何数据判定断线，默认 3 */
    heartbeatMaxMiss?: number
    requestTimeout?: number
    reconnect?: boolean
    reconnectBaseDelay?: number
    reconnectMaxDelay?: number
}

export class ServerError extends Error {
    constructor(readonly code: number, message: string) {
        super(message)
    }
}

export interface ClientEvents {
    /** 每次（重）连并登录成功 */
    ready: [rsp: LoginRsp, reconnected: boolean]
    disconnect: [code: number, reason: string]
    reconnecting: [attempt: number, delay: number]
    push: [packet: Packet]
    /** 不会再重连的错误（鉴权失败 / 被踢 / 主动关闭前的首连失败） */
    fatal: [err: Error]
    rtt: [ms: number]
}

interface Pending {
    resolve: (body: any) => void
    reject: (err: Error) => void
    timer: NodeJS.Timeout
}

/** 配套客户端：请求-响应匹配、应用层心跳、断线指数退避重连 */
export class WsProtoClient extends EventEmitter<ClientEvents> {
    private readonly opts: Required<ClientOptions>
    private ws?: WebSocket
    private seq = 0
    private readonly pending = new Map<number, Pending>()
    private heartbeatTimer?: NodeJS.Timeout
    private lastRecv = 0
    private attempt = 0
    private everReady = false
    private stopped = false

    constructor(options: ClientOptions) {
        super()
        this.opts = {
            heartbeatInterval: 15_000,
            heartbeatMaxMiss: 3,
            requestTimeout: 10_000,
            reconnect: true,
            reconnectBaseDelay: 500,
            reconnectMaxDelay: 15_000,
            ...options,
        }
    }

    get connected() {
        return this.ws?.readyState === WebSocket.OPEN
    }

    /** 建连并登录，首次 ready 时 resolve */
    connect(): Promise<LoginRsp> {
        this.stopped = false
        return new Promise((resolve, reject) => {
            const onReady = (rsp: LoginRsp) => {
                this.off('fatal', onFatal)
                resolve(rsp)
            }
            const onFatal = (err: Error) => {
                this.off('ready', onReady)
                reject(err)
            }
            this.once('ready', onReady)
            this.once('fatal', onFatal)
            this.open()
        })
    }

    close() {
        this.stopped = true
        this.ws?.close(CloseCode.NORMAL, 'client close')
    }

    request<C extends RequestCmd>(
        cmd: C,
        body: MessageMap[C]
    ): Promise<MessageMap[ResponseMap[C]]> {
        return new Promise((resolve, reject) => {
            if (!this.connected) return reject(new Error('not connected'))
            const seq = (this.seq = (this.seq % 0xffffffff) + 1)
            const timer = setTimeout(() => {
                this.pending.delete(seq)
                reject(new Error(`request ${Cmd[cmd]} timeout`))
            }, this.opts.requestTimeout)
            this.pending.set(seq, { resolve, reject, timer })
            this.ws!.send(encode(cmd, body, seq))
        })
    }

    /** 发送不需要响应的消息 */
    send<C extends Cmd>(cmd: C, body: MessageMap[C]) {
        if (this.connected) this.ws!.send(encode(cmd, body))
    }

    /** 订阅服务端主动推送，返回取消订阅函数 */
    onPush<C extends Cmd>(cmd: C, fn: (body: MessageMap[C]) => void): () => void {
        const listener = (p: Packet) => {
            if (p.cmd === cmd) fn(p.body as MessageMap[C])
        }
        this.on('push', listener)
        return () => this.off('push', listener)
    }

    private open() {
        const ws = new WebSocket(this.opts.url)
        this.ws = ws
        ws.on('open', () => void this.onOpen())
        ws.on('message', data => this.onMessage(data as Buffer))
        ws.on('close', (code, reason) => this.onClose(code, reason.toString()))
        ws.on('error', () => {}) // 错误之后一定会触发 close，统一在 onClose 处理
    }

    private async onOpen() {
        this.lastRecv = Date.now()
        this.startHeartbeat(this.opts.heartbeatInterval)
        try {
            const rsp = await this.request(Cmd.LOGIN_REQ, { token: this.opts.token })
            this.startHeartbeat(rsp.heartbeatInterval || this.opts.heartbeatInterval)
            const reconnected = this.everReady
            this.everReady = true
            this.attempt = 0
            this.emit('ready', rsp, reconnected)
        } catch (err) {
            if (err instanceof ServerError && err.code === ErrorCode.AUTH_FAILED) {
                this.stopped = true
                this.emit('fatal', err)
                this.ws?.close()
            } else {
                this.ws?.terminate() // 登录超时等，走重连
            }
        }
    }

    private onMessage(data: Buffer) {
        this.lastRecv = Date.now()
        let packet: Packet
        try {
            packet = decode(data)
        } catch {
            return
        }
        const pending = packet.seq ? this.pending.get(packet.seq) : undefined
        if (pending) {
            this.pending.delete(packet.seq)
            clearTimeout(pending.timer)
            if (packet.cmd === Cmd.ERROR) {
                const e = packet.body as MessageMap[Cmd.ERROR]
                pending.reject(new ServerError(e.code, e.message))
            } else {
                pending.resolve(packet.body)
            }
            return
        }
        if (packet.cmd === Cmd.HEARTBEAT_PONG) {
            const pong = packet.body as MessageMap[Cmd.HEARTBEAT_PONG]
            this.emit('rtt', Date.now() - pong.clientTime)
            return
        }
        this.emit('push', packet)
    }

    private onClose(code: number, reason: string) {
        this.stopHeartbeat()
        for (const p of this.pending.values()) {
            clearTimeout(p.timer)
            p.reject(new Error('connection closed'))
        }
        this.pending.clear()
        this.emit('disconnect', code, reason)

        if (code === CloseCode.KICKED) {
            this.stopped = true
            this.emit('fatal', new Error('kicked: login elsewhere'))
        }
        if (this.stopped) return
        if (!this.opts.reconnect) {
            this.emit('fatal', new Error(`connection closed: ${code}`))
            return
        }
        // 指数退避 + 随机抖动，避免服务端重启后所有客户端同时重连
        const base = Math.min(
            this.opts.reconnectMaxDelay,
            this.opts.reconnectBaseDelay * 2 ** this.attempt
        )
        const delay = Math.round(base / 2 + Math.random() * (base / 2))
        this.attempt++
        this.emit('reconnecting', this.attempt, delay)
        setTimeout(() => {
            if (!this.stopped) this.open()
        }, delay)
    }

    private startHeartbeat(interval: number) {
        this.stopHeartbeat()
        const maxIdle = interval * this.opts.heartbeatMaxMiss
        this.heartbeatTimer = setInterval(() => {
            if (Date.now() - this.lastRecv > maxIdle) {
                // 长时间收不到任何数据（包括 PONG），判定链路已断，主动销毁触发重连
                this.ws?.terminate()
                return
            }
            this.send(Cmd.HEARTBEAT_PING, { clientTime: Date.now() })
        }, interval)
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = undefined
    }
}
