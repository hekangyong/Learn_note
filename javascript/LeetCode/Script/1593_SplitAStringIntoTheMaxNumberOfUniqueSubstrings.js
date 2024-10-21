/**
 * 1593. Split a String Into the Max Number of Unique Substrings
 *
 * Given a string s, return the maximum number of unique substrings
 *  that the given string can be split into.
 *
 * You can split string s into any list of non-empty substrings,
 *  where the concatenation of the substrings forms the original
 *  string. However, you must split the substrings such that all
 *  of them are unique.
 *
 * A substring is a contiguous sequence of characters within a string.
 *
 * Example 1:
 *  Input: s = "ababccc"
 *  Output: 5
 *  Explanation:
 *   One way to split maximally is ['a', 'b', 'ab', 'c', 'cc']. Splitting
 *   like ['a', 'b', 'a', 'b', 'c', 'cc'] is not valid as you have 'a' and
 *   'b' multiple times.
 *
 * Example 2:
 *  Input: s = "aba"
 *  Output: 2
 *  Explanation: One way to split maximally is ['a', 'ba'].
 *
 * Example 3:
 *  Input: s = "aa"
 *  Output: 1
 *  Explanation: It is impossible to split the string any further.
 *
 * Constraints:
 *  1 <= s.length <= 16
 *  s contains only lower case English letters.
 */

/**
 * @param {string} s
 * @return {number}
 */
var maxUniqueSplit = function (s) {
    let res = 0
    let strings = new Set()
    
    // 定义递归函数
    function search(str) {
        // 检测字符串是否在set中存在
        if (!strings.has(str)) {
            // 如果不存在，将字符串添加到set中，并返回集合的大小
            strings.add(str)
            res = Math.max(res, strings.size)
            strings.delete(str)
        }

        // 递归搜索剩余部分
        for (let i = 1; i < str.length; i++) {
            const a = str.substring(0, i)
            // 检测是否包含在set中
            if (strings.has(a)) continue
            strings.add(a)
            // 递归循环下一个字符串
            search(str.substring(i))
            strings.delete(a)
        }
    }

    search(s)
    return res
}

console.log(maxUniqueSplit('ababccc'))
