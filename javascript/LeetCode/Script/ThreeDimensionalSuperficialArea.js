/**
 * 892. 三维形体的表面积
 * 
 * 在 N * N 的网格上，我们放置一些 1 * 1 * 1  的立方体。
 *
 * 每个值 v = grid[i][j] 表示 v 个正方体叠放在对应单元格 (i, j) 上。
 *
 * 示例:
 *
 * 输入：[[2]]
 * 输出：10
 * 示例 2：
 *
 * 输入：[[1,2],[3,4]]
 * 输出：34
 * 示例 3：
 *
 * 输入：[[1,0],[0,2]]
 * 输出：16
 *
 * 请你返回最终形体的表面积。
 * 题目链接： https://leetcode-cn.com/problems/surface-area-of-3d-shapes/
  * /
/**
 * @param {number[][]} grid
 * @return {number}
 */

// 暴力破解
var surfaceArea = function (grid) {
  let count = 0
  for (let a = 0; a < grid.length; a++) {
    console.log(grid[a])
    for (let b = 0; b < grid[a].length; b++) {
      const gridArr = grid[a][b]
      if (gridArr > 0) {
        //   求出单列的表面积 与总数相加
        count += 10 + 4 * (gridArr - 2)
      }
      //   横向比对 两数比对求出最小的 求出面积 再与总数相减
      if (a > 0) {
        const row = grid[a - 1][b] > grid[a][b] ? grid[a][b] : grid[a - 1][b]
        count -= row * 2
      }
      //   纵向比对 两数比对求出最小的 求出面积 再与总数相减
      if (b > 0) {
        const col = grid[a][b - 1] > grid[a][b] ? grid[a][b] : grid[a][b - 1]
        count -= col * 2
      }
    }
  }
  return count
}
