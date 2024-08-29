/**
 * 1514.Path with maximum probability
 * You are given an undirected weighted graph of n nodes (0-indexed),
 *  represented by an edge list where edges[i] = [a, b] is an undirected edge connecting the nodes a and
 *  b with a probability of success of traversing that edge succProb[i].
 * Given two nodes start and end, find the path with the maximum probability
 *  of success to go from start to end and return its success probability.
 * If there is no path from start to end, return 0. Your answer will be accepted if it differs from the correct answer by at most 1e-5
 *
 * example1:
 *  Input: n = 3, edges = [[0,1],[1,2],[0,2]], succProb = [0.5,0.5,0.2], start = 0, end = 2
 *  Output: 0.25000
 *  Explanation: There are two paths from start to end, one having a probability of success = 0.2 and the other has 0.5 * 0.5 = 0.25.
 *
 * example2:
 *  Input: n = 3, edges = [[0,1]], succProb = [0.5], start = 0, end = 2
 *  Output: 0.00000
 *  Explanation: There is no path between 0 and 2.
 * link: https://leetcode.com/problems/path-with-maximum-probability/description/
 */

/**
 * @param {number} n
 * @param {number[][]} edges
 * @param {number[]} succProb
 * @param {number} start_node
 * @param {number} end_node
 * @return {number}
 */
var maxProbability = function (n, edges, succProb, start_node, end_node) {
    let maxPro = new Array(n).fill(0)
    maxPro[start_node] = 1

    for (let i = 0; i < n - 1; i++) {
        let updateState = false
        for (let j = 0; j < edges.length; j++) {
            const [u, v] = edges[j]
            const prob = succProb[j]
            if (maxPro[u] * prob > maxPro[v]) {
                maxPro[v] = maxPro[u] * prob
                updateState = true
            }
            if (maxPro[v] * prob > maxPro[u]) {
                maxPro[u] = maxPro[v] * prob
                updateState = true
            }
        }
        if (!updateState) break
    }
    return maxPro[end_node]
}

maxProbability(
    3,
    [
        [0, 1],
        [1, 2],
        [0, 2],
    ],
    [0.5, 0.5, 0.2],
    0,
    2
)
