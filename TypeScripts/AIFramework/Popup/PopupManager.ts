/**
 * 弹窗管理器：全局唯一的 PopupSystem 实例 + 弹窗数据类型表 + 优先级档位
 *
 * 单例的实现方式与红点系统相同：导出模块级常量。
 * 模块只会执行一次并被缓存，任何地方 import 拿到的都是同一个 popup；
 * PopupSystem 仍是普通类，单元测试可以 new 一个干净的实例。
 *
 * 使用约定：
 *   - 业务代码只调用 popup.open(type, data)，不要直接打开弹窗 UI；
 *   - 新增弹窗时，在业务模块自己的文件里（通常就是弹窗类所在文件）：
 *       1. 通过声明合并把弹窗类型登记到 PopupDataMap；
 *       2. 用 popupPriority(档位, 偏移) 计算优先级，然后 @PopupWindow / popup.register；
 *     框架文件（本文件）不需要改动；
 *   - UI 层在启动时调用 popup.setView(view)，关闭按钮调用 popup.close(id, result)。
 */
import { PopupSystem } from './Popup'
import { createPopupDecorators } from './PopupDecorators'

/**
 * 弹窗类型表：key 是弹窗类型，value 是该弹窗的数据类型。
 * popup.open('Reward', data) 时会检查 data 是否符合 Reward 的数据类型，
 * UI 中 switch (info.type) 后 info.data 也会自动收窄为对应类型。
 *
 * 框架里是空的，由各业务模块通过声明合并在自己的文件里登记（路径是从该文件到本文件的相对路径）：
 *
 *   declare module '../Popup/PopupManager' {
 *       interface PopupDataMap {
 *           DailyTask: { focusTaskId?: number }
 *       }
 *   }
 *
 * 这样框架不依赖业务；删除一个模块时，它的类型登记也随之消失。
 * 两个模块用了同一个名字、但数据类型不同时会编译报错。为了避免撞名，建议名字带上模块前缀。
 */
export interface PopupDataMap {}

/**
 * 优先级档位：集中定义「哪一类弹窗比哪一类重要」，便于整体评审；
 * 同一档内的先后由各模块用 popupPriority(档位, 偏移) 自行决定。
 * 档位之间留出间隔，偏移不能越过上一档（popupPriority 会检查）。
 */
export const PopupPriority = {
    /** 新手引导 */
    Guide: 1000,
    /** 系统级：断线重连、强制更新、二次确认 */
    System: 500,
    /** 奖励、升级等结算类 */
    Reward: 200,
    /** 功能面板、活动 */
    Panel: 100,
    /** 公告、提示 */
    Notice: 50,
} as const

export type PopupTier = keyof typeof PopupPriority

/**
 * 计算某个弹窗的优先级：档位基准值 + 档内偏移。
 * 偏移必须让结果仍然低于上一档的基准值，否则抛出异常（属于配置错误，启动时就会暴露）。
 * @example popupPriority('Panel', 20) // 120，比普通面板高一点，但仍低于所有奖励类弹窗
 */
export function popupPriority(tier: PopupTier, offset = 0): number {
    const base = PopupPriority[tier]
    const value = base + offset
    const ceiling = Math.min(
        ...Object.values(PopupPriority).filter(v => v > base),
        Number.POSITIVE_INFINITY
    )
    if (offset < 0 || value >= ceiling) {
        throw new Error(`[Popup] 优先级偏移越界：${tier}(${base}) + ${offset}，必须在 [${base}, ${ceiling}) 之内`)
    }
    return value
}

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
