import type { Condition, ExitSpec, Indicator, Logic, Operand, Op, Side, Source, Timeframe } from "./types.ts";

const BARE = new Set(["close", "open", "high", "low", "macd_hist", "macd_line", "macd_signal", "hour_utc"]);
const LEN = new Set(["ema", "sma", "rsi", "atr", "bb_pct", "bb_upper", "bb_lower", "bb_basis", "highest", "lowest", "roc"]);
const OPS = new Set(["gt", "lt", "gte", "lte", "cross_up", "cross_down"]);

function rec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clamp(n: number, lo: number, hi: number, d: number): number {
  if (!Number.isFinite(n)) return d;
  return Math.min(hi, Math.max(lo, n));
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function stableId(url: string, side: string): string {
  let h = 2166136261;
  const s = `${url}|${side}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `src_${(h >>> 0).toString(36)}`;
}

export function readOperand(v: unknown): Operand | null {
  if (!rec(v) || typeof v.type !== "string") return null;
  if (BARE.has(v.type)) return { type: v.type as "close" };
  if (v.type === "const") {
    const value = Number(v.value);
    if (!Number.isFinite(value)) return null;
    return { type: "const", value };
  }
  if (LEN.has(v.type)) {
    const length = Math.min(400, Math.max(1, Math.round(Number(v.length) || 14)));
    return { type: v.type as "ema", length };
  }
  return null;
}

export type DraftMeta = {
  id?: string;
  source: Source;
  sourceUrl?: string;
  sourceNote: string;
  armed?: boolean;
};

export function sanitizeIndicator(v: unknown, meta: DraftMeta): Indicator | null {
  if (!rec(v)) return null;
  const side: Side = v.side === "short" ? "short" : v.side === "long" ? "long" : "long";
  if (v.side !== "long" && v.side !== "short") return null;
  const tf: Timeframe = v.timeframe === "5m" || v.timeframe === "1h" ? v.timeframe : "15m";
  const logic: Logic = v.logic === "any" ? "any" : "all";
  const rawConds = Array.isArray(v.conditions) ? v.conditions : [];
  const conditions: Condition[] = [];
  for (const c of rawConds.slice(0, 4)) {
    if (!rec(c)) continue;
    const left = readOperand(c.left);
    const right = readOperand(c.right);
    if (!left || !right || typeof c.op !== "string" || !OPS.has(c.op)) continue;
    conditions.push({
      id: makeId("c"),
      label: String(c.label ?? "条件").slice(0, 16),
      left,
      op: c.op as Op,
      right,
    });
  }
  if (!conditions.length) return null;
  const ex = rec(v.exit) ? v.exit : {};
  const exit: ExitSpec = {
    stopAtrMult: clamp(Number(ex.stopAtrMult), 0.4, 5, 1.4),
    atrLength: Math.round(clamp(Number(ex.atrLength), 5, 50, 14)),
    targetR: clamp(Number(ex.targetR), 0.8, 6, 2),
  };
  const name = String(v.name ?? "").trim().slice(0, 16);
  if (!name) return null;
  return {
    id: meta.id || (meta.sourceUrl ? stableId(meta.sourceUrl, side) : makeId("ind")),
    name,
    thesis: String(v.thesis ?? "").slice(0, 180),
    sourceNote: meta.sourceNote.slice(0, 500),
    source: meta.source,
    sourceUrl: meta.sourceUrl,
    side,
    timeframe: tf,
    armed: Boolean(meta.armed),
    logic,
    conditions,
    exit,
    updatedAt: Date.now(),
  };
}

export function parseModelIndicators(text: string, meta: Omit<DraftMeta, "id">): Indicator[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : rec(data) && Array.isArray(data.indicators) ? data.indicators : [data];
  const out: Indicator[] = [];
  for (const item of list) {
    const ind = sanitizeIndicator(item, meta);
    if (ind) out.push(ind);
  }
  return out.slice(0, 2);
}

function grab(text: string, re: RegExp, fallback: number): number {
  const m = text.match(re);
  return m ? Number(m[1]) : fallback;
}

export function draftFromText(text: string, meta: Omit<DraftMeta, "id">): Indicator[] {
  if (!/(@version|indicator\s*\(|strategy\s*\(|ta\.|rsi|ema|sma|macd)/i.test(text)) return [];
  const rsiLen = grab(text, /rsi\w*\s*=\s*input\.int\((\d+)/i, 14);
  const oversold = grab(text, /oversold\w*\s*=\s*input\.int\((\d+)/i, 30);
  const overbought = grab(text, /overbought\w*\s*=\s*input\.int\((\d+)/i, 70);
  const ma = grab(text, /ma\w*\s*=\s*input\.int\((\d+)/i, 21);
  const exit: ExitSpec = { stopAtrMult: 1.4, atrLength: 14, targetR: 2 };
  const note = "本地按关键词拼的草稿，不是模型改写。同一根上的多重交叉已改成状态条件。";
  const out: Indicator[] = [];
  if (/buy|long|做多/i.test(text) || !/sell|short|做空/i.test(text)) {
    const ind = sanitizeIndicator(
      {
        name: "草稿·做多",
        thesis: note,
        side: "long",
        timeframe: "15m",
        logic: "all",
        conditions: [
          { label: "RSI 偏低", left: { type: "rsi", length: rsiLen }, op: "lte", right: { type: "const", value: Math.min(45, oversold + 12) } },
          { label: "柱为正", left: { type: "macd_hist" }, op: "gt", right: { type: "const", value: 0 } },
          { label: "价在均线上", left: { type: "close" }, op: "gt", right: { type: "sma", length: ma } },
        ],
        exit,
      },
      meta,
    );
    if (ind) out.push(ind);
  }
  if (/sell|short|做空/i.test(text)) {
    const ind = sanitizeIndicator(
      {
        name: "草稿·做空",
        thesis: note,
        side: "short",
        timeframe: "15m",
        logic: "all",
        conditions: [
          { label: "RSI 偏高", left: { type: "rsi", length: rsiLen }, op: "gte", right: { type: "const", value: Math.max(55, overbought - 12) } },
          { label: "柱为负", left: { type: "macd_hist" }, op: "lt", right: { type: "const", value: 0 } },
          { label: "价在均线下", left: { type: "close" }, op: "lt", right: { type: "sma", length: ma } },
        ],
        exit,
      },
      meta,
    );
    if (ind) out.push(ind);
  }
  return out.slice(0, 2);
}

export function blankIndicator(): Indicator {
  return {
    id: makeId("note"),
    name: "未命名",
    thesis: "手写规则，武装之后才参与套行情。",
    sourceNote: "",
    source: "note",
    side: "long",
    timeframe: "15m",
    armed: false,
    logic: "all",
    conditions: [
      {
        id: "c_blank",
        label: "站上均线",
        left: { type: "close" },
        op: "gt",
        right: { type: "ema", length: 21 },
      },
    ],
    exit: { stopAtrMult: 1.4, atrLength: 14, targetR: 2 },
    updatedAt: Date.now(),
  };
}

export const OPERANDS: { type: Operand["type"]; label: string }[] = [
  { type: "close", label: "收盘" },
  { type: "open", label: "开盘" },
  { type: "high", label: "最高" },
  { type: "low", label: "最低" },
  { type: "ema", label: "EMA" },
  { type: "sma", label: "SMA" },
  { type: "rsi", label: "RSI" },
  { type: "atr", label: "ATR" },
  { type: "macd_hist", label: "MACD柱" },
  { type: "macd_line", label: "MACD线" },
  { type: "macd_signal", label: "MACD信号" },
  { type: "bb_pct", label: "布林%B" },
  { type: "bb_upper", label: "布林上轨" },
  { type: "bb_lower", label: "布林下轨" },
  { type: "bb_basis", label: "布林中轨" },
  { type: "highest", label: "前高" },
  { type: "lowest", label: "前低" },
  { type: "roc", label: "涨跌幅%" },
  { type: "const", label: "常数" },
  { type: "hour_utc", label: "UTC小时" },
];

export const OP_LABEL: Record<Op, string> = {
  gt: "大于",
  lt: "小于",
  gte: "大于等于",
  lte: "小于等于",
  cross_up: "上穿",
  cross_down: "下穿",
};

const LEN_TYPES = new Set(["ema", "sma", "rsi", "atr", "bb_pct", "bb_upper", "bb_lower", "bb_basis", "highest", "lowest", "roc"]);

export function operandNeedsLength(op: Operand): op is Extract<Operand, { length: number }> {
  return LEN_TYPES.has(op.type);
}

export function operandWithType(type: Operand["type"]): Operand {
  if (type === "const") return { type: "const", value: 0 };
  if (LEN_TYPES.has(type)) return { type: type as "ema", length: type === "rsi" ? 14 : 21 };
  return { type: type as "close" };
}
