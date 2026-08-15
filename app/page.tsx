"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import GridLayoutBase, {
  WidthProvider,
  type Layout,
} from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import { builtinPlugins, workspacePresets } from "./plugins/builtin";
import type {
  NexusEvent,
  PluginManifest,
  ThemeId,
  WidgetPlacement,
  WorkspaceDefinition,
} from "./core/plugin-sdk";
import { languageOptions, translate, type LanguageCode } from "./core/i18n";
import {
  ExternalModuleFrame,
  ModuleManager,
  readExternalModules,
  type ExternalModule,
} from "./core/module-runtime";
import {
  CalendarReminderScheduler,
  CalendarWidget,
  ChatWidget,
  HotspotsWidget,
  MemoWidget,
  ObsidianWidget,
  PlannerWidget,
  TaskbarWidget,
} from "./widgets/productivity";
import {
  ActivityLogWidget,
  HeartbeatWidget,
  TraceWidget,
} from "./widgets/observability";
import {
  AgentWorldWidget,
  AvatarWidget,
  ConnectionCenterWidget,
  DecorationWidget,
  FeishuWidget,
  HarnessSettings,
  HermesRoleStudio,
} from "./widgets/integrations";
import { ApiUsageWidget } from "./widgets/usage";
import { ProviderRegistrySettings } from "./widgets/provider-settings";
import { useRealtimeVoice } from "./core/realtime-voice";

const GridLayout = WidthProvider(GridLayoutBase);
const STORAGE_KEY = "nexus-workspaces-v3";
const LEGACY_STORAGE_KEY = "nexus-workspaces-v2";
const themeOptions: { id: ThemeId; label: string; group: string }[] = [
  { id: "cyan", label: "量子青", group: "科技" },
  { id: "violet", label: "脉冲紫", group: "科技" },
  { id: "amber", label: "情报琥珀", group: "科技" },
  { id: "crimson", label: "警戒红", group: "科技" },
  { id: "starfleet", label: "星舰指挥", group: "影视灵感" },
  { id: "galactic", label: "银河帝国", group: "影视灵感" },
  { id: "antihero", label: "反英雄红黑", group: "影视灵感" },
  { id: "heroic", label: "英雄宇宙", group: "影视灵感" },
  { id: "slate", label: "专业深灰", group: "高可读" },
  { id: "paper", label: "明亮纸面", group: "高可读" },
];
const initialEvents: NexusEvent[] = [
  {
    id: "e1",
    type: "agent.ready",
    time: "SYSTEM",
    title: "连接探测器已就绪",
    detail: "仅真实响应显示在线",
  },
  {
    id: "e2",
    type: "voice.ready",
    time: "SYSTEM",
    title: "语音模块已载入",
    detail: "等待麦克风授权",
  },
  {
    id: "e3",
    type: "plugin.loaded",
    time: "SYSTEM",
    title: "模块运行时已启动",
    detail: `${builtinPlugins.length} 个内置扩展`,
  },
];

type DialogType = "add" | "plugins" | "agents" | "settings" | null;
type SceneConfig = {
  type: "none" | "image" | "video";
  src: string;
  mediaOpacity: number;
  panelOpacity: number;
  blur: number;
  avatarMode: boolean;
};
type UiPreferences = {
  font: "system" | "modern" | "mono";
  fontSize: number;
  fontWeight: 400 | 500 | 600 | 700;
  adaptive: boolean;
  language: LanguageCode;
  surface: "glass" | "solid" | "opaque";
  brandName: string;
  brandSubtitle: string;
  brandLogo: string;
};
const defaultScene: SceneConfig = {
  type: "none",
  src: "",
  mediaOpacity: 0.46,
  panelOpacity: 0.94,
  blur: 0,
  avatarMode: false,
};
const defaultUi: UiPreferences = {
  font: "system",
  fontSize: 14,
  fontWeight: 500,
  adaptive: true,
  language: "zh-CN",
  surface: "solid",
  brandName: "NEXUS",
  brandSubtitle: "VOICE OPERATING SYSTEM",
  brandLogo: "",
};

function normalizeStoredWorkspaces(
  value: unknown,
): WorkspaceDefinition[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const themes = new Set(themeOptions.map((item) => item.id));
  const normalized = value.flatMap((entry, workspaceIndex) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<WorkspaceDefinition>;
    if (!candidate.id || !Array.isArray(candidate.widgets)) return [];
    const instanceIds = new Set<string>();
    const widgets = candidate.widgets.flatMap((entryWidget, widgetIndex) => {
      if (!entryWidget || typeof entryWidget !== "object") return [];
      const widget = entryWidget as Partial<WidgetPlacement>;
      if (!widget.widgetId) return [];
      let instanceId =
        typeof widget.instanceId === "string" && widget.instanceId
          ? widget.instanceId
          : `restored-${workspaceIndex}-${widgetIndex}`;
      if (instanceIds.has(instanceId)) instanceId += `-${widgetIndex}`;
      instanceIds.add(instanceId);
      const finite = (input: unknown, fallback: number) =>
        typeof input === "number" && Number.isFinite(input) ? input : fallback;
      const layer = Math.max(1, Math.min(3, finite(widget.layer, 1))) as
        1 | 2 | 3;
      return [
        {
          ...widget,
          instanceId,
          widgetId: widget.widgetId,
          x: Math.max(0, Math.min(11, finite(widget.x, (widgetIndex % 3) * 4))),
          y: Math.max(0, finite(widget.y, Math.floor(widgetIndex / 3) * 5)),
          w: Math.max(2, Math.min(12, finite(widget.w, 4))),
          h: Math.max(2, Math.min(14, finite(widget.h, 4))),
          layer,
        } satisfies WidgetPlacement,
      ];
    });
    return [
      {
        id: candidate.id,
        name: candidate.name || `工作空间 ${workspaceIndex + 1}`,
        shortName: candidate.shortName || `SPACE ${workspaceIndex + 1}`,
        theme: themes.has(candidate.theme as ThemeId)
          ? (candidate.theme as ThemeId)
          : "cyan",
        widgets,
      } satisfies WorkspaceDefinition,
    ];
  });
  return normalized.length ? normalized : null;
}

export default function Home() {
  const [workspaceId, setWorkspaceId] = useState("command-center");
  const [workspaces, setWorkspaces] =
    useState<WorkspaceDefinition[]>(workspacePresets);
  const [externalModules, setExternalModules] = useState<ExternalModule[]>([]);
  const workspace =
    workspaces.find((item) => item.id === workspaceId) ?? workspaces[0];
  const [editing, setEditing] = useState(false);
  const [events, setEvents] = useState(initialEvents);
  const [clock, setClock] = useState("--:--:--");
  const [dateLabel, setDateLabel] = useState("");
  const [dialog, setDialog] = useState<DialogType>(null);
  const [notice, setNotice] = useState("系统已就绪");
  const [scene, setScene] = useState<SceneConfig>(defaultScene);
  const [ui, setUi] = useState<UiPreferences>(defaultUi);
  const [fullscreen, setFullscreen] = useState(false);
  const t = (key: string) => translate(ui.language, key);
  const voice = useRealtimeVoice(log);

  useEffect(() => {
    const saved =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = normalizeStoredWorkspaces(JSON.parse(saved));
        if (!parsed) throw new Error("Invalid workspace data");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        queueMicrotask(() => setWorkspaces(parsed));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    const savedScene = localStorage.getItem("nexus-scene-config");
    if (savedScene) {
      try {
        const parsed = JSON.parse(savedScene) as Partial<SceneConfig>;
        queueMicrotask(() => setScene({ ...defaultScene, ...parsed }));
      } catch {
        localStorage.removeItem("nexus-scene-config");
      }
    }
    const savedUi = localStorage.getItem("nexus-ui-preferences");
    if (savedUi) {
      try {
        const parsed = JSON.parse(savedUi) as Partial<UiPreferences>;
        queueMicrotask(() => setUi({ ...defaultUi, ...parsed }));
      } catch {
        localStorage.removeItem("nexus-ui-preferences");
      }
    }
    queueMicrotask(() => setExternalModules(readExternalModules()));
    const modulesChanged = () => setExternalModules(readExternalModules());
    window.addEventListener("nexus-modules-changed", modulesChanged);
    const updateClock = () =>
      setClock(new Date().toLocaleTimeString(undefined, { hour12: false }));
    queueMicrotask(updateClock);
    const timer = window.setInterval(updateClock, 1000);
    const fullChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fullChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("nexus-modules-changed", modulesChanged);
      document.removeEventListener("fullscreenchange", fullChange);
    };
  }, []);

  useEffect(() => {
    const desktop = (
      window as unknown as {
        nexusDesktop?: {
          window?: {
            getFullscreen(): Promise<boolean>;
            onFullscreenChanged(callback: (value: boolean) => void): () => void;
          };
        };
      }
    ).nexusDesktop;
    if (!desktop?.window) return;
    void desktop.window.getFullscreen().then(setFullscreen);
    return desktop.window.onFullscreenChanged(setFullscreen);
  }, []);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString(ui.language, { hour12: false }));
      setDateLabel(
        now.toLocaleDateString(ui.language, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "long",
        }),
      );
    };
    queueMicrotask(update);
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [ui.language]);

  const widgetMap = useMemo(() => {
    const map = new Map<string, PluginManifest["widgets"][number]>();
    builtinPlugins.forEach((plugin) =>
      plugin.widgets.forEach((widget) => map.set(widget.id, widget)),
    );
    externalModules.forEach((module) =>
      map.set(`external:${module.manifest.id}`, {
        id: `external:${module.manifest.id}`,
        title: module.manifest.title,
        kind: "external",
        source: module.manifest.source || "EXTERNAL",
        defaultSize: module.manifest.defaultSize,
      }),
    );
    return map;
  }, [externalModules]);
  const externalMap = useMemo(
    () =>
      new Map(
        externalModules.map((module) => [
          `external:${module.manifest.id}`,
          module,
        ]),
      ),
    [externalModules],
  );

  function log(title: string, detail: string, type = "system.action") {
    setEvents((items) =>
      [
        {
          id: crypto.randomUUID(),
          type,
          time: new Date().toLocaleTimeString(ui.language, { hour12: false }),
          title,
          detail,
        },
        ...items,
      ].slice(0, 10),
    );
    setNotice(title);
  }
  function updateCurrent(
    updater: (current: WorkspaceDefinition) => WorkspaceDefinition,
  ) {
    setWorkspaces((items) => {
      const next = items.map((item) =>
        item.id === workspace.id ? updater(item) : item,
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  function updatePlacement(
    instanceId: string,
    patch: Partial<WidgetPlacement>,
  ) {
    updateCurrent((current) => ({
      ...current,
      widgets: current.widgets.map((item) =>
        item.instanceId === instanceId ? { ...item, ...patch } : item,
      ),
    }));
    setNotice("布局位置已自动保存");
  }
  function switchWorkspace(id: string) {
    const transition = (
      document as Document & {
        startViewTransition?: (callback: () => void) => void;
      }
    ).startViewTransition;
    const apply = () => {
      setWorkspaceId(id);
      setEditing(false);
    };
    if (transition) transition.call(document, apply);
    else apply();
  }
  function changeTheme(theme: ThemeId) {
    updateCurrent((current) => ({ ...current, theme }));
    log(
      "主题已更新",
      themeOptions.find((item) => item.id === theme)?.label || theme,
      "theme.changed",
    );
  }
  function persistGrid(layout: Layout) {
    const positions = new Map(layout.map((item) => [item.i, item]));
    updateCurrent((current) => ({
      ...current,
      widgets: current.widgets.map((item) => {
        const next = positions.get(item.instanceId);
        return next
          ? { ...item, x: next.x, y: next.y, w: next.w, h: next.h }
          : item;
      }),
    }));
  }
  function addWidget(widgetId: string, targetWorkspaceId = workspace.id) {
    const definition = widgetMap.get(widgetId);
    if (!definition) return;
    setWorkspaces((items) => {
      const next = items.map((current) => {
        if (current.id !== targetWorkspaceId) return current;
        const bottom = current.widgets.reduce(
          (value, item) => Math.max(value, item.y + item.h),
          0,
        );
        return {
          ...current,
          widgets: [
            ...current.widgets,
            {
              instanceId: crypto.randomUUID(),
              widgetId,
              x: 0,
              y: bottom,
              ...definition.defaultSize,
              layer: 1 as const,
            },
          ],
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setDialog(null);
    setWorkspaceId(targetWorkspaceId);
    setEditing(true);
    log(
      `已添加${definition.title}`,
      "拖动标题栏定位，拖动边缘调整宽高",
      "widget.added",
    );
  }
  function moveWidget(instanceId: string, targetWorkspaceId: string) {
    if (targetWorkspaceId === workspace.id) return;
    const placement = workspace.widgets.find(
      (item) => item.instanceId === instanceId,
    );
    if (!placement) return;
    const definition = widgetMap.get(placement.widgetId);
    const target = workspaces.find((item) => item.id === targetWorkspaceId);
    if (!target) return;
    const bottom = target.widgets.reduce(
      (value, item) => Math.max(value, item.y + item.h),
      0,
    );
    const moved: WidgetPlacement = {
      ...placement,
      x: Math.max(0, Math.min(12 - placement.w, placement.x)),
      y: bottom,
    };
    setWorkspaces((items) => {
      const next = items.map((item) => {
        if (item.id === workspace.id)
          return {
            ...item,
            widgets: item.widgets.filter(
              (widget) => widget.instanceId !== instanceId,
            ),
          };
        if (item.id === targetWorkspaceId)
          return { ...item, widgets: [...item.widgets, moved] };
        return item;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setWorkspaceId(targetWorkspaceId);
    setEditing(true);
    log(
      `已移动 ${definition?.title || "板块"}`,
      `${target.name} · 自动继承目标主题`,
      "widget.moved",
    );
  }
  function removeWidget(instanceId: string) {
    updateCurrent((current) => ({
      ...current,
      widgets: current.widgets.filter((item) => item.instanceId !== instanceId),
    }));
  }
  function saveLayout() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    setEditing(false);
    log("布局已保存", "位置、尺寸、锁定和层级已存入本机", "workspace.saved");
  }
  function resetLayout() {
    setWorkspaces(workspacePresets);
    localStorage.removeItem(STORAGE_KEY);
    setEditing(false);
    log("已恢复默认布局", "自定义位置已清除", "workspace.reset");
  }
  function updateScene(next: SceneConfig) {
    setScene(next);
    if (!next.src.startsWith("blob:"))
      localStorage.setItem("nexus-scene-config", JSON.stringify(next));
  }
  function updateUi(next: UiPreferences) {
    setUi(next);
    localStorage.setItem("nexus-ui-preferences", JSON.stringify(next));
    document.documentElement.lang = next.language;
  }
  async function toggleFullscreen() {
    const desktop = (
      window as unknown as {
        nexusDesktop?: {
          window?: {
            toggleFullscreen(): Promise<boolean>;
            getFullscreen(): Promise<boolean>;
          };
        };
      }
    ).nexusDesktop;
    if (desktop?.window) {
      const active = await desktop.window.toggleFullscreen();
      setFullscreen(active);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 160);
      return;
    }
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }

  const layout: Layout = workspace.widgets.map((item) => ({
    i: item.instanceId,
    x: Math.max(0, Math.min(11, Number.isFinite(item.x) ? item.x : 0)),
    y: Math.max(0, Number.isFinite(item.y) ? item.y : 0),
    w: Math.max(2, Math.min(12, Number.isFinite(item.w) ? item.w : 4)),
    h: Math.max(2, Math.min(14, Number.isFinite(item.h) ? item.h : 4)),
    minW: 2,
    minH: 2,
    maxW: 12,
    maxH: 14,
    static: !editing || item.locked,
  }));
  return (
    <main
      className="nexus"
      data-theme={workspace.theme}
      data-surface={ui.surface}
      data-avatar={scene.avatarMode ? "on" : "off"}
      lang={ui.language}
      style={
        {
          "--panel-alpha": scene.panelOpacity,
          "--user-font":
            ui.font === "mono"
              ? '"Cascadia Code","SFMono-Regular",monospace'
              : ui.font === "modern"
                ? 'Inter,"PingFang SC","Microsoft YaHei",sans-serif'
                : 'system-ui,-apple-system,"Segoe UI",sans-serif',
          "--user-font-size": ui.adaptive
            ? "clamp(12px, calc(9px + .3vw), 17px)"
            : `${ui.fontSize}px`,
          "--user-font-weight": ui.fontWeight,
        } as CSSProperties
      }
    >
      <CalendarReminderScheduler />
      <div
        className="scene-layer"
        style={{ opacity: scene.mediaOpacity, filter: `blur(${scene.blur}px)` }}
        aria-hidden="true"
      >
        {scene.type === "video" && scene.src && (
          <video src={scene.src} autoPlay loop muted playsInline />
        )}
        {scene.type === "image" && scene.src && <img src={scene.src} alt="" />}
      </div>
      <div className="scene-vignette" aria-hidden="true" />
      <header className="topbar">
        <button
          className="brand brand-button"
          onClick={() => setDialog("settings")}
        >
          {ui.brandLogo ? (
            <img className="brand-logo" src={ui.brandLogo} alt="" />
          ) : (
            <span className="brand-mark">
              {ui.brandName.slice(0, 1).toUpperCase() || "N"}
            </span>
          )}
          <span>
            <strong>{ui.brandName || "NEXUS"}</strong>
            <small>{ui.brandSubtitle || "VOICE OPERATING SYSTEM"}</small>
          </span>
        </button>
        <nav className="workspace-tabs" aria-label={t("workspace")}>
          {workspaces.map((item) => (
            <button
              key={item.id}
              className={workspace.id === item.id ? "active" : ""}
              onClick={() => switchWorkspace(item.id)}
            >
              {item.shortName}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="system-state">
            <span className="status-dot" /> CORE <b>{clock}</b>
            <small>{dateLabel}</small>
          </div>
          <button
            className="fullscreen-button"
            onClick={toggleFullscreen}
            title={fullscreen ? t("exitFullscreen") : t("fullscreen")}
            aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
          >
            {fullscreen ? "↙" : "⛶"}
          </button>
        </div>
      </header>
      <section className="toolbar">
        <div>
          <span className="eyebrow">{t("workspace")}</span>
          <h1>
            {workspace.name}{" "}
            <em>
              {String(
                workspaces.findIndex((item) => item.id === workspace.id) + 1,
              ).padStart(2, "0")}
            </em>
          </h1>
        </div>
        <div className="toolbar-actions">
          <select
            className="theme-select"
            value={workspace.theme}
            onChange={(event) => changeTheme(event.target.value as ThemeId)}
            aria-label={t("theme")}
          >
            {themeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.group} · {option.label}
              </option>
            ))}
          </select>
          <select
            className="language-select"
            value={ui.language}
            onChange={(event) =>
              updateUi({ ...ui, language: event.target.value as LanguageCode })
            }
            aria-label={t("language")}
          >
            {languageOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {editing && (
            <>
              <button className="control" onClick={resetLayout}>
                {t("reset")}
              </button>
              <button className="control active" onClick={saveLayout}>
                {t("save")}
              </button>
            </>
          )}
          <button
            className={editing ? "control active" : "control"}
            onClick={() => setEditing(!editing)}
          >
            {editing ? t("finish") : t("edit")}
          </button>
          <button className="control" onClick={() => setDialog("add")}>
            ＋ {t("add")}
          </button>
        </div>
      </section>
      {editing && (
        <div className="edit-banner">
          <b>自由布局模式</b>
          <span>
            拖动板块标题移动 · 拖动八个方向边缘缩放 · 可重叠悬浮 ·
            每个板块最多三层
          </span>
        </div>
      )}
      <section className="dashboard-grid" key={workspace.id}>
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={58}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          measureBeforeMount
          isDraggable={editing}
          isResizable={editing}
          draggableHandle=".widget-drag-handle"
          draggableCancel="button,input,select,textarea,iframe"
          resizeHandles={["s", "w", "e", "n", "sw", "nw", "se", "ne"]}
          compactType={null}
          preventCollision={false}
          allowOverlap={editing}
          onDragStop={persistGrid}
          onResizeStop={persistGrid}
        >
          {workspace.widgets.map((placement) => {
            const widget = widgetMap.get(placement.widgetId);
            if (!widget) return <div key={placement.instanceId} />;
            const external = externalMap.get(placement.widgetId);
            return (
              <article
                key={placement.instanceId}
                className={`panel panel-${widget.kind} ${editing ? "is-editing" : ""} ${placement.floating ? "is-floating" : ""} layer-${placement.layer || 1}`}
                style={{ zIndex: (placement.layer || 1) * 10 }}
              >
                <div className="panel-head widget-drag-handle">
                  <span>
                    <i /> {widget.title}
                  </span>
                  <small>{widget.source}</small>
                  {editing && (
                    <div className="edit-tools">
                      <button
                        onClick={() =>
                          updatePlacement(placement.instanceId, {
                            locked: !placement.locked,
                          })
                        }
                        title={placement.locked ? t("unlocked") : t("locked")}
                      >
                        {placement.locked ? "🔒" : "◇"}
                      </button>
                      <button
                        className={placement.floating ? "active" : ""}
                        onClick={() =>
                          updatePlacement(placement.instanceId, {
                            floating: !placement.floating,
                          })
                        }
                        title={t("float")}
                      >
                        ◫
                      </button>
                      <button
                        onClick={() =>
                          updatePlacement(placement.instanceId, {
                            layer: (((placement.layer || 1) % 3) + 1) as
                              1 | 2 | 3,
                          })
                        }
                        title={t("layer")}
                      >
                        L{placement.layer || 1}
                      </button>
                      <select
                        className="workspace-move-select"
                        value={workspace.id}
                        onChange={(event) =>
                          moveWidget(placement.instanceId, event.target.value)
                        }
                        title="移动到其他栏目并继承目标主题"
                      >
                        {workspaces.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.id === workspace.id
                              ? "移动栏目…"
                              : target.shortName}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeWidget(placement.instanceId)}
                        title={t("remove")}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
                <div className="panel-body">
                  {widget.kind === "voice" && (
                    <VoiceCore
                      phase={voice.phase}
                      active={voice.active}
                      transcript={voice.transcript}
                      reply={voice.reply}
                      error={voice.error}
                      onToggle={voice.toggle}
                    />
                  )}
                  {widget.kind === "agents" && (
                    <AgentPanel onConfigure={() => setDialog("agents")} />
                  )}
                  {widget.kind === "agentworld" && (
                    <AgentWorldWidget events={events} />
                  )}
                  {widget.kind === "metrics" && <MetricsPanel />}
                  {widget.kind === "usage" && <ApiUsageWidget />}
                  {widget.kind === "timeline" && <Timeline events={events} />}
                  {widget.kind === "plugins" && (
                    <PluginsPanel onOpen={() => setDialog("plugins")} />
                  )}
                  {widget.kind === "calendar" && (
                    <CalendarWidget locale={ui.language} />
                  )}
                  {widget.kind === "memo" && <MemoWidget />}
                  {widget.kind === "planner" && <PlannerWidget />}
                  {widget.kind === "chat" && <ChatWidget />}
                  {widget.kind === "taskbar" && <TaskbarWidget />}
                  {widget.kind === "hotspots" && <HotspotsWidget />}
                  {widget.kind === "obsidian" && <ObsidianWidget />}
                  {widget.kind === "activitylog" && <ActivityLogWidget />}
                  {widget.kind === "trace" && <TraceWidget />}
                  {widget.kind === "heartbeat" && <HeartbeatWidget />}
                  {widget.kind === "connections" && <ConnectionCenterWidget />}
                  {widget.kind === "feishu" && <FeishuWidget />}
                  {widget.kind === "avatar" && (
                    <AvatarWidget speaking={voice.speaking} />
                  )}
                  {widget.kind === "decoration" && <DecorationWidget />}
                  {widget.kind === "external" && external && (
                    <ExternalModuleFrame
                      module={external}
                      locale={ui.language}
                      theme={workspace.theme}
                    />
                  )}
                </div>
              </article>
            );
          })}
        </GridLayout>
        {!workspace.widgets.length && (
          <button className="empty-dashboard" onClick={() => setDialog("add")}>
            ＋ {t("add")}
          </button>
        )}
      </section>
      <footer>
        <span>NEXUS KERNEL v0.4.9</span>
        <span>MODULE API v1</span>
        <span>{notice}</span>
        <button onClick={() => setDialog("plugins")}>独立模块</button>
        <button onClick={() => setDialog("settings")}>{t("settings")}</button>
        <span className="online">● RUNTIME ONLINE</span>
      </footer>
      {dialog && (
        <Dialog
          type={dialog}
          onClose={() => setDialog(null)}
          widgetMap={widgetMap}
          workspace={workspace}
          workspaces={workspaces}
          onAdd={addWidget}
          onReset={resetLayout}
          scene={scene}
          onScene={updateScene}
          ui={ui}
          onUi={updateUi}
          theme={workspace.theme}
          onTheme={changeTheme}
          onSave={saveLayout}
        />
      )}
    </main>
  );
}

function VoiceCore({
  phase,
  active,
  transcript,
  reply,
  error,
  onToggle,
}: {
  phase: "idle" | "connecting" | "listening" | "speaking" | "error";
  active: boolean;
  transcript: string;
  reply: string;
  error: string;
  onToggle: () => void;
}) {
  const stateText = {
    idle: "待机 · 点击开始实时语音对话",
    connecting: "正在连接豆包实时语音…",
    listening: "正在聆听 · 可以直接说话",
    speaking: "NEXUS 正在语音回复 · 可随时打断",
    error: "语音连接失败 · 查看下方原因",
  }[phase];
  const displayText =
    error || reply || transcript ||
    (phase === "idle"
      ? "会话将自动同步到“对话与历史”"
      : "请直接说话，我会实时识别并语音回复");
  return (
    <div className="voice-core">
      <div
        className={active ? "orb listening" : "orb"}
        onClick={onToggle}
        role="button"
        tabIndex={0}
      >
        <div className="orbit orbit-a" />
        <div className="orbit orbit-b" />
        <div className="orb-center">
          <span>{active ? "LIVE" : "N"}</span>
        </div>
      </div>
      <div className="waveform" aria-hidden="true">
        {Array.from({ length: 31 }, (_, index) => (
          <i
            key={index}
            style={{
              height: `${12 + ((index * 17) % 45)}px`,
              animationDelay: `${index * -0.04}s`,
            }}
          />
        ))}
      </div>
      <p className="voice-state">
        <span />
        {stateText}
      </p>
      <div className="transcript">{displayText}</div>
      <button className="primary-action" onClick={onToggle}>
        {active ? "立即打断 / 停止" : "开始语音对话"}
      </button>
    </div>
  );
}
function AgentPanel({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="agent-list">
      {[
        ["H", "Hermes Agent", "Gateway 可真实探测"],
        ["C", "Codex", "适配器接口已预留"],
        ["CC", "Claude Code", "适配器接口已预留"],
        ["OC", "OpenClaw", "适配器接口已预留"],
      ].map(([icon, name, detail], index) => (
        <button
          className={`agent ${index === 0 ? "active" : ""}`}
          onClick={onConfigure}
          key={name}
        >
          <span className="agent-icon">{icon}</span>
          <span>
            <b>{name}</b>
            <small>{detail}</small>
          </span>
          <em>{index === 0 ? "PROBE" : "READY"}</em>
        </button>
      ))}
    </div>
  );
}
function MetricsPanel() {
  type Metrics = {
    ok: true;
    cpu: number;
    cpuName: string;
    cpuCores: number;
    memoryUsed: number;
    memoryTotal: number;
    gpuName: string;
    gpuStatus: Record<string, string>;
    diskUsed: number;
    diskTotal: number;
    uptimeSeconds: number;
    platform: string;
    hostname: string;
    checkedAt: number;
  };
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    const update = async () => {
      const desktop = (
        window as unknown as {
          nexusDesktop?: {
            system?: {
              metrics(): Promise<Metrics | { ok: false; error: string }>;
            };
          };
        }
      ).nexusDesktop;
      if (!desktop?.system) {
        if (active) {
          setError("桌面系统桥接未连接，请使用最新版安装程序");
          setLoading(false);
        }
        return;
      }
      try {
        const result = await desktop.system.metrics();
        if (!result.ok) throw new Error(result.error || "硬件数据读取失败");
        if (active) {
          setMetrics(result);
          setError("");
        }
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "硬件数据读取失败",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void update();
    const timer = window.setInterval(update, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey]);
  if (!metrics)
    return (
      <div className="metrics metrics-waiting">
        <div className="metrics-connect-state">
          <i className={loading ? "is-loading" : "is-error"} />
          <b>{loading ? "正在读取本机硬件状态…" : "系统监控暂不可用"}</b>
          <small>{error || "正在连接 Electron 桌面系统桥接"}</small>
          {!loading && (
            <button
              onClick={() => {
                setLoading(true);
                setRefreshKey((value) => value + 1);
              }}
            >
              重新连接
            </button>
          )}
        </div>
      </div>
    );
  const memoryPercent = Math.round(
    (metrics.memoryUsed / metrics.memoryTotal) * 100,
  );
  const memoryUsedGb = (metrics.memoryUsed / 1073741824).toFixed(1);
  const memoryTotalGb = (metrics.memoryTotal / 1073741824).toFixed(1);
  const gpuEnabled = Object.values(metrics.gpuStatus || {}).some(
    (status) => status === "enabled",
  );
  const diskPercent = metrics.diskTotal
    ? Math.round((metrics.diskUsed / metrics.diskTotal) * 100)
    : 0;
  const uptimeHours = Math.floor(metrics.uptimeSeconds / 3600);
  const cards: [string, string, string, number, string][] = [
    [
      "CPU 使用率",
      String(metrics.cpu),
      "%",
      metrics.cpu,
      `${metrics.cpuName} · ${metrics.cpuCores} 线程`,
    ],
    [
      "内存",
      memoryUsedGb,
      "GB",
      memoryPercent,
      `已用 ${memoryPercent}% · 共 ${memoryTotalGb} GB`,
    ],
    [
      "GPU 加速",
      gpuEnabled ? "已启用" : "受限",
      "",
      gpuEnabled ? 100 : 20,
      metrics.gpuName,
    ],
    [
      "系统盘",
      metrics.diskTotal ? String(diskPercent) : "不可用",
      metrics.diskTotal ? "%" : "",
      diskPercent,
      metrics.diskTotal
        ? `已用 ${(metrics.diskUsed / 1073741824).toFixed(0)} / ${(metrics.diskTotal / 1073741824).toFixed(0)} GB`
        : "当前文件系统未返回容量",
    ],
    [
      "运行时长",
      uptimeHours < 24
        ? String(uptimeHours)
        : String(Math.floor(uptimeHours / 24)),
      uptimeHours < 24 ? "小时" : "天",
      Math.min(100, (uptimeHours % 24) * (100 / 24)),
      metrics.hostname,
    ],
    [
      "系统环境",
      metrics.platform.includes("Windows") ? "Windows" : metrics.platform,
      "",
      100,
      `更新 ${new Date(metrics.checkedAt).toLocaleTimeString("zh-CN", { hour12: false })}`,
    ],
  ];
  return (
    <div className="metrics">
      {error && <div className="metrics-inline-error">连接波动：{error}</div>}
      {cards.map(([label, value, unit, percent, detail]) => (
        <div className="metric" key={String(label)}>
          <span>
            {label}
            <small>{detail}</small>
          </span>
          <strong>
            {value}
            <em>{unit}</em>
          </strong>
          <div>
            <i style={{ width: Number(percent) + "%" }} />
          </div>
        </div>
      ))}
      <button
        className="metrics-refresh"
        onClick={() => {
          setLoading(true);
          setRefreshKey((value) => value + 1);
        }}
      >
        {loading ? "刷新中…" : "立即刷新"}
      </button>
    </div>
  );
}
function Timeline({ events }: { events: NexusEvent[] }) {
  return (
    <div className="timeline">
      {events.map((event) => (
        <div key={event.id}>
          <time>{event.time}</time>
          <i />
          <p>
            <b>{event.title}</b>
            <span>{event.detail}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
function PluginsPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="plugin-list">
      <button className="open-directory" onClick={onOpen}>
        上传 / 更新独立板块 →
      </button>
      {builtinPlugins.slice(0, 5).map((plugin) => (
        <button key={plugin.id} onClick={onOpen}>
          <span className="plugin-symbol">{plugin.name[0]}</span>
          <span>
            <b>{plugin.name}</b>
            <small>
              {plugin.widgets.length} WIDGET · API {plugin.apiVersion}
            </small>
          </span>
          <em>ACTIVE</em>
        </button>
      ))}
    </div>
  );
}

function Dialog({
  type,
  onClose,
  widgetMap,
  workspace,
  workspaces,
  onAdd,
  onReset,
  scene,
  onScene,
  ui,
  onUi,
  theme,
  onTheme,
  onSave,
}: {
  type: Exclude<DialogType, null>;
  onClose: () => void;
  widgetMap: Map<string, PluginManifest["widgets"][number]>;
  workspace: WorkspaceDefinition;
  workspaces: WorkspaceDefinition[];
  onAdd: (id: string, targetWorkspaceId?: string) => void;
  onReset: () => void;
  scene: SceneConfig;
  onScene: (scene: SceneConfig) => void;
  ui: UiPreferences;
  onUi: (ui: UiPreferences) => void;
  theme: ThemeId;
  onTheme: (theme: ThemeId) => void;
  onSave: () => void;
}) {
  const [addTargetId, setAddTargetId] = useState(workspace.id);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`dialog dialog-${type}`}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <span className="eyebrow">NEXUS CONTROL</span>
            <h2>{type === "add" ? "添加板块" : "统一设置中心"}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        {type === "add" && (
          <div className="catalog">
            <div className="catalog-target">
              <span>
                <b>添加到栏目</b>
                <small>板块会自动继承目标栏目的颜色、背景和主题材质</small>
              </span>
              <select
                value={addTargetId}
                onChange={(event) => setAddTargetId(event.target.value)}
              >
                {workspaces.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name} · {target.shortName}
                  </option>
                ))}
              </select>
            </div>
            {[...widgetMap.values()].map((widget) => (
              <button
                key={widget.id}
                onClick={() => onAdd(widget.id, addTargetId)}
              >
                <span className="plugin-symbol">＋</span>
                <span>
                  <b>{widget.title}</b>
                  <small>
                    {widget.source} · {widget.defaultSize.w}×
                    {widget.defaultSize.h}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
        {type !== "add" && (
          <SettingsCenter
            initialTab={
              type === "plugins"
                ? "modules"
                : type === "agents"
                  ? "agents"
                  : "general"
            }
            workspace={workspace}
            onReset={onReset}
            onSave={onSave}
            scene={scene}
            onScene={onScene}
            ui={ui}
            onUi={onUi}
            theme={theme}
            onTheme={onTheme}
          />
        )}
      </section>
    </div>
  );
}

type SettingsTab =
  | "general"
  | "appearance"
  | "providers"
  | "agents"
  | "integrations"
  | "modules"
  | "layout";

function SettingsCenter({
  initialTab,
  workspace,
  onReset,
  onSave,
  scene,
  onScene,
  ui,
  onUi,
  theme,
  onTheme,
}: {
  initialTab: SettingsTab;
  workspace: WorkspaceDefinition;
  onReset: () => void;
  onSave: () => void;
  scene: SceneConfig;
  onScene: (scene: SceneConfig) => void;
  ui: UiPreferences;
  onUi: (ui: UiPreferences) => void;
  theme: ThemeId;
  onTheme: (theme: ThemeId) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: "general", label: "常规与品牌", icon: "⌂" },
    { id: "appearance", label: "外观与背景", icon: "◈" },
    { id: "providers", label: "模型·语音·搜索", icon: "◎" },
    { id: "agents", label: "智能体与权限", icon: "◇" },
    { id: "integrations", label: "连接与飞书", icon: "⇄" },
    { id: "modules", label: "独立模块", icon: "＋" },
    { id: "layout", label: "布局与数据", icon: "▦" },
  ];
  return (
    <div className="settings-center">
      <aside className="settings-nav">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            <i>{item.icon}</i>
            <span>{item.label}</span>
          </button>
        ))}
      </aside>
      <div className="settings-content">
        {tab === "general" && <GeneralSettings ui={ui} onUi={onUi} />}
        {tab === "appearance" && (
          <div className="settings-section">
            <div className="provider-badge">
              <span>THEME LIBRARY</span>
              <b>主题与板块材质</b>
              <small>选择后立即应用到当前工作空间并自动保存</small>
            </div>
            <div className="theme-library">
              {themeOptions.map((option) => (
                <button
                  key={option.id}
                  data-preview={option.id}
                  className={theme === option.id ? "active" : ""}
                  onClick={() => onTheme(option.id)}
                >
                  <i />
                  <span>
                    <b>{option.label}</b>
                    <small>{option.group}</small>
                  </span>
                </button>
              ))}
            </div>
            <BackgroundSettings scene={scene} onScene={onScene} />
          </div>
        )}
        {tab === "providers" && <ProviderRegistrySettings />}
        {tab === "agents" && <AgentSettings />}
        {tab === "integrations" && (
          <div className="settings-integrations">
            <section>
              <div className="provider-badge">
                <span>LIVE CONNECTIONS</span>
                <b>真实连接状态</b>
                <small>只有真实响应并通过鉴权才显示在线</small>
              </div>
              <ConnectionCenterWidget />
            </section>
            <section>
              <FeishuWidget />
            </section>
          </div>
        )}
        {tab === "modules" && <ModuleManager />}
        {tab === "layout" && (
          <div className="settings-form settings-section">
            <div className="provider-badge">
              <span>WORKSPACE & STORAGE</span>
              <b>布局与本地数据</b>
              <small>所有布局调整现已自动保存，也可手动确认</small>
            </div>
            <div className="setting-row">
              <span>
                <b>当前工作空间</b>
                <small>
                  {workspace.name} · {workspace.widgets.length} 个板块
                </small>
              </span>
              <button onClick={onSave}>保存当前布局</button>
            </div>
            <div className="setting-row">
              <span>
                <b>恢复默认布局</b>
                <small>仅重置工作空间板块位置，不删除计划或密钥</small>
              </span>
              <button onClick={onReset}>恢复默认</button>
            </div>
            <div className="setting-row">
              <span>
                <b>本机安全存储</b>
                <small>
                  API 密钥使用 Windows DPAPI 或 macOS
                  Keychain；计划保存在文档目录
                </small>
              </span>
              <em>LOCAL</em>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandSettings({
  ui,
  onUi,
}: {
  ui: UiPreferences;
  onUi: (ui: UiPreferences) => void;
}) {
  const logoRef = useRef<HTMLInputElement>(null);
  function uploadLogo(file?: File) {
    if (!file) return;
    if (file.type !== "image/png") {
      window.alert("Logo 仅支持 PNG 文件");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      window.alert("Logo 不能超过 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onUi({ ...ui, brandLogo: String(reader.result) });
    reader.readAsDataURL(file);
  }
  return (
    <div className="brand-settings">
      <button
        className="brand-preview"
        onClick={() => logoRef.current?.click()}
      >
        {ui.brandLogo ? (
          <img src={ui.brandLogo} alt="当前 Logo" />
        ) : (
          <span>{ui.brandName.slice(0, 1) || "N"}</span>
        )}
        <small>上传 PNG</small>
      </button>
      <input
        ref={logoRef}
        hidden
        type="file"
        accept="image/png"
        onChange={(event) => uploadLogo(event.target.files?.[0])}
      />
      <div>
        <label>
          首页名称
          <input
            value={ui.brandName}
            maxLength={24}
            onChange={(event) => onUi({ ...ui, brandName: event.target.value })}
          />
        </label>
        <label>
          副标题
          <input
            value={ui.brandSubtitle}
            maxLength={42}
            onChange={(event) =>
              onUi({ ...ui, brandSubtitle: event.target.value })
            }
          />
        </label>
        <button
          onClick={() =>
            onUi({
              ...ui,
              brandName: defaultUi.brandName,
              brandSubtitle: defaultUi.brandSubtitle,
              brandLogo: "",
            })
          }
        >
          恢复默认品牌
        </button>
      </div>
    </div>
  );
}

function GeneralSettings({
  ui,
  onUi,
}: {
  ui: UiPreferences;
  onUi: (ui: UiPreferences) => void;
}) {
  return (
    <div className="general-settings">
      <BrandSettings ui={ui} onUi={onUi} />
      <div className="provider-badge">
        <span>DISPLAY & LANGUAGE</span>
        <b>字体、语言与可读性</b>
        <small>高对比不透明方案适合信息密集看板</small>
      </div>
      <div className="setting-grid">
        <label>
          界面语言
          <select
            value={ui.language}
            onChange={(event) =>
              onUi({ ...ui, language: event.target.value as LanguageCode })
            }
          >
            {languageOptions.map((option) => (
              <option value={option.id} key={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          板块外观
          <select
            value={ui.surface}
            onChange={(event) =>
              onUi({
                ...ui,
                surface: event.target.value as UiPreferences["surface"],
              })
            }
          >
            <option value="glass">透明玻璃</option>
            <option value="solid">高对比实体</option>
            <option value="opaque">完全不透明</option>
          </select>
        </label>
        <label>
          字体
          <select
            value={ui.font}
            onChange={(event) =>
              onUi({ ...ui, font: event.target.value as UiPreferences["font"] })
            }
          >
            <option value="system">系统默认</option>
            <option value="modern">现代无衬线</option>
            <option value="mono">等宽科技</option>
          </select>
        </label>
        <label>
          字重
          <select
            value={ui.fontWeight}
            onChange={(event) =>
              onUi({
                ...ui,
                fontWeight: Number(
                  event.target.value,
                ) as UiPreferences["fontWeight"],
              })
            }
          >
            <option value="400">常规</option>
            <option value="500">中等</option>
            <option value="600">半粗</option>
            <option value="700">粗体</option>
          </select>
        </label>
      </div>
      <label className="range-label">
        字体大小
        <input
          disabled={ui.adaptive}
          type="range"
          min="12"
          max="20"
          value={ui.fontSize}
          onChange={(event) =>
            onUi({ ...ui, fontSize: Number(event.target.value) })
          }
        />
        <output>{ui.adaptive ? "自动" : `${ui.fontSize}px`}</output>
      </label>
      <label className="toggle-label">
        <input
          type="checkbox"
          checked={ui.adaptive}
          onChange={(event) => onUi({ ...ui, adaptive: event.target.checked })}
        />
        随显示器尺寸自动适配
      </label>
      <button className="reset-ui" onClick={() => onUi(defaultUi)}>
        恢复显示默认值
      </button>
    </div>
  );
}
function BackgroundSettings({
  scene,
  onScene,
}: {
  scene: SceneConfig;
  onScene: (scene: SceneConfig) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  async function importMedia() {
    const desktop = (
      window as unknown as {
        nexusDesktop?: {
          background?: {
            import(): Promise<{ url: string; type: "image" | "video" } | null>;
          };
        };
      }
    ).nexusDesktop;
    if (desktop?.background) {
      const result = await desktop.background.import();
      if (result) onScene({ ...scene, ...result });
    } else fileRef.current?.click();
  }
  function browserFile(file?: File) {
    if (file)
      onScene({
        ...scene,
        src: URL.createObjectURL(file),
        type: file.type.startsWith("video/") ? "video" : "image",
      });
  }
  return (
    <div className="scene-settings">
      <div className="provider-badge">
        <span>SCENE BACKGROUND</span>
        <b>自定义背景 / 数字人舞台</b>
        <small>图片、GIF、视频与透明角色媒体</small>
      </div>
      <div className="scene-buttons">
        <button onClick={importMedia}>选择本地媒体</button>
        <button onClick={() => onScene(defaultScene)}>恢复默认</button>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/*,video/*"
          onChange={(event) => browserFile(event.target.files?.[0])}
        />
      </div>
      <label className="range-label">
        背景强度
        <input
          type="range"
          min="0"
          max="1"
          step=".05"
          value={scene.mediaOpacity}
          onChange={(event) =>
            onScene({ ...scene, mediaOpacity: Number(event.target.value) })
          }
        />
      </label>
      <label className="range-label">
        板块透明度
        <input
          type="range"
          min=".4"
          max="1"
          step=".05"
          value={scene.panelOpacity}
          onChange={(event) =>
            onScene({ ...scene, panelOpacity: Number(event.target.value) })
          }
        />
      </label>
      <label className="range-label">
        背景模糊
        <input
          type="range"
          min="0"
          max="18"
          value={scene.blur}
          onChange={(event) =>
            onScene({ ...scene, blur: Number(event.target.value) })
          }
        />
      </label>
      <label className="toggle-label">
        <input
          type="checkbox"
          checked={scene.avatarMode}
          onChange={(event) =>
            onScene({ ...scene, avatarMode: event.target.checked })
          }
        />
        数字人舞台模式
      </label>
    </div>
  );
}
function AgentSettings({ onClose }: { onClose?: () => void }) {
  const initial = JSON.parse(
    localStorage.getItem("nexus-provider-config") || "{}",
  ) as { endpoint?: string; appId?: string; hermes?: string };
  const [config, setConfig] = useState({
    endpoint: initial.endpoint || "",
    appId: initial.appId || "",
    hermes: initial.hermes || "auto",
  });
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState(
    "只有真实探测成功才会在连接中心显示 ONLINE",
  );
  async function save() {
    localStorage.setItem("nexus-provider-config", JSON.stringify(config));
    const desktop = (
      window as unknown as {
        nexusDesktop?: {
          secrets?: { set(key: string, value: string): Promise<boolean> };
          connections?: {
            probeHermes(
              endpoint: string,
            ): Promise<{
              ok: boolean;
              error?: string;
              latency?: number;
              endpoint?: string;
              version?: string;
            }>;
          };
        };
      }
    ).nexusDesktop;
    if (secret && desktop?.secrets)
      await desktop.secrets.set("doubao.primary", secret);
    if (desktop?.connections) {
      const result = await desktop.connections.probeHermes(config.hermes);
      setStatus(
        result.ok
          ? `Hermes ${result.version || "Agent"} 真实响应 · ${result.endpoint || config.hermes} · ${result.latency} ms`
          : `Hermes 离线：${result.error}`,
      );
    } else setStatus("配置已保存；真实探测需要桌面安装版");
  }
  return (
    <div className="settings-form agent-settings-scroll">
      <HarnessSettings />
      <div className="orchestrator-decision">
        <b>NEXUS 控制面 + DeepSeek Harness 执行内核</b>
        <p>
          NEXUS 负责实时语音、界面和连接治理；Harness 负责会话、权限、工具与复杂任务，Hermes 作为可选执行器接入。
        </p>
      </div>
      <div className="provider-badge">
        <span>HERMES GATEWAY COMPATIBILITY</span>
        <b>Hermes Gateway 与旧版豆包快捷配置</b>
        <small>
          模型、ASR、TTS、Realtime 与搜索统一在“模型·语音·搜索”页配置
        </small>
      </div>
      <label>
        豆包 Endpoint ID
        <input
          value={config.endpoint}
          onChange={(event) =>
            setConfig({ ...config, endpoint: event.target.value })
          }
        />
      </label>
      <label>
        火山语音 App ID
        <input
          value={config.appId}
          onChange={(event) =>
            setConfig({ ...config, appId: event.target.value })
          }
        />
      </label>
      <label>
        API Key / Access Token
        <input
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="加密保存，留空不覆盖"
        />
      </label>
      <label>
        Hermes Gateway
        <input
          value={config.hermes}
          onChange={(event) =>
            setConfig({ ...config, hermes: event.target.value })
          }
          placeholder="auto（自动发现 Hermes Desktop 动态端口）"
        />
        <small>Hermes Desktop 每次启动会使用动态端口；填 auto 可自动发现，也兼容手填固定 Gateway 地址。</small>
      </label>
      <p>{status}</p>
      <div className="role-actions">
        <button onClick={save}>保存并探测 Hermes</button>
        {onClose && <button onClick={onClose}>完成</button>}
      </div>
      <HermesRoleStudio />
    </div>
  );
}
