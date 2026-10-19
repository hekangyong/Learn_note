/**
 * 弹窗管理系统演示
 *
 * 运行：npx tsc && node dist/AIFramework/Popup/demo.js
 */
import { AnyPopupInfo, OpenResult } from './Popup'
import { DemoPriority, MainGuide } from './demoPopups'
import { popup, PopupDataMap } from './PopupManager'

// ------------------------------------------------------------
// 1. 模拟的游戏状态（实际项目中来自玩家数据模块）
// ------------------------------------------------------------
const player = { level: 5, inBattle: false }

// ------------------------------------------------------------
// 2. 注册弹窗配置（实际项目中放在各模块的初始化里）
// ------------------------------------------------------------

// 新手引导弹窗：引导期间当然可以弹；可以抢占其他弹窗；同时只存在一个
popup.register('Guide', {
    priority: DemoPriority.Guide,
    tutorial: 'allow',
    preempt: true,
    unique: 'type',
})

// 升级：引导期间延后；战斗中不弹，战斗结束后再弹
popup.register('LevelUp', {
    priority: DemoPriority.LevelUp,
    conditions: [() => !player.inBattle],
})

/** 新手礼包的道具 id：引导流程里会专门展示，引导结束后不需要再弹奖励弹窗 */
const NEWBIE_GIFT_ID = 9001

// 奖励：引导期间默认延后，「领取奖励」这一步由引导配置放行（MainGuide.claimReward.allowPopups），
// 奖励弹窗本身不需要知道引导有哪些步骤；按 itemId + count 去重（默认 data 去重）
// 主线新手结束时：新手礼包不再弹；被引导拦了 10 分钟以上的奖励已经过时，也不再弹
popup.register('Reward', {
    priority: DemoPriority.Reward,
    afterTutorial: (data, waited, guide) =>
        !(guide.guideId === 'main' && data.itemId === NEWBIE_GIFT_ID) && waited < 10 * 60_000,
})

// 活动：引导期间触发的直接丢弃；10 级开放；活动数据更新时只弹最新的
popup.register('Activity', {
    priority: DemoPriority.Activity,
    tutorial: 'drop',
    conditions: [() => player.level >= 10],
    unique: 'type',
    onDuplicate: 'replace',
})

// 公告：排队超过 50ms 就没有意义了（演示用，实际可能是几分钟）
popup.register('Notice', {
    priority: DemoPriority.Notice,
    ttl: 50,
})

// ------------------------------------------------------------
// 3. 视图适配器（实际项目中由 UI 框架实现，这里只打印日志）
// ------------------------------------------------------------
popup.setView({
    show(info: AnyPopupInfo<PopupDataMap>) {
        // switch 后 info.data 会被收窄为对应弹窗的数据类型
        switch (info.type) {
            case 'Reward':
                console.log(`  [显示] 奖励 #${info.id} 道具 ${info.data.itemId} x${info.data.count}`)
                break
            case 'LevelUp':
                console.log(`  [显示] 升级 #${info.id} Lv.${info.data.level}`)
                break
            default:
                console.log(`  [显示] ${info.type} #${info.id} ${JSON.stringify(info.data)}`)
        }
    },
    hide(info) {
        console.log(`  [隐藏] ${info.type} #${info.id}`)
    },
})

// ------------------------------------------------------------
// 4. 演示工具
// ------------------------------------------------------------

/** 等待管理器在微任务中完成挑选 */
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

/** 模拟玩家关闭当前弹窗 */
async function closeCurrent() {
    const current = popup.currentPopup
    if (current) popup.close(current.id)
    await tick()
}

/** 打印 open 的结果，并在弹窗结束时打印原因 */
function track(label: string, result: OpenResult) {
    if (!result.ok) {
        console.log(`  [拒绝] ${label}：重复，已存在 #${result.existingId}`)
        return
    }
    result.closed.then(r => {
        if (r.reason !== 'closed') console.log(`  [结束] ${label} #${result.id}：${r.reason}`)
    })
}

// ------------------------------------------------------------
// 5. 演示
// ------------------------------------------------------------
async function demo() {
    console.log('1. 优先级：同一时刻触发多个弹窗，按优先级依次弹出')
    track('公告', popup.open('Notice', { title: '维护公告' }))
    track('奖励', popup.open('Reward', { itemId: 1, count: 5 }))
    track('升级', popup.open('LevelUp', { level: 6 }))
    await tick() // 虽然公告最先 open，但升级的优先级最高，先弹升级
    await closeCurrent() // -> 奖励
    await closeCurrent() // -> 公告
    await closeCurrent()

    console.log('2. 去重：同类型 + 同数据不重复弹出（与 key 顺序无关）')
    track('奖励A', popup.open('Reward', { itemId: 2, count: 1 }))
    track('奖励A(重复)', popup.open('Reward', { count: 1, itemId: 2 }))
    track('奖励B', popup.open('Reward', { itemId: 3, count: 1 })) // 数据不同，可以弹
    await tick()
    track('奖励A(显示中再次触发)', popup.open('Reward', { itemId: 2, count: 1 }))
    await closeCurrent()
    await closeCurrent()

    console.log('3. 新手模式：allow 可弹 / defer 延后 / drop 丢弃 / 引导步骤放行')
    popup.setTutorial(MainGuide.intro)
    track('引导', popup.open('Guide', { step: 1, text: '点击这里' })) // allow
    track('升级', popup.open('LevelUp', { level: 7 })) // defer：等引导结束
    track('奖励', popup.open('Reward', { itemId: 4, count: 1 })) // 等「领取奖励」这一步放行
    track('活动', popup.open('Activity', { activityId: 1 })) // drop：直接丢弃
    await tick()
    await closeCurrent() // 引导弹窗关闭，升级、奖励都还不能弹
    console.log('  -- 引导推进到「领取奖励」步骤（这一步放行奖励弹窗）')
    popup.setTutorial(MainGuide.claimReward)
    await tick() // 奖励被这一步放行，弹出；升级仍在等待
    await closeCurrent()
    console.log('  -- 引导结束')
    popup.setTutorial(null)
    await tick() // 升级弹出
    await closeCurrent()

    console.log('4. 引导开始时，正在显示的不允许的弹窗被收起，引导结束后恢复')
    track('升级', popup.open('LevelUp', { level: 8 }))
    await tick()
    popup.setTutorial(MainGuide.intro)
    await tick() // 升级被收起
    popup.setTutorial(null)
    await tick() // 升级恢复显示
    await closeCurrent()

    console.log('5. 弹出条件：等级不足时等待，不阻塞后面的弹窗；条件满足后 refresh 弹出')
    track('活动', popup.open('Activity', { activityId: 2 }))
    track('活动(数据更新)', popup.open('Activity', { activityId: 3 })) // replace：替换排队中的旧活动
    track('公告', popup.open('Notice', { title: '新版本' }))
    await tick() // 活动优先级更高，但等级不足，先弹公告
    await closeCurrent()
    console.log('  -- 玩家升到 10 级')
    player.level = 10
    popup.refresh()
    await tick()
    await closeCurrent()

    console.log('6. 抢占：引导弹窗打断正在显示的公告，关闭后公告恢复')
    track('公告', popup.open('Notice', { title: '活动预告' }))
    await tick()
    track('引导', popup.open('Guide', { step: 2, text: '打开背包' }))
    await tick()
    await closeCurrent() // 公告恢复（显示过的弹窗不受 ttl 影响）
    await closeCurrent()

    console.log('7. 暂停 + 超时：战斗中暂停弹窗，公告排队超时被丢弃')
    popup.pause()
    track('公告', popup.open('Notice', { title: '限时公告' }))
    track('奖励', popup.open('Reward', { itemId: 5, count: 1 }))
    await new Promise(resolve => setTimeout(resolve, 80))
    popup.resume()
    await tick() // 公告超时被丢弃，奖励正常弹出
    await closeCurrent()

    console.log('8. 等待弹窗关闭并拿到结果（例如确认框）')
    const confirm = popup.open('Notice', { title: '确认购买？' })
    await tick()
    if (confirm.ok) {
        popup.close(confirm.id, 'yes') // 模拟玩家点击「确定」
        const result = await confirm.closed
        console.log(`  玩家选择：${String(result.result)}`)
    }

    console.log('9. 引导结束时判断：被引导拦下的弹窗是否还可以弹出')
    popup.setTutorial(MainGuide.intro)
    track('引导', popup.open('Guide', { step: 1, text: '领取新手礼包' }))
    await tick()
    // 引导弹窗显示期间触发的奖励，同样会被标记为「被引导拦下」
    track('新手礼包', popup.open('Reward', { itemId: NEWBIE_GIFT_ID, count: 1 }))
    track('普通奖励', popup.open('Reward', { itemId: 6, count: 2 }))
    await closeCurrent()
    console.log('  -- 引导结束')
    popup.setTutorial(null) // 新手礼包被 afterTutorial 丢弃，普通奖励正常弹出
    await tick()
    await closeCurrent()
}

demo()
