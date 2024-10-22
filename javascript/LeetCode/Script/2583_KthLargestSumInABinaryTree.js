/**
 * 2583. Kth Largest Sum in a Binary Tree
 * You are given the root of a binary tree and a positive integer k.
 *
 * The level sum in the tree is the sum of the values of the nodes
 *  that are on the same level.
 *
 * Return the kth largest level sum in the tree (not necessarily distinct).
 *  If there are fewer than k levels in the tree, return -1.
 *
 * Note that two nodes are on the same level if they have the same
 *  distance from the root.
 *
 * Example 1:
 *  Input: root = [5,8,9,2,1,3,7,4,6], k = 2
 *  Output: 13
 *  Explanation:
 *    The level sums are the following:
 *      - Level 1: 5.
 *      - Level 2: 8 + 9 = 17.
 *      - Level 3: 2 + 1 + 3 + 7 = 13.
 *      - Level 4: 4 + 6 = 10.
 *      The 2nd largest level sum is 13.
 *
 * Example 2:
 *  Input: root = [1,2,null,3], k = 1
 *  Output: 3
 *  Explanation: The largest level sum is 3.
 *
 *
 * Constraints:
 *  The number of nodes in the tree is n.
 *  2 <= n <= 105
 *  1 <= Node.val <= 106
 *  1 <= k <= n
 *
 * link:
 *  https://leetcode.com/problems/kth-largest-sum-in-a-binary-tree
 */
/**
 * Definition for a binary tree node.
 * function TreeNode(val, left, right) {
 *     this.val = (val===undefined ? 0 : val)
 *     this.left = (left===undefined ? null : left)
 *     this.right = (right===undefined ? null : right)
 * }
 */
/**
 * @param {TreeNode} root
 * @param {number} k
 * @return {number}
 */
var kthLargestLevelSum = function (root, k) {
    if (!root) return -1
    let que = [root],
        res = []
    while (que.length) {
        const l = que.length
        let sum = 0

        for (let i = 0; i < l; i++) {
            const node = que.shift()
            sum += node.val
            if (node.left) que.push(node.left)
            if (node.right) que.push(node.right)
        }

        res.push(sum)
    }

    if (k > res.length) return -1

    return res.sort((a, b) => b - a)[k - 1]
}
