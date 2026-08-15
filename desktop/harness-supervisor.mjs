import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const RESTART_DELAYS = [1000, 3000, 7000, 15000, 30000];

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function validEndpoint(value) {
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

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

export function textFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

export class HarnessSupervisor {
  constructor({ userDataPath, appRoot, defaultWorkspace, notify, getSecret }) {
    this.userDataPath = userDataPath;
    this.appRoot = appRoot;
    this.defaultWorkspace = defaultWorkspace;
    this.notify = notify;
    this.getSecret = getSecret;
    this.configFile = path.join(userDataPath, "harness-config.json");
    this.harnessHome = path.join(userDataPath, "deepseek-harness");
    this.config = {
      enabled: true,
      autoStart: true,
      mode: "managed",
      endpoint: "",
      cwd: defaultWorkspace,
      provider: "",
      model: "",
      sessionId: "",
    };
    this.state = {
      phase: "stopped",
      online: false,
      managed: true,
      endpoint: "",
      sessionId: "",
      pid: null,
      version: "",
      latency: null,
      lastError: "",
      restartAttempt: 0,
      checkedAt: Date.now(),
    };
    this.child = null;
    this.intentionalStop = false;
    this.restartTimer = null;
    this.heartbeatTimer = null;
    this.sockets = new Set();
    this.startPromise = null;
    this.stoppingPromise = null;
  }

  async init() {
    await fs.mkdir(this.harnessHome, { recursive: true });
    await fs.mkdir(this.defaultWorkspace, { recursive: true });
    try {
      const stored = JSON.parse(await fs.readFile(this.configFile, "utf8"));
      this.config = this.normalizeConfig({ ...this.config, ...stored });
    } catch {
      await this.saveConfig();
    }
    this.publish();
    if (this.config.enabled && this.config.autoStart) void this.start();
    return this.status();
  }

  normalizeConfig(input = {}) {
    const mode = input.mode === "external" ? "external" : "managed";
    return {
      enabled: input.enabled !== false,
      autoStart: input.autoStart !== false,
      mode,
      endpoint:
        typeof input.endpoint === "string" && validEndpoint(input.endpoint)
          ? input.endpoint.replace(/\/$/, "")
          : "",
      cwd:
        typeof input.cwd === "string" && path.isAbsolute(input.cwd)
          ? input.cwd
          : this.defaultWorkspace,
      provider: typeof input.provider === "string" ? input.provider.trim() : "",
      model: typeof input.model === "string" ? input.model.trim() : "",
      sessionId:
        typeof input.sessionId === "string" ? input.sessionId.trim() : "",
    };
  }

  async saveConfig() {
    await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2), {
      mode: 0o600,
    });
  }

  status() {
    return { ...this.state, config: { ...this.config } };
  }

  publish() {
    this.state.checkedAt = Date.now();
    this.notify("status", this.status());
  }

  setState(patch) {
    Object.assign(this.state, patch);
    this.publish();
  }

  async configure(input) {
    const previous = JSON.stringify(this.config);
    this.config = this.normalizeConfig({ ...this.config, ...input });
    await fs.mkdir(this.config.cwd, { recursive: true });
    await this.saveConfig();
    if (previous !== JSON.stringify(this.config)) {
      if (this.config.enabled && this.config.autoStart) await this.restart();
      else await this.stop();
    }
    return this.status();
  }

  resolveRuntime() {
    const candidates = [];
    if (process.resourcesPath) {
      candidates.push(
        path.join(
          process.resourcesPath,
          "h",
          "r",
          "node_modules",
          "@deepseek-ai",
          "dsh",
          "lib",
          "bin.js",
        ),
      );
      candidates.push(
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "@deepseek-ai",
          "dsh",
          "lib",
          "bin.js",
        ),
      );
    }
    try {
      const manifest = require.resolve("@deepseek-ai/dsh/package.json");
      candidates.push(path.join(path.dirname(manifest), "lib", "bin.js"));
    } catch {
      // The source-checkout fallback below supplies a useful development path.
    }
    candidates.push(
      path.join(this.appRoot, "deepseek-harness", "apps", "cli", "lib", "bin.js"),
    );
    return candidates;
  }

  async existingRuntime() {
    for (const candidate of this.resolveRuntime()) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Continue through the deterministic candidate list.
      }
    }
    throw new Error(
      "DeepSeek Harness 运行时尚未安装或构建；请安装 @deepseek-ai/dsh@0.1.0-rc.6",
    );
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async startInternal() {
    if (!this.config.enabled) {
      this.setState({ phase: "disabled", online: false, lastError: "" });
      return this.status();
    }
    if (this.state.online) return this.status();
    this.intentionalStop = false;
    this.clearRestart();
    this.setState({
      phase: "starting",
      online: false,
      managed: this.config.mode === "managed",
      lastError: "",
    });
    try {
      if (this.config.mode === "external") {
        if (!validEndpoint(this.config.endpoint))
          throw new Error("外部 Harness 地址无效，仅允许 HTTPS 或本机 HTTP");
        this.state.endpoint = this.config.endpoint;
      } else {
        const runtime = await this.existingRuntime();
        const port = await freePort();
        const endpoint = `http://127.0.0.1:${port}`;
        const key = (await this.getSecret("harness.deepseekApiKey")) || "";
        const env = {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          DSH_HOME: this.harnessHome,
          ...(key ? { DEEPSEEK_API_KEY: key } : {}),
        };
        this.child = spawn(
          process.execPath,
          [
            "--expose-internals",
            runtime,
            "web",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
          ],
          {
            cwd: this.config.cwd,
            env,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        this.state.endpoint = endpoint;
        this.state.pid = this.child.pid ?? null;
        this.child.stdout?.on("data", (chunk) =>
          this.notify("log", { stream: "stdout", text: String(chunk).slice(-4000) }),
        );
        this.child.stderr?.on("data", (chunk) =>
          this.notify("log", { stream: "stderr", text: String(chunk).slice(-4000) }),
        );
        this.child.once("exit", (code, signal) => {
          this.child = null;
          this.state.pid = null;
          this.closeSockets();
          if (this.intentionalStop) return;
          this.setState({
            phase: "offline",
            online: false,
            lastError: `Harness 后台进程退出（code=${code ?? "null"}, signal=${signal ?? "none"}）`,
          });
          this.scheduleRestart();
        });
        this.child.once("error", (error) => {
          this.setState({ phase: "offline", online: false, lastError: errorText(error) });
        });
      }
      const description = await this.waitUntilReady();
      await this.connectStreams();
      this.state.restartAttempt = 0;
      this.setState({
        phase: "online",
        online: true,
        version: String(description.version || "unknown"),
        lastError: "",
      });
      this.startHeartbeat();
      return this.status();
    } catch (error) {
      this.setState({ phase: "offline", online: false, lastError: errorText(error) });
      if (this.child) await this.terminateChild();
      if (!this.intentionalStop && this.config.autoStart) this.scheduleRestart();
      return this.status();
    }
  }

  async waitUntilReady() {
    const deadline = Date.now() + 45000;
    let lastError = new Error("Harness 尚未响应");
    while (Date.now() < deadline) {
      if (this.child && this.child.exitCode !== null)
        throw new Error(`Harness 启动失败，退出码 ${this.child.exitCode}`);
      try {
        return await this.describe(2500);
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }

  async describe(timeout = 5000) {
    const started = performance.now();
    const value = await this.rpc("host.describe", {}, timeout);
    this.state.latency = Math.round(performance.now() - started);
    return value;
  }

  async rpc(method, payload, timeout = 30000) {
    if (!this.state.endpoint) throw new Error("Harness 地址尚未就绪");
    const rpcId = crypto.randomUUID();
    const response = await fetch(`${this.state.endpoint}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`Harness ${method} 请求失败：HTTP ${response.status}`);
    const envelope = await response.json();
    if (envelope.rpcId !== rpcId) throw new Error(`Harness ${method} 响应关联错误`);
    if (!envelope.result?.ok)
      throw new Error(envelope.result?.error?.message || `Harness ${method} 执行失败`);
    return envelope.result.value;
  }

  async respond(rpcId, value) {
    const response = await fetch(`${this.state.endpoint}/api/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-response",
        rpcId,
        result: { ok: true, value },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Harness 审批响应失败：HTTP ${response.status}`);
    return response.json();
  }

  async ensureSession() {
    if (this.config.sessionId) {
      this.state.sessionId = this.config.sessionId;
      return this.config.sessionId;
    }
    const created = await this.rpc("session.create", { cwd: this.config.cwd });
    this.config.sessionId = created.sessionId;
    this.state.sessionId = created.sessionId;
    await this.saveConfig();
    this.publish();
    return created.sessionId;
  }

  async send(text, mode = "queue") {
    if (!this.state.online) await this.start();
    if (!this.state.online) throw new Error(this.state.lastError || "Harness 当前离线");
    const clean = String(text || "").trim();
    if (!clean) throw new Error("消息不能为空");
    const sessionId = await this.ensureSession();
    if (this.config.provider && this.config.model) {
      await this.rpc("session.selectModel", {
        sessionId,
        provider: this.config.provider,
        model: this.config.model,
      });
    }
    const result = await this.rpc("session.prompt", {
      sessionId,
      mode: mode === "steer" ? "steer" : "queue",
      content: [{ type: "text", text: clean }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return { ...result, sessionId };
  }

  async history() {
    if (!this.state.online) return { events: [], hasMore: false };
    const sessionId = await this.ensureSession();
    return this.rpc("session.history", { sessionId, maxMessages: 100 });
  }

  async cancel() {
    const sessionId = this.config.sessionId;
    if (!sessionId || !this.state.online) return { accepted: false };
    return this.rpc("session.cancel", { sessionId });
  }

  async approve({ rpcId, approvalId, outcome }) {
    if (!this.config.sessionId) throw new Error("没有活动会话");
    if (!["allowed-once", "rejected"].includes(outcome))
      throw new Error("无效的审批结果");
    return this.respond(rpcId, {
      sessionId: this.config.sessionId,
      approvalId,
      outcome,
    });
  }

  async connectStreams() {
    this.closeSockets();
    const base = new URL(this.state.endpoint);
    const protocol = base.protocol === "https:" ? "wss:" : "ws:";
    const open = (pathname) =>
      new Promise((resolve, reject) => {
        const url = new URL(pathname, base);
        url.protocol = protocol;
        const socket = new WebSocket(url);
        this.sockets.add(socket);
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error(`Harness 事件流连接超时：${pathname}`));
        }, 8000);
        socket.addEventListener(
          "open",
          () => {
            clearTimeout(timer);
            resolve(socket);
          },
          { once: true },
        );
        socket.addEventListener(
          "error",
          () => {
            clearTimeout(timer);
            reject(new Error(`Harness 事件流连接失败：${pathname}`));
          },
          { once: true },
        );
        socket.addEventListener("message", (event) => {
          try {
            const envelope = JSON.parse(String(event.data));
            this.notify("event", envelope);
          } catch (error) {
            this.notify("log", { stream: "bridge", text: errorText(error) });
          }
        });
        socket.addEventListener("close", () => {
          this.sockets.delete(socket);
          if (this.state.online && !this.intentionalStop) {
            this.setState({ phase: "reconnecting", online: false });
            this.scheduleRestart();
          }
        });
      });
    await Promise.all([open("/api/events.mux"), open("/api/events.host")]);
  }

  closeSockets() {
    for (const socket of this.sockets) {
      try {
        socket.close();
      } catch {
        // Socket disposal is best-effort during process teardown.
      }
    }
    this.sockets.clear();
  }

  startHeartbeat() {
    clearInterval(this.heartbeatTimer);
    let failures = 0;
    this.heartbeatTimer = setInterval(async () => {
      try {
        const description = await this.describe(4000);
        failures = 0;
        this.setState({
          phase: "online",
          online: true,
          version: String(description.version || this.state.version),
          lastError: "",
        });
      } catch (error) {
        failures += 1;
        if (failures >= 3) {
          this.setState({ phase: "offline", online: false, lastError: errorText(error) });
          if (this.config.mode === "managed") void this.restart();
          else this.scheduleRestart();
        }
      }
    }, 15000);
  }

  scheduleRestart() {
    if (this.intentionalStop || !this.config.enabled || !this.config.autoStart) return;
    if (this.restartTimer) return;
    const index = Math.min(this.state.restartAttempt, RESTART_DELAYS.length - 1);
    const delay = RESTART_DELAYS[index];
    this.state.restartAttempt += 1;
    this.setState({ phase: "reconnecting", online: false });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.restart();
    }, delay);
  }

  clearRestart() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  async terminateChild() {
    const child = this.child;
    if (!child) return;
    await new Promise((resolve) => {
      let settled = false;
      let force = null;
      const done = () => {
        if (settled) return;
        settled = true;
        if (force) clearTimeout(force);
        resolve();
      };
      child.once("exit", done);
      try {
        child.kill("SIGTERM");
      } catch {
        done();
      }
      force = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // The process may have exited between the timer and this call.
        }
        done();
      }, 4000);
    });
    if (this.child === child) this.child = null;
  }

  async stop() {
    if (this.stoppingPromise) return this.stoppingPromise;
    this.stoppingPromise = this.stopInternal().finally(() => {
      this.stoppingPromise = null;
    });
    return this.stoppingPromise;
  }

  async stopInternal() {
    this.intentionalStop = true;
    this.clearRestart();
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.closeSockets();
    await this.terminateChild();
    this.setState({ phase: "stopped", online: false, pid: null, latency: null });
    return this.status();
  }

  async restart() {
    await this.stop();
    this.intentionalStop = false;
    return this.start();
  }

  async shutdown() {
    await this.stop();
  }
}
