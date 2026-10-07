import { useEffect, useState } from "react";
import { autoStatus, releaseAuto, stopAuto } from "@/lib/auto-server";

type View = Awaited<ReturnType<typeof autoStatus>>;

export function LiveTrade({ price }: { price: number | null }) {
  const [live, setLive] = useState<View | null>(null);

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
          <button type="button" onClick={() => void stopAuto().then(setLive)} className="h-10 rounded-full bg-cinnabar px-4 text-sm text-ink">关闭自动</button>
        </div>
        <p className="mt-2 text-sm text-cream">
          {live.held === "buy" ? "多单" : live.held === "sell" ? "空单" : "空仓"}
          {openPnl != null ? ` · 浮盈 ${openPnl.toFixed(2)} 美元` : ""}
          {live.protect ? " · 原来的仓先不动" : " · 退出 App 也继续"}
        </p>
        <p className="mt-1 text-xs leading-5 text-cream-dim">{live.note}</p>
        {live.note.includes("时间") ? <p className="mt-1 text-xs leading-5 text-cream">自动没关。这一笔被拒了，仓还是空的，下一轮会再试。</p> : null}
        <p className="mt-1 text-xs leading-5 text-cream-dim">顺势：回踩均线再走，或沿着均线走。反转：扫掉前高前低再收回，而且不逆着大方向。浮盈 0.3 收到成本，之后每 0.2 往前推。</p>
        {live.protect ? (
          <button type="button" onClick={() => void releaseAuto().then(setLive)} className="mt-3 h-10 rounded-full bg-gold px-4 text-sm text-ink">
            原来的仓我已处理，按新信号做
          </button>
        ) : null}
        <ul className="mt-3 space-y-2">
          {live.fills.length ? live.fills.map((fill) => (
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
