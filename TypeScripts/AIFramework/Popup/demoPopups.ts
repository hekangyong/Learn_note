/**
 * 演示用的弹窗类型登记（demo.ts / decoratorDemo.ts / archDemo.ts 共用同一个模拟游戏）
 *
 * 真实项目中每个业务模块在自己的文件里登记自己的弹窗（例如 DailyTask/TaskPanel.ts），
 * 这里三个演示共用一套弹窗，所以集中写在一起。
 */
import type { TutorialContext } from './Popup'
import { PopupDataMap, popupPriority } from './PopupManager'

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

/**
 * 模拟的主线新手引导配置。实际项目中由引导模块根据配置表生成，每一步开始时调用 popup.setTutorial(step)，
 * 引导结束时调用 popup.setTutorial(null)。弹窗模块不需要知道这些步骤。
 */
export const MainGuide = {
    /** 第 1 步：认识界面 */
    intro: { guideId: 'main', stepId: 'intro', step: 1 },
    /** 第 3 步：领取奖励教学，这一步需要弹出奖励弹窗 */
    claimReward: { guideId: 'main', stepId: 'claim_reward', step: 3, allowPopups: ['Reward'] },
} as const satisfies Record<string, TutorialContext<keyof PopupDataMap>>

/** 演示弹窗的优先级：档位 + 档内偏移 */
export const DemoPriority = {
    Guide: popupPriority('Guide'),
    LevelUp: popupPriority('Reward', 100), // 升级比普通奖励更重要
    Reward: popupPriority('Reward'),
    Shop: popupPriority('Panel', 50),
    Activity: popupPriority('Panel'),
    Notice: popupPriority('Notice'),
}
