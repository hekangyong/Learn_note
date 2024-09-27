/**
 * 206. 反转链表
 * 反转一个单链表。
 *
 * 示例:
 * 输入: 1->2->3->4->5->NULL
 * 输出: 5->4->3->2->1->NULL
 *
 * 进阶:
 * 你可以迭代或递归地反转链表。你能否用两种方法解决这道题？
 * 
 * 题目链接：https://leetcode-cn.com/problems/reverse-linked-list/
 */

/**
 * Definition for singly-linked list.
 * function ListNode(val) {
 *     this.val = val;
 *     this.next = null;
 * }
 */
/**
 * @param {ListNode} head
 * @return {ListNode}
 */
var reverseList = function (head) {
  if (!head || !head.next) return head
  var prev = null,
    curr = head
  while (curr) {
    // 用于临时存储 curr 后继节点
    var next = curr.next
    // 反转 curr 的后继指针
    curr.next = prev
    // 变更prev、curr
    // 待反转节点指向下一个节点
    prev = curr
    curr = next
  }
  head = prev
  return head
}
// 参考自：https://leetcode-cn.com/problems/reverse-linked-list/solution/tu-jie-leetcodefan-zhuan-lian-biao-by-user7746o/