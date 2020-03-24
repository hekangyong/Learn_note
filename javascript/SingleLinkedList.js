function Node(data) {
    this.data = data;    //存储数据
    this.next = null     //指向链表中的下一个节点
}

function SingleList() {
    this._length = 0    //用于表示节点中的节点数量
    this.head = null    //分配一个节点作为链表的头
}

// 向链表总添加一个节点
SingleList.prototype.add = function (value) {
    var node = new Node(value),
        currentNode = this.head

    // 1st use-case:an empty
    if (!currentNode) {
        this.head = node
        this._length++
        return node
    }

    // 2nd use-case: a non-empty list
    while (currentNode.next) {
        currentNode = currentNode.next;
    }

    this._length++

    return node
}

// 找到在列表中指定位置n上的节点
SingleList.prototype.searchNodeAt = function (position) {
    var currentNode = this.head,
        length = this._length,
        count = -1,
        message = { failure: 'Faileure: non-existent node in this list' }

    // 1st use-case: an invalid position
    if (length === 0 || position < 1 || position > length) {
        throw new Error(message.failure)
    }

    // 2nd use-case: a valid position
    while (count < position) {
        currentNode = currentNode.next;
        count++
    }

    return currentNode;
}

// 删除指定位置上的节点
SingleList.prototype.remove = function (position) {
    var currentNode = this.head,
        length = this._length,
        count = 0,
        message = { failure: 'Failure: non-existent node in this list.' },
        beforeNodeDelete = null,
        nodeToDelete = null,
        deleteNode = null

    // 1st use-case: an invalid position
    if (position < 0 || position > length) {
        throw new Error(message.failure)
    }

    // 2nd use-case: the first node is removed
    if (position === 1) {
        this.head = currentNode.next
        deleteNode = currentNode
        currentNode = null
        this._length--
        return deleteNode
    }

    // 3rd use-case: any other node is removed
    while (count < position) {
        beforeNodeDelete = currentNode
        nodeToDelete = currentNode.next
        count++
    }

    beforeNodeDelete.next = nodeToDelete.next
    deleteNode = nodeToDelete
    nodeToDelete = null
    this._length--

    return deleteNode
}

const aa = new SingleList()
aa.add([1, 1, 3, 5])
console.log(aa)