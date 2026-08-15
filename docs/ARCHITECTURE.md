# NEXUS 成熟工程架构

## 产品原则

1. Local-first：布局、记忆、日志、知识库和密钥优先保存在本机。
2. Observable：任务阶段、工具调用、连接健康和可公开决策说明均可审计。
3. Interruptible：语音播报、Realtime 会话和后台任务拥有不同的中断语义。
4. Provider-neutral：LLM、ASR、TTS、数字人和执行智能体均通过适配器接入。
5. Plugin-first：业务能力不进入 Kernel；第三方开发者不读取主体源码。
6. Fail-safe：连接失败时降级、限次重试并保留人工控制权。

## 工程分层

```text
Desktop Shell
├── Window / Tray / Auto Update
├── Secure Credentials
├── File & Media Permissions
└── Native IPC

NEXUS Kernel
├── Plugin Runtime
├── Event Bus
├── Permission Engine
├── Workspace & Scene Engine
├── Scheduler
└── Health Supervisor

Domain Services
├── Voice Session
├── Agent Task
├── Memory
├── Knowledge Graph
├── Hotspot Monitor
└── Audit & Trace

Adapters
├── LLM / ASR / TTS / Realtime Voice
├── Hermes / Codex / Claude Code / OpenClaw
├── Obsidian / Calendar / News
└── Digital Human

UI Extensions
└── Independent Widgets and Scene Layers
```

依赖方向只能向下。Widget不能直接调用桌面原生能力；Adapter不能直接修改布局；Provider不能读取其他Provider的密钥。

## 建议的仓库目标结构

```text
apps/
├── desktop/                 # Electron 桌面宿主
└── dashboard/               # React 工作台
packages/
├── kernel/                  # 生命周期、事件、权限
├── plugin-sdk/              # 唯一公开开发入口
├── provider-runtime/        # 模型路由与降级
├── voice-runtime/           # VAD、ASR、TTS、打断
├── agent-runtime/           # 会话、审批、任务状态
├── storage/                 # SQLite、迁移、凭据引用
├── observability/           # 日志、Trace、指标、心跳
└── ui-system/               # Token、布局、可访问性
plugins/
├── obsidian/
├── productivity/
├── hotspots/
└── volcengine-doubao/
```

当前原型保留在 `app/`，后续迭代按上述边界迁移，每次只迁移一个可验证域，不做一次性重写。

## 核心状态机

### Voice Session

```text
idle → waking → listening → understanding → speaking
                     ↑          ↓            ↓
                     └──── interrupted ←─────┘
                                ↓
                              idle
```

### Agent Task

```text
queued → running → approval-required → running → completed
            ↓              ↓             ↓
          paused         rejected       failed
            ↓
         cancelled
```

### Connection

```text
unconfigured → connecting → healthy
                    ↓          ↓
                 offline ← degraded
                    ↓
             retry-with-backoff → circuit-open
```

每次状态变化发布标准事件并写入审计日志。UI 不推测状态，只消费状态快照。

## 心跳机制

心跳不是让模型无休止生成内容，而是低成本 Supervisor：

1. 检查网络、Provider、Agent Gateway、数据源和插件进程；
2. 查看超时任务与未完成计划；
3. 对瞬时故障执行指数退避重连；
4. 达到失败阈值后打开熔断器；
5. 只有需要用户关注时才唤醒语音或通知层。

默认退避：1s、2s、5s、10s、30s；连续五次失败进入 circuit-open，等待人工处理或冷却时间结束。

## 数据与迁移

- SQLite：工作空间、会话索引、计划、备忘、审计日志和插件元数据。
- 插件作用域存储：插件自己的结构化数据。
- 文件资源库：背景、缓存、Obsidian索引等大型数据。
- 安全凭据：Windows DPAPI/macOS Keychain，仅保存引用。
- 每个 Schema 必须包含版本和前向迁移；应用启动前备份并运行事务迁移。

## 思考过程的产品边界

只展示计划、证据、工具调用、决策摘要、置信状态和下一步，不显示或要求模型内部隐式推理。用户能够据此审计“做了什么、为什么选择该动作、用了什么数据、结果如何”。

## 安全模型

- 所有插件默认零权限；
- 网络域名、文件目录、麦克风、摄像头和系统操作分别授权；
- 高风险 Action 必须通过审批；
- IPC 参数使用 Schema 校验；
- WebView启用上下文隔离、禁用 Node Integration；
- 第三方插件进入独立进程或沙箱；
- 日志自动清除密钥、Token和敏感正文。

## 质量门禁

每次发布必须通过：

1. TypeScript、Lint、单元测试和生产构建；
2. Provider契约测试和模拟故障测试；
3. 语音打断延迟、首字延迟和重连测试；
4. 1366×768、1080p、2K、4K、超宽屏和高DPI布局测试；
5. Windows安装/升级/卸载测试；
6. macOS安装、权限和Keychain测试；
7. 插件权限、崩溃隔离和数据迁移测试；
8. 无网络、无密钥、服务限流和磁盘只读场景。

## 发布通道

- Nightly：自动构建，仅开发验证。
- Beta：带迁移测试，供小范围使用。
- Stable：签名安装包、变更日志、回滚方案和兼容矩阵齐全。

Windows使用代码签名证书；macOS使用Developer ID签名并完成Notarization。当前无证书的安装包只属于开发预览版。

## 迭代顺序

1. 抽离 Kernel、Storage和公开Plugin SDK。
2. 完成豆包 LLM/ASR/TTS/Realtime真实适配。
3. 完成Hermes Adapter和任务状态机。
4. 完成本地唤醒、VAD、实时打断与音频队列。
5. 将备忘、计划、热点、Obsidian迁移为独立插件包。
6. 加入SQLite迁移、崩溃恢复、自动更新和签名发布。
7. 接入数字人Provider，并验证音画同步与打断。
