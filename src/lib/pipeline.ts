import { footprint } from "./flow.ts";
import { readCat } from "./indicators/laomao.ts";
import { loopEmit, loopLine } from "./loops.ts";
import type { Bar, EvalHit, Side } from "./indicators/types.ts";

export type Verdict = "deliver" | "hold" | "escalate";
export type LoopName = "brief" | "micro" | "core" | "macro" | "hyper";

export type Seat = {
  id: string;
  name: string;
  role: string;
  score: number;
  note: string;
  live: boolean;
};

export type Pipeline = {
  phase: string;
  loop: LoopName;
  verdict: Verdict;
  side: Side | "flat";
  entry: number | null;
  stop: number | null;
  targets: number[];
  why: string[];
  seats: Seat[];
  work: number;
};

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function loopName(loop: LoopName): string {
  return loopLine(loop);
}

export function runPipeline(input: { bars: Bar[]; evals: EvalHit[]; price: number; now: number; divergence?: number | null; eventRisk?: number; eventNote?: string | null }): Pipeline {
  const { bars, evals, price, now } = input;
  const atr = bars.length >= 14 ? mean(bars.slice(-14).map((bar) => bar.h - bar.l)) : 0;

  let dataScore = 1;
  let dataNote = "报价和 K 线对得上";
  if (bars.length < 30 || !Number.isFinite(price) || atr <= 0) {
    dataScore = 0;
    dataNote = "K 线不够，数据闸拦截";
  } else {
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    if (Math.abs(last.c - prev.c) > atr * 3.2) {
      dataScore = 0.15;
      dataNote = "相邻两根跳空过大，先拦截";
    } else if (Math.abs(price - last.c) > atr * 2.5) {
      dataScore = 0.25;
      dataNote = "现价偏离 K 线，先拦截";
    } else if (now - last.t > 20 * 60_000) {
      dataScore = 0.45;
      dataNote = "K 线偏旧，降权";
    }
  }
  if (input.divergence != null && input.divergence > 8) {
    dataScore = 0.2;
    dataNote = `两个报价源差了 ${input.divergence.toFixed(2)}，先拦截`;
  } else if (input.divergence != null && input.divergence >= 0.4 && dataScore >= 0.5) {
    dataNote = `两源差 ${input.divergence.toFixed(2)} 美元，以瑞士买卖价为准`;
  }

  const hour = new Date(now).getUTCHours();
  const day = new Date(now).getUTCDay();
  let session = "亚盘";
  let factScore = 0.72;
  let factNote = "亚盘，波动通常更窄";
  if (hour >= 7 && hour < 12) {
    session = "伦敦";
    factScore = 0.86;
    factNote = "伦敦盘，趋势更干净";
  } else if (hour >= 12 && hour < 15) {
    session = "数据窗";
    factScore = 0.4;
    factNote = "欧美数据窗口，消息容易把价格打飞";
  } else if (hour >= 15 && hour < 21) {
    session = "纽约";
    factScore = 0.82;
    factNote = "纽约盘，成交更完整";
  }
  if (day === 0 && hour < 22) {
    factScore = 0.28;
    factNote = "周日开盘附近，跳空多";
  } else if (day === 5 && hour >= 20) {
    factScore = 0.34;
    factNote = "周五尾盘，流动性变薄";
  }
  if ((input.eventRisk ?? 0) >= 4 && input.eventNote) {
    factScore = Math.min(factScore, 0.3);
    factNote = input.eventNote;
  }

  let geoScore = 0.84;
  let geoNote = "没有异常冲量，地缘闸放行";
  if (atr > 0 && bars.length >= 8) {
    const move = Math.abs(bars[bars.length - 1].c - bars[bars.length - 6].c);
    if (move > atr * 2.4) {
      geoScore = 0.18;
      geoNote = "短时间冲太远，按突发消息拦截，不追";
    } else if (factScore < 0.45 && move > atr * 1.3) {
      geoScore = 0.36;
      geoNote = `${session}里波动被放大，按事件处理`;
    }
  }

  let tapeSide: Side | "flat" = "flat";
  let tapeScore = 0.4;
  let tapeNote = "结构还没选边";
  if (bars.length >= 55) {
    const closes = bars.map((bar) => bar.c);
    const sma = (n: number) => mean(closes.slice(-n));
    const fast = sma(9);
    const mid = sma(21);
    const slow = sma(55);
    if (price > fast && fast > mid && mid >= slow) {
      tapeSide = "long";
      tapeScore = 0.88;
      tapeNote = "价在均线之上，结构偏多";
    } else if (price < fast && fast < mid && mid <= slow) {
      tapeSide = "short";
      tapeScore = 0.88;
      tapeNote = "价在均线之下，结构偏空";
    } else if (price >= mid) {
      tapeSide = "long";
      tapeScore = 0.58;
      tapeNote = "还在中线之上，快慢线没排齐";
    } else {
      tapeSide = "short";
      tapeScore = 0.58;
      tapeNote = "还在中线之下，快慢线没排齐";
    }
  }

  const longs = evals.filter((item) => item.hit && item.side === "long");
  const shorts = evals.filter((item) => item.hit && item.side === "short");
  let indSide: Side | "flat" = "flat";
  let indScore = 0.34;
  let indNote = "武装的指标这根都没亮";
  if (longs.length && !shorts.length) {
    indSide = "long";
    indScore = Math.min(0.95, 0.55 + longs.length * 0.12);
    indNote = `${longs.map((item) => item.name).join("、")} 亮了`;
  } else if (shorts.length && !longs.length) {
    indSide = "short";
    indScore = Math.min(0.95, 0.55 + shorts.length * 0.12);
    indNote = `${shorts.map((item) => item.name).join("、")} 亮了`;
  } else if (longs.length && shorts.length) {
    indScore = 0.22;
    indNote = "多空指标同时亮，不能直接交";
  }

  let flowSide: Side | "flat" = "flat";
  let flowScore = 0.5;
  let flowNote = "买卖差不多，订单流不投票";
  if (bars.length >= 8) {
    const feet = footprint(bars, 8);
    const delta = feet.reduce((sum, row) => sum + row.delta, 0);
    const volume = feet.reduce((sum, row) => sum + row.volume, 0) || 1;
    const ratio = delta / volume;
    if (ratio > 0.08) {
      flowSide = "long";
      flowScore = Math.min(0.9, 0.55 + ratio);
      flowNote = "近几根主动买盘更重";
    } else if (ratio < -0.08) {
      flowSide = "short";
      flowScore = Math.min(0.9, 0.55 - ratio);
      flowNote = "近几根主动卖盘更重";
    }
  }

  const votes = [tapeSide, indSide, flowSide].filter((item) => item !== "flat");
  const longVotes = votes.filter((item) => item === "long").length;
  const shortVotes = votes.filter((item) => item === "short").length;
  let side: Side | "flat" = "flat";
  if (longVotes > shortVotes) side = "long";
  else if (shortVotes > longVotes) side = "short";

  const cat = readCat(bars);
  let entry: number | null = null;
  let stop: number | null = null;
  let targets: number[] = [];
  if (side !== "flat" && atr > 0) {
    const useCat = cat && cat.side === side && cat.entry != null && cat.stop != null && cat.targets.length === 3;
    const risk = useCat ? Math.abs(price - (cat.stop as number)) : Math.max(atr * 1.15, 0.4);
    entry = price;
    stop = side === "long" ? price - risk : price + risk;
    targets = useCat
      ? (cat.targets as number[])
      : [1, 2, 3].map((step) => (side === "long" ? price + risk * step : price - risk * step));
  }

  let faceScore = 0.25;
  let faceNote = "价位还画不出来";
  if (entry != null && stop != null && targets.length === 3) {
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(targets[0] - entry);
    const ratio = reward / Math.max(risk, 1e-6);
    const distinct = new Set([entry, stop, ...targets].map((n) => n.toFixed(2))).size >= 4;
    if (!distinct) faceNote = "价位叠在一起，图上画不清";
    else if (atr > 0 && risk < atr * 0.25) faceNote = "止损太贴，容易被扫";
    else if (atr > 0 && risk > atr * 3.2) faceNote = "止损太远，一笔亏太大";
    else if (ratio < 1) faceNote = "第一档赚的没有亏的多";
    else {
      faceScore = 0.9;
      faceNote = `三档止盈分开，第一档盈亏比 ${ratio.toFixed(1)}`;
    }
    if (faceScore < 0.9 && distinct) faceScore = 0.34;
  }

  const dataBad = dataScore < 0.5;
  const geoBad = geoScore < 0.4;
  const conflict = longs.length > 0 && shorts.length > 0;
  const sidedConflict = side !== "flat" && tapeSide !== "flat" && tapeSide !== side;
  const conflicted = conflict || sidedConflict;
  const aligned = side !== "flat" && indSide === side && (tapeSide === side || flowSide === side);
  let loop: LoopName = "micro";
  let verdict: Verdict = "hold";
  let phase = "分拣";
  if (dataBad || geoBad) {
    loop = "micro";
    phase = "分拣";
  } else if (conflicted) {
    loop = "macro";
    verdict = "escalate";
    phase = "裁决";
  } else if (aligned && faceScore >= 0.7 && factScore >= 0.4) {
    loop = "core";
    verdict = "deliver";
    phase = "草稿";
  } else if (side !== "flat" && indSide === side) {
    loop = "core";
    phase = "核对";
  }

  const approval =
    (dataScore + geoScore + (aligned ? 0.9 : 0.35) + faceScore + factScore + Math.max(tapeScore, flowScore)) / 6;
  if (verdict === "deliver" && approval < 0.62) {
    verdict = "hold";
    phase = "核对";
    loop = "core";
  }
  if (verdict === "deliver" && loopEmit(loop) !== "draft") {
    verdict = "hold";
    phase = "分拣";
  }

  const gateNote =
    verdict === "deliver"
      ? `规则过了 ${approval.toFixed(2)}，只出草稿`
      : verdict === "escalate"
        ? `冲突留在宏循环 ${approval.toFixed(2)}，不发单`
        : `扣住 ${approval.toFixed(2)}`;

  const why = dataBad
    ? [dataNote]
    : geoBad
      ? [geoNote]
      : conflict
        ? [indNote]
        : verdict === "deliver"
          ? [tapeNote, indNote, flowNote, faceNote]
          : [phase === "分拣" ? "这根不值得往上送" : "核对没过，只退一档，不回到顶"];

  const seats: Seat[] = [
    { id: "router", name: "路由", role: "最硬的后台", score: verdict === "deliver" ? 0.84 : 0.56, note: loopName(loop), live: true },
    { id: "tape", name: "行情", role: "结构", score: tapeScore, note: tapeNote, live: tapeSide !== "flat" },
    { id: "indicator", name: "指标", role: "库内判断", score: indScore, note: indNote, live: indSide !== "flat" },
    { id: "flow", name: "订单流", role: "主动买卖", score: flowScore, note: flowNote, live: flowSide !== "flat" },
    { id: "geo", name: "地缘", role: "突发拦截", score: geoScore, note: geoNote, live: geoScore < 0.5 },
    { id: "facts", name: "实事", role: session, score: factScore, note: factNote, live: true },
    { id: "data", name: "数据", role: "坏点拦截", score: dataScore, note: dataNote, live: dataScore < 0.7 },
    { id: "face", name: "呈现", role: "价位与盈亏比", score: faceScore, note: faceNote, live: faceScore >= 0.7 },
    { id: "gate", name: "闸门", role: "只出分数", score: approval, note: gateNote, live: verdict !== "hold" },
  ];

  return {
    phase,
    loop,
    verdict,
    side: verdict === "deliver" ? side : side,
    entry: verdict === "deliver" ? entry : null,
    stop: verdict === "deliver" ? stop : null,
    targets: verdict === "deliver" ? targets : [],
    why,
    seats,
    work: bars.length,
  };
}
