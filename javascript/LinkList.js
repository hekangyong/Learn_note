class ListNode {
  constructor(val) {
    this.val = val
    this.next = null
  }
}
class MyLinkedList {
  constructor() {
    this.head = null
    this._length = 0
  }

  /**
   * 获取链表中指定节点的值
   * @param {number} index 第几个节点中的值
   */
  get(index) {}

  /**
   * 在链表中的第一个元素之前添加 val 的节点，新节点成为链表中的第一个节点
   * @param {*} val 一个元素
   */
  addAtHead(val) {
    const old = this.head
    this.head = new Node(val)
    this.head.next = old
    return this._length++
  }

  /**
   * 将值为val的节点追加在链表中的最后一个元素
   * @param {*} val 类型为链表的元素
   */
  addAtTail(val) {
      
  }

  /**
   * 在链表中的第 index 个节点之前添加值为 val 的节点。
   * 如果 index 等于链表的长度，则该节点将附加到链表的末尾。如果 index 大于链表长度，则不会插入节点。
   * @param {*} index
   * @param {*} val
   */
  addAtIndex(index, val) {}
  /**
   * 如果索引 index 有效，则删除链表中的第 index 个节点。
   * @param {*} index
   */
  deleteIndex(index) {}
}
