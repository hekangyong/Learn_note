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

---

## 代码实现

可商用的 TypeScript 实现见 [TypeScripts/MVVM_MVC](../TypeScripts/MVVM_MVC/README.md)，两种架构共用同一个 Model 层，可以在一个项目里混用。

```
             ┌──────────────── Model（业务数据 + 业务规则，共用）────────────────┐
MVC ：View ─意图─> Controller ─调用─> Model ─变化─> Controller ─主动 render─> View
MVVM：View <─绑定─ ViewModel（signal / computed / Command）─读取─> Model
```

| | MVC | MVVM |
| --- | --- | --- |
| 数据流 | 命令式：Controller 主动调用 View 的显示方法 | 声明式：ViewModel 只改状态，View 通过绑定自动刷新 |
| View 与逻辑层 | Controller 持有 View | ViewModel 不知道 View 的存在 |
| 单元测试 | 需要模拟 View | ViewModel 可以脱离 UI 直接测试 |
| 适合 | 简单界面、交互少 | 表单、列表、状态联动多的界面 |

实现要点：

1. **Model**：状态不可变，`setState` 是 protected 的，只能通过业务方法修改，业务规则不会散落到 Controller / ViewModel；
2. **MVC**：View 把用户操作翻译成带类型的「意图」发出，Controller `listen` 意图、`observe` 状态，所有错误进入 `onError` 错误边界；
3. **MVVM**：响应式内核自动收集依赖，菱形依赖无毛刺，未使用的 computed 自动从上游断开（不泄漏）；`AsyncCommand` 自带加载中 / 错误 / 取消和并发策略（防重复点击、以最新一次为准）；
4. **生命周期**：所有订阅都登记到 `DisposableStore`，界面隐藏 / 销毁时统一释放，避免「界面关了订阅还在」。

运行：

```bash
cd TypeScripts && tsc
node dist/MVVM_MVC/demo.js   # 同一个待办 Model 分别用 MVC 和 MVVM 驱动
node dist/MVVM_MVC/test.js   # 自测用例
```
