"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SecretField, useSecretVault } from "../components/secret-field";

type ProviderConfig = {
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string;
  llmEndpointId: string;
  llmOrganization: string;
  asrProvider: string;
  asrModel: string;
  asrLanguage: string;
  asrRealtime: boolean;
  asrBaseUrl: string;
  ttsProvider: string;
  ttsModel: string;
  ttsBaseUrl: string;
  ttsResourceId: string;
  ttsAudioFormat: string;
  ttsSampleRate: number;
  ttsVoice: string;
  ttsSpeed: number;
  ttsRegion: string;
  realtimeProvider: string;
  realtimeModel: string;
  realtimeBaseUrl: string;
  realtimeVoice: string;
  searxngUrl: string;
};
const defaults: ProviderConfig = {
  llmProvider: "doubao",
  llmModel: "",
  llmBaseUrl: "",
  llmEndpointId: "",
  llmOrganization: "",
  asrProvider: "doubao",
  asrModel: "",
  asrLanguage: "zh-CN",
  asrRealtime: true,
  asrBaseUrl: "",
  ttsProvider: "doubao",
  ttsModel: "seed-tts-2.0-standard",
  ttsBaseUrl: "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
  ttsResourceId: "seed-tts-2.0",
  ttsAudioFormat: "pcm",
  ttsSampleRate: 24000,
  ttsVoice: "zh_female_vv_jupiter_bigtts",
  ttsSpeed: 1,
  ttsRegion: "",
  realtimeProvider: "doubao",
  realtimeModel: "1.2.6.1",
  realtimeBaseUrl: "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue",
  realtimeVoice: "zh_male_xiaotian_jupiter_bigtts",
  searxngUrl: "",
};
const llmOptions = [
  ["doubao", "火山方舟 / 豆包"],
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic Claude"],
  ["gemini", "Google Gemini"],
  ["ollama", "Ollama 本地"],
  ["openai-compatible", "自定义 OpenAI-compatible"],
];
const asrOptions = [
  ["doubao", "火山语音 ASR"],
  ["openai", "OpenAI Transcription"],
  ["deepgram", "Deepgram"],
  ["assemblyai", "AssemblyAI"],
  ["local-whisper", "本地 Whisper"],
  ["custom", "自定义 ASR"],
];
const ttsOptions = [
  ["doubao", "火山语音 TTS"],
  ["openai", "OpenAI TTS"],
  ["elevenlabs", "ElevenLabs"],
  ["azure", "Azure Speech"],
  ["local", "本地 TTS"],
  ["custom", "自定义 TTS"],
];
const voices: Record<string, [string, string][]> = {
  doubao: [
    ["zh_female_vv_jupiter_bigtts", "Vivi · 女声"],
    ["zh_male_M392_conversation_wvae_bigtts", "云舟 · 男声"],
    ["zh_female_cancan_mars_bigtts", "灿灿 · 女声"],
    ["custom", "自定义音色 ID"],
  ],
  openai: [
    ["alloy", "Alloy"],
    ["ash", "Ash"],
    ["coral", "Coral"],
    ["nova", "Nova"],
    ["sage", "Sage"],
    ["shimmer", "Shimmer"],
  ],
  elevenlabs: [["custom", "Voice ID（自定义）"]],
  azure: [
    ["zh-CN-XiaoxiaoNeural", "晓晓"],
    ["zh-CN-YunxiNeural", "云希"],
    ["custom", "自定义声音"],
  ],
  local: [["system", "系统声音"]],
  custom: [["custom", "自定义 Voice ID"]],
};
const llmHelp: Record<string, string> = {
  doubao:
    "中枢大脑：处理中文对话、意图分类、工具选择和任务路由；Endpoint ID 指向方舟上的具体模型部署。",
  openai:
    "通用推理与工具调用：适合结构化输出、多语言和 Agent 工作流；填写 Model ID 与 API Key。",
  anthropic:
    "长上下文分析与复杂推理：适合文档、代码和规划任务；填写 Claude Model ID 与 API Key。",
  gemini:
    "多模态理解：适合图片、长上下文与 Google 生态任务；填写 Gemini Model ID 与 API Key。",
  ollama:
    "本机离线模型：数据不离开电脑；API Key 通常不需要，必须填写本地模型名，Base URL 可选。",
  "openai-compatible":
    "接入任意兼容 OpenAI 请求格式的服务；Base URL、Model ID、API Key 是核心参数。",
};

const providerSecretIds = [
  "provider.llm",
  "provider.realtime",
  "provider.asr",
  "provider.tts",
  "provider.voiceId",
  "search.serper",
  "search.brave",
  "search.tavily",
  "search.jina",
] as const;

export function ProviderRegistrySettings() {
  const initial = useMemo(() => {
    try {
      const stored = {
        ...defaults,
        ...JSON.parse(localStorage.getItem("nexus-provider-registry") || "{}"),
      };
      if (stored.realtimeProvider === "doubao") {
        stored.realtimeModel ||= "1.2.6.1";
        stored.realtimeBaseUrl ||=
          "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue";
        stored.realtimeVoice ||= "zh_male_xiaotian_jupiter_bigtts";
      }
      if (stored.ttsProvider === "doubao") {
        stored.ttsModel ||= "seed-tts-2.0-standard";
        stored.ttsBaseUrl ||=
          "wss://openspeech.bytedance.com/api/v3/tts/bidirection";
        stored.ttsResourceId ||= "seed-tts-2.0";
        stored.ttsAudioFormat ||= "pcm";
        stored.ttsSampleRate ||= 24000;
      }
      stored.ttsVoice = stored.realtimeVoice;
      return stored;
    } catch {
      return defaults;
    }
  }, []);
  const [config, setConfig] = useState<ProviderConfig>(initial);
  const [tab, setTab] = useState<
    | "llm"
    | "realtime"
    | "asr"
    | "tts"
    | "search"
    | "legacy-llm"
    | "legacy-speech"
  >("llm");
  const vault = useSecretVault(providerSecretIds);
  const secrets = vault.values;
  const [testing, setTesting] = useState("");
  const [searchQuery, setSearchQuery] = useState("人工智能最新进展");
  const [status, setStatus] = useState(
    "已保存密钥会以星号显示；点击“显示”可临时查看",
  );
  function setSecret(id: string, value: string) {
    vault.setValue(id, value);
  }
  const migratedLegacyRealtimeKey = useRef(false);
  useEffect(() => {
    if (
      vault.loading ||
      migratedLegacyRealtimeKey.current ||
      config.realtimeProvider !== "doubao" ||
      vault.values["provider.realtime"] ||
      !vault.values["provider.llm"]
    )
      return;
    migratedLegacyRealtimeKey.current = true;
    vault.setValue("provider.realtime", vault.values["provider.llm"]);
    setStatus("检测到旧版共用 Key，已带入独立 Realtime Key；请保存后测试");
  }, [config.realtimeProvider, vault]);
  async function save() {
    if (
      config.realtimeProvider === "doubao" &&
      config.realtimeBaseUrl !==
        "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue"
    ) {
      setStatus("豆包 Seeduplex 3.0 请求地址格式不正确");
      return false;
    }
    if (config.searxngUrl && !/^https?:\/\//.test(config.searxngUrl)) {
      setStatus("SearXNG URL 格式无效");
      return false;
    }
    const normalized = { ...config, ttsVoice: config.realtimeVoice };
    setConfig(normalized);
    localStorage.setItem("nexus-provider-registry", JSON.stringify(normalized));
    try {
      const count = await vault.persist();
      setStatus(
        count
          ? `配置已保存 · ${count} 个密钥已加密更新并记住`
          : "配置已保存 · 已保存密钥保持不变",
      );
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "密钥保存失败");
      return false;
    }
  }
  async function testSearch() {
    const desktop = (
      window as unknown as {
        nexusDesktop?: {
          search?: {
            run(
              query: string,
              config: { searxngUrl: string },
            ): Promise<{
              ok: boolean;
              provider?: string;
              results?: unknown[];
              errors?: string[];
            }>;
          };
        };
      }
    ).nexusDesktop;
    if (!desktop?.search) {
      setStatus("真实搜索测试需要桌面安装版");
      return;
    }
    if (!(await save())) return;
    setTesting("search");
    setStatus("正在按两梯队真实搜索…");
    try {
      const result = await desktop.search.run(searchQuery, {
        searxngUrl: config.searxngUrl,
      });
      setStatus(
        result.ok
          ? "搜索成功 · " +
              result.provider +
              " · " +
              (result.results?.length || 0) +
              " 条结果"
          : "搜索失败 · " + (result.errors || []).join("；"),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "搜索测试失败");
    } finally {
      setTesting("");
    }
  }
  async function testCapability(kind: "llm" | "realtime" | "asr" | "tts") {
    const desktop = (
      window as unknown as {
        nexusDesktop?: {
          providers?: {
            test(
              kind: string,
              config: ProviderConfig,
            ): Promise<{
              ok: boolean;
              authenticated: boolean;
              detail: string;
              latency?: number;
            }>;
          };
        };
      }
    ).nexusDesktop;
    if (!desktop?.providers) {
      setStatus("真实 API 测试需要桌面安装版");
      return;
    }
    if (kind === "llm" && config.llmProvider === "doubao" && !config.llmEndpointId) {
      setStatus("连接失败 · LLM · 缺少豆包方舟 Endpoint ID（ep-...）");
      return;
    }
    if (
      kind === "llm" &&
      config.llmProvider === "openai-compatible" &&
      !/^https?:\/\//.test(config.llmBaseUrl)
    ) {
      setStatus("连接失败 · LLM · Base URL 必须以 http:// 或 https:// 开头");
      return;
    }
    if (!(await save())) return;
    setTesting(kind);
    setStatus("正在测试 " + kind.toUpperCase() + "，请稍候…");
    try {
      const result = await desktop.providers.test(kind, config);
      setStatus(
        (result.ok ? "连接成功" : "连接失败") +
          " · " +
          kind.toUpperCase() +
          " · " +
          result.detail +
          (result.latency ? " · " + result.latency + " ms" : ""),
      );
    } catch (error) {
      setStatus(
        "连接失败 · " +
          kind.toUpperCase() +
          " · " +
          (error instanceof Error ? error.message : "测试调用无响应"),
      );
    } finally {
      setTesting("");
    }
  }
  async function testSearchProvider(provider: string) {
    const desktop = (
      window as unknown as {
        nexusDesktop?: {
          search?: {
            testProvider(
              provider: string,
              config: { searxngUrl: string },
            ): Promise<{ ok: boolean; detail: string; latency?: number }>;
          };
        };
      }
    ).nexusDesktop;
    if (!desktop?.search) {
      setStatus("真实搜索测试需要桌面安装版");
      return;
    }
    if (!(await save())) return;
    setTesting("search-" + provider);
    setStatus("正在测试 " + provider + "，请稍候…");
    try {
      const result = await desktop.search.testProvider(provider, {
        searxngUrl: config.searxngUrl,
      });
      setStatus(
        (result.ok ? "连接成功" : "连接失败") +
          " · " +
          provider +
          " · " +
          result.detail +
          (result.latency ? " · " + result.latency + " ms" : ""),
      );
    } catch (error) {
      setStatus(
        "连接失败 · " +
          provider +
          " · " +
          (error instanceof Error ? error.message : "测试调用无响应"),
      );
    } finally {
      setTesting("");
    }
  }
  const voiceList = voices[config.ttsProvider] || voices.custom;
  return (
    <section className="provider-registry">
      <div className="provider-badge">
        <span>PROVIDER REGISTRY</span>
        <b>模型、语音与搜索服务</b>
        <small>每条能力链路可独立替换；* 为必填，选填项可留空</small>
      </div>
      <div className="provider-api-guide">
        <div>
          <b>LLM API</b>
          <span>
            中枢的思考与决策接口：理解对话、调用工具、拆解任务并生成回复。
          </span>
        </div>
        <div>
          <b>Realtime API</b>
          <span>低延迟双向语音：连续音频流、实时回复和随时打断。</span>
        </div>
        <div>
          <b>ASR API</b>
          <span>把麦克风语音转成文字；流式能力决定字幕与打断速度。</span>
        </div>
        <div>
          <b>TTS API</b>
          <span>把回复合成为声音；Voice ID 同时决定数字人的声音形象。</span>
        </div>
        <div>
          <b>Search API</b>
          <span>给 Agent 获取实时网页资料，多引擎路由避免单点失败。</span>
        </div>
      </div>
      <div className="provider-tabs">
        <button
          className={tab === "llm" ? "active" : ""}
          onClick={() => setTab("llm")}
        >
          大模型 LLM
        </button>
        <button
          className={tab === "realtime" ? "active" : ""}
          onClick={() => setTab("realtime")}
        >
          实时语音
        </button>
        <button
          className={tab === "asr" ? "active" : ""}
          onClick={() => setTab("asr")}
        >
          语音识别 ASR
        </button>
        <button
          className={tab === "tts" ? "active" : ""}
          onClick={() => setTab("tts")}
        >
          语音合成 TTS
        </button>
        <button
          className={tab === "search" ? "active" : ""}
          onClick={() => setTab("search")}
        >
          搜索引擎
        </button>
      </div>
      <div
        className={`provider-test-status ${testing ? "testing" : status.includes("成功") || status.includes("通过") ? "success" : status.includes("失败") || status.includes("缺少") ? "error" : "idle"}`}
        role="status"
        aria-live="polite"
      >
        <i />
        <span>{status}</span>
      </div>
      {tab === "llm" && (
        <div className="provider-pane api-type-card">
          <header className="api-type-head">
            <span>LLM</span>
            <div>
              <b>大模型与调度中枢</b>
              <small>负责理解、推理、工具调用与任务调度；只填写这一类模型的参数。</small>
            </div>
            <button disabled={Boolean(testing)} onClick={() => testCapability("llm")}>
              {testing === "llm" ? "测试中…" : "测试 LLM API"}
            </button>
          </header>
          <div className="setting-grid">
            <label>
              服务商 <em>必填</em>
              <select
                value={config.llmProvider}
                onChange={(event) =>
                  setConfig({ ...config, llmProvider: event.target.value })
                }
              >
                {llmOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Model ID <em>必填</em>
              <input
                value={config.llmModel}
                onChange={(event) =>
                  setConfig({ ...config, llmModel: event.target.value })
                }
                placeholder="例如 doubao-seed / gpt / claude"
              />
            </label>
            <label>
              Endpoint ID {config.llmProvider === "doubao" ? <em>必填</em> : <i>选填</i>}
              <input
                value={config.llmEndpointId}
                onChange={(event) =>
                  setConfig({ ...config, llmEndpointId: event.target.value })
                }
                placeholder="豆包方舟 ep-..."
              />
            </label>
            <label>
              Base URL {config.llmProvider === "openai-compatible" ? <em>必填</em> : <i>选填</i>}
              <input
                value={config.llmBaseUrl}
                onChange={(event) =>
                  setConfig({ ...config, llmBaseUrl: event.target.value })
                }
                placeholder="https://.../v1"
              />
            </label>
            <SecretField
              id="provider-llm-key"
              label="LLM API Key · 必填"
              value={secrets["provider.llm"] || ""}
              saved={vault.saved["provider.llm"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.llm", value)}
            />
            <label>
              Organization / Project <i>选填</i>
              <input
                value={config.llmOrganization}
                onChange={(event) =>
                  setConfig({ ...config, llmOrganization: event.target.value })
                }
              />
            </label>
          </div>
        </div>
      )}
      {tab === "realtime" && (
        <div className="provider-pane api-type-card voice-persona-card">
          <header className="api-type-head">
            <span>LIVE</span>
            <div>
              <b>实时语音与声音形象</b>
              <small>麦克风全双工对话、打断与回复声音；声音形象 ID 只在这里设置一次。</small>
            </div>
            <button disabled={Boolean(testing)} onClick={() => testCapability("realtime")}>
              {testing === "realtime" ? "正在验证音色…" : "测试连接与声音形象"}
            </button>
          </header>
          <div className="setting-grid">
            <label>
              Realtime 服务商 <em>必填</em>
              <select
                value={config.realtimeProvider}
                onChange={(event) => {
                  const provider = event.target.value;
                  setConfig({
                    ...config,
                    realtimeProvider: provider,
                    ...(provider === "doubao"
                      ? {
                          realtimeModel: "1.2.6.1",
                          realtimeBaseUrl:
                            "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue",
                        }
                      : {}),
                  });
                }}
              >
                <option value="doubao">豆包 Seeduplex 实时语音</option>
                <option value="openai">OpenAI Realtime</option>
                <option value="custom">自定义 WebSocket</option>
              </select>
            </label>
            <label>
              Realtime Model <em>必填</em>
              <input
                value={config.realtimeModel}
                disabled={config.realtimeProvider === "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, realtimeModel: event.target.value })
                }
              />
            </label>
            <label className="voice-persona-field">
              声音形象 ID <em>唯一设置入口</em>
              <input
                value={config.realtimeVoice}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    realtimeVoice: event.target.value,
                    ttsVoice: event.target.value,
                  })
                }
                placeholder="粘贴官方音色或复刻音色 ID"
              />
              <small>保存后同时用于实时对话和 TTS；不会再从其他位置覆盖。</small>
            </label>
            <label>
              WebSocket 地址 <em>必填</em>
              <input
                value={config.realtimeBaseUrl}
                disabled={config.realtimeProvider === "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, realtimeBaseUrl: event.target.value })
                }
              />
            </label>
            <SecretField
              id="provider-realtime-key"
              label="Realtime API Key（X-Api-Key）· 必填"
              value={secrets["provider.realtime"] || ""}
              saved={vault.saved["provider.realtime"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.realtime", value)}
            />
          </div>
        </div>
      )}
      {tab === "asr" && (
        <div className="provider-pane api-type-card">
          <header className="api-type-head">
            <span>ASR</span>
            <div>
              <b>语音识别</b>
              <small>仅配置“语音转文字”服务；实时语音模型已经包含识别时可不填。</small>
            </div>
            <button disabled={Boolean(testing)} onClick={() => testCapability("asr")}>
              {testing === "asr" ? "测试中…" : "测试 ASR API"}
            </button>
          </header>
          <div className="setting-grid">
            <label>
              ASR 服务商 <em>必填</em>
              <select
                value={config.asrProvider}
                onChange={(event) =>
                  setConfig({ ...config, asrProvider: event.target.value })
                }
              >
                {asrOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Model / Resource ID <i>选填</i>
              <input
                value={config.asrModel}
                onChange={(event) =>
                  setConfig({ ...config, asrModel: event.target.value })
                }
              />
            </label>
            <label>
              Base URL <i>本地或自定义时必填</i>
              <input
                value={config.asrBaseUrl}
                onChange={(event) =>
                  setConfig({ ...config, asrBaseUrl: event.target.value })
                }
                placeholder="http://127.0.0.1:9000"
              />
            </label>
            <label>
              识别语言 <em>必填</em>
              <select
                value={config.asrLanguage}
                onChange={(event) =>
                  setConfig({ ...config, asrLanguage: event.target.value })
                }
              >
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
                <option value="ja-JP">日本語</option>
                <option value="auto">自动检测</option>
              </select>
            </label>
            <SecretField
              id="provider-asr-key"
              label="ASR API Key / Token · 必填"
              value={secrets["provider.asr"] || ""}
              saved={vault.saved["provider.asr"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.asr", value)}
            />
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={config.asrRealtime}
                onChange={(event) =>
                  setConfig({ ...config, asrRealtime: event.target.checked })
                }
              />
              启用流式识别
            </label>
          </div>
        </div>
      )}
      {tab === "tts" && (
        <div className="provider-pane api-type-card">
          <header className="api-type-head">
            <span>TTS</span>
            <div>
              <b>语音合成</b>
              <small>仅配置“文字转语音”服务；声音形象统一使用“实时语音”栏目中的 ID。</small>
            </div>
            <button disabled={Boolean(testing)} onClick={() => testCapability("tts")}>
              {testing === "tts" ? "测试中…" : "测试 TTS API"}
            </button>
          </header>
          <div className="voice-source-note">
            当前声音形象：<b>{config.realtimeVoice || "尚未设置"}</b>
            <button onClick={() => setTab("realtime")}>前往声音形象设置</button>
          </div>
          <div className="setting-grid">
            <label>
              TTS 服务商 <em>必填</em>
              <select
                value={config.ttsProvider}
                onChange={(event) => {
                  const provider = event.target.value;
                  setConfig({
                    ...config,
                    ttsProvider: provider,
                    ...(provider === "doubao"
                      ? {
                          ttsModel: "seed-tts-2.0-standard",
                          ttsBaseUrl:
                            "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
                          ttsResourceId: "seed-tts-2.0",
                          ttsAudioFormat: "pcm",
                          ttsSampleRate: 24000,
                        }
                      : {}),
                  });
                }}
              >
                {ttsOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              TTS Model <i>选填</i>
              <input
                value={config.ttsModel}
                onChange={(event) =>
                  setConfig({ ...config, ttsModel: event.target.value })
                }
              />
            </label>
            <label>
              WebSocket / Base URL <em>必填</em>
              <input
                value={config.ttsBaseUrl}
                disabled={config.ttsProvider === "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, ttsBaseUrl: event.target.value })
                }
              />
            </label>
            <label>
              X-Api-Resource-Id {config.ttsProvider === "doubao" ? <em>必填</em> : <i>选填</i>}
              <select
                value={config.ttsResourceId}
                disabled={config.ttsProvider !== "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, ttsResourceId: event.target.value })
                }
              >
                <option value="seed-tts-2.0">seed-tts-2.0 · 语音合成</option>
                <option value="seed-icl-2.0">seed-icl-2.0 · 声音复刻</option>
              </select>
            </label>
            <label>
              输出格式
              <select
                value={config.ttsAudioFormat}
                onChange={(event) =>
                  setConfig({ ...config, ttsAudioFormat: event.target.value })
                }
              >
                <option value="pcm">PCM</option>
                <option value="mp3">MP3</option>
                <option value="ogg_opus">OGG Opus</option>
                <option value="wav">WAV</option>
              </select>
            </label>
            <label>
              采样率
              <select
                value={config.ttsSampleRate}
                onChange={(event) =>
                  setConfig({ ...config, ttsSampleRate: Number(event.target.value) })
                }
              >
                {[8000, 16000, 22050, 24000, 32000, 44100, 48000].map(
                  (rate) => <option key={rate} value={rate}>{rate} Hz</option>,
                )}
              </select>
            </label>
            <SecretField
              id="provider-tts-key"
              label="TTS API Key / Token · 必填"
              value={secrets["provider.tts"] || ""}
              saved={vault.saved["provider.tts"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.tts", value)}
            />
            <label>
              语速 {config.ttsSpeed.toFixed(1)}×
              <input
                type="range"
                min=".5"
                max="2"
                step=".1"
                value={config.ttsSpeed}
                onChange={(event) =>
                  setConfig({ ...config, ttsSpeed: Number(event.target.value) })
                }
              />
            </label>
          </div>
        </div>
      )}
      {tab === "legacy-llm" && (
        <div className="provider-pane">
          <p className="provider-context-help">
            <b>{llmOptions.find(([id]) => id === config.llmProvider)?.[1]}</b>
            {llmHelp[config.llmProvider]}
          </p>
          <div className="provider-test-row">
            <button disabled={Boolean(testing)} onClick={() => testCapability("llm")}>
              {testing === "llm" ? "LLM 测试中…" : "测试 LLM API"}
            </button>
            <button disabled={Boolean(testing)} onClick={() => testCapability("realtime")}>
              {testing === "realtime" ? "正在测试音色…" : "测试 Realtime 与音色"}
            </button>
            <small>
              豆包 Realtime 使用 Seeduplex 3.0 的 X-Api-Key WebSocket 鉴权，不再复用方舟 LLM Key。
            </small>
          </div>
          <div className="setting-grid">
            <label>
              LLM 服务商 *
              <select
                value={config.llmProvider}
                onChange={(event) =>
                  setConfig({ ...config, llmProvider: event.target.value })
                }
              >
                {llmOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              模型 / Model ID *
              <input
                value={config.llmModel}
                onChange={(event) =>
                  setConfig({ ...config, llmModel: event.target.value })
                }
                placeholder="例如 doubao-seed / gpt / claude"
              />
            </label>
            <label>
              Endpoint ID {config.llmProvider === "doubao" ? "*" : "（选填）"}
              <input
                value={config.llmEndpointId}
                onChange={(event) =>
                  setConfig({ ...config, llmEndpointId: event.target.value })
                }
                placeholder="豆包方舟 ep-..."
              />
            </label>
            <label>
              Base URL{" "}
              {config.llmProvider === "openai-compatible" ? "*" : "（选填）"}
              <input
                value={config.llmBaseUrl}
                onChange={(event) =>
                  setConfig({ ...config, llmBaseUrl: event.target.value })
                }
                placeholder="https://.../v1"
              />
            </label>
            <SecretField
              id="provider-llm-key"
              label="LLM API Key *"
              value={secrets["provider.llm"] || ""}
              saved={vault.saved["provider.llm"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.llm", value)}
            />
            <label>
              Organization / Project（选填）
              <input
                value={config.llmOrganization}
                onChange={(event) =>
                  setConfig({ ...config, llmOrganization: event.target.value })
                }
              />
            </label>
            <label>
              Realtime 服务商 *
              <select
                value={config.realtimeProvider}
                onChange={(event) => {
                  const provider = event.target.value;
                  setConfig({
                    ...config,
                    realtimeProvider: provider,
                    ...(provider === "doubao"
                      ? {
                          realtimeModel: "1.2.6.1",
                          realtimeBaseUrl:
                            "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue",
                        }
                      : {}),
                  });
                }}
              >
                <option value="doubao">豆包实时语音</option>
                <option value="openai">OpenAI Realtime</option>
                <option value="custom">自定义 WebSocket</option>
              </select>
            </label>
            <label>
              Realtime Model {config.realtimeProvider === "doubao" ? "（固定）" : "*"}
              <input
                value={config.realtimeModel}
                disabled={config.realtimeProvider === "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, realtimeModel: event.target.value })
                }
                placeholder="豆包 Seeduplex 3.0 固定为 1.2.6.1"
              />
            </label>
            <label>
              Realtime WebSocket 地址 *
              <input
                value={config.realtimeBaseUrl}
                disabled={config.realtimeProvider === "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, realtimeBaseUrl: event.target.value })
                }
              />
            </label>
            <label>
              实时对话音色 ID *
              <input
                value={config.realtimeVoice}
                onChange={(event) =>
                  setConfig({ ...config, realtimeVoice: event.target.value })
                }
                placeholder="例如 zh_male_xiaotian_jupiter_bigtts"
              />
              <small>粘贴火山控制台提供的音色 ID，保存后下一次语音会话立即生效。</small>
            </label>
            <SecretField
              id="provider-realtime-key"
              label="Realtime API Key（X-Api-Key）*"
              value={secrets["provider.realtime"] || ""}
              saved={vault.saved["provider.realtime"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.realtime", value)}
              placeholder="火山语音新版控制台 API Key"
            />
          </div>
        </div>
      )}
      {tab === "legacy-speech" && (
        <div className="provider-pane">
          <p className="provider-context-help">
            ASR、TTS、Realtime
            可以选择不同服务商；密钥按能力独立保存，避免权限混用。
          </p>
          <h4>
            语音识别 ASR{" "}
            <button disabled={Boolean(testing)} onClick={() => testCapability("asr")}>
              {testing === "asr" ? "测试中…" : "测试 ASR API"}
            </button>
          </h4>
          <div className="setting-grid">
            <label>
              ASR 服务商 *
              <select
                value={config.asrProvider}
                onChange={(event) =>
                  setConfig({ ...config, asrProvider: event.target.value })
                }
              >
                {asrOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ASR Base URL（本地 / 自定义时必填）
              <input
                value={config.asrBaseUrl}
                onChange={(event) =>
                  setConfig({ ...config, asrBaseUrl: event.target.value })
                }
                placeholder="http://127.0.0.1:9000"
              />
            </label>
            <label>
              ASR 模型 / Resource ID（选填）
              <input
                value={config.asrModel}
                onChange={(event) =>
                  setConfig({ ...config, asrModel: event.target.value })
                }
              />
            </label>
            <SecretField
              id="provider-asr-key"
              label="ASR API Key / Token *"
              value={secrets["provider.asr"] || ""}
              saved={vault.saved["provider.asr"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.asr", value)}
            />
            <label>
              识别语言 *
              <select
                value={config.asrLanguage}
                onChange={(event) =>
                  setConfig({ ...config, asrLanguage: event.target.value })
                }
              >
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
                <option value="ja-JP">日本語</option>
                <option value="auto">自动检测</option>
              </select>
            </label>
          </div>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.asrRealtime}
              onChange={(event) =>
                setConfig({ ...config, asrRealtime: event.target.checked })
              }
            />
            启用流式识别与实时打断
          </label>
          <h4>
            语音合成 TTS{" "}
            <button disabled={Boolean(testing)} onClick={() => testCapability("tts")}>
              {testing === "tts" ? "测试中…" : "测试 TTS API"}
            </button>
          </h4>
          <div className="setting-grid">
            <label>
              TTS 服务商 *
              <select
                value={config.ttsProvider}
                onChange={(event) => {
                  const provider = event.target.value;
                  setConfig({
                    ...config,
                    ttsProvider: provider,
                    ttsVoice: (voices[provider] || voices.custom)[0][0],
                    ...(provider === "doubao"
                      ? {
                          ttsModel: "seed-tts-2.0-standard",
                          ttsBaseUrl:
                            "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
                          ttsResourceId: "seed-tts-2.0",
                          ttsAudioFormat: "pcm",
                          ttsSampleRate: 24000,
                        }
                      : {}),
                  });
                }}
              >
                {ttsOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              声音形象 *
              <select
                value={config.ttsVoice}
                onChange={(event) =>
                  setConfig({ ...config, ttsVoice: event.target.value })
                }
              >
                {voiceList.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              TTS Model
              <input
                value={config.ttsModel}
                onChange={(event) =>
                  setConfig({ ...config, ttsModel: event.target.value })
                }
                placeholder="seed-tts-2.0-standard"
              />
            </label>
            <label>
              TTS WebSocket 地址 {config.ttsProvider === "doubao" ? "（固定）" : ""}
              <input
                value={config.ttsBaseUrl}
                disabled={config.ttsProvider === "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, ttsBaseUrl: event.target.value })
                }
              />
            </label>
            <label>
              X-Api-Resource-Id {config.ttsProvider === "doubao" ? "*" : "（选填）"}
              <select
                value={config.ttsResourceId}
                disabled={config.ttsProvider !== "doubao"}
                onChange={(event) =>
                  setConfig({ ...config, ttsResourceId: event.target.value })
                }
              >
                <option value="seed-tts-2.0">seed-tts-2.0 · 语音合成 2.0</option>
                <option value="seed-icl-2.0">seed-icl-2.0 · 声音复刻 2.0</option>
              </select>
            </label>
            <label>
              输出格式
              <select
                value={config.ttsAudioFormat}
                onChange={(event) =>
                  setConfig({ ...config, ttsAudioFormat: event.target.value })
                }
              >
                <option value="pcm">PCM · 流式推荐</option>
                <option value="mp3">MP3</option>
                <option value="ogg_opus">OGG Opus</option>
                <option value="wav">WAV</option>
              </select>
            </label>
            <label>
              采样率
              <select
                value={config.ttsSampleRate}
                onChange={(event) =>
                  setConfig({ ...config, ttsSampleRate: Number(event.target.value) })
                }
              >
                {[8000, 16000, 22050, 24000, 32000, 44100, 48000].map(
                  (rate) => <option key={rate} value={rate}>{rate} Hz</option>,
                )}
              </select>
            </label>
            <label>
              Azure Region（仅 Azure 必填）
              <input
                value={config.ttsRegion}
                disabled={config.ttsProvider !== "azure"}
                onChange={(event) =>
                  setConfig({ ...config, ttsRegion: event.target.value })
                }
                placeholder="eastasia"
              />
            </label>
            <SecretField
              id="provider-voice-id"
              label="自定义 Voice ID（选择自定义时必填）"
              value={
                config.ttsVoice === "custom"
                  ? secrets["provider.voiceId"] || ""
                  : ""
              }
              saved={vault.saved["provider.voiceId"]}
              loading={vault.loading}
              disabled={config.ttsVoice !== "custom"}
              onChange={(value) => setSecret("provider.voiceId", value)}
            />
            <SecretField
              id="provider-tts-key"
              label="TTS API Key / Token *"
              value={secrets["provider.tts"] || ""}
              saved={vault.saved["provider.tts"]}
              loading={vault.loading}
              onChange={(value) => setSecret("provider.tts", value)}
            />
            {config.ttsProvider === "doubao" && (
              <small className="setting-span-note">
                测试只建立真实 WebSocket 连接并校验 X-Api-Key、Resource-Id，不发送 TaskRequest，不产生语音合成计费。
              </small>
            )}
            <label>
              语速 {config.ttsSpeed.toFixed(1)}×
              <input
                type="range"
                min=".5"
                max="2"
                step=".1"
                value={config.ttsSpeed}
                onChange={(event) =>
                  setConfig({ ...config, ttsSpeed: Number(event.target.value) })
                }
              />
            </label>
          </div>
        </div>
      )}
      {tab === "search" && (
        <div className="provider-pane">
          <p className="tier-note">
            <b>第一梯队顺序：</b>Serper → Brave → Tavily →
            SearXNG；均无结果时并行使用 Bing / Jina / DuckDuckGo。配置多个 Key
            可在额度耗尽时自动切换。
          </p>
          <div className="setting-grid">
            <SecretField
              id="search-serper-key"
              label="Serper API Key（推荐）"
              value={secrets["search.serper"] || ""}
              saved={vault.saved["search.serper"]}
              loading={vault.loading}
              onChange={(value) => setSecret("search.serper", value)}
              placeholder="每月有免费额度"
            />
            <SecretField
              id="search-brave-key"
              label="Brave API Key"
              value={secrets["search.brave"] || ""}
              saved={vault.saved["search.brave"]}
              loading={vault.loading}
              onChange={(value) => setSecret("search.brave", value)}
            />
            <SecretField
              id="search-tavily-key"
              label="Tavily API Key"
              value={secrets["search.tavily"] || ""}
              saved={vault.saved["search.tavily"]}
              loading={vault.loading}
              onChange={(value) => setSecret("search.tavily", value)}
            />
            <SecretField
              id="search-jina-key"
              label="Jina API Key（选填）"
              value={secrets["search.jina"] || ""}
              saved={vault.saved["search.jina"]}
              loading={vault.loading}
              onChange={(value) => setSecret("search.jina", value)}
            />
            <label>
              SearXNG URL（选填）
              <input
                value={config.searxngUrl}
                onChange={(event) =>
                  setConfig({ ...config, searxngUrl: event.target.value })
                }
                placeholder="https://your-searxng-instance.com"
              />
            </label>
          </div>
          <div className="search-test">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button disabled={Boolean(testing)} onClick={testSearch}>
              {testing === "search" ? "搜索测试中…" : "真实测试搜索"}
            </button>
          </div>
          <div className="provider-test-grid">
            {["serper", "brave", "tavily", "jina", "searxng"].map(
              (provider) => (
                <button
                  key={provider}
                  disabled={Boolean(testing)}
                  onClick={() => testSearchProvider(provider)}
                >
                  {testing === "search-" + provider ? "测试中…" : `测试 ${provider}`}
                </button>
              ),
            )}
          </div>
        </div>
      )}
      <div className="provider-save">
        <button className="accent" disabled={Boolean(testing)} onClick={save}>
          {testing ? "正在执行测试…" : "保存 Provider Registry"}
        </button>
        <small>{status}</small>
      </div>
    </section>
  );
}
