# 商城 + 日常任务示例（mvc-register 生成）

用 `/mvc-register` 生成的 Cocos 3.x 业务模块。`modules/coin/` 是模拟「项目里原本就有」的金币模块，`modules/shop/` 和 `modules/dailyTask/` 是生成的模块。`MainHud` 同时挂在金币、商城、日常任务三个 Controller 上。

```
assets/scripts/
├── framework/            AIFramework MVVM_MVC 框架（从 TypeScripts/AIFramework/MVVM_MVC 复制）
├── MvcComponent.ts       组件基类，让 Cocos 组件满足 IMvcView
├── MvcRegistry.ts        所有 Model / Controller 的唯一创建处 + bootstrapMvc()
├── MvcBootstrap.ts       启动组件，调用 bootstrapMvc()
├── common/Clock.ts       时钟抽象（倒计时、跨天），测试用 ManualClock
└── modules/
    ├── coin/             CoinModel、CoinController、MainHud（商城红点 + 任务红点）
    ├── shop/             ShopModel、ShopController、ShopPanel、ShopItemCell
    └── dailyTask/        DailyTaskModel、MockDailyTaskApi、DailyTaskController、DailyTaskPanel、DailyTaskCell
types-stub/cc.d.ts        cc 的类型桩，只用于没有编辑器时做类型检查
```

## 放进真实 Cocos 项目

1. 把 `assets/scripts/` 下的文件复制到项目里，删除 `types-stub/` 和这里的 `tsconfig.json`；
2. 启动场景：新建一个节点，挂 `MvcBootstrap`；
3. 商品格子预制体：根节点挂 `ShopItemCell`，绑定名称 / 价格 / 限购 Label 和购买按钮，按钮点击事件绑到 `ShopItemCell.onClickBuy`；
4. 商城界面：挂 `ShopPanel`，绑定 `itemPrefab`、ScrollView 的 `content`、加载中节点、提示 Label；刷新按钮绑到 `onClickRefresh`；
5. 任务格子预制体：根节点挂 `DailyTaskCell`，绑定标题 / 进度 / 奖励 Label 和领取按钮，按钮点击事件绑到 `DailyTaskCell.onClickClaim`；
6. 任务界面：挂 `DailyTaskPanel`，绑定 `itemPrefab`、`content`、加载中节点、倒计时 Label、一键领取按钮、提示 Label；一键领取绑到 `onClickClaimAll`，刷新绑到 `onClickRefresh`；
7. 主界面：`MainHud` 绑定 `shopDot`、`taskDot`（红点子节点）和 `taskDotLabel`（可领取数量）；
8. 接口联调后，把 `MvcRegistry.ts` 里的 `MockShopRepository` / `MockDailyTaskApi` 换成 `HttpShopRepository` / `HttpDailyTaskApi` 并实现它们。

联调前想看到任务进度变化，可以在调试按钮里调用 `dailyTaskApi.simulateProgress('battle')`、`dailyTaskApi.simulateDailyReset()`（`dailyTaskApi` 从 `MvcRegistry` 导出）。

## 检查

```bash
cd temp/cocos-shop-demo
tsc -p .
```
