"use client";

import { useEffect, useState } from "react";

const auditItems = [
  ["CORE", "插件运行时启动", "已载入公开 API v1"],
  ["VOICE", "麦克风权限等待", "用户主动开启后检查"],
  ["PROVIDER", "豆包 Provider 已注册", "等待填写凭据"],
  ["AGENT", "Hermes Adapter 已注册", "等待 Gateway"],
];

export function ActivityLogWidget() {
  const [items, setItems] = useState(auditItems);
  const times = ["14:32:11", "14:32:08", "14:32:04", "14:31:58"];
  return <div className="audit-widget"><div className="audit-list">{items.map((item, index) => <div key={`${item[0]}-${index}`}><time>{times[index] ?? "--:--:--"}</time><b>{item[0]}</b><span>{item[1]}<small>{item[2]}</small></span></div>)}</div><button onClick={() => setItems([])}>清空本地日志</button></div>;
}

export function TraceWidget() {
  return <div className="trace-widget"><p className="trace-note">这里显示可审计的计划与工具轨迹，不展示模型内部隐式推理。</p><div className="trace-steps"><div className="done"><i>1</i><span><b>理解用户目标</b><small>构建可扩展的跨平台语音智能体控制台</small></span></div><div className="active"><i>2</i><span><b>准备 Provider 与 Agent</b><small>豆包语音、LLM调度、Hermes Gateway</small></span></div><div><i>3</i><span><b>等待真实凭据</b><small>完成能力探测后启动实时会话</small></span></div></div></div>;
}

type Health = { id: string; name: string; status: "online" | "waiting" | "repairing"; detail: string };
export function HeartbeatWidget() {
  const [autoRepair, setAutoRepair] = useState(true);
  const [tick, setTick] = useState(new Date());
  const [repairing, setRepairing] = useState<string | null>(null);
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  const services: Health[] = [
    { id: "network", name: "本机网络", status: online ? "online" : repairing === "network" ? "repairing" : "waiting", detail: online ? "可用" : "连接中断" },
    { id: "doubao", name: "豆包 Provider", status: "waiting", detail: "待配置凭据" },
    { id: "hermes", name: "Hermes Gateway", status: "waiting", detail: "待配置地址" },
    { id: "plugins", name: "插件运行时", status: "online", detail: "API v1" },
  ];
  useEffect(() => { const timer = window.setInterval(() => setTick(new Date()), 5000); return () => window.clearInterval(timer); }, []);
  function repair(id: string) { setRepairing(id); window.setTimeout(() => setRepairing(null), 1800); }
  return <div className="heartbeat-widget"><div className="heartbeat-top"><span className="heart-pulse" /><div><b>{tick.toLocaleTimeString("zh-CN", { hour12: false })}</b><small>5秒检测周期</small></div><label><input type="checkbox" checked={autoRepair} onChange={() => setAutoRepair(!autoRepair)} /> 自动修复</label></div><div className="health-list">{services.map((service) => <div key={service.id}><i className={service.status} /><span>{service.name}<small>{repairing === service.id ? "正在重新连接…" : service.detail}</small></span>{service.status !== "online" && service.detail !== "待配置凭据" && <button onClick={() => repair(service.id)}>修复</button>}</div>)}</div></div>;
}
