/**
 * 2419. LongestSubarrayWithMaximumBitwiseAND
 *
 * You are given an integer array nums of size n.
 *
 * Consider a non-empty subarray from nums that has the maximum possible bitwise AND.
 *
 * In other words, let k be the maximum value of the bitwise AND of any subarray of nums.
 *  Then, only subarrays with a bitwise AND equal to k should be considered.
 * Return the length of the longest such subarray.
 *
 * The bitwise AND of an array is the bitwise AND of all the numbers in it.
 * A subarray is a contiguous sequence of elements within an array.
 *
 * Example 1:
 *  Input: nums = [1,2,3,3,2,2]
 *  Output: 2
 *  Explanation:
 *  The maximum possible bitwise AND of a subarray is 3.
 *  The longest subarray with that value is [3,3], so we return 2.
 *
 * Example 2:
 *  Input: nums = [1,2,3,4]
 *  Output: 1
 *  Explanation:
 *  The maximum possible bitwise AND of a subarray is 4.
 *  The longest subarray with that value is [4], so we return 1.
 *
 * Constraints:
 *  1 <= nums.length <= 105
 *  1 <= nums[i] <= 106
 *
 * question: https://leetcode.com/problems/longest-subarray-with-maximum-bitwise-and/description/
 */
/**
 * @param {number[]} nums
 * @return {number}
 */
var longestSubarray = function (nums) {
    let i = 0,
        currentLen = 0,
        maxLen = 0,
        maxNum = Math.max(...nums)

    // 循环nums数组
    while (i < nums.length) {
        // 判断第i个nums值是否等于最大值并且I小于nums长度
        if (nums[i] === maxNum && i < nums.length) {
            // 循环判断第i个nums值是否等于最大值并且小于nums长度
            while (nums[i] === maxNum && i < nums.length) {
                // 当前连续值++
                currentLen++
                // 下标++
                i++
            }
            // 找到下一个nums值不等于最大值的下标
            maxLen = Math.max(maxLen, currentLen)
            // 重置currentLen
            currentLen = 0
        } else {
            // 下标++
            i++
        }
    }
    return maxLen
}

console.log(
    longestSubarray([
        311155, 311155, 311155, 311155, 311155, 311155, 311155, 311155, 201191,
        311155,
    ])
)
