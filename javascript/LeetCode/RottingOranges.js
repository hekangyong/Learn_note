/**
 * 994. 腐烂的橘子
 * 在给定的网格中，每个单元格可以有以下三个值之一：
 *
 * 值 0 代表空单元格；
 * 值 1 代表新鲜橘子；
 * 值 2 代表腐烂的橘子。
 * 每分钟，任何与腐烂的橘子（在 4 个正方向上）相邻的新鲜橘子都会腐烂。
 *
 * 返回直到单元格中没有新鲜橘子为止所必须经过的最小分钟数。如果不可能，返回 -1。
 *
 * 示例 1：
 * 输入：[
 *          [2,1,1],
 *          [1,1,0],
 *          [0,1,1]
 *      ]
 * 输出：4
 *
 * 示例 2：
 * 输入：[[2,1,1],[0,1,1],[1,0,1]]
 * 输出：-1
 * 解释：左下角的橘子（第 2 行， 第 0 列）永远不会腐烂，因为腐烂只会发生在 4 个正向上。
 *
 * 示例 3：
 * 输入：[[0,2]]
 * 输出：0
 * 解释：因为 0 分钟时已经没有新鲜橘子了，所以答案就是 0 。
 *
 * 提示：
 * 1 <= grid.length <= 10
 * 1 <= grid[0].length <= 10
 * grid[i][j] 仅为 0、1 或 2
 *
 * 链接：https://leetcode-cn.com/problems/rotting-oranges
 */

/**
 * @param {number[][]} grid
 * @return {number}
 */
var orangesRotting = function (grid) {
  let [spoilArr, fresh] = [[], 0]
  let time = 0
  // 循环得出 腐坏橘子的下标和 新鲜橘子的数量
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const gridItem = grid[i][j]
      if (gridItem === 1) {
        fresh++
      }
      if (gridItem === 2) {
        spoilArr.push([i, j])
      }
    }
  }
  // 判断腐坏的橘子数组中的长度 以及新鲜橘子的数量
  while (spoilArr.length && fresh) {
    const newArr = []
    while (spoilArr.length) {
      // 删除数组中的第一个元素并且进行对该下标中的四周进行筛查
      const spoilShift = spoilArr.shift()
      // bfs 判断四周是否为腐坏的橘子 且返回腐坏橘子的数量
      const item = bfs(grid, spoilShift[0], spoilShift[1], newArr)
      // 新鲜橘子减去腐坏的橘子数量得出最新的新鲜橘子刷令
      fresh -= item
    }
    spoilArr = newArr
    time++
  }

  if (fresh && !spoilArr.length) return -1
  return time
}

function bfs(grid, i, j, newArr) {
  let count = 0
  let arr = newArr
  /**
   * 上
   */
  if (i > 0 && grid[i - 1][j] === 1) {
    grid[i - 1][j] = 2
    arr.push([i - 1, j])
    count += 1
  }
  /**
   * 下
   */
  if (i < grid.length - 1 && grid[i + 1][j] === 1) {
    grid[i + 1][j] = 2
    arr.push([i + 1, j])
    count += 1
  }
  /**
   * 左
   */
  if (j > 0 && grid[i][j - 1] === 1) {
    grid[i][j - 1] = 2
    arr.push([i, j - 1])
    count += 1
  }
  /**
   * 右
   */
  if (j < grid[0].length && grid[i][j + 1] === 1) {
    grid[i][j + 1] = 2
    arr.push([i, j + 1])
    count += 1
  }

  return count
}

orangesRotting([
  [2, 1, 1],
  [1, 1, 0],
  [0, 1, 1],
])
