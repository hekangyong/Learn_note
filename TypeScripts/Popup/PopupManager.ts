/**
 * 弹窗管理器：全局唯一的 PopupSystem 实例 + 弹窗数据类型表 + 优先级常量
 *
 * 单例的实现方式与红点系统相同：导出模块级常量。
 * 模块只会执行一次并被缓存，任何地方 import 拿到的都是同一个 popup；
 * PopupSystem 仍是普通类，单元测试可以 new 一个干净的实例。
 *
 * 使用约定：
 *   - 业务代码只调用 popup.open(type, data)，不要直接打开弹窗 UI；
 *   - 新增弹窗时：先在 PopupDataMap 中声明数据类型，再在 PopupPriority 中登记优先级，
 *     最后在模块初始化时 popup.register(type, config)；
 *   - UI 层在启动时调用 popup.setView(view)，关闭按钮调用 popup.close(id, result)。
 */
import { PopupSystem } from './Popup'
import { createPopupDecorators } from './PopupDecorators'

/**
 * 弹窗类型表：key 是弹窗类型，value 是该弹窗的数据类型。
 * popup.open('Reward', data) 时会检查 data 是否符合 Reward 的数据类型，
 * UI 中 switch (info.type) 后 info.data 也会自动收窄为对应类型。
 */
export interface PopupDataMap {
    /** 新手引导弹窗 */
    Guide: { step: number; text: string }
    /** 升级 */
    LevelUp: { level: number }
    /** 奖励 */
    Reward: { itemId: number; count: number }
    /** 商店购买 */
    Shop: { itemId: number; price: number }
    /** 活动 */
    Activity: { activityId: number }
    /** 公告 */
    Notice: { title: string }
}

/**
 * 优先级集中定义，便于整体调整和评审。
 * 数值之间留出间隔，以后插入新弹窗时不需要改动已有的数值。
 */
export const PopupPriority = {
    Guide: 1000,
    LevelUp: 300,
    Reward: 200,
    Shop: 150,
    Activity: 100,
    Notice: 50,
} as const satisfies Record<keyof PopupDataMap, number>

/** 全局弹窗管理器 */
export const popup = new PopupSystem<PopupDataMap>()

/**
 * 绑定到全局 popup 的装饰器（用法见 PopupDecorators.ts）。
 * 使用装饰器模式时，在 UI 启动时调用 popup.setView(popupView)。
 */
export const {
    PopupWindow,
    Condition,
    AfterTutorial,
    view: popupView,
} = createPopupDecorators(popup)
