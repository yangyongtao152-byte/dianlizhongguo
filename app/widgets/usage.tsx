"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UsageRecord = {
  id: string;
  timestamp: string;
  provider: string;
  keyId: string;
  model?: string;
  input: number;
  output: number;
  cached?: number;
  cost?: number;
};
const STORAGE_KEY = "nexus-token-ledger-v1";
const consoles = [
  {
    id: "doubao",
    name: "火山引擎豆包",
    url: "https://console.volcengine.com/ark",
  },
  { id: "openai", name: "OpenAI", url: "https://platform.openai.com/usage" },
  {
    id: "anthropic",
    name: "Anthropic",
    url: "https://console.anthropic.com/settings/usage",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    url: "https://aistudio.google.com/usage",
  },
];
function loadLedger() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    ) as UsageRecord[];
  } catch {
    return [];
  }
}
function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ApiUsageWidget() {
  const [records, setRecords] = useState<UsageRecord[]>(loadLedger);
  const [dimension, setDimension] = useState<"today" | "month" | "key">(
    "today",
  );
  const [notice, setNotice] = useState("台账只记录真实 API 响应或导入账单");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (
        event as CustomEvent<
          Omit<UsageRecord, "id" | "timestamp"> & { timestamp?: string }
        >
      ).detail;
      if (!detail?.provider) return;
      const next = [
        {
          ...detail,
          id: crypto.randomUUID(),
          timestamp: detail.timestamp || new Date().toISOString(),
        },
        ...loadLedger(),
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecords(next);
    };
    window.addEventListener("nexus:usage", receive);
    return () => window.removeEventListener("nexus:usage", receive);
  }, []);
  const filtered = useMemo(() => {
    const now = new Date();
    if (dimension === "key") return records;
    return records.filter((record) => {
      const date = new Date(record.timestamp);
      return dimension === "today"
        ? date.toDateString() === now.toDateString()
        : date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth();
    });
  }, [records, dimension]);
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        provider: string;
        keyId: string;
        input: number;
        output: number;
        cached: number;
        cost: number;
        calls: number;
      }
    >();
    filtered.forEach((record) => {
      const key =
        dimension === "key"
          ? record.provider + ":" + record.keyId
          : record.provider;
      const current = map.get(key) || {
        label:
          dimension === "key"
            ? record.provider + " · " + record.keyId
            : record.provider,
        provider: record.provider,
        keyId: record.keyId,
        input: 0,
        output: 0,
        cached: 0,
        cost: 0,
        calls: 0,
      };
      current.input += number(record.input);
      current.output += number(record.output);
      current.cached += number(record.cached);
      current.cost += number(record.cost);
      current.calls += 1;
      map.set(key, current);
    });
    return [...map.values()].sort(
      (a, b) => b.input + b.output - a.input - a.output,
    );
  }, [filtered, dimension]);
  const totals = groups.reduce(
    (sum, item) => ({
      tokens: sum.tokens + item.input + item.output,
      cost: sum.cost + item.cost,
      calls: sum.calls + item.calls,
    }),
    { tokens: 0, cost: 0, calls: 0 },
  );
  function openExternal(url: string) {
    const desktop = (
      window as unknown as {
        nexusDesktop?: { external?: { open(url: string): Promise<boolean> } };
      }
    ).nexusDesktop;
    if (desktop?.external) void desktop.external.open(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }
  async function importLedger(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Array<
        Partial<UsageRecord>
      >;
      const valid = parsed
        .filter((item) => item.provider && item.timestamp)
        .map((item) => ({
          id: item.id || crypto.randomUUID(),
          timestamp: String(item.timestamp),
          provider: String(item.provider),
          keyId: String(item.keyId || "unknown-key"),
          model: item.model,
          input: number(item.input),
          output: number(item.output),
          cached: number(item.cached),
          cost: number(item.cost),
        }));
      const next = [...valid, ...records];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecords(next);
      setNotice("已导入 " + valid.length + " 条真实账单记录");
    } catch {
      setNotice("导入失败：请使用 JSON 数组格式");
    }
  }
  return (
    <div className="usage-widget">
      <div className="usage-head">
        <div>
          <strong>{totals.tokens.toLocaleString()}</strong>
          <span>Token · {totals.calls} 次真实调用</span>
        </div>
        <div>
          <strong>¥ / $ {totals.cost.toFixed(4)}</strong>
          <span>账单估算或供应商返回</span>
        </div>
        <div className="usage-dimensions">
          <button
            className={dimension === "today" ? "active" : ""}
            onClick={() => setDimension("today")}
          >
            当日
          </button>
          <button
            className={dimension === "month" ? "active" : ""}
            onClick={() => setDimension("month")}
          >
            本月
          </button>
          <button
            className={dimension === "key" ? "active" : ""}
            onClick={() => setDimension("key")}
          >
            按 Key
          </button>
        </div>
      </div>
      <div className="usage-groups">
        {groups.map((item) => (
          <div key={item.label}>
            <span>
              <b>{item.label}</b>
              <small>
                {item.calls} 次 · Key {item.keyId}
              </small>
            </span>
            <em>
              输入 {item.input.toLocaleString()}
              <br />
              输出 {item.output.toLocaleString()}
              <br />
              缓存 {item.cached.toLocaleString()}
            </em>
          </div>
        ))}
        {!groups.length && (
          <div className="empty-state">
            当前维度没有真实用量记录；模型接入后会自动读取响应 usage 字段
          </div>
        )}
      </div>
      <div className="usage-actions">
        <button onClick={() => inputRef.current?.click()}>
          导入供应商账单 JSON
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept=".json,application/json"
          onChange={(event) => importLedger(event.target.files?.[0])}
        />
        {consoles.map((item) => (
          <button key={item.id} onClick={() => openExternal(item.url)}>
            {item.name} 控制台 ↗
          </button>
        ))}
      </div>
      <p>{notice}。后台只在外部浏览器打开，不读取登录密码。</p>
    </div>
  );
}
