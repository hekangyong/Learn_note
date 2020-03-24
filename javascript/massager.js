/**
 * @param {number[]} nums
 * @return {number}
 */
var massage = function(nums) {
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
