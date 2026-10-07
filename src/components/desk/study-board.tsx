import type { StudyReport } from "@/lib/study";

export function StudyBoard({
  report,
  error,
  busy,
  onAgain,
}: {
  report: StudyReport | null;
  error: string;
  busy: boolean;
  onAgain: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-cream-dim">研习库</p>
          <h2 className="text-lg text-cream">自己喂自己，用新行情改建议</h2>
        </div>
        <button type="button" onClick={onAgain} disabled={busy} className="h-10 shrink-0 rounded-full bg-gold px-4 text-sm text-ink disabled:opacity-60">
          {busy ? "推算中" : "再推一遍"}
        </button>
      </div>
      {!report && !error ? <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cream-dim shadow-panel">正在用这段黄金推算，并写进库。</p> : null}
      {error ? <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cinnabar shadow-panel">{error}</p> : null}
      {report ? (
        <>
          <div className="rounded-2xl bg-panel px-4 py-4 shadow-panel">
            <p className="text-xs text-gold">系统建议 · 已记 {report.runs} 次</p>
            <p className="mt-2 text-sm leading-6 text-cream">{report.advice}</p>
            <p className="mt-3 text-xs leading-5 text-cream-dim">{report.learned}</p>
          </div>
          {report.scores.map((row) => (
            <article key={row.playId} className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-cream-dim">{row.trader}</p>
                  <h3 className="text-base text-cream">{row.name}</h3>
                </div>
                <p className={"text-sm tabular-nums " + (row.playId === "douglas" ? "text-cream-dim" : row.expectancy > 0 ? "text-gold" : "text-cinnabar")}>
                  {row.playId === "douglas" ? "习惯" : row.trades ? `${row.expectancy > 0 ? "+" : ""}${row.expectancy.toFixed(2)}R` : "样本少"}
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-cream">{row.habit}</p>
              <p className="mt-2 text-xs leading-5 text-cream-dim">{row.lesson}</p>
              <p className="mt-2 text-xs leading-5 text-cream">
                {row.kind === "indicator" ? "指标" : "策略"}
                {row.trades ? ` · ${row.wins}/${row.trades} 笔赢` : ""}
                {row.nowSide === "flat" ? " · 空仓" : row.nowSide === "long" ? " · 模拟做多" : " · 模拟做空"}
              </p>
              <p className="mt-1 text-xs leading-5 text-cream-dim">{row.projection}</p>
            </article>
          ))}
          <p className="text-xs leading-5 text-cream-dim">
            推算只用已经走出来的五分钟。进场算下一根开盘，同一根里先碰到止损就算输，目标是两倍风险，最多拿二十四根。著名交易员的原周期和仓位没有搬进来，搬的是习惯。
          </p>
        </>
      ) : null}
    </div>
  );
}
