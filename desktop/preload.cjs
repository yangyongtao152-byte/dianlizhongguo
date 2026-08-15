// Electron's sandboxed preload runtime requires CommonJS here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld(
  "nexusDesktop",
  Object.freeze({
    platform: process.platform,
    desktop: true,
    secrets: Object.freeze({
      set: (key, value) => ipcRenderer.invoke("nexus:secret:set", key, value),
      get: (key) => ipcRenderer.invoke("nexus:secret:get", key),
    }),
    background: Object.freeze({
      import: () => ipcRenderer.invoke("nexus:background:import"),
    }),
    connections: Object.freeze({
      probeHermes: (endpoint) =>
        ipcRenderer.invoke("nexus:connection:probe-hermes", endpoint),
    }),
    feishu: Object.freeze({
      test: (appId) => ipcRenderer.invoke("nexus:feishu:test", appId),
      sync: (config) => ipcRenderer.invoke("nexus:feishu:sync", config),
    }),
    window: Object.freeze({
      toggleFullscreen: () =>
        ipcRenderer.invoke("nexus:window:toggle-fullscreen"),
      getFullscreen: () => ipcRenderer.invoke("nexus:window:get-fullscreen"),
      onFullscreenChanged: (callback) => {
        const listener = (_event, value) => callback(Boolean(value));
        ipcRenderer.on("nexus:window:fullscreen-changed", listener);
        return () =>
          ipcRenderer.removeListener(
            "nexus:window:fullscreen-changed",
            listener,
          );
      },
    }),
    external: Object.freeze({
      open: (url) => ipcRenderer.invoke("nexus:external:open", url),
    }),
    hotspots: Object.freeze({
      sync: () => ipcRenderer.invoke("nexus:hotspots:sync"),
    }),
    system: Object.freeze({
      metrics: () => ipcRenderer.invoke("nexus:system:metrics"),
    }),
    search: Object.freeze({
      run: (query, config) =>
        ipcRenderer.invoke("nexus:search:run", query, config),
      testProvider: (provider, config) =>
        ipcRenderer.invoke("nexus:search:test-provider", provider, config),
    }),
    providers: Object.freeze({
      test: (kind, config) =>
        ipcRenderer.invoke("nexus:provider:test", kind, config),
    }),
    voice: Object.freeze({
      start: (config) => ipcRenderer.invoke("nexus:voice:start", config),
      audio: (base64) => ipcRenderer.send("nexus:voice:audio", base64),
      cancel: () => ipcRenderer.send("nexus:voice:cancel"),
      stop: () => ipcRenderer.invoke("nexus:voice:stop"),
      onEvent: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on("nexus:voice:event", listener);
        return () => ipcRenderer.removeListener("nexus:voice:event", listener);
      },
    }),
    harness: Object.freeze({
      status: () => ipcRenderer.invoke("nexus:harness:status"),
      configure: (config) =>
        ipcRenderer.invoke("nexus:harness:configure", config),
      start: () => ipcRenderer.invoke("nexus:harness:start"),
      stop: () => ipcRenderer.invoke("nexus:harness:stop"),
      restart: () => ipcRenderer.invoke("nexus:harness:restart"),
      send: (text, mode = "queue") =>
        ipcRenderer.invoke("nexus:harness:send", text, mode),
      history: () => ipcRenderer.invoke("nexus:harness:history"),
      cancel: () => ipcRenderer.invoke("nexus:harness:cancel"),
      approve: (request) =>
        ipcRenderer.invoke("nexus:harness:approve", request),
      onStatus: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on("nexus:harness:status", listener);
        return () => ipcRenderer.removeListener("nexus:harness:status", listener);
      },
      onEvent: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on("nexus:harness:event", listener);
        return () => ipcRenderer.removeListener("nexus:harness:event", listener);
      },
      onLog: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on("nexus:harness:log", listener);
        return () => ipcRenderer.removeListener("nexus:harness:log", listener);
      },
    }),
    plans: Object.freeze({
      load: () => ipcRenderer.invoke("nexus:plans:load"),
      save: (plans) => ipcRenderer.invoke("nexus:plans:save", plans),
      openDirectory: () => ipcRenderer.invoke("nexus:plans:open-directory"),
    }),
  }),
);
