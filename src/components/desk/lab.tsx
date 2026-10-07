import { useEffect, useMemo, useRef, useState } from "react";
import type { Decision } from "@/lib/decision";
import { px } from "@/lib/format";
import { backtest, lots, monteCarlo, summarize, type TradeStat } from "@/lib/terminal";
import type { Bar } from "@/lib/indicators/types";

export type Prefs = { account: number; riskPct: number; streak: number; tradesToday: number };

type Paper = { side: "long" | "short"; entry: number; stop: number; tp1: number; tp2: number; at: number };

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Curve({ trades }: { trades: TradeStat[] }) {
  let equity = 0;
  const points = trades.map((item) => {
    equity += item.r;
    return equity;
  });
  if (points.length < 2) return null;
  const lo = Math.min(0, ...points);
  const hi = Math.max(0, ...points);
  const span = Math.max(hi - lo, 0.1);
  const d = points.map((value, i) => `${(i / (points.length - 1)) * 280},${64 - ((value - lo) / span) * 56}`).join(" ");
  return (
    <svg viewBox="0 0 280 72" className="mt-3 h-20 w-full" role="img" aria-label="回测曲线">
      <polyline points={d} fill="none" stroke="#d4a853" strokeWidth="2" />
    </svg>
  );
}

export function Lab({
  bars,
  decision,
  price,
  killed,
  onKill,
  prefs,
  onPrefs,
  onResult,
}: {
  bars: Bar[];
  decision: Decision | null;
  price: number | null;
  killed: boolean;
  onKill: (next: boolean) => void;
  prefs: Prefs;
  onPrefs: (next: Prefs) => void;
  onResult: (kind: "win" | "loss") => void;
}) {
  const [ran, setRan] = useState(false);
  const [paper, setPaper] = useState<Paper | null>(null);
  const report = useMemo(() => (ran ? backtest(bars) : null), [ran, bars]);
  const fit = report ? summarize(report.trades) : null;
  const forward = report ? summarize(report.forward) : null;
  const shuffle = report ? monteCarlo(report.trades) : null;
  const stopDist = decision?.plan ? Math.abs((decision.plan.entryLow + decision.plan.entryHigh) / 2 - decision.plan.stop) : 0;
  const size = lots(prefs.account, prefs.riskPct, stopDist);

  const sent = useRef(false);
  useEffect(() => {
    sent.current = false;
  }, [paper?.at]);
  useEffect(() => {
    if (!paper || price == null || sent.current) return;
    const win = paper.side === "long" ? price >= paper.tp1 : price <= paper.tp1;
    const loss = paper.side === "long" ? price <= paper.stop : price >= paper.stop;
    if (!win && !loss) return;
    sent.current = true;
    onResult(win ? "win" : "loss");
    setPaper(null);
  }, [paper, price, onResult]);

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm">总闸</p>
            <p className="mt-1 text-xs leading-5 text-cream-dim">关上之后不再出可做的计划，模拟单也停。这里没有连上 MT5 或交易所，不会替你下单。</p>
          </div>
          <button type="button" onClick={() => onKill(!killed)} className={"h-10 shrink-0 rounded-full px-4 text-sm " + (killed ? "bg-cinnabar text-ink" : "bg-gold text-ink")}>
            {killed ? "已锁住" : "锁住"}
          </button>
        </div>
      </section>
      <section className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <p className="text-sm">风控</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-cream-dim">
            账户金额
            <input
              inputMode="decimal"
              value={prefs.account}
              onChange={(event) => onPrefs({ ...prefs, account: Number(event.target.value) || 0 })}
              className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-cream outline-none"
            />
          </label>
          <label className="text-xs text-cream-dim">
            单笔风险 %
            <input
              inputMode="decimal"
              value={prefs.riskPct}
              onChange={(event) => onPrefs({ ...prefs, riskPct: Number(event.target.value) || 0 })}
              className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-cream outline-none"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-cream">连亏 {prefs.streak} 次 · 今天 {prefs.tradesToday} 笔</p>
        <p className="mt-1 text-sm text-cream-dim">{size == null ? "有止损距离才算手数。" : `按这个止损，建议 ${size.toFixed(2)} 手。一手按 100 盎司算。`}</p>
        <p className="mt-1 text-xs text-cream-dim">一天最多 5 笔，连亏 3 次就停。这些数字写在这台设备上。</p>
      </section>
      <section className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <p className="text-sm">模拟</p>
        {paper ? (
          <p className="mt-2 text-sm leading-6 text-cream">
            {paper.side === "long" ? "做多" : "做空"} 入场 {px(paper.entry)} · 止损 {px(paper.stop)} · 第一目标 {px(paper.tp1)}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-cream-dim">只有 A 档以上、总闸开着，才按计划开一笔虚拟单。碰到止损或第一目标就记账。</p>
        )}
        <button
          type="button"
          disabled={killed || !decision?.tradable || !decision.plan || decision.side === "flat" || paper != null}
          onClick={() => {
            if (!decision?.plan || decision.side === "flat") return;
            setPaper({
              side: decision.side,
              entry: (decision.plan.entryLow + decision.plan.entryHigh) / 2,
              stop: decision.plan.stop,
              tp1: decision.plan.tp1,
              tp2: decision.plan.tp2,
              at: Date.now(),
            });
          }}
          className="mt-3 h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-40"
        >
          {paper ? "虚拟单还在" : "按计划模拟"}
        </button>
      </section>
      <section className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <p className="text-sm">回测</p>
        <p className="mt-2 text-sm leading-6 text-cream-dim">用已经下载的 5 分钟 K 线回放。不把胜率写成广告。</p>
        <button type="button" onClick={() => setRan(true)} className="mt-3 h-11 w-full rounded-full bg-ink text-sm text-cream">
          {ran ? "再算一次" : "用这段行情回放"}
        </button>
        {report && fit && forward ? (
          <div className="mt-3 space-y-2 text-sm text-cream">
            <p>{report.note}</p>
            <p>归纳 {fit.n} 笔 · 胜率 {pct(fit.win)} · 平均 {fit.avgR.toFixed(2)} 倍风险 · 到第二目标 {pct(fit.tp2)}</p>
            <p>留出的一段 {forward.n} 笔 · 胜率 {pct(forward.win)}</p>
            <p>{shuffle ? `打乱顺序后，较差的一段回撤 ${shuffle.worst.toFixed(1)} 倍风险。` : "样本不到 12 笔，不打乱顺序。"}</p>
            <Curve trades={report.trades} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
