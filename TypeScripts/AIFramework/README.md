# Framework

可复用的基础框架，以及把它们组合起来的完整业务示例 DailyTask。

| 目录 | 内容 | 依赖 |
| --- | --- | --- |
| [DailyTask](DailyTask/README.md) | 每日任务业务示例：客户端 MVVM 面板 + MVC 入口 + 弹窗 + 红点；`net/` 接入 WsProtoServer | 下面全部 |
| [MVVM_MVC](MVVM_MVC/README.md) | 响应式 Model、MVVM（ViewModel + Command）、MVC（Controller） | — |
| [Popup](Popup/README.md) | 弹窗管理：队列、优先级、装饰器注册、MVVM / MVC 弹窗适配 | MVVM_MVC |
| [RedDot](RedDot/README.md) | 红点树：路径汇总、与响应式框架的桥接 | MVVM_MVC |
| [SerializeDTO](SerializeDTO) | DTO 序列化：手写版 / 装饰器版 | — |
| [WsProtoServer](WsProtoServer/README.md) | WebSocket 长连接 + Protobuf：心跳、断线重连、ServerApp 模块化服务端 | 独立子项目（ws、protobufjs） |

```bash
# MVVM_MVC / Popup / RedDot / SerializeDTO：由上层 TypeScripts/tsconfig.json 编译
cd TypeScripts
tsc
node dist/Framework/MVVM_MVC/test.js

# WsProtoServer：独立的 npm 项目
cd TypeScripts/Framework/WsProtoServer
npm install
npm test
```
