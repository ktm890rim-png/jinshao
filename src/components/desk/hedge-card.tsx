import { useEffect, useState } from "react";
import { fetchHedge, type HedgeRead } from "@/lib/hedge";

function signed(value: number | null): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function HedgeCard() {
  const [read, setRead] = useState<HedgeRead | null>(null);

  useEffect(() => {
    let gone = false;
    const pull = () => {
      void fetchHedge()
        .then((next) => {
          if (!gone) setRead(next);
        })
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 60_000);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, []);

  const tone = read?.kind === "hedge" ? "text-cinnabar" : read?.kind === "together" ? "text-gold" : "text-cream";

  return (
    <section className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
      <p className="text-xs text-cream-dim">原油和黄金 · 近 6 小时</p>
      <p className={"mt-1 text-sm " + tone}>{read?.title ?? "正在看原油和黄金"}</p>
      <p className="mt-2 text-sm tabular-nums text-cream">
        美原油 {read?.oil != null ? read.oil.toFixed(2) : "—"} {signed(read?.oilPct ?? null)}
        <span className="text-cream-dim"> · </span>
        黄金期货 {read?.gold != null ? read.gold.toFixed(0) : "—"} {signed(read?.goldPct ?? null)}
      </p>
      <p className="mt-2 text-sm leading-6 text-cream-dim">{read?.note ?? "油涨金跌，或油跌金涨，才叫对冲。一起涨跌不是。"}</p>
    </section>
  );
}
