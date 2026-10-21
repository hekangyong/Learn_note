---
name: mvc-register
description: 用 AIFramework MVVM_MVC 框架（Model + MultiController + IMvcView）新建或注册一个 MVC 业务模块：生成 Model、意图表、View 接口、Controller、Cocos 3.x 界面组件，并在全局注册表里只注册一次 Model 和 Controller。用户说「新建一个 xx 模块 / 界面」「注册 model 和 controller」「加一个 MVC」「给这个界面 / 组件接上 controller」「一个 view 监听多个 controller / model」「把 xx 面板挂到 yyController 上」时都要使用，即使没有明确提到 MVC 或 MultiController；只要是在用这个框架的项目里新增业务界面或给组件接数据，就用这个 skill。
---

# 注册 MVC 模块

这个 skill 把「一个业务模块接入 MVC」的固定流程写下来，保证每个模块都符合同一套约定：

- **Model 和 Controller 全局只创建、只 start 一次**，写在统一的注册表里；
- **界面组件只负责 attach / detach**（Cocos 的 `onEnable` / `onDisable`），从不 `new` Controller；
- 一个组件可以挂在多个 Controller 上，一个 Controller 也可以注入多个 Model。

之所以这样做：Cocos 的界面是节点上的组件，由引擎创建和销毁，同一份数据常常同时显示在多个界面上。如果每个组件各 new 一个 Controller，Model 观察和意图处理就会被重复注册，关掉一个界面还可能把别的界面一起卸载。框架里的 `MultiController` 就是为这个场景设计的，这个 skill 负责把它用对。

代码模板都在 `references/templates.md`，生成文件前先读它。

## 第 1 步：找到框架和项目约定

1. 在当前项目里搜索 `export abstract class MultiController`，它所在目录的上一级 `index.ts` 就是框架入口。之后所有业务代码只从这个 `index.ts` 引用（按生成文件的位置算相对路径）。
   - 找不到：告诉用户项目里还没有框架。本仓库的框架源码在 `TypeScripts/AIFramework/MVVM_MVC/`，可以复制 `core/`、`model/`、`mvc/`、`mvvm/`、`index.ts` 过去（不要复制 `demo.ts`、`test.ts`）。复制之前先问用户放到哪里。
   - 找到的是旧版本（没有 `MultiController` 或没有 `IMvcView`）：停下来告诉用户需要先更新框架，不要自己临时补一份。
2. 判断是不是 Cocos 3.x 项目：有 `assets/` 目录，并且代码里有 `from 'cc'`。不是 Cocos 项目时，View 用继承 `MvcView` 的普通类代替组件（模板里有），其他步骤不变。
3. 看一下已有的业务模块放在哪个目录、文件怎么命名、注释写多少，新文件照着写。没有现成模块时，默认放在 `assets/scripts/modules/<feature>/`。

## 第 2 步：问清楚模块的内容

从用户的描述里提取下面几项，缺了就问。一次问完，不要一项一项来回问：

| 项目 | 例子 |
| --- | --- |
| 模块名（PascalCase） | `Mail` |
| 状态字段 | `mails: readonly Mail[]`、`loading: boolean` |
| 业务方法（会改状态的操作） | `load()`、`read(id)`、`claimAll()` |
| 意图（用户操作） | `read: [id: number]`、`claimAll: []` |
| 界面 | 「邮件列表面板：显示列表，能点读、一键领取」「主界面红点：只显示未读数」 |
| 依赖的其他 Model | 「领取后要加金币，用 CoinModel」 |

用户只说了一句「加个邮件模块」时，根据常识给出一份建议（字段、意图、界面），让用户确认或修改后再生成。

## 第 3 步：一次性的基础设施（已存在就跳过）

先搜索，确认没有再创建：

1. **`MvcComponent` 基类**（Cocos 项目）：搜索 `class MvcComponent`。Cocos 组件必须继承 `Component`，不能继承 `MvcView`，这个基类让组件满足 `IMvcView` 接口。
2. **注册表 `MvcRegistry.ts`**：搜索 `MvcRegistry` 或 `bootstrapMvc`。它导出所有 Model 和 Controller 的单例，以及一个 `bootstrapMvc()` 函数，统一 `start()` 所有 Controller。
3. **启动入口**：搜索 `bootstrapMvc(` 的调用。没有的话，在常驻节点的启动组件里调用一次（`director.addPersistRootNode` 所在的组件，或启动场景的入口组件）。找不到合适的地方就创建 `MvcBootstrap` 组件，并告诉用户要把它挂到启动场景的节点上。这一步需要用户在编辑器里操作，要在最后的汇报里写清楚。

## 第 4 步：生成模块

按模板生成两个文件，再加上每个界面一个组件：

1. **`<Feature>Model.ts`**：状态接口 + Model 类。业务规则（校验、上限、重复检查）写在 Model 里，Controller 不重复写，这样换一个界面或者以后改成 MVVM 都不用再写一遍。
2. **`<Feature>Controller.ts`**：意图表、View 接口、Controller。
   - 意图名前加模块前缀，例如 `mailRead`、`mailClaimAll`。一个组件挂多个 Controller 时，意图表会合并在一起，重名的意图会被两个 Controller 同时处理。写之前搜索项目里已有的意图名，确认不会重复。
   - View 接口里的显示方法全部写成可选（`renderList?(...)`），每个界面只实现自己需要的。
   - `onStart` 里用 `observe` 观察 Model，用 `forEachView` 刷新；`onAttach` 里给新挂上的 View 补一次当前状态。缺了 `onAttach`，后打开的界面会一直是空的，这是最容易漏的地方。
   - 界面需要的数据差别很大时（列表 vs 红点数字），分别 `observe(model.select(...))`，不要为了一个红点刷新整张列表。
   - 依赖多个 Model 时，都从构造函数注入。需要组合计算的显示（例如「金币够才能领取」）放在同一个 Controller 里用 `computed` 算，不要拆给两个 Controller。
3. **每个界面一个组件**：继承 `MvcComponent<意图表>`，实现 View 接口里自己需要的方法；`onEnable` 里 attach，`onDisable` 里 detach；按钮回调里只调用 `this.emit(...)`。
4. **在注册表里注册**：导入 Model 和 Controller，创建单例并导出，在 `bootstrapMvc()` 里加一行 `start()`。Model 要先于依赖它的 Controller 创建。

### 只给已有组件接 Controller

用户要的是「让这个组件也显示 xx 数据」或者「挂到另一个 Controller 上」时，不新建模块：

- 把组件的意图表改成交叉类型，例如 `MvcComponent<HudIntents & MailIntents>`，并让组件 `implements` 对应的 View 接口；
- 在 `onEnable` / `onDisable` 里加一对 attach / detach，两个 Controller 的顺序要对称；
- 不需要改注册表。

## 第 5 步：自查

生成完逐条检查，有问题直接改：

- 整个项目里 `new <Feature>Controller(` 和 `new <Feature>Model(` 各只出现一次，都在注册表里；
- 组件里没有 `new` 任何 Controller 或 Model，也没有调用 `start()` / `dispose()`；
- 每个 attach 都有对应的 detach；
- 组件重写 `onDestroy` 时调用了 `super.onDestroy()`，否则 Emitter 不会被清理；
- 意图名在项目里唯一；
- 能编译就编译一次：项目里有 `tsconfig.json` 时运行 `npx tsc --noEmit -p .`。Cocos 项目的 tsconfig 依赖编辑器生成的 `temp/` 目录，报「找不到 `cc` 模块」这类错误时，说明需要先用编辑器打开一次项目。这种情况如实告诉用户没有编译，不要说成已通过。

## 第 6 步：汇报

简短告诉用户：

- 新建和修改了哪些文件（可点击的路径）；
- 意图表和 View 接口的内容，方便对照；
- 需要用户在 Cocos 编辑器里做的事：把新组件挂到界面节点上、把按钮事件绑到组件方法上；第一次使用时还要把 `MvcBootstrap` 挂到启动场景；
- 编译结果，或者没能编译的原因。
