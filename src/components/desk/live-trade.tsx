import { useEffect, useState } from "react";
import { autoStatus, emergencyStop, releaseAuto, stopAuto } from "@/lib/auto-server";

type View = Awaited<ReturnType<typeof autoStatus>>;

export function LiveTrade({ price }: { price: number | null }) {
  const [live, setLive] = useState<View | null>(null);
  const [pick, setPick] = useState<"all" | "win" | "loss">("all");

  useEffect(() => {
    let gone = false;
    const pull = () => {
      void autoStatus()
        .then((next) => {
          if (!gone) setLive(next);
        })
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 8000);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!live?.on) return null;
  const openPnl = live.entry != null && live.held && price != null ? Number((live.held === "buy" ? price - live.entry : live.entry - price).toFixed(2)) : null;
  return (
    <section className="mx-auto max-w-5xl px-4 pt-4">
      <div className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gold">链接交易中</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => void emergencyStop().then(setLive)} className="h-10 rounded-full bg-cinnabar px-4 text-sm text-ink">应急停止</button>
            <button type="button" onClick={() => void stopAuto().then(setLive)} className="h-10 rounded-full bg-ink px-4 text-sm text-cream">关闭自动</button>
          </div>
        </div>
        <p className="mt-2 text-sm text-cream">
          {live.held === "buy" ? "多单" : live.held === "sell" ? "空单" : "空仓"}
          {openPnl != null ? ` · 浮盈 ${openPnl.toFixed(2)} 美元` : ""}
          {live.protect ? " · 原来的仓先不动" : " · 退出 App 也继续"}
        </p>
        <p className="mt-1 text-xs leading-5 text-cream-dim">{live.note}</p>
        {live.note.includes("时间") ? <p className="mt-1 text-xs leading-5 text-cream">自动没关。这一笔被拒了，仓还是空的，下一轮会再试。</p> : null}
        <p className="mt-1 text-xs leading-5 text-cream-dim">同一信号 3 秒内不下第二单。5 分钟亏 3 笔就熔断。止损没挂上就平掉。浮盈到了把止损往前推。</p>
        {live.tripped ? <p className="mt-1 text-xs text-cinnabar">熔断中，这段时间不再开新仓。</p> : null}
        {live.logs.length ? (
          <ul className="mt-2 space-y-1">
            {live.logs.slice(0, 4).map((row) => (
              <li key={row.at} className="text-xs leading-5 text-cream-dim">{new Date(row.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · {row.text}</li>
            ))}
          </ul>
        ) : null}
        {live.protect ? (
          <button type="button" onClick={() => void releaseAuto().then(setLive)} className="mt-3 h-10 rounded-full bg-gold px-4 text-sm text-ink">
            原来的仓我已处理，按新信号做
          </button>
        ) : null}
        <div className="mt-3 flex gap-2">
          {([["all", "全部"], ["win", "盈利"], ["loss", "亏损"]] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPick(id)} className={"h-8 rounded-full px-3 text-xs " + (pick === id ? "bg-gold text-ink" : "bg-ink text-cream")}>{label}</button>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          {live.fills.filter((fill) => pick === "all" || (pick === "win" ? (fill.pnl ?? 0) > 0 : (fill.pnl ?? 0) < 0)).length ? live.fills.filter((fill) => pick === "all" || (pick === "win" ? (fill.pnl ?? 0) > 0 : (fill.pnl ?? 0) < 0)).map((fill) => (
            <li key={fill.at} className="text-sm text-cream">
              {new Date(fill.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
              {" · "}{fill.side === "buy" ? "多" : "空"} {fill.entry.toFixed(2)}
              {fill.exit != null ? ` → ${fill.exit.toFixed(2)}` : ""}
              {fill.pnl != null ? ` · 净 ${fill.pnl.toFixed(2)} 美元` : ` · ${fill.text}`}
            </li>
          )) : <li className="text-sm text-cream-dim">还没有新的盈亏记录。退出再回来，这块还在。</li>}
        </ul>
      </div>
    </section>
  );
}
