import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readlink, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const executable = path.join(
  projectRoot,
  "release",
  "win-unpacked",
  "NEXUS Voice Console.exe",
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForDebugger(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find(
        (entry) => entry.type === "page" && entry.webSocketDebuggerUrl,
      );
      if (target) return target.webSocketDebuggerUrl;
    } catch {
      // Electron is still starting.
    }
    await delay(250);
  }
  throw new Error("Packaged Electron debugger did not become ready in time.");
}

function connectDebugger(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let sequence = 0;

    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener(
      "open",
      () => {
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(String(event.data));
          if (!message.id || !pending.has(message.id)) return;
          const { resolve: complete, reject: fail } = pending.get(message.id);
          pending.delete(message.id);
          if (message.error) fail(new Error(message.error.message));
          else complete(message.result);
        });

        resolve({
          close: () => socket.close(),
          evaluate(expression) {
            sequence += 1;
            const id = sequence;
            socket.send(
              JSON.stringify({
                id,
                method: "Runtime.evaluate",
                params: {
                  expression,
                  awaitPromise: true,
                  returnByValue: true,
                },
              }),
            );
            return new Promise((complete, fail) => {
              pending.set(id, { resolve: complete, reject: fail });
            });
          },
        });
      },
      { once: true },
    );
  });
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test(
  "packaged Windows app starts its bundled DeepSeek Harness runtime",
  { skip: process.platform !== "win32", timeout: 60_000 },
  async () => {
    const port = await reservePort();
    const userData = await mkdtemp(path.join(os.tmpdir(), "nexus-packed-smoke-"));
    const child = spawn(
      executable,
      [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`],
      { stdio: "ignore", windowsHide: true },
    );
    let debuggerClient;

    try {
      const debuggerUrl = await waitForDebugger(port);
      debuggerClient = await connectDebugger(debuggerUrl);
      await debuggerClient.evaluate(
        "globalThis.__harnessLogs = []; window.nexusDesktop.harness.onLog((entry) => globalThis.__harnessLogs.push(entry)); true",
      );
      const deadline = Date.now() + 40_000;
      let status;

      while (Date.now() < deadline) {
        const result = await debuggerClient.evaluate(
          "window.nexusDesktop.harness.status()",
        );
        if (result.exceptionDetails) {
          throw new Error(result.exceptionDetails.text);
        }
        status = result.result.value;
        if (
          status?.online ||
          status?.phase === "error" ||
          status?.lastError?.includes("code=1")
        )
          break;
        await delay(500);
      }

      const logsResult = await debuggerClient.evaluate(
        "globalThis.__harnessLogs",
      );
      const diagnostic = JSON.stringify(
        { status, logs: logsResult.result.value },
        null,
        2,
      );
      assert.equal(status?.online, true, diagnostic);
      assert.equal(status?.managed, true);
      assert.equal(status?.config?.mode, "managed");
      assert.ok(status?.endpoint?.startsWith("http://127.0.0.1:"));
      await debuggerClient.evaluate("window.nexusDesktop.harness.history()");
      const sessionStatus = await debuggerClient.evaluate(
        "window.nexusDesktop.harness.status()",
      );
      status = sessionStatus.result.value;
      assert.ok(status?.sessionId, "Harness should create and persist a session");

      for (const packageName of ["cordis-plugin-group", "dsh-web-app"]) {
        const link = path.join(
          userData,
          "deepseek-harness",
          "profiles",
          "node_modules",
          "@deepseek-ai",
          packageName,
        );
        const target = await readlink(link);
        assert.match(
          target,
          /resources[\\/]h[\\/]r[\\/]node_modules/i,
          `${packageName} escaped the packaged Harness runtime: ${target}`,
        );
      }
    } finally {
      debuggerClient?.close();
      await stopProcess(child);
      await rm(userData, { recursive: true, force: true });
    }
  },
);
