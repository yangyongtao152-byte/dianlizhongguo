"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Solar } from "lunar-javascript";

function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as T;
        queueMicrotask(() => setValue(parsed));
      } catch {
        localStorage.removeItem(key);
      }
    }
  }, [key]);
  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem(key);
      if (saved)
        try {
          setValue(JSON.parse(saved) as T);
        } catch {
          /* ignore invalid external update */
        }
    };
    window.addEventListener("nexus-storage", sync);
    return () => window.removeEventListener("nexus-storage", sync);
  }, [key]);
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

function lunarLabel(date: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
    month: "short",
    day: "numeric",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);
  const numerals = [
    "",
    "初一",
    "初二",
    "初三",
    "初四",
    "初五",
    "初六",
    "初七",
    "初八",
    "初九",
    "初十",
    "十一",
    "十二",
    "十三",
    "十四",
    "十五",
    "十六",
    "十七",
    "十八",
    "十九",
    "二十",
    "廿一",
    "廿二",
    "廿三",
    "廿四",
    "廿五",
    "廿六",
    "廿七",
    "廿八",
    "廿九",
    "三十",
  ];
  return day === 1 ? month : (numerals[day] ?? String(day));
}

export function LegacyCalendarWidget({ locale = "zh-CN" }: { locale?: string }) {
  const [cursor, setCursor] = useState(() => new Date());
  const today = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const lunarToday = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
    dateStyle: "long",
  }).format(today);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= days
      ? { day, date: new Date(year, month, day) }
      : null;
  });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
      new Date(2026, 7, 9 + index),
    ),
  );
  return (
    <div className="calendar-widget">
      <div className="calendar-title">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ‹
        </button>
        <div>
          <b>
            {new Intl.DateTimeFormat(locale, {
              year: "numeric",
              month: "long",
            }).format(cursor)}
          </b>
          <small>{lunarToday}</small>
        </div>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))}>
          ›
        </button>
      </div>
      <div className="weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-grid perpetual-calendar">
        {cells.map((cell, index) => (
          <button
            key={index}
            disabled={!cell}
            className={
              cell &&
              cell.day === today.getDate() &&
              month === today.getMonth() &&
              year === today.getFullYear()
                ? "today"
                : ""
            }
          >
            {cell && (
              <>
                <strong>{cell.day}</strong>
                <small>{lunarLabel(cell.date)}</small>
              </>
            )}
          </button>
        ))}
      </div>
      <div className="calendar-legend">
        <span>上：阳历</span>
        <span>下：农历</span>
        <button onClick={() => setCursor(new Date())}>返回今天</button>
      </div>
    </div>
  );
}

type ReminderRepeat =
  | "once"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly-solar"
  | "yearly-lunar";
type ReminderCategory =
  | "once"
  | "birthday"
  | "festival"
  | "anniversary"
  | "memo";
type CalendarReminder = {
  id: string;
  title: string;
  date: string;
  time: string;
  repeat: ReminderRepeat;
  category: ReminderCategory;
  lunarMonth?: number;
  lunarDay?: number;
  createdAt: string;
};

const reminderLabels: Record<ReminderRepeat, string> = {
  once: "一次性提醒",
  daily: "每天重复",
  weekly: "每周重复",
  monthly: "每月重复",
  "yearly-solar": "每年按阳历",
  "yearly-lunar": "每年按农历",
};
const categoryLabels: Record<ReminderCategory, string> = {
  once: "一次性",
  birthday: "生日",
  festival: "节日",
  anniversary: "纪念日",
  memo: "备忘",
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reminderMatches(reminder: CalendarReminder, date: Date) {
  const origin = new Date(`${reminder.date}T00:00:00`);
  if (Number.isNaN(origin.getTime())) return false;
  if (reminder.repeat === "once") return dateKey(date) === reminder.date;
  if (reminder.repeat === "daily") return date >= origin;
  if (reminder.repeat === "weekly")
    return date >= origin && date.getDay() === origin.getDay();
  if (reminder.repeat === "monthly")
    return date >= origin && date.getDate() === origin.getDate();
  if (reminder.repeat === "yearly-solar")
    return (
      date >= origin &&
      date.getMonth() === origin.getMonth() &&
      date.getDate() === origin.getDate()
    );
  const lunar = Solar.fromYmd(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ).getLunar();
  return (
    date >= origin &&
    Math.abs(lunar.getMonth()) === Math.abs(reminder.lunarMonth || 0) &&
    lunar.getDay() === reminder.lunarDay
  );
}

export function CalendarReminderScheduler() {
  const [reminders] = useLocalState<CalendarReminder[]>(
    "nexus-calendar-reminders",
    [],
  );
  const alerted = useRef(new Set<string>());

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      reminders.forEach((reminder) => {
        if (!reminderMatches(reminder, now) || reminder.time !== currentTime)
          return;
        const occurrence = `${reminder.id}:${dateKey(now)}:${currentTime}`;
        if (alerted.current.has(occurrence)) return;
        alerted.current.add(occurrence);
        if ("Notification" in window && Notification.permission === "granted")
          new Notification(`NEXUS · ${categoryLabels[reminder.category]}`, {
            body: reminder.title,
          });
      });
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [reminders]);

  return null;
}

export function CalendarWidget({ locale = "zh-CN" }: { locale?: string }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [reminders, setReminders] = useLocalState<CalendarReminder[]>(
    "nexus-calendar-reminders",
    [],
  );
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [repeat, setRepeat] = useState<ReminderRepeat>("once");
  const [category, setCategory] = useState<ReminderCategory>("once");
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= days
      ? { day, date: new Date(year, month, day) }
      : null;
  });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
      new Date(2026, 7, 9 + index),
    ),
  );
  const almanac = useMemo(() => {
    const solar = Solar.fromYmd(
      selected.getFullYear(),
      selected.getMonth() + 1,
      selected.getDate(),
    );
    const lunar = solar.getLunar();
    return {
      lunar,
      lunarText: `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      festivals: [...solar.getFestivals(), ...lunar.getFestivals()],
      yi: lunar.getDayYi(),
      ji: lunar.getDayJi(),
      meta: `${lunar.getZhiXing()}日 · ${lunar.getDayTianShen()} · 冲${lunar.getDayChongDesc()} · 煞${lunar.getDaySha()}`,
      taboo: `${lunar.getPengZuGan()}；${lunar.getPengZuZhi()}`,
    };
  }, [selected]);
  const selectedReminders = reminders.filter((item) =>
    reminderMatches(item, selected),
  );
  function commitReminders(next: CalendarReminder[]) {
    setReminders(next);
    localStorage.setItem("nexus-calendar-reminders", JSON.stringify(next));
    window.dispatchEvent(new Event("nexus-storage"));
  }

  function addReminder(event: FormEvent) {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    const selectedSolar = Solar.fromYmd(
      selected.getFullYear(),
      selected.getMonth() + 1,
      selected.getDate(),
    ).getLunar();
    const next: CalendarReminder = {
      id: crypto.randomUUID(),
      title: clean,
      date: dateKey(selected),
      time,
      repeat,
      category,
      lunarMonth: Math.abs(selectedSolar.getMonth()),
      lunarDay: selectedSolar.getDay(),
      createdAt: new Date().toISOString(),
    };
    commitReminders([next, ...reminders]);
    setTitle("");
    if ("Notification" in window && Notification.permission === "default")
      void Notification.requestPermission();
  }

  return (
    <div className="calendar-widget calendar-v2">
      <div className="calendar-title">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
        <div>
          <b>{new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(cursor)}</b>
          <small>阳历 · 农历 · 黄历 · 提醒</small>
        </div>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
      </div>
      <div className="calendar-main-scroll">
        <div className="weekdays">
          {weekdays.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid perpetual-calendar">
          {cells.map((cell, index) => {
            const count = cell
              ? reminders.filter((item) => reminderMatches(item, cell.date)).length
              : 0;
            return (
              <button
                key={index}
                disabled={!cell}
                onClick={() => cell && setSelected(cell.date)}
                className={[
                  cell && dateKey(cell.date) === dateKey(today) ? "today" : "",
                  cell && dateKey(cell.date) === dateKey(selected) ? "selected" : "",
                  count ? "has-reminder" : "",
                ].filter(Boolean).join(" ")}
              >
                {cell && (
                  <>
                    <strong>{cell.day}</strong>
                    <small>{lunarLabel(cell.date)}</small>
                    {count > 0 && <i>{count}</i>}
                  </>
                )}
              </button>
            );
          })}
        </div>
        <section className="almanac-card">
          <header>
            <div>
              <b>{selected.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</b>
              <small>{almanac.lunarText} · {almanac.meta}</small>
            </div>
            {almanac.festivals.map((item) => <em key={item}>{item}</em>)}
          </header>
          <div className="almanac-row good"><b>宜</b><span>{almanac.yi.join(" · ") || "诸事不宜"}</span></div>
          <div className="almanac-row bad"><b>忌</b><span>{almanac.ji.join(" · ") || "无"}</span></div>
          <small className="almanac-taboo">彭祖百忌：{almanac.taboo}</small>
        </section>
        <form className="calendar-reminder-form" onSubmit={addReminder}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="为选中日期添加提醒或备忘…"
          />
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          <select value={category} onChange={(event) => setCategory(event.target.value as ReminderCategory)}>
            {Object.entries(categoryLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={repeat} onChange={(event) => setRepeat(event.target.value as ReminderRepeat)}>
            {Object.entries(reminderLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button>添加提醒</button>
        </form>
        <div className="calendar-reminders">
          {selectedReminders.length === 0 && <small>这一天暂无提醒</small>}
          {selectedReminders.map((item) => (
            <div key={item.id}>
              <span><em>{categoryLabels[item.category]}</em><b>{item.title}</b><small>{item.time} · {reminderLabels[item.repeat]}</small></span>
              <button onClick={() => commitReminders(reminders.filter((entry) => entry.id !== item.id))}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type Memo = { id: string; text: string; createdAt: string };
export function MemoWidget() {
  const [memos, setMemos] = useLocalState<Memo[]>("nexus-memos", []);
  const [calendarReminders, setCalendarReminders] = useLocalState<
    CalendarReminder[]
  >("nexus-calendar-reminders", []);
  const [text, setText] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = text.trim();
    if (!next) return;
    setMemos([
      {
        id: crypto.randomUUID(),
        text: next,
        createdAt: new Date().toLocaleString("zh-CN"),
      },
      ...memos,
    ]);
    setText("");
  }
  return (
    <div className="data-widget">
      <form className="quick-entry" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="输入备忘内容…"
        />
        <button>添加</button>
      </form>
      <div className="scroll-list">
        {memos.length === 0 && <Empty text="暂无备忘" />}
        {memos.map((memo) => (
          <div className="memo-row" key={memo.id}>
            <p>
              {memo.text}
              <small>{memo.createdAt}</small>
            </p>
            <button
              onClick={() =>
                setMemos(memos.filter((item) => item.id !== memo.id))
              }
            >
              ×
            </button>
          </div>
        ))}
        <div className="memo-calendar-section">
          <header>
            <b>日历提醒</b>
            <small>{calendarReminders.length} 条</small>
          </header>
          {calendarReminders.slice(0, 12).map((item) => (
            <div className="memo-row calendar-memo-row" key={item.id}>
              <p>
                <em>{categoryLabels[item.category]}</em> {item.title}
                <small>
                  {item.date} {item.time} · {reminderLabels[item.repeat]}
                </small>
              </p>
              <button
                onClick={() => {
                  const next = calendarReminders.filter(
                    (entry) => entry.id !== item.id,
                  );
                  setCalendarReminders(next);
                  localStorage.setItem(
                    "nexus-calendar-reminders",
                    JSON.stringify(next),
                  );
                  window.dispatchEvent(new Event("nexus-storage"));
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export type Plan = {
  id: string;
  title: string;
  done: boolean;
  due: string;
  remindMinutes?: number;
  progress?: number;
  completedAt?: string;
};
export function PlannerWidget() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => {
    const date = new Date(Date.now() + 86400000);
    date.setSeconds(0, 0);
    return date.toISOString().slice(0, 16);
  });
  const [remindMinutes, setRemindMinutes] = useState(30);
  const [filePath, setFilePath] = useState("浏览器预览：LocalStorage");
  const [notice, setNotice] = useState("每次操作都会更新同一个 plans.md 文件");
  const alerted = useRef(new Set<string>());
  type PlanBridge = {
    plans?: {
      load(): Promise<{ ok: boolean; file: string; plans: Plan[] }>;
      save(plans: Plan[]): Promise<{ ok: boolean; file: string }>;
      openDirectory(): Promise<{ ok: boolean; directory: string }>;
    };
  };
  const desktop = useMemo(
    () =>
      typeof window === "undefined"
        ? undefined
        : (window as unknown as { nexusDesktop?: PlanBridge }).nexusDesktop,
    [],
  );
  useEffect(() => {
    const load = async () => {
      if (desktop?.plans) {
        const result = await desktop.plans.load();
        setPlans(result.plans || []);
        setFilePath(result.file);
        localStorage.setItem("nexus-plans", JSON.stringify(result.plans || []));
      } else {
        try {
          setPlans(JSON.parse(localStorage.getItem("nexus-plans") || "[]"));
        } catch {
          setPlans([]);
        }
      }
    };
    void load();
  }, [desktop]);
  useEffect(() => {
    const check = () =>
      plans.forEach((plan) => {
        if (plan.done || !plan.due || alerted.current.has(plan.id)) return;
        const remaining = new Date(plan.due).getTime() - Date.now();
        const windowMs = (plan.remindMinutes || 0) * 60000;
        if (remaining > 0 && remaining <= windowMs) {
          alerted.current.add(plan.id);
          setNotice("提醒：" + plan.title + " 即将到期");
          if ("Notification" in window && Notification.permission === "granted")
            new Notification("NEXUS 计划提醒", {
              body:
                plan.title +
                " · 截止 " +
                new Date(plan.due).toLocaleString("zh-CN"),
            });
        }
      });
    check();
    const timer = window.setInterval(check, 30000);
    return () => window.clearInterval(timer);
  }, [plans]);
  async function commit(next: Plan[]) {
    setPlans(next);
    localStorage.setItem("nexus-plans", JSON.stringify(next));
    window.dispatchEvent(new Event("nexus-storage"));
    if (desktop?.plans) {
      const result = await desktop.plans.save(next);
      setFilePath(result.file);
      setNotice(result.ok ? "plans.md 已更新" : "计划文件写入失败");
    } else setNotice("浏览器预览已保存到 LocalStorage");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = title.trim();
    if (!next) return;
    void commit([
      ...plans,
      {
        id: crypto.randomUUID(),
        title: next,
        done: false,
        due,
        remindMinutes,
        progress: 0,
        completedAt: "",
      },
    ]);
    setTitle("");
    if ("Notification" in window && Notification.permission === "default")
      void Notification.requestPermission();
  }
  function update(id: string, patch: Partial<Plan>) {
    void commit(
      plans.map((plan) => (plan.id === id ? { ...plan, ...patch } : plan)),
    );
  }
  return (
    <div className="data-widget planner-v2">
      <form className="plan-entry" onSubmit={submit}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="添加计划…"
        />
        <input
          type="datetime-local"
          value={due}
          onChange={(event) => setDue(event.target.value)}
          title="计划完成时间"
        />
        <select
          value={remindMinutes}
          onChange={(event) => setRemindMinutes(Number(event.target.value))}
          title="提前提醒"
        >
          <option value="0">不提醒</option>
          <option value="10">提前 10 分钟</option>
          <option value="30">提前 30 分钟</option>
          <option value="60">提前 1 小时</option>
          <option value="1440">提前 1 天</option>
        </select>
        <button>创建</button>
      </form>
      <div className="plan-file-bar">
        <span title={filePath}>{filePath}</span>
        <button onClick={() => desktop?.plans?.openDirectory()}>
          打开计划目录
        </button>
      </div>
      <div className="scroll-list plan-list">
        {plans.length === 0 && <Empty text="暂无计划" />}
        {plans.map((plan) => (
          <div
            className={"plan-card " + (plan.done ? "done" : "")}
            key={plan.id}
          >
            <div className="plan-main">
              <span>
                <b>{plan.title}</b>
                <small>
                  截止{" "}
                  {plan.due
                    ? new Date(plan.due).toLocaleString("zh-CN")
                    : "未设置"}{" "}
                  · 提前 {plan.remindMinutes || 0} 分钟
                </small>
                {plan.completedAt && (
                  <small>
                    实际完成{" "}
                    {new Date(plan.completedAt).toLocaleString("zh-CN")}
                  </small>
                )}
              </span>
              <em>{plan.progress || 0}%</em>
            </div>
            <input
              className="plan-progress"
              type="range"
              min="0"
              max="100"
              step="5"
              value={plan.progress || 0}
              onChange={(event) =>
                update(plan.id, {
                  progress: Number(event.target.value),
                  done: Number(event.target.value) === 100,
                  completedAt:
                    Number(event.target.value) === 100
                      ? plan.completedAt || new Date().toISOString()
                      : "",
                })
              }
            />
            <div className="plan-actions">
              <button
                onClick={() =>
                  update(plan.id, {
                    progress: Math.min(100, (plan.progress || 0) + 25),
                  })
                }
              >
                进度 +25%
              </button>
              <button
                onClick={() =>
                  update(plan.id, {
                    done: !plan.done,
                    progress: !plan.done ? 100 : plan.progress || 0,
                    completedAt: !plan.done ? new Date().toISOString() : "",
                  })
                }
              >
                {plan.done ? "重新打开" : "标记完成"}
              </button>
              <button
                onClick={() =>
                  void commit(plans.filter((item) => item.id !== plan.id))
                }
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
      <small className="planner-notice">{notice}</small>
    </div>
  );
}

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  time: string;
};

type HarnessStatus = {
  phase: string;
  online: boolean;
  managed: boolean;
  endpoint: string;
  sessionId: string;
  version: string;
  latency: number | null;
  lastError: string;
};

type HarnessEnvelope = {
  rpcId: string;
  payload?: Record<string, unknown>;
};

type HarnessBridge = {
  status(): Promise<HarnessStatus>;
  send(text: string, mode?: "queue" | "steer"): Promise<{ sessionId: string }>;
  cancel(): Promise<{ accepted: boolean }>;
  history(): Promise<{
    events?: Array<{ event?: Record<string, unknown> }>;
    hasMore?: boolean;
  }>;
  approve(request: {
    rpcId: string;
    approvalId: string;
    outcome: "allowed-once" | "rejected";
  }): Promise<{ accepted: boolean }>;
  onStatus(callback: (status: HarnessStatus) => void): () => void;
  onEvent(callback: (event: HarnessEnvelope) => void): () => void;
};

function desktopHarness() {
  return (
    window as unknown as { nexusDesktop?: { harness?: HarnessBridge } }
  ).nexusDesktop?.harness;
}

function contentText(content: unknown) {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: string; text: string } =>
        block?.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

function eventMessages(
  entries: Array<{ event?: Record<string, unknown> }>,
): Message[] {
  return entries.flatMap(({ event }) => {
    if (!event || !["user/message", "assistant/message"].includes(String(event.type)))
      return [];
    const data = (event.data || {}) as Record<string, unknown>;
    const message = (data.message || data) as Record<string, unknown>;
    const text = contentText(message.content);
    if (!text) return [];
    const role = event.type === "user/message" ? "user" : "assistant";
    return [
      {
        id: `harness-${String(event.seq ?? crypto.randomUUID())}`,
        role,
        text,
        time: new Date(Number(event.time || Date.now())).toLocaleTimeString(
          "zh-CN",
          { hour: "2-digit", minute: "2-digit" },
        ),
      } satisfies Message,
    ];
  });
}

export function ChatWidget() {
  const [messages, setMessages] = useLocalState<Message[]>(
    "nexus-chat-history",
    [
      {
        id: "welcome",
        role: "assistant",
        text: "对话历史已启用。配置 Realtime API 或 Hermes 后，消息会发送给真实智能体。",
        time: "SYSTEM",
      },
    ],
  );
  const [text, setText] = useState("");
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [activity, setActivity] = useState("等待中枢连接");
  const [approval, setApproval] = useState<{
    rpcId: string;
    approvalId: string;
    toolName: string;
    reason: string;
  } | null>(null);
  const streamId = useRef<string | null>(null);
  const loadedSession = useRef("");
  const historyRef = useRef<HTMLDivElement | null>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const history = historyRef.current;
    if (!history || !followLatest.current) return;
    const frame = requestAnimationFrame(() => {
      history.scrollTop = history.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    const harness = desktopHarness();
    if (!harness) {
      queueMicrotask(() =>
        setActivity("浏览器预览模式：请使用桌面版连接 Harness"),
      );
      return;
    }
    let active = true;
    const loadHistory = async (next: HarnessStatus) => {
      if (!next.online || !next.sessionId || loadedSession.current === next.sessionId)
        return;
      try {
        const history = await harness.history();
        if (!active) return;
        const restored = eventMessages(history.events || []);
        if (restored.length) setMessages(restored);
        loadedSession.current = next.sessionId;
      } catch {
        // Live events remain usable if an old history page cannot be loaded.
      }
    };
    const acceptStatus = (next: HarnessStatus) => {
      if (!active) return;
      setStatus(next);
      setActivity(
        next.online
          ? `中枢在线${next.latency !== null ? ` · ${next.latency} ms` : ""}`
          : next.lastError || `中枢${next.phase}`,
      );
      void loadHistory(next);
    };
    const acceptEvent = (envelope: HarnessEnvelope) => {
      const payload = envelope.payload || {};
      const kind = String(payload.type || "");
      const sessionId = String(payload.sessionId || "");
      if (status?.sessionId && sessionId && status.sessionId !== sessionId) return;
      if (kind === "host/session-status") {
        const nextRunning = Boolean(payload.running);
        setRunning(nextRunning);
        setActivity(nextRunning ? "智能体正在工作" : "智能体空闲");
        return;
      }
      if (kind === "host/agent-error") {
        const message = String(payload.message || "智能体运行失败");
        setRunning(false);
        setActivity(message);
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "system", text: message, time: "ERROR" },
        ]);
        return;
      }
      if (kind === "approval/requested") {
        setApproval({
          rpcId: envelope.rpcId,
          approvalId: String(payload.approvalId || ""),
          toolName: String(payload.toolName || "工具"),
          reason: String(payload.reason || "该操作需要提升权限"),
        });
        setActivity("等待权限审批");
        return;
      }
      if (kind === "approval/resolved") {
        setApproval(null);
        setActivity(`审批结果：${String(payload.outcome || "已处理")}`);
        return;
      }
      if (kind !== "session/event") return;
      const item = (payload.event || {}) as Record<string, unknown>;
      const data = (item.data || {}) as Record<string, unknown>;
      if (item.type === "assistant/chunk") {
        const chunk = (data.chunk || {}) as Record<string, unknown>;
        if (chunk.type === "text-delta" && typeof chunk.text === "string") {
          const id = streamId.current || `stream-${crypto.randomUUID()}`;
          streamId.current = id;
          setMessages((current) => {
            const index = current.findIndex((message) => message.id === id);
            if (index < 0)
              return [
                ...current,
                { id, role: "assistant", text: chunk.text as string, time: "LIVE" },
              ];
            return current.map((message, messageIndex) =>
              messageIndex === index
                ? { ...message, text: message.text + String(chunk.text) }
                : message,
            );
          });
        } else if (chunk.type === "reasoning-delta") setActivity("正在分析任务");
      } else if (item.type === "assistant/message") {
        const message = (data.message || data) as Record<string, unknown>;
        const committed = contentText(message.content);
        if (committed) {
          const currentStream = streamId.current;
          setMessages((current) => {
            if (currentStream && current.some((entry) => entry.id === currentStream))
              return current.map((entry) =>
                entry.id === currentStream
                  ? { ...entry, text: committed, time: "NEXUS" }
                  : entry,
              );
            return [
              ...current,
              {
                id: `assistant-${String(item.seq ?? crypto.randomUUID())}`,
                role: "assistant",
                text: committed,
                time: "NEXUS",
              },
            ];
          });
        }
        streamId.current = null;
      } else if (item.type === "tool/call") {
        setActivity(`正在调用工具：${String(data.name || data.toolName || "未知工具")}`);
      } else if (item.type === "tool/result") {
        setActivity("工具执行完成，正在整理结果");
      } else if (item.type === "turn/end") {
        setRunning(false);
        setActivity("本轮任务完成");
        streamId.current = null;
      }
    };
    const offStatus = harness.onStatus(acceptStatus);
    const offEvent = harness.onEvent(acceptEvent);
    void harness.status().then(acceptStatus).catch((error) => {
      setActivity(error instanceof Error ? error.message : "中枢状态读取失败");
    });
    return () => {
      active = false;
      offStatus();
      offEvent();
    };
  }, [setMessages, status?.sessionId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = text.trim();
    if (!next) return;
    const time = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: next, time },
    ]);
    setText("");
    const harness = desktopHarness();
    if (!harness) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: "桌面 Harness 桥接不可用。",
          time,
        },
      ]);
      return;
    }
    setRunning(true);
    setActivity("正在提交给智能体中枢");
    try {
      await harness.send(next, running ? "steer" : "queue");
    } catch (error) {
      setRunning(false);
      const message = error instanceof Error ? error.message : "消息发送失败";
      setActivity(message);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "system", text: message, time: "ERROR" },
      ]);
    }
  }

  async function answerApproval(outcome: "allowed-once" | "rejected") {
    const harness = desktopHarness();
    if (!harness || !approval) return;
    await harness.approve({ ...approval, outcome });
    setApproval(null);
  }

  return (
    <div className="chat-widget">
      <div className={`chat-runtime ${status?.online ? "online" : "offline"}`}>
        <span>
          <i />
          <b>{status?.online ? "DEEPSEEK HARNESS" : "HARNESS OFFLINE"}</b>
          <small>{activity}</small>
        </span>
        {running && (
          <button onClick={() => void desktopHarness()?.cancel()}>■ 实时停止</button>
        )}
      </div>
      <div
        ref={historyRef}
        className="chat-history"
        onScroll={(event) => {
          const history = event.currentTarget;
          followLatest.current =
            history.scrollHeight - history.scrollTop - history.clientHeight < 48;
        }}
      >
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <small>
              {message.role === "user" ? "YOU" : "NEXUS"} · {message.time}
            </small>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      {approval && (
        <div className="chat-approval">
          <span>
            <b>{approval.toolName} 请求权限</b>
            <small>{approval.reason}</small>
          </span>
          <button onClick={() => void answerApproval("rejected")}>拒绝</button>
          <button className="allow" onClick={() => void answerApproval("allowed-once")}>
            允许一次
          </button>
        </div>
      )}
      <form className="quick-entry" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="输入消息…"
        />
        <button disabled={!text.trim()}>{running ? "追加" : "发送"}</button>
      </form>
    </div>
  );
}

export function TaskbarWidget() {
  const [plans, setPlans] = useLocalState<Plan[]>("nexus-plans", []);
  const pending = plans.filter((plan) => !plan.done);
  return (
    <div className="taskbar-widget">
      <div className="task-summary">
        <strong>{pending.length}</strong>
        <span>待处理任务</span>
      </div>
      <div className="task-chips">
        {pending.length === 0 && (
          <span className="quiet">计划管理中添加的任务会出现在这里</span>
        )}
        {pending.slice(0, 5).map((plan) => (
          <button
            key={plan.id}
            onClick={() =>
              setPlans(
                plans.map((item) =>
                  item.id === plan.id ? { ...item, done: true } : item,
                ),
              )
            }
          >
            <i />
            {plan.title}
            <small>完成</small>
          </button>
        ))}
      </div>
    </div>
  );
}

type LiveHotItem = { title: string; link: string; detail: string };
type HotCategory = "global" | "douyin" | "xiaohongshu" | "weibo";
type HotResult = {
  ok: boolean;
  global: LiveHotItem[];
  weibo: LiveHotItem[];
  checkedAt: number;
  errors: string[];
};

export function HotspotsWidget() {
  const [keywords, setKeywords] = useLocalState<string[]>(
    "nexus-hotspot-keywords",
    ["AI Agent", "Hermes"],
  );
  const [text, setText] = useState("");
  const [category, setCategory] = useState<HotCategory>("global");
  const [live, setLive] = useState<HotResult | null>(null);
  const [status, setStatus] = useState("等待真实数据源");
  function add(event: FormEvent) {
    event.preventDefault();
    const next = text.trim();
    if (next && !keywords.includes(next)) setKeywords([...keywords, next]);
    setText("");
  }
  async function refresh() {
    const desktop = (
      window as unknown as {
        nexusDesktop?: { hotspots?: { sync(): Promise<HotResult> } };
      }
    ).nexusDesktop;
    if (!desktop?.hotspots) {
      setStatus("实时抓取需要桌面安装版；关键词搜索链接仍可用");
      return;
    }
    setStatus("正在读取真实热点源…");
    const result = await desktop.hotspots.sync();
    setLive(result);
    setStatus(
      result.ok
        ? "真实数据已更新 · " +
            new Date(result.checkedAt).toLocaleTimeString("zh-CN")
        : result.errors.join("；"),
    );
  }
  useEffect(() => {
    const starter = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(starter);
  }, []);
  function openExternal(url: string) {
    const desktop = (
      window as unknown as {
        nexusDesktop?: { external?: { open(url: string): Promise<boolean> } };
      }
    ).nexusDesktop;
    if (desktop?.external) void desktop.external.open(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }
  const searchItems: Record<HotCategory, LiveHotItem[]> = {
    global: keywords.map((keyword) => ({
      title: keyword,
      detail: "Google 新闻搜索",
      link:
        "https://www.google.com/search?tbm=nws&q=" +
        encodeURIComponent(keyword),
    })),
    douyin: keywords.map((keyword) => ({
      title: keyword,
      detail: "抖音站内搜索",
      link: "https://www.douyin.com/search/" + encodeURIComponent(keyword),
    })),
    xiaohongshu: keywords.map((keyword) => ({
      title: keyword,
      detail: "小红书站内搜索",
      link:
        "https://www.xiaohongshu.com/search_result?keyword=" +
        encodeURIComponent(keyword),
    })),
    weibo: keywords.map((keyword) => ({
      title: keyword,
      detail: "微博站内搜索",
      link: "https://s.weibo.com/weibo?q=" + encodeURIComponent(keyword),
    })),
  };
  const items =
    category === "global" && live?.global.length
      ? live.global
      : category === "weibo" && live?.weibo.length
        ? live.weibo
        : searchItems[category];
  const portals: Record<HotCategory, string> = {
    global: "https://trends.google.com/trending",
    douyin: "https://www.douyin.com/hot",
    xiaohongshu: "https://www.xiaohongshu.com/explore",
    weibo: "https://s.weibo.com/top/summary",
  };
  return (
    <div className="hotspot-widget hotspot-v2">
      <form className="quick-entry" onSubmit={add}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="添加监控关键词…"
        />
        <button>监控</button>
      </form>
      <div className="keyword-row">
        {keywords.map((keyword) => (
          <button
            key={keyword}
            onClick={() =>
              setKeywords(keywords.filter((item) => item !== keyword))
            }
          >
            #{keyword} ×
          </button>
        ))}
      </div>
      <div className="hotspot-tabs">
        {(
          [
            ["global", "全球热点"],
            ["douyin", "抖音"],
            ["xiaohongshu", "小红书"],
            ["weibo", "微博"],
          ] as [HotCategory, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={category === id ? "active" : ""}
            onClick={() => setCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="hotspot-content-head">
        <span>
          {category === "global" && live?.global.length
            ? "Google Trends 实时源"
            : category === "weibo" && live?.weibo.length
              ? "微博热搜真实页面"
              : "自定义关键词官方搜索"}
        </span>
        <button onClick={() => openExternal(portals[category])}>
          打开平台热榜 ↗
        </button>
      </div>
      <div className="hotspot-cards">
        {items.map((item, index) => (
          <button
            key={item.link + index}
            onClick={() => openExternal(item.link)}
          >
            <b>{String(index + 1).padStart(2, "0")}</b>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <em>详情 ↗</em>
          </button>
        ))}
        {!items.length && <Empty text="添加监控关键词后生成官方搜索入口" />}
      </div>
      <div className="hotspot-footer">
        <button className="refresh-data" onClick={refresh}>
          刷新真实数据
        </button>
        <small>{status}</small>
      </div>
      {!!live?.errors.length && (
        <p className="data-disclaimer">{live.errors.join("；")}</p>
      )}
    </div>
  );
}

type GraphNode = { id: string; title: string; links: string[] };
type FsFile = { kind: "file"; name: string; getFile(): Promise<File> };
type FsDirectory = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FsFile | FsDirectory>;
};

export function ObsidianWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [vaultName, setVaultName] = useState("尚未连接 Vault");
  const [status, setStatus] = useState("选择本地 Obsidian 文件夹后生成关系网");

  async function connectVault() {
    const picker = (
      window as unknown as { showDirectoryPicker?: () => Promise<FsDirectory> }
    ).showDirectoryPicker;
    if (!picker) {
      setStatus("当前浏览器不支持文件夹授权，请使用新版外部 Chrome");
      return;
    }
    try {
      const directory = await picker();
      setVaultName(directory.name);
      setStatus("正在扫描 Markdown 文件…");
      const files: GraphNode[] = [];
      async function scan(folder: FsDirectory) {
        for await (const entry of folder.values()) {
          if (files.length >= 250) return;
          if (entry.kind === "directory" && !entry.name.startsWith("."))
            await scan(entry);
          if (
            entry.kind === "file" &&
            entry.name.toLowerCase().endsWith(".md")
          ) {
            const file = await entry.getFile();
            const content = await file.text();
            const title = entry.name.replace(/\.md$/i, "");
            const links = [
              ...content.matchAll(/\[\[([^\]|#]+)(?:[\]|#][^\]]*)?\]\]/g),
            ].map((match) => match[1].trim());
            files.push({ id: `${files.length}-${title}`, title, links });
          }
        }
      }
      await scan(directory);
      setNodes(files);
      setStatus(`已读取 ${files.length} 个笔记，最多展示 250 个`);
    } catch (error) {
      setStatus(
        error instanceof Error && error.name === "AbortError"
          ? "已取消文件夹选择"
          : "读取失败，请重新授权",
      );
    }
  }

  const graph = useMemo(() => {
    const visible = nodes.slice(0, 80);
    const byTitle = new Map(
      visible.map((node, index) => [node.title.toLowerCase(), index]),
    );
    const edges: [number, number][] = [];
    visible.forEach((node, from) =>
      node.links.forEach((link) => {
        const to = byTitle.get(link.toLowerCase());
        if (to !== undefined && to !== from) edges.push([from, to]);
      }),
    );
    return { visible, edges };
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const draw = () => {
      const rect = parent.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const cx = rect.width / 2,
        cy = rect.height / 2,
        radius = Math.min(rect.width, rect.height) * 0.36;
      const points = graph.visible.map((_, index) => {
        const angle = index * 2.39996;
        const r =
          radius * Math.sqrt((index + 1) / Math.max(1, graph.visible.length));
        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
      });
      ctx.strokeStyle = "rgba(57,244,222,.18)";
      ctx.lineWidth = 0.7;
      graph.edges.forEach(([from, to]) => {
        ctx.beginPath();
        ctx.moveTo(points[from].x, points[from].y);
        ctx.lineTo(points[to].x, points[to].y);
        ctx.stroke();
      });
      points.forEach((point, index) => {
        ctx.beginPath();
        ctx.fillStyle = index < 8 ? "#39f4de" : "rgba(155,210,211,.7)";
        ctx.arc(point.x, point.y, index < 8 ? 3 : 1.8, 0, Math.PI * 2);
        ctx.fill();
        if (index < 8) {
          ctx.fillStyle = "rgba(210,242,244,.8)";
          ctx.font = "9px monospace";
          ctx.fillText(
            graph.visible[index].title.slice(0, 12),
            point.x + 6,
            point.y + 3,
          );
        }
      });
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [graph]);

  return (
    <div className="obsidian-widget">
      <canvas ref={canvasRef} />
      <div className="vault-controls">
        <div>
          <b>{vaultName}</b>
          <small>{status}</small>
        </div>
        <button onClick={connectVault}>
          {nodes.length ? "重新选择" : "连接本地 Vault"}
        </button>
      </div>
      {nodes.length === 0 && (
        <div className="graph-empty">
          <span>◎</span>
          <b>OBSIDIAN KNOWLEDGE GRAPH</b>
          <small>文件只在本机浏览器中读取，不上传服务器</small>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
