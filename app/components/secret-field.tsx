"use client";

import { useEffect, useMemo, useState } from "react";

type SecretBridge = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
};

function secretBridge(): SecretBridge | undefined {
  return (
    window as unknown as {
      nexusDesktop?: { secrets?: SecretBridge };
    }
  ).nexusDesktop?.secrets;
}

export function useSecretVault(ids: readonly string[]) {
  const signature = ids.join("|");
  const stableIds = useMemo(() => signature.split("|").filter(Boolean), [signature]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const bridge = secretBridge();
    if (!bridge) {
      queueMicrotask(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }
    void Promise.all(
      stableIds.map(async (id) => [id, (await bridge.get(id)) || ""] as const),
    )
      .then((entries) => {
        if (!active) return;
        const next = Object.fromEntries(entries);
        setValues(next);
        setSaved(
          Object.fromEntries(entries.map(([id, value]) => [id, Boolean(value)])),
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [stableIds]);

  function setValue(id: string, value: string) {
    setValues((current) => ({ ...current, [id]: value }));
    setSaved((current) => ({ ...current, [id]: false }));
    setDirty((current) => new Set(current).add(id));
  }

  async function persist() {
    const bridge = secretBridge();
    if (!bridge) throw new Error("密钥只能在桌面安装版安全保存");
    let count = 0;
    for (const id of dirty) {
      const value = (values[id] || "").trim();
      if (!value) continue;
      const ok = await bridge.set(id, value);
      if (!ok) throw new Error(`${id} 保存失败`);
      count += 1;
      setSaved((current) => ({ ...current, [id]: true }));
    }
    setDirty(new Set());
    return count;
  }

  return { values, saved, loading, dirty, setValue, persist };
}

export function SecretField({
  id,
  label,
  value,
  saved,
  loading,
  placeholder = "输入后加密保存",
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  saved?: boolean;
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="secret-field">
      <span className="secret-field-title">
        {label}
        <small>
          {loading
            ? "读取中…"
            : saved
              ? "已安全保存"
              : value
                ? "已输入 · 等待保存"
                : "尚未保存"}
        </small>
      </span>
      <span className="secret-input-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          disabled={disabled || loading}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          placeholder={loading ? "正在读取安全存储…" : placeholder}
        />
        <button
          type="button"
          className="secret-eye"
          disabled={disabled || loading || !value}
          aria-label={visible ? "隐藏密钥" : "显示密钥"}
          title={visible ? "隐藏密钥" : "显示密钥"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "隐藏" : "显示"}
        </button>
      </span>
    </label>
  );
}
