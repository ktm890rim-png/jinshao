import { createServerFn } from "@tanstack/react-start";

export type HedgeRead = {
  ok: boolean;
  oil: number | null;
  gold: number | null;
  oilPct: number | null;
  goldPct: number | null;
  kind: "hedge" | "together" | "quiet" | "off";
  title: string;
  note: string;
};

export function judgeHedge(goldPct: number, oilPct: number): Pick<HedgeRead, "kind" | "title" | "note"> {
  if (Math.abs(goldPct) < 0.2 && Math.abs(oilPct) < 0.3) {
    return { kind: "quiet", title: "油和金都没怎么动", note: "对冲还没出来。等一边明显走了，再看另一边跟不跟。" };
  }
  if (goldPct * oilPct < 0 && Math.abs(goldPct) >= 0.15 && Math.abs(oilPct) >= 0.3) {
    const oilUp = oilPct > 0;
    return {
      kind: "hedge",
      title: oilUp ? "油涨，金在跌" : "油跌，金在涨",
      note: oilUp ? "这是对冲。原油往上，黄金被压着。做多黄金先看油还会不会涨。" : "这是对冲。原油往下，黄金在抬。做空黄金先看油还会不会跌。",
    };
  }
  if (goldPct * oilPct > 0 && Math.abs(goldPct) >= 0.15 && Math.abs(oilPct) >= 0.3) {
    return {
      kind: "together",
      title: goldPct > 0 ? "油和金一起涨" : "油和金一起跌",
      note: "这不是对冲，是同向。多半是通胀或者美元把两个一起带着走。",
    };
  }
  return {
    kind: "quiet",
    title: Math.abs(oilPct) > Math.abs(goldPct) ? "油在动，金还没跟上" : "金在动，油还没跟上",
    note: "一边先走。另一边如果反向跟上，才算对冲。现在还不算。",
  };
}

const UA = "Mozilla/5.0";

async function lastMoves(symbol: string): Promise<{ now: number; pct: number } | null> {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=60m&range=5d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=60m&range=5d`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const body = (await res.json()) as { chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] } };
      const closes = (body.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((item): item is number => typeof item === "number" && item > 0);
      if (closes.length < 8) continue;
      const now = closes[closes.length - 1];
      const then = closes[closes.length - 7];
      return { now, pct: ((now - then) / then) * 100 };
    } catch {
      continue;
    }
  }
  return null;
}

let cache: { at: number; read: HedgeRead } | null = null;

export const fetchHedge = createServerFn({ method: "GET" }).handler(async (): Promise<HedgeRead> => {
  if (cache && Date.now() - cache.at < 60_000) return cache.read;
  const [gold, oil] = await Promise.all([lastMoves("GC=F"), lastMoves("CL=F")]);
  const read: HedgeRead = !gold || !oil
    ? { ok: false, oil: oil?.now ?? null, gold: gold?.now ?? null, oilPct: oil?.pct ?? null, goldPct: gold?.pct ?? null, kind: "off", title: "原油这拍没接上", note: "对冲先不判断。下一分钟再看。" }
    : { ok: true, oil: oil.now, gold: gold.now, oilPct: oil.pct, goldPct: gold.pct, ...judgeHedge(gold.pct, oil.pct) };
  cache = { at: Date.now(), read };
  return read;
});
