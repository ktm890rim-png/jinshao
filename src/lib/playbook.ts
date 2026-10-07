import type { Bar, Side } from "./indicators/types.ts";
import { backtest, summarize, type TradeStat } from "./terminal.ts";

export type Zone = { kind: "demand" | "supply"; low: number; high: number };

/** Nearest fresh supply or demand. One zone, not a screen full of boxes. */
export function nearestZone(bars: Bar[], price: number): Zone | null {
  let best: Zone & { dist: number } | null = null;
  for (let i = 2; i < bars.length - 3; i++) {
    const candle = bars[i];
    const next = bars.slice(i + 1, i + 4);
    if (!candle || next.length < 3) continue;
    const bear = candle.c < candle.o;
    const bull = candle.c > candle.o;
    const brokeUp = bear && next.some((bar) => bar.c > candle.h);
    const brokeDown = bull && next.some((bar) => bar.c < candle.l);
    if (!brokeUp && !brokeDown) continue;
    const low = Math.min(candle.o, candle.c);
    const high = Math.max(candle.o, candle.c);
    const later = bars.slice(i + 4);
    const mitigated = brokeUp ? later.some((bar) => bar.l < low) : later.some((bar) => bar.h > high);
    if (mitigated) continue;
    const kind = brokeUp ? "demand" : "supply";
    const dist = price > high ? price - high : price < low ? low - price : 0;
    if (!best || dist < best.dist) best = { kind, low, high, dist };
  }
  return best ? { kind: best.kind, low: best.low, high: best.high } : null;
}

export type Rule = { side: Side; sweep: boolean; volume: boolean };

export function describeRule(rule: Rule): string {
  const bits = [rule.side === "long" ? "只做多" : "只做空"];
  if (rule.sweep) bits.push("要扫过流动性再收回");
  if (rule.volume) bits.push("要放量");
  bits.push("顺 21/55 均线回踩");
  return bits.join("，");
}

/** Replay one written rule. This is the same backtest, filtered. It does not invent a win rate. */
export function replayRule(bars: Bar[], rule: Rule): { text: string; sample: TradeStat[]; forward: TradeStat[] } {
  const report = backtest(bars);
  const keep = (item: TradeStat) => item.side === rule.side;
  const sample = report.trades.filter(keep);
  const forward = report.forward.filter(keep);
  const fit = summarize(sample);
  const held = summarize(forward);
  if (!fit.n && !held.n) {
    return { text: `${describeRule(rule)}。这段 K 线里没有走出这种单。`, sample, forward };
  }
  return {
    text: `${describeRule(rule)}。归纳 ${fit.n} 笔，胜率 ${Math.round(fit.win * 100)}%，平均 ${fit.avgR.toFixed(2)} 倍风险。留出的一段 ${held.n} 笔。`,
    sample,
    forward,
  };
}

export type Note = { at: number; grade: string; side: string; score: number; why: string };

export function reviewNotes(notes: Note[]): string {
  if (notes.length < 3) return "记下的判断还不到 3 条，先不复盘。";
  const no = notes.filter((item) => item.grade === "NO").length;
  const traded = notes.filter((item) => item.grade === "A+" || item.grade === "A");
  const flips = notes.slice(1).filter((item, i) => item.side !== "flat" && notes[i].side !== "flat" && item.side !== notes[i].side).length;
  const quiet = no / notes.length;
  const bits = [`最近 ${notes.length} 条里，${no} 条是禁止交易。`];
  if (quiet >= 0.6) bits.push("大部分时间在按兵，这是对的。");
  if (!traded.length) bits.push("还没有 A 档以上的计划。");
  if (flips >= 2) bits.push("方向来回变，这种时候不追。");
  return bits.join("");
}
