/**
 * 给定一副牌，每张牌上都写着一个整数。
 *
 * 此时，你需要选定一个数字 X，使我们可以将整副牌按下述规则分成 1 组或更多组：
 *
 * 每组都有 X 张牌。
 * 组内所有的牌上都写着相同的整数。
 * 仅当你可选的 X >= 2 时返回 true。
 *
 * 示例 1：
 *
 * 输入：[1,2,3,4,4,3,2,1]
 * 输出：true
 * 解释：可行的分组是 [1,1]，[2,2]，[3,3]，[4,4]
 *
 * 示例 2：
 *
 * 输入：[1]
 * 输出：false
 * 解释：没有满足要求的分组。
 *
 * 題目鏈接：https://leetcode-cn.com/problems/x-of-a-kind-in-a-deck-of-cards/
 *
 * @param {number[]} deck
 * @return {boolean}
 */
var hasGroupsSizeX = function(deck) {
  let map = new Map()
  for (let n of deck) {
    map.set(n, map.has(n) ? map.get(n) + 1 : 1)
  }
  let arr = [...map.values()]
  let res = arr[0]
  console.log(arr)
  return arr.every(i => (res = gcd(res, i)) > 1)
}
let gcd = (a, b) => {
  console.log(a, b)
  if (b === 0) {
    return a
  } else {
    return gcd(b, a % b)
  }
}
console.log(hasGroupsSizeX([1, 2, 3, 4, 4, 3, 2, 1]))
// hasGroupsSizeX([1])

// 借鉴与 https://leetcode-cn.com/problems/x-of-a-kind-in-a-deck-of-cards/solution/mei-ri-yi-ti-ep27-card-groupingqia-pai-fen-zu-java/