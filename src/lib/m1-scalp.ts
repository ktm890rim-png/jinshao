import type { Bar } from "./indicators/types";

export type ScalpCall = {
  side: "buy" | "sell" | null;
  score: number;
  reasons: string[];
  wait: string;
  tp: number;
  sl: number;
};

function ema(values: number[], n: number): number {
  const k = 2 / (n + 1);
  let next = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) next = values[i] * k + next * (1 - k);
  return next;
}

export type ScalpPlan = {
  trend: boolean;
  reversal: boolean;
  fast: number;
  slow: number;
  pull: number;
  extend: number;
  wick: number;
  swing: number;
  trendTp: number;
  trendSl: number;
  runTp: number;
  runSl: number;
  revTp: number;
  revSl: number;
  trailArm: number;
  trailStep: number;
  trailPush: number;
  spike: number;
  spread: number;
  style: "auto" | "spike" | "confirm";
  minHits: number;
  volMult: number;
  rangeMult: number;
  closePct: number;
  chopOff: boolean;
  lossPause: number;
  pauseBars: number;
  dayStop: number;
};

export const DEFAULT_PLAN: ScalpPlan = {
  trend: true,
  reversal: true,
  fast: 8,
  slow: 21,
  pull: 0.2,
  extend: 0.8,
  wick: 0.35,
  swing: 12,
  trendTp: 0.6,
  trendSl: 0.45,
  runTp: 0.5,
  runSl: 0.4,
  revTp: 0.5,
  revSl: 0.45,
  trailArm: 0.3,
  trailStep: 0.2,
  trailPush: 0,
  spike: 1.8,
  spread: 0.35,
  style: "auto",
  minHits: 0,
  volMult: 0,
  rangeMult: 0,
  closePct: 0,
  chopOff: false,
  lossPause: 0,
  pauseBars: 0,
  dayStop: 0,
};

function num(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.round(next * 100) / 100));
}

export function cleanPlan(input?: Partial<ScalpPlan> | null): ScalpPlan {
  const src = input ?? {};
  const fast = Math.round(num(src.fast, DEFAULT_PLAN.fast, 3, 30));
  let slow = Math.round(num(src.slow, DEFAULT_PLAN.slow, 8, 80));
  if (slow <= fast) slow = Math.min(80, fast + 5);
  return {
    trend: src.trend !== false,
    reversal: src.reversal !== false,
    fast,
    slow,
    pull: num(src.pull, DEFAULT_PLAN.pull, 0.05, 1.5),
    extend: num(src.extend, DEFAULT_PLAN.extend, 0.2, 3),
    wick: num(src.wick, DEFAULT_PLAN.wick, 0.15, 0.8),
    swing: Math.round(num(src.swing, DEFAULT_PLAN.swing, 6, 40)),
    trendTp: num(src.trendTp, DEFAULT_PLAN.trendTp, 0.15, 3),
    trendSl: num(src.trendSl, DEFAULT_PLAN.trendSl, 0.15, 3),
    runTp: num(src.runTp, DEFAULT_PLAN.runTp, 0.15, 3),
    runSl: num(src.runSl, DEFAULT_PLAN.runSl, 0.15, 3),
    revTp: num(src.revTp, DEFAULT_PLAN.revTp, 0.15, 3),
    revSl: num(src.revSl, DEFAULT_PLAN.revSl, 0.15, 3),
    trailArm: num(src.trailArm, DEFAULT_PLAN.trailArm, 0.1, 2),
    trailStep: num(src.trailStep, DEFAULT_PLAN.trailStep, 0.05, 1),
    trailPush: num(src.trailPush, DEFAULT_PLAN.trailPush, 0, 1),
    spike: num(src.spike, DEFAULT_PLAN.spike, 0.5, 5),
    spread: num(src.spread, DEFAULT_PLAN.spread, 0.05, 1),
    style: src.style === "spike" || src.style === "confirm" ? src.style : "auto",
    minHits: Math.round(num(src.minHits, DEFAULT_PLAN.minHits, 0, 8)),
    volMult: num(src.volMult, DEFAULT_PLAN.volMult, 0, 5),
    rangeMult: num(src.rangeMult, DEFAULT_PLAN.rangeMult, 0, 5),
    closePct: num(src.closePct, DEFAULT_PLAN.closePct, 0, 0.95),
    chopOff: src.chopOff === true,
    lossPause: Math.round(num(src.lossPause, DEFAULT_PLAN.lossPause, 0, 6)),
    pauseBars: Math.round(num(src.pauseBars, DEFAULT_PLAN.pauseBars, 0, 60)),
    dayStop: num(src.dayStop, DEFAULT_PLAN.dayStop, 0, 20),
  };
}

export function planSentence(plan: ScalpPlan): string {
  const trail = plan.trailPush > 0 ? `浮盈${plan.trailArm}保本，每${plan.trailStep}推进${plan.trailPush}` : `浮盈${plan.trailArm}收到成本，每${plan.trailStep}推进`;
  if (plan.style === "spike") return `急涨急跌反转，波动${plan.rangeMult || 1.5}倍，量${plan.volMult || 1.3}倍，止损${plan.revSl}，止盈${plan.revTp}，${trail}`;
  if (plan.style === "confirm") return `至少${plan.minHits || 4}个条件才做，止损${plan.trendSl}，止盈${plan.trendTp}，${trail}`;
  return [
    plan.trend ? "顺势开" : "顺势关",
    plan.reversal ? "反转开" : "反转关",
    `快${plan.fast}/慢${plan.slow}`,
    `回踩止盈${plan.trendTp}、止损${plan.trendSl}`,
    `反转止盈${plan.revTp}、止损${plan.revSl}`,
    trail,
  ].join("，");
}

function numBefore(text: string, mark: string): number | null {
  const at = text.indexOf(mark);
  if (at < 0) return null;
  const slice = text.slice(Math.max(0, at - 16), at);
  const hit = slice.match(/([0-9]+(?:\.[0-9]+)?)\D{0,6}$/);
  if (!hit) return null;
  const value = Number(hit[1]);
  return Number.isFinite(value) ? value : null;
}

function numNear(text: string, mark: string): number | null {
  const at = text.indexOf(mark);
  if (at < 0) return null;
  const slice = text.slice(at + mark.length, at + mark.length + 24);
  const hit = slice.match(/^[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/);
  if (!hit) return null;
  const value = Number(hit[1]);
  return Number.isFinite(value) ? value : null;
}

export function readWords(text: string, base: ScalpPlan): { plan: ScalpPlan; said: string } {
  const compact = text.replace(/美\s*元|块|刀/g, "").replace(/\s+/g, "");
  const raw = compact.length > 5000 ? `${compact.slice(0, 2500)}${compact.slice(-2500)}` : compact;
  const plan = { ...base };
  const said: string[] = [];
  const emas = [...raw.matchAll(/ema([0-9]{1,2})/gi)].map((hit) => Number(hit[1])).filter((n) => n >= 2 && n <= 80);
  if (emas.length >= 2) {
    plan.fast = emas[0];
    plan.slow = emas[1];
    said.push(`均线 ${emas[0]}/${emas[1]}`);
  }
  if (raw.includes("急涨") || raw.includes("急跌") || raw.includes("插针") || raw.toLowerCase().includes("spike")) {
    plan.style = "spike";
    plan.trend = false;
    plan.reversal = true;
    plan.rangeMult = numNear(raw, "平均波动的") ?? numNear(raw, "波动") ?? 1.5;
    plan.volMult = numNear(raw, "平均成交量") ?? 1.3;
    plan.wick = 0.45;
    said.push("改成急涨急跌反转");
  }
  const hits = numNear(raw, "至少") ?? numNear(raw, "个条件同时");
  if ((raw.includes("个条件") && hits != null) || raw.includes("多条件") || raw.toLowerCase().includes("confluence")) {
    plan.style = "confirm";
    plan.minHits = hits != null && hits <= 8 ? hits : 4;
    plan.trend = true;
    plan.reversal = false;
    plan.volMult = numNear(raw, "均量") ?? numNear(raw, "平均成交量") ?? (plan.volMult || 1.2);
    const pct = numBefore(raw, "%以上");
    if (pct != null && raw.includes("%")) plan.closePct = pct > 1 ? pct / 100 : pct;
    said.push(`至少 ${plan.minHits} 个条件`);
  }
  if (raw.includes("震荡禁止") || raw.includes("震荡时禁止") || raw.toLowerCase().includes("chop")) {
    plan.chopOff = true;
    said.push("震荡不做");
  }
  const pauseN = numNear(raw, "暂停");
  const lossN = numNear(raw, "连续亏损") ?? numNear(raw, "连续亏");
  if (pauseN != null && raw.includes("根")) {
    plan.pauseBars = pauseN;
    said.push(`连亏后停 ${pauseN} 根`);
  }
  if (lossN != null && lossN <= 6) plan.lossPause = lossN;
  const dayPct = numNear(raw, "余额的");
  if (dayPct != null && raw.includes("%")) {
    plan.dayStop = Number(((dayPct > 1 ? dayPct / 100 : dayPct) * 13).toFixed(2));
    said.push(`当天大约亏满 ${plan.dayStop} 美元停`);
  }
  const onlyTrend = raw.includes("只做顺势") || raw.includes("不要反转") || raw.includes("关掉反转") || raw.includes("不做反转");
  const onlyRev = raw.includes("只做反转") || raw.includes("不要顺势") || raw.includes("关掉顺势") || raw.includes("不做顺势");
  if (onlyTrend && !onlyRev) {
    plan.trend = true;
    plan.reversal = false;
    said.push("只留顺势");
  } else if (onlyRev && !onlyTrend) {
    plan.trend = false;
    plan.reversal = true;
    said.push("只留反转");
  } else if (raw.includes("顺势") && raw.includes("反转") && plan.style === "auto") {
    plan.trend = true;
    plan.reversal = true;
    said.push("顺势和反转都开");
  }
  const fast = numNear(raw, "快均线") ?? numNear(raw, "ema");
  const slow = numNear(raw, "慢均线");
  if (fast != null && raw.includes("快均线")) {
    plan.fast = fast;
    said.push(`快均线 ${fast}`);
  }
  if (slow != null) {
    plan.slow = slow;
    said.push(`慢均线 ${slow}`);
  }
  const pull = numNear(raw, "回踩距离") ?? numNear(raw, "回踩");
  if (pull != null && pull <= 1.5 && (raw.includes("回踩距离") || /回踩[0-9]/.test(raw))) {
    plan.pull = pull;
    said.push(`回踩 ${pull}`);
  }
  const extend = numNear(raw, "离均线") ?? numNear(raw, "不追");
  if (extend != null && (raw.includes("离均线") || raw.includes("不追"))) {
    plan.extend = extend;
    said.push(`离均线 ${extend} 不追`);
  }
  const wick = numNear(raw, "影线比例") ?? numNear(raw, "影线");
  if (wick != null && wick <= 0.8 && raw.includes("影线")) {
    plan.wick = wick;
    said.push(`影线 ${wick}`);
  }
  const trendTp = numNear(raw, "回踩止盈");
  const trendSl = numNear(raw, "回踩止损");
  const runTp = numNear(raw, "延续止盈");
  const runSl = numNear(raw, "延续止损");
  const revTp = numNear(raw, "反转止盈");
  const revSl = numNear(raw, "反转止损");
  if (trendTp != null) plan.trendTp = trendTp;
  if (trendSl != null) plan.trendSl = trendSl;
  if (runTp != null) plan.runTp = runTp;
  if (runSl != null) plan.runSl = runSl;
  if (revTp != null) plan.revTp = revTp;
  if (revSl != null) plan.revSl = revSl;
  const named = trendTp != null || runTp != null || revTp != null || trendSl != null || runSl != null || revSl != null;
  const tp = named ? null : numNear(raw, "止盈");
  const sl = named ? null : numNear(raw, "止损");
  if (tp != null) {
    plan.trendTp = tp;
    plan.runTp = tp;
    plan.revTp = tp;
    said.push(`止盈 ${tp}`);
  }
  if (sl != null) {
    plan.trendSl = sl;
    plan.runSl = sl;
    plan.revSl = sl;
    said.push(`止损 ${sl}`);
  }
  const arm = numNear(raw, "浮盈到") ?? numNear(raw, "浮盈") ?? numBefore(raw, "后保本") ?? numBefore(raw, "移动成本");
  if (arm != null && arm <= 2) {
    plan.trailArm = arm;
    said.push(`浮盈 ${arm} 收到成本`);
  }
  const pushAt = raw.indexOf("移动止损");
  if (pushAt > 0) {
    const before = raw.slice(Math.max(0, pushAt - 16), pushAt);
    const every = before.match(/([0-9]+(?:\.[0-9]+)?)\D{0,6}$/);
    const next = raw.slice(pushAt + 4, pushAt + 16).match(/^[^0-9]{0,4}([0-9]+(?:\.[0-9]+)?)/);
    if (every && next) {
      plan.trailStep = Number(every[1]);
      plan.trailPush = Number(next[1]);
      said.push(`每 ${plan.trailStep} 推进 ${plan.trailPush}`);
    }
  } else {
    const step = numNear(raw, "每");
    if (step != null && step <= 1 && (raw.includes("往前") || raw.includes("推进"))) {
      plan.trailStep = step;
      said.push(`每 ${step} 往前推`);
    }
  }
  if (/高频/.test(raw) && extend == null && plan.style === "auto") {
    plan.extend = Math.max(plan.extend, 1.2);
    plan.spike = Math.max(plan.spike, 2);
    said.push("入场放宽");
  }
  const next = cleanPlan(plan);
  return { plan: next, said: said.length ? said.join("，") : "没听出要改的数字，还是上一套。" };
}

export function trailLock(favor: number, arm = DEFAULT_PLAN.trailArm, step = DEFAULT_PLAN.trailStep, push = step): number | null {
  if (!(favor >= arm) || !(step > 0)) return null;
  const steps = Math.floor((favor - arm) / step + 1e-9);
  return Number((steps * push).toFixed(2));
}

export function shouldCut(side: "buy" | "sell", entry: number, bars: Bar[], now: number): boolean {
  const closed = bars.filter((bar) => bar.t + 60_000 <= now);
  const src = closed.length >= 20 ? closed : bars;
  if (src.length < 20) return false;
  const last = src[src.length - 1];
  const line = ema(src.map((bar) => bar.c), 20);
  if (side === "buy") return last.c < last.o && entry - last.c >= 0.5 && last.c < line;
  return last.c > last.o && last.c - entry >= 0.5 && last.c > line;
}

export function m1Scalp(bars: Bar[], now: number, raw?: Partial<ScalpPlan> | null): ScalpCall {
  const plan = cleanPlan(raw);
  const closed = bars.filter((bar) => bar.t + 60_000 <= now);
  const src = closed.length >= 60 ? closed : bars;
  if (src.length < 60) return { side: null, score: 0, reasons: [], wait: "M1 根数不够，先扫着。", tp: 0, sl: 0 };
  const last = src[src.length - 1];
  const prev = src[src.length - 2];
  const closes = src.map((bar) => bar.c);
  const emaFast = ema(closes, plan.fast);
  const emaSlow = ema(closes, plan.slow);
  const emaSlowPrev = ema(closes.slice(0, -3), plan.slow);
  const trendUp = emaFast > emaSlow && emaSlow > emaSlowPrev;
  const trendDown = emaFast < emaSlow && emaSlow < emaSlowPrev;
  const swing = src.slice(-plan.swing, -1);
  const swingHigh = Math.max(...swing.map((bar) => bar.h));
  const swingLow = Math.min(...swing.map((bar) => bar.l));
  const range = Math.max(last.h - last.l, 0.01);
  const lowerWick = Math.min(last.o, last.c) - last.l;
  const upperWick = last.h - Math.max(last.o, last.c);
  const none = { side: null, reasons: [] as string[], tp: 0, sl: 0 };
  if (plan.style !== "spike" && (Math.abs(last.c - prev.c) > plan.spike || range > plan.spike + 0.4)) return { ...none, score: 0, wait: "这根跳得太猛，等下一根。" };

  const sample = src.slice(-21, -1);
  const avgRange = sample.reduce((sum, bar) => sum + (bar.h - bar.l), 0) / sample.length;
  const avgVol = sample.reduce((sum, bar) => sum + (bar.v && bar.v > 0 ? bar.v : bar.h - bar.l), 0) / sample.length;
  const vol = last.v && last.v > 0 ? last.v : 0;
  const volOk = plan.volMult <= 0 || vol <= 0 || vol >= avgVol * plan.volMult;
  const prevTop = Math.max(prev.o, prev.c);
  const prevBot = Math.min(prev.o, prev.c);
  const backInside = last.c <= prevTop && last.c >= prevBot;

  if (plan.style === "spike") {
    const mult = plan.rangeMult || 1.5;
    const extreme = range >= avgRange * mult;
    const shortSpike = extreme && last.h > prev.h && upperWick > range * Math.max(plan.wick, 0.4) && last.c < last.o && backInside && volOk && !trendUp;
    const longSpike = extreme && last.l < prev.l && lowerWick > range * Math.max(plan.wick, 0.4) && last.c > last.o && backInside && volOk && !trendDown;
    if (longSpike) return { side: "buy", score: 80, reasons: ["急跌反转"], wait: "", tp: plan.revTp, sl: plan.revSl };
    if (shortSpike) return { side: "sell", score: 80, reasons: ["急涨反转"], wait: "", tp: plan.revTp, sl: plan.revSl };
  }

  if (plan.style === "confirm") {
    const closePos = (last.c - last.l) / range;
    const longHits = [trendUp || emaFast > emaSlow, last.c >= emaSlow || last.l <= emaSlow + plan.pull, last.c > last.o, volOk, plan.closePct <= 0 || closePos >= plan.closePct, last.l > src[src.length - 4].l].filter(Boolean).length;
    const shortHits = [trendDown || emaFast < emaSlow, last.c <= emaSlow || last.h >= emaSlow - plan.pull, last.c < last.o, volOk, plan.closePct <= 0 || 1 - closePos >= plan.closePct, last.h < src[src.length - 4].h].filter(Boolean).length;
    const need = plan.minHits || 4;
    if (longHits >= need && longHits >= shortHits) return { side: "buy", score: 60 + longHits, reasons: ["多条件", `${longHits}条`], wait: "", tp: plan.trendTp, sl: plan.trendSl };
    if (shortHits >= need) return { side: "sell", score: 60 + shortHits, reasons: ["多条件", `${shortHits}条`], wait: "", tp: plan.trendTp, sl: plan.trendSl };
  }

  const sweptLow = last.l < swingLow && last.c > swingLow && last.c > last.o && lowerWick > range * plan.wick;
  const sweptHigh = last.h > swingHigh && last.c < swingHigh && last.c < last.o && upperWick > range * plan.wick;
  if (plan.reversal && sweptLow && !trendDown) return { side: "buy", score: 75, reasons: ["反转", "扫低收回"], wait: "", tp: plan.revTp, sl: plan.revSl };
  if (plan.reversal && sweptHigh && !trendUp) return { side: "sell", score: 75, reasons: ["反转", "扫高收回"], wait: "", tp: plan.revTp, sl: plan.revSl };

  const pullLong = trendUp && last.l <= emaFast + plan.pull && last.c > emaFast && last.c > last.o;
  const pullShort = trendDown && last.h >= emaFast - plan.pull && last.c < emaFast && last.c < last.o;
  if (plan.trend && pullLong) return { side: "buy", score: 70, reasons: ["顺势", "回踩再走"], wait: "", tp: Math.min(plan.trendTp, 0.5), sl: Math.min(plan.trendSl, 0.4) };
  if (plan.trend && pullShort) return { side: "sell", score: 70, reasons: ["顺势", "反弹再下"], wait: "", tp: Math.min(plan.trendTp, 0.5), sl: Math.min(plan.trendSl, 0.4) };

  if (plan.trend && trendUp && last.c > last.o && last.c > prev.c && last.c - emaFast < plan.extend) {
    return { side: "buy", score: 65, reasons: ["顺势", "沿均线走"], wait: "", tp: Math.min(plan.runTp, 0.5), sl: Math.min(plan.runSl, 0.4) };
  }
  if (plan.trend && trendDown && last.c < last.o && last.c < prev.c && emaFast - last.c < plan.extend) {
    return { side: "sell", score: 65, reasons: ["顺势", "沿均线走"], wait: "", tp: Math.min(plan.runTp, 0.5), sl: Math.min(plan.runSl, 0.4) };
  }
  const take = 0.45;
  const stop = 0.4;
  if (last.c > prev.c) return { side: "buy", score: 60, reasons: ["顺着这根"], wait: "", tp: take, sl: stop };
  if (last.c < prev.c) return { side: "sell", score: 60, reasons: ["顺着这根"], wait: "", tp: take, sl: stop };
  return { ...none, score: 0, wait: "这根没动，下一根再看。" };
}
