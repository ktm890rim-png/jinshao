import { resample } from "./indicators/bars.ts";
import { ema } from "./indicators/math.ts";
import { footprint } from "./flow.ts";
import type { Bar, Side } from "./indicators/types.ts";

export type Regime = "bull" | "bear" | "range" | "hot" | "off";
export type TfState = "long" | "short" | "pullback" | "range";
export type Grade = "A+" | "A" | "B" | "C" | "NO";
export type Life = "waiting" | "armed" | "triggered" | "tp1" | "none";

export type Decision = {
  regime: Regime;
  regimeLabel: string;
  tf: { h1: TfState; m15: TfState; m5: TfState };
  side: Side | "flat";
  score: number;
  grade: Grade;
  tradable: boolean;
  reasons: string[];
  blocks: string[];
  plan: { entryLow: number; entryHigh: number; stop: number; tp1: number; tp2: number; tp3: number; rr: number } | null;
  life: Life;
  lifeLabel: string;
  size: string;
};

function atr(bars: Bar[], n = 14): number {
  const slice = bars.slice(-n);
  if (!slice.length) return 0;
  return slice.reduce((sum, bar) => sum + (bar.h - bar.l), 0) / slice.length;
}

function lastFinite(values: number[]): number {
  for (let i = values.length - 1; i >= 0; i--) if (Number.isFinite(values[i])) return values[i];
  return Number.NaN;
}

function readTf(bars: Bar[]): TfState {
  if (bars.length < 60) return "range";
  const price = bars[bars.length - 1].c;
  const fast = lastFinite(ema(bars.map((bar) => bar.c), 21));
  const slow = lastFinite(ema(bars.map((bar) => bar.c), 55));
  const last = bars[bars.length - 1];
  const span = Math.max(atr(bars), price * 0.0002);
  if (!Number.isFinite(fast) || !Number.isFinite(slow)) return "range";
  if (fast > slow && price >= slow) {
    if (last.l <= fast + span * 0.05 && last.c >= fast && price < fast + span * 0.8) return "pullback";
    if (price > fast) return "long";
  }
  if (fast < slow && price <= slow) {
    if (last.h >= fast - span * 0.05 && last.c <= fast && price > fast - span * 0.8) return "pullback";
    if (price < fast) return "short";
  }
  return "range";
}

function lean(state: TfState, bars: Bar[]): Side | "flat" {
  if (state === "long") return "long";
  if (state === "short") return "short";
  if (state !== "pullback" || bars.length < 60) return "flat";
  const fast = lastFinite(ema(bars.map((bar) => bar.c), 21));
  const slow = lastFinite(ema(bars.map((bar) => bar.c), 55));
  if (fast > slow) return "long";
  if (fast < slow) return "short";
  return "flat";
}

export function riskNotes(input: { rr: number | null; spread: number | null; stopDist: number | null; atr: number; hot: boolean; losses: number; tradesToday: number }): { pass: boolean; notes: string[]; size: string } {
  const notes: string[] = [];
  if (input.rr == null || input.rr < 1.5) notes.push("盈亏比不到 1 比 1.5");
  if (input.spread != null && input.spread > 1.5) notes.push("点差过大");
  if (input.stopDist != null && input.atr > 0 && (input.stopDist < input.atr * 0.25 || input.stopDist > input.atr * 3.2)) notes.push("止损距离不正常");
  if (input.losses >= 3) notes.push("连亏 3 次，暂停");
  const size = input.hot ? "高波动，仓位减半" : "0.01 手";
  return { pass: notes.length === 0, notes, size };
}

export function decide(
  bars: Bar[],
  price: number,
  now: number,
  extra?: { spread?: number | null; halt?: string | null; losses?: number; tradesToday?: number },
): Decision {
  const empty: Decision = {
    regime: "off",
    regimeLabel: "不适合交易",
    tf: { h1: "range", m15: "range", m5: "range" },
    side: "flat",
    score: 0,
    grade: "NO",
    tradable: false,
    reasons: [],
    blocks: ["K 线不够，先不判断"],
    plan: null,
    life: "none",
    lifeLabel: "先等",
    size: "不做",
  };
  if (bars.length < 80 || !Number.isFinite(price)) return empty;

  const m5 = bars;
  const m15 = resample(bars, 15);
  const h1 = resample(bars, 60);
  const tf = { h1: readTf(h1), m15: readTf(m15), m5: readTf(m5) };
  const hLean = lean(tf.h1, h1);
  const mLean = lean(tf.m15, m15);
  const sLean = lean(tf.m5, m5);
  const span = Math.max(atr(m5), price * 0.0002);
  const prevSpan = Math.max(atr(m5.slice(0, -8)), span);
  const hot = span > prevSpan * 1.8;
  let regime: Regime = "range";
  if (hot) regime = "hot";
  else if (hLean === "long" && tf.h1 !== "range") regime = "bull";
  else if (hLean === "short" && tf.h1 !== "range") regime = "bear";
  const regimeLabel = regime === "bull" ? "多头趋势" : regime === "bear" ? "空头趋势" : regime === "hot" ? "高波动" : regime === "range" ? "震荡" : "不适合交易";

  let side: Side | "flat" = "flat";
  if (hLean !== "flat" && hLean === mLean && (sLean === hLean || tf.m5 === "pullback")) side = hLean;

  const last = m5[m5.length - 1];
  const fast = lastFinite(ema(m5.map((bar) => bar.c), 21));
  const prior = m5.slice(-12, -1);
  const swingLow = Math.min(...prior.map((bar) => bar.l));
  const swingHigh = Math.max(...prior.map((bar) => bar.h));
  const feet = footprint(m5, 8);
  const delta = feet[feet.length - 1]?.delta ?? 0;
  const cvd = feet.reduce((sum, row) => sum + row.delta, 0);
  const vol = last.v && last.v > 0 ? last.v : last.h - last.l;
  const avgVol = m5.slice(-21, -1).reduce((sum, bar) => sum + (bar.v && bar.v > 0 ? bar.v : bar.h - bar.l), 0) / 20;
  const range = Math.max(last.h - last.l, 0.01);
  const body = Math.abs(last.c - last.o) / range;
  const closePos = (last.c - last.l) / range;
  const sweptLow = prior.some((bar) => bar.l < swingLow) ? false : m5.slice(-3).some((bar) => bar.l < Math.min(...m5.slice(-11, -3).map((item) => item.l)) && bar.c > bar.l + range * 0.4);
  const sweptHigh = m5.slice(-3).some((bar) => bar.h > Math.max(...m5.slice(-11, -3).map((item) => item.h)) && bar.c < bar.h - (bar.h - bar.l) * 0.4);

  const reasons: string[] = [];
  const blocks: string[] = [];
  let score = 0;
  const dist = Math.abs(price - fast);
  if (Number.isFinite(fast) && dist <= span * 1.2) {
    score += 20;
    reasons.push("离均线不远");
  } else blocks.push("距离均线过远");
  if (vol > avgVol * 1.3) {
    score += 15;
    reasons.push("成交量放大");
  } else blocks.push("成交量不够");
  const deltaOk = side === "short" ? delta < 0 : delta > 0;
  if (side !== "flat" && deltaOk) {
    score += 15;
    reasons.push(side === "long" ? "买方压力转强" : "卖方压力转强");
  } else blocks.push("买卖压力没转过来");
  const cvdOk = side === "short" ? cvd < 0 : cvd > 0;
  if (side !== "flat" && cvdOk) {
    score += 10;
    reasons.push("累积差值顺着方向");
  }
  if ((side === "long" && sweptLow) || (side === "short" && sweptHigh)) {
    score += 15;
    reasons.push(side === "long" ? "扫过前低又收回" : "扫过前高又收回");
  }
  if ((side === "long" && last.c > swingHigh) || (side === "short" && last.c < swingLow)) {
    score += 15;
    reasons.push("收盘突破前一段结构");
  }
  const candleOk = side === "short" ? body >= 0.45 && closePos <= 0.4 : body >= 0.45 && closePos >= 0.6;
  if (side !== "flat" && candleOk) {
    score += 10;
    reasons.push("收盘位置够强");
  } else if (side !== "flat") blocks.push("K 线实体太弱");

  const wickBars = m5.slice(-3);
  if (wickBars.filter((bar) => {
    const spanBar = bar.h - bar.l;
    return spanBar > 0 && Math.min(bar.h - Math.max(bar.o, bar.c), Math.min(bar.o, bar.c) - bar.l) > spanBar * 0.4;
  }).length >= 3) blocks.push("连续长影线");
  if (hLean !== "flat" && mLean !== "flat" && hLean !== mLean) blocks.push("1 小时和 15 分钟方向相反");
  if (side === "flat") blocks.push("多周期没有一起选边");
  const openBar = now - last.t < 5 * 60_000;
  if (openBar) blocks.push("这根还没收盘");
  const fake = side === "long" ? last.h > swingHigh && last.c < swingHigh : side === "short" ? last.l < swingLow && last.c > swingLow : false;
  if (fake) blocks.push("刚出现假突破");

  let plan: Decision["plan"] = null;
  if (side !== "flat" && Number.isFinite(fast)) {
    const entryHigh = side === "long" ? fast + span * 0.12 : fast + span * 0.2;
    const entryLow = side === "long" ? fast - span * 0.35 : fast - span * 0.12;
    const mid = (entryLow + entryHigh) / 2;
    const stop = side === "long" ? Math.min(swingLow, entryLow) - span * 0.35 : Math.max(swingHigh, entryHigh) + span * 0.35;
    const risk = Math.abs(mid - stop);
    const rr = 2.1;
    plan = {
      entryLow: Math.min(entryLow, entryHigh),
      entryHigh: Math.max(entryLow, entryHigh),
      stop,
      tp1: side === "long" ? mid + risk : mid - risk,
      tp2: side === "long" ? mid + risk * rr : mid - risk * rr,
      tp3: side === "long" ? mid + risk * 3 : mid - risk * 3,
      rr,
    };
  }
  const rr = plan ? plan.rr : null;
  const stopDist = plan ? Math.abs((plan.entryLow + plan.entryHigh) / 2 - plan.stop) : null;
  const risk = riskNotes({
    rr: side === "flat" ? null : rr,
    spread: extra?.spread ?? null,
    stopDist,
    atr: span,
    hot,
    losses: extra?.losses ?? 0,
    tradesToday: extra?.tradesToday ?? 0,
  });
  blocks.push(...risk.notes);
  if (extra?.halt) blocks.unshift(extra.halt);

  const halt = Boolean(extra?.halt);
  const opposed = halt || side === "flat" || blocks.some((item) => /相反|假突破|点差过大|连亏/.test(item));
  const soft = blocks.some((item) => /不够|过远|实体|影线|压力|盈亏比|不正常|没收盘/.test(item));
  const grade: Grade = opposed ? "NO" : soft ? "A" : "A+";
  const tradable = grade === "A+" || grade === "A";

  let life: Life = "none";
  if (plan && side === "long") {
    if (price >= plan.tp1) life = "tp1";
    else if (price >= plan.entryLow && price <= plan.entryHigh) life = "armed";
    else if (price > plan.entryHigh) life = "triggered";
    else life = "waiting";
  } else if (plan && side === "short") {
    if (price <= plan.tp1) life = "tp1";
    else if (price <= plan.entryHigh && price >= plan.entryLow) life = "armed";
    else if (price < plan.entryLow) life = "triggered";
    else life = "waiting";
  }
  const lifeLabel = grade === "A+" ? "有把握，吃 2 个点" : grade === "A" ? "把握一般，吃 1 个点" : "方向没对齐";

  return {
    regime,
    regimeLabel,
    tf,
    side,
    score,
    grade,
    tradable,
    reasons,
    blocks: grade === "NO" || !tradable ? blocks.slice(0, 6) : [],
    plan: grade === "NO" ? null : plan,
    life: grade === "NO" ? "none" : life,
    lifeLabel,
    size: tradable ? "0.01 手" : "先等",
  };
}
