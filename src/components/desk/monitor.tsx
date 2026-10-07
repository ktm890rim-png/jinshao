import { useEffect, useState } from "react";
import { awayLabel, bjClock } from "@/lib/calendar";
import { px, sideLabel } from "@/lib/format";
import { parseHook, type Judgment, type MechLane, type NewsLane, type TvHook, type TvLane } from "@/lib/lanes";
import type { QuoteBook } from "@/lib/market";
import type { Pipeline } from "@/lib/pipeline";

export function MonitorBoard({ book, news, mech, tv, judgment, pipe, onConfirm }: { book: QuoteBook | null; news: NewsLane; mech: MechLane; tv: TvLane; judgment: Judgment; pipe: Pipeline | null; onConfirm?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const spread = book?.bid != null && book?.ask != null ? book.ask - book.bid : null;
  const age = book ? Math.max(0, now - book.at) : null;
  const hookAge = tv.at == null ? null : Math.max(0, now - tv.at);
  const setup = pipe && pipe.side !== "flat" && pipe.entry != null && pipe.stop != null && judgment.grade !== "无";

  return (
    <div className="grid grid-cols-2 gap-2">
      <article className="rounded-2xl bg-panel px-3 py-3 shadow-panel">
        <p className="text-xs text-cream-dim">现价</p>
        <p className="mt-1 text-lg tabular-nums text-gold">{book?.mid != null ? px(book.mid) : "正在接"}</p>
        <p className="mt-1 text-xs tabular-nums text-cream-dim">
          {spread == null ? "点差还没到" : `点差 ${spread.toFixed(2)}`}
          {book ? ` · ${book.latencyMs} ms` : ""}
        </p>
      </article>
      <article className="rounded-2xl bg-panel px-3 py-3 shadow-panel">
        <p className="text-xs text-cream-dim">状态</p>
        <p className={"mt-1 text-lg " + (judgment.state === "静音" || judgment.state === "冷却" ? "text-cinnabar" : "text-cream")}>{judgment.state}</p>
        <p className="mt-1 text-xs text-cream-dim">{judgment.missing === "没有缺的" ? "这几层都过了" : `缺的是${judgment.missing}`}</p>
      </article>
      <article className="col-span-2 rounded-2xl bg-panel px-3 py-3 shadow-panel">
        <p className="text-xs text-cream-dim">信号</p>
        {setup && pipe ? (
          <>
            <p className="mt-1 text-sm text-cream">
              {judgment.grade} · {pipe.side === "flat" ? "没选边" : sideLabel(pipe.side)}
            </p>
            <p className="mt-1 text-sm tabular-nums text-cream">
              入场 {pipe.entry != null ? px(pipe.entry) : "—"} · 止损 {pipe.stop != null ? px(pipe.stop) : "—"} · 目标 {pipe.targets[0] != null ? px(pipe.targets[0]) : "—"}
            </p>
            <p className="mt-1 text-xs leading-5 text-cream-dim">{judgment.lines.join(" ")}</p>
            {judgment.missing === "人工确认" && onConfirm ? (
              <button type="button" onClick={onConfirm} className="mt-3 h-11 w-full rounded-full bg-gold text-sm text-ink">
                确认这份草稿
              </button>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-cream-dim">没有正式信号{judgment.missing === "没有缺的" ? "" : `，卡在${judgment.missing}`}。</p>
        )}
      </article>
      <article className="col-span-2 rounded-2xl bg-panel px-3 py-3 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-cream-dim">下一件高影响</p>
            <p className="mt-1 text-sm text-cream">{news.nextTitle ?? "这张周历上的高影响都过了"}</p>
          </div>
          <p className="text-sm tabular-nums text-gold">{news.nextAt != null ? awayLabel(news.nextAt, now) : ""}</p>
        </div>
        {news.nextAt != null ? <p className="mt-1 text-xs text-cream-dim">{bjClock(news.nextAt)} · 北京时间</p> : null}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-cream-dim">
          <span>{age != null && age < 8000 ? "报价在跳" : "报价延迟"}</span>
          <span>{hookAge == null ? "告警还没有" : hookAge < 15 * 60_000 ? "告警在十五分钟内" : "告警过期"}</span>
          <span>日历是这周的表</span>
          <span>{mech.veto ? "机制拦住了" : "机制没拦"}</span>
        </div>
      </article>
    </div>
  );
}

export function HookBox({ secret, hook, note, onSave }: { secret: string; hook: TvHook | null; note: string; onSave: (secret: string, hook: TvHook | null, note: string) => void }) {
  const [draftSecret, setDraftSecret] = useState(secret);
  const [body, setBody] = useState("");
  useEffect(() => setDraftSecret(secret), [secret]);

  return (
    <form
      className="rounded-2xl bg-panel p-4 shadow-panel"
      onSubmit={(event) => {
        event.preventDefault();
        const nextSecret = draftSecret.trim();
        if (!body.trim()) {
          onSave(nextSecret, hook, nextSecret ? "密钥已记下。告警来了才做确认，不会单独开仓。" : "先写共享密钥。");
          return;
        }
        const parsed = parseHook(body, Date.now());
        if (!parsed.ok) {
          onSave(nextSecret, hook, parsed.error);
          return;
        }
        if (!nextSecret || parsed.hook.secret !== nextSecret) {
          onSave(nextSecret, hook, "密钥不符，这条告警已丢掉。");
          return;
        }
        onSave(nextSecret, parsed.hook, `${parsed.hook.name} 收下了，只做确认或冲突。`);
        setBody("");
      }}
    >
      <p className="text-sm text-cream">TradingView 收盘告警</p>
      <p className="mt-1 text-xs leading-5 text-cream-dim">图只负责看。告警只做确认或冲突，不能单独变成信号。密钥不对、字段不全，直接丢掉。</p>
      <input value={draftSecret} onChange={(event) => setDraftSecret(event.target.value)} placeholder="共享密钥" className="mt-3 h-11 w-full rounded-full border border-line bg-ink px-4 text-sm text-cream outline-none" />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        spellCheck={false}
        placeholder={'{"secret":"密钥","name":"超级趋势","interval":"5","side":"long","price":4140.2}'}
        className="mt-2 w-full resize-none rounded-xl border border-line bg-ink px-3 py-3 font-mono text-xs text-cream outline-none"
      />
      <button type="submit" className="mt-2 h-11 w-full rounded-full bg-gold text-sm text-ink">
        收下
      </button>
      {note ? <p className="mt-2 text-xs leading-5 text-cream-dim">{note}</p> : null}
      {hook ? <p className="mt-1 text-xs text-cream-dim">上一条：{hook.name} · {hook.interval} · {sideLabel(hook.side)} · {px(hook.price)}</p> : null}
    </form>
  );
}
