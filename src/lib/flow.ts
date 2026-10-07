import type { Bar, Side } from "./indicators/types.ts";

export type Plan = {
  side: Side;
  entry: number;
  stop: number;
  targets: [number, number, number];
  support: number;
  resist: number;
  burst: boolean;
  note: string;
};

export type FootBin = { price: number; buy: number; sell: number };
export type Foot = { t: number; delta: number; volume: number; bins: FootBin[] };

function atr(bars: Bar[], n: number): number {
  const slice = bars.slice(-n);
  if (!slice.length) return 0;
  let sum = 0;
  for (const b of slice) sum += b.h - b.l;
  return sum / slice.length;
}

export function tradePlan(bars: Bar[]): Plan | null {
  if (bars.length < 20) return null;
  const last = bars[bars.length - 1];
  const window = bars.slice(-30);
  const mean = window.reduce((s, b) => s + b.c, 0) / window.length;
  const side: Side = last.c >= mean ? "long" : "short";
  const risk = Math.max(atr(bars, 14) * 1.15, last.c * 0.0008);
  const entry = last.c;
  const stop = side === "long" ? entry - risk : entry + risk;
  const step = Math.abs(entry - stop);
  const targets: [number, number, number] =
    side === "long" ? [entry + step, entry + step * 2, entry + step * 3] : [entry - step, entry - step * 2, entry - step * 3];
  const support = Math.min(...window.map((b) => b.l));
  const resist = Math.max(...window.map((b) => b.h));
  const ranges = window.map((b) => b.h - b.l);
  const avg = ranges.reduce((s, n) => s + n, 0) / ranges.length;
  const burst = ranges[ranges.length - 1] > avg * 1.45;
  const note = burst ? "这根波幅明显高于近 30 根，按放量突破看。" : "波幅还在平时范围内，突破单独不算数。";
  return { side, entry, stop, targets, support, resist, burst, note };
}

export function footprint(bars: Bar[], count = 10): Foot[] {
  return bars.slice(-count).map((bar) => {
    const span = Math.max(bar.h - bar.l, bar.c * 0.00005);
    const volume = bar.v && bar.v > 0 ? bar.v : span * 1000;
    const bins: FootBin[] = [];
    const parts = 4;
    for (let i = 0; i < parts; i++) {
      const price = bar.l + (span * (i + 0.5)) / parts;
      const toward = 1 - Math.min(1, Math.abs(price - bar.c) / span);
      const weight = 0.15 + toward * 0.85;
      const slice = (volume / parts) * weight;
      const buyBias = (bar.c - bar.l) / span;
      bins.push({ price, buy: slice * buyBias, sell: slice * (1 - buyBias) });
    }
    const buy = bins.reduce((s, b) => s + b.buy, 0);
    const sell = bins.reduce((s, b) => s + b.sell, 0);
    return { t: bar.t, delta: buy - sell, volume: buy + sell, bins };
  });
}
