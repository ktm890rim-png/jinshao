import { useEffect, useState } from "react";
import { fmtClock, px } from "@/lib/format";
import type { QuoteBook } from "@/lib/market";

export type Tick = { at: number; mid: number; bid: number; ask: number; up: boolean };

export function QuoteStage({ book, ticks }: { book: QuoteBook | null; ticks: Tick[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const mid = book?.mid ?? null;
  const age = book ? Math.max(0, now - book.at) : null;
  const prev = ticks[1]?.mid ?? ticks[0]?.mid ?? null;
  const up = mid == null || prev == null ? true : mid >= prev;
  const delta = mid != null && prev != null && Math.abs(mid - prev) >= 0.005 ? mid - prev : null;
  const swiss = book?.sources.find((item) => item.id === "swissquote");
  const other = book?.sources.find((item) => item.id === "goldapi");
  const gap = swiss?.mid != null && other?.mid != null ? swiss.mid - other.mid : null;

  return (
    <div className="overflow-hidden rounded-2xl bg-panel shadow-panel">
      <div className="relative h-1 overflow-hidden bg-ink">
        <div className="quote-scan absolute inset-y-0 w-1/3 bg-gold" />
      </div>
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="flex items-center gap-2 text-xs text-cream-dim">
          <span className={"size-2 rounded-full " + (book?.ok ? "live-dot bg-gold" : "bg-cinnabar")} />
          XAUUSD · {book?.source || "正在接"}
        </p>
        <p className="text-xs tabular-nums text-cream-dim">
          {age == null ? "后台未响" : age < 1000 ? `${age} ms 前` : `${(age / 1000).toFixed(1)} 秒前`}
          {book ? ` · ${book.latencyMs} ms` : ""}
        </p>
      </div>
      <div className="px-4 pt-2 pb-3">
        <p
          key={mid ?? "wait"}
          className={
            "quote-flash font-serif text-5xl tabular-nums leading-none tracking-tight " +
            (mid == null ? "text-cream" : up ? "text-gold" : "text-cinnabar")
          }
        >
          {mid == null ? "——" : px(mid)}
        </p>
        <p className={"mt-2 text-sm tabular-nums " + (delta == null ? "text-cream-dim" : delta > 0 ? "text-gold" : "text-cinnabar")}>
          {delta == null ? (book?.ok ? "这一拍价没动，线路还在听" : (book?.error ?? "正在接瑞士买卖价")) : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`}
        </p>
      </div>
      <div className="grid grid-cols-3 border-t border-line">
        <div className="px-4 py-3">
          <p className="text-xs text-cream-dim">买价</p>
          <p className="mt-1 text-sm tabular-nums text-cinnabar">{book?.bid != null ? px(book.bid) : "—"}</p>
        </div>
        <div className="border-x border-line px-4 py-3">
          <p className="text-xs text-cream-dim">点差</p>
          <p className="mt-1 text-sm tabular-nums text-cream">
            {book?.bid != null && book.ask != null ? (book.ask - book.bid).toFixed(2) : "—"}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-cream-dim">卖价</p>
          <p className="mt-1 text-sm tabular-nums text-gold">{book?.ask != null ? px(book.ask) : "—"}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-line">
        {(book?.sources ?? []).map((source) => (
          <div key={source.id} className="px-4 py-3 first:border-r first:border-line">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-cream">{source.name}</p>
              <p className={"text-xs tabular-nums " + (source.ok ? "text-gold" : "text-cinnabar")}>
                {source.ok ? `${source.latencyMs} ms` : "断"}
              </p>
            </div>
            <p className="mt-1 text-lg tabular-nums text-cream">{source.mid != null ? px(source.mid) : "—"}</p>
            <p className="mt-1 text-xs text-cream-dim">{source.note}</p>
          </div>
        ))}
      </div>
      {gap != null ? (
        <p className="border-t border-line px-4 py-2 text-xs text-cream-dim">两源相差 {Math.abs(gap).toFixed(2)} 美元，画面上的跳动以瑞士买卖价为准。</p>
      ) : null}
      {ticks.length ? (
        <div className="border-t border-line px-4 py-2">
          {ticks.slice(0, 6).map((tick) => (
            <div key={tick.at} className="flex items-baseline justify-between py-0.5 text-xs tabular-nums">
              <span className="text-cream-dim">{fmtClock(tick.at)}</span>
              <span className={tick.up ? "text-gold" : "text-cinnabar"}>
                {tick.up ? "上" : "下"} {px(tick.mid)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
