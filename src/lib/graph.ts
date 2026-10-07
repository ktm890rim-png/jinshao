import type { Bar, Side } from "./indicators/types.ts";

export type BlockKind = "kline" | "ma" | "macd" | "rsi" | "bb" | "gate" | "buy" | "sell" | "stop";

export type Block = {
  id: string;
  kind: BlockKind;
  x: number;
  y: number;
  len: number;
};

export type Wire = { id: string; from: string; to: string };

export const BLOCK_LABEL: Record<BlockKind, string> = {
  kline: "K线",
  ma: "均线",
  macd: "MACD",
  rsi: "RSI",
  bb: "布林",
  gate: "IF",
  buy: "买入",
  sell: "卖出",
  stop: "止损",
};

export function goldenCross(): { blocks: Block[]; wires: Wire[] } {
  const blocks: Block[] = [
    { id: "k", kind: "kline", x: 12, y: 16, len: 0 },
    { id: "ma", kind: "ma", x: 12, y: 108, len: 21 },
    { id: "macd", kind: "macd", x: 12, y: 200, len: 12 },
    { id: "if", kind: "gate", x: 124, y: 108, len: 0 },
    { id: "buy", kind: "buy", x: 196, y: 56, len: 0 },
    { id: "stop", kind: "stop", x: 196, y: 168, len: 14 },
  ];
  const wires: Wire[] = [
    { id: "w1", from: "k", to: "ma" },
    { id: "w2", from: "k", to: "macd" },
    { id: "w3", from: "ma", to: "if" },
    { id: "w4", from: "macd", to: "if" },
    { id: "w5", from: "if", to: "buy" },
    { id: "w6", from: "k", to: "stop" },
  ];
  return { blocks, wires };
}

function ema(values: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (const v of values) {
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function cross(a: number[], b: number[]): "up" | "down" | "none" {
  const n = Math.min(a.length, b.length);
  if (n < 3) return "none";
  const prev = a[n - 2] - b[n - 2];
  const now = a[n - 1] - b[n - 1];
  if (prev <= 0 && now > 0) return "up";
  if (prev >= 0 && now < 0) return "down";
  return "none";
}

function rsi(closes: number[], len: number): number {
  if (closes.length < len + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - len; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

type Heat = { long: boolean; short: boolean; detail: string };

function heatOf(block: Block, closes: number[], bars: Bar[]): Heat {
  const last = closes[closes.length - 1] ?? 0;
  if (block.kind === "kline") return { long: false, short: false, detail: last.toFixed(2) };
  if (block.kind === "ma") {
    const len = Math.max(2, block.len || 21);
    const line = ema(closes, len);
    const hit = cross(closes, line);
    return { long: hit === "up", short: hit === "down", detail: hit === "none" ? `均线${len} 未交叉` : hit === "up" ? `均线${len} 上穿` : `均线${len} 下穿` };
  }
  if (block.kind === "macd") {
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    const macd = fast.map((v, i) => v - slow[i]);
    const signal = ema(macd, 9);
    const hit = cross(macd, signal);
    return { long: hit === "up", short: hit === "down", detail: hit === "none" ? "MACD 未金叉死叉" : hit === "up" ? "MACD 金叉" : "MACD 死叉" };
  }
  if (block.kind === "rsi") {
    const len = Math.max(2, block.len || 14);
    const value = rsi(closes, len);
    return { long: value <= 35, short: value >= 65, detail: `RSI ${value.toFixed(0)}` };
  }
  if (block.kind === "bb") {
    const len = Math.max(5, block.len || 20);
    const slice = closes.slice(-len);
    const mid = slice.reduce((s, n) => s + n, 0) / slice.length;
    const variance = slice.reduce((s, n) => s + (n - mid) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);
    return {
      long: last <= mid - sd * 2,
      short: last >= mid + sd * 2,
      detail: last <= mid - sd * 2 ? "碰到下轨" : last >= mid + sd * 2 ? "碰到上轨" : "在布林中部",
    };
  }
  if (block.kind === "stop") {
    const slice = bars.slice(-Math.max(5, block.len || 14));
    const width = slice.reduce((s, b) => s + (b.h - b.l), 0) / slice.length;
    return { long: false, short: false, detail: `距入场 ${width.toFixed(2)}` };
  }
  return { long: false, short: false, detail: "" };
}

export type GraphRun = {
  side: Side | "flat";
  text: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  heats: Record<string, string>;
};

export function runGraph(blocks: Block[], wires: Wire[], bars: Bar[]): GraphRun {
  const empty: GraphRun = { side: "flat", text: "K 线不够，架构还跑不起来。", entry: null, stop: null, target: null, heats: {} };
  if (bars.length < 30) return empty;
  const closes = bars.map((b) => b.c);
  const heats: Record<string, Heat> = {};
  for (const block of blocks) {
    if (block.kind !== "gate" && block.kind !== "buy" && block.kind !== "sell") heats[block.id] = heatOf(block, closes, bars);
  }
  const incoming = (id: string) => wires.filter((w) => w.to === id).map((w) => w.from);
  for (const block of blocks.filter((b) => b.kind === "gate")) {
    const src = incoming(block.id)
      .map((id) => heats[id])
      .filter((h): h is Heat => !!h && h.detail !== "");
    const long = src.length > 0 && src.every((h) => h.long);
    const short = src.length > 0 && src.every((h) => h.short);
    heats[block.id] = { long, short, detail: long ? "条件齐了，偏多" : short ? "条件齐了，偏空" : "条件还没齐" };
  }
  const last = closes[closes.length - 1];
  const stopBlock = blocks.find((b) => b.kind === "stop");
  const width = stopBlock ? Number(heats[stopBlock.id]?.detail.replace(/[^\d.]/g, "")) || last * 0.001 : last * 0.001;

  function fire(kind: "buy" | "sell"): boolean {
    const nodes = blocks.filter((b) => b.kind === kind);
    if (!nodes.length) return false;
    return nodes.some((node) => {
      const src = incoming(node.id)
        .map((id) => blocks.find((b) => b.id === id))
        .filter((b): b is Block => !!b && b.kind !== "kline" && b.kind !== "stop");
      if (!src.length) return false;
      return src.every((b) => (kind === "buy" ? heats[b.id]?.long : heats[b.id]?.short));
    });
  }

  const long = fire("buy");
  const short = fire("sell");
  const labeled: Record<string, string> = {};
  for (const [id, heat] of Object.entries(heats)) labeled[id] = heat.detail;
  if (long && short) {
    return { side: "flat", text: "买入和卖出同时成立，这张图先别下单。", entry: last, stop: null, target: null, heats: labeled };
  }
  if (!long && !short) {
    return { side: "flat", text: "这张架构这根 K 线没有走完。", entry: last, stop: null, target: null, heats: labeled };
  }
  const side: Side = long ? "long" : "short";
  const stop = side === "long" ? last - width : last + width;
  const target = side === "long" ? last + width * 2 : last - width * 2;
  const why = blocks
    .filter((b) => b.kind !== "kline" && b.kind !== "stop")
    .map((b) => heats[b.id]?.detail)
    .filter(Boolean)
    .join("，");
  return {
    side,
    text: `${side === "long" ? "买入" : "卖出"}成立。${why}`,
    entry: last,
    stop,
    target,
    heats: labeled,
  };
}
