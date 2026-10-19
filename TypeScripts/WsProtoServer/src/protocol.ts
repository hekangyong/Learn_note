import path from 'path'
import protobuf from 'protobufjs'

// ---------------- 命令号（与 proto/message.proto 中的 enum Cmd 保持一致） ----------------
export enum Cmd {
    HEARTBEAT_PING = 1,
    HEARTBEAT_PONG = 2,
    LOGIN_REQ = 10,
    LOGIN_RSP = 11,
    SYNC_REQ = 20,
    SYNC_RSP = 21,
    UPDATE_REQ = 22,
    UPDATE_RSP = 23,
    SYNC_PUSH = 24,
    TASK_FETCH_REQ = 30,
    TASK_FETCH_RSP = 31,
    TASK_CLAIM_REQ = 32,
    TASK_CLAIM_RSP = 33,
    TASK_PUSH = 34,
    ERROR = 99,
}

/** 业务错误码 */
export enum ErrorCode {
    UNKNOWN = 1,
    NOT_LOGIN = 2,
    AUTH_FAILED = 3,
    ALREADY_LOGIN = 4,
    NO_HANDLER = 5,
    BAD_REQUEST = 6,
    RATE_LIMITED = 7,
    TASK_NOT_CLAIMABLE = 100,
}

/** WebSocket 关闭码（4000-4999 为应用自定义区间） */
export enum CloseCode {
    NORMAL = 1000,
    SERVER_SHUTDOWN = 1001,
    HEARTBEAT_TIMEOUT = 4000,
    AUTH_TIMEOUT = 4001,
    KICKED = 4002,
    SLOW_CONSUMER = 4003,
    PROTOCOL_ERROR = 4004,
}

// ---------------- 消息体类型 ----------------
export interface Ping {
    clientTime: number
}
export interface Pong {
    clientTime: number
    serverTime: number
}
export interface LoginReq {
    token: string
}
export interface LoginRsp {
    userId: string
    sessionId: string
    heartbeatInterval: number
    serverTime: number
}
export interface Entry {
    key: string
    value?: string
    version?: number
    deleted?: boolean
}
export interface SyncReq {
    sinceVersion: number
}
export interface SyncRsp {
    version: number
    entries: Entry[]
    full: boolean
}
export interface UpdateReq {
    entries: Entry[]
}
export interface UpdateRsp {
    version: number
}
export interface SyncPush {
    version: number
    entries: Entry[]
}
export interface TaskInfo {
    id: number
    title: string
    kind: string
    target: number
    progress: number
    reward: number
    claimed: boolean
}
export interface TaskFetchReq {}
export interface TaskFetchRsp {
    tasks: TaskInfo[]
    resetAt: number
}
export interface TaskClaimReq {
    taskIds: number[]
}
export interface TaskClaimRsp {
    claimed: number[]
    gold: number
}
export enum TaskPushType {
    PROGRESS = 0,
    RESET = 1,
}
export interface TaskPush {
    type: TaskPushType
    tasks: TaskInfo[]
    resetAt: number
}
export interface ErrorRsp {
    code: number
    message: string
}

/** cmd -> 消息体类型，Router / Session / Client 都依赖它做类型推导 */
export interface MessageMap {
    [Cmd.HEARTBEAT_PING]: Ping
    [Cmd.HEARTBEAT_PONG]: Pong
    [Cmd.LOGIN_REQ]: LoginReq
    [Cmd.LOGIN_RSP]: LoginRsp
    [Cmd.SYNC_REQ]: SyncReq
    [Cmd.SYNC_RSP]: SyncRsp
    [Cmd.UPDATE_REQ]: UpdateReq
    [Cmd.UPDATE_RSP]: UpdateRsp
    [Cmd.SYNC_PUSH]: SyncPush
    [Cmd.TASK_FETCH_REQ]: TaskFetchReq
    [Cmd.TASK_FETCH_RSP]: TaskFetchRsp
    [Cmd.TASK_CLAIM_REQ]: TaskClaimReq
    [Cmd.TASK_CLAIM_RSP]: TaskClaimRsp
    [Cmd.TASK_PUSH]: TaskPush
    [Cmd.ERROR]: ErrorRsp
}

/** 请求 cmd -> 响应 cmd，供客户端 request() 推导返回值类型 */
export interface ResponseMap {
    [Cmd.LOGIN_REQ]: Cmd.LOGIN_RSP
    [Cmd.SYNC_REQ]: Cmd.SYNC_RSP
    [Cmd.UPDATE_REQ]: Cmd.UPDATE_RSP
    [Cmd.TASK_FETCH_REQ]: Cmd.TASK_FETCH_RSP
    [Cmd.TASK_CLAIM_REQ]: Cmd.TASK_CLAIM_RSP
}
export type RequestCmd = keyof ResponseMap

/** cmd -> proto 中的 message 名 */
const CMD_TYPE: Record<Cmd, string> = {
    [Cmd.HEARTBEAT_PING]: 'Ping',
    [Cmd.HEARTBEAT_PONG]: 'Pong',
    [Cmd.LOGIN_REQ]: 'LoginReq',
    [Cmd.LOGIN_RSP]: 'LoginRsp',
    [Cmd.SYNC_REQ]: 'SyncReq',
    [Cmd.SYNC_RSP]: 'SyncRsp',
    [Cmd.UPDATE_REQ]: 'UpdateReq',
    [Cmd.UPDATE_RSP]: 'UpdateRsp',
    [Cmd.SYNC_PUSH]: 'SyncPush',
    [Cmd.TASK_FETCH_REQ]: 'TaskFetchReq',
    [Cmd.TASK_FETCH_RSP]: 'TaskFetchRsp',
    [Cmd.TASK_CLAIM_REQ]: 'TaskClaimReq',
    [Cmd.TASK_CLAIM_RSP]: 'TaskClaimRsp',
    [Cmd.TASK_PUSH]: 'TaskPush',
    [Cmd.ERROR]: 'ErrorRsp',
}

// ---------------- 编解码 ----------------
const root = protobuf.loadSync(
    path.resolve(__dirname, '..', 'proto', 'message.proto')
)
const EnvelopeType = root.lookupType('wsproto.Envelope')
const types = new Map<number, protobuf.Type>()
for (const [cmd, name] of Object.entries(CMD_TYPE)) {
    types.set(Number(cmd), root.lookupType(`wsproto.${name}`))
}

// int64 统一转成 number（毫秒时间戳、版本号都在 2^53 以内）
const TO_OBJECT: protobuf.IConversionOptions = {
    longs: Number,
    enums: Number,
    defaults: true,
    arrays: true,
}

export interface Packet<C extends Cmd = Cmd> {
    cmd: C
    seq: number
    body: MessageMap[C]
}

export class ProtocolError extends Error {}

export function encode<C extends Cmd>(
    cmd: C,
    body: MessageMap[C],
    seq = 0
): Uint8Array {
    const type = types.get(cmd)
    if (!type) throw new ProtocolError(`unknown cmd ${cmd}`)
    const err = type.verify(body)
    if (err) throw new ProtocolError(`[${Cmd[cmd]}] ${err}`)
    const payload = type.encode(type.fromObject(body)).finish()
    return EnvelopeType.encode(
        EnvelopeType.create({ cmd, seq, payload })
    ).finish()
}

export function decode(data: Uint8Array): Packet {
    let env: { cmd: number; seq: number; payload: Uint8Array }
    try {
        env = EnvelopeType.toObject(EnvelopeType.decode(data), TO_OBJECT) as any
    } catch (e) {
        throw new ProtocolError(`bad envelope: ${(e as Error).message}`)
    }
    const type = types.get(env.cmd)
    if (!type) throw new ProtocolError(`unknown cmd ${env.cmd}`)
    try {
        const body = type.toObject(type.decode(env.payload), TO_OBJECT)
        return { cmd: env.cmd, seq: env.seq, body } as Packet
    } catch (e) {
        throw new ProtocolError(`[${Cmd[env.cmd]}] ${(e as Error).message}`)
    }
}
