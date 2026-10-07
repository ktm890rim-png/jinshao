import type { Bar } from "./indicators/types.ts";
import { cleanPlan, m1Scalp, type ScalpPlan } from "./m1-scalp.ts";

export type BacktestReport = {
  trades: number;
  wins: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  pnl: number;
};

export type ScanRow = BacktestReport & { fast: number };

export function runBacktest(bars: Bar[], raw?: Partial<ScalpPlan> | null): BacktestReport {
  const plan = cleanPlan(raw);
  let held: "buy" | "sell" | null = null;
  let entry = 0;
  let tp = 0;
  let sl = 0;
  let pnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  const trades: number[] = [];

  for (let i = 60; i < bars.length; i++) {
    const bar = bars[i];
    const now = bar.t + 120_000;
    if (held) {
      const hitTp = held === "buy" ? bar.h >= entry + tp : bar.l <= entry - tp;
      const hitSl = held === "buy" ? bar.l <= entry - sl : bar.h >= entry + sl;
      if (hitTp || hitSl) {
        const net = Number(((hitTp ? tp : -sl) - 0.06).toFixed(2));
        trades.push(net);
        pnl = Number((pnl + net).toFixed(2));
        peak = Math.max(peak, pnl);
        maxDrawdown = Math.max(maxDrawdown, Number((peak - pnl).toFixed(2)));
        if (net > 0) {
          wins += 1;
          grossWin += net;
        } else grossLoss += Math.abs(net);
        held = null;
      }
      continue;
    }
    const call = m1Scalp(bars.slice(0, i + 1), now, plan);
    if (!call.side) continue;
    held = call.side;
    entry = bar.c;
    tp = call.tp;
    sl = call.sl;
  }

  const count = trades.length;
  return {
    trades: count,
    wins,
    winRate: count ? Number((wins / count).toFixed(2)) : 0,
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 9 : 0,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    pnl: Number(pnl.toFixed(2)),
  };
}

export function scanFast(bars: Bar[], base?: Partial<ScalpPlan> | null): ScanRow[] {
  return [5, 8, 13].map((fast) => ({ fast, ...runBacktest(bars, { ...cleanPlan(base), fast }) }));
}
