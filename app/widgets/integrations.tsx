"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  defaultHermesRole,
  generateHermesSkill,
  type HermesRole,
} from "../core/hermes-skill";
import type { NexusEvent } from "../core/plugin-sdk";
import { SecretField, useSecretVault } from "../components/secret-field";

type ProbeResult = {
  ok: boolean;
  reachable?: boolean;
  authenticated?: boolean;
  latency?: number;
  checkedAt?: number;
  error?: string;
  endpoint?: string;
  version?: string;
  route?: string;
  gatewayRunning?: boolean;
};
type FeishuSync = {
  ok: boolean;
  calendars: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  weekly: string | null;
  tasks: Array<Record<string, unknown>>;
  access: { tenant: boolean; tasks: boolean };
  errors: string[];
};
type DesktopBridge = {
  desktop?: boolean;
  secrets?: { set(key: string, value: string): Promise<boolean> };
  connections?: { probeHermes(endpoint: string): Promise<ProbeResult> };
  feishu?: {
    test(appId: string): Promise<ProbeResult>;
    sync(config: Record<string, string>): Promise<FeishuSync>;
  };
  harness?: {
    status(): Promise<HarnessStatus>;
    configure(config: HarnessConfig): Promise<HarnessStatus>;
    start(): Promise<HarnessStatus>;
    stop(): Promise<HarnessStatus>;
    restart(): Promise<HarnessStatus>;
    onStatus(callback: (status: HarnessStatus) => void): () => void;
  };
};

type HarnessConfig = {
  enabled: boolean;
  autoStart: boolean;
  mode: "managed" | "external";
  endpoint: string;
  cwd: string;
  provider: string;
  model: string;
  sessionId?: string;
};

type HarnessStatus = {
  phase: string;
  online: boolean;
  managed: boolean;
  endpoint: string;
  sessionId: string;
  pid: number | null;
  version: string;
  latency: number | null;
  lastError: string;
  restartAttempt: number;
  config: HarnessConfig;
};

function bridge() {
  return (window as unknown as { nexusDesktop?: DesktopBridge }).nexusDesktop;
}

type Connection = {
  id: string;
  name: string;
  state: "online" | "offline" | "configured" | "checking" | "permission";
  detail: string;
  latency?: number;
};

export function ConnectionCenterWidget() {
  const [items, setItems] = useState<Connection[]>([]);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    const provider = JSON.parse(
      localStorage.getItem("nexus-provider-config") || "{}",
    ) as { hermes?: string; endpoint?: string; appId?: string };
    const feishu = JSON.parse(
      localStorage.getItem("nexus-feishu-config") || "{}",
    ) as { appId?: string };
    const next: Connection[] = [
      {
        id: "network",
        name: "网络",
        state: navigator.onLine ? "online" : "offline",
        detail: navigator.onLine ? "浏览器网络事件：可用" : "系统报告已断网",
      },
      {
        id: "desktop",
        name: "桌面桥接",
        state: bridge()?.desktop ? "online" : "offline",
        detail: bridge()?.desktop ? "Electron IPC 已响应" : "浏览器预览模式",
      },
    ];
    if (bridge()?.harness) {
      try {
        const harness = await bridge()!.harness!.status();
        next.push({
          id: "harness",
          name: "智能体中枢",
          state: harness.online ? "online" : harness.phase === "starting" ? "checking" : "offline",
          detail: harness.online
            ? `${harness.version || "Harness"} · ${harness.latency ?? "—"} ms · ${harness.managed ? "应用托管" : "外部服务"}`
            : harness.lastError || `当前状态：${harness.phase}`,
          latency: harness.latency ?? undefined,
        });
      } catch (error) {
        next.push({
          id: "harness",
          name: "智能体中枢",
          state: "offline",
          detail: error instanceof Error ? error.message : "状态读取失败",
        });
      }
    }
    try {
      const permission = await navigator.permissions?.query({
        name: "microphone" as PermissionName,
      });
      next.push({
        id: "mic",
        name: "麦克风",
        state:
          permission?.state === "granted"
            ? "online"
            : permission?.state === "denied"
              ? "offline"
              : "permission",
        detail:
          permission?.state === "granted"
            ? "权限已授予"
            : permission?.state === "denied"
              ? "权限被拒绝"
              : "等待用户授权",
      });
    } catch {
      next.push({
        id: "mic",
        name: "麦克风",
        state: "permission",
        detail: "需要主动检测权限",
      });
    }
    if (provider.hermes && bridge()?.connections) {
      const result = await bridge()!.connections!.probeHermes(provider.hermes);
      next.push({
        id: "hermes",
        name: "Hermes Agent",
        state: result.ok && result.authenticated ? "online" : "offline",
        detail: result.ok
          ? `真实响应 · Hermes ${result.version || "已识别"} · ${result.endpoint || provider.hermes} · ${result.latency} ms`
          : result.error || "无响应",
        latency: result.latency,
      });
    } else
      next.push({
        id: "hermes",
        name: "Hermes Agent",
        state: "configured",
        detail: provider.hermes ? "仅桌面版可执行真实探测" : "尚未配置 Gateway",
      });
    next.push({
      id: "doubao",
      name: "豆包 / 火山引擎",
      state: provider.endpoint && provider.appId ? "configured" : "offline",
      detail:
        provider.endpoint && provider.appId
          ? "已配置 · 尚未发起计费 API 请求"
          : "Endpoint 或 App ID 未配置",
    });
    if (feishu.appId && bridge()?.feishu) {
      const result = await bridge()!.feishu!.test(feishu.appId);
      next.push({
        id: "feishu",
        name: "飞书开放平台",
        state: result.authenticated ? "online" : "offline",
        detail: result.authenticated
          ? `真实鉴权成功 · ${result.latency} ms`
          : result.error || "鉴权失败",
        latency: result.latency,
      });
    } else
      next.push({
        id: "feishu",
        name: "飞书开放平台",
        state: feishu.appId ? "configured" : "offline",
        detail: feishu.appId ? "请在桌面版检测" : "尚未配置应用",
      });
    setItems(next);
    setChecking(false);
  }

  useEffect(() => {
    const starter = window.setTimeout(check, 0);
    const timer = window.setInterval(check, 30000);
    return () => {
      window.clearTimeout(starter);
      window.clearInterval(timer);
    };
  }, []);
  return (
    <div className="connection-center">
      <div className="connection-summary">
        <strong>
          {items.filter((item) => item.state === "online").length}
        </strong>
        <span>个真实在线连接</span>
        <button onClick={check} disabled={checking}>
          {checking ? "检测中…" : "重新检测"}
        </button>
      </div>
      <div className="connection-list">
        {items.map((item) => (
          <div key={item.id} className={`connection-row state-${item.state}`}>
            <i />
            <span>
              <b>{item.name}</b>
              <small>{item.detail}</small>
            </span>
            <em>
              {item.state === "online"
                ? "ONLINE"
                : item.state === "configured"
                  ? "CONFIG"
                  : item.state === "permission"
                    ? "AUTH"
                    : "OFFLINE"}
            </em>
          </div>
        ))}
      </div>
      <p className="truth-note">
        只有收到真实网络响应并通过鉴权的连接才显示 ONLINE。
      </p>
    </div>
  );
}

const defaultHarnessConfig: HarnessConfig = {
  enabled: true,
  autoStart: true,
  mode: "managed",
  endpoint: "",
  cwd: "",
  provider: "",
  model: "",
};

export function HarnessSettings() {
  const [config, setConfig] = useState<HarnessConfig>(defaultHarnessConfig);
  const [runtime, setRuntime] = useState<HarnessStatus | null>(null);
  const secretVault = useSecretVault(["harness.deepseekApiKey"] as const);
  const [notice, setNotice] = useState("正在读取中枢状态…");

  useEffect(() => {
    const harness = bridge()?.harness;
    if (!harness) {
      queueMicrotask(() => setNotice("中枢管理只在桌面安装版可用"));
      return;
    }
    let active = true;
    const apply = (status: HarnessStatus) => {
      if (!active) return;
      setRuntime(status);
      setConfig(status.config);
      setNotice(
        status.online
          ? `真实在线 · ${status.version} · ${status.latency ?? "—"} ms`
          : status.lastError || `当前状态：${status.phase}`,
      );
    };
    const off = harness.onStatus(apply);
    void harness.status().then(apply).catch((error) =>
      setNotice(error instanceof Error ? error.message : "状态读取失败"),
    );
    return () => {
      active = false;
      off();
    };
  }, []);

  async function save() {
    const desktop = bridge();
    if (!desktop?.harness) {
      setNotice("请在桌面安装版中保存中枢配置");
      return;
    }
    setNotice("正在保存并重启中枢…");
    try {
      const savedCount = await secretVault.persist();
      const next = await desktop.harness.configure(config);
      setRuntime(next);
      setNotice(
        next.online
          ? `配置生效，中枢真实在线${savedCount ? " · Key 已加密保存并记住" : ""}`
          : next.lastError || next.phase,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "配置保存失败");
    }
  }

  async function command(action: "start" | "stop" | "restart") {
    const harness = bridge()?.harness;
    if (!harness) return;
    setNotice(action === "stop" ? "正在停止…" : "正在启动中枢…");
    const next = await harness[action]();
    setRuntime(next);
    setNotice(next.online ? "中枢真实在线" : next.lastError || next.phase);
  }

  return (
    <section className="harness-settings">
      <div className="provider-badge">
        <span>DEEPSEEK HARNESS · ORCHESTRATION KERNEL</span>
        <b>智能体调度中枢</b>
        <small>会话、工具、权限、工作流和子智能体由独立后台进程承载</small>
      </div>
      <div className={`harness-runtime-card ${runtime?.online ? "online" : "offline"}`}>
        <i />
        <span>
          <b>{runtime?.online ? "真实在线" : "未连接"}</b>
          <small>{notice}</small>
        </span>
        <em>{runtime?.pid ? `PID ${runtime.pid}` : runtime?.phase || "OFFLINE"}</em>
      </div>
      <div className="setting-grid">
        <label>
          运行方式
          <select
            value={config.mode}
            onChange={(event) =>
              setConfig({ ...config, mode: event.target.value as HarnessConfig["mode"] })
            }
          >
            <option value="managed">应用托管（推荐）</option>
            <option value="external">连接已有 Harness</option>
          </select>
        </label>
        <label>
          工作目录
          <input
            value={config.cwd}
            onChange={(event) => setConfig({ ...config, cwd: event.target.value })}
            placeholder="留空使用 NEXUS Workspace"
          />
        </label>
        {config.mode === "external" && (
          <label>
            Harness 地址
            <input
              value={config.endpoint}
              onChange={(event) => setConfig({ ...config, endpoint: event.target.value })}
              placeholder="http://127.0.0.1:3080"
            />
          </label>
        )}
        <label>
          Provider 路由（选填）
          <input
            value={config.provider}
            onChange={(event) => setConfig({ ...config, provider: event.target.value })}
            placeholder="deepseek-official"
          />
        </label>
        <label>
          模型 ID（选填）
          <input
            value={config.model}
            onChange={(event) => setConfig({ ...config, model: event.target.value })}
            placeholder="留空使用 Harness 默认模型"
          />
        </label>
        <SecretField
          id="harness-deepseek-key"
          label="DeepSeek API Key"
          value={secretVault.values["harness.deepseekApiKey"] || ""}
          saved={secretVault.saved["harness.deepseekApiKey"]}
          loading={secretVault.loading}
          onChange={(value) => secretVault.setValue("harness.deepseekApiKey", value)}
        />
      </div>
      <div className="harness-options">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
          />
          启用智能体中枢
        </label>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={config.autoStart}
            onChange={(event) => setConfig({ ...config, autoStart: event.target.checked })}
          />
          启动应用时自动连接并自修复
        </label>
      </div>
      <div className="role-actions">
        <button className="accent" onClick={() => void save()}>保存并应用</button>
        <button onClick={() => void command("start")}>启动</button>
        <button onClick={() => void command("restart")}>重启</button>
        <button onClick={() => void command("stop")}>停止</button>
      </div>
      <p className="truth-note">
        ONLINE 只代表 Host API、两条实时事件流和心跳均已真实连通；未配置密钥时中枢可启动，但模型任务会明确失败。
      </p>
    </section>
  );
}

export function FeishuWidget() {
  const initial = useMemo(
    () =>
      JSON.parse(localStorage.getItem("nexus-feishu-config") || "{}") as {
        appId?: string;
        chatId?: string;
        weeklyDocumentId?: string;
      },
    [],
  );
  const [config, setConfig] = useState({
    appId: initial.appId || "",
    chatId: initial.chatId || "",
    weeklyDocumentId: initial.weeklyDocumentId || "",
  });
  const [secret, setSecret] = useState("");
  const [userToken, setUserToken] = useState("");
  const [status, setStatus] = useState("等待配置真实飞书自建应用");
  const [data, setData] = useState<FeishuSync | null>(null);
  const [tab, setTab] = useState<"tasks" | "weekly" | "messages" | "calendars">(
    "tasks",
  );

  async function saveAndTest() {
    localStorage.setItem("nexus-feishu-config", JSON.stringify(config));
    if (!bridge()?.feishu || !bridge()?.secrets) {
      setStatus("浏览器预览不能保存密钥，请使用桌面安装版");
      return;
    }
    if (secret) await bridge()!.secrets!.set("feishu.appSecret", secret);
    if (userToken)
      await bridge()!.secrets!.set("feishu.userAccessToken", userToken);
    setStatus("正在执行真实鉴权…");
    const result = await bridge()!.feishu!.test(config.appId);
    setStatus(
      result.authenticated
        ? `鉴权成功 · ${result.latency} ms`
        : `连接失败：${result.error}`,
    );
  }
  async function sync() {
    if (!bridge()?.feishu) {
      setStatus("同步仅在桌面安装版可用");
      return;
    }
    setStatus("正在读取飞书开放接口…");
    const result = await bridge()!.feishu!.sync(config);
    setData(result);
    setStatus(
      result.ok
        ? `同步完成${result.errors.length ? ` · ${result.errors.length} 项需要处理` : ""}`
        : result.errors.join("；"),
    );
  }
  const taskTitle = (item: Record<string, unknown>) =>
    String(item.summary || item.name || item.title || "未命名任务");
  const messageText = (item: Record<string, unknown>) => {
    const body = item.body as { content?: string } | undefined;
    try {
      const parsed = JSON.parse(body?.content || "{}");
      return String(parsed.text || body?.content || "消息");
    } catch {
      return String(body?.content || "消息");
    }
  };
  return (
    <div className="feishu-widget">
      <div className="feishu-config">
        <div className="feishu-fields">
          <input
            value={config.appId}
            onChange={(event) =>
              setConfig({ ...config, appId: event.target.value })
            }
            placeholder="App ID"
          />
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="App Secret（留空不覆盖）"
          />
          <input
            value={config.chatId}
            onChange={(event) =>
              setConfig({ ...config, chatId: event.target.value })
            }
            placeholder="群聊 Chat ID（可选）"
          />
          <input
            value={config.weeklyDocumentId}
            onChange={(event) =>
              setConfig({ ...config, weeklyDocumentId: event.target.value })
            }
            placeholder="周报文档 ID（可选）"
          />
          <input
            type="password"
            value={userToken}
            onChange={(event) => setUserToken(event.target.value)}
            placeholder="User Access Token（任务必需）"
          />
        </div>
        <div className="feishu-actions">
          <button onClick={saveAndTest}>保存并鉴权</button>
          <button className="accent" onClick={sync}>
            同步数据
          </button>
        </div>
        <small>{status}</small>
      </div>
      <div className="feishu-tabs">
        {(["tasks", "weekly", "messages", "calendars"] as const).map((key) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {key === "tasks"
              ? "计划 / 任务"
              : key === "weekly"
                ? "周报"
                : key === "messages"
                  ? "消息"
                  : "日历"}
          </button>
        ))}
      </div>
      <div className="feishu-content">
        {!data && (
          <div className="empty-state">
            配置后点击“同步数据”，此处只展示飞书真实返回内容
          </div>
        )}
        {data && tab === "tasks" && (
          <>
            {!data.access.tasks && (
              <div className="access-alert">任务 API 需要飞书用户授权令牌</div>
            )}
            {data.tasks.map((item, index) => (
              <div
                className="feishu-item"
                key={String(item.guid || item.id || index)}
              >
                <b>{taskTitle(item)}</b>
                <small>{String(item.completed_at ? "已完成" : "待处理")}</small>
              </div>
            ))}
          </>
        )}
        {data && tab === "weekly" && (
          <pre className="weekly-report">
            {data.weekly || "未配置周报文档，或当前应用无权限"}
          </pre>
        )}
        {data && tab === "messages" && (
          <>
            {data.messages.map((item, index) => (
              <div
                className="feishu-item"
                key={String(item.message_id || index)}
              >
                <b>{messageText(item)}</b>
                <small>{String(item.create_time || "")}</small>
              </div>
            ))}
            {!data.messages.length && (
              <div className="empty-state">
                没有读取到消息；请配置 Chat ID 与机器人权限
              </div>
            )}
          </>
        )}
        {data && tab === "calendars" && (
          <>
            {data.calendars.map((item, index) => (
              <div
                className="feishu-item"
                key={String(item.calendar_id || index)}
              >
                <b>{String(item.summary || item.name || "日历")}</b>
                <small>{String(item.type || item.role || "")}</small>
              </div>
            ))}
          </>
        )}
        {data?.errors.map((error) => (
          <div className="sync-warning" key={error}>
            {error}
          </div>
        ))}
      </div>
    </div>
  );
}

type AvatarId = "robot" | "companion" | "creature" | "custom";
export function AvatarWidget({ speaking = false }: { speaking?: boolean }) {
  const [avatar, setAvatar] = useState<AvatarId>("robot");
  const [expression, setExpression] = useState("calm");
  const [action, setAction] = useState("idle");
  const [custom, setCustom] = useState("");
  const [customVideo, setCustomVideo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  function upload(file?: File) {
    if (!file) return;
    if (custom) URL.revokeObjectURL(custom);
    setCustom(URL.createObjectURL(file));
    setCustomVideo(file.type.startsWith("video/"));
    setAvatar("custom");
  }
  useEffect(
    () => () => {
      if (custom) URL.revokeObjectURL(custom);
    },
    [custom],
  );
  return (
    <div
      className={`avatar-widget avatar-${avatar} expression-${expression} action-${action} ${speaking ? "is-speaking" : ""}`}
    >
      <div className="avatar-stage">
        <div className="avatar-aura" />
        {avatar === "custom" && custom ? (
          customVideo ? (
            <video
              className="custom-avatar"
              src={custom}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img className="custom-avatar" src={custom} alt="自定义数字人" />
          )
        ) : (
          <div className="procedural-avatar">
            <div className="avatar-ears" />
            <div className="avatar-head">
              <i className="eye left" />
              <i className="eye right" />
              <i className="avatar-mouth" />
            </div>
            <div className="avatar-neck" />
            <div className="avatar-body">
              <i />
            </div>
          </div>
        )}
        <div className="avatar-status">
          <i />
          {speaking ? "VOICE SYNC · 口型驱动" : "IDLE · 待机呼吸"}
        </div>
      </div>
      <div className="avatar-controls">
        <div>
          {(["robot", "companion", "creature"] as AvatarId[]).map((id) => (
            <button
              key={id}
              className={avatar === id ? "active" : ""}
              onClick={() => setAvatar(id)}
            >
              {id === "robot"
                ? "机器人"
                : id === "companion"
                  ? "虚拟伙伴"
                  : "赛博生物"}
            </button>
          ))}
        </div>
        <div>
          <select
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
          >
            <option value="calm">平静</option>
            <option value="happy">开心</option>
            <option value="focused">专注</option>
            <option value="surprised">惊讶</option>
          </select>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="idle">待机</option>
            <option value="greet">招手</option>
            <option value="think">思考</option>
            <option value="scan">扫描</option>
          </select>
          <button onClick={() => inputRef.current?.click()}>上传角色</button>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/png,image/webp,image/gif,video/webm,video/mp4"
            onChange={(event) => upload(event.target.files?.[0])}
          />
        </div>
      </div>
      <p>
        支持透明 PNG/GIF/WebM；后续角色包可按表情、动作、口型资源清单独立接入。
      </p>
    </div>
  );
}

export function DecorationWidget() {
  return (
    <div className="decor-widget" aria-label="装饰轨道雷达">
      <div className="decor-rings">
        <i />
        <i />
        <i />
        <span>NEXUS</span>
      </div>
      <div className="decor-coordinates">
        LAT 31.2304
        <br />
        LON 121.4737
        <br />
        SYNC 00:00:01
      </div>
    </div>
  );
}

export function HermesRoleStudio() {
  const [role, setRole] = useState<HermesRole>(() => {
    try {
      return {
        ...defaultHermesRole,
        ...JSON.parse(localStorage.getItem("nexus-hermes-role") || "{}"),
      };
    } catch {
      return defaultHermesRole;
    }
  });
  const [notice, setNotice] = useState("修改后可生成独立 SKILL.md");
  const capabilities = [
    "research",
    "coding",
    "files",
    "planning",
    "browser",
    "knowledge",
    "communication",
  ];
  const permissions = [
    "workspace:read",
    "workspace:write",
    "network:read",
    "network:write",
    "messages:send",
    "calendar:write",
    "system:execute",
  ];
  function toggle(key: "capabilities" | "permissions", value: string) {
    const current = role[key];
    setRole({
      ...role,
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }
  function save() {
    localStorage.setItem("nexus-hermes-role", JSON.stringify(role));
    setNotice("角色、能力与权限策略已保存");
  }
  function download() {
    const content = generateHermesSkill(role);
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "SKILL.md";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("已生成 Hermes SKILL.md");
  }
  return (
    <section className="hermes-role-studio">
      <div className="provider-badge">
        <span>HERMES ROLE STUDIO</span>
        <b>角色 · 能力 · 权限</b>
        <small>中枢负责意图、审批和路由；Hermes 只执行获准的复杂任务</small>
      </div>
      <div className="setting-grid">
        <label>
          角色名称
          <input
            value={role.name}
            onChange={(event) => setRole({ ...role, name: event.target.value })}
          />
        </label>
        <label>
          审批策略
          <select
            value={role.approval}
            onChange={(event) =>
              setRole({
                ...role,
                approval: event.target.value as HermesRole["approval"],
              })
            }
          >
            <option value="strict">严格：高风险必确认</option>
            <option value="balanced">平衡：外部操作确认</option>
            <option value="autonomous">自主：仅破坏操作确认</option>
          </select>
        </label>
      </div>
      <label>
        角色性格
        <textarea
          value={role.persona}
          onChange={(event) =>
            setRole({ ...role, persona: event.target.value })
          }
        />
      </label>
      <label>
        核心职责
        <textarea
          value={role.objective}
          onChange={(event) =>
            setRole({ ...role, objective: event.target.value })
          }
        />
      </label>
      <fieldset>
        <legend>允许能力</legend>
        <div className="permission-chips">
          {capabilities.map((item) => (
            <label
              key={item}
              className={role.capabilities.includes(item) ? "selected" : ""}
            >
              <input
                type="checkbox"
                checked={role.capabilities.includes(item)}
                onChange={() => toggle("capabilities", item)}
              />
              {item}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>权限白名单</legend>
        <div className="permission-chips">
          {permissions.map((item) => (
            <label
              key={item}
              className={role.permissions.includes(item) ? "selected" : ""}
            >
              <input
                type="checkbox"
                checked={role.permissions.includes(item)}
                onChange={() => toggle("permissions", item)}
              />
              {item}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="role-actions">
        <button onClick={save}>保存角色</button>
        <button
          onClick={() =>
            navigator.clipboard
              .writeText(generateHermesSkill(role))
              .then(() => setNotice("SKILL.md 已复制"))
          }
        >
          复制 Skill
        </button>
        <button className="accent" onClick={download}>
          下载 SKILL.md
        </button>
      </div>
      <small>{notice}</small>
    </section>
  );
}

type WorldMode = "idle" | "thinking" | "working" | "waiting" | "done" | "error";
const worldAgents = [
  { id: "nexus", name: "NEXUS", color: "#59f7df", home: [49, 48] },
  { id: "hermes", name: "HERMES", color: "#9d86ff", home: [22, 28] },
  { id: "codex", name: "CODEX", color: "#67a8ff", home: [77, 27] },
  { id: "claude", name: "CLAUDE", color: "#ffaf63", home: [24, 76] },
  { id: "openclaw", name: "OPENCLAW", color: "#ff657a", home: [77, 74] },
] as const;

export function AgentWorldWidget({ events }: { events: NexusEvent[] }) {
  const [tick, setTick] = useState(0);
  const [demo, setDemo] = useState(true);
  const hasLiveTask = events.some((event) =>
    event.type.startsWith("agent.task."),
  );
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 3800);
    return () => window.clearInterval(timer);
  }, []);
  const modes: WorldMode[] = ["idle", "thinking", "working", "waiting", "done"];
  const labels: Record<WorldMode, string> = {
    idle: "待机",
    thinking: "思考",
    working: "执行",
    waiting: "等待授权",
    done: "完成",
    error: "异常",
  };
  return (
    <div className="agent-world">
      <div className="world-toolbar">
        <span>
          <i className={hasLiveTask ? "live" : ""} />
          {hasLiveTask
            ? "真实任务事件"
            : demo
              ? "演示轨迹 · 非真实任务"
              : "等待任务事件"}
        </span>
        <button onClick={() => setDemo(!demo)}>
          {demo ? "停止演示" : "演示状态"}
        </button>
      </div>
      <div className="world-map">
        <div className="world-grid" />
        <div className="world-core">
          <i />
          <span>ORCHESTRATOR</span>
        </div>
        <div className="world-zone zone-plan">PLAN</div>
        <div className="world-zone zone-build">BUILD</div>
        <div className="world-zone zone-review">REVIEW</div>
        {worldAgents.map((agent, index) => {
          const mode: WorldMode = hasLiveTask
            ? index === 0
              ? "working"
              : "idle"
            : demo
              ? modes[(tick + index) % modes.length]
              : "idle";
          const shift =
            mode === "working"
              ? [index % 2 ? 8 : -8, index % 2 ? -5 : 6]
              : mode === "thinking"
                ? [3, -3]
                : mode === "done"
                  ? [0, -8]
                  : [0, 0];
          const left = agent.home[0] + shift[0],
            top = agent.home[1] + shift[1];
          return (
            <div
              key={agent.id}
              className={"world-agent mode-" + mode}
              style={
                {
                  "--agent-color": agent.color,
                  left: left + "%",
                  top: top + "%",
                } as CSSProperties
              }
            >
              <div className="agent-trail" />
              <div className="agent-sprite">
                <i className="sprite-antenna" />
                <span className="sprite-face">
                  <b />
                  <b />
                  <em />
                </span>
                <span className="sprite-body" />
              </div>
              <div className="agent-bubble">
                {mode === "thinking"
                  ? "…"
                  : mode === "working"
                    ? "⚙"
                    : mode === "waiting"
                      ? "!"
                      : mode === "done"
                        ? "✓"
                        : "·"}
              </div>
              <label>
                <b>{agent.name}</b>
                <small>{labels[mode]}</small>
              </label>
            </div>
          );
        })}
      </div>
      <div className="world-legend">
        {Object.entries(labels)
          .slice(0, 5)
          .map(([key, label]) => (
            <span key={key} className={"legend-" + key}>
              <i />
              {label}
            </span>
          ))}
      </div>
    </div>
  );
}
