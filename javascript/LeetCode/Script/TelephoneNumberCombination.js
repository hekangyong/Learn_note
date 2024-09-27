/**
 * 17. 电话号码的字母组合
 * 给定一个仅包含数字 2-9 的字符串，返回所有它能表示的字母组合。答案可以按 任意顺序 返回。
 * 给出数字到字母的映射如下（与电话按键相同）。注意 1 不对应任何字母。
 *
 * 示例 1：
 * 输入：digits = "23"
 * 输出：["ad","ae","af","bd","be","bf","cd","ce","cf"]
 *
 * 示例 2：
 * 输入：digits = ""
 * 输出：[]
 *
 * 示例 3：
 * 输入：digits = "2"
 * 输出：["a","b","c"]
 *
 * 提示：
 * 0 <= digits.length <= 4
 * digits[i] 是范围 ['2', '9'] 的一个数字。
 *
 *  题目链接：https://leetcode-cn.com/problems/letter-combinations-of-a-phone-number/
 * 
 */

/**
 * @param {string} digits
 * @return {string[]}
 */
var letterCombinations = function (digits) {
  if (digits === '') {
    return []
  }
  const handle = {
    2: 'abc',
    3: 'def',
    4: 'ghi',
    5: 'jkl',
    6: 'mno',
    7: 'pqrs',
    8: 'tuv',
    9: 'wxyz',
  }
  const list = []
  const dfs = (curStar, idx) => {
    if (idx > digits.length - 1) {
      return list.push(curStar)
    }
    for (const item of handle[digits[idx]]) {
      dfs(curStar + item, idx + 1) // 回溯
    }
  }
  dfs('', 0)
  return list
}

/**
 * @param {string} digits
 * @return {string[]}
 */
var letterCombinationss = function (digits) {
  if (digits === '') {
    return []
  }
  const handle = {
    2: 'abc',
    3: 'def',
    4: 'ghi',
    5: 'jkl',
    6: 'mno',
    7: 'pqrs',
    8: 'tuv', 
    9: 'wxyz',
  }
  
}

const len = letterCombinations('233')
console.log(len, len.length)
