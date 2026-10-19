import { EventEmitter } from 'events'
import { AddressInfo } from 'net'
import { WebSocket, WebSocketServer } from 'ws'
import { HeartbeatMonitor } from './Heartbeat'
import {
    BizError,
    Handler,
    HandlerOptions,
    Router,
} from './Router'
import { Session } from './Session'
import {
    CloseCode,
    Cmd,
    ErrorCode,
    MessageMap,
    Packet,
    decode,
    encode,
} from './protocol'

export interface ServerOptions {
    port: number
    host?: string
    path?: string
    /** 心跳间隔(ms)，登录时下发给客户端，默认 15s */
    heartbeatInterval?: number
    /** 心跳超时(ms)，默认 3 倍间隔 */
    heartbeatTimeout?: number
    /** 建连后登录超时(ms)，默认 10s */
    authTimeout?: number
    /** 单帧最大字节数，默认 1MB */
    maxPayload?: number
    /** 单连接发送缓冲上限，超过视为慢消费者，默认 4MB */
    maxBufferedBytes?: number
    /** 鉴权：返回 userId 表示成功，返回 null 表示失败 */
    authenticate: (
        token: string,
        session: Session
    ) => string | null | Promise<string | null>
}

export interface ServerEvents {
    connect: [session: Session]
    login: [session: Session]
    disconnect: [session: Session, code: number, reason: string]
    sessionError: [err: Error, session?: Session]
}

export class WsProtoServer extends EventEmitter<ServerEvents> {
    readonly router = new Router()
    private readonly opts: Required<Omit<ServerOptions, 'host' | 'path'>> &
        Pick<ServerOptions, 'host' | 'path'>
    private wss?: WebSocketServer
    private readonly sessions = new Map<string, Session>()
    private readonly users = new Map<string, Session>()
    private readonly heartbeat: HeartbeatMonitor

    constructor(options: ServerOptions) {
        super()
        const interval = options.heartbeatInterval ?? 15_000
        this.opts = {
            heartbeatInterval: interval,
            heartbeatTimeout: interval * 3,
            authTimeout: 10_000,
            maxPayload: 1024 * 1024,
            maxBufferedBytes: 4 * 1024 * 1024,
            ...options,
        }
        this.heartbeat = new HeartbeatMonitor(
            () => this.sessions.values(),
            {
                interval: this.opts.heartbeatInterval,
                timeout: this.opts.heartbeatTimeout,
                authTimeout: this.opts.authTimeout,
            },
            (session, code) => {
                // 心跳超时说明对端大概率已失联，关闭握手等不到回应，直接销毁
                if (code === CloseCode.HEARTBEAT_TIMEOUT) {
                    session.data.set('closeCode', code)
                    session.terminate()
                } else {
                    session.close(code, CloseCode[code])
                }
            }
        )
        this.registerBuiltins()
    }

    /** 实际监听端口（port 传 0 时由系统分配） */
    get port() {
        return (this.wss?.address() as AddressInfo | undefined)?.port ?? 0
    }

    get sessionCount() {
        return this.sessions.size
    }

    /** 注册业务处理器 */
    handle<C extends Cmd>(cmd: C, handler: Handler<C>, opts?: HandlerOptions) {
        this.router.on(cmd, handler, opts)
        return this
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            const wss = new WebSocketServer({
                port: this.opts.port,
                host: this.opts.host,
                path: this.opts.path,
                maxPayload: this.opts.maxPayload,
                perMessageDeflate: false,
            })
            wss.once('listening', () => {
                this.heartbeat.start()
                resolve()
            })
            wss.once('error', reject)
            wss.on('connection', (ws, req) =>
                this.onConnection(ws, req.socket.remoteAddress ?? '')
            )
            this.wss = wss
        })
    }

    /** 优雅关闭：通知所有客户端后关闭监听 */
    stop(): Promise<void> {
        this.heartbeat.stop()
        for (const session of this.sessions.values()) {
            session.close(CloseCode.SERVER_SHUTDOWN, 'server shutdown')
        }
        return new Promise(resolve => {
            if (!this.wss) return resolve()
            // 给关闭握手一点时间，之后强制销毁残留连接
            const force = setTimeout(() => {
                for (const s of this.sessions.values()) s.terminate()
            }, 1000)
            this.wss.close(() => {
                clearTimeout(force)
                resolve()
            })
        })
    }

    getSession(userId: string) {
        return this.users.get(userId)
    }

    sendToUser<C extends Cmd>(userId: string, cmd: C, body: MessageMap[C]) {
        return this.users.get(userId)?.send(cmd, body) ?? false
    }

    /** 广播给所有已登录连接，只编码一次 */
    broadcast<C extends Cmd>(
        cmd: C,
        body: MessageMap[C],
        filter?: (session: Session) => boolean
    ) {
        const frame = encode(cmd, body)
        let count = 0
        for (const session of this.users.values()) {
            if (filter && !filter(session)) continue
            if (session.sendRaw(frame)) count++
        }
        return count
    }

    private onConnection(ws: WebSocket, remoteAddress: string) {
        const session = new Session(ws, remoteAddress, this.opts.maxBufferedBytes)
        this.sessions.set(session.id, session)
        this.emit('connect', session)

        ws.on('message', (data, isBinary) => {
            session.touch()
            if (!isBinary) {
                session.close(CloseCode.PROTOCOL_ERROR, 'binary frame only')
                return
            }
            let packet: Packet
            try {
                packet = decode(data as Buffer)
            } catch (err) {
                this.emit('sessionError', err as Error, session)
                session.close(CloseCode.PROTOCOL_ERROR, 'bad packet')
                return
            }
            this.router
                .dispatch(session, packet)
                .catch(err => this.emit('sessionError', err, session))
        })

        // 协议层 pong（回应 HeartbeatMonitor 发出的 ping）
        ws.on('pong', () => session.touch())

        ws.on('close', (code, reason) => {
            this.sessions.delete(session.id)
            if (session.userId && this.users.get(session.userId) === session) {
                this.users.delete(session.userId)
            }
            // terminate() 时底层拿到的是 1006，这里还原成真实原因
            const realCode = (session.data.get('closeCode') as number) ?? code
            this.emit('disconnect', session, realCode, reason.toString())
        })

        ws.on('error', err => this.emit('sessionError', err, session))
    }

    private registerBuiltins() {
        this.router.on(
            Cmd.HEARTBEAT_PING,
            (ctx, ping) => {
                ctx.reply(Cmd.HEARTBEAT_PONG, {
                    clientTime: ping.clientTime,
                    serverTime: Date.now(),
                })
            },
            { auth: false }
        )

        this.router.on(
            Cmd.LOGIN_REQ,
            async (ctx, req) => {
                const { session } = ctx
                if (session.authed) {
                    throw new BizError(ErrorCode.ALREADY_LOGIN, 'already login')
                }
                const userId = await this.opts.authenticate(req.token, session)
                if (!userId) throw new BizError(ErrorCode.AUTH_FAILED, 'auth failed')
                // 鉴权是异步的，期间连接可能已经断开
                if (!session.alive) return

                // 单点登录：同一用户的旧连接踢下线
                const old = this.users.get(userId)
                if (old && old !== session) old.close(CloseCode.KICKED, 'login elsewhere')

                session.userId = userId
                this.users.set(userId, session)
                ctx.reply(Cmd.LOGIN_RSP, {
                    userId,
                    sessionId: session.id,
                    heartbeatInterval: this.opts.heartbeatInterval,
                    serverTime: Date.now(),
                })
                this.emit('login', session)
            },
            { auth: false }
        )
    }
}
