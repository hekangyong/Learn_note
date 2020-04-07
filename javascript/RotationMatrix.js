/**
 * 给你一幅由 N × N 矩阵表示的图像，其中每个像素的大小为 4 字节。请你设计一种算法，将图像旋转 90 度。
 * 
 * 不占用额外内存空间能否做到？
 * 
 * 示例 1:
 * 
 * 给定 matrix = 
 * [
 *   [1,2,3],
 *   [4,5,6],
 *   [7,8,9]
 * ],
 * 
 * 原地旋转输入矩阵，使其变为:
 * [
 *   [7,4,1],
 *   [8,5,2],
 *   [9,6,3]
 * ]
 * 
 * 题目链接: https://leetcode-cn.com/problems/rotate-matrix-lcci/submissions/
 * @param {number[][]} matrix
 * @return {void} Do not return anything, modify matrix in-place instead.
 */
const app = matrix => {
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i; j < matrix[0].length; j++) {
      ;[matrix[i][j], matrix[j][i]] = [matrix[j][i], matrix[i][j]]
    }
  }
  matrix.map(item => {
    return item.reverse()
  })
  return matrix
}
console.log(
  app([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ])
)
