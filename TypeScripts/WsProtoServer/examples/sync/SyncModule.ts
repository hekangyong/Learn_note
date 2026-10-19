import { BizError, Cmd, ErrorCode, Module } from '../../src'
import { SyncStore } from './SyncStore'

/** 数据同步模块：SYNC_REQ 拉取全量 / 增量，UPDATE_REQ 修改后广播 SYNC_PUSH */
export class SyncModule extends Module {
    readonly name = 'sync'

    constructor(readonly store = new SyncStore()) {
        super()
    }

    onInit() {
        this.handle(Cmd.SYNC_REQ, (ctx, req) => {
            const diff = this.store.diffSince(req.sinceVersion)
            ctx.reply(Cmd.SYNC_RSP, { version: this.store.currentVersion, ...diff })
        })

        this.handle(Cmd.UPDATE_REQ, (ctx, req) => {
            if (!req.entries.length || req.entries.some(e => !e.key)) {
                throw new BizError(ErrorCode.BAD_REQUEST, 'entries must have key')
            }
            const applied = this.store.apply(req.entries)
            // 先回包再广播：同一连接上消息有序，发起者先拿到 UPDATE_RSP
            ctx.reply(Cmd.UPDATE_RSP, { version: this.store.currentVersion })
            this.broadcast(Cmd.SYNC_PUSH, { version: this.store.currentVersion, entries: applied })
        })
    }
}
