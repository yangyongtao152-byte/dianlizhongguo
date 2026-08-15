# NEXUS 文档中心

本目录对应 NEXUS Voice Console v0.4.9。建议按以下顺序阅读：

1. [用户与配置手册](USER_GUIDE.md)：界面、语音、模型、日历、提醒、布局和数据位置。
2. [源码开发与发布手册](DEVELOPMENT_AND_RELEASE.md)：环境准备、本地运行、测试、Windows/macOS 打包和交付边界。
3. [架构说明](ARCHITECTURE.md)：系统分层、状态机、心跳、安全和长期演进方向。
4. [独立模块开发说明](MODULE_SDK_GUIDE.md)：无需读取主体源码即可开发 `.nexus-module` 板块。
5. [Plugin API](PLUGIN_DEVELOPMENT.md)：原生插件、事件、权限和版本兼容约定。
6. [模型与语音适配器](PROVIDER_ADAPTERS.md)：LLM、ASR、TTS、Realtime Voice 的统一抽象。
7. [DeepSeek Harness 接入](HARNESS_INTEGRATION.md)：中枢职责、运行模式、会话、审批和打包方式。

`plugin-template/` 是原生插件模板；独立板块模板可在软件的“设置 → 独立模块”中复制或下载。

## 当前交付范围

- Windows Electron 桌面端、NSIS 安装与保留数据升级。
- 模块化工作空间、跨栏目移动、主题、锁定、悬浮及三层层级。
- LLM、ASR、TTS、实时语音、搜索引擎配置及真实连接测试。
- DeepSeek Harness、Hermes、飞书和 Obsidian 接入界面。
- 万年历、农历、黄历、备忘录、计划和重复提醒。
- 系统监控、连接心跳、历史对话、热点、Token 用量和可视化智能体空间。

## 安全提示

源码包不包含用户 API Key、登录状态、Electron 用户数据、缓存或本机知识库。不要把 `secrets.json`、`.env`、用户数据备份或真实密钥提交到仓库。
