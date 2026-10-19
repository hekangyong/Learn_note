/**
 * 每日任务功能演示：框架 + 弹窗系统 + 红点系统协同工作
 *
 *   FakeTaskServer ──推送/接口──▶ TaskModel ──syncRedDotMap──▶ redDot ──redDotSignal──▶ 入口按钮（MVC）
 *                                    │
 *                                    └──computed──▶ TaskPanelViewModel ──绑定──▶ 任务面板（MVVM，弹窗）
 *
 * 运行：cd TypeScripts && tsc && node dist/DailyTask/demo.js
 */
import { popup, popupView } from '../Popup/PopupManager'
import { redDot } from '../RedDot/RedDotManager'
import { ManualClock } from './Clock'
import { FakeTaskServer } from './FakeTaskServer'
import { openedPanel, configureDailyTask } from './TaskPanel'
import { TaskEntryController, TaskEntryView } from './TaskEntry'
import { TaskModel, WalletModel } from './TaskModel'
import { setupTaskRedDot } from './TaskRedDot'

/** 等待网络、红点 flush、弹窗调度全部完成 */
const settle = () => new Promise(resolve => setTimeout(resolve, 30))

function panel() {
    if (!openedPanel) throw new Error('任务面板没有打开')
    return openedPanel
}

async function main() {
    // ---------------- 应用启动 ----------------
    // 23:59:50（UTC），10 秒后跨天
    const clock = new ManualClock(Date.UTC(2026, 9, 19, 23, 59, 50))
    const server = new FakeTaskServer(clock)
    const wallet = new WalletModel(100)
    const tasks = new TaskModel(server, wallet)

    configureDailyTask({ tasks, wallet, clock })
    const stopRedDot = setupTaskRedDot(redDot, tasks)
    popup.setView(popupView)

    const entryView = new TaskEntryView()
    const entry = new TaskEntryController(entryView, tasks, redDot)

    console.log('1. 进入主界面，拉取任务数据')
    entry.start()
    await tasks.load()

    console.log('2. 服务器推送：登录完成、打了 3 场战斗 -> 两个任务可领取，入口红点自动出现')
    server.simulateProgress('login')
    for (let i = 0; i < 3; i++) server.simulateProgress('battle')
    await settle()

    console.log('3. 点击入口按钮 -> 弹窗管理器打开任务面板，高亮第一个可领取的任务')
    entryView.click()
    await settle()

    console.log('4. 时间流逝 2 秒：倒计时只在面板打开期间刷新')
    clock.advance(2000)

    console.log('5. 领取「每日登录」：金币到账、列表重排、红点减一')
    await panel().clickClaim(1)
    await settle()

    console.log('6. 一键领取时网络异常：显示错误提示，数据不变')
    server.failNextClaim = true
    await panel().clickClaimAll()

    console.log('7. 重试并连点两次：第二次因请求进行中被忽略')
    const first = panel().clickClaimAll()
    const second = await panel().clickClaimAll()
    console.log(`  第二次点击结果：${second.ok ? '成功' : second.reason}`)
    await first
    await settle()

    console.log('8. 面板打开期间服务器推送：商店购买完成，列表和红点实时更新')
    server.simulateProgress('shop')
    await settle()

    console.log('9. 关闭面板：倒计时定时器随之停止')
    panel().clickClose()
    await settle()
    clock.advance(3000)
    console.log('  （时间又过了 3 秒，没有任何倒计时输出）')

    console.log('10. 跨天：服务器重置任务，未领取的奖励作废，红点清空')
    clock.advance(5000)
    server.simulateDailyReset()
    await settle()

    console.log('11. 重新打开面板：新的一天')
    entryView.click()
    await settle()
    panel().clickClose()
    await settle()

    entry.dispose()
    stopRedDot()
    tasks.dispose()
}

main().catch(error => console.error(error))
