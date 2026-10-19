import { Entry } from '../../src'

/**
 * 带版本号的 KV 存储
 * - 每次修改全局 version + 1，并写入变更日志
 * - 客户端带着本地 version 来拉取：日志能覆盖 -> 增量；否则 -> 全量快照
 */
export class SyncStore {
    private version = 0
    private readonly data = new Map<string, Entry>()
    /** 变更日志，version 严格递增；删除以墓碑(deleted=true)记录 */
    private readonly log: Entry[] = []

    constructor(private readonly maxLog = 1000) {}

    get currentVersion() {
        return this.version
    }

    apply(changes: Entry[]): Entry[] {
        const applied: Entry[] = []
        for (const c of changes) {
            const entry: Entry = {
                key: c.key,
                value: c.deleted ? '' : c.value ?? '',
                version: ++this.version,
                deleted: !!c.deleted,
            }
            if (entry.deleted) this.data.delete(entry.key)
            else this.data.set(entry.key, entry)
            this.log.push(entry)
            applied.push(entry)
        }
        if (this.log.length > this.maxLog) {
            this.log.splice(0, this.log.length - this.maxLog)
        }
        return applied
    }

    diffSince(since: number): { full: boolean; entries: Entry[] } {
        if (since === this.version) return { full: false, entries: [] }
        const oldest = this.log.length ? this.log[0].version! : this.version + 1
        // since > version: 服务端数据被重置过；since < oldest-1: 日志已被裁剪
        if (since > 0 && since <= this.version && since >= oldest - 1) {
            return { full: false, entries: this.log.filter(e => e.version! > since) }
        }
        return { full: true, entries: [...this.data.values()] }
    }
}
