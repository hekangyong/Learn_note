/**
 * 钱包模块：服务器端保存玩家金币，其他模块通过 app.get(WalletModule) 直接调用
 */
import { Module } from '../../WsProtoServer/src'

declare module '../../WsProtoServer/src/app/EventBus' {
    interface AppEvents {
        /** 金币变化（之后的成就、排行榜等模块可以订阅） */
        'wallet:changed': [userId: string, gold: number, delta: number, reason: string]
    }
}

export class WalletModule extends Module {
    readonly name = 'wallet'
    private readonly gold = new Map<string, number>()

    constructor(private readonly initialGold = 100) {
        super()
    }

    goldOf(userId: string): number {
        return this.gold.get(userId) ?? this.initialGold
    }

    add(userId: string, delta: number, reason: string): number {
        const gold = this.goldOf(userId) + delta
        this.gold.set(userId, gold)
        this.emit('wallet:changed', userId, gold, delta, reason)
        return gold
    }
}
