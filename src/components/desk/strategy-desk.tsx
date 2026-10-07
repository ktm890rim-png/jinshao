import { useEffect, useState } from "react";
import { applyStrategyText, saveScalpPlan, scalpPlan } from "@/lib/auto-server";
import { cleanPlan, DEFAULT_PLAN, planSentence, type ScalpPlan } from "@/lib/m1-scalp";

export function StrategyDesk() {
  const [text, setText] = useState("");
  const [base, setBase] = useState<ScalpPlan>(DEFAULT_PLAN);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void scalpPlan().then(setBase).catch(() => undefined);
  }, []);

  return (
    <section className="space-y-3 rounded-2xl bg-panel px-4 py-4 shadow-panel">
      <div className="flex gap-2">
        {(
          [
            ["激进", cleanPlan({ ...DEFAULT_PLAN, trendTp: 0.45, runTp: 0.45, revTp: 0.45, trendSl: 0.35, runSl: 0.35, revSl: 0.35, trailArm: 0.25, trailStep: 0.15, spread: 0.5 })],
            ["平衡", cleanPlan({ ...DEFAULT_PLAN, trailArm: 0.3, trailStep: 0.2 })],
            ["保守", cleanPlan({ ...DEFAULT_PLAN, style: "confirm", minHits: 4, chopOff: true, trendTp: 0.7, runTp: 0.7, revTp: 0.7, trendSl: 0.4, trailArm: 0.3, trailStep: 0.2 })],
          ] as const
        ).map(([label, plan]) => (
          <button
            key={label}
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void saveScalpPlan({ data: plan })
                .then((res) => {
                  setBase(res.plan);
                  setSaved(planSentence(res.plan));
                  setNote(`已用${label}。${res.preview}`);
                })
                .catch(() => setNote("这套没存上。"))
                .finally(() => setBusy(false));
            }}
            className="h-10 flex-1 rounded-full bg-ink text-sm text-cream disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-cream">也可以整段贴进来，用模型读。超过二十秒没回就停。</p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, 8000))}
        rows={8}
        placeholder="中文或英文都行。策略写多长都可以，止盈止损、保本、推进写在哪都能读。"
        className="w-full rounded-2xl border border-line bg-ink px-3 py-3 text-sm leading-6 text-cream outline-none"
      />
      <button
        type="button"
        disabled={busy || text.trim().length < 2}
        onClick={() => {
          const body = text;
          setBusy(true);
          setNote("模型在读这段话。");
          const slow = window.setTimeout(() => setNote("还在读。二十秒没有结果就停，不会一直转。"), 8000);
          const giveUp = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 22000));
          void Promise.race([applyStrategyText({ data: { text: body } }), giveUp])
            .then((res) => {
              if (!res.ok) {
                setNote(res.said);
                return;
              }
              setBase(res.plan);
              setSaved(planSentence(res.plan));
              setNote(res.said);
              setText("");
            })
            .catch(() => setNote("模型没接上，原文还在。过一会儿再点一次。"))
            .finally(() => {
              window.clearTimeout(slow);
              setBusy(false);
            });
        }}
        className="h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-40"
      >
        {busy ? "模型在读" : "识别并保存"}
      </button>
      {saved ? <p className="text-sm leading-6 text-gold">{saved}</p> : null}
      {note ? <p className="text-sm leading-6 text-cream">{note}</p> : null}
    </section>
  );
}
