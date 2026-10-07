import { createServerFn } from "@tanstack/react-start";
import { resample } from "./indicators/bars";
import { indicatorEntries } from "./indicators/engine";
import { atr, ema, highest, lowest, rsi, sma } from "./indicators/math";
import type { Bar, Condition, Indicator, Side, Timeframe } from "./indicators/types";
import { TF_MIN } from "./indicators/types";
import { px } from "./format";
import { loadMarket } from "./market";

export type StudyIndicator = {
  id: string;
  name: string;
  side: Side;
  timeframe: Timeframe;
  logic: "all" | "any";
  conditions: Condition[];
};

export type StudyScore = {
  playId: string;
  trader: string;
  name: string;
  kind: "strategy" | "indicator";
  trades: number;
  wins: number;
  expectancy: number;
  habit: string;
  nowSide: "long" | "short" | "flat";
  lesson: string;
  projection: string;
};

export type StudyReport = {
  barTime: number;
  spot: number;
  advice: string;
  learned: string;
  runs: number;
  scores: StudyScore[];
};

type Entry = { i: number; side: Side; stop: number };
type OpenPos = { side: Side; entry: number; stop: number; target: number };
type Sim = { rs: number[]; open: OpenPos | null };

const ok = (n: number) => Number.isFinite(n);

function avg(rs: number[]): number {
  if (!rs.length) return 0;
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

function simulate(bars: Bar[], entries: Entry[]): Sim {
  const rs: number[] = [];
  let cursor = -1;
  let open: OpenPos | null = null;
  for (const e of [...entries].sort((a, b) => a.i - b.i)) {
    if (e.i < cursor || e.i >= bars.length - 2) continue;
    const entry = bars[e.i + 1].o;
    const risk = Math.abs(entry - e.stop);
    if (!(risk > entry * 0.0002) || risk > entry * 0.03) continue;
    const dir = e.side === "long" ? 1 : -1;
    const target = entry + dir * 2 * risk;
    let exit = bars[Math.min(bars.length - 1, e.i + 24)].c;
    let end = Math.min(bars.length - 1, e.i + 24);
    let still = false;
    for (let j = e.i + 1; j < Math.min(bars.length, e.i + 25); j++) {
      const b = bars[j];
      const stopHit = e.side === "long" ? b.l <= e.stop : b.h >= e.stop;
      const tgtHit = e.side === "long" ? b.h >= target : b.l <= target;
      if (stopHit) {
        exit = e.stop;
        end = j;
        still = false;
        break;
      }
      if (tgtHit) {
        exit = target;
        end = j;
        still = false;
        break;
      }
      if (j === bars.length - 1) {
        exit = b.c;
        end = j;
        still = true;
      }
    }
    if (still) {
      open = { side: e.side, entry, stop: e.stop, target };
      break;
    }
    rs.push((dir * (exit - entry)) / risk);
    cursor = end;
  }
  return { rs, open };
}

function fresh(now: boolean, prev: boolean): boolean {
  return now && !prev;
}

function livermore(bars: Bar[]): Entry[] {
  const c = bars.map((b) => b.c);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const ma = sma(c, 20);
  const hh = highest(h, 12);
  const ll = lowest(l, 12);
  const out: Entry[] = [];
  for (let i = 22; i < bars.length; i++) {
    if (!ok(ma[i]) || !ok(hh[i]) || !ok(ll[i]) || !ok(hh[i - 1]) || !ok(ll[i - 1])) continue;
    const up = c[i] > hh[i] && c[i] > ma[i];
    const wasUp = c[i - 1] > hh[i - 1] && c[i - 1] > ma[i - 1];
    const dn = c[i] < ll[i] && c[i] < ma[i];
    const wasDn = c[i - 1] < ll[i - 1] && c[i - 1] < ma[i - 1];
    if (fresh(up, wasUp)) out.push({ i, side: "long", stop: l[i] });
    else if (fresh(dn, wasDn)) out.push({ i, side: "short", stop: h[i] });
  }
  return out;
}

function turtle(bars: Bar[]): Entry[] {
  const c = bars.map((b) => b.c);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const hh = highest(h, 20);
  const ll = lowest(l, 20);
  const a = atr(h, l, c, 20);
  const out: Entry[] = [];
  for (let i = 22; i < bars.length; i++) {
    if (!ok(hh[i]) || !ok(ll[i]) || !ok(a[i]) || !ok(hh[i - 1]) || !ok(ll[i - 1])) continue;
    if (fresh(c[i] > hh[i], c[i - 1] > hh[i - 1])) out.push({ i, side: "long", stop: c[i] - a[i] * 2 });
    else if (fresh(c[i] < ll[i], c[i - 1] < ll[i - 1])) out.push({ i, side: "short", stop: c[i] + a[i] * 2 });
  }
  return out;
}

function tudor(bars: Bar[]): Entry[] {
  const c = bars.map((b) => b.c);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const slow = ema(c, 55);
  const a = atr(h, l, c, 14);
  const out: Entry[] = [];
  for (let i = 60; i < bars.length; i++) {
    if (!ok(slow[i]) || !ok(a[i]) || !ok(slow[i - 1])) continue;
    const near = Math.abs(c[i] - slow[i]) < a[i] * 1.2;
    const touched = l[i] <= slow[i] + a[i] * 0.25;
    const up = c[i] > slow[i] && near && touched && c[i] > bars[i].o;
    const was = c[i - 1] > slow[i - 1] && Math.abs(c[i - 1] - slow[i - 1]) < a[i - 1] * 1.2 && l[i - 1] <= slow[i - 1] + a[i - 1] * 0.25 && c[i - 1] > bars[i - 1].o;
    if (fresh(up, was)) out.push({ i, side: "long", stop: Math.min(l[i], slow[i] - a[i] * 0.4) });
    const touchedS = h[i] >= slow[i] - a[i] * 0.25;
    const dn = c[i] < slow[i] && near && touchedS && c[i] < bars[i].o;
    const wasDn = c[i - 1] < slow[i - 1] && Math.abs(c[i - 1] - slow[i - 1]) < a[i - 1] * 1.2 && h[i - 1] >= slow[i - 1] - a[i - 1] * 0.25 && c[i - 1] < bars[i - 1].o;
    if (fresh(dn, wasDn)) out.push({ i, side: "short", stop: Math.max(h[i], slow[i] + a[i] * 0.4) });
  }
  return out;
}

function elder(bars: Bar[]): Entry[] {
  const c = bars.map((b) => b.c);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const fast = ema(c, 20);
  const slow = ema(c, 55);
  const mood = rsi(c, 14);
  const out: Entry[] = [];
  for (let i = 60; i < bars.length; i++) {
    if (!ok(fast[i]) || !ok(slow[i]) || !ok(mood[i]) || !ok(mood[i - 1])) continue;
    const up = fast[i] > slow[i] && mood[i - 1] < 45 && mood[i] >= 45 && c[i] > fast[i];
    if (up) out.push({ i, side: "long", stop: Math.min(...l.slice(i - 4, i + 1)) });
    const dn = fast[i] < slow[i] && mood[i - 1] > 55 && mood[i] <= 55 && c[i] < fast[i];
    if (dn) out.push({ i, side: "short", stop: Math.max(...h.slice(i - 4, i + 1)) });
  }
  return out;
}

function raschke(bars: Bar[]): Entry[] {
  const c = bars.map((b) => b.c);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const e10 = ema(c, 10);
  const e20 = ema(c, 20);
  const e30 = ema(c, 30);
  const a = atr(h, l, c, 14);
  const out: Entry[] = [];
  for (let i = 40; i < bars.length; i++) {
    if (!ok(e10[i]) || !ok(e20[i]) || !ok(e30[i]) || !ok(a[i])) continue;
    const strong = Math.abs(e10[i] - e30[i]) > a[i] * 0.55;
    if (!strong) continue;
    if (e10[i] > e30[i] && l[i] <= e20[i] && c[i] > e20[i]) out.push({ i, side: "long", stop: l[i] });
    else if (e10[i] < e30[i] && h[i] >= e20[i] && c[i] < e20[i]) out.push({ i, side: "short", stop: h[i] });
  }
  return out;
}

function williams(bars: Bar[]): Entry[] {
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const c = bars.map((b) => b.c);
  const a = atr(h, l, c, 14);
  const out: Entry[] = [];
  for (let i = 16; i < bars.length; i++) {
    const span = h[i - 1] - l[i - 1];
    if (!ok(a[i]) || span < a[i] * 0.4) continue;
    if (h[i] > bars[i].o + span * 0.5) out.push({ i, side: "long", stop: bars[i].o });
    else if (l[i] < bars[i].o - span * 0.5) out.push({ i, side: "short", stop: bars[i].o });
  }
  return out;
}

function kroll(bars: Bar[]): Entry[] {
  const c = bars.map((b) => b.c);
  const fast = ema(c, 20);
  const slow = ema(c, 55);
  const out: Entry[] = [];
  for (let i = 60; i < bars.length; i++) {
    if (!ok(fast[i]) || !ok(slow[i]) || !ok(fast[i - 1])) continue;
    if (fast[i] > slow[i] && c[i - 1] < fast[i - 1] && c[i] > fast[i]) out.push({ i, side: "long", stop: slow[i] });
    else if (fast[i] < slow[i] && c[i - 1] > fast[i - 1] && c[i] < fast[i]) out.push({ i, side: "short", stop: slow[i] });
  }
  return out;
}

const BOOKS: { id: string; trader: string; name: string; habit: string; entries: (bars: Bar[]) => Entry[] }[] = [
  {
    id: "livermore",
    trader: "杰西·利弗莫尔",
    name: "枢轴突破",
    habit: "等价格自己证明方向再进。错了就走，不摊平。",
    entries: livermore,
  },
  {
    id: "turtle",
    trader: "海龟 · 丹尼斯",
    name: "通道突破",
    habit: "突破才上。原版是日线，这里只把这个习惯放到五分钟上。",
    entries: turtle,
  },
  {
    id: "tudor",
    trader: "保罗·都铎·琼斯",
    name: "顺势不追",
    habit: "大方向对了才做，离均线太远的不追。他要的盈亏比比这里的两倍更大。",
    entries: tudor,
  },
  {
    id: "elder",
    trader: "亚历山大·埃尔德",
    name: "三重滤网",
    habit: "慢线定方向，等力度从弱转强再进。仓位他按账户百分之二，这里不算你的仓。",
    entries: elder,
  },
  {
    id: "raschke",
    trader: "琳达·拉施克",
    name: "强趋势回踩",
    habit: "趋势够强才接回踩。她原版看 ADX，这里用快慢均线拉开的距离代替。",
    entries: raschke,
  },
  {
    id: "williams",
    trader: "拉里·威廉姆斯",
    name: "波动率突破",
    habit: "波动自己破开才跟，不预测下一根往哪边。",
    entries: williams,
  },
  {
    id: "kroll",
    trader: "斯坦利·克罗尔",
    name: "拿住趋势",
    habit: "趋势没坏就别因为害怕下车。止损放在慢线，单笔会比较宽。",
    entries: kroll,
  },
];

function lessonFor(trades: number, expectancy: number): string {
  if (trades < 4) return "这段出手太少，数字先不拿来做主。";
  if (expectancy > 0.05) return "按下一根的开盘进、先碰止损算输、目标两倍风险、最多拿二十四根，这段是正的。";
  if (expectancy < -0.05) return "同一套算法下这段是负的。习惯留下，眼前这段黄金不奖赏它。";
  return "这段差不多打平。没有新的证据让它升级，也没有理由扔掉。";
}

function projectFor(sim: Sim): string {
  if (!sim.open) return "现在空仓。下一笔要等它自己的条件出现。";
  const side = sim.open.side === "long" ? "做多" : "做空";
  const mean = sim.rs.length ? `过去这些笔平均 ${avg(sim.rs).toFixed(2)}R，不是承诺。` : "过去样本还少。";
  return `模拟${side}。进 ${px(sim.open.entry)}，止 ${px(sim.open.stop)}，两倍风险 ${px(sim.open.target)}。${mean}`;
}

function scoreBook(book: (typeof BOOKS)[number], bars: Bar[]): StudyScore {
  const sim = simulate(bars, book.entries(bars));
  const expectancy = Math.round(avg(sim.rs) * 100) / 100;
  const wins = sim.rs.filter((r) => r > 0).length;
  return {
    playId: book.id,
    trader: book.trader,
    name: book.name,
    kind: "strategy",
    trades: sim.rs.length,
    wins,
    expectancy,
    habit: book.habit,
    nowSide: sim.open?.side ?? "flat",
    lesson: lessonFor(sim.rs.length, expectancy),
    projection: projectFor(sim),
  };
}

function scoreIndicator(ind: StudyIndicator, bars5: Bar[]): StudyScore | null {
  if (!ind.conditions.length) return null;
  const bars = resample(bars5, TF_MIN[ind.timeframe]);
  if (bars.length < 30) return null;
  const marks = indicatorEntries(ind as Indicator, bars5);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const c = bars.map((b) => b.c);
  const a = atr(h, l, c, 14);
  const entries: Entry[] = [];
  for (const mark of marks) {
    const risk = ok(a[mark.i]) ? a[mark.i] * 1.2 : c[mark.i] * 0.0015;
    entries.push({
      i: mark.i,
      side: mark.side,
      stop: mark.side === "long" ? c[mark.i] - risk : c[mark.i] + risk,
    });
  }
  const sim = simulate(bars, entries);
  const expectancy = Math.round(avg(sim.rs) * 100) / 100;
  return {
    playId: `ind:${ind.id}`,
    trader: "你的指标库",
    name: ind.name,
    kind: "indicator",
    trades: sim.rs.length,
    wins: sim.rs.filter((r) => r > 0).length,
    expectancy,
    habit: "规则来自你武装的这一条，不是书上的原话。",
    nowSide: sim.open?.side ?? "flat",
    lesson: lessonFor(sim.rs.length, expectancy),
    projection: projectFor(sim),
  };
}

function douglas(scores: StudyScore[]): StudyScore {
  const live = scores.filter((s) => s.nowSide !== "flat");
  const longs = live.filter((s) => s.nowSide === "long").length;
  const shorts = live.filter((s) => s.nowSide === "short").length;
  const split = longs > 0 && shorts > 0;
  return {
    playId: "douglas",
    trader: "马克·道格拉斯",
    name: "概率思维",
    kind: "strategy",
    trades: 0,
    wins: 0,
    expectancy: 0,
    habit: "单笔输赢不证明你对错。先有写下来的规则，再谈这一根 K 线。",
    nowSide: "flat",
    lesson: split
      ? "这几套此刻方向不一致。他的习惯是这种时候缩小动作，而不是选一个最顺眼的。"
      : live.length
        ? "此刻还有模拟仓的那几套方向一致。仍然只是概率，不是许可。"
        : "没有模拟仓。空着也是一种执行，不必为了在场而找理由。",
    projection: "不给出入场价。它负责拦住你用一笔输赢否定整套。",
  };
}

export function studyBars(bars: Bar[], indicators: StudyIndicator[], spot: number): StudyScore[] {
  const scores = BOOKS.map((book) => scoreBook(book, bars));
  for (const ind of indicators.slice(0, 8)) {
    const row = scoreIndicator(ind, bars);
    if (row) scores.push(row);
  }
  scores.push(douglas(scores));
  scores.sort((a, b) => {
    const rank = (s: StudyScore) => (s.playId === "douglas" ? -2 : s.trades >= 4 ? s.expectancy : -1);
    return rank(b) - rank(a);
  });
  void spot;
  return scores;
}

function advise(scores: StudyScore[], spot: number): string {
  const ranked = scores.filter((s) => s.playId !== "douglas" && s.trades >= 6);
  const best = ranked[0];
  const open = scores.filter((s) => s.nowSide !== "flat").slice(0, 3);
  const openText = open.length
    ? `此刻模拟里还站着的有 ${open.map((s) => s.name).join("、")}。`
    : "这几套此刻都是空仓。";
  if (!best) return `样本还少，先别下结论。${openText}这不是下单指令。`;
  const win = Math.round((best.wins / best.trades) * 100);
  const lead = `${best.trader}的「${best.name}」`;
  if (best.expectancy > 0.05) {
    return `这段五分钟黄金上，${lead}期望最高，${best.trades} 笔平均 ${best.expectancy.toFixed(2)}R，胜率 ${win}%。范·撒普的习惯是看期望，不看胜率好不好听。系统建议先顺着这一套看，别同时听期望为负的。${openText}现货 ${px(spot)}。这不是下单指令。`;
  }
  return `写进库的这些做法，在眼前这段上期望都不好，最好的${lead}也只有 ${best.expectancy.toFixed(2)}R。系统建议拿来对照，不要拿来进场。${openText}现货 ${px(spot)}。这不是下单指令。`;
}

function learnLine(curr: StudyScore[], prev: StudyScore[] | null, runs: number): string {
  if (!prev) return "第一次写进库。之后每来一根新的五分钟，会再推一遍，用新结果改建议。";
  const bits: string[] = [];
  for (const row of curr) {
    if (row.trades < 6 || row.playId === "douglas") continue;
    const old = prev.find((item) => item.playId === row.playId);
    if (!old || old.trades < 6) continue;
    const delta = row.expectancy - old.expectancy;
    if (delta >= 0.08) bits.push(`${row.name}高了 ${delta.toFixed(2)}R`);
    else if (delta <= -0.08) bits.push(`${row.name}差了 ${Math.abs(delta).toFixed(2)}R`);
  }
  const shift = bits.slice(0, 3).join("，");
  return shift ? `跟上一次落库比，${shift}。库里已经有 ${runs} 次推算。` : `跟上一次比，排序没有明显变化。库里已经有 ${runs} 次推算。`;
}

function asIndicators(raw: unknown): StudyIndicator[] {
  if (!Array.isArray(raw)) return [];
  const out: StudyIndicator[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const row = item as StudyIndicator;
    if (typeof row.id !== "string" || typeof row.name !== "string") continue;
    if (row.side !== "long" && row.side !== "short") continue;
    if (row.timeframe !== "5m" && row.timeframe !== "15m" && row.timeframe !== "1h") continue;
    if (row.logic !== "all" && row.logic !== "any") continue;
    if (!Array.isArray(row.conditions)) continue;
    out.push({
      id: row.id.slice(0, 80),
      name: row.name.slice(0, 40),
      side: row.side,
      timeframe: row.timeframe,
      logic: row.logic,
      conditions: row.conditions.slice(0, 6),
    });
  }
  return out;
}

type RunRow = { id: string; bar_time: number | string; spot: number | string; advice: string; learned: string };
type ScoreRow = {
  play_id: string;
  trader: string;
  name: string;
  kind: string;
  trades: number;
  wins: number;
  expectancy: number | string;
  habit: string;
  now_side: string;
  lesson: string;
  projection: string;
};

function fromRows(run: RunRow, scores: ScoreRow[], runs: number): StudyReport {
  return {
    barTime: Number(run.bar_time),
    spot: Number(run.spot),
    advice: run.advice,
    learned: run.learned,
    runs,
    scores: scores
      .map((row): StudyScore => ({
        playId: row.play_id,
        trader: row.trader,
        name: row.name,
        kind: row.kind === "indicator" ? "indicator" : "strategy",
        trades: Number(row.trades),
        wins: Number(row.wins),
        expectancy: Number(row.expectancy),
        habit: row.habit,
        nowSide: row.now_side === "long" || row.now_side === "short" ? row.now_side : "flat",
        lesson: row.lesson,
        projection: row.projection,
      }))
      .sort((a, b) => {
        const rank = (s: StudyScore) => (s.playId === "douglas" ? -2 : s.trades >= 4 ? s.expectancy : -1);
        return rank(b) - rank(a);
      }),
  };
}

export const learnDesk = createServerFn({ method: "POST" })
  .validator((input: { indicators?: unknown; force?: boolean }) => ({
    indicators: asIndicators(input?.indicators),
    force: input?.force === true,
  }))
  .handler(async ({ data }): Promise<{ ok: true; report: StudyReport } | { ok: false; error: string }> => {
    const market = await loadMarket();
    if (!market.ok) return { ok: false, error: market.error };
    const bars = market.bars;
    const last = bars[bars.length - 1];
    if (!last || bars.length < 80) return { ok: false, error: "K 线还不够推算" };
    const { getSql } = await import("./db");
    const sql = await getSql();
    const id = data.force ? `b${last.t}-${Date.now()}` : `v2:${last.t}:${data.indicators.map((item) => item.id).sort().join(",").slice(0, 140)}`;
    const countRows = await sql.query<{ n: number }>("select count(*)::int as n from study_runs");
    const runs = Number(countRows[0]?.n ?? 0);
    if (!data.force) {
      const cached = await sql.query<RunRow>("select id, bar_time, spot, advice, learned from study_runs where id = $1", [id]);
      if (cached[0]) {
        const scores = await sql.query<ScoreRow>(
          "select play_id, trader, name, kind, trades, wins, expectancy, habit, now_side, lesson, projection from study_scores where run_id = $1",
          [id],
        );
        return { ok: true, report: fromRows(cached[0], scores, runs) };
      }
    }
    const prevRun = await sql.query<RunRow>("select id, bar_time, spot, advice, learned from study_runs order by created_at desc limit 1");
    const prevScores = prevRun[0]
      ? await sql.query<ScoreRow>(
          "select play_id, trader, name, kind, trades, wins, expectancy, habit, now_side, lesson, projection from study_scores where run_id = $1",
          [prevRun[0].id],
        )
      : [];
    const scores = studyBars(bars, data.indicators, market.spot);
    const advice = advise(scores, market.spot);
    const learned = learnLine(scores, prevScores.length ? fromRows(prevRun[0], prevScores, runs).scores : null, runs + 1);
    const inserted = await sql.query<{ id: string }>(
      "insert into study_runs (id, bar_time, spot, advice, learned) values ($1, $2, $3, $4, $5) on conflict (id) do nothing returning id",
      [id, last.t, market.spot, advice, learned],
    );
    if (inserted.length) {
      for (const row of scores) {
        await sql.query(
          "insert into study_scores (run_id, play_id, trader, name, kind, trades, wins, expectancy, habit, now_side, lesson, projection) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [id, row.playId, row.trader, row.name, row.kind, row.trades, row.wins, row.expectancy, row.habit, row.nowSide, row.lesson, row.projection],
        );
      }
    }
    const saved = await sql.query<RunRow>("select id, bar_time, spot, advice, learned from study_runs where id = $1", [id]);
    const savedScores = await sql.query<ScoreRow>(
      "select play_id, trader, name, kind, trades, wins, expectancy, habit, now_side, lesson, projection from study_scores where run_id = $1",
      [id],
    );
    const countAfter = await sql.query<{ n: number }>("select count(*)::int as n from study_runs");
    if (!saved[0]) return { ok: false, error: "这次没有写进库" };
    return { ok: true, report: fromRows(saved[0], savedScores, Number(countAfter[0]?.n ?? runs + 1)) };
  });
