import { useState } from "react";
import type { Decision } from "@/lib/decision";
import { px } from "@/lib/format";
import { nearestZone, reviewNotes, type Note } from "@/lib/playbook";
import type { Assessment } from "@/lib/terminal";
import type { Bar } from "@/lib/indicators/types";
import { BrokerSearch } from "./broker-search";
import { StrategyDesk } from "./strategy-desk";

const SECTIONS = ["总览", "策略", "日志", "连接"] as const;
type Section = (typeof SECTIONS)[number];

export function TerminalView({
  bars,
  decision,
  read,
  notes,
  busy,
  reply,
  onAsk,
}: {
  bars: Bar[];
  decision: Decision | null;
  read: Assessment | null;
  notes: Note[];
  busy: boolean;
  reply: string;
  onAsk: (question: string) => void;
}) {
  const [section, setSection] = useState<Section>("总览");
  const price = bars.length ? bars[bars.length - 1].c : null;
  const zone = bars.length > 20 && price != null ? nearestZone(bars, price) : null;

  return (
    <div className="space-y-3">
      <div className="nav-scroll flex gap-2 overflow-x-auto">
        {SECTIONS.map((item) => (
          <button key={item} type="button" onClick={() => setSection(item)} className={"h-10 shrink-0 rounded-full px-4 text-sm " + (section === item ? "bg-gold text-ink" : "bg-panel text-cream")}>
            {item}
          </button>
        ))}
      </div>
      {section === "总览" ? (
        <section className="space-y-3 rounded-2xl bg-panel px-4 py-4 shadow-panel">
          <p className="text-sm text-cream">{decision ? `${decision.regimeLabel} · ${decision.grade} ${decision.score}/100` : "K 线还在接"}</p>
          <p className="text-sm leading-6 text-cream-dim">{decision?.lifeLabel ?? "先不判断"}。信号都写得出理由，对不上就不给方向。</p>
          {decision?.plan ? (
            <p className="text-sm leading-6 text-cream">
              区域 {px(decision.plan.entryLow)}–{px(decision.plan.entryHigh)} · 止损 {px(decision.plan.stop)} · 目标 {px(decision.plan.tp1)} / {px(decision.plan.tp2)} · 1 : {decision.plan.rr.toFixed(1)}
            </p>
          ) : null}
          {decision?.reasons.length ? <p className="text-sm leading-6 text-cream">依据：{decision.reasons.join("，")}</p> : null}
          {decision?.blocks.length ? <p className="text-sm leading-6 text-cinnabar">不做：{decision.blocks.join("，")}</p> : null}
          {read ? <p className="text-sm leading-6 text-cream-dim">{read.structure}。{read.liquidity}。{read.flow} {read.profile} {read.zone} {read.divergence}</p> : null}
          <p className="text-sm leading-6 text-cream">{zone ? `最近的${zone.kind === "demand" ? "需求" : "供给"} ${px(zone.low)}–${px(zone.high)}，只留这一处。` : "附近没有还有效的供需区。"}</p>
          <p className="text-xs leading-5 text-cream-dim">上面「链接交易中」才是自动的开关。这里的总览只看行情，不代表自动关了。</p>
        </section>
      ) : null}
      {section === "策略" ? <StrategyDesk /> : null}
      {section === "日志" ? (
        <section className="space-y-3 rounded-2xl bg-panel px-4 py-4 shadow-panel">
          <p className="text-sm leading-6 text-cream">{reviewNotes(notes)}</p>
          <button
            type="button"
            disabled={busy || notes.length < 3}
            onClick={() => onAsk(`根据这些判断复盘，不要新编价格：${reviewNotes(notes)} ${notes.slice(0, 6).map((item) => item.why).join("；")}`)}
            className="h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-40"
          >
            {busy ? "在看记录" : "让哨兵复盘"}
          </button>
          {reply ? <p className="text-sm leading-6 text-cream">{reply}</p> : null}
          <ul className="space-y-2">
            {notes.slice(0, 8).map((item) => (
              <li key={item.at} className="text-sm leading-5 text-cream-dim">
                {new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · {item.grade} {item.score} · {item.why}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {section === "连接" ? (
        <section className="space-y-3 rounded-2xl bg-panel px-4 py-4 text-sm leading-6 text-cream shadow-panel">
          <BrokerSearch decision={decision} />
          <p className="text-cream-dim">自动开着就会停在上面，换页面不会灭。盈亏记在「链接交易中」那一块。</p>
        </section>
      ) : null}
    </div>
  );
}
