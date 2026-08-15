# NEXUS Plugin API v1

插件是 NEXUS 的唯一业务扩展方式。主应用只负责布局、事件、权限、语音会话和插件生命周期。

## 最小开发流程

1. 复制 `plugin-template/` 到独立目录。
2. 修改 `nexus.plugin.json`，保持全局唯一的插件 `id`。
3. 在 `src/index.ts` 注册 Widget、Action 或 Data Source。
4. 使用 `schemas/plugin-manifest.schema.json` 校验清单。
5. 将构建产物放入运行时插件目录，主应用根据清单自动发现。

插件不得导入 `app/` 下的任何内部模块。它只能依赖未来发布的 `@nexus/plugin-sdk`，或者当前模板内的类型副本。

## 稳定边界

- Widget：渲染独立板块，输入由 JSON Schema 描述。
- Action：提供给语音智能体或其他插件调用的受控动作。
- Data Source：发布数据，不直接操作其他 Widget。
- Agent Adapter：把外部智能体转换成统一任务事件。
- Theme：只提供设计 Token，不修改主页面结构。
- Event Bus：插件之间唯一的广播通信通道。

## 事件命名

事件采用 `<domain>.<entity>.<verb>`：

```text
voice.session.started
voice.transcript.partial
voice.response.interrupted
agent.task.started
agent.task.progress
agent.task.approval-required
agent.task.completed
workspace.layout.changed
plugin.lifecycle.failed
```

事件必须包含 `id`、`type`、`timestamp`、`source` 和可 JSON 序列化的 `payload`。禁止在事件中传递函数、DOM 节点、数据库连接或密钥。

## 权限

插件默认没有权限。清单应声明最小权限，例如：

```json
{
  "permissions": [
    "network:https://api.example.com",
    "storage:plugin",
    "agent:delegate"
  ]
}
```

文件、终端、麦克风、摄像头、通知和外部网络必须分别授权。UI 插件永远不能直接获得主进程密钥。

## 版本兼容

`apiVersion` 当前固定为 `1`。v1 内只增加可选字段；删除字段或改变语义时发布新的 API 主版本。运行时拒绝加载未知主版本，并保留清晰的诊断信息。

## Widget 约束

- 必须能适应清单声明的最小和最大尺寸。
- 必须提供空数据、加载、错误和无权限状态。
- 设置必须能被 JSON 序列化。
- 禁止依赖固定屏幕位置。
- 卸载时必须注销订阅、计时器和后台任务。

## Agent Adapter 约束

统一实现 `connect`、`createSession`、`send`、`interrupt`、`approve`、`reject` 和 `getCapabilities`。适配器只输出统一事件，不让界面解析供应商私有协议。
