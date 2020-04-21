/**
 * 初始化链表
 * @param next 指针
 * @param data 用来存储数据
 */
class ListNode {
  constructor(data) {
    this.next = null
    this.data = data
  }
}

/**
 * @param header 每一个链表都有一个头指针，指向第一个节点，否则为 Null
 * @param length 记录链表的长度
 */
class SingList {
  constructor() {
    this.header = null
    this.length = 0
  }

  // 创建节点
  static createList(key) {
    return new ListNode(key)
  }

  // 插入节点
  insert(node) {
    if (this.header) {
      node.next = this.header
    } else {
      node.next = null
    }
    this.header = node
    this.length++
    return
  }

  // 寻找指定节点
  find(key) {
    let node = this.header
    while (node !== null && node !== key) {
      node = node.next
    }
    return node
  }

  // 删除节点
  delete(node) {
    if (this.length === 0) {
      throw 'node is underfined'
    }

    if (node === this.header) {
      this.header = node.next
      this.length--
      return
    }

    let preNode = this.header
    while (preNode.next !== node) {
      preNode = preNode.next
    }

    if (node.next === null) {
      preNode.next = null
    }

    if (node.next) {
      preNode.next = node.next
    }

    this.length--
  }
}
