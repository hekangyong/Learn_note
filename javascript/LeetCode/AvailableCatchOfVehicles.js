/**
 * 999. 可以被一步捕获的棋子数
 * 在一个 8 x 8 的棋盘上，有一个白色车（rook）。也可能有空方块，白色的象（bishop）和黑色的卒（pawn）。
 * 它们分别以字符 “R”，“.”，“B” 和 “p” 给出。大写字符表示白棋，小写字符表示黑棋。
 *
 * 车按国际象棋中的规则移动：它选择四个基本方向中的一个（北，东，西和南）
 * ，然后朝那个方向移动，直到它选择停止、到达棋盘的边缘或移动到同一方格来捕获该方格上颜色相反的卒。
 * 另外，车不能与其他友方（白色）象进入同一个方格。
 *
 * 返回车能够在一次移动中捕获到的卒的数量。
 *
 * 题目链接: https://leetcode-cn.com/problems/available-captures-for-rook/
 * /
/**
 *
 * @param {character[][]} board
 * @return {number}
 */
var numRookCaptures = function (board) {
  let count = 0
  let x, y
  for (let a = 0; a < board.length; a++) {
    for (let b = 0; b < board[a].length; b++) {
      if (board[a][b] === 'R') {
        x = a
        y = b
        break
      }
    }
  }
  /**
   * 上: arr[i-1],[j]
   * 左: arr[i],[j-1]
   * 下: arr[i+1],[j]
   * 右: arr[i],[j+1]
   */
  const across = [0, 1, 0, -1]
  const endlong = [1, 0, -1, 0]
  for (let d = 0; d < 4; d++) {
    for (let e = 1; ; e++) {
      const movex = x + e * across[d]
      const movey = y + e * endlong[d]
      if (
        movey < 0 ||
        movey >= 8 ||
        movex < 0 ||
        movex >= 8 ||
        board[movex][movey] === 'B'
      ) {
        break
      }
      if (board[movex][movey] === 'p') {
        console.log(board[movey][movex], movey, movex)
        count++
        break
      }
    }
  }
  return count
}

const board = numRookCaptures([
  ['.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', '.', '.', 'p', '.', '.', '.', '.'],
  ['.', '.', '.', 'p', '.', '.', '.', '.'],
  ['p', 'p', '.', 'R', '.', 'p', 'B', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.'],
  ['.', '.', '.', 'B', '.', '.', '.', '.'],
  ['.', '.', '.', 'p', '.', '.', '.', '.'],
  ['.', '.', '.', '.', '.', '.', '.', '.'],
])

console.log(board)
