import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretStore = new Map([
  ["provider.realtime", "remembered-realtime-key"],
  ["provider.tts", "remembered-tts-key"],
]);
const testCalls = [];

app.setPath("userData", path.join(os.tmpdir(), "nexus-provider-chat-smoke"));
const hardExit = setTimeout(() => app.exit(2), 20_000);

ipcMain.handle("nexus:secret:get", (_event, key) => secretStore.get(key) || null);
ipcMain.handle("nexus:secret:set", (_event, key, value) => {
  secretStore.set(key, value);
  return true;
});
ipcMain.handle("nexus:provider:test", async (_event, kind, config) => {
  testCalls.push({ kind, config });
  await new Promise((resolve) => setTimeout(resolve, 80));
  return {
    ok: true,
    authenticated: true,
    detail:
      kind === "tts"
        ? "WebSocket 101 握手通过 · X-Api-Key 与 seed-tts-2.0 鉴权成功"
        : "WebSocket 101 握手与 X-Api-Key 鉴权通过",
    latency: 80,
  };
});
ipcMain.handle("nexus:harness:status", () => ({
  online: false,
  phase: "stopped",
  sessionId: "",
  latency: null,
  lastError: "",
}));
ipcMain.handle("nexus:window:get-fullscreen", () => false);
ipcMain.handle("nexus:plans:load", () => ({ plans: [], path: "test/plans.md" }));

app.whenReady().then(run).catch(fail);

async function waitFor(window, expression, timeout = 5_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await window.webContents.executeJavaScript(expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function run() {
  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    show: false,
    webPreferences: {
      preload: path.join(root, "desktop", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  await window.loadFile(path.join(root, "dist-desktop", "index.html"));
  await waitFor(window, "Boolean(document.querySelector('.brand-button'))");
  await window.webContents.executeJavaScript(
    `document.querySelectorAll('.workspace-tabs button')[1].click()`,
  );
  await waitFor(window, "Boolean(document.querySelector('.chat-history'))");

  const messages = Array.from({ length: 80 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 ? "assistant" : "user",
    text: `history ${index}`,
    time: "TEST",
  }));
  await window.webContents.executeJavaScript(`(() => {
    localStorage.setItem('nexus-chat-history', ${JSON.stringify(JSON.stringify(messages))});
    window.dispatchEvent(new Event('nexus-storage'));
  })()`);
  await waitFor(window, "document.querySelectorAll('.chat-history .message').length === 80");
  await new Promise((resolve) => setTimeout(resolve, 120));
  const chatScroll = await window.webContents.executeJavaScript(`(() => {
    const history = document.querySelector('.chat-history');
    return {
      top: history.scrollTop,
      height: history.scrollHeight,
      client: history.clientHeight,
      distance: history.scrollHeight - history.scrollTop - history.clientHeight,
    };
  })()`);
  assert.ok(chatScroll.top > 0, "chat should not remain at its top");
  assert.ok(chatScroll.distance <= 2, "chat should follow the newest message");

  await window.webContents.executeJavaScript(`document.querySelector('.brand-button').click()`);
  await waitFor(window, "document.querySelectorAll('.settings-nav button').length >= 3");
  await window.webContents.executeJavaScript(
    `document.querySelectorAll('.settings-nav button')[2].click()`,
  );
  await waitFor(window, "document.querySelectorAll('.provider-tabs button').length === 5");
  await window.webContents.executeJavaScript(`(() => {
    [...document.querySelectorAll('.provider-tabs button')]
      .find((button) => button.textContent.includes('实时语音')).click();
  })()`);
  await waitFor(window, "Boolean(document.querySelector('#provider-realtime-key'))");
  await waitFor(
    window,
    "document.querySelector('#provider-realtime-key').value === 'remembered-realtime-key'",
  );

  const initialSecret = await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#provider-realtime-key');
    return {
      type: input.type,
      status: input.closest('.secret-field').querySelector('small').textContent.trim(),
    };
  })()`);
  assert.equal(initialSecret.type, "password");
  assert.equal(
    await window.webContents.executeJavaScript(
      `document.querySelectorAll('.voice-persona-field input').length`,
    ),
    1,
    "voice persona should have exactly one visible settings field",
  );
  assert.match(initialSecret.status, /已安全保存/);

  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#provider-realtime-key');
    input.closest('.secret-input-wrap').querySelector('button').click();
  })()`);
  await waitFor(
    window,
    "document.querySelector('#provider-realtime-key').type === 'text'",
  );
  const revealed = await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#provider-realtime-key');
    return { type: input.type, value: input.value };
  })()`);
  assert.equal(revealed.type, "text");
  assert.equal(revealed.value, "remembered-realtime-key");

  const pendingStatus = await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#provider-realtime-key');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'updated-realtime-key');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise((resolve) => setTimeout(() =>
      resolve(input.closest('.secret-field').querySelector('small').textContent.trim()), 80));
  })()`);
  assert.match(pendingStatus, /等待保存/);

  await window.webContents.executeJavaScript(
    `document.querySelector('.provider-save button').click()`,
  );
  await waitFor(
    window,
    "document.querySelector('.provider-test-status').textContent.includes('已加密更新并记住')",
  );
  assert.equal(secretStore.get("provider.realtime"), "updated-realtime-key");

  await window.webContents.executeJavaScript(
    `document.querySelector('.api-type-head button').click()`,
  );
  await waitFor(
    window,
    "document.querySelector('.provider-test-status').textContent.includes('连接成功')",
  );
  const finalStatus = await window.webContents.executeJavaScript(
    `document.querySelector('.provider-test-status').textContent.trim()`,
  );
  assert.match(finalStatus, /X-Api-Key/);
  assert.equal(testCalls.length, 1);
  assert.equal(testCalls[0].kind, "realtime");
  assert.equal(testCalls[0].config.realtimeModel, "1.2.6.1");
  assert.equal(
    testCalls[0].config.realtimeBaseUrl,
    "wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue",
  );

  await window.webContents.executeJavaScript(`(() => {
    [...document.querySelectorAll('.provider-tabs button')]
      .find((button) => button.textContent.includes('语音合成')).click();
  })()`);
  await waitFor(window, "Boolean(document.querySelector('#provider-tts-key'))");
  await window.webContents.executeJavaScript(
    `document.querySelector('.api-type-head button').click()`,
  );
  await waitFor(
    window,
    "document.querySelector('.provider-test-status').textContent.includes('连接成功') && document.querySelector('.provider-test-status').textContent.includes('seed-tts-2.0')",
  );
  assert.equal(testCalls.length, 2);
  assert.equal(testCalls[1].kind, "tts");
  assert.equal(testCalls[1].config.ttsResourceId, "seed-tts-2.0");
  assert.equal(
    testCalls[1].config.ttsBaseUrl,
    "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
  );

  console.log(JSON.stringify({ chatScroll, initialSecret, pendingStatus, finalStatus }));
  clearTimeout(hardExit);
  window.destroy();
  app.exit(0);
}

function fail(error) {
  console.error(error?.stack || error);
  clearTimeout(hardExit);
  app.exit(1);
}
