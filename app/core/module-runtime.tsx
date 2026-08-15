"use client";

import { useRef, useState } from "react";

export type ExternalModule = {
  schemaVersion: "1";
  manifest: {
    id: string;
    name: string;
    version: string;
    title: string;
    source?: string;
    description?: string;
    defaultSize: { w: number; h: number };
    permissions?: string[];
    actions?: string[];
  };
  view: { html: string };
};

export const MODULE_STORAGE_KEY = "nexus-external-modules-v1";

export const moduleGuide = `# NEXUS 独立板块开发规范 v1

文件格式：UTF-8 JSON，扩展名 .nexus-module，最大 2 MB。
模块完全自包含，不需要读取 NEXUS 主项目源码。

## 必需结构
{
  "schemaVersion": "1",
  "manifest": {
    "id": "com.example.weather",
    "name": "Weather Module",
    "version": "1.0.0",
    "title": "实时天气",
    "source": "OPEN API",
    "description": "模块说明",
    "defaultSize": { "w": 4, "h": 4 },
    "permissions": ["network:https://api.example.com"],
    "actions": ["weather.refresh"]
  },
  "view": {
    "html": "<!doctype html><html>...</html>"
  }
}

## 运行环境
- view.html 在 sandbox iframe 中运行，不可访问 Node、Electron、父页面 DOM 或本机文件。
- 主体通过 postMessage 向模块发送：
  { type: "nexus.context", payload: { theme, locale, accent, width, height } }
- 模块只能声明并请求 manifest.actions 中的动作：
  parent.postMessage({ type: "nexus.action", action: "weather.refresh", payload: {} }, "*")
- 密钥不得写入模块文件或 HTML；未来由主体 Secret Broker 按权限注入临时结果。
- 布局坐标、锁定、悬浮和层级由主体管理，模块不需要实现。

## 自适应要求
- HTML 必须包含 viewport meta；根节点宽高 100%，不得写固定窗口尺寸。
- 推荐 CSS：html,body,#app{width:100%;height:100%;margin:0;overflow:auto}
- 支持 320px 最小宽度；内容溢出必须允许纵向滚动。
- 颜色优先使用主体变量：--nexus-bg、--nexus-text、--nexus-muted、--nexus-accent。

## 更新规则
- manifest.id 保持不变、version 提升，重新上传即原位更新。
- defaultSize 范围：w 2-12，h 2-12。
- 安装器会验证字段、大小和危险结构；模块仍需自行测试离线/超时/空数据状态。`;

export const moduleTemplate: ExternalModule = {
  schemaVersion: "1",
  manifest: {
    id: "com.example.hello",
    name: "Hello Module",
    version: "1.0.0",
    title: "独立示例板块",
    source: "CUSTOM",
    description: "最小可安装模板",
    defaultSize: { w: 4, h: 4 },
    permissions: [],
    actions: [],
  },
  view: {
    html: "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width\"><style>html,body{height:100%;margin:0;background:transparent;color:#eafcff;font:14px system-ui}main{box-sizing:border-box;height:100%;padding:18px;overflow:auto}b{color:#54f7df}</style></head><body><main><b>HELLO NEXUS</b><p>这是一个不依赖主项目源码的独立板块。</p></main><script>addEventListener('message',e=>{if(e.data?.type==='nexus.context')document.documentElement.style.setProperty('--nexus-accent',e.data.payload.accent)})</script></body></html>",
  },
};

export function readExternalModules(): ExternalModule[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(
      localStorage.getItem(MODULE_STORAGE_KEY) || "[]",
    ) as ExternalModule[];
  } catch {
    return [];
  }
}

function validateModule(value: unknown): ExternalModule {
  const item = value as Partial<ExternalModule>;
  if (item.schemaVersion !== "1" || !item.manifest || !item.view)
    throw new Error("schemaVersion 必须为 1，并包含 manifest 与 view");
  const id = item.manifest.id;
  if (!id || !/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(id))
    throw new Error("manifest.id 格式无效");
  if (!item.manifest.title || !item.manifest.version || !item.view.html)
    throw new Error("title、version 和 view.html 为必填项");
  const { w, h } = item.manifest.defaultSize || {};
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w! < 2 ||
    w! > 12 ||
    h! < 2 ||
    h! > 12
  )
    throw new Error("defaultSize 必须是 2-12 的整数");
  return item as ExternalModule;
}

function announceChange() {
  window.dispatchEvent(new Event("nexus-modules-changed"));
}

export function ModuleManager() {
  const [modules, setModules] = useState(readExternalModules);
  const [status, setStatus] = useState("上传同 ID 的新版本会原位更新");
  const inputRef = useRef<HTMLInputElement>(null);
  function save(next: ExternalModule[]) {
    localStorage.setItem(MODULE_STORAGE_KEY, JSON.stringify(next));
    setModules(next);
    announceChange();
  }
  async function install(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("模块包超过 2 MB 限制");
      const item = validateModule(JSON.parse(await file.text()));
      const next = [
        ...modules.filter((module) => module.manifest.id !== item.manifest.id),
        item,
      ];
      save(next);
      setStatus(`已安装 ${item.manifest.title} v${item.manifest.version}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "模块安装失败");
    }
    if (inputRef.current) inputRef.current.value = "";
  }
  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="module-manager">
      <section className="module-install">
        <div className="provider-badge">
          <span>MODULE INSTALLER</span>
          <b>独立板块上传 / 更新</b>
          <small>.nexus-module · 沙箱运行 · 同 ID 原位更新</small>
        </div>
        <button className="accent" onClick={() => inputRef.current?.click()}>
          选择模块包
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".nexus-module,application/json"
          onChange={(event) => install(event.target.files?.[0])}
        />
        <p>{status}</p>
        <div className="installed-modules">
          {modules.map((module) => (
            <div key={module.manifest.id}>
              <span>
                <b>{module.manifest.title}</b>
                <small>
                  {module.manifest.id} · v{module.manifest.version}
                </small>
              </span>
              <button
                onClick={() =>
                  save(
                    modules.filter(
                      (item) => item.manifest.id !== module.manifest.id,
                    ),
                  )
                }
              >
                卸载
              </button>
            </div>
          ))}
          {!modules.length && (
            <div className="empty-state">还没有安装外部模块</div>
          )}
        </div>
      </section>
      <section className="module-doc">
        <div className="module-doc-actions">
          <b>开发说明</b>
          <button onClick={() => navigator.clipboard.writeText(moduleGuide)}>
            复制说明
          </button>
          <button
            onClick={() =>
              download("NEXUS-MODULE-SDK.md", moduleGuide, "text/markdown")
            }
          >
            下载说明
          </button>
          <button
            onClick={() =>
              download(
                "hello.nexus-module",
                JSON.stringify(moduleTemplate, null, 2),
                "application/json",
              )
            }
          >
            下载模板
          </button>
        </div>
        <pre>{moduleGuide}</pre>
      </section>
    </div>
  );
}

export function ExternalModuleFrame({
  module,
  locale,
  theme,
}: {
  module: ExternalModule;
  locale: string;
  theme: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  function sendContext() {
    ref.current?.contentWindow?.postMessage(
      { type: "nexus.context", payload: { locale, theme, accent: "#55f6df" } },
      "*",
    );
  }
  return (
    <iframe
      ref={ref}
      className="external-module-frame"
      title={module.manifest.title}
      sandbox="allow-scripts"
      srcDoc={module.view.html}
      onLoad={sendContext}
    />
  );
}
