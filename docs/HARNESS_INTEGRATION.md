# DeepSeek Harness 中枢接入

NEXUS 将 DeepSeek Harness 作为独立的“智能体编排与执行内核”，而不是界面框架。NEXUS 继续负责语音、数字人、看板、模块运行时和连接治理；Harness 负责会话、模型请求、工具、权限、工作流及子智能体。

Windows/macOS 打包前会运行 `npm run prepare:harness-runtime`，递归收集 `@deepseek-ai/dsh` 的 dependencies、optionalDependencies 与 peerDependencies，并将完整运行时复制到 `resources/h/r/node_modules`。短目录名用于兼容未启用 LongPaths 的 Windows。安装版不能依赖开发项目的 `node_modules`；冒烟测试会验证关键插件链接没有逃逸到项目目录。

## 运行边界

```text
NEXUS Renderer
  -> sandboxed preload API
  -> Electron IPC
  -> HarnessSupervisor
       -> POST /api/*             命令与审批
       -> WS /api/events.mux      会话、增量文本、工具、审批
       -> WS /api/events.host     进程内智能体状态
  -> managed @deepseek-ai/dsh sidecar or external Harness
```

Renderer 不读取 Harness 密钥、配置文件或 Node API。所有调用经过 preload 的最小能力接口。后台状态只有在 `host.describe` 与两条 WebSocket 流都连接成功后才标记为 `online`。

## 配置和数据

- NEXUS 配置：`<userData>/harness-config.json`。
- Harness Home：`<userData>/deepseek-harness`，由 `DSH_HOME` 指定。
- 默认工作区：用户“文档/NEXUS Workspace”。
- DeepSeek API Key：Electron `safeStorage`，引用名 `harness.deepseekApiKey`。
- 会话 ID 写入 NEXUS Harness 配置；Harness 自己保存完整会话事件日志。

配置支持两种模式：

1. `managed`：NEXUS 使用固定版本 `@deepseek-ai/dsh` 启动本地后台进程并随机选择空闲回环端口。
2. `external`：连接用户已经运行的 HTTPS 或回环 HTTP Harness。

## 中断和恢复

“实时停止”调用 Harness 的 `session.cancel`，不会通过关闭整个应用模拟取消。Supervisor 每 15 秒执行一次真实 `host.describe` 心跳；连续三次失败后重启托管进程。异常退出采用 1、3、7、15、30 秒退避重启。

语音 Barge-in 接入时应按以下顺序执行：

1. 立即停止本地 TTS 音频队列。
2. 根据意图决定仅停止播报、发送 `steer`，或调用 Harness `cancel`。
3. 保留已提交的 Harness 会话事件，不伪造完成状态。

## 前端事件映射

| Harness 事件 | NEXUS 显示 |
|---|---|
| `assistant/chunk` | 对话框实时增量文字 |
| `assistant/message` | 提交后的最终回复 |
| `tool/call` / `tool/result` | 当前工作阶段 |
| `host/session-status` | 工作中 / 空闲 |
| `approval/requested` | 拒绝 / 允许一次 |
| `turn/end` | 本轮完成 |
| `host/agent-error` | 明确错误信息 |

## 独立扩展约束

后续 Hermes、OpenClaw 或其他执行器应作为 Harness Provider/Tool/Subagent 插件开发。NEXUS UI 模块只能消费稳定的 NEXUS 事件和动作接口，不能导入 Harness 内部包。Harness 升级只允许修改 `desktop/harness-supervisor.mjs` 或独立的 Bridge 插件，并必须通过 `npm run test:harness`。
