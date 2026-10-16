/**
 * 弹窗管理系统演示：用装饰器注册弹窗
 *
 * 运行：npx tsc && node dist/Popup/decoratorDemo.js
 */
import { PopupComponent } from './PopupDecorators'
import {
    AfterTutorial,
    Condition,
    popup,
    PopupDataMap,
    PopupPriority,
    popupView,
    PopupWindow,
} from './PopupManager'

// 模拟的游戏状态
const player = { level: 5, inBattle: false }
const NEWBIE_GIFT_ID = 9001

// ------------------------------------------------------------
// 1. 用装饰器声明弹窗：类本身就是弹窗 UI，规则写在类旁边
// ------------------------------------------------------------

/** 新手引导：引导期间可弹、可抢占、同时只存在一个 */
@PopupWindow('Guide', {
    priority: PopupPriority.Guide,
    tutorial: 'allow',
    preempt: true,
    unique: 'type',
})
class GuidePopup implements PopupComponent<PopupDataMap['Guide']> {
    onShow(data: PopupDataMap['Guide']) {
        console.log(`  [显示] 引导 第${data.step}步：${data.text}`)
    }
    onHide() {
        console.log('  [隐藏] 引导')
    }
}

/** 升级：战斗中不弹 */
@PopupWindow('LevelUp', { priority: PopupPriority.LevelUp })
class LevelUpPopup implements PopupComponent<PopupDataMap['LevelUp']> {
    @Condition
    static notInBattle() {
        return !player.inBattle
    }

    onShow(data: PopupDataMap['LevelUp']) {
        console.log(`  [显示] 升级 Lv.${data.level}`)
    }
    onHide() {
        console.log('  [隐藏] 升级')
    }
}

/** 奖励：引导第 3 步之后可弹；引导结束时不再弹新手礼包 */
@PopupWindow('Reward', {
    priority: PopupPriority.Reward,
    tutorial: step => step >= 3,
})
class RewardPopup implements PopupComponent<PopupDataMap['Reward']> {
    /** 实例状态：被抢占后恢复时复用同一个实例，这个计数会保留 */
    private showTimes = 0

    @Condition
    static notInBattle() {
        return !player.inBattle
    }

    @AfterTutorial
    static keepAfterTutorial(data: PopupDataMap['Reward'], waited: number) {
        return data.itemId !== NEWBIE_GIFT_ID && waited < 10 * 60_000
    }

    onShow(data: PopupDataMap['Reward']) {
        this.showTimes++
        console.log(`  [显示] 奖励 道具 ${data.itemId} x${data.count}（第 ${this.showTimes} 次显示）`)
    }
    onHide() {
        console.log('  [隐藏] 奖励')
    }
    onDispose() {
        console.log('  [释放] 奖励实例')
    }
}

/** 活动：引导期间丢弃；10 级开放；条件可以返回 drop 直接丢弃 */
@PopupWindow('Activity', {
    priority: PopupPriority.Activity,
    tutorial: 'drop',
    unique: 'type',
    onDuplicate: 'replace',
})
class ActivityPopup implements PopupComponent<PopupDataMap['Activity']> {
    @Condition
    static levelEnough() {
        return player.level >= 10
    }

    @Condition
    static notExpired(data: PopupDataMap['Activity']) {
        return data.activityId === 0 ? 'drop' : 'show' // 0 表示活动已下线
    }

    onShow(data: PopupDataMap['Activity']) {
        console.log(`  [显示] 活动 ${data.activityId}`)
    }
}

/** 公告：弹窗内部自己调用 close 并返回结果（例如确认框） */
@PopupWindow('Notice', { priority: PopupPriority.Notice })
class NoticePopup implements PopupComponent<PopupDataMap['Notice']> {
    onShow(data: PopupDataMap['Notice'], close: (result?: unknown) => void) {
        console.log(`  [显示] 公告：${data.title}`)
        setTimeout(() => close('confirmed'), 0) // 模拟玩家点击「确定」
    }
}

// 类只需要被定义就会完成注册；这里引用一下，避免「声明了但未使用」的提示
void [GuidePopup, LevelUpPopup, RewardPopup, ActivityPopup, NoticePopup]

// ------------------------------------------------------------
// 2. 演示
// ------------------------------------------------------------
popup.setView(popupView) // 装饰器模式下由 popupView 根据类型创建 UI 实例

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

async function closeCurrent() {
    const current = popup.currentPopup
    if (current) popup.close(current.id)
    await tick()
}

async function demo() {
    console.log('1. 优先级 + @Condition：战斗中升级和奖励都不弹，公告先弹')
    player.inBattle = true
    popup.open('Reward', { itemId: 1, count: 5 })
    popup.open('LevelUp', { level: 6 })
    const notice = popup.open('Notice', { title: '维护公告' })
    if (notice.ok) console.log(`  公告结果：${String((await notice.closed).result)}`) // 弹窗内部 close 返回结果
    console.log('  -- 战斗结束')
    player.inBattle = false
    popup.refresh()
    await tick() // 升级优先级更高
    await closeCurrent() // -> 奖励
    await closeCurrent()

    console.log('2. 抢占：引导打断奖励，恢复时复用同一个实例')
    popup.open('Reward', { itemId: 2, count: 1 })
    await tick()
    popup.open('Guide', { step: 1, text: '点击背包' })
    await tick()
    await closeCurrent() // 奖励恢复，showTimes 变为 2
    await closeCurrent()

    console.log('3. @AfterTutorial：引导结束时丢弃新手礼包，保留普通奖励')
    popup.setTutorial(true, 1)
    const gift = popup.open('Reward', { itemId: NEWBIE_GIFT_ID, count: 1 })
    popup.open('Reward', { itemId: 3, count: 2 })
    popup.open('Activity', { activityId: 1 }) // 引导期间 drop
    await tick()
    popup.setTutorial(false)
    if (gift.ok) console.log(`  新手礼包：${(await gift.closed).reason}`)
    await tick()
    await closeCurrent()

    console.log('4. 多个 @Condition 按顺序检查：等级满足后，已下线的活动被 drop')
    player.level = 10
    const offline = popup.open('Activity', { activityId: 0 })
    if (offline.ok) console.log(`  下线活动：${(await offline.closed).reason}`)
    popup.open('Activity', { activityId: 5 })
    await tick()
    await closeCurrent()
}

demo()
