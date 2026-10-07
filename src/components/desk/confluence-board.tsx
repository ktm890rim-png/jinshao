import { useEffect, useState } from "react";
import { awayLabel, bjClock, calendarState } from "@/lib/calendar";
import { readChan } from "@/lib/chan";
import { resonate } from "@/lib/confluence";
import { resample } from "@/lib/indicators/bars";
import type { Bar, Side } from "@/lib/indicators/types";
import type { StudyReport } from "@/lib/study";

function lean(report: StudyReport | null): { side: Side | "flat"; name: string } {
  const open = report?.scores.find((item) => item.nowSide !== "flat" && item.trades >= 6 && item.expectancy > 0 && item.playId !== "douglas");
  if (!open || (open.nowSide !== "long" && open.nowSide !== "short")) return { side: "flat", name: "" };
  return { side: open.nowSide, name: open.name };
}

export function ConfluenceBoard({ bars, price, study }: { bars: Bar[]; price: number | null; study: StudyReport | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const cal = calendarState(now);
  const spot = price ?? bars[bars.length - 1]?.c ?? 0;
  const chan = readChan(resample(bars, 15), spot);
  const studyLean = lean(study);
  const call = resonate({ chan, cal, studySide: studyLean.side, studyName: studyLean.name, price: spot });
  const tone = call.bias === "long" ? "text-gold" : call.bias === "short" ? "text-cinnabar" : "text-cream";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-cream-dim">大事 · 缠论 · 研习</p>
        <h2 className="text-lg text-cream">共振了才谈怎么进</h2>
      </div>
      <div className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
        <p className={"text-sm " + tone}>{call.title}</p>
        <p className="mt-2 text-sm leading-6 text-cream">{call.how}</p>
      </div>
      <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-cream">缠论 · 十五分钟</p>
          <p className={"text-sm " + (chan.bias === "long" ? "text-gold" : chan.bias === "short" ? "text-cinnabar" : "text-cream-dim")}>{chan.point}</p>
        </div>
        <p className="mt-2 text-sm leading-6 text-cream">{chan.note}</p>
        {chan.zd != null && chan.zg != null ? (
          <p className="mt-2 text-xs tabular-nums text-cream-dim">
            中枢 {chan.zd.toFixed(2)} – {chan.zg.toFixed(2)}
            {chan.diverge ? " · 力度背驰" : ""}
          </p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl bg-panel shadow-panel">
        <div className="flex items-baseline justify-between px-4 pt-3">
          <p className="text-sm text-cream">本周大事</p>
          <p className="text-xs text-cream-dim">北京时间</p>
        </div>
        <ul className="mt-2">
          {cal.events.map((item) => {
            const gone = item.at < now - 30 * 60_000;
            const dot = item.risk >= 5 ? "bg-cinnabar" : item.risk >= 4 ? "bg-gold" : "bg-gold-dim";
            return (
              <li key={item.id} className={"border-t border-line px-4 py-3 " + (gone ? "opacity-50" : "")}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-cream">{item.title}</p>
                  <p className="shrink-0 text-xs tabular-nums text-cream-dim">{awayLabel(item.at, now)}</p>
                </div>
                <p className="mt-1 flex items-center gap-2 text-xs text-cream-dim">
                  <span className={"size-2 rounded-full " + dot} />
                  风险 {item.risk} · {bjClock(item.at)}
                </p>
                <p className="mt-1 text-xs leading-5 text-cream-dim">{item.impact}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-xs leading-5 text-cream-dim">
        金十的正式日历要他们自己的钥匙，这边接不上，所以这张表用的是你给的这一周，钟是实时的。缠论是十五分钟上的分型、笔、中枢和力度比较，不是某套软件的原版。手机合上之后，没有另一台电脑在替你盯。
      </p>
    </div>
  );
}
