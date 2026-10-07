import type { Side } from "./indicators/types.ts";

export type ScriptRole = "direction" | "trigger" | "confirm" | "filter" | "shelf";

export type CommunityScript = {
  id: string;
  name: string;
  author: string;
  url: string;
  role: ScriptRole;
  note: string;
  first: boolean;
  aliases: string[];
};

/** Public Pine with readable rules. None of these stream prices. */
export const SCRIPTS: CommunityScript[] = [
  {
    id: "supertrend",
    name: "超级趋势",
    author: "KivancOzbilgic",
    url: "https://www.tradingview.com/script/P5Gu6F8k-SuperTrend/",
    role: "direction",
    note: "全品种的方向过滤。只定方向，不单独开仓。",
    first: true,
    aliases: ["supertrend", "超级趋势", "p5gu6f8k"],
  },
  {
    id: "donchian",
    name: "唐奇安突破",
    author: "社区",
    url: "https://www.tradingview.com/script/NeEiwmDq-Donchian-Breakout-with-ATR-Trailing-Stop-Trend-Following/",
    role: "trigger",
    note: "收盘突破近 N 根高点才进，止损跟着 ATR 走。",
    first: true,
    aliases: ["donchian", "唐奇安", "neeiwmdq"],
  },
  {
    id: "opening",
    name: "开盘区间",
    author: "UkutaLabs",
    url: "https://www.tradingview.com/script/k05UpzPU-Opening-Range-Breakout-UkutaLabs/",
    role: "confirm",
    note: "纽约开盘后前 15 或 30 分钟的高低。只在这个时段做确认。",
    first: true,
    aliases: ["opening", "开盘区间", "orb", "ukutalabs"],
  },
  {
    id: "trendline",
    name: "趋势线突破",
    author: "KedArc Quant",
    url: "https://www.tradingview.com/script/grMQIRAr-Trendline-Breakout-Strategy-KedArc-Quant/",
    role: "trigger",
    note: "和唐奇安二选一做触发。两个触发方向相反，就降级。",
    first: false,
    aliases: ["trendline", "趋势线", "kedarc"],
  },
  {
    id: "trendlock",
    name: "多周期超级趋势",
    author: "社区",
    url: "https://www.tradingview.com/script/FDeprmix-TrendLock-Multi-Timeframe-Supertrend-Donchian-Breakout/",
    role: "shelf",
    note: "多周期同向后再等唐奇安。先不接进三条告警。",
    first: false,
    aliases: ["trendlock", "fdeprmix"],
  },
  {
    id: "fvg",
    name: "超级趋势回踩缺口",
    author: "社区",
    url: "https://www.tradingview.com/script/3BvQfSRg-Supertrend-FVG-Strategy/",
    role: "shelf",
    note: "方向用超级趋势，等回到缺口再收盘确认。先不接。",
    first: false,
    aliases: ["fvg", "缺口"],
  },
  {
    id: "pullback",
    name: "突破回踩",
    author: "社区",
    url: "https://www.tradingview.com/script/CmBKerHN-Breakout-Pullback-Strategy-v2/",
    role: "shelf",
    note: "收盘收复后再回踩才进。先不接。",
    first: false,
    aliases: ["pullback", "回踩"],
  },
  {
    id: "atr-ma",
    name: "均线与 ATR 通道",
    author: "社区",
    url: "https://www.tradingview.com/script/fM3YQz8i-ATR-Trend-Strategy-with-Moving-Average-Fixed-TP-SL-version/",
    role: "shelf",
    note: "突破通道和回踩均线两种模式，不要同时当正式信号。先不接。",
    first: false,
    aliases: ["atr-ma", "atr trend"],
  },
  {
    id: "atr-day",
    name: "日内 ATR 轨道",
    author: "社区",
    url: "https://www.tradingview.com/script/LAm9Baup-ATR-Volatility-Breakout/",
    role: "shelf",
    note: "用昨日 ATR 量今日开盘上下轨。先不接。",
    first: false,
    aliases: ["volatility", "日内轨道"],
  },
  {
    id: "wavetrend",
    name: "WaveTrend",
    author: "LazyBear",
    url: "https://www.tradingview.com/script/2KE8wTuF-WaveTrend-with-Crosses-LazyBear/",
    role: "filter",
    note: "只否决无力破位，不单独开仓。",
    first: false,
    aliases: ["wavetrend", "lazybear", "波浪"],
  },
];

export const ROLE_LABEL: Record<ScriptRole, string> = {
  direction: "方向",
  trigger: "触发",
  confirm: "确认",
  filter: "过滤",
  shelf: "先不接",
};

export type ScriptAlert = { scriptId: string; side: Side; at: number; price: number };

const FRESH = 15 * 60_000;

export function matchScript(name: string): CommunityScript | null {
  const text = name.toLowerCase();
  return SCRIPTS.find((script) => script.aliases.some((alias) => text.includes(alias))) ?? null;
}

function latest(alerts: ScriptAlert[], id: string, now: number): ScriptAlert | null {
  return alerts.find((item) => item.scriptId === id && item.at <= now && now - item.at <= FRESH) ?? null;
}

function nySession(now: number): boolean {
  const hour = new Date(now).getUTCHours();
  return hour >= 13 && hour < 20;
}

export type CommunityRead = { role: "confirm" | "conflict" | "abstain"; note: string };

/** Direction, one trigger, and the opening range. Disagreement downgrades. Nothing here opens a trade. */
export function communityLane(alerts: ScriptAlert[], now: number): CommunityRead {
  const ordered = [...alerts].sort((a, b) => b.at - a.at);
  const direction = latest(ordered, "supertrend", now);
  const donchian = latest(ordered, "donchian", now);
  const trendline = latest(ordered, "trendline", now);
  const opening = latest(ordered, "opening", now);
  const wave = latest(ordered, "wavetrend", now);

  let trigger = donchian ?? trendline;
  if (donchian && trendline && donchian.side !== trendline.side) {
    return { role: "conflict", note: "唐奇安和趋势线方向相反，降级。" };
  }

  if (!direction && !trigger) return { role: "abstain", note: "社区脚本还没有收盘告警。它们不推价格。" };
  if (!direction || !trigger) return { role: "abstain", note: direction ? "超级趋势只定方向，还没有触发。" : "有触发，超级趋势还没给方向。" };
  if (direction.side !== trigger.side) return { role: "conflict", note: "同一根上超级趋势和突破不一致，降级。" };

  const side = direction.side;
  if (wave && wave.side !== side) return { role: "conflict", note: "WaveTrend 否决这次破位，不单独开仓。" };
  if (opening && nySession(now) && opening.side !== side) return { role: "conflict", note: "开盘区间和方向不一致，降级。" };

  const extra = opening && nySession(now) ? "，开盘区间同向。" : nySession(now) ? "。开盘区间这根还没到。" : "。还没到纽约时段，开盘区间不参与。";
  return { role: "confirm", note: `超级趋势和突破同向${extra}` };
}
