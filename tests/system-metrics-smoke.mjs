import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSystemMetrics } from "../desktop/system-metrics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.setPath("userData", path.join(os.tmpdir(), "nexus-system-metrics-smoke"));
const hardExit = setTimeout(() => app.exit(2), 20_000);

app.whenReady().then(run).catch(fail);

async function run() {
  ipcMain.handle("nexus:system:metrics", async () => {
    try {
      return await collectSystemMetrics({
        dataPath: app.getPath("userData"),
        getGpuInfo: () => app.getGPUInfo("basic"),
        getGpuFeatureStatus: () => app.getGPUFeatureStatus(),
      });
    } catch (error) {
      console.error("metrics handler failed", error);
      return { ok: false, error: String(error) };
    }
  });
  ipcMain.handle("nexus:window:get-fullscreen", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.isKiosk(),
  );
  ipcMain.handle("nexus:window:toggle-fullscreen", async (event) => {
    const target = BrowserWindow.fromWebContents(event.sender);
    target.setKiosk(!target.isKiosk());
    await new Promise((resolve) => setTimeout(resolve, 180));
    target.webContents.send(
      "nexus:window:fullscreen-changed",
      target.isKiosk(),
    );
    return target.isKiosk();
  });
  ipcMain.handle("nexus:plans:load", () => ({ ok: true, file: "", plans: [] }));
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(root, "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await window.loadFile(path.join(root, "dist-desktop", "index.html"));
  console.log("metrics smoke: loaded app");
  const bridge = await window.webContents.executeJavaScript(`({
    desktop: Boolean(window.nexusDesktop),
    system: Boolean(window.nexusDesktop?.system),
    metrics: typeof window.nexusDesktop?.system?.metrics,
  })`);
  console.log("metrics smoke: bridge", bridge);
  const first = await window.webContents.executeJavaScript(
    "window.nexusDesktop.system.metrics()",
  );
  console.log("metrics smoke: first IPC response", first.ok);
  await new Promise((resolve) => setTimeout(resolve, 180));
  const second = await window.webContents.executeJavaScript(
    "window.nexusDesktop.system.metrics()",
  );
  console.log("metrics smoke: second IPC response", second.ok);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.ok(second.cpu >= 0 && second.cpu <= 100);
  assert.ok(second.cpuCores > 0);
  assert.ok(second.memoryUsed > 0);
  assert.ok(second.memoryTotal >= second.memoryUsed);
  assert.ok(second.diskTotal >= second.diskUsed);
  assert.ok(second.checkedAt >= first.checkedAt);
  assert.ok(second.platform);
  await window.webContents
    .executeJavaScript(`localStorage.setItem('nexus-workspaces-v3', JSON.stringify([{
    id: 'command-center', name: '指挥中心', shortName: 'COMMAND', theme: 'cyan',
    widgets: [{ instanceId: 'metrics-smoke', widgetId: 'system.metrics', x: 0, y: 0, w: 6, h: 6, layer: 1 }]
  }]))`);
  await window.reload();
  await new Promise((resolve) => setTimeout(resolve, 900));
  const rendered = await window.webContents.executeJavaScript(`({
    cards: [...document.querySelectorAll('.metric')].map((item) => item.textContent.trim()),
    error: document.querySelector('.metrics-connect-state')?.textContent?.trim() || '',
  })`);
  assert.equal(rendered.error, "");
  assert.equal(rendered.cards.length, 6);
  for (const label of [
    "CPU 使用率",
    "内存",
    "GPU 加速",
    "系统盘",
    "运行时长",
    "系统环境",
  ])
    assert.ok(rendered.cards.some((card) => card.includes(label)));
  await window.webContents.executeJavaScript(
    "document.querySelector('.fullscreen-button').click()",
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(window.isKiosk(), true);
  const enterLabel = await window.webContents.executeJavaScript(
    "document.querySelector('.fullscreen-button').getAttribute('aria-label')",
  );
  assert.match(enterLabel, /退出全屏|Exit fullscreen/i);
  await window.webContents.executeJavaScript(
    "document.querySelector('.fullscreen-button').click()",
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(window.isKiosk(), false);
  console.log(
    JSON.stringify(
      {
        cpu: second.cpu,
        cpuName: second.cpuName,
        cpuCores: second.cpuCores,
        memoryUsed: second.memoryUsed,
        memoryTotal: second.memoryTotal,
        gpuName: second.gpuName,
        diskUsed: second.diskUsed,
        diskTotal: second.diskTotal,
        uptimeSeconds: second.uptimeSeconds,
        platform: second.platform,
        checkedAt: second.checkedAt,
        renderedCards: rendered.cards,
        fullscreenButton: { entered: true, exited: true },
      },
      null,
      2,
    ),
  );
  clearTimeout(hardExit);
  window.destroy();
  app.exit(0);
}

function fail(error) {
  console.error(error?.stack || error);
  clearTimeout(hardExit);
  app.exit(1);
}
