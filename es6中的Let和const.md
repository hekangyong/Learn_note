
### let和const命令

在es6中新增了let命令，let命令和var命令都是一个用法，其中不相同的就是let命令只是在他所声明的代码块中有效果。在代码块外引用的话就会报错。

**ES6明确规定，如果区块中存在let和const命令，这这个区块对这些命令声明的变量从一开始就形成封闭作用域，只要在声明之前使用这些变量就会报错。**

```
  console.log(a);
  var a = 0;
  // underfined

  console.log(b);
  let b = 1;
  // ReferenceError
```

例子：
```
{
  let a = 0;
  var b = 1;
}

a //ReferenceError: a is not defined
b //1
```
还有一个不相同的地方在于for循环中的区别

```
for(var a = 0; a<3; a++){
  console.
}
```

let不允许在相同的作用域内重复声明同一个变量。

#### 块级作用域

let 实际上为javascript新增了块级作用域

```
  function f1() {
    let n = 5;
    if(true){
      let n = 10;
    }
    console.log(n) // 5
  }
```
上面的例子声明了两个变量且都为n，但是最优运行的结果是5，表示外层代码不受内层代码块的影响的，但是把let改为var，则最后输出的结果为10.
```
  {{{{{ let insane = 'hello world' }}}}}
```
上面的代码使用了五层的块级作用域，外层作用域无法读取内层作用域的变量
```
{{{
  let insane = 'Hello world'
  {let insane = 'Hello world'}
}}}
```
内层作用域可以定义外层作用域的同名变量名

- 在块级作用域中允许里面声明函数。
- 函数声明类似于var，即会提升到全局组用于或函数作用域的头部。
- 函数是声明会提升到所在的块级作用域的头部

#### do表达式
```
{
  let t = f();
  t = t * t + 1;
}
```
块级作用域将两个语句封装在一起，但是在块级作用域以外，是没有办法得到t的值得，因为块级不返回值，除非t是全局变量。
```
let x = do{
  let t = f();
  t = t * t + 1;
}
```
将块级作用域之前加上do，使他变为do表达式，变量x会得到整个块级作用域的返回值。

#### const命令
const生命一个常量。一旦声明，常量的值就不能被改变。const的作用域和let命令相同:只在所在的块级作用域内有效。const命令和let命令相同存在暂时性死区，只能在声明后使用。不可重复声明。
```
const PI = 3333;
PI //3333

PI = 1;
// TypeError: Assignment to constant variable
```
const 声明的常量不得改变值。这意味着，const一旦声明常量，就必须立即初始化，不能留到以后赋值。
```
const foo;
// SyntaxError: Missing initializer in const declaration
```
