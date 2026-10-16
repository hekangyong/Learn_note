/**
 * 红点管理器：全局唯一的 RedDotSystem 实例 + 集中定义的红点路径
 *
 * 为什么只要一个实例：
 *   - 主界面按钮要汇总邮件、背包、任务……所有模块的红点，只有挂在同一棵树上才能自动累加；
 *   - 所有更新进入同一个 pending，一批只 flush 一次，合并效果最好。
 *
 * 为什么用「模块级常量」实现单例，而不是 static 类 / getInstance()：
 *   - ES 模块（以及编译后的 CommonJS 模块）只会执行一次并被缓存，
 *     任何地方 import 拿到的都是同一个 redDot，天然就是单例，不需要额外的判空和懒加载；
 *   - RedDotSystem 仍是普通类：单元测试可以 new 一个干净的实例，互不干扰；
 *   - 切换账号时调用 redDot.clear() 清空数值，监听者保留，UI 无需重新绑定。
 *
 * 使用约定：
 *   - 业务代码和 UI 只从本文件引用 redDot 与 RedDotPath，不要自己 new RedDotSystem；
 *   - 路径一律使用 RedDotPath 中的常量，不要手写字符串，拼错时能在编译期发现。
 */
import { RedDotSystem } from './RedDot'

/**
 * 全局调度方式统一在这里决定：
 *   - 普通 UI：默认微任务即可（一段同步代码里的所有更新合并成一批）；
 *   - 游戏/动画：改为按帧合并，每帧最多刷新一次 UI：
 *       new RedDotSystem(flush => requestAnimationFrame(() => flush()))
 */
export const redDot = new RedDotSystem()

/**
 * 红点路径常量：同时也是整棵红点树结构的「目录」。
 * 新增红点时先在这里登记，团队成员看这一个对象就知道有哪些红点、谁是谁的父节点。
 *
 *   Main
 *   ├── Mail
 *   │   ├── System
 *   │   └── Friend
 *   └── Bag
 *       └── Item/{id}
 */
export const RedDotPath = {
    Main: 'Main',

    Mail: 'Main/Mail',
    MailSystem: 'Main/Mail/System',
    MailFriend: 'Main/Mail/Friend',

    Bag: 'Main/Bag',
    /** 动态路径：每个道具一个节点，用函数生成，保证格式统一 */
    BagItem: (itemId: number) => `Main/Bag/Item/${itemId}`,
} as const
