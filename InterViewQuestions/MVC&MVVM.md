## MVC

全名是`(Model View Controller)`。

Controller 负责将 Model 的数据用 View 显示出来，也是在 Controller 里面把 Model 的数据赋值给 View。

所有的通信都是单向的。

> -   视图（`View`）：用户界面。 `是应用程序中用于处理应用程序数据逻辑的部分。通常模型对象负责在数据库中存取数据。`
> -   控制器（`Controller`）：业务逻辑。 `应用程序中处理数据显示的部分。通常视图是依据模型数据创建的`
> -   模型（`Model`）：数据保存。 `应用程序中处理用户交互的部分。通常控制器负责从视图读取数据，控制用户输入，并向模型发送数据`

`MVC`的通信方式如下：

1. `View` 传送指令到 `Controller`
2. `Controller` 完成业务逻辑后，要求 `Model` 改变状态
3. `Model` 将新的数据发送到 `View`，用户得到反馈

---

## MVVM

是由`Model、View、ViewModel`组成。

> `ViewModel`（`VM`，不是显存）。`VM` 的意义，和 `Model` 一样，在于数据。  
> `Model` 负责对数据进行取和存，然而我们对数据的操作除了取和存以外，还有一个非常重要的操作：解析。

---

MVC 和 MVVM 的区别并不是 VM 完全取代了 C，只是在 MVC 的基础上增加了一层 VM，只不过是弱化了 C 的概念  
ViewModel 存在目的在于抽离 Controller 中展示的业务逻辑，而不是替代 Controller，其它视图操作业务等还是应该放在 Controller 中实现。  
也就是说 MVVM 实现的是业务逻辑组件的重用，使开发更高效，结构更清晰，增加代码的复用性。
