/**
 * 面试题 01.07. 旋转矩阵
 * 
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
 * 题目链接: https://leetcode-cn.com/problems/rotate-matrix-lcci/
  * /
/**
 * @param {number[][]} matrix
 * @return {void} Do not return anything, modify matrix in-place instead.
 */
const app = (matrix) => {
  const matLen = matrix.length
  const matLen0 = matrix[0].length
  for (let i = 0; i < matLen; i++) {
    for (let j = i; j < matLen0; j++) {
      ;[matrix[i][j], matrix[j][i]] = [matrix[j][i], matrix[i][j]]
      //   另一种数值调换的方法
      //   let temp = matrix[i][j]
      //   matrix[i][j] = matrix[j][i]
      //   matrix[j][i] = temp
    }
  }
  //   matrix.map(item => {
  //     return item.reverse()
  //   })
  for (let a of matrix) {
    a.reverse()
  }
  return matrix
}
console.log(
  app([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ])
)
