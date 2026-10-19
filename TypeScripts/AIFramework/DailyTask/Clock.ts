/**
 * 时钟抽象：倒计时、跨天重置都依赖「现在几点」。
 * 业务代码不直接调用 Date.now / setInterval，而是通过 Clock，测试和演示中换成可以手动拨动的 ManualClock。
 */

export interface Clock {
    now(): number
    /** 每隔 ms 毫秒调用一次 fn，返回停止函数 */
    every(ms: number, fn: () => void): () => void
}

export const systemClock: Clock = {
    now: () => Date.now(),
    every(ms, fn) {
        const timer = setInterval(fn, ms)
        return () => clearInterval(timer)
    },
}

/** 手动时钟：advance 拨动时间，并按顺序触发到期的定时器 */
export class ManualClock implements Clock {
    private readonly timers = new Set<{ next: number; ms: number; fn: () => void }>()

    constructor(private time: number) {}

    now(): number {
        return this.time
    }

    every(ms: number, fn: () => void): () => void {
        const timer = { next: this.time + ms, ms, fn }
        this.timers.add(timer)
        return () => this.timers.delete(timer)
    }

    advance(ms: number): void {
        const end = this.time + ms
        for (;;) {
            // 找到最早到期的定时器，把时间拨到那一刻再触发，保证回调里读到的 now() 是准确的
            let due: { next: number; ms: number; fn: () => void } | null = null
            for (const timer of this.timers) if (timer.next <= end && (!due || timer.next < due.next)) due = timer
            if (!due) break
            this.time = due.next
            due.next += due.ms
            due.fn()
        }
        this.time = end
    }
}

export const DAY_MS = 24 * 60 * 60 * 1000

/** 下一个 UTC 零点（每日重置时间）。真实项目按服务器时区计算，这里简化为 UTC */
export function nextResetAt(now: number): number {
    return (Math.floor(now / DAY_MS) + 1) * DAY_MS
}

/** 毫秒 -> HH:MM:SS */
export function formatDuration(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000))
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}
