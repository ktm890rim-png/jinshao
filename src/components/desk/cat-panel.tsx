import { px, sideLabel } from "@/lib/format";
import { readCat } from "@/lib/indicators/laomao";
import type { Bar } from "@/lib/indicators/types";

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function vol(n: number | null): string {
  if (n == null) return "na";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function CatPanel({ bars }: { bars: Bar[] }) {
  const cat = readCat(bars);
  if (!cat) return <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cream-dim shadow-panel">老猫这套还在等足够的 K 线。</p>;
  const rows = [
    ["SMA9", pct(cat.sellPct), pct(cat.buyPct)],
    ["量能", vol(cat.volSell), vol(cat.volBuy)],
    ["总成交", vol(cat.volTotal), ""],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
        <p className="text-sm text-cream">老猫价格行为</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <p className="text-cinnabar">卖方</p>
          <p className="text-right text-gold">买方</p>
          {rows.map(([name, sell, buy]) => (
            <div key={name} className="col-span-2 grid grid-cols-2 gap-2">
              <p className="text-cream-dim">
                {name} <span className="tabular-nums text-cinnabar">{sell}</span>
              </p>
              <p className="text-right tabular-nums text-gold">{buy}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-cream-dim">
            <span>多空分界</span>
            <span className="tabular-nums text-cream">{pct(cat.boundary)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
            <div className="h-full bg-gold" style={{ width: `${Math.max(6, Math.min(100, cat.boundary))}%` }} />
          </div>
        </div>
      </div>
      <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-cream">止盈统计</p>
          <p className={"text-sm " + (cat.side === "long" ? "text-gold" : "text-cinnabar")}>{sideLabel(cat.side)}</p>
        </div>
        <p className="mt-1 text-xs text-cream-dim">{cat.count} 个放量突破</p>
        {cat.entry != null && cat.stop != null ? (
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-cream-dim">入场</dt>
              <dd className="tabular-nums">{px(cat.entry)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-cream-dim">止损</dt>
              <dd className="tabular-nums text-cinnabar">{px(cat.stop)}</dd>
            </div>
            {cat.targets.map((price, i) => (
              <div key={price} className="flex justify-between gap-3">
                <dt className="text-cream-dim">{cat.hit[i] ? `✓ 止盈${i + 1}` : `止盈${i + 1}`}</dt>
                <dd className="tabular-nums text-gold">{px(price)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-cream-dim">还没有放量突破。价在 SMA9 上、收盘破前 8 根、量也放大，才记一笔。</p>
        )}
      </div>
    </div>
  );
}
