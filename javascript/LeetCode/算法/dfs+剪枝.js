/**
 * 一键装备 - DFS + 剪枝示例
 * 作者：GPT-5
 * 用法：直接运行 node 文件.js 或浏览器 console
 */

// 模拟装备池
const equipList = [
    { id: 1, name: '剑A', slotType: 0, score: 90 },
    { id: 2, name: '剑B', slotType: 0, score: 85 },
    { id: 3, name: '头盔A', slotType: 1, score: 88 },
    { id: 4, name: '头盔B', slotType: 1, score: 70 },
    { id: 5, name: '胸甲A', slotType: 2, score: 92 },
    { id: 6, name: '胸甲B', slotType: 2, score: 86 },
    { id: 7, name: '手套A', slotType: 3, score: 80 },
    { id: 8, name: '手套B', slotType: 3, score: 79 },
    { id: 9, name: '裤子A', slotType: 4, score: 95 },
    { id: 10, name: '裤子B', slotType: 4, score: 89 },
    { id: 11, name: '鞋子A', slotType: 5, score: 93 },
    { id: 12, name: '鞋子B', slotType: 5, score: 85 },
    { id: 13, name: '戒指A', slotType: 6, score: 91 },
    { id: 14, name: '戒指B', slotType: 6, score: 88 },
    { id: 15, name: '项链A', slotType: 7, score: 90 },
    { id: 16, name: '项链B', slotType: 7, score: 87 },
]

// 按评分降序排序（方便剪枝上限估算）
equipList.sort((a, b) => b.score - a.score)

const SLOT_COUNT = 8
let bestScore = 0
let bestSet = []

/**
 * 预估函数：计算剩余槽位能拿到的理论最高分
 * （剪枝用）
 */
function estimateMaxPossible(slotIndex) {
    // 理论上剩余槽位全拿当前装备池中最高分
    let remain = SLOT_COUNT - slotIndex
    let sum = 0
    for (let i = 0; i < remain && i < equipList.length; i++) {
        sum += equipList[i].score
    }
    return sum
}

/**
 * DFS 递归搜索 + 剪枝
 */
function dfs(slotIndex, currentScore, used) {
    // 所有槽位装备完成
    if (slotIndex === SLOT_COUNT) {
        if (currentScore > bestScore) {
            bestScore = currentScore
            bestSet = [...used]
            console.log(
                `🎯 新最优组合：${bestSet
                    .map(e => e.name)
                    .join(', ')} => ${bestScore}`
            )
        }
        return
    }

    // 剪枝：估算上限
    const potential = currentScore + estimateMaxPossible(slotIndex)
    if (potential <= bestScore) return // 🚫 没希望超过最优结果

    // 遍历当前槽位的可用装备
    for (let equip of equipList) {
        if (used.includes(equip)) continue // 已用过
        if (equip.slotType !== slotIndex) continue // 槽位不匹配

        // 选择这件装备
        used.push(equip)
        dfs(slotIndex + 1, currentScore + equip.score, used)
        used.pop() // 回溯
    }
}

/**
 * 启动搜索
 */
console.time('一键装备计算时间')
dfs(0, 0, [])
console.timeEnd('一键装备计算时间')

// 输出结果
console.log('\n✅ 最佳装备组合：')
bestSet.forEach(e =>
    console.log(`槽位${e.slotType}: ${e.name} (score ${e.score})`)
)
console.log(`总评分: ${bestScore}`)
