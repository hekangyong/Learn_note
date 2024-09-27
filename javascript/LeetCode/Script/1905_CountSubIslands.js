/**
 * 1905. Count Sub Islands
 *
 * You are given two ( m x n ) binary matrices grid1 and grid2 containing only 0's (representing water)
 *  and 1's (representing land). An island is a group of 1's connected 4-directionally (horizontal or vertical).
 *  Any cells outside of the grid are considered water cells.
 * An island in grid2 is considered a sub-island if there is an island in grid1 that contains all
 *  the cells that make up this island in grid2.
 *
 * Return the number of islands in grid2 that are considered sub-islands.
 *
 * Example1:
 * Input: grid1 = [[1,1,1,0,0],
 *                 [0,1,1,1,1],
 *                 [0,0,0,0,0],
 *                 [1,0,0,0,0],
 *                 [1,1,0,1,1]]
 *        grid2 = [[1,1,1,0,0],
 *                 [0,0,1,1,1],
 *                 [0,1,0,0,0],
 *                 [1,0,1,1,0],
 *                 [0,1,0,1,0]]
 * Output: 3
 * Explanation:
 *  In the picture above, the grid on the left is grid1 and the grid on the right is grid2.
 *  The 1s colored red in grid2 are those considered to be part of a sub-island. There are three sub-islands.
 *
 * Example2:
 * Input: grid1 = [[1,0,1,0,1],
 *                 [1,1,1,1,1],
 *                 [0,0,0,0,0],
 *                 [1,1,1,1,1],
 *                 [1,0,1,0,1]]
 *        grid2 = [[0,0,0,0,0],
 *                 [1,1,1,1,1],
 *                 [0,1,0,1,0],
 *                 [0,1,0,1,0],
 *                 [1,0,0,0,1]]
 * Output: 2
 * Explanation:
 *  In the picture above, the grid on the left is grid1 and the grid on the right is grid2.
 *  The 1s colored red in grid2 are those considered to be part of a sub-island. There are two sub-islands.
 *
 * Constraints:
 *  m == grid1.length == grid2.length
 *  n == grid1[i].length == grid2[i].length
 *  1 <= m, n <= 500
 *  grid1[i][j] and grid2[i][j] are either 0 or 1.
 *
 * Link:
 *  https://leetcode.com/problems/count-sub-islands/description/
 */

/**
 * @param {number[][]} grid1
 * @param {number[][]} grid2
 * @return {number}
 */
var countSubIslands = function (grid1, grid2) {
    const row = grid1.length,
        col = grid1[0].length
    let flag = 0
    let count = 0

    const traveler = (i, j) => {
        if (i < 0 || i >= row || j < 0 || j >= col || grid2[i][j] === 0) {
            return
        } else {
            if (grid1[i][j] === 0) flag = 0
            grid2[i][j] = 0
            traveler(i + 1, j)
            traveler(i - 1, j)
            traveler(i, j + 1)
            traveler(i, j - 1)
        }
    }

    for (let i = 0; i < row; i++) {
        for (let j = 0; j < col; j++) {
            if (grid2[i][j] === 1) {
                flag = 1
                traveler(i, j)
                if (flag === 1) count++
            }
        }
    }

    return count
}
