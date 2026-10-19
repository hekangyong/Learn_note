/**
 * 红点系统演示与性能对比
 *
 * 运行：npx tsc && node dist/AIFramework/RedDot/demo.js
 */
import { RedDotSystem, SEPARATOR } from './RedDot'
import { redDot, RedDotPath } from './RedDotManager'

// ------------------------------------------------------------
// 1. 演示：业务代码和 UI 都通过单例 redDot + RedDotPath 协作
// ------------------------------------------------------------
async function demo() {
    const log = (count: number, path: string) => console.log(`  [UI] ${path} -> ${count}`)

    // 模拟 3 个 UI 组件分别绑定主界面按钮、邮件页签、背包页签。
    // immediate = false：演示中不需要初始回调，只看后续变化
    redDot.on(RedDotPath.Main, log, false)
    redDot.on(RedDotPath.Mail, log, false)
    redDot.on(RedDotPath.Bag, log, false)

    console.log('1. 同一同步代码块里的多次更新，只在微任务里通知一次：')
    redDot.add(RedDotPath.MailSystem, 1)
    redDot.add(RedDotPath.MailSystem, 1) // 同一叶子连续修改，pending 中只保留最终值 2
    redDot.add(RedDotPath.MailFriend, 3)
    redDot.set(RedDotPath.BagItem(1001), 1)
    // 此时只写入了 pending，还没有 flush，所以读到的是旧值
    console.log(`  同步阶段读取 Main = ${redDot.get(RedDotPath.Main)}（尚未提交）`)
    // 让出执行权，微任务中的 flush 执行：Main/Mail、Main、Main/Bag 各通知一次
    await Promise.resolve()
    console.log(`  微任务之后 Main = ${redDot.get(RedDotPath.Main)}`)

    console.log('2. 兄弟节点一增一减，总数不变，父节点不刷新 UI：')
    redDot.add(RedDotPath.MailSystem, 1)
    redDot.add(RedDotPath.MailFriend, -1)
    // 手动 flush：Main/Mail 和 Main 都进入了 dirty，但 count === notified，全部被跳过
    redDot.flush()
    console.log('  （没有任何 UI 输出）')

    console.log('3. 删除道具节点，祖先自动扣减：')
    redDot.remove(RedDotPath.BagItem(1001)) // Main/Bag 和 Main 各减 1
    redDot.flush()

    console.log('4. 切换账号：clear 清零，UI 保持绑定并收到通知：')
    redDot.clear()
    redDot.flush()
    redDot.add(RedDotPath.MailFriend, 2) // 新账号的数据，同一批 UI 继续生效
    redDot.flush()
}

// ------------------------------------------------------------
// 2. 性能对比
// ------------------------------------------------------------

/**
 * 朴素实现：每次更新都从根逐层查找节点，对每个祖先重新遍历子树求和，并立即通知。
 * 返回 UI 通知的总次数（这里不真正执行回调，只计数）。
 */
function naiveBenchmark(updates: [string, number][], listened: Set<string>) {
    type Node = { self: number; children: Map<string, Node> }
    const root: Node = { self: 0, children: new Map() }
    let notifications = 0

    // 递归求子树总和：节点越多、树越宽，代价越大
    const sum = (n: Node): number => {
        let s = n.self
        n.children.forEach(c => (s += sum(c)))
        return s
    }

    for (const [path, value] of updates) {
        // 每次都 split 路径并从根逐层查找（不存在则创建），同时记下经过的祖先链
        const keys = path.split(SEPARATOR)
        const chain: Node[] = []
        let n = root
        for (const k of keys) {
            let c = n.children.get(k)
            if (!c) n.children.set(k, (c = { self: 0, children: new Map() }))
            chain.push((n = c))
        }
        n.self = value

        // 对每个祖先重新求和；被监听的祖先每次都立即通知（不做合并、不比较新旧值）
        for (let i = 0; i < chain.length; i++) {
            const p = keys.slice(0, i + 1).join(SEPARATOR)
            sum(chain[i]!)
            if (listened.has(p)) notifications++
        }
    }
    return notifications
}

function benchmark() {
    const LEAVES = 200 // 叶子数量：Mail、Bag 下各约 100 个
    const UPDATES = 200_000 // 总更新次数
    const listened = new Set(['Main', 'Main/Mail', 'Main/Bag']) // 绑定了 UI 的节点

    // 预先生成同一份更新序列，两种实现使用完全相同的输入，保证对比公平
    const updates: [string, number][] = []
    for (let i = 0; i < UPDATES; i++) {
        const group = i % 2 ? 'Mail' : 'Bag'
        updates.push([`Main/${group}/${i % LEAVES}`, Math.floor(Math.random() * 10)])
    }

    let t = performance.now()
    const naiveNotifications = naiveBenchmark(updates, listened)
    const naiveTime = performance.now() - t

    // 性能测试单独 new 一个实例（这正是不把单例写成 static 类的好处），
    // 不会污染全局 redDot 的数据和监听者。
    // 空调度器：不自动 flush，由下面的循环模拟「每帧结束时提交一次」
    const system = new RedDotSystem(() => {})
    let notifications = 0
    listened.forEach(p => system.on(p, () => notifications++, false))

    t = performance.now()
    const FRAMES = 50 // 把更新平均分到 50 帧里
    const perFrame = UPDATES / FRAMES // 每帧 4000 次更新
    for (let i = 0; i < UPDATES; i++) {
        system.set(updates[i]![0], updates[i]![1])
        if ((i + 1) % perFrame === 0) system.flush() // 一帧结束，统一提交
    }
    system.flush() // 兜底：提交剩余的更新
    const time = performance.now() - t

    // 红点系统的通知次数上限 = 监听节点数 × 帧数 = 3 × 50 = 150，
    // 实际可能更少（某帧结束时数值恰好与上一帧相同，就不通知）
    console.log(`5. 性能对比（${LEAVES} 个叶子，${UPDATES} 次更新，分 ${FRAMES} 帧）：`)
    console.log(`  朴素实现：${naiveTime.toFixed(1)} ms，UI 通知 ${naiveNotifications} 次`)
    console.log(`  红点系统：${time.toFixed(1)} ms，UI 通知 ${notifications} 次`)
}

demo().then(benchmark)
