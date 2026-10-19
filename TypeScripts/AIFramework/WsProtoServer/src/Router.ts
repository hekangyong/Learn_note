import { Cmd, ErrorCode, MessageMap, Packet } from './protocol'
import { Session } from './Session'

/** handler 中抛出它，框架会以 ErrorRsp 回给客户端（带原请求 seq） */
export class BizError extends Error {
    constructor(readonly code: number, message: string) {
        super(message)
    }
}

export interface Context {
    session: Session
    cmd: Cmd
    seq: number
    /** 解码后的请求体（中间件里读取，handler 用第二个参数拿到带类型的版本） */
    body: unknown
    /** 中间件之间传递数据 */
    state: Map<string, unknown>
    /** 回包：自动带上请求的 seq，客户端据此匹配 Promise */
    reply<R extends Cmd>(cmd: R, body: MessageMap[R]): void
}

export type Handler<C extends Cmd> = (
    ctx: Context,
    body: MessageMap[C]
) => void | Promise<void>

/** 洋葱模型中间件：await next() 之前是请求阶段，之后是响应阶段；抛错会一路冒泡到框架统一回 ERROR */
export type Middleware = (ctx: Context, next: () => Promise<void>) => void | Promise<void>

export interface HandlerOptions {
    /** 是否要求已登录，默认 true */
    auth?: boolean
}

interface Route {
    handler: Handler<any>
    auth: boolean
}

export class Router {
    private readonly routes = new Map<Cmd, Route>()
    private readonly middlewares: Middleware[] = []

    on<C extends Cmd>(cmd: C, handler: Handler<C>, opts: HandlerOptions = {}) {
        if (this.routes.has(cmd)) throw new Error(`duplicate handler: ${Cmd[cmd]}`)
        this.routes.set(cmd, { handler, auth: opts.auth ?? true })
        return this
    }

    /** 中间件按注册顺序执行，作用于所有请求（包括心跳和登录） */
    use(middleware: Middleware) {
        this.middlewares.push(middleware)
        return this
    }

    async dispatch(session: Session, packet: Packet): Promise<void> {
        const ctx: Context = {
            session,
            cmd: packet.cmd,
            seq: packet.seq,
            body: packet.body,
            state: new Map(),
            reply: (cmd, body) => session.send(cmd, body, packet.seq),
        }
        try {
            await this.run(ctx, 0)
        } catch (err) {
            const biz = err instanceof BizError
            session.send(
                Cmd.ERROR,
                {
                    code: biz ? err.code : ErrorCode.UNKNOWN,
                    message: biz ? err.message : 'internal error',
                },
                packet.seq
            )
            if (!biz) throw err
        }
    }

    private async run(ctx: Context, index: number): Promise<void> {
        const middleware = this.middlewares[index]
        if (middleware) {
            let called = false
            await middleware(ctx, () => {
                if (called) throw new Error('next() called multiple times')
                called = true
                return this.run(ctx, index + 1)
            })
            return
        }
        // 中间件链的最内层：路由 + 鉴权 + handler
        const route = this.routes.get(ctx.cmd)
        if (!route) throw new BizError(ErrorCode.NO_HANDLER, `no handler for ${Cmd[ctx.cmd]}`)
        if (route.auth && !ctx.session.authed) throw new BizError(ErrorCode.NOT_LOGIN, 'not login')
        await route.handler(ctx, ctx.body as any)
    }
}
