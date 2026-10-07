import { ema, rsi } from "./indicators/math.ts";
import type { Bar, Side } from "./indicators/types.ts";

export type Part = { name: string; score: number; max: number; note: string };

export type Assessment = {
  parts: Part[];
  total: number;
  structure: string;
  liquidity: string;
  flow: string;
  profile: string;
  zone: string;
  session: string;
  divergence: string;
};

export type TradeStat = { side: Side; r: number; hold: number; session: string; regime: string; at: number };

export type Backtest = {
  trades: TradeStat[];
  forward: TradeStat[];
  note: string;
};

type Swing = { i: number; price: number; kind: "high" | "low" };

function atr(bars: Bar[], n = 14): number {
  const slice = bars.slice(-n);
  if (!slice.length) return 0;
  return slice.reduce((sum, bar) => sum + (bar.h - bar.l), 0) / slice.length;
}

function lastFinite(values: number[]): number {
  for (let i = values.length - 1; i >= 0; i--) if (Number.isFinite(values[i])) return values[i];
  return Number.NaN;
}

export function findSwings(bars: Bar[], wing = 2): Swing[] {
  const out: Swing[] = [];
  for (let i = wing; i < bars.length - wing; i++) {
    let high = true;
    let low = true;
    for (let k = 1; k <= wing; k++) {
      if (bars[i - k].h >= bars[i].h || bars[i + k].h > bars[i].h) high = false;
      if (bars[i - k].l <= bars[i].l || bars[i + k].l < bars[i].l) low = false;
    }
    if (high) out.push({ i, price: bars[i].h, kind: "high" });
    else if (low) out.push({ i, price: bars[i].l, kind: "low" });
  }
  return out;
}

function structureText(bars: Bar[]): { text: string; score: number } {
  const points = findSwings(bars);
  const highs = points.filter((item) => item.kind === "high").slice(-2);
  const lows = points.filter((item) => item.kind === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return { text: "摆动点还不够", score: 4 };
  const hh = highs[1].price > highs[0].price;
  const hl = lows[1].price > lows[0].price;
  const lh = highs[1].price < highs[0].price;
  const ll = lows[1].price < lows[0].price;
  const close = bars[bars.length - 1].c;
  if (ll && close > highs[1].price) return { text: "下降结构被收盘扭转", score: 16 };
  if (hh && close < lows[1].price) return { text: "上升结构被收盘扭转", score: 16 };
  if (hh && hl) return { text: "高点抬高，低点抬高", score: 18 };
  if (lh && ll) return { text: "高点降低，低点降低", score: 18 };
  return { text: "高低点还没选边", score: 8 };
}

function liquidityText(bars: Bar[]): { text: string; score: number } {
  const points = findSwings(bars).slice(-8);
  const span = Math.max(atr(bars), bars[bars.length - 1].c * 0.00015);
  const highs = points.filter((item) => item.kind === "high");
  const lows = points.filter((item) => item.kind === "low");
  const equalHigh = highs.length >= 2 && Math.abs(highs[highs.length - 1].price - highs[highs.length - 2].price) < span * 0.2;
  const equalLow = lows.length >= 2 && Math.abs(lows[lows.length - 1].price - lows[lows.length - 2].price) < span * 0.2;
  const last = bars[bars.length - 1];
  const priorLow = lows.length ? lows[lows.length - 1].price : last.l;
  const priorHigh = highs.length ? highs[highs.length - 1].price : last.h;
  const sweepLow = last.l < priorLow && last.c > priorLow;
  const sweepHigh = last.h > priorHigh && last.c < priorHigh;
  if (sweepLow) return { text: "扫过前低又收回", score: 18 };
  if (sweepHigh) return { text: "扫过前高又收回", score: 18 };
  if (equalHigh || equalLow) return { text: equalHigh ? "前高附近有一串差不多的高点" : "前低附近有一串差不多的低点", score: 12 };
  return { text: "附近没有扫到流动性", score: 6 };
}

function profileText(bars: Bar[], price: number): { text: string; score: number; proxy: boolean } {
  const window = bars.slice(-80);
  const lo = Math.min(...window.map((bar) => bar.l));
  const hi = Math.max(...window.map((bar) => bar.h));
  const bins = 24;
  const step = Math.max((hi - lo) / bins, 0.01);
  const vol = new Array(bins).fill(0);
  let usedRange = false;
  for (const bar of window) {
    const weight = bar.v && bar.v > 0 ? bar.v : ((bar.h - bar.l) || 0.01);
    if (!(bar.v && bar.v > 0)) usedRange = true;
    const index = Math.max(0, Math.min(bins - 1, Math.floor((bar.c - lo) / step)));
    vol[index] += weight;
  }
  let poc = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[poc]) poc = i;
  const total = vol.reduce((sum, n) => sum + n, 0) || 1;
  let covered = vol[poc];
  let left = poc;
  let right = poc;
  while (covered / total < 0.7 && (left > 0 || right < bins - 1)) {
    const nextLeft = left > 0 ? vol[left - 1] : -1;
    const nextRight = right < bins - 1 ? vol[right + 1] : -1;
    if (nextRight >= nextLeft) {
      right += 1;
      covered += vol[right];
    } else {
      left -= 1;
      covered += vol[left];
    }
  }
  const val = lo + left * step;
  const vah = lo + (right + 1) * step;
  const where = price > vah ? "在价值区上方" : price < val ? "在价值区下方" : "在价值区里面";
  const score = price > vah || price < val ? 14 : 10;
  return { text: `${where}。没有逐笔成交，这是用K线量估的。`, score, proxy: usedRange };
}

function nearestGap(bars: Bar[], price: number): string {
  let best: { low: number; high: number; side: "多" | "空"; dist: number } | null = null;
  const start = Math.max(2, bars.length - 40);
  for (let i = start; i < bars.length; i++) {
    const bull = bars[i - 2].h < bars[i].l;
    const bear = bars[i - 2].l > bars[i].h;
    if (!bull && !bear) continue;
    const low = bull ? bars[i - 2].h : bars[i].h;
    const high = bull ? bars[i].l : bars[i - 2].l;
    const filled = bars.slice(i + 1).some((bar) => bar.l <= low && bar.h >= high);
    if (filled) continue;
    const dist = price > high ? price - high : price < low ? low - price : 0;
    if (!best || dist < best.dist) best = { low, high, side: bull ? "多" : "空", dist };
  }
  if (!best) return "近 40 根里没有还没补上的缺口";
  return `最近的${best.side}头缺口 ${best.low.toFixed(1)}–${best.high.toFixed(1)}，只留这一处`;
}

export function sessionName(at: number): string {
  const hour = new Date(at).getUTCHours();
  if (hour >= 12 && hour < 16) return "伦敦纽约重叠";
  if (hour >= 7 && hour < 12) return "伦敦";
  if (hour >= 12 && hour < 21) return "纽约";
  return "亚洲";
}

function flowText(bars: Bar[]): { text: string; score: number } {
  const window = bars.slice(-8);
  let buy = 0;
  let sell = 0;
  for (const bar of window) {
    const span = Math.max(bar.h - bar.l, 0.01);
    const weight = bar.v && bar.v > 0 ? bar.v : span;
    const bias = (bar.c - bar.l) / span;
    buy += weight * bias;
    sell += weight * (1 - bias);
  }
  const delta = buy - sell;
  return {
    text: delta >= 0 ? "买卖差代理偏买。这不是逐笔足迹。" : "买卖差代理偏卖。这不是逐笔足迹。",
    score: Math.abs(delta) > (buy + sell) * 0.08 ? 16 : 8,
  };
}

function divergenceText(bars: Bar[]): string {
  if (bars.length < 30) return "样本不够，不说背离";
  const closes = bars.map((bar) => bar.c);
  const rsiValues = rsi(closes, 14);
  const a = bars[bars.length - 8];
  const b = bars[bars.length - 1];
  const ra = rsiValues[rsiValues.length - 8];
  const rb = rsiValues[rsiValues.length - 1];
  if (!Number.isFinite(ra) || !Number.isFinite(rb)) return "动量还没算出来";
  if (b.l < a.l && rb > ra) return "价格新低，相对强弱没有新低";
  if (b.h > a.h && rb < ra) return "价格新高，相对强弱没有新高";
  return "价格和相对强弱没有背离";
}

export function assess(bars: Bar[], price: number, now: number, spread: number | null): Assessment {
  if (bars.length < 80 || !Number.isFinite(price)) {
    return {
      parts: [],
      total: 0,
      structure: "K 线不够",
      liquidity: "K 线不够",
      flow: "K 线不够",
      profile: "K 线不够",
      zone: "K 线不够",
      session: sessionName(now),
      divergence: "K 线不够",
    };
  }
  const structure = structureText(bars);
  const liquidity = liquidityText(bars);
  const flow = flowText(bars);
  const profile = profileText(bars, price);
  const fast = lastFinite(ema(bars.map((bar) => bar.c), 21));
  const span = Math.max(atr(bars), price * 0.0002);
  const location = Number.isFinite(fast) && Math.abs(price - fast) <= span * 1.2 ? 16 : 6;
  const rsiNow = lastFinite(rsi(bars.map((bar) => bar.c), 14));
  const momentum = Number.isFinite(rsiNow) && rsiNow > 25 && rsiNow < 75 ? 7 : 3;
  const risk = spread != null && spread > 1.5 ? 2 : 8;
  const parts: Part[] = [
    { name: "结构", score: structure.score, max: 20, note: structure.text },
    { name: "流动性", score: liquidity.score, max: 20, note: liquidity.text },
    { name: "订单流代理", score: flow.score, max: 20, note: flow.text },
    { name: "位置", score: location, max: 20, note: location >= 16 ? "离均线不远" : "离均线太远，不追" },
    { name: "价值区", score: profile.score, max: 20, note: profile.text },
    { name: "动量", score: momentum, max: 10, note: "只作辅助，超买本身不是做空理由" },
    { name: "风险", score: risk, max: 10, note: risk >= 8 ? "点差还正常" : "点差过大" },
  ];
  const got = parts.reduce((sum, part) => sum + part.score, 0);
  const cap = parts.reduce((sum, part) => sum + part.max, 0);
  return {
    parts,
    total: Math.round((got / cap) * 100),
    structure: structure.text,
    liquidity: liquidity.text,
    flow: flow.text,
    profile: profile.text,
    zone: nearestGap(bars, price),
    session: sessionName(now),
    divergence: divergenceText(bars),
  };
}

function lightSide(bars: Bar[], index: number, fast: number[], slow: number[]): Side | null {
  if (!Number.isFinite(fast[index]) || !Number.isFinite(slow[index])) return null;
  const bar = bars[index];
  const span = Math.max(atr(bars.slice(0, index + 1)), bar.c * 0.0002);
  const start = Math.max(0, index - 20);
  let avg = 0;
  for (let i = start; i < index; i++) {
    const row = bars[i];
    if (!row) continue;
    avg += row.v && row.v > 0 ? row.v : row.h - row.l;
  }
  avg /= Math.max(1, index - start);
  const vol = bar.v && bar.v > 0 ? bar.v : bar.h - bar.l;
  if (vol < avg * 1.3) return null;
  if (fast[index] > slow[index] && bar.l <= fast[index] + span * 0.1 && bar.c > fast[index]) return "long";
  if (fast[index] < slow[index] && bar.h >= fast[index] - span * 0.1 && bar.c < fast[index]) return "short";
  return null;
}

/** Replay the pullback-plus-volume rule on these bars. Last 30 bars stay out of the fit. */
export function backtest(bars: Bar[]): Backtest {
  if (bars.length < 120) return { trades: [], forward: [], note: "K 线不够，不回测。" };
  const closes = bars.map((bar) => bar.c);
  const fast = ema(closes, 21);
  const slow = ema(closes, 55);
  const all: TradeStat[] = [];
  const begin = 80;
  for (let i = begin; i < bars.length - 2; i++) {
    const side = lightSide(bars, i, fast, slow);
    if (!side) continue;
    const span = Math.max(atr(bars.slice(Math.max(0, i - 14), i + 1)), bars[i].c * 0.0002);
    const look = bars.slice(Math.max(0, i - 8), i);
    const entry = bars[i].c;
    const stop = side === "long" ? Math.min(...look.map((bar) => bar.l)) - span * 0.2 : Math.max(...look.map((bar) => bar.h)) + span * 0.2;
    const risk = Math.abs(entry - stop);
    if (risk < span * 0.25 || risk > span * 3.2) continue;
    const tp1 = side === "long" ? entry + risk : entry - risk;
    const tp2 = side === "long" ? entry + risk * 2.1 : entry - risk * 2.1;
    let result = 0;
    let hold = 0;
    let done = false;
    for (let j = i + 1; j < Math.min(bars.length, i + 24); j++) {
      hold = j - i;
      const hitStop = side === "long" ? bars[j].l <= stop : bars[j].h >= stop;
      const hit2 = side === "long" ? bars[j].h >= tp2 : bars[j].l <= tp2;
      const hit1 = side === "long" ? bars[j].h >= tp1 : bars[j].l <= tp1;
      if (hitStop) {
        result = -1;
        done = true;
        break;
      }
      if (hit2) {
        result = 2.1;
        done = true;
        break;
      }
      if (hit1) {
        result = 1;
        done = true;
        break;
      }
    }
    if (!done) continue;
    const regime = fast[i] > slow[i] ? "趋势向上" : "趋势向下";
    all.push({ side, r: result, hold: hold * 5, session: sessionName(bars[i].t), regime, at: bars[i].t });
  }
  const cut = bars[Math.max(0, bars.length - 30)].t;
  return {
    trades: all.filter((item) => item.at < cut),
    forward: all.filter((item) => item.at >= cut),
    note: "只回放这一条：顺均线回踩并且放量。最后 30 根不参与归纳，只拿来核对。样本少就不下结论。",
  };
}

export function summarize(trades: TradeStat[]): { n: number; win: number; avgR: number; tp2: number } {
  if (!trades.length) return { n: 0, win: 0, avgR: 0, tp2: 0 };
  const win = trades.filter((item) => item.r > 0).length / trades.length;
  const avgR = trades.reduce((sum, item) => sum + item.r, 0) / trades.length;
  const tp2 = trades.filter((item) => item.r >= 2).length / trades.length;
  return { n: trades.length, win, avgR, tp2 };
}

/** Shuffle the real results. Too few trades and this is noise. */
export function monteCarlo(trades: TradeStat[], rounds = 200): { worst: number; median: number } | null {
  if (trades.length < 12) return null;
  const rs = trades.map((item) => item.r);
  const peaks: number[] = [];
  for (let n = 0; n < rounds; n++) {
    const bag = [...rs];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = bag[i];
      bag[i] = bag[j];
      bag[j] = swap;
    }
    let equity = 0;
    let peak = 0;
    let worst = 0;
    for (const r of bag) {
      equity += r;
      peak = Math.max(peak, equity);
      worst = Math.min(worst, equity - peak);
    }
    peaks.push(worst);
  }
  peaks.sort((a, b) => a - b);
  return { worst: peaks[Math.floor(peaks.length * 0.05)], median: peaks[Math.floor(peaks.length / 2)] };
}

export function lots(account: number, riskPct: number, stopDist: number): number | null {
  if (account <= 0 || riskPct <= 0 || stopDist <= 0) return null;
  const dollars = account * (riskPct / 100);
  return dollars / (stopDist * 100);
}
