import type { ComponentType } from "react";

export type ThemeId =
  | "cyan"
  | "violet"
  | "amber"
  | "crimson"
  | "starfleet"
  | "galactic"
  | "antihero"
  | "heroic"
  | "slate"
  | "paper";

export type WidgetKind =
  | "voice"
  | "agents"
  | "metrics"
  | "timeline"
  | "plugins"
  | "calendar"
  | "memo"
  | "planner"
  | "chat"
  | "taskbar"
  | "hotspots"
  | "obsidian"
  | "activitylog"
  | "trace"
  | "heartbeat"
  | "connections"
  | "feishu"
  | "decoration"
  | "avatar"
  | "agentworld"
  | "usage"
  | "external";

export interface WidgetDefinition {
  id: string;
  title: string;
  kind: WidgetKind;
  source: string;
  defaultSize: { w: number; h: number };
  component?: ComponentType<Record<string, unknown>>;
}

export interface ActionDefinition {
  id: string;
  title: string;
  voiceExamples: string[];
  requiredPermissions?: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: "1";
  permissions: string[];
  widgets: WidgetDefinition[];
  actions: ActionDefinition[];
}

export interface WidgetPlacement {
  instanceId: string;
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
  floating?: boolean;
  layer?: 1 | 2 | 3;
  settings?: Record<string, unknown>;
}

export interface WorkspaceDefinition {
  id: string;
  name: string;
  shortName: string;
  theme: ThemeId;
  widgets: WidgetPlacement[];
}

export interface NexusEvent<T = unknown> {
  id: string;
  type: string;
  time: string;
  title: string;
  detail: string;
  payload?: T;
}

export function defineNexusPlugin<T extends PluginManifest>(manifest: T): T {
  return manifest;
}
