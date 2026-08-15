import type { ComponentType } from "react";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Unregister = () => void;

export interface WidgetProps<TSettings extends Record<string, JsonValue> = Record<string, JsonValue>> {
  context: WidgetContext;
  settings: TSettings;
  width: number;
  height: number;
}

export interface WidgetContext {
  pluginId: string;
  instanceId: string;
  emit<T extends JsonValue>(type: string, payload: T): Promise<void>;
  invoke<T extends JsonValue>(actionId: string, input: JsonValue): Promise<T>;
  storage: ScopedStorage;
}

export interface ScopedStorage {
  get<T extends JsonValue>(key: string): Promise<T | null>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface NexusEvent<T extends JsonValue = JsonValue> {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  payload: T;
}

export interface PluginContext {
  pluginId: string;
  widgets: { register<T extends Record<string, JsonValue>>(id: string, component: ComponentType<WidgetProps<T>>): Unregister };
  actions: { register<TInput extends JsonValue, TOutput extends JsonValue>(id: string, handler: (input: TInput) => Promise<TOutput>): Unregister; invoke<T extends JsonValue>(id: string, input: JsonValue): Promise<T> };
  events: { publish(type: string, payload: JsonValue): Promise<void>; subscribe(pattern: string, listener: (event: NexusEvent) => void): Unregister };
  storage: ScopedStorage;
  permissions: { has(permission: string): Promise<boolean>; request(permission: string): Promise<boolean> };
}

export interface NexusPlugin {
  activate(context: PluginContext): void | Unregister | Promise<void | Unregister>;
}

export interface AgentCapabilities {
  streaming: boolean;
  interruption: boolean;
  approvals: boolean;
  fileAccess: boolean;
  tools: string[];
}

export interface AgentAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createSession(options: JsonValue): Promise<string>;
  send(sessionId: string, input: JsonValue): AsyncIterable<NexusEvent>;
  interrupt(sessionId: string): Promise<void>;
  approve(actionId: string): Promise<void>;
  reject(actionId: string): Promise<void>;
  getCapabilities(): Promise<AgentCapabilities>;
}

export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  vision?: boolean;
  realtime?: boolean;
  languages?: string[];
  voices?: string[];
}

export interface LlmProviderAdapter {
  id: string;
  probe(): Promise<ProviderCapabilities>;
  stream(request: JsonValue, signal?: AbortSignal): AsyncIterable<NexusEvent>;
}

export interface AsrProviderAdapter {
  id: string;
  probe(): Promise<ProviderCapabilities>;
  start(options: JsonValue): Promise<string>;
  pushAudio(sessionId: string, chunk: ArrayBuffer): Promise<void>;
  events(sessionId: string): AsyncIterable<NexusEvent>;
  stop(sessionId: string): Promise<void>;
}

export interface TtsProviderAdapter {
  id: string;
  probe(): Promise<ProviderCapabilities>;
  synthesize(text: string, options: JsonValue, signal?: AbortSignal): AsyncIterable<Uint8Array>;
  cancel(sessionId: string): Promise<void>;
}

export interface RealtimeVoiceAdapter {
  id: string;
  connect(options: JsonValue): Promise<void>;
  pushAudio(chunk: ArrayBuffer): Promise<void>;
  events(): AsyncIterable<NexusEvent>;
  cancelResponse(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface ProviderRoute {
  capability: "llm" | "asr" | "tts" | "realtime-voice";
  primary: string;
  fallbacks: string[];
  timeoutMs: number;
}

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "offline";
  latencyMs?: number;
  message?: string;
}

export interface HealthCheckAdapter {
  id: string;
  check(signal?: AbortSignal): Promise<HealthCheckResult>;
  repair(signal?: AbortSignal): Promise<HealthCheckResult>;
  retryPolicy: { initialDelayMs: number; maxDelayMs: number; maxAttempts: number };
}

export interface DigitalHumanAdapter {
  id: string;
  connect(options: JsonValue): Promise<void>;
  setPersona(options: JsonValue): Promise<void>;
  pushAudio(chunk: ArrayBuffer): Promise<void>;
  speak(text: string, options: JsonValue): Promise<void>;
  interrupt(): Promise<void>;
  events(): AsyncIterable<NexusEvent>;
  disconnect(): Promise<void>;
}

export function definePlugin<T extends NexusPlugin>(plugin: T): T { return plugin; }
