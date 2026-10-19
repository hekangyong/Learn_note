import { EventEmitter } from 'events'
import { Cmd, Entry, SyncPush, WsProtoClient } from '../../src'

/**
 * 客户端本地镜像
 * - 每次 ready（含断线重连）用本地 version 拉一次增量
 * - 收到推送时校验版本连续性，出现空洞就重新拉取
 */
export class SyncClient extends EventEmitter<{ change: [entries: Entry[]] }> {
    readonly state = new Map<string, string>()
    version = 0
    private syncing = false
    /** 同步期间收到的推送先缓存，SYNC_RSP 应用完再按版本回放 */
    private buffered: SyncPush[] = []

    constructor(readonly client: WsProtoClient) {
        super()
        client.on('ready', () => void this.resync())
        client.onPush(Cmd.SYNC_PUSH, push => this.onPush(push))
    }

    set(key: string, value: string) {
        return this.client.request(Cmd.UPDATE_REQ, { entries: [{ key, value }] })
    }

    delete(key: string) {
        return this.client.request(Cmd.UPDATE_REQ, { entries: [{ key, deleted: true }] })
    }

    async resync() {
        if (this.syncing) return
        this.syncing = true
        try {
            const rsp = await this.client.request(Cmd.SYNC_REQ, {
                sinceVersion: this.version,
            })
            if (rsp.full) this.state.clear()
            this.applyEntries(rsp.entries, rsp.version)
        } catch {
            // 连接断开会触发重连，ready 后会再次 resync
            this.buffered = []
        } finally {
            this.syncing = false
        }
        // ws 可能在同一个 tick 里连续派发 SYNC_RSP 和后续 SYNC_PUSH，
        // 此时 await 还没返回，推送只能先缓存，这里统一回放（旧版本会被跳过）
        const buffered = this.buffered
        this.buffered = []
        for (const push of buffered) this.onPush(push)
    }

    private onPush(push: SyncPush) {
        if (this.syncing) {
            this.buffered.push(push)
            return
        }
        if (!push.entries.length || push.version <= this.version) return // 旧消息
        const first = push.entries[0].version!
        if (first !== this.version + 1) {
            void this.resync() // 版本出现空洞
            return
        }
        this.applyEntries(push.entries, push.version)
    }

    private applyEntries(entries: Entry[], version: number) {
        for (const e of entries) {
            if (e.deleted) this.state.delete(e.key)
            else this.state.set(e.key, e.value ?? '')
        }
        this.version = version // 先更新版本再通知，监听者读到的 version 与 state 一致
        if (entries.length) this.emit('change', entries)
    }
}
