import { resample } from "./bars.ts";
import { atr, ema, highest, lowest, roc, rsi, sma, stdev } from "./math.ts";
import type { Bar, Condition, EvalHit, Indicator, Operand } from "./types.ts";
import { TF_MIN, TF_MS } from "./types.ts";

function lastClosed(bars: Bar[], tfMs: number, now: number): number {
  for (let i = bars.length - 1; i >= 0; i--) {
    if (now >= bars[i].t + tfMs) return i;
  }
  return -1;
}

function seriesFor(bars: Bar[], op: Operand, cache: Map<string, number[]>): number[] | null {
  if (op.type === "const" || op.type === "hour_utc") return null;
  const key = "length" in op ? `${op.type}:${op.length}` : op.type;
  const hit = cache.get(key);
  if (hit) return hit;
  const close = bars.map((b) => b.c);
  const high = bars.map((b) => b.h);
  const low = bars.map((b) => b.l);
  let built: number[];
  switch (op.type) {
    case "close":
      built = close;
      break;
    case "open":
      built = bars.map((b) => b.o);
      break;
    case "high":
      built = high;
      break;
    case "low":
      built = low;
      break;
    case "ema":
      built = ema(close, op.length);
      break;
    case "sma":
      built = sma(close, op.length);
      break;
    case "rsi":
      built = rsi(close, op.length);
      break;
    case "atr":
      built = atr(high, low, close, op.length);
      break;
    case "roc":
      built = roc(close, op.length);
      break;
    case "highest":
      built = highest(high, op.length);
      break;
    case "lowest":
      built = lowest(low, op.length);
      break;
    case "bb_pct":
    case "bb_upper":
    case "bb_lower":
    case "bb_basis": {
      const mid = sma(close, op.length);
      const sd = stdev(close, op.length);
      built = close.map((c, i) => {
        if (!Number.isFinite(mid[i]) || !Number.isFinite(sd[i])) return Number.NaN;
        const upper = mid[i] + 2 * sd[i];
        const lower = mid[i] - 2 * sd[i];
        if (op.type === "bb_basis") return mid[i];
        if (op.type === "bb_upper") return upper;
        if (op.type === "bb_lower") return lower;
        const w = upper - lower;
        return w === 0 ? Number.NaN : (c - lower) / w;
      });
      break;
    }
    case "macd_line":
    case "macd_signal":
    case "macd_hist": {
      const fast = ema(close, 12);
      const slow = ema(close, 26);
      const line = fast.map((f, i) => (Number.isFinite(f) && Number.isFinite(slow[i]) ? f - slow[i] : Number.NaN));
      const signal = ema(line, 9);
      built =
        op.type === "macd_line"
          ? line
          : op.type === "macd_signal"
            ? signal
            : line.map((v, i) => (Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : Number.NaN));
      break;
    }
    default:
      built = close.map(() => Number.NaN);
  }
  cache.set(key, built);
  return built;
}

function at(bars: Bar[], op: Operand, i: number, cache: Map<string, number[]>): number {
  if (op.type === "const") return op.value;
  if (op.type === "hour_utc") return new Date(bars[i].t).getUTCHours();
  const s = seriesFor(bars, op, cache);
  return s ? s[i] : Number.NaN;
}

function pass(cond: Condition, bars: Bar[], i: number, cache: Map<string, number[]>): boolean {
  const l = at(bars, cond.left, i, cache);
  const r = at(bars, cond.right, i, cache);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
  if (cond.op === "gt") return l > r;
  if (cond.op === "lt") return l < r;
  if (cond.op === "gte") return l >= r;
  if (cond.op === "lte") return l <= r;
  if (i < 1) return false;
  const lp = at(bars, cond.left, i - 1, cache);
  const rp = at(bars, cond.right, i - 1, cache);
  if (!Number.isFinite(lp) || !Number.isFinite(rp)) return false;
  if (cond.op === "cross_up") return lp <= rp && l > r;
  return lp >= rp && l < r;
}

const OVERLAYS = new Set(["ema", "sma", "bb_upper", "bb_lower", "bb_basis"]);
const LINE_COLORS = ["#d4a853", "#f3ecdf", "#e7c98a", "#c45c4a"];

export type ChartLine = { label: string; color: string; values: number[] };
export type ChartMark = { index: number; side: "long" | "short"; name: string };

function overlayLabel(op: Operand): string | null {
  if (!("length" in op) || !OVERLAYS.has(op.type)) return null;
  if (op.type === "ema") return `EMA ${op.length}`;
  if (op.type === "sma") return `SMA ${op.length}`;
  if (op.type === "bb_upper") return `布林上 ${op.length}`;
  if (op.type === "bb_lower") return `布林下 ${op.length}`;
  return `布林中 ${op.length}`;
}

export function chartLayers(indicators: Indicator[], bars5: Bar[], minutes: number): { lines: ChartLine[]; marks: ChartMark[] } {
  const bars = resample(bars5, minutes);
  const wanted = indicators.filter((item) => item.armed && TF_MIN[item.timeframe] === minutes);
  const cache = new Map<string, number[]>();
  const lines: ChartLine[] = [];
  const seen = new Set<string>();
  for (const ind of wanted) {
    for (const cond of ind.conditions) {
      for (const op of [cond.left, cond.right]) {
        const label = overlayLabel(op);
        if (!label || seen.has(label)) continue;
        const values = seriesFor(bars, op, cache);
        if (!values) continue;
        seen.add(label);
        lines.push({ label, color: LINE_COLORS[lines.length % LINE_COLORS.length], values });
        if (lines.length >= 4) break;
      }
      if (lines.length >= 4) break;
    }
    if (lines.length >= 4) break;
  }
  const byBar = new Map<number, ChartMark>();
  const from = Math.max(1, bars.length - 48);
  for (const ind of wanted) {
    for (let i = from; i < bars.length; i++) {
      const oks = ind.conditions.map((cond) => pass(cond, bars, i, cache));
      const hit = oks.length > 0 && (ind.logic === "any" ? oks.some(Boolean) : oks.every(Boolean));
      if (hit) byBar.set(i, { index: i, side: ind.side, name: ind.name });
    }
  }
  return { lines, marks: [...byBar.values()].slice(-8) };
}

export function indicatorEntries(ind: Indicator, bars5: Bar[]): { i: number; side: "long" | "short" }[] {
  const bars = resample(bars5, TF_MIN[ind.timeframe]);
  const cache = new Map<string, number[]>();
  const out: { i: number; side: "long" | "short" }[] = [];
  for (let i = 1; i < bars.length; i++) {
    const oks = ind.conditions.map((cond) => pass(cond, bars, i, cache));
    const hit = oks.length > 0 && (ind.logic === "any" ? oks.some(Boolean) : oks.every(Boolean));
    if (!hit) continue;
    const prev = ind.conditions.map((cond) => pass(cond, bars, i - 1, cache));
    const prevHit = prev.length > 0 && (ind.logic === "any" ? prev.some(Boolean) : prev.every(Boolean));
    if (!prevHit) out.push({ i, side: ind.side });
  }
  return out;
}

export function evaluate(ind: Indicator, bars5: Bar[], now: number): EvalHit {
  const bars = resample(bars5, TF_MIN[ind.timeframe]);
  const i = lastClosed(bars, TF_MS[ind.timeframe], now);
  const cache = new Map<string, number[]>();
  const met =
    i < 0
      ? ind.conditions.map((c) => ({ label: c.label, ok: false }))
      : ind.conditions.map((c) => ({ label: c.label, ok: pass(c, bars, i, cache) }));
  const oks = met.filter((m) => m.ok).length;
  const hit = ind.conditions.length > 0 && (ind.logic === "all" ? oks === met.length : oks > 0);
  let entry: number | null = null;
  let stop: number | null = null;
  let target: number | null = null;
  if (i >= 0) {
    const price = bars[i].c;
    const atrLen = Math.min(100, Math.max(2, Math.round(ind.exit.atrLength)));
    const a = atr(
      bars.map((b) => b.h),
      bars.map((b) => b.l),
      bars.map((b) => b.c),
      atrLen,
    )[i];
    const risk = a * ind.exit.stopAtrMult;
    if (Number.isFinite(risk) && risk > 0) {
      entry = price;
      stop = ind.side === "long" ? price - risk : price + risk;
      target = ind.side === "long" ? price + risk * ind.exit.targetR : price - risk * ind.exit.targetR;
    }
  }
  return {
    id: ind.id,
    name: ind.name,
    side: ind.side,
    timeframe: ind.timeframe,
    hit,
    score: met.length ? oks / met.length : 0,
    met,
    barTime: i >= 0 ? bars[i].t : 0,
    entry,
    stop,
    target,
  };
}
