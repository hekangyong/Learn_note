### let 和 const 命令

在 es6 中新增了 let 命令，let 命令和 var 命令都是一个用法，其中不相同的就是 let 命令只是在他所声明的代码块中有效果。在代码块外引用的话就会报错。

**ES6 明确规定，如果区块中存在 let 和 const 命令，这这个区块对这些命令声明的变量从一开始就形成封闭作用域，只要在声明之前使用这些变量就会报错。**

```javascript
console.log(a)
var a = 0
// underfined

console.log(b)
let b = 1
// ReferenceError
```

例子：

```javascript
{
    let a = 0
    var b = 1
}

a //ReferenceError: a is not defined
b //1
```

还有一个不相同的地方在于 for 循环中的区别

```javascript
for(var a = 0; a<3; a++){
  console.
}
```

let 不允许在相同的作用域内重复声明同一个变量。

#### 块级作用域

let 实际上为 javascript 新增了块级作用域

```javascript
function f1() {
    let n = 5
    if (true) {
        let n = 10
    }
    console.log(n) // 5
}
```

上面的例子声明了两个变量且都为 n，但是最优运行的结果是 5，表示外层代码不受内层代码块的影响的，但是把 let 改为 var，则最后输出的结果为 10.

```javascript
{
    {
        {
            {
                {
                    let insane = 'hello world'
                }
            }
        }
    }
}
```

上面的代码使用了五层的块级作用域，外层作用域无法读取内层作用域的变量

```javascript
{
    {
        {
            let insane = 'Hello world'
            {
                let insane = 'Hello world'
            }
        }
    }
}
```

内层作用域可以定义外层作用域的同名变量名

-   在块级作用域中允许里面声明函数。
-   函数声明类似于 var，即会提升到全局组用于或函数作用域的头部。
-   函数是声明会提升到所在的块级作用域的头部

#### do 表达式

```javascript
{
    let t = f()
    t = t * t + 1
}
```

块级作用域将两个语句封装在一起，但是在块级作用域以外，是没有办法得到 t 的值得，因为块级不返回值，除非 t 是全局变量。

```javascript
let x = do {
    let t = f()
    t = t * t + 1
}
```

将块级作用域之前加上 do，使他变为 do 表达式，变量 x 会得到整个块级作用域的返回值。

#### const 命令

const 生命一个常量。一旦声明，常量的值就不能被改变。const 的作用域和 let 命令相同:只在所在的块级作用域内有效。const 命令和 let 命令相同存在暂时性死区，只能在声明后使用。不可重复声明。

```javascript
const PI = 3333
PI //3333

PI = 1
// TypeError: Assignment to constant variable
```

const 声明的常量不得改变值。这意味着，const 一旦声明常量，就必须立即初始化，不能留到以后赋值。

```javascript
const foo;
// SyntaxError: Missing initializer in const declaration
```
