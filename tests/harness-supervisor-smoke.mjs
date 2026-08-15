import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { HarnessSupervisor } from "../desktop/harness-supervisor.mjs";

test("managed Harness starts, opens event streams, and creates a session", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "nexus-harness-test-"));
  const supervisor = new HarnessSupervisor({
    userDataPath: root,
    appRoot: path.resolve("."),
    defaultWorkspace: path.join(root, "workspace"),
    getSecret: async () => "",
    notify: () => {},
  });
  try {
    await supervisor.init();
    const deadline = Date.now() + 45000;
    while (!supervisor.status().online && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 250));
    const status = supervisor.status();
    assert.equal(status.online, true, status.lastError);
    assert.match(status.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(status.managed, true);
    assert.ok(status.pid);
    const sessionId = await supervisor.ensureSession();
    assert.match(sessionId, /^session-/);
    assert.equal(supervisor.status().sessionId, sessionId);
  } finally {
    await supervisor.shutdown();
    await fs.rm(root, { recursive: true, force: true });
  }
});
