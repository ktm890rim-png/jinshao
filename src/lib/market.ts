import { createServerFn } from "@tanstack/react-start";
import type { Bar, MarketPayload } from "./indicators/types.ts";

let cache: { at: number; data: MarketPayload } | null = null;

const UA = "Mozilla/5.0 (compatible; JinsaoDesk/1.0)";

async function yahooBars(): Promise<{ bars: Bar[]; change: number | null } | null> {
  const urls = [
    "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=5m&range=5d",
    "https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=5m&range=5d",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const yahoo = (await res.json()) as {
        chart?: {
          result?: {
            timestamp?: number[];
            indicators?: {
              quote?: {
                open?: (number | null)[];
                high?: (number | null)[];
                low?: (number | null)[];
                close?: (number | null)[];
                volume?: (number | null)[];
              }[];
            };
            meta?: { regularMarketChangePercent?: number };
          }[];
        };
      };
      const result = yahoo.chart?.result?.[0];
      const ts = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0];
      const bars: Bar[] = [];
      if (q?.open && q.high && q.low && q.close) {
        for (let i = 0; i < ts.length; i++) {
          const o = q.open[i];
          const h = q.high[i];
          const l = q.low[i];
          const c = q.close[i];
          if (typeof o !== "number" || typeof h !== "number" || typeof l !== "number" || typeof c !== "number") continue;
          const vol = q.volume?.[i];
          bars.push({ t: ts[i] * 1000, o, h, l, c, v: typeof vol === "number" && vol > 0 ? vol : undefined });
        }
      }
      if (bars.length < 40) continue;
      const change = result?.meta?.regularMarketChangePercent;
      return { bars, change: typeof change === "number" && Number.isFinite(change) ? change : null };
    } catch {
      continue;
    }
  }
  return null;
}

let m1Cache: { at: number; bars: Bar[] } | null = null;

export async function loadM1(): Promise<Bar[] | null> {
  if (m1Cache && Date.now() - m1Cache.at < 15_000) return m1Cache.bars;
  const urls = [
    "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d",
    "https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const yahoo = (await res.json()) as {
        chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] } }[] };
      };
      const result = yahoo.chart?.result?.[0];
      const ts = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0];
      const bars: Bar[] = [];
      if (q?.open && q.high && q.low && q.close) {
        for (let i = 0; i < ts.length; i++) {
          const o = q.open[i];
          const h = q.high[i];
          const l = q.low[i];
          const c = q.close[i];
          if (typeof o !== "number" || typeof h !== "number" || typeof l !== "number" || typeof c !== "number") continue;
          const vol = q.volume?.[i];
          bars.push({ t: ts[i] * 1000, o, h, l, c, v: typeof vol === "number" && vol > 0 ? vol : undefined });
        }
      }
      if (bars.length >= 60) {
        m1Cache = { at: Date.now(), bars };
        return bars;
      }
    } catch {
      continue;
    }
  }
  return m1Cache?.bars ?? null;
}

export async function loadMarket(): Promise<MarketPayload> {
  if (cache && Date.now() - cache.at < 15_000 && cache.data.ok) return cache.data;
  try {
    const [yahoo, spotRes] = await Promise.all([
      yahooBars(),
      fetch("https://api.gold-api.com/price/XAU", {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      }),
    ]);
    if (!yahoo) {
      if (cache?.data.ok && Date.now() - cache.at < 10 * 60_000) return cache.data;
      return { ok: false, error: "K 线这一会儿没接上" };
    }
    const bars = yahoo.bars;
    let spot = bars[bars.length - 1].c;
    let anchor: "spot" | "futures" = "futures";
    let basisNote = "COMEX 黄金期货";
    if (spotRes.ok) {
      const body = (await spotRes.json()) as { price?: number };
      const price = Number(body.price);
      const last = bars[bars.length - 1].c;
      if (Number.isFinite(price) && Math.abs(price - last) < last * 0.05) {
        const shift = price - last;
        for (const b of bars) {
          b.o += shift;
          b.h += shift;
          b.l += shift;
          b.c += shift;
        }
        spot = price;
        anchor = "spot";
        basisNote = "现货锚定 · 形态取 COMEX 五分钟";
      }
    }
    const data: MarketPayload = {
      ok: true,
      spot,
      changePct: yahoo.change,
      anchor,
      basisNote,
      bars,
      asOf: Date.now(),
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    if (cache?.data.ok) return cache.data;
    return { ok: false, error: "行情这一会儿没接上" };
  }
}

export const fetchMarket = createServerFn({ method: "GET" }).handler(async () => loadMarket());

export type QuoteSource = {
  id: string;
  name: string;
  ok: boolean;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  latencyMs: number;
  at: number | null;
  note: string;
};

export type QuoteBook = {
  ok: boolean;
  mid: number | null;
  bid: number | null;
  ask: number | null;
  source: string;
  latencyMs: number;
  at: number;
  sources: QuoteSource[];
  error?: string;
};

async function readSwiss(): Promise<{ bid: number; ask: number; mid: number }> {
  const res = await fetch("https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/XAU/USD", {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error("swiss");
  const body = (await res.json()) as { spreadProfilePrices?: { bid?: number; ask?: number }[] }[];
  let best: { bid: number; ask: number; spread: number } | null = null;
  for (const venue of body) {
    for (const row of venue.spreadProfilePrices ?? []) {
      const bid = Number(row.bid);
      const ask = Number(row.ask);
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= bid || bid < 500) continue;
      const spread = ask - bid;
      if (!best || spread < best.spread) best = { bid, ask, spread };
    }
  }
  if (!best) throw new Error("swiss");
  return { bid: best.bid, ask: best.ask, mid: (best.bid + best.ask) / 2 };
}

async function readGoldApi(): Promise<{ mid: number; updatedAt: number | null }> {
  const res = await fetch("https://api.gold-api.com/price/XAU", {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error("gold");
  const body = (await res.json()) as { price?: number; updatedAt?: string };
  const mid = Number(body.price);
  if (!Number.isFinite(mid) || mid < 500) throw new Error("gold");
  const updatedAt = body.updatedAt ? Date.parse(body.updatedAt) : null;
  return { mid, updatedAt: updatedAt != null && Number.isFinite(updatedAt) ? updatedAt : null };
}

let bookCache: { at: number; book: QuoteBook } | null = null;

export const fetchSpot = createServerFn({ method: "POST" }).handler(async (): Promise<QuoteBook> => {
  if (bookCache && Date.now() - bookCache.at < 250) return bookCache.book;
  const started = Date.now();
  const [swiss, gold] = await Promise.all([
    readSwiss()
      .then((value) => ({ ok: true as const, value, ms: Date.now() - started }))
      .catch(() => ({ ok: false as const, value: null, ms: Date.now() - started })),
    readGoldApi()
      .then((value) => ({ ok: true as const, value, ms: Date.now() - started }))
      .catch(() => ({ ok: false as const, value: null, ms: Date.now() - started })),
  ]);
  const now = Date.now();
  const goldAge = gold.ok && gold.value.updatedAt ? now - gold.value.updatedAt : null;
  const sources: QuoteSource[] = [
    {
      id: "swissquote",
      name: "瑞士报价",
      ok: swiss.ok,
      bid: swiss.ok ? swiss.value.bid : null,
      ask: swiss.ok ? swiss.value.ask : null,
      mid: swiss.ok ? swiss.value.mid : null,
      latencyMs: swiss.ms,
      at: swiss.ok ? now : null,
      note: swiss.ok ? "买卖价，这一口在跳" : "这拍没接上",
    },
    {
      id: "goldapi",
      name: "Gold API",
      ok: gold.ok,
      bid: null,
      ask: null,
      mid: gold.ok ? gold.value.mid : null,
      latencyMs: gold.ms,
      at: gold.ok ? (gold.value.updatedAt ?? now) : null,
      note: !gold.ok ? "这拍没接上" : goldAge != null && goldAge > 15_000 ? `这口慢 ${Math.round(goldAge / 1000)} 秒` : "对照用，更新没那么勤",
    },
  ];
  const primary = swiss.ok ? swiss.value : null;
  const book: QuoteBook = primary
    ? {
        ok: true,
        mid: primary.mid,
        bid: primary.bid,
        ask: primary.ask,
        source: "瑞士报价",
        latencyMs: swiss.ms,
        at: now,
        sources,
      }
    : {
        ok: gold.ok,
        mid: gold.ok ? gold.value.mid : null,
        bid: null,
        ask: null,
        source: gold.ok ? "Gold API" : "",
        latencyMs: gold.ms,
        at: now,
        sources,
        error: gold.ok ? undefined : "瑞士报价这拍没接上",
      };
  bookCache = { at: now, book };
  return book;
});

async function yahooSeries(interval: string, range: string): Promise<Bar[] | null> {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=${interval}&range=${range}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const yahoo = (await res.json()) as {
        chart?: {
          result?: {
            timestamp?: number[];
            indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }[] };
          }[];
        };
      };
      const result = yahoo.chart?.result?.[0];
      const ts = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0];
      const bars: Bar[] = [];
      if (q?.open && q.high && q.low && q.close) {
        for (let i = 0; i < ts.length; i++) {
          const o = q.open[i];
          const h = q.high[i];
          const l = q.low[i];
          const c = q.close[i];
          if (typeof o !== "number" || typeof h !== "number" || typeof l !== "number" || typeof c !== "number") continue;
          bars.push({ t: ts[i] * 1000, o, h, l, c });
        }
      }
      if (bars.length >= 20) return bars;
    } catch {
      continue;
    }
  }
  return null;
}

const chartCache = new Map<number, { at: number; bars: Bar[] }>();

export const fetchChart = createServerFn({ method: "POST" })
  .validator((input: { minutes?: number }) => {
    const minutes = input?.minutes;
    if (minutes !== 1 && minutes !== 60 && minutes !== 1440) throw new Error("周期不对");
    return { minutes };
  })
  .handler(async ({ data }): Promise<{ ok: true; bars: Bar[] } | { ok: false; error: string }> => {
    const hit = chartCache.get(data.minutes);
    const ttl = data.minutes === 1 ? 8_000 : data.minutes === 60 ? 45_000 : 15_000;
    if (hit && Date.now() - hit.at < ttl) return { ok: true, bars: hit.bars };
    const spec = data.minutes === 1 ? { interval: "1m", range: "1d" } : data.minutes === 60 ? { interval: "60m", range: "3mo" } : { interval: "1d", range: "1y" };
    const bars = await yahooSeries(spec.interval, spec.range);
    if (!bars) return { ok: false, error: "这个周期的 K 线没接上" };
    try {
      const swiss = await readSwiss();
      const last = bars[bars.length - 1].c;
      const shift = swiss.mid - last;
      if (Math.abs(shift) < last * 0.03) {
        for (const bar of bars) {
          bar.o += shift;
          bar.h += shift;
          bar.l += shift;
          bar.c += shift;
        }
      }
    } catch {
      /* 对不齐现货时就用期货形态 */
    }
    chartCache.set(data.minutes, { at: Date.now(), bars });
    return { ok: true, bars };
  });
