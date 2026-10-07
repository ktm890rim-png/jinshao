import { atr, sma } from "./math.ts";
import type { Bar, Side } from "./types.ts";

export type CatMark = { index: number; side: Side; name: string };

export type CatRead = {
  sellPct: number;
  buyPct: number;
  volSell: number | null;
  volBuy: number | null;
  volTotal: number | null;
  boundary: number;
  side: Side;
  count: number;
  entry: number | null;
  stop: number | null;
  targets: number[];
  hit: boolean[];
  support: number | null;
  marks: CatMark[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function catLevels(cat: CatRead): { price: number; label: string; tone: "gold" | "cinnabar" | "dim" }[] {
  if (cat.entry == null || cat.stop == null || cat.targets.length < 3 || cat.support == null) return [];
  return [
    { price: cat.stop, label: "止损", tone: "cinnabar" },
    { price: cat.entry, label: "入场", tone: "gold" },
    { price: cat.support, label: "支撑", tone: "dim" },
    { price: cat.targets[0], label: cat.hit[0] ? "✓止盈1" : "止盈1", tone: "dim" },
    { price: cat.targets[1], label: cat.hit[1] ? "✓止盈2" : "止盈2", tone: "dim" },
    { price: cat.targets[2], label: cat.hit[2] ? "✓止盈3" : "止盈3", tone: "dim" },
  ];
}

export function readCat(bars: Bar[]): CatRead | null {
  if (bars.length < 30) return null;
  const close = bars.map((b) => b.c);
  const high = bars.map((b) => b.h);
  const low = bars.map((b) => b.l);
  const ma = sma(close, 9);
  const width = atr(high, low, close, 14);
  const last = bars.length - 1;
  const sma9 = ma[last];
  const band = width[last];
  if (!Number.isFinite(sma9) || !Number.isFinite(band) || band <= 0) return null;
  const buyPct = clamp(50 + ((close[last] - sma9) / band) * 50, 0, 100);
  const sellPct = 100 - buyPct;
  const vols = bars.map((b) => (b.v && b.v > 0 ? b.v : 0));
  const hasVol = vols.some((v) => v > 0);
  let volBuy: number | null = null;
  let volSell: number | null = null;
  let volTotal: number | null = null;
  if (hasVol) {
    const recent = vols.slice(-20);
    const avg = recent.reduce((s, n) => s + n, 0) / recent.length || 1;
    const cur = vols[last] || avg;
    const strength = (cur / avg) * 100;
    const span = Math.max(bars[last].h - bars[last].l, band * 0.05);
    const up = (bars[last].c - bars[last].l) / span;
    volBuy = strength * up;
    volSell = strength * (1 - up);
    volTotal = recent.reduce((s, n) => s + n, 0);
  }

  type Sig = { i: number; side: Side; entry: number; stop: number; targets: number[] };
  const sigs: Sig[] = [];
  const marks: CatMark[] = [];
  for (let i = 21; i < bars.length; i++) {
    let rangeSum = 0;
    let volSum = 0;
    let volN = 0;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - 20; j < i; j++) rangeSum += bars[j].h - bars[j].l;
    for (let j = i - 20; j < i; j++) {
      if (vols[j] > 0) {
        volSum += vols[j];
        volN += 1;
      }
    }
    for (let j = i - 8; j < i; j++) {
      hi = Math.max(hi, bars[j].h);
      lo = Math.min(lo, bars[j].l);
    }
    const burst = hasVol && volN > 5 ? vols[i] > (volSum / volN) * 1.6 : bars[i].h - bars[i].l > (rangeSum / 20) * 1.5;
    const above = Number.isFinite(ma[i]) && bars[i].c > ma[i];
    const below = Number.isFinite(ma[i]) && bars[i].c < ma[i];
    const long = burst && above && bars[i].c > hi;
    const short = burst && below && bars[i].c < lo;
    if (!long && !short) {
      if (burst && i >= bars.length - 16) marks.push({ index: i, side: above ? "long" : "short", name: "放量" });
      continue;
    }
    const side: Side = long ? "long" : "short";
    const entry = bars[i].c;
    const risk = Math.max(Math.abs(entry - (side === "long" ? Math.min(bars[i].l, lo) : Math.max(bars[i].h, hi))), band * 0.35);
    const stop = side === "long" ? entry - risk : entry + risk;
    const targets = [1, 2, 3].map((k) => (side === "long" ? entry + risk * k : entry - risk * k));
    sigs.push({ i, side, entry, stop, targets });
    if (i >= bars.length - 56) marks.push({ index: i, side, name: side === "long" ? "突破多" : "突破空" });
  }

  const lastSig = sigs[sigs.length - 1] ?? null;
  const hit = [false, false, false];
  if (lastSig) {
    for (let i = lastSig.i + 1; i < bars.length; i++) {
      const stopped = lastSig.side === "long" ? bars[i].l <= lastSig.stop : bars[i].h >= lastSig.stop;
      if (stopped) break;
      lastSig.targets.forEach((tp, k) => {
        const reached = lastSig.side === "long" ? bars[i].h >= tp : bars[i].l <= tp;
        if (reached) hit[k] = true;
      });
    }
  }

  return {
    sellPct,
    buyPct,
    volSell,
    volBuy,
    volTotal,
    boundary: Math.abs(buyPct - sellPct),
    side: lastSig?.side ?? (buyPct >= 50 ? "long" : "short"),
    count: sigs.length,
    entry: lastSig?.entry ?? null,
    stop: lastSig?.stop ?? null,
    targets: lastSig?.targets ?? [],
    hit,
    support: Math.min(...low.slice(-30)),
    marks: marks.slice(-8),
  };
}
