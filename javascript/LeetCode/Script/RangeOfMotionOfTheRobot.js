/**
 * 面试题13. 机器人的运动范围
 * 
 * 地上有一个m行n列的方格，从坐标 [0,0] 到坐标 [m-1,n-1] 。
 * 一个机器人从坐标 [0, 0] 的格子开始移动，它每次可以向左、右、上、下移动一格（不能移动到方格外），
 * 也不能进入行坐标和列坐标的数位之和大于k的格子。例如，当k为18时，机器人能够进入方格 [35, 37] ，
 * 因为3+5+3+7=18。但它不能进入方格 [35, 38]，因为3+5+3+8=19。请问该机器人能够到达多少个格子？
 *
 * 示例 1：
 * 输入：m = 2, n = 3, k = 1
 * 输出：3
 *
 * 示例 1：
 * 输入：m = 3, n = 1, k = 0
 * 输出：1
 * 题目链接：https://leetcode-cn.com/problems/ji-qi-ren-de-yun-dong-fan-wei-lcof
  * /
/**
 * @param {number} m
 * @param {number} n
 * @param {number} k
 * @return {number}
 */
var movingCount = function (m, n, k) {
  const getSum = (amount) => {
    let sum = 0
    while (amount) {
      sum += amount % 10
      amount = Math.floor(amount / 10)
    }
    return sum
  }
  const direction = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
  ]
  const set = new Set(['0,0'])
  const troop = [[0, 0]]
  while (troop.length) {
    const [x, y] = troop.shift()
    for (let i = 0; i < 4; i++) {
      const offsetX = x + direction[i][0]
      const offsetY = y + direction[i][1]
      if (
        offsetX < 0 ||
        offsetY < 0 ||
        offsetX > m - 1 ||
        offsetY > n - 1 ||
        set.has(`${offsetX},${offsetY}`) ||
        getSum(offsetX) + getSum(offsetY) > k
      ) {
        continue
      } else {
        troop.push([offsetX, offsetY])
        set.add(`${offsetX},${offsetY}`)
      }
    }
  }
  return set.size
}
movingCount(3, 2, 1)
