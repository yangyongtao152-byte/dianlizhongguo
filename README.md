# NEXUS Voice Console

NEXUS 是一个面向 Windows 与 macOS 的模块化语音智能体中枢。桌面端可接入 LLM、ASR、TTS、实时语音、DeepSeek Harness、Hermes Agent、飞书、本地 Obsidian 知识库及独立 `.nexus-module` 模块。

完整使用、配置、开发和发布资料见 [文档中心](docs/README.md)。

## 安装与启动

- Windows：运行 `release` 目录中的 `NEXUS-Voice-Console-Setup-*-x64.exe`，可自选安装目录。
- macOS：在 macOS 设备执行 `npm run desktop:build:mac` 生成 DMG/ZIP。正式分发前需要 Developer ID 签名与公证。
- 开发：Node.js `>=22.13.0`，执行 `npm install` 后运行 `npm run desktop:dev`。

## 首页操作

- 点击“编辑布局”后，拖动板块标题栏移动；拖动边缘或四角调整尺寸。每次拖拽、缩放、锁定、悬浮或层级调整都会自动保存。
- “保存布局”用于立即结束编辑并确认当前布局；“恢复默认”只重置板块布局，不删除计划、密钥或模块数据。
- 右上角全屏按钮进入原生无标题栏全屏，再次点击退出。
- 点击左上角品牌区、底部“系统设置”或“独立模块”，均进入统一设置中心的对应页面。

## 统一设置中心

设置集中为七类：常规与品牌、外观与背景、模型/语音/搜索、智能体与权限、连接与飞书、独立模块、布局与数据。API 密钥写入操作系统安全凭据存储，不保存在前端配置或模块文件中。

## DeepSeek Harness 中枢

0.4.2 起可在“设置 → 智能体与权限 → DeepSeek Harness 中枢”启停本机托管中枢，或填写外部 Harness 地址。对话板块会读取持久会话、流式显示回复和工具调用，并支持运行中追加指令、取消任务与审批工具权限。安装版自带经过验证的完整 `@deepseek-ai/dsh` 插件运行时，无需另装 Harness；模型调用仍需配置对应 API Key。

0.4.3 修正豆包 Seeduplex 3.0 实时语音鉴权格式，API Key 可加密记忆、默认遮罩并按需显示；测试按钮会显示真实连接结果。对话历史自动跟随最新消息，同时保留用户向上查看旧消息的操作。Hermes Desktop 支持动态端口自动发现，并通过公开健康接口核验真实在线状态。

0.4.4 接入豆包双向流式 TTS WebSocket：支持 `seed-tts-2.0` 与 `seed-icl-2.0` 资源、输出格式和采样率配置。TTS 测试会真实校验 WebSocket、API Key 与资源权限，但不发送合成任务，因此不会因连接测试产生 TTS 合成计费。

0.4.5 接通首页语音核心与豆包 Seeduplex 全双工会话：麦克风 PCM 16 kHz 实时上传、ASR 与回复文字同步进对话历史、24 kHz PCM 语音播放，并支持手动停止和说话插入打断。

0.4.6 增加单实例运行与安装器自动退出旧进程：升级时先请求 NEXUS 正常关闭，超时后仅结束 NEXUS 自身进程，再继续覆盖安装；应用数据目录不会被卸载或清理。

0.4.7 增加可保存的实时对话音色 ID 与真实音色测试；安装器兼容旧版卸载参数，自动移除旧程序文件并保留用户数据。

0.4.8 将升级交接改为安全标记校验后直接替换旧程序目录，避免新旧 NSIS 安装器互相等待；只有同时检测到 NEXUS 主程序和卸载器时才会清理程序目录。

0.4.9 新增黄历宜忌、日历内提醒与备忘录联动，支持一次性、每日、每周、每月、按阳历或农历每年重复；统一声音形象设置与模型分类，支持组件跨工作区移动并继承目标主题。

## 独立模块开发

后续开发者不需要读取主体工程。模块格式、接口、权限、升级规则与示例见 [独立模块开发说明](docs/MODULE_SDK_GUIDE.md)。可交付一个 UTF-8 `.nexus-module` 文件，在统一设置中心上传、安装或按模块 ID 原位更新。

## 验证与打包

```bash
npm run lint
npm test
npm run desktop:build:web
npm run test:harness
npm run test:harness:packaged
npm run desktop:build:win
```

架构边界、适配器约定和发布要求见 [架构说明](docs/ARCHITECTURE.md)。
