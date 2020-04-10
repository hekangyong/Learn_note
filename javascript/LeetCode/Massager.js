/**
 * 一个有名的按摩师会收到源源不断的预约请求，每个预约都可以选择接或不接。
 * 在每次预约服务之间要有休息时间，因此她不能接受相邻的预约。
 * 给定一个预约请求序列，替按摩师找到最优的预约集合（总预约时间最长），返回总的分钟数。
 *
 * 注意：本题相对原题稍作改动
 * 
 * 示例 1：
 * 
 * 输入： [1,2,3,1]
 * 输出： 4
 * 解释： 选择 1 号预约和 3 号预约，总时长 = 1 + 3 = 4。
 * 示例 2：
 * 
 * 输入： [2,7,9,3,1]
 * 输出： 12
 * 解释： 选择 1 号预约、 3 号预约和 5 号预约，总时长 = 2 + 9 + 1 = 12。
 * 示例 3：
 * 
 * 输入： [2,1,4,5,3,1,1,3]
 * 输出： 12
 * 解释： 选择 1 号预约、 3 号预约、 5 号预约和 8 号预约，总时长 = 2 + 4 + 3 + 3 = 12。
 * /
/**
 * @param {number[]} nums
 * @return {number}
 */
var massage = function (nums) {
  let len = nums.length
  if (len === 0) return 0
  if (len === 1) return nums[1]
  let result = new Array(len + 1).fill(0)
  result[0] = nums[0]
  result[1] = Math.max(nums[0], nums[1])
  for (let i = 2; i < len; i++) {
    console.log(result[i], result[i - 2], nums[i])
    result[i] = Math.max(result[i - 1], result[i - 2] + nums[i])
    console.log(result[i])
  }
  console.log(result)
  return result[len - 1]
}

const result = massage([0])
console.log(result)
const results = massage([2, 1, 4, 5, 3, 1, 1, 3])
console.log(results)

/**
 * 空间上的优化
 * var massage = function(nums) {
        let a = 0, b = 0
        for (let i = 0; i < nums.length; i++) {
        let c = Math.max(b, a + nums[i])
            a = b
            b = c
        }
        return b
    }
 * 
 */
