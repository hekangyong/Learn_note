/**
 * 给你一个整数数组 nums，请你将该数组升序排列。
 *
 * 示例 1：
 *
 * 输入：nums = [5,2,3,1]
 * 输出：[1,2,3,5]
 * 示例 2：
 *
 * 输入：nums = [5,1,1,2,0,0]
 * 输出：[0,0,1,1,2,5]
 *
 * 提示：
 *
 * 1 <= nums.length <= 50000
 * -50000 <= nums[i] <= 50000
 * 题目链接: https://leetcode-cn.com/problems/sort-an-array/
 * @param {number[]} nums
 * @return {number[]}
 */

/**
 * 从数组的第二个元素开始,将数组中的每一个元素按照
 * （升序或者降序）规则插入到已排好序的数组中以达到排序的目的.
 * 插入排序
 */
var sortArray = function(nums) {
  for (let a = 1; a < nums.length; a++) {
    for (let b = a; b > 0; b--) {
      if (nums[b] < nums[b - 1]) {
        ;[nums[b], nums[b - 1]] = [nums[b - 1], nums[b]]
      }
    }
  }
  return nums
}

sortArray([5, 2, 3, 1])
