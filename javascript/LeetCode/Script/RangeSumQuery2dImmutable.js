/**
 * 304. 二维区域和检索 - 矩阵不可变
 * 给定一个二维矩阵，计算其子矩形范围内元素的总和，该子矩阵的左上角为 (row1, col1) ，右下角为 (row2, col2) 。
 * 上图子矩阵左上角 (row1, col1) = (2, 1) ，右下角(row2, col2) = (4, 3)，该子矩形内元素的总和为 8。
 * 示例：
 *
 * 给定 matrix = [
 *   [3, 0, 1, 4, 2],
 *   [5, 6, 3, 2, 1],
 *   [1, 2, 0, 1, 5],
 *   [4, 1, 0, 1, 7],
 *   [1, 0, 3, 0, 5]
 * ]
 *
 * sumRegion(2, 1, 4, 3) -> 8
 * sumRegion(1, 1, 2, 2) -> 11
 * sumRegion(1, 2, 2, 4) -> 12
 *
 *
 * 提示：
 *
 * 你可以假设矩阵不可变。
 * 会多次调用 sumRegion 方法。
 * 你可以假设 row1 ≤ row2 且 col1 ≤ col2 。
 * 题目链接： https://leetcode-cn.com/problems/range-sum-query-2d-immutable/
 */

/**
 * @param {number[][]} matrix
 */
var NumMatrix = function (matrix) {
  console.log(matrix)
  this.list = matrix
}

/**
 * @param {number} row1
 * @param {number} col1
 * @param {number} row2
 * @param {number} col2
 * @return {number}
 */
NumMatrix.prototype.sumRegion = function (row1, col1, row2, col2) {
  let count = 0
  for (let i = col1; i <= col2; i++) {
    for (let j = row1; j <= row2; j++) {
      const index = this.list[j][i]
      count += index
    }
  }
  return count
}

// const n = new NumMatrix([
//   [3, 0, 1, 4, 2],
//   [5, 6, 3, 2, 1],
//   [1, 2, 0, 1, 5],
//   [4, 1, 0, 1, 7],
//   [1, 0, 3, 0, 5],
// ])

// console.log(n.sumRegion(2, 1, 4, 3))
// console.log(n.sumRegion(1, 1, 2, 2))
// console.log(n.sumRegion(1, 2, 2, 4))

// 官方
const Aaaa = function (matrix) {
  const m = matrix.length
  if (m > 0) {
    const n = matrix[0].length
    this.sums = new Array(m + 1).fill(0).map(() => new Array(n + 1).fill(0))
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        this.sums[i + 1][j + 1] =
          this.sums[i][j + 1] +
          this.sums[i + 1][j] -
          this.sums[i][j] +
          matrix[i][j]
      }
    }
  }
}

const b = new Aaaa([
  [3, 0, 1, 4, 2],
  [5, 6, 3, 2, 1],
  [1, 2, 0, 1, 5],
  [4, 1, 0, 1, 7],
  [1, 0, 3, 0, 5],
])

console.log(b)
/**
 * Your NumMatrix object will be instantiated and called as such:
 * var obj = new NumMatrix(matrix)
 * var param_1 = obj.sumRegion(row1,col1,row2,col2)
 */
