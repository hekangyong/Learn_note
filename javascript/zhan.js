function Stack() {
	// 用来保存栈中的元素
	var item = []
	// 往栈中添加新元素，添加在栈顶同事也是在栈的底部 “push方法”
	this.push = function (ele) {
		item.push(ele)
	}
	// 实现移除栈中的元素，遵从后进先出的原则，移出去的是最后添加进去的元素 “pop方法”
	this.pop = function () {
		return item.pop()
	}
	// 返回栈顶的元素
	this.peek = function () {
		return item[item.length - 1]
	}
	// 判断栈中是否为是空的
	this.isEmpty = function () {
		return item.length == 0
	}
	// 返回栈的长度
	this.size = function () {
		return item.length
	}
	// 清空栈中的数据
	this.clear = function () {
		item = []
	}
	// 输出栈中的数据
	this.print = function () {
		return console.log(item.toString())
	}
}

var stack = new Stack();
// 输出 true 因为当前栈为空
console.log('isEmpty: ', stack.isEmpty())
stack.push(8)
stack.push(5)
stack.push(3)
stack.push(2)
// 输出结果为 2 ，2为最后添加的元素，遵从后进先出
console.log('peek: ', stack.peek())
console.log('print: ', stack.print())
stack.pop()
stack.pop()
console.log('size: ', stack.size())
console.log('print2: ', stack.print())