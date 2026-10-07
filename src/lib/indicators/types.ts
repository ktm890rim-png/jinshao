export type Bar = { t: number; o: number; h: number; l: number; c: number; v?: number };

export type Side = "long" | "short";
export type Timeframe = "5m" | "15m" | "1h";
export type Logic = "all" | "any";
export type Source = "seed" | "github" | "tradingview" | "note";
export type Op = "gt" | "lt" | "gte" | "lte" | "cross_up" | "cross_down";

export const TF_MS: Record<Timeframe, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
};

export const TF_MIN: Record<Timeframe, number> = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
};

export const TF_LABEL: Record<Timeframe, string> = {
  "5m": "5分",
  "15m": "15分",
  "1h": "1小时",
};

type Bare = "close" | "open" | "high" | "low" | "macd_hist" | "macd_line" | "macd_signal" | "hour_utc";
type Lengthed =
  | "ema"
  | "sma"
  | "rsi"
  | "atr"
  | "bb_pct"
  | "bb_upper"
  | "bb_lower"
  | "bb_basis"
  | "highest"
  | "lowest"
  | "roc";

export type Operand =
  | { type: Bare }
  | { type: Lengthed; length: number }
  | { type: "const"; value: number };

export type Condition = {
  id: string;
  label: string;
  left: Operand;
  op: Op;
  right: Operand;
};

export type ExitSpec = {
  stopAtrMult: number;
  atrLength: number;
  targetR: number;
};

export type Indicator = {
  id: string;
  name: string;
  thesis: string;
  sourceNote: string;
  source: Source;
  sourceUrl?: string;
  side: Side;
  timeframe: Timeframe;
  armed: boolean;
  logic: Logic;
  conditions: Condition[];
  exit: ExitSpec;
  updatedAt: number;
};

export type EvalHit = {
  id: string;
  name: string;
  side: Side;
  timeframe: Timeframe;
  hit: boolean;
  score: number;
  met: { label: string; ok: boolean }[];
  barTime: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
};

export type SignalStatus = "live" | "stopped" | "target";

export type Signal = {
  id: string;
  at: number;
  barTime: number;
  side: Side;
  names: string[];
  indicatorIds: string[];
  entry: number;
  stop: number;
  target: number;
  rr: number;
  why: string[];
  status: SignalStatus;
  ai?: string;
};

export type Lead = {
  id: string;
  origin: "github" | "tradingview";
  title: string;
  url: string;
  blurb: string;
  score: number;
  snippet: string;
  file?: string;
};

export type ChatMsg = {
  id: string;
  role: "user" | "sentinel";
  text: string;
  at: number;
};

export type MarketOk = {
  ok: true;
  spot: number;
  changePct: number | null;
  anchor: "spot" | "futures";
  basisNote: string;
  bars: Bar[];
  asOf: number;
};

export type MarketPayload = MarketOk | { ok: false; error: string };
