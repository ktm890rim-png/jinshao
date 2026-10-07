import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { px, sideLabel } from "@/lib/format";
import { footprint, tradePlan, type Plan } from "@/lib/flow";
import { BLOCK_LABEL, runGraph, type Block, type BlockKind } from "@/lib/graph";
import { useAtelier } from "@/lib/atelier-store";
import type { QuoteSource } from "@/lib/market";
import type { Bar } from "@/lib/indicators/types";

export function planLevels(plan: Plan): { price: number; label: string; tone: "gold" | "cinnabar" | "dim" }[] {
  return [
    { price: plan.stop, label: "止损", tone: "cinnabar" },
    { price: plan.entry, label: "入场", tone: "gold" },
    { price: plan.targets[0], label: "止盈1", tone: "dim" },
    { price: plan.targets[1], label: "止盈2", tone: "dim" },
    { price: plan.targets[2], label: "止盈3", tone: "dim" },
  ];
}

export function PlanCard({ bars }: { bars: Bar[] }) {
  const plan = tradePlan(bars);
  if (!plan) return null;
  const rows = [
    ["入场", px(plan.entry)],
    ["止损", px(plan.stop)],
    ["止盈 1", px(plan.targets[0])],
    ["止盈 2", px(plan.targets[1])],
    ["止盈 3", px(plan.targets[2])],
    ["支撑", px(plan.support)],
    ["阻力", px(plan.resist)],
  ];
  return (
    <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-cream">交易计划</p>
        <p className={"text-sm " + (plan.side === "long" ? "text-gold" : "text-cinnabar")}>{sideLabel(plan.side)}</p>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 text-sm">
            <dt className="text-cream-dim">{k}</dt>
            <dd className="tabular-nums text-cream">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-5 text-cream-dim">
        {plan.burst ? "波幅放大" : "波幅平常"}。{plan.note}图上的虚线就是这几档。
      </p>
    </div>
  );
}

export function OrderFlow({ bars }: { bars: Bar[] }) {
  const prints = footprint(bars);
  const max = Math.max(1, ...prints.flatMap((p) => p.bins.map((b) => b.buy + b.sell)));
  const last = prints[prints.length - 1];
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
        <p className="text-sm text-cream">订单流</p>
        <p className="mt-1 text-xs leading-5 text-cream-dim">
          每根柱子按成交量拆成买和卖。有交易所成交量就用成交量，没有就按波幅估。这不是 ATAS 那种逐笔盘口，真盘口接到下面的接口里才会换上。
        </p>
        {last ? (
          <p className={"mt-2 text-sm tabular-nums " + (last.delta >= 0 ? "text-gold" : "text-cinnabar")}>
            最新 Delta {last.delta >= 0 ? "+" : ""}
            {Math.round(last.delta)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-cream-dim">K 线还不够拆。</p>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-panel p-3 shadow-panel">
        <div className="flex min-w-full gap-1">
          {prints.map((print) => (
            <div key={print.t} className="flex w-8 shrink-0 flex-col-reverse gap-0.5">
              {print.bins.map((bin) => {
                const bid = bin.buy >= bin.sell;
                const h = Math.max(8, ((bin.buy + bin.sell) / max) * 48);
                return (
                  <div
                    key={bin.price}
                    title={`${bin.price.toFixed(2)} 买 ${Math.round(bin.buy)} 卖 ${Math.round(bin.sell)}`}
                    className={"rounded-sm " + (bid ? "bg-gold" : "bg-cinnabar")}
                    style={{ height: `${h}px`, opacity: 0.45 + ((bin.buy + bin.sell) / max) * 0.55 }}
                  />
                );
              })}
              <div className={"mt-1 h-1.5 rounded-full " + (print.delta >= 0 ? "bg-gold" : "bg-cinnabar")} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-cream-dim">金是买盘占优，朱是卖盘占优。底下短线是这根的 Delta。</p>
      </div>
    </div>
  );
}

const PALETTE: BlockKind[] = ["kline", "ma", "macd", "rsi", "bb", "gate", "buy", "sell", "stop"];

export function GraphBoard({ bars }: { bars: Bar[] }) {
  const blocks = useAtelier((s) => s.blocks);
  const wires = useAtelier((s) => s.wires);
  const setBlocks = useAtelier((s) => s.setBlocks);
  const setWires = useAtelier((s) => s.setWires);
  const resetGraph = useAtelier((s) => s.resetGraph);
  const [pick, setPick] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const moved = useRef(false);
  const drag = useRef<{ id: string; x: number; y: number; px: number; py: number } | null>(null);

  function add(kind: BlockKind) {
    const id = `b${Math.random().toString(36).slice(2, 7)}`;
    setBlocks([...blocks, { id, kind, x: 24 + (blocks.length % 4) * 16, y: 24 + (blocks.length % 3) * 18, len: kind === "ma" ? 21 : kind === "rsi" ? 14 : 20 }]);
  }

  function tap(id: string) {
    if (moved.current) return;
    if (!pick) {
      setPick(id);
      return;
    }
    if (pick === id) {
      setPick(null);
      return;
    }
    const exists = wires.some((w) => w.from === pick && w.to === id);
    if (!exists) setWires([...wires, { id: `w${Math.random().toString(36).slice(2, 7)}`, from: pick, to: id }]);
    setPick(null);
  }

  function onDown(block: Block, event: ReactPointerEvent) {
    moved.current = false;
    drag.current = { id: block.id, x: block.x, y: block.y, px: event.clientX, py: event.clientY };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (Math.abs(ev.clientX - d.px) + Math.abs(ev.clientY - d.py) > 6) moved.current = true;
      const next = useAtelier.getState().blocks.map((item) =>
        item.id === d.id ? { ...item, x: Math.max(0, d.x + ev.clientX - d.px), y: Math.max(0, d.y + ev.clientY - d.py) } : item,
      );
      useAtelier.getState().setBlocks(next);
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  const run = runGraph(blocks, wires, bars);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-cream">均线 + MACD 架构</p>
          <button type="button" onClick={() => resetGraph()} className="h-10 rounded-full px-3 text-sm text-cream-dim">
            还原模板
          </button>
        </div>
        <p className="mt-1 text-xs leading-5 text-cream-dim">点一个块，再点另一个，就是连线。拖动能挪位置。先跑模板，再往上加 RSI、布林。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PALETTE.map((kind) => (
            <button key={kind} type="button" onClick={() => add(kind)} className="h-10 rounded-full bg-ink px-3 text-sm text-cream">
              {BLOCK_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-80 overflow-hidden rounded-2xl bg-ink shadow-panel">
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          {wires.map((wire) => {
            const a = blocks.find((b) => b.id === wire.from);
            const b = blocks.find((b) => b.id === wire.to);
            if (!a || !b) return null;
            return <line key={wire.id} x1={a.x + 56} y1={a.y + 22} x2={b.x} y2={b.y + 22} stroke="#8c7040" strokeWidth="1.5" />;
          })}
        </svg>
        {blocks.map((block) => (
          <button
            key={block.id}
            type="button"
            onPointerDown={(event) => onDown(block, event)}
            onClick={() => tap(block.id)}
            className={
              "absolute h-11 w-28 rounded-xl px-2 text-left text-sm shadow-panel " +
              (pick === block.id ? "bg-gold text-ink" : block.kind === "buy" ? "bg-gold text-ink" : block.kind === "sell" || block.kind === "stop" ? "bg-cinnabar text-cream" : "bg-panel text-cream")
            }
            style={{ left: block.x, top: block.y }}
          >
            <span className="block truncate">{BLOCK_LABEL[block.kind]}</span>
            <span className="block truncate text-xs opacity-80">{run.heats[block.id] || (block.len ? String(block.len) : "源头")}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setReport(run.text)} className="h-11 w-full rounded-full bg-gold text-sm text-ink">
        用当前行情跑一遍
      </button>
      {report ? <p className="rounded-2xl bg-panel px-4 py-3 text-sm leading-6 text-cream shadow-panel">{report}</p> : null}
    </div>
  );
}

export function LinkBoard({ sources = [] }: { sources?: QuoteSource[] }) {
  const links = useAtelier((s) => s.links);
  const setLink = useAtelier((s) => s.setLink);
  const [note, setNote] = useState<Record<string, string>>({});

  async function probe(id: string, url: string) {
    if (!url.trim()) {
      setNote((n) => ({ ...n, [id]: "先填地址" }));
      return;
    }
    setNote((n) => ({ ...n, [id]: "在试…" }));
    try {
      const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(6000) });
      setNote((n) => ({ ...n, [id]: res.ok ? `通了，${res.status}` : `有回应，${res.status}` }));
    } catch {
      setNote((n) => ({ ...n, [id]: "这边没连上。地址不对，或者对方不让网页直接访问。" }));
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
        <p className="text-sm text-cream">正在听的报价</p>
        <p className="mt-1 text-xs leading-5 text-cream-dim">瑞士这一口给买卖价，大约每秒问一次。Gold API 只做对照，它经常几秒到几十秒才变一次。</p>
      </div>
      {sources.map((source) => (
        <div key={source.id} className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-cream">{source.name}</p>
            <p className={"text-xs tabular-nums " + (source.ok ? "text-gold" : "text-cinnabar")}>
              {source.ok ? `通 · ${source.latencyMs} ms` : "这拍断了"}
            </p>
          </div>
          <p className="mt-2 font-serif text-3xl tabular-nums text-cream">{source.mid != null ? px(source.mid) : "—"}</p>
          <p className="mt-1 text-xs text-cream-dim">
            {source.bid != null && source.ask != null ? `买 ${px(source.bid)} · 卖 ${px(source.ask)} · ` : ""}
            {source.note}
          </p>
        </div>
      ))}
      <p className="text-xs leading-5 text-cream-dim">下面三个口留给你自己的订单流、券商和机器人。金哨只保存地址，不会替你发单。</p>
      {links
        .filter((slot) => slot.kind !== "quote")
        .map((slot) => (
        <div key={slot.id} className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
          <p className="text-sm text-cream">{slot.name}</p>
          <p className="mt-1 text-xs leading-5 text-cream-dim">{slot.note}</p>
          <input
            value={slot.url}
            onChange={(event) => setLink(slot.id, { url: event.target.value })}
            placeholder="https://"
            className="mt-2 h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-cream"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => void probe(slot.id, slot.url)} className="h-10 rounded-full bg-gold px-4 text-sm text-ink">
              试连
            </button>
            <p className="text-xs text-cream-dim">{note[slot.id] || (slot.url ? "已保存" : "空着")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
