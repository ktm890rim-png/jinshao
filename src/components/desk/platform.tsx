import { useMemo, useState } from "react";
import { saveScalpPlan } from "@/lib/auto-server";
import { scanFast, type ScanRow } from "@/lib/backtest";
import { ROLE_LABEL, SCRIPTS } from "@/lib/community";
import { useDesk } from "@/lib/desk-store";
import type { Decision } from "@/lib/decision";
import { px, sideLabel } from "@/lib/format";
import type { Bar, EvalHit, Indicator } from "@/lib/indicators/types";
import { cleanPlan, DEFAULT_PLAN, planSentence } from "@/lib/m1-scalp";

function scriptIndicator(id: string): Indicator | null {
  const script = SCRIPTS.find((item) => item.id === id);
  if (!script) return null;
  return {
    id: `tv-${script.id}`,
    name: script.name,
    thesis: script.note,
    sourceNote: `${script.author}。收成均线方向，不是把 Pine 原文拿来执行。`,
    source: "tradingview",
    sourceUrl: script.url,
    side: "long",
    timeframe: "5m",
    armed: false,
    logic: "all",
    conditions: [{ id: `${script.id}-ema`, label: ROLE_LABEL[script.role], left: { type: "ema", length: 8 }, op: "gt", right: { type: "ema", length: 21 } }],
    exit: { stopAtrMult: 1, atrLength: 14, targetR: 1.2 },
    updatedAt: Date.now(),
  };
}

export function HomeBoard({ price, decision, evals }: { price: number | null; decision: Decision | null; evals: EvalHit[] }) {
  const hits = evals.filter((item) => item.hit).slice(0, 4);
  return (
    <section className="space-y-3">
      <div className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <p className="text-xs text-cream-dim">XAUUSD</p>
        <p className="mt-1 font-serif text-3xl tabular-nums text-gold">{price != null ? px(price) : "正在接"}</p>
        <p className="mt-2 text-sm text-cream">{decision ? `${decision.grade} · ${decision.lifeLabel}` : "判断还在接"}</p>
        <p className="mt-1 text-sm leading-6 text-cream-dim">{decision?.reasons.slice(0, 2).join("，") || "上面「链接交易中」才是自动单。这里看方向，不另外下单。"}</p>
      </div>
      <div className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <p className="text-xs text-cream-dim">现在亮着的指标</p>
        {hits.length ? hits.map((item) => (
          <p key={item.id} className="mt-2 text-sm text-cream">{item.name} · {sideLabel(item.side)} · {Math.round(item.score * 100)}%</p>
        )) : <p className="mt-2 text-sm text-cream-dim">还没有同时亮起的指标。</p>}
      </div>
    </section>
  );
}

export function CommunityBoard() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [fav, setFav] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("jinsao-fav") || "[]") as string[];
    } catch {
      return [];
    }
  });
  const [note, setNote] = useState("");
  const rows = SCRIPTS.filter((script) => (role === "all" || script.role === role) && (!q.trim() || `${script.name} ${script.author} ${script.note}`.includes(q.trim())));
  return (
    <section className="space-y-3">
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜脚本或作者" className="h-11 w-full rounded-full border border-line bg-ink px-4 text-sm outline-none" />
      <div className="flex gap-2 overflow-x-auto">
        {[["all", "全部"], ["direction", "方向"], ["trigger", "触发"], ["filter", "过滤"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setRole(id)} className={"h-8 shrink-0 rounded-full px-3 text-xs " + (role === id ? "bg-gold text-ink" : "bg-ink text-cream")}>{label}</button>
        ))}
      </div>
      {note ? <p className="text-sm text-gold">{note}</p> : null}
      {rows.map((script) => (
        <article key={script.id} className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
          <p className="text-sm text-cream">{script.name}</p>
          <p className="mt-1 text-xs text-cream-dim">{script.author} · {ROLE_LABEL[script.role]} · TradingView</p>
          <p className="mt-2 text-sm leading-6 text-cream-dim">{script.note}</p>
          <div className="mt-3 flex gap-2">
            <a href={script.url} target="_blank" rel="noreferrer" className="h-10 flex-1 rounded-full bg-ink text-center text-sm leading-10 text-cream">查看</a>
            <button
              type="button"
              onClick={() => {
                const next = fav.includes(script.id) ? fav.filter((id) => id !== script.id) : [...fav, script.id];
                setFav(next);
                localStorage.setItem("jinsao-fav", JSON.stringify(next));
              }}
              className="h-10 flex-1 rounded-full bg-ink text-sm text-gold"
            >
              {fav.includes(script.id) ? "已收藏" : "收藏"}
            </button>
            <button
              type="button"
              onClick={() => {
                const ind = scriptIndicator(script.id);
                if (!ind) return;
                useDesk.setState((state) => ({ indicators: state.indicators.some((item) => item.id === ind.id) ? state.indicators : [...state.indicators, ind] }));
                setNote(`${script.name} 已进指标库。规则收成均线方向，去指标库武装。`);
              }}
              className="h-10 flex-1 rounded-full bg-gold text-sm text-ink"
            >
              导入
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

export function BacktestBoard({ bars }: { bars: Bar[] }) {
  const [rows, setRows] = useState<ScanRow[] | null>(null);
  const best = useMemo(() => rows?.slice().sort((a, b) => b.pnl - a.pnl)[0] ?? null, [rows]);
  return (
    <section className="space-y-3 rounded-2xl bg-panel px-4 py-4 shadow-panel">
      <p className="text-sm text-cream">用图上已有的 K 线回放剥头皮。扣掉 0.06 手续费。这不是交易所的真实成交。</p>
      <button
        type="button"
        disabled={bars.length < 80}
        onClick={() => setRows(scanFast(bars))}
        className="h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-40"
      >
        {bars.length < 80 ? "K 线还不够" : "回放三档快均线"}
      </button>
      {rows?.map((row) => (
        <p key={row.fast} className="text-sm text-cream">
          快均线 {row.fast} · {row.trades} 笔 · 胜率 {Math.round(row.winRate * 100)}% · 盈利因子 {row.profitFactor} · 回撤 {row.maxDrawdown} · 净 {row.pnl}
        </p>
      ))}
      {best ? <p className="text-sm text-gold">这三段里，快均线 {best.fast} 的净盈亏最高。要换上，去策略里改快均线。</p> : null}
    </section>
  );
}

export function SetupBoard({ onOpen }: { onOpen: (id: "terminal" | "command" | "flow" | "arch" | "link" | "study" | "macro" | "lab" | "judge" | "dig") => void }) {
  const [note, setNote] = useState("");
  return (
    <section className="space-y-3">
      <div className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <p className="text-sm text-cream">风险</p>
        <p className="mt-2 text-sm leading-6 text-cream-dim">单笔止损超过 0.8 美元不下。同时只拿一单。5 分钟亏 3 笔熔断 30 分钟。当天亏满设定就停。</p>
        <button
          type="button"
          onClick={() => {
            const plan = cleanPlan({ ...DEFAULT_PLAN, dayStop: 3, spread: 0.5, trendTp: 0.45, runTp: 0.45, revTp: 0.45, trendSl: 0.4, trailArm: 0.3, trailStep: 0.2 });
            void saveScalpPlan({ data: plan }).then(() => setNote(planSentence(plan))).catch(() => setNote("没存上。"));
          }}
          className="mt-3 h-11 w-full rounded-full bg-gold text-sm text-ink"
        >
          存成当前风险
        </button>
        {note ? <p className="mt-2 text-sm text-gold">{note}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["terminal", "终端"],
            ["command", "总控"],
            ["flow", "订单流"],
            ["arch", "架构"],
            ["link", "接口"],
            ["study", "研习"],
            ["macro", "共振"],
            ["lab", "实验室"],
            ["judge", "研判"],
            ["dig", "挖掘"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => onOpen(id)} className="h-11 rounded-full bg-panel text-sm text-cream">{label}</button>
        ))}
      </div>
    </section>
  );
}
