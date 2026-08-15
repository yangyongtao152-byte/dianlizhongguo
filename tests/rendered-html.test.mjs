import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the NEXUS command shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>NEXUS · Voice Agent OS<\/title>/i);
  assert.match(html, /指挥中心/);
  assert.match(html, /编辑布局/);
  assert.match(html, /添加板块/);
  assert.match(html, /系统设置/);
  assert.match(html, /NEXUS KERNEL v0\.3\.2/);
});

test("keeps grid positioning separate from panel animation", async () => {
  const [page, workbench, desktopEntry] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workbench-v3.css", import.meta.url), "utf8"),
    readFile(new URL("../desktop/main.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(desktopEntry, /workbench-v3\.css/);
  assert.match(page, /onDragStop=\{persistGrid\}/);
  assert.match(page, /onResizeStop=\{persistGrid\}/);
  assert.match(page, /nexus-workspaces-v3/);
  const reveal = workbench.match(
    /@keyframes nexusPanelReveal\s*\{([\s\S]*?)\n\}/,
  )?.[1];
  assert.ok(reveal, "safe panel reveal keyframes must exist");
  assert.doesNotMatch(reveal, /transform\s*:/);
  assert.match(
    workbench,
    /\.react-grid-layout\s*\{[\s\S]*?position:\s*relative/,
  );
});

test("ships native fullscreen, unified settings and data-preserving upgrades", async () => {
  const [page, electronMain, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../desktop/electron-main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(electronMain, /nexus:window:toggle-fullscreen/);
  assert.match(electronMain, /setKiosk\(next\)/);
  assert.match(electronMain, /input\.key === "F11"/);
  for (const label of [
    "常规与品牌",
    "外观与背景",
    "模型·语音·搜索",
    "智能体与权限",
    "连接与飞书",
    "独立模块",
    "布局与数据",
  ]) {
    assert.match(page, new RegExp(label));
  }
  const manifest = JSON.parse(packageJson);
  assert.equal(manifest.version, "0.3.2");
  assert.equal(manifest.build.appId, "com.nexus.voiceconsole");
  assert.equal(manifest.build.nsis.deleteAppDataOnUninstall, false);
});
