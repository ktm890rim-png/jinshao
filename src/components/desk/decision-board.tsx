import { useEffect, useState } from "react";
import { px } from "@/lib/format";
import type { Decision, Grade, TfState } from "@/lib/decision";
import type { Assessment } from "@/lib/terminal";

const TF: Record<TfState, string> = { long: "多", short: "空", pullback: "回踩", range: "震荡" };

function tone(grade: Grade): string {
  if (grade === "A+" || grade === "A") return "text-gold";
  if (grade === "NO") return "text-cinnabar";
  return "text-cream";
}

type Log = { at: number; text: string };

export function DecisionBoard({ decision, price, change, read }: { decision: Decision | null; price: number | null; change: number | null; read: Assessment | null }) {
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("jinsao-log") || "[]") as Log[];
      if (Array.isArray(saved)) setLogs(saved.slice(0, 8));
    } catch {
      /* 旧记录丢掉 */
    }
  }, []);
  useEffect(() => {
    if (!decision) return;
    const text = `${decision.grade === "NO" ? "不做" : decision.side === "long" ? "做多" : decision.side === "short" ? "做空" : "不做"} ${decision.grade} ${decision.score}`;
    setLogs((prev) => {
      if (prev[0]?.text === text) return prev;
      const next = [{ at: Date.now(), text }, ...prev].slice(0, 8);
      localStorage.setItem("jinsao-log", JSON.stringify(next));
      return next;
    });
  }, [decision]);

  if (!decision) {
    return <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cream-dim shadow-panel">K 线还在接，环境先不判断。</p>;
  }
  const sideText = decision.side === "long" ? "做多" : decision.side === "short" ? "做空" : "不做";
  return (
    <section className="overflow-hidden rounded-2xl bg-panel shadow-panel">
      <div className="flex items-end justify-between gap-3 px-4 pt-4">
        <div>
          <p className="text-xs text-cream-dim">XAUUSD</p>
          <p className="mt-1 text-2xl tabular-nums text-gold">{price != null ? px(price) : "正在接"}</p>
        </div>
        <p className={"text-sm tabular-nums " + ((change ?? 0) >= 0 ? "text-gold" : "text-cinnabar")}>
          {change == null ? "" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}`}
        </p>
      </div>
      <div className="px-4 pt-3">
        <p className="text-xs text-cream-dim">行情环境</p>
        <p className="mt-1 text-lg text-cream">{decision.regimeLabel}</p>
        <p className="mt-2 text-sm text-cream-dim">
          1小时 {TF[decision.tf.h1]} · 15分 {TF[decision.tf.m15]} · 5分 {TF[decision.tf.m5]}
        </p>
      </div>
      <div className="mx-4 mt-4 rounded-2xl bg-ink px-4 py-4">
        <p className={"text-center text-lg " + tone(decision.grade)}>
          {decision.grade === "NO" ? "方向没对齐" : `${decision.grade} ${sideText}`}
        </p>
        <p className="mt-1 text-center text-sm tabular-nums text-cream-dim">{decision.score} / 100</p>
        {decision.plan ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-cream-dim">入场区域</dt>
              <dd className="mt-1 tabular-nums text-cream">{px(decision.plan.entryLow)} – {px(decision.plan.entryHigh)}</dd>
            </div>
            <div>
              <dt className="text-xs text-cream-dim">止损</dt>
              <dd className="mt-1 tabular-nums text-cinnabar">{px(decision.plan.stop)}</dd>
            </div>
            <div>
              <dt className="text-xs text-cream-dim">第一目标</dt>
              <dd className="mt-1 tabular-nums text-cream">{px(decision.plan.tp1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-cream-dim">第二目标</dt>
              <dd className="mt-1 tabular-nums text-cream">{px(decision.plan.tp2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-cream-dim">盈亏比</dt>
              <dd className="mt-1 tabular-nums text-cream">1 : {decision.plan.rr.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-cream-dim">仓位</dt>
              <dd className="mt-1 text-cream">{decision.size}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm leading-6 text-cream-dim">{decision.blocks.slice(0, 4).join("。") || "这会儿没有计划。"}</p>
        )}
      </div>
      {decision.reasons.length ? (
        <ul className="space-y-1 px-4 pt-3">
          {decision.reasons.map((item) => (
            <li key={item} className="text-sm text-cream">已满足 · {item}</li>
          ))}
        </ul>
      ) : null}
      {decision.blocks.length ? (
        <ul className="space-y-1 px-4 pt-3">
          {decision.blocks.map((item) => (
            <li key={item} className="text-sm text-cinnabar">{decision.tradable ? "参考" : "先等"} · {item}</li>
          ))}
        </ul>
      ) : null}
      <p className={"px-4 pt-4 text-sm " + (decision.tradable ? "text-gold" : "text-cream")}>{decision.lifeLabel}</p>
      {read && read.parts.length ? (
        <div className="space-y-2 px-4 pb-4 pt-3">
          {read.parts.map((part) => (
            <div key={part.name}>
              <div className="flex items-center justify-between text-xs text-cream-dim">
                <span>{part.name}</span>
                <span className="tabular-nums">{part.score}/{part.max}</span>
              </div>
              <p className="text-sm leading-5 text-cream">{part.note}</p>
            </div>
          ))}
          <p className="text-sm text-cream">合计 {read.total}/100 · {read.session}</p>
          <p className="text-sm leading-5 text-cream-dim">{read.structure}。{read.liquidity}。{read.divergence}。{read.zone}</p>
          <p className="text-xs leading-5 text-cream-dim">美元指数和美债这台没有稳定行情，不编。相对强弱超买不会单独变成做空。</p>
        </div>
      ) : null}
      {logs.length ? (
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs text-cream-dim">最近判断</p>
          <ul className="mt-2 space-y-1">
            {logs.map((item) => (
              <li key={item.at} className="flex justify-between gap-3 text-xs text-cream-dim">
                <span className="tabular-nums">{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
