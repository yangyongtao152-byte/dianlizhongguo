# 模型、ASR 与 TTS 调度中枢

调度中枢按能力选择 Provider，不让界面或智能体绑定具体厂商。当前定义四类适配器：LLM、ASR、TTS、Realtime Voice。

## 建议的首批兼容目标

| 能力 | 标准/厂商 |
|---|---|
| LLM | OpenAI-compatible、Anthropic、Gemini、Ollama、LM Studio |
| ASR | OpenAI/Whisper、Deepgram、Azure Speech、讯飞、阿里云 |
| TTS | OpenAI、ElevenLabs、Azure Speech、火山引擎、系统本地语音 |
| Realtime | WebRTC/WebSocket speech-to-speech Provider |

具体供应商由独立 Provider 插件实现。内核只依赖 `packages/plugin-sdk` 中的接口。

## 路由与降级

每类能力配置一个主 Provider 和多个 fallback：

```json
{
  "capability": "asr",
  "primary": "openai-realtime",
  "fallbacks": ["deepgram-stream", "local-whisper"],
  "timeoutMs": 8000
}
```

降级只在连接失败、超时、限流或明确的服务错误时触发。语音会话进行中不能无提示切换声音；TTS Provider 变化时应告知用户。

## 实时链路

```text
Microphone → VAD → ASR/Realtime Provider → Orchestrator
           ↘ barge-in detector       ↓ tool calls
Speaker ← audio queue ← TTS/Realtime Provider ← response
```

用户重新讲话时，本地 barge-in detector 先停止扬声器，再发送 `cancelResponse()`。后台智能体任务是否停止由调度中枢根据“停止播报、暂停任务、取消任务”三类意图决定。

## 密钥

Provider 配置只保存 `secretRef`。真实密钥通过 Electron `safeStorage` 进入 Windows DPAPI 或 macOS Keychain 加密存储。插件、Widget、事件日志和 LocalStorage都不能获取其他 Provider 的密钥。

## 能力探测

Provider 启用前调用 `probe()`，记录流式输出、工具调用、语言、声音、实时协议等能力。路由器只选择满足任务要求的 Provider。
