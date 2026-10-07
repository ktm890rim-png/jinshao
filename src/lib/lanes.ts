import { WEEK } from "./calendar.ts";
import type { Bar, Side } from "./indicators/types.ts";
import type { Pipeline } from "./pipeline.ts";

const MUTE_BEFORE = 15 * 60_000;
const MUTE_AFTER = 5 * 60_000;
const DOWN_BEFORE = 60 * 60_000;
const DOWN_AFTER = 20 * 60_000;
const SPREAD_CAP = 1.5;
const LATENCY_CAP = 3000;
const STALE_CAP = 8000;
const GAP_ATR = 2.2;
const SLIPPAGE = 1.5;
const HOOK_TTL = 15 * 60_000;
const COOLDOWN = 15 * 60_000;

export type NewsKind = "mute" | "downgrade" | "conflict" | "abstain";

export type NewsLane = {
  kind: NewsKind;
  note: string;
  eventTitle: string | null;
  nextTitle: string | null;
  nextAt: number | null;
};

export type MechSwitch = { id: string; name: string; pass: boolean; reason: string };

export type MechLane = { switches: MechSwitch[]; veto: boolean; reason: string };

export type TvHook = {
  secret: string;
  name: string;
  interval: string;
  side: Side;
  price: number;
  at: number;
};

export type TvRole = "confirm" | "conflict" | "mismatch" | "abstain";

export type TvLane = { role: TvRole; note: string; name: string | null; at: number | null };

export type DeskGrade = "正式" | "预备" | "无";
export type MonitorState = "观察" | "预备" | "冷却" | "静音";

export type Judgment = {
  grade: DeskGrade;
  state: MonitorState;
  missing: string;
  lines: string[];
};

/** Calendar only. No direction, so this lane cannot open a trade. */
export function newsLane(now: number): NewsLane {
  const hot = WEEK.filter((item) => item.risk >= 4);
  const next = hot.find((item) => item.at >= now) ?? null;
  let mute: (typeof hot)[number] | null = null;
  let down: (typeof hot)[number] | null = null;
  for (const item of hot) {
    const delta = now - item.at;
    if (delta >= -MUTE_BEFORE && delta <= MUTE_AFTER) mute = item;
    else if (delta >= -DOWN_BEFORE && delta <= DOWN_AFTER) down = item;
  }
  const nextTitle = next?.title ?? null;
  const nextAt = next?.at ?? null;
  if (mute) {
    return {
      kind: "mute",
      note: `${mute.title}公布前 15 分钟到公布后 5 分钟，正式信号降为预备。这是日历规则。`,
      eventTitle: mute.title,
      nextTitle,
      nextAt,
    };
  }
  if (down) {
    return {
      kind: "downgrade",
      note: `${down.title}还在高影响窗口，只降级，不开仓。`,
      eventTitle: down.title,
      nextTitle,
      nextAt,
    };
  }
  return { kind: "abstain", note: "消息面不表态，也不能单独开仓。", eventTitle: null, nextTitle, nextAt };
}

export function mechanismLane(input: { spread: number | null; latencyMs: number | null; quoteAt: number | null; bars: Bar[]; now: number }): MechLane {
  const switches: MechSwitch[] = [];
  if (input.spread == null || !Number.isFinite(input.spread)) {
    switches.push({ id: "spread", name: "点差", pass: true, reason: "点差没接到，这一层不否决。" });
  } else if (input.spread > SPREAD_CAP) {
    switches.push({ id: "spread", name: "点差", pass: false, reason: `点差 ${input.spread.toFixed(2)}，超过 ${SPREAD_CAP.toFixed(2)}，停正式信号。` });
  } else {
    switches.push({ id: "spread", name: "点差", pass: true, reason: `点差 ${input.spread.toFixed(2)}，没过线。` });
  }

  const age = input.quoteAt == null ? null : input.now - input.quoteAt;
  if (input.latencyMs == null && age == null) {
    switches.push({ id: "latency", name: "延迟", pass: true, reason: "延迟没接到，这一层不否决。" });
  } else if ((input.latencyMs ?? 0) > LATENCY_CAP || (age ?? 0) > STALE_CAP) {
    const why = (age ?? 0) > STALE_CAP ? `报价停了 ${Math.round((age ?? 0) / 1000)} 秒` : `来回延迟 ${Math.round(input.latencyMs ?? 0)} 毫秒`;
    switches.push({ id: "latency", name: "延迟", pass: false, reason: `${why}，停新信号。` });
  } else {
    switches.push({ id: "latency", name: "延迟", pass: true, reason: `延迟 ${Math.round(input.latencyMs ?? 0)} 毫秒。` });
  }

  if (input.bars.length < 16) {
    switches.push({ id: "gap", name: "跳空", pass: true, reason: "K 线不够，跳空这一层不否决。" });
  } else {
    const window = input.bars.slice(-14);
    const atr = window.reduce((sum, bar) => sum + (bar.h - bar.l), 0) / window.length;
    const closed = input.bars[input.bars.length - 2];
    const prev = input.bars[input.bars.length - 3];
    const gap = Math.abs(closed.o - prev.c);
    if (atr > 0 && gap > atr * GAP_ATR) {
      switches.push({ id: "gap", name: "跳空", pass: false, reason: `跳空 ${gap.toFixed(2)}，超过波动的 ${GAP_ATR} 倍，原触发作废。` });
    } else {
      switches.push({ id: "gap", name: "跳空", pass: true, reason: "没有越过波动的跳空。" });
    }
  }

  const failed = switches.find((item) => !item.pass);
  return { switches, veto: Boolean(failed), reason: failed ? failed.reason : "点差、延迟、跳空都过了。" };
}

export function parseHook(raw: string, now: number): { ok: true; hook: TvHook } | { ok: false; error: string } {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: "不是合法 JSON，丢掉。" };
  }
  if (!body || typeof body !== "object") return { ok: false, error: "字段不全，丢掉。" };
  const row = body as Record<string, unknown>;
  const secret = typeof row.secret === "string" ? row.secret.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const interval = typeof row.interval === "string" ? row.interval.trim() : "";
  const price = typeof row.price === "number" ? row.price : Number(row.price);
  const sideRaw = String(row.side ?? "").toLowerCase();
  const side: Side | null = sideRaw === "long" || sideRaw === "buy" || sideRaw === "多" ? "long" : sideRaw === "short" || sideRaw === "sell" || sideRaw === "空" ? "short" : null;
  if (!secret || !name || !interval || !side || !Number.isFinite(price) || price < 500 || price > 20000) {
    return { ok: false, error: "密钥、指标名、周期、方向、价格缺一个，丢掉。" };
  }
  const at = typeof row.at === "number" && Number.isFinite(row.at) ? row.at : now;
  return { ok: true, hook: { secret, name, interval, side, price, at } };
}

/** Webhook never chooses the trade. It only confirms, conflicts, or stays quiet. */
export function tvLane(hook: TvHook | null, secret: string, side: Side | "flat", price: number | null, now: number): TvLane {
  if (!secret) return { role: "abstain", note: "还没设共享密钥。图只负责看。", name: null, at: null };
  if (!hook) return { role: "abstain", note: "还没有收盘告警。嵌入的图不算信号。", name: null, at: null };
  if (hook.secret !== secret) return { role: "abstain", note: "密钥不符，这条告警已丢掉。", name: null, at: null };
  if (now - hook.at > HOOK_TTL) return { role: "abstain", note: "告警超过十五分钟，不再采用。", name: hook.name, at: hook.at };
  if (price == null || Math.abs(hook.price - price) > SLIPPAGE) {
    const gap = price == null ? "未知" : Math.abs(hook.price - price).toFixed(2);
    return { role: "mismatch", note: `告警价和现价差了 ${gap}，超过 ${SLIPPAGE}，记为不一致。`, name: hook.name, at: hook.at };
  }
  if (side === "flat") return { role: "abstain", note: `${hook.name} 有告警，主触发还没成立，只记日志。`, name: hook.name, at: hook.at };
  if (hook.side === side) return { role: "confirm", note: `外部确认 · ${hook.name} · ${hook.interval}`, name: hook.name, at: hook.at };
  return { role: "conflict", note: `和 ${hook.name}（${hook.interval}）方向相反，降为预备。`, name: hook.name, at: hook.at };
}

function seatScore(pipe: Pipeline, id: string): number {
  return pipe.seats.find((item) => item.id === id)?.score ?? 0;
}

export function judgeLanes(input: {
  pipe: Pipeline;
  news: NewsLane;
  mech: MechLane;
  tv: TvLane;
  community?: { role: "confirm" | "conflict" | "abstain"; note: string };
  lastSignalAt: number | null;
  now: number;
  confirmed?: boolean;
}): Judgment {
  const { pipe, news, mech, tv } = input;
  const community = input.community ?? { role: "abstain" as const, note: "" };
  const confirmed = input.confirmed === true;
  const cooling = input.lastSignalAt != null && input.now - input.lastSignalAt >= 0 && input.now - input.lastSignalAt < COOLDOWN;
  const setup = pipe.verdict === "deliver" && pipe.side !== "flat" && pipe.entry != null && pipe.stop != null;
  let missing = "没有缺的";
  if (seatScore(pipe, "data") < 0.5) missing = "数据质量";
  else if (seatScore(pipe, "facts") < 0.4) missing = "时段";
  else if (news.kind === "mute" || news.kind === "downgrade" || news.kind === "conflict") missing = "消息面";
  else if (mech.veto) missing = "机制";
  else if (pipe.side === "flat") missing = "方向";
  else if (pipe.verdict !== "deliver") missing = "触发";
  else if (tv.role === "conflict" || community.role === "conflict") missing = "外部确认";
  else if (seatScore(pipe, "face") < 0.7) missing = "风险收益";
  else if (cooling) missing = "冷却";
  else if (setup && !confirmed) missing = "人工确认";

  const blocked = !setup || mech.veto || news.kind === "mute" || news.kind === "downgrade" || news.kind === "conflict" || tv.role === "conflict" || community.role === "conflict" || cooling || !confirmed;
  let grade: DeskGrade = "无";
  if (setup && !mech.veto && !blocked) grade = "正式";
  else if (setup && !mech.veto && (news.kind !== "abstain" || tv.role === "conflict" || community.role === "conflict" || cooling || !confirmed)) grade = "预备";

  let state: MonitorState = "观察";
  if (news.kind === "mute") state = "静音";
  else if (cooling && grade !== "正式") state = "冷却";
  else if (grade === "预备") state = "预备";

  const lines: string[] = [];
  if (setup && news.kind === "abstain") lines.push("消息不冲突");
  else if (news.kind !== "abstain") lines.push(news.note);
  if (tv.role !== "abstain") lines.push(tv.note);
  if (community.role !== "abstain") lines.push(community.note);
  if (mech.veto) lines.push(mech.reason);
  if (cooling && grade !== "正式") lines.push("还在冷却，不新开正式信号。");
  if (grade === "预备" && missing === "人工确认") lines.push("主循环只出草稿。上层关着，要你确认才交给机器人。");

  return { grade, state, missing, lines };
}
