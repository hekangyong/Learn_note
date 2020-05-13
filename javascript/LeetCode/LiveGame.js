/**
 * 289. 生命游戏
 * 
 * 根据 百度百科 ，生命游戏，简称为生命，是英国数学家约翰·何顿·康威在 1970 年发明的细胞自动机。
 *
 * 给定一个包含 m × n 个格子的面板，每一个格子都可以看成是一个细胞。
 * 每个细胞都具有一个初始状态：1 即为活细胞（live），或 0 即为死细胞（dead）。
 * 每个细胞与其八个相邻位置（水平，垂直，对角线）的细胞都遵循以下四条生存定律：
 *
 * 如果活细胞周围八个位置的活细胞数少于两个，则该位置活细胞死亡；
 * 如果活细胞周围八个位置有两个或三个活细胞，则该位置活细胞仍然存活；
 * 如果活细胞周围八个位置有超过三个活细胞，则该位置活细胞死亡；
 * 如果死细胞周围正好有三个活细胞，则该位置死细胞复活；
 *
 * 根据当前状态，写一个函数来计算面板上所有细胞的下一个（一次更新后的）状态。
 * 下一个状态是通过将上述规则同时应用于当前状态下的每个细胞所形成的，其中细胞的出生和死亡是同时发生的。
 *
 * 示例：
 * 输入：
 * [
 *   [0,1,0],
 *   [0,0,1],
 *   [1,1,1],
 *   [0,0,0]
 * ]
 * 输出：
 * [
 *   [0,0,0],
 *   [1,0,1],
 *   [0,1,1],
 *   [0,1,0]
 * ]
 * 题目链接: https://leetcode-cn.com/problems/game-of-life/
  * /
/**
 * @param {number[][]} board
 * @return {void} Do not return anything, modify board in-place instead.
 */
// 参考自评论区中的田姨
var gameOfLife = function (board) {
  const y = [-1, 0, 1, 0, -1, 1, 1, -1]
  const x = [0, 1, 0, -1, 1, 1, -1, -1]
  let m = board.length
  let n = board[0].length
  for (let i = 0; i < m; i++) {
    for (let z = 0; z < board[i].length; z++) {
      let count = 0
      for (let j = 0; j < 8; j++) {
        const dy = i + y[j]
        const dx = z + x[j]
        if (dy < 0 || dy >= m || dx < 0 || dx >= n) {
          continue
        }
        count += board[dy][dx] & 1
      }
      if ((board[i][z] & 1) > 0) {
        if (count < 2 || count > 3) {
          board[i][z] = 0b11
        }
      } else if (count === 3) {
        board[i][z] = 0b10
      }
    }
  }
  for (let i = 0; i < m; ++i) {
    for (let j = 0; j < n; ++j) {
      if (board[i][j] === 3) {
        board[i][j] = 0
      } else if (board[i][j] === 2) {
        board[i][j] = 1
      }
    }
  }
  return board
}

// 成功实例
// var gameOfLife = function (board) {
//     if (!board.length) return

//     let rows = board.length;
//     let cols = board[0].length;

//     // 新建并拷贝一份原数组
//     let copy = new Array(rows);
//     for (let row = 0; row < rows; row++) {
//         copy[row] = new Array(cols);
//     }

//     // let copy = new Array(rows);
//     for (let row = 0; row < rows; row++) {
//         for (let col = 0; col < cols; col++) {
//             copy[row][col] = board[row][col];
//         }
//     }
//     // 遍历每一个格子(细胞)，统计每个格子周围的存活细胞个数
//     let neighbors = [0, -1, 1];
//     for (let row = 0; row < rows; row++) {
//         for (let col = 0; col < cols; col++) {
//             // 记录每个格子周围八个格子的存活情况
//             let liveBox = 0;
//             // 遍历每个格子的周围的八个格子
//             for (let i = 0; i < 3; i++) {
//                 for (let j = 0; j < 3; j++) {
//                     if (!i && !j) continue
//                     let r = row + neighbors[i];
//                     let c = col + neighbors[j];
//                     if ((r >= 0 && r < rows) && (c >= 0 && c < cols) && copy[r][c] === 1) {
//                         liveBox++;
//                     }
//                 }
//             }

//             // 通过 liveBox 判断当前格子是否存活
//             // 由生变死
//             if ((copy[row][col] === 1) && (liveBox < 2 || liveBox > 3)) {
//                 board[row][col] = 0;
//             }
//             // 忍术：秽土转生
//             if (copy[row][col] === 0 && liveBox === 3) {
//                 board[row][col] = 1;
//             }
//         }
//     }
// };
