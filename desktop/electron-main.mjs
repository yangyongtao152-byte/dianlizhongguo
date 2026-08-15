import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from "electron";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSystemMetrics } from "./system-metrics.mjs";
import { HarnessSupervisor } from "./harness-supervisor.mjs";
import { RealtimeVoiceSession } from "./realtime-voice.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(directory, "..");
let harnessSupervisor = null;
let quitting = false;
const voiceSessions = new Map();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.exit(0);
else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
}
const execFileAsync = promisify(execFile);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "nexus-media",
    privileges: { secure: true, supportFetchAPI: true, stream: true },
  },
]);

async function readSecrets() {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(app.getPath("userData"), "secrets.json"),
        "utf8",
      ),
    );
  } catch {
    return {};
  }
}

async function decryptSecret(key) {
  const secrets = await readSecrets();
  if (!secrets[key] || !safeStorage.isEncryptionAvailable()) return "";
  return safeStorage.decryptString(Buffer.from(secrets[key], "base64"));
}

ipcMain.handle("nexus:secret:set", async (_event, key, value) => {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("系统安全凭据存储不可用");
  const secrets = await readSecrets();
  secrets[key] = safeStorage.encryptString(String(value)).toString("base64");
  await fs.writeFile(
    path.join(app.getPath("userData"), "secrets.json"),
    JSON.stringify(secrets),
    { mode: 0o600 },
  );
  return true;
});

ipcMain.handle("nexus:secret:get", async (_event, key) => {
  const secrets = await readSecrets();
  if (!secrets[key] || !safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(secrets[key], "base64"));
});

function requireHarness() {
  if (!harnessSupervisor) throw new Error("Harness Supervisor 尚未初始化");
  return harnessSupervisor;
}

ipcMain.handle("nexus:harness:status", () => requireHarness().status());
ipcMain.handle("nexus:harness:configure", (_event, config) =>
  requireHarness().configure(config),
);
ipcMain.handle("nexus:harness:start", () => requireHarness().start());
ipcMain.handle("nexus:harness:stop", () => requireHarness().stop());
ipcMain.handle("nexus:harness:restart", () => requireHarness().restart());
ipcMain.handle("nexus:harness:send", (_event, text, mode) =>
  requireHarness().send(text, mode),
);
ipcMain.handle("nexus:harness:history", () => requireHarness().history());
ipcMain.handle("nexus:harness:cancel", () => requireHarness().cancel());
ipcMain.handle("nexus:harness:approve", (_event, request) =>
  requireHarness().approve(request),
);

ipcMain.handle("nexus:voice:start", async (event, config = {}) => {
  const sender = event.sender;
  const previous = voiceSessions.get(sender.id);
  if (previous) await previous.close();
  if (String(config.realtimeProvider || "doubao") !== "doubao")
    throw new Error("当前实时语音桥仅支持豆包 Seeduplex");
  const officialEndpoint =
    "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue";
  if (
    config.realtimeBaseUrl &&
    String(config.realtimeBaseUrl) !== officialEndpoint
  )
    throw new Error("豆包实时语音地址必须使用官方 Seeduplex 接口");
  if (
    config.realtimeModel &&
    String(config.realtimeModel) !== "1.2.6.1"
  )
    throw new Error("豆包 Seeduplex 模型标识必须为 1.2.6.1");
  const voice = String(
    config.realtimeVoice || "zh_male_xiaotian_jupiter_bigtts",
  );
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(voice))
    throw new Error("实时语音音色标识格式不正确");
  const apiKey = await decryptSecret("provider.realtime");
  if (!apiKey)
    throw new Error("请先在设置 → 模型与语音中保存豆包实时语音 API Key");
  const realtime = new RealtimeVoiceSession({
    apiKey,
    config: {
      realtimeBaseUrl: officialEndpoint,
      realtimeModel: "1.2.6.1",
      realtimeVoice: voice,
      realtimeInstructions: String(config.realtimeInstructions || "").slice(
        0,
        4000,
      ),
    },
    onEvent: (payload) => {
      if (!sender.isDestroyed()) sender.send("nexus:voice:event", payload);
    },
    onClosed: () => {
      if (voiceSessions.get(sender.id) === realtime)
        voiceSessions.delete(sender.id);
    },
  });
  voiceSessions.set(sender.id, realtime);
  try {
    return await realtime.connect();
  } catch (error) {
    await realtime.close();
    if (voiceSessions.get(sender.id) === realtime)
      voiceSessions.delete(sender.id);
    throw error;
  }
});

ipcMain.on("nexus:voice:audio", (event, base64) => {
  voiceSessions.get(event.sender.id)?.appendAudio(String(base64 || ""));
});

ipcMain.on("nexus:voice:cancel", (event) => {
  voiceSessions.get(event.sender.id)?.cancel();
});

ipcMain.handle("nexus:voice:stop", async (event) => {
  const realtime = voiceSessions.get(event.sender.id);
  if (!realtime) return true;
  voiceSessions.delete(event.sender.id);
  await realtime.close();
  return true;
});

function timeoutSignal(milliseconds = 8000) {
  return AbortSignal.timeout(milliseconds);
}

function validGateway(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "::1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

async function loopbackListeningPorts() {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("netstat.exe", ["-ano", "-p", "tcp"], {
        windowsHide: true,
        timeout: 3500,
      });
      return [
        ...new Set(
          [...stdout.matchAll(/^\s*TCP\s+(?:127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]):(\d+)\s+\S+\s+LISTENING\s+\d+/gim)]
            .map((match) => Number(match[1]))
            .filter((port) => port > 0 && port < 65536),
        ),
      ];
    }
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      "-iTCP",
      "-sTCP:LISTEN",
    ], { timeout: 3500 });
    return [
      ...new Set(
        [...stdout.matchAll(/(?:127\.0\.0\.1|\*|\[::1\]):(\d+)\s+\(LISTEN\)/g)]
          .map((match) => Number(match[1]))
          .filter((port) => port > 0 && port < 65536),
      ),
    ];
  } catch {
    return [];
  }
}

async function probeHermesBase(base, timeout = 1800) {
  let lastStatus = 0;
  for (const route of ["/api/health", "/api/status", "/health", "/v1/models", "/"]) {
    try {
      const response = await net.fetch(`${base}${route}`, {
        signal: timeoutSignal(timeout),
      });
      lastStatus = response.status;
      if (!response.ok) continue;
      let body = {};
      try {
        body = await response.json();
      } catch {
        /* A legacy gateway may expose a non-JSON health page. */
      }
      const hermesSignature =
        route.startsWith("/api/") &&
        body &&
        typeof body === "object" &&
        ("version" in body || "gateway_running" in body || body.ok === true);
      return {
        ok: true,
        status: response.status,
        route,
        body,
        hermesSignature,
      };
    } catch {
      // A transport failure applies to every route on this host/port. Avoid
      // multiplying the timeout before falling back to Desktop auto-discovery.
      break;
    }
  }
  return { ok: false, status: lastStatus, route: "", body: {}, hermesSignature: false };
}

async function discoverHermesDesktop() {
  const ports = await loopbackListeningPorts();
  const candidates = await Promise.all(
    ports.map(async (port) => {
      const base = `http://127.0.0.1:${port}`;
      const result = await probeHermesBase(base, 900);
      return result.ok && result.hermesSignature ? { base, ...result } : null;
    }),
  );
  return candidates.find(Boolean) || null;
}

ipcMain.handle("nexus:connection:probe-hermes", async (_event, endpoint) => {
  const started = performance.now();
  const requested = String(endpoint || "auto").trim();
  const automatic = !requested || requested.toLowerCase() === "auto";
  if (!automatic && !validGateway(requested))
    return {
      ok: false,
      reachable: false,
      authenticated: false,
      error: "仅允许 HTTPS 或本机 HTTP Gateway",
      checkedAt: Date.now(),
    };
  let base = automatic ? "" : requested.replace(/\/$/, "");
  const localRequested =
    automatic ||
    (() => {
      try {
        return ["127.0.0.1", "localhost", "::1"].includes(new URL(base).hostname);
      } catch {
        return false;
      }
    })();
  let result = base
    ? await probeHermesBase(base, localRequested ? 550 : 2500)
    : null;
  if ((!result?.ok || !result.hermesSignature) && localRequested) {
    const discovered = await discoverHermesDesktop();
    if (discovered) {
      base = discovered.base;
      result = discovered;
    }
  }
  if (result?.ok)
    return {
      ok: true,
      reachable: true,
      authenticated: result.body?.auth_required !== true,
      status: result.status,
      route: result.route,
      endpoint: base,
      version: String(result.body?.version || ""),
      gatewayRunning:
        typeof result.body?.gateway_running === "boolean"
          ? result.body.gateway_running
          : undefined,
      latency: Math.round(performance.now() - started),
      checkedAt: Date.now(),
      error:
        result.body?.auth_required === true
          ? "Hermes 已响应，但该后端要求会话鉴权"
          : "",
    };
  return {
    ok: false,
    reachable: false,
    authenticated: false,
    latency: Math.round(performance.now() - started),
    checkedAt: Date.now(),
    error: automatic
      ? "未发现正在运行的 Hermes Desktop 后端"
      : "配置地址无响应，且未发现 Hermes Desktop 动态端口",
  };
});

async function feishuTenantToken(appId) {
  const secrets = await readSecrets();
  if (!secrets["feishu.appSecret"] || !safeStorage.isEncryptionAvailable())
    throw new Error("尚未保存飞书 App Secret");
  const appSecret = safeStorage.decryptString(
    Buffer.from(secrets["feishu.appSecret"], "base64"),
  );
  const response = await net.fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      signal: timeoutSignal(),
    },
  );
  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.tenant_access_token)
    throw new Error(data.msg || `飞书鉴权失败 HTTP ${response.status}`);
  return data.tenant_access_token;
}

async function feishuGet(pathname, token) {
  const response = await net.fetch(`https://open.feishu.cn${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: timeoutSignal(),
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0)
    throw new Error(data.msg || `飞书接口失败 HTTP ${response.status}`);
  return data.data ?? {};
}

ipcMain.handle("nexus:feishu:test", async (_event, appId) => {
  const started = performance.now();
  try {
    if (!appId) throw new Error("请填写飞书 App ID");
    await feishuTenantToken(appId);
    return {
      ok: true,
      reachable: true,
      authenticated: true,
      latency: Math.round(performance.now() - started),
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      reachable: true,
      authenticated: false,
      latency: Math.round(performance.now() - started),
      checkedAt: Date.now(),
      error: error instanceof Error ? error.message : "飞书连接失败",
    };
  }
});

ipcMain.handle("nexus:feishu:sync", async (_event, config) => {
  const result = {
    ok: false,
    calendars: [],
    messages: [],
    weekly: null,
    tasks: [],
    access: { tenant: false, tasks: false },
    errors: [],
  };
  try {
    const tenantToken = await feishuTenantToken(config.appId);
    result.access.tenant = true;
    try {
      const data = await feishuGet(
        "/open-apis/calendar/v4/calendars?page_size=50",
        tenantToken,
      );
      result.calendars = data.calendar_list ?? data.items ?? [];
    } catch (error) {
      result.errors.push(`日历：${error.message}`);
    }
    if (config.chatId) {
      try {
        const query = new URLSearchParams({
          container_id_type: "chat",
          container_id: config.chatId,
          page_size: "50",
          sort_type: "ByCreateTimeDesc",
        });
        const data = await feishuGet(
          `/open-apis/im/v1/messages?${query}`,
          tenantToken,
        );
        result.messages = data.items ?? [];
      } catch (error) {
        result.errors.push(`消息：${error.message}`);
      }
    }
    if (config.weeklyDocumentId) {
      try {
        const data = await feishuGet(
          `/open-apis/docx/v1/documents/${encodeURIComponent(config.weeklyDocumentId)}/raw_content`,
          tenantToken,
        );
        result.weekly = data.content ?? "";
      } catch (error) {
        result.errors.push(`周报：${error.message}`);
      }
    }
    const secrets = await readSecrets();
    if (
      secrets["feishu.userAccessToken"] &&
      safeStorage.isEncryptionAvailable()
    ) {
      try {
        const userToken = safeStorage.decryptString(
          Buffer.from(secrets["feishu.userAccessToken"], "base64"),
        );
        const data = await feishuGet(
          "/open-apis/task/v2/tasks?page_size=50",
          userToken,
        );
        result.tasks = data.items ?? [];
        result.access.tasks = true;
      } catch (error) {
        result.errors.push(`任务：${error.message}`);
      }
    } else result.errors.push("任务：需要用户 Access Token 授权");
    result.ok = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "飞书同步失败");
  }
  return result;
});

function isImmersive(window) {
  return window.isKiosk() || window.isFullScreen();
}

async function setImmersive(window, next) {
  window.setMenuBarVisibility(false);
  if (process.platform === "darwin") window.setFullScreen(next);
  else window.setKiosk(next);
  await new Promise((resolve) => setTimeout(resolve, 180));
  const active = isImmersive(window);
  window.webContents.send("nexus:window:fullscreen-changed", active);
  return active;
}

ipcMain.handle("nexus:window:toggle-fullscreen", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  return setImmersive(window, !isImmersive(window));
});

ipcMain.handle("nexus:window:get-fullscreen", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? isImmersive(window) : false;
});

ipcMain.handle("nexus:external:open", async (_event, value) => {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return false;
    await shell.openExternal(url.toString());
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("nexus:system:metrics", async () => {
  try {
    return await collectSystemMetrics({
      dataPath: app.getPath("userData"),
      getGpuInfo: () => app.getGPUInfo("basic"),
      getGpuFeatureStatus: () => app.getGPUFeatureStatus(),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "系统监控读取失败",
      checkedAt: Date.now(),
    };
  }
});

function testSecureWebSocketUpgrade(
  endpoint,
  apiKey,
  extraHeaders = {},
  timeout = 10000,
) {
  return new Promise((resolve, reject) => {
    const target = new URL(endpoint);
    if (target.protocol !== "wss:") {
      reject(new Error("Realtime 地址必须以 wss:// 开头"));
      return;
    }
    const request = https.request({
      protocol: "https:",
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
        "Sec-WebSocket-Version": "13",
        ...extraHeaders,
      },
    });
    const timer = setTimeout(() => {
      request.destroy(new Error("Realtime WebSocket 鉴权超时"));
    }, timeout);
    request.once("upgrade", (response, socket) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({
        ok: response.statusCode === 101,
        status: response.statusCode || 101,
        logId: String(response.headers["x-tt-logid"] || ""),
      });
    });
    request.once("response", (response) => {
      clearTimeout(timer);
      response.resume();
      resolve({
        ok: false,
        status: response.statusCode || 0,
        logId: String(response.headers["x-tt-logid"] || ""),
      });
    });
    request.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

ipcMain.handle("nexus:provider:test", async (_event, kind, config = {}) => {
  const started = performance.now();
  const finish = (ok, authenticated, detail, status) => ({
    ok,
    reachable: status !== 0,
    authenticated,
    detail,
    status,
    latency: Math.round(performance.now() - started),
    checkedAt: Date.now(),
  });
  try {
    const provider = String(config[kind + "Provider"] || "");
    const secretKey = "provider." + kind;
    const key = await decryptSecret(secretKey);
    if (!key && !["ollama", "local", "local-whisper"].includes(provider))
      return finish(false, false, "尚未保存该能力的 API Key", 0);
    let url = "";
    let headers = {};
    if (kind === "realtime") {
      if (provider === "doubao") {
        const endpoint = String(
          config.realtimeBaseUrl ||
            "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue",
        );
        if (
          endpoint !==
          "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue"
        )
          return finish(false, false, "Seeduplex 3.0 请求地址不正确", 0);
        if (String(config.realtimeModel || "1.2.6.1") !== "1.2.6.1")
          return finish(false, false, "Seeduplex 3.0 模型必须为 1.2.6.1", 0);
        const voice = String(
          config.realtimeVoice || "zh_male_xiaotian_jupiter_bigtts",
        );
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(voice))
          return finish(false, false, "Realtime 音色 ID 格式不正确", 0);
        const realtime = new RealtimeVoiceSession({
          apiKey: key,
          config: {
            realtimeBaseUrl: endpoint,
            realtimeModel: "1.2.6.1",
            realtimeVoice: voice,
          },
          onEvent: () => {},
          onClosed: () => {},
        });
        try {
          await realtime.connect();
          return finish(
            true,
            true,
            `session.created 已返回 · 音色 ID ${voice} 可用`,
            101,
          );
        } finally {
          await realtime.close();
        }
      }
      if (provider === "openai") {
        url = "https://api.openai.com/v1/models";
        headers = { Authorization: "Bearer " + key };
      } else {
        return finish(
          false,
          false,
          "自定义 Realtime 需要由对应模块实现 WebSocket 鉴权探测",
          0,
        );
      }
    } else if (kind === "llm") {
      if (provider === "doubao")
        url = "https://ark.cn-beijing.volces.com/api/v3/models";
      else if (provider === "openai") url = "https://api.openai.com/v1/models";
      else if (provider === "anthropic") {
        url = "https://api.anthropic.com/v1/models";
        headers = { "x-api-key": key, "anthropic-version": "2023-06-01" };
      } else if (provider === "gemini")
        url =
          "https://generativelanguage.googleapis.com/v1beta/models?key=" +
          encodeURIComponent(key);
      else if (provider === "ollama")
        url =
          (config.llmBaseUrl || "http://127.0.0.1:11434").replace(/\/$/, "") +
          "/api/tags";
      else url = String(config.llmBaseUrl || "").replace(/\/$/, "") + "/models";
      if (
        !Object.keys(headers).length &&
        provider !== "gemini" &&
        provider !== "ollama"
      )
        headers = { Authorization: "Bearer " + key };
    } else if (kind === "asr") {
      if (provider === "openai") {
        url = "https://api.openai.com/v1/models";
        headers = { Authorization: "Bearer " + key };
      } else if (provider === "deepgram") {
        url = "https://api.deepgram.com/v1/projects";
        headers = { Authorization: "Token " + key };
      } else if (provider === "assemblyai") {
        url = "https://api.assemblyai.com/v2/transcript?limit=1";
        headers = { Authorization: key };
      } else if (provider === "local-whisper")
        url =
          String(config.asrBaseUrl || "http://127.0.0.1:9000").replace(
            /\/$/,
            "",
          ) + "/health";
      else
        return finish(
          false,
          false,
          "该 ASR 需要上传一段样本音频才能完成真实鉴权测试",
          0,
        );
    } else if (kind === "tts") {
      if (provider === "doubao") {
        const endpoint = String(
          config.ttsBaseUrl ||
            "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
        );
        const resourceId = String(config.ttsResourceId || "seed-tts-2.0");
        if (
          endpoint !==
          "wss://openspeech.bytedance.com/api/v3/tts/bidirection"
        )
          return finish(false, false, "豆包双向流式 TTS 请求地址不正确", 0);
        if (!new Set(["seed-tts-2.0", "seed-icl-2.0"]).has(resourceId))
          return finish(false, false, "X-Api-Resource-Id 不受支持", 0);
        const result = await testSecureWebSocketUpgrade(endpoint, key, {
          "X-Api-Resource-Id": resourceId,
          "X-Api-Connect-Id": crypto.randomUUID(),
          "X-Control-Require-Usage-Tokens-Return": "*",
        });
        return finish(
          result.ok,
          result.ok,
          result.ok
            ? `WebSocket 101 握手通过 · X-Api-Key 与 ${resourceId} 鉴权成功 · 未发送 TaskRequest，不产生合成计费${result.logId ? ` · Logid ${result.logId}` : ""}`
            : `TTS 服务已响应，但鉴权未通过 HTTP ${result.status}${result.logId ? ` · Logid ${result.logId}` : ""}`,
          result.status,
        );
      } else if (provider === "openai") {
        url = "https://api.openai.com/v1/models";
        headers = { Authorization: "Bearer " + key };
      } else if (provider === "elevenlabs") {
        url = "https://api.elevenlabs.io/v1/voices";
        headers = { "xi-api-key": key };
      } else if (provider === "azure" && config.ttsRegion) {
        url =
          "https://" +
          config.ttsRegion +
          ".tts.speech.microsoft.com/cognitiveservices/voices/list";
        headers = { "Ocp-Apim-Subscription-Key": key };
      } else if (provider === "local")
        return finish(
          true,
          true,
          "本地 TTS 不需要远程鉴权；将在首次合成时验证声音",
          200,
        );
      else
        return finish(
          false,
          false,
          "该 TTS 需要合成短音频才能验证；当前未自动产生计费调用",
          0,
        );
    }
    if (!url || !validGateway(url))
      return finish(false, false, "端点格式无效或不允许不安全的远程 HTTP", 0);
    const response = await net.fetch(url, { headers, signal: timeoutSignal() });
    const ok = response.ok;
    return finish(
      ok,
      ok,
      ok
        ? "真实端点响应且鉴权通过"
        : "端点已响应，但鉴权失败 HTTP " + response.status,
      response.status,
    );
  } catch (error) {
    return finish(false, false, error.message || "连接测试失败", 0);
  }
});

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

ipcMain.handle("nexus:hotspots:sync", async () => {
  const result = {
    ok: false,
    global: [],
    weibo: [],
    checkedAt: Date.now(),
    errors: [],
  };
  try {
    const response = await net.fetch(
      "https://trends.google.com/trending/rss?geo=US",
      { signal: timeoutSignal() },
    );
    const xml = await response.text();
    result.global = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 15)
      .map((match) => {
        const block = match[1];
        const title = decodeXml(
          block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "Global trend",
        );
        const link = decodeXml(
          block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
            "https://trends.google.com/trending",
        );
        const traffic = decodeXml(
          block.match(
            /<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/,
          )?.[1] || "",
        );
        return {
          title,
          link,
          detail: traffic ? traffic + " searches" : "Google Trends",
        };
      });
  } catch (error) {
    result.errors.push("全球趋势：" + error.message);
  }
  try {
    const response = await net.fetch("https://s.weibo.com/top/summary", {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: timeoutSignal(),
    });
    const html = await response.text();
    result.weibo = [
      ...html.matchAll(
        /<td class="td-02[^"]*">[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
      ),
    ]
      .slice(0, 15)
      .map((match) => ({
        title: decodeXml(match[2].replace(/<[^>]+>/g, "").trim()),
        link: new URL(match[1], "https://s.weibo.com").toString(),
        detail: "微博热搜",
      }))
      .filter((item) => item.title);
  } catch (error) {
    result.errors.push("微博热搜：" + error.message);
  }
  result.ok = result.global.length > 0 || result.weibo.length > 0;
  return result;
});

ipcMain.handle("nexus:search:run", async (_event, query, config = {}) => {
  const errors = [];
  const cleanQuery = String(query || "")
    .trim()
    .slice(0, 500);
  if (!cleanQuery) return { ok: false, results: [], errors: ["搜索词为空"] };
  const serper = await decryptSecret("search.serper");
  if (serper)
    try {
      const response = await net.fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": serper },
        body: JSON.stringify({ q: cleanQuery, num: 10 }),
        signal: timeoutSignal(),
      });
      const data = await response.json();
      const results = (data.organic || []).map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet || "",
        source: "Serper",
      }));
      if (results.length)
        return { ok: true, provider: "Serper", tier: 1, results, errors };
    } catch (error) {
      errors.push("Serper: " + error.message);
    }
  const brave = await decryptSecret("search.brave");
  if (brave)
    try {
      const response = await net.fetch(
        "https://api.search.brave.com/res/v1/web/search?q=" +
          encodeURIComponent(cleanQuery) +
          "&count=10",
        {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": brave,
          },
          signal: timeoutSignal(),
        },
      );
      const data = await response.json();
      const results = (data.web?.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description || "",
        source: "Brave",
      }));
      if (results.length)
        return { ok: true, provider: "Brave", tier: 1, results, errors };
    } catch (error) {
      errors.push("Brave: " + error.message);
    }
  const tavily = await decryptSecret("search.tavily");
  if (tavily)
    try {
      const response = await net.fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: tavily,
          query: cleanQuery,
          max_results: 10,
          search_depth: "basic",
        }),
        signal: timeoutSignal(),
      });
      const data = await response.json();
      const results = (data.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content || "",
        source: "Tavily",
      }));
      if (results.length)
        return { ok: true, provider: "Tavily", tier: 1, results, errors };
    } catch (error) {
      errors.push("Tavily: " + error.message);
    }
  if (config.searxngUrl && validGateway(config.searxngUrl))
    try {
      const base = String(config.searxngUrl).replace(/\/$/, "");
      const response = await net.fetch(
        base + "/search?format=json&q=" + encodeURIComponent(cleanQuery),
        { signal: timeoutSignal() },
      );
      const data = await response.json();
      const results = (data.results || []).slice(0, 10).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content || "",
        source: "SearXNG",
      }));
      if (results.length)
        return { ok: true, provider: "SearXNG", tier: 1, results, errors };
    } catch (error) {
      errors.push("SearXNG: " + error.message);
    }
  const jinaKey = await decryptSecret("search.jina");
  const fallback = await Promise.allSettled([
    net
      .fetch(
        "https://www.bing.com/search?format=rss&q=" +
          encodeURIComponent(cleanQuery),
        { signal: timeoutSignal() },
      )
      .then((response) => response.text())
      .then((xml) =>
        [
          ...xml.matchAll(
            /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/g,
          ),
        ]
          .slice(0, 6)
          .map((match) => ({
            title: decodeXml(match[1]),
            url: decodeXml(match[2]),
            snippet: decodeXml(match[3]).replace(/<[^>]+>/g, ""),
            source: "Bing",
          })),
      ),
    net
      .fetch("https://s.jina.ai/?q=" + encodeURIComponent(cleanQuery), {
        headers: jinaKey
          ? { Authorization: "Bearer " + jinaKey, Accept: "application/json" }
          : { Accept: "application/json" },
        signal: timeoutSignal(),
      })
      .then((response) => response.json())
      .then((data) =>
        (data.data || []).slice(0, 6).map((item) => ({
          title: item.title || item.url,
          url: item.url,
          snippet: item.description || item.content || "",
          source: "Jina",
        })),
      ),
    net
      .fetch(
        "https://api.duckduckgo.com/?format=json&no_html=1&q=" +
          encodeURIComponent(cleanQuery),
        { signal: timeoutSignal() },
      )
      .then((response) => response.json())
      .then((data) =>
        (data.RelatedTopics || [])
          .flatMap((item) => item.Topics || [item])
          .filter((item) => item.FirstURL)
          .slice(0, 6)
          .map((item) => ({
            title: item.Text || item.FirstURL,
            url: item.FirstURL,
            snippet: item.Text || "",
            source: "DuckDuckGo",
          })),
      ),
  ]);
  const results = fallback.flatMap((item) =>
    item.status === "fulfilled" ? item.value : [],
  );
  fallback.forEach((item, index) => {
    if (item.status === "rejected")
      errors.push(
        ["Bing", "Jina", "DuckDuckGo"][index] + ": " + item.reason?.message,
      );
  });
  return {
    ok: results.length > 0,
    provider: results.length ? "Bing + Jina + DuckDuckGo" : undefined,
    tier: 2,
    results,
    errors,
  };
});

ipcMain.handle(
  "nexus:search:test-provider",
  async (_event, provider, config = {}) => {
    const started = performance.now();
    try {
      let response;
      if (provider === "serper") {
        const key = await decryptSecret("search.serper");
        if (!key) throw new Error("尚未保存 Serper Key");
        response = await net.fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key },
          body: JSON.stringify({ q: "NEXUS agent", num: 1 }),
          signal: timeoutSignal(),
        });
      } else if (provider === "brave") {
        const key = await decryptSecret("search.brave");
        if (!key) throw new Error("尚未保存 Brave Key");
        response = await net.fetch(
          "https://api.search.brave.com/res/v1/web/search?q=NEXUS%20agent&count=1",
          {
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": key,
            },
            signal: timeoutSignal(),
          },
        );
      } else if (provider === "tavily") {
        const key = await decryptSecret("search.tavily");
        if (!key) throw new Error("尚未保存 Tavily Key");
        response = await net.fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: key,
            query: "NEXUS agent",
            max_results: 1,
          }),
          signal: timeoutSignal(),
        });
      } else if (provider === "jina") {
        const key = await decryptSecret("search.jina");
        response = await net.fetch("https://s.jina.ai/?q=NEXUS%20agent", {
          headers: key ? { Authorization: "Bearer " + key } : {},
          signal: timeoutSignal(),
        });
      } else if (provider === "searxng") {
        if (!config.searxngUrl || !validGateway(config.searxngUrl))
          throw new Error("SearXNG URL 无效");
        response = await net.fetch(
          String(config.searxngUrl).replace(/\/$/, "") +
            "/search?format=json&q=NEXUS%20agent",
          { signal: timeoutSignal() },
        );
      } else throw new Error("未知搜索服务商");
      return {
        ok: response.ok,
        authenticated: response.ok,
        status: response.status,
        latency: Math.round(performance.now() - started),
        detail: response.ok ? "真实搜索请求成功" : "HTTP " + response.status,
      };
    } catch (error) {
      return {
        ok: false,
        authenticated: false,
        latency: Math.round(performance.now() - started),
        detail: error.message || "测试失败",
      };
    }
  },
);

ipcMain.handle("nexus:background:import", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "背景媒体",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov"],
      },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const source = result.filePaths[0];
  const extension = path.extname(source).toLowerCase();
  const target = path.join(
    app.getPath("userData"),
    `scene-background${extension}`,
  );
  await fs.copyFile(source, target);
  await fs.writeFile(
    path.join(app.getPath("userData"), "background.json"),
    JSON.stringify({ path: target, extension }),
  );
  return {
    url: `nexus-media://background/current?v=${Date.now()}`,
    type: [".mp4", ".webm", ".mov"].includes(extension) ? "video" : "image",
  };
});

function planFilePath() {
  return path.join(app.getPath("documents"), "NEXUS", "plans", "plans.md");
}

ipcMain.handle("nexus:plans:load", async () => {
  const file = planFilePath();
  try {
    const markdown = await fs.readFile(file, "utf8");
    const encoded = markdown.match(
      /<!-- NEXUS_PLAN_DATA\n([\s\S]*?)\n-->/,
    )?.[1];
    return { ok: true, file, plans: encoded ? JSON.parse(encoded) : [] };
  } catch (error) {
    if (error.code !== "ENOENT")
      return { ok: false, file, plans: [], error: error.message };
    return { ok: true, file, plans: [] };
  }
});

ipcMain.handle("nexus:plans:save", async (_event, value) => {
  const plans = Array.isArray(value)
    ? value.slice(0, 1000).map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        title: String(item.title || "").slice(0, 500),
        done: Boolean(item.done),
        due: String(item.due || ""),
        remindMinutes: Math.max(0, Number(item.remindMinutes) || 0),
        progress: Math.max(0, Math.min(100, Number(item.progress) || 0)),
        completedAt: item.completedAt ? String(item.completedAt) : "",
      }))
    : [];
  const file = planFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const sections = plans
    .map((item) =>
      [
        "## " + (item.done ? "[x] " : "[ ] ") + item.title,
        "- ID: " + item.id,
        "- 截止时间: " + (item.due || "未设置"),
        "- 提前提醒: " + item.remindMinutes + " 分钟",
        "- 完成进度: " + item.progress + "%",
        "- 实际完成: " + (item.completedAt || "未完成"),
      ].join("\n"),
    )
    .join("\n\n");
  const markdown =
    "# NEXUS 计划清单\n\n> 此文件由 NEXUS 自动维护。可阅读和备份；请在应用内修改结构化字段。\n\n" +
    (sections || "暂无计划。") +
    "\n\n<!-- NEXUS_PLAN_DATA\n" +
    JSON.stringify(plans, null, 2) +
    "\n-->\n";
  await fs.writeFile(file, markdown, "utf8");
  return { ok: true, file };
});

ipcMain.handle("nexus:plans:open-directory", async () => {
  const directory = path.dirname(planFilePath());
  await fs.mkdir(directory, { recursive: true });
  const error = await shell.openPath(directory);
  return { ok: !error, directory, error };
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#03080c",
    title: "NEXUS Voice Console",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(directory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.on("enter-full-screen", () => {
    window.webContents.send("nexus:window:fullscreen-changed", true);
  });
  window.on("leave-full-screen", () => {
    window.webContents.send("nexus:window:fullscreen-changed", false);
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      event.preventDefault();
      void setImmersive(window, !isImmersive(window));
    }
    if (
      input.type === "keyDown" &&
      input.key === "Escape" &&
      isImmersive(window)
    ) {
      event.preventDefault();
      void setImmersive(window, false);
    }
  });
  window.loadFile(path.join(directory, "..", "dist-desktop", "index.html"));
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  protocol.handle("nexus-media", async () => {
    try {
      const meta = JSON.parse(
        await fs.readFile(
          path.join(app.getPath("userData"), "background.json"),
          "utf8",
        ),
      );
      return net.fetch(pathToFileURL(meta.path).toString());
    } catch {
      return new Response("Background not found", { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "media");
    },
  );
  harnessSupervisor = new HarnessSupervisor({
    userDataPath: app.getPath("userData"),
    appRoot,
    defaultWorkspace: path.join(app.getPath("documents"), "NEXUS Workspace"),
    getSecret: decryptSecret,
    notify: (channel, payload) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed())
          window.webContents.send(`nexus:harness:${channel}`, payload);
      }
    },
  });
  void harnessSupervisor.init();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  const shutdown = [...voiceSessions.values()].map((voice) => voice.close());
  voiceSessions.clear();
  if (harnessSupervisor) shutdown.push(harnessSupervisor.shutdown());
  void Promise.allSettled(shutdown).finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
