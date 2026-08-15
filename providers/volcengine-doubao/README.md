# 火山引擎豆包 Provider

该 Provider 为 NEXUS 提供四条彼此独立的能力链路：豆包 LLM、流式 ASR、TTS，以及豆包实时语音模型 3.0（Seeduplex）全双工对话。

## 实时语音 3.0 的固定格式

- WebSocket：`wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue`
- 鉴权请求头：`X-Api-Key: <你的 API Key>`
- 模型：`1.2.6.1`
- 建立连接后的第一个业务事件：`session.create`
- 输入音频：16 kHz 单声道 `pcm` 或 `speech_opus`
- 输出音频：24 kHz `pcm_s16le` 或 `ogg_opus`
- 打断当前回复：发送 `response.cancel`
- `voice` 为必填项，用于选择声音形象

实时语音 Key 使用独立的安全引用 `provider.realtime`，不会再复用 LLM 的 `provider.llm`。配置界面只把真实值交给 Electron 的加密凭据层，平时以星号显示，点击“显示”后才会在当前界面临时展示。

## 连接测试

实时语音测试会由桌面主进程使用 `X-Api-Key` 发起真实 WebSocket Upgrade。服务端返回 HTTP 101 时显示连接成功；鉴权失败、网络错误和超时都会在测试按钮上方明确显示。该测试只验证端点与鉴权，不消耗一次完整语音会话。

浏览器 WebSocket API 不能可靠设置自定义鉴权 Header，因此真正的实时语音连接也必须由桌面 Service Extension 建立，再通过受控 IPC 向界面发送标准化音频与会话事件。

## 双向流式 TTS

- WebSocket：`wss://openspeech.bytedance.com/api/v3/tts/bidirection`
- 必填请求头：`X-Api-Key`、`X-Api-Resource-Id`
- 资源 ID：`seed-tts-2.0`（语音合成 2.0）或 `seed-icl-2.0`（声音复刻 2.0）
- 连接追踪：每次生成新的 `X-Api-Connect-Id`
- 事件顺序：`StartConnection` → `StartSession` → `TaskRequest` → `FinishSession` → `FinishConnection`
- 测试按钮只验证 WebSocket Upgrade 和鉴权，不发送 `TaskRequest`，因此不会触发一次语音合成计费。
