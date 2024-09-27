/**
 * 3. 无重复字符的最长子串
 * 给定一个字符串，请你找出其中不含有重复字符的 最长子串 的长度。
 *
 * 示例 1:
 * 输入: "abcabcbb"
 * 输出: 3
 * 解释: 因为无重复字符的最长子串是 "abc"，所以其长度为 3。
 *
 * 示例 2:
 * 输入: "bbbbb"
 * 输出: 1
 * 解释: 因为无重复字符的最长子串是 "b"，所以其长度为 1。
 *
 * 示例 3:
 * 输入: "pwwkew"
 * 输出: 3
 * 解释: 因为无重复字符的最长子串是 "wke"，所以其长度为 3。
 *      请注意，你的答案必须是 子串 的长度，"pwke" 是一个子序列，不是子串。
 * 题目链接：https://leetcode-cn.com/problems/longest-substring-without-repeating-characters/
 */
/**
 * @param {string} s
 * @return {number}
 */

// 取自 https://leetcode-cn.com/problems/longest-substring-without-repeating-characters/solution/wu-zhong-fu-zi-fu-zui-chang-zi-chuan-by-fa-kuang-d/
var lengthOfLongestSubstring = function (s) {
  let n = 0,
    res = 0
  for (let i = 0; i < s.length; i++) {
    const j = s.slice(n, i).indexOf(s[i])
    if (j === -1) {
      res = Math.max(res, i + 1 - n)
    } else {
      n += j + 1
    }
  }
  return res
}

/**
 * @param {string} s
 * @return {number}
 */
const subString = (s) => {
  let [maxNum, str] = [0, '']
  for (let i = 0; i < s.length; i++) {
    const char = s.charAt(i)
    const idx = str.indexOf(char)
    if (idx === -1) {
      str += char
      maxNum = maxNum > str.length ? maxNum : str.length
    } else {
      str = str.substr(idx + 1) + char
    }
  }
  return s
}
