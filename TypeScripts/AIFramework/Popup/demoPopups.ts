/**
 * 演示用的弹窗类型登记（demo.ts / decoratorDemo.ts / archDemo.ts 共用同一个模拟游戏）
 *
 * 真实项目中每个业务模块在自己的文件里登记自己的弹窗（例如 DailyTask/TaskPanel.ts），
 * 这里三个演示共用一套弹窗，所以集中写在一起。
 */
import { popupPriority } from './PopupManager'

export interface GuideData {
    step: number
    text: string
}
export interface LevelUpData {
    level: number
}
export interface RewardData {
    itemId: number
    count: number
}
export interface ShopData {
    itemId: number
    price: number
}
export interface ActivityData {
    activityId: number
}
export interface NoticeData {
    title: string
}

declare module './PopupManager' {
    interface PopupDataMap {
        /** 新手引导弹窗 */
        Guide: GuideData
        /** 升级 */
        LevelUp: LevelUpData
        /** 奖励 */
        Reward: RewardData
        /** 商店购买 */
        Shop: ShopData
        /** 活动 */
        Activity: ActivityData
        /** 公告 */
        Notice: NoticeData
    }
}

/** 演示弹窗的优先级：档位 + 档内偏移 */
export const DemoPriority = {
    Guide: popupPriority('Guide'),
    LevelUp: popupPriority('Reward', 100), // 升级比普通奖励更重要
    Reward: popupPriority('Reward'),
    Shop: popupPriority('Panel', 50),
    Activity: popupPriority('Panel'),
    Notice: popupPriority('Notice'),
}
