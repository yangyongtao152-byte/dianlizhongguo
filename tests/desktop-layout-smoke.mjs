import assert from "node:assert/strict";
import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts", "desktop-layout-smoke.png");
const settingsOutput = path.join(
  root,
  "artifacts",
  "settings-center-smoke.png",
);
app.setPath("userData", path.join(os.tmpdir(), "nexus-desktop-layout-smoke"));
const hardExit = setTimeout(() => app.exit(2), 20_000);

app.whenReady().then(run).catch(fail);

async function load(window) {
  await Promise.race([
    window.loadFile(path.join(root, "dist-desktop", "index.html")),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Desktop page load timed out")),
        10_000,
      ),
    ),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 900));
}

async function waitFor(window, expression, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function run() {
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    show: false,
    backgroundColor: "#03080c",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  await load(window);
  await window.webContents.executeJavaScript(
    `localStorage.removeItem('nexus-workspaces-v3'); localStorage.removeItem('nexus-workspaces-v2')`,
  );
  await load(window);

  const report = await window.webContents.executeJavaScript(`(() => {
    const grid = document.querySelector('.react-grid-layout');
    const items = [...document.querySelectorAll('.react-grid-item')].map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        title: item.querySelector('.panel-head span')?.textContent?.trim() || '',
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        transform: getComputedStyle(item).transform,
        position: getComputedStyle(item).position,
      };
    });
    const overlappingPairs = [];
    for (let a = 0; a < items.length; a += 1) {
      for (let b = a + 1; b < items.length; b += 1) {
        const left = items[a];
        const right = items[b];
        const overlaps = left.x < right.x + right.width && left.x + left.width > right.x &&
          left.y < right.y + right.height && left.y + left.height > right.y;
        if (overlaps) overlappingPairs.push([left.title, right.title]);
      }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      grid: grid ? {
        width: Math.round(grid.getBoundingClientRect().width),
        height: Math.round(grid.getBoundingClientRect().height),
        position: getComputedStyle(grid).position,
      } : null,
      items,
      overlappingPairs,
    };
  })()`);
  assert.equal(report.items.length, 8);
  assert.deepEqual(report.overlappingPairs, []);

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, (await window.webContents.capturePage()).toPNG());

  const dragStart = await window.webContents.executeJavaScript(`(() => {
    [...document.querySelectorAll('button')].find((button) =>
      button.textContent.includes('编辑布局'))?.click();
    const rect = document.querySelector('.react-grid-item .panel-head').getBoundingClientRect();
    return { x: Math.round(rect.x + 90), y: Math.round(rect.y + 18) };
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await window.webContents.executeJavaScript(`(() => {
    const handle = document.querySelector('.react-grid-item .panel-head');
    handle.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, button: 0, buttons: 1,
      clientX: ${dragStart.x}, clientY: ${dragStart.y},
    }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 40));
  for (const offset of [40, 85, 125]) {
    await window.webContents
      .executeJavaScript(`document.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, button: 0, buttons: 1,
      clientX: ${dragStart.x + offset}, clientY: ${dragStart.y},
    }))`);
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  await window.webContents
    .executeJavaScript(`document.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, button: 0, buttons: 0,
    clientX: ${dragStart.x + 125}, clientY: ${dragStart.y},
  }))`);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const dragResult = await window.webContents.executeJavaScript(`(() => {
    const spaces = JSON.parse(localStorage.getItem('nexus-workspaces-v3') || '[]');
    return {
      savedX: spaces[0]?.widgets?.find((item) => item.instanceId === 'voice-1')?.x,
      editing: Boolean(document.querySelector('.edit-banner')),
      transform: getComputedStyle(document.querySelector('.react-grid-item')).transform,
    };
  })()`);
  const savedX = dragResult.savedX;
  assert.equal(savedX, 1, "dragged x coordinate should be auto-saved");

  await load(window);
  const restoredX = await window.webContents.executeJavaScript(`(() => {
    const spaces = JSON.parse(localStorage.getItem('nexus-workspaces-v3') || '[]');
    return spaces[0]?.widgets?.find((item) => item.instanceId === 'voice-1')?.x;
  })()`);
  assert.equal(restoredX, 1, "saved grid coordinate should survive reload");

  await waitFor(window, "Boolean(document.querySelector('.calendar-v2 .almanac-card'))");
  const calendarResult = await window.webContents.executeJavaScript(`(async () => {
    const day = [...document.querySelectorAll('.calendar-v2 .perpetual-calendar button')]
      .find((button) => !button.disabled && button.querySelector('strong')?.textContent === '15');
    day.click();
    const form = document.querySelector('.calendar-reminder-form');
    const input = form.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '测试纪念日');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    form.querySelectorAll('select')[0].value = 'anniversary';
    form.querySelectorAll('select')[0].dispatchEvent(new Event('change', { bubbles: true }));
    form.querySelectorAll('select')[1].value = 'yearly-solar';
    form.querySelectorAll('select')[1].dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    return new Promise((resolve) => setTimeout(() => {
      const reminders = JSON.parse(localStorage.getItem('nexus-calendar-reminders') || '[]');
      resolve({
        yi: document.querySelector('.almanac-row.good')?.textContent || '',
        ji: document.querySelector('.almanac-row.bad')?.textContent || '',
        reminder: reminders[0],
      });
    }, 120));
  })()`);
  assert.ok(calendarResult.yi.length > 2, "almanac should show suitable activities");
  assert.ok(calendarResult.ji.length > 2, "almanac should show avoided activities");
  assert.equal(calendarResult.reminder.category, "anniversary");
  assert.equal(calendarResult.reminder.repeat, "yearly-solar");

  const crossWorkspace = await window.webContents.executeJavaScript(`(() => {
    document.querySelectorAll('.toolbar-actions .control')[0].click();
    return new Promise((resolve) => setTimeout(() => {
      const mover = document.querySelector('.workspace-move-select');
      const target = [...mover.options].find((option) => option.value !== mover.value).value;
      mover.value = target;
      mover.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => {
        const spaces = JSON.parse(localStorage.getItem('nexus-workspaces-v3') || '[]');
        const destination = spaces.find((space) => space.id === target);
        resolve({
          target,
          active: document.querySelector('.workspace-tabs button.active')?.textContent?.trim(),
          destinationTheme: destination?.theme,
          moved: destination?.widgets?.some((item) => item.instanceId === 'voice-1'),
          renderedTheme: document.querySelector('main.nexus')?.dataset?.theme,
        });
      }, 180);
    }, 100));
  })()`);
  assert.equal(crossWorkspace.moved, true, "widget should move across workspaces");
  assert.equal(
    crossWorkspace.renderedTheme,
    crossWorkspace.destinationTheme,
    "moved widget should inherit the destination workspace theme",
  );

  window.showInactive();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const settingsState = await window.webContents.executeJavaScript(`(() => {
    document.querySelector('.brand-button')?.click();
    return new Promise((resolve) => setTimeout(() => {
      const dialog = document.querySelector('.dialog-settings');
      const rect = dialog?.getBoundingClientRect();
      resolve({
        tabs: [...document.querySelectorAll('.settings-nav button')].map((button) =>
          button.textContent.trim().replace(/^[⌂◈◎◇⇄＋▦]\s*/, '')),
        rect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        opacity: dialog ? getComputedStyle(dialog).opacity : '0',
        visibility: dialog ? getComputedStyle(dialog).visibility : 'missing',
      });
    }, 500));
  })()`);
  const settingsTabs = settingsState.tabs;
  assert.deepEqual(settingsTabs, [
    "常规与品牌",
    "外观与背景",
    "模型·语音·搜索",
    "智能体与权限",
    "连接与飞书",
    "独立模块",
    "布局与数据",
  ]);
  assert.ok(settingsState.rect.width >= 900);
  assert.ok(settingsState.rect.height >= 650);
  assert.equal(settingsState.opacity, "1");
  assert.equal(settingsState.visibility, "visible");
  await fs.writeFile(
    settingsOutput,
    (await window.webContents.capturePage()).toPNG(),
  );
  const enteredFullscreen = new Promise((resolve) =>
    window.once("enter-full-screen", resolve),
  );
  window.setMenuBarVisibility(false);
  window.setFullScreen(true);
  await enteredFullscreen;
  assert.equal(window.isFullScreen(), true);
  const fullscreenBounds = window.getBounds();
  const leftFullscreen = new Promise((resolve) =>
    window.once("leave-full-screen", resolve),
  );
  window.setFullScreen(false);
  await leftFullscreen;
  assert.equal(window.isFullScreen(), false);
  window.hide();

  console.log(
    JSON.stringify(
      {
        ...report,
        layoutPersistence: { savedX, restoredX },
        nativeFullscreen: { entered: true, exited: true, fullscreenBounds },
        settingsTabs,
        screenshots: { layout: output, settings: settingsOutput },
      },
      null,
      2,
    ),
  );
  clearTimeout(hardExit);
  window.destroy();
  app.exit(0);
}

async function fail(error) {
  console.error(error?.stack || error);
  clearTimeout(hardExit);
  app.exit(1);
}
