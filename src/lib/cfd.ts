import { createServerFn } from "@tanstack/react-start";

const HOST = "https://api.bitget.com";
export const CFD_SYMBOLS = ["XAUUSD", "XAUUSD.s", "XAUUSD.pro"] as const;
export type CfdSymbol = (typeof CFD_SYMBOLS)[number];

export type CfdQuote = { symbol: CfdSymbol; bid: number; ask: number };

export const SCALP_SPREAD = 0.14;
export const SCALP_FEE = 0.06;

export function scalpTargets(side: "buy" | "sell", price: number, grade: string): { points: number; takeProfit: string; stopLoss: string } | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const points = grade === "A+" ? 2 : 1;
  const reach = points + SCALP_SPREAD + SCALP_FEE;
  const stop = 1 + SCALP_SPREAD + SCALP_FEE;
  const dir = side === "buy" ? 1 : -1;
  return {
    points,
    takeProfit: (price + dir * reach).toFixed(2),
    stopLoss: (price - dir * stop).toFixed(2),
  };
}

export function nextAutoOrder(held: "buy" | "sell" | null, side: "long" | "short" | "flat", tradable: boolean, grade: string): "buy" | "sell" | null {
  if (!tradable || (grade !== "A+" && grade !== "A")) return null;
  const want = side === "long" ? "buy" : side === "short" ? "sell" : null;
  if (!want || want === held) return null;
  return want;
}

export function readCfdError(code: string, msg: string): { accepted: boolean; text: string } {
  if (code === "00000") return { accepted: true, text: "交易所收下了。" };
  if (code === "40012") return { accepted: false, text: "这一笔没送出去：交易所说时间对不上。自动还开着，下一轮再试。钥匙不用重做。" };
  if (code === "40006" || code === "40009" || code === "40014") {
    const why = code === "40014" ? "口令不对。" : code === "40009" ? "签名对不上。" : "Key 不对。";
    return { accepted: false, text: `钥匙没认。${why}` };
  }
  const short = msg.replace(/\s+/g, " ").trim().slice(0, 80);
  return { accepted: true, text: short ? `钥匙认了，这一笔没出去：${short}` : "钥匙认了，这一笔没出去。" };
}

async function sign(secret: string, timestamp: string, method: string, path: string, body: string) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(timestamp + method + path + body).digest("base64");
}

async function exchangeNow(): Promise<string> {
  try {
    const res = await fetch(`${HOST}/api/v2/public/time`, { signal: AbortSignal.timeout(5000) });
    const raw = (await res.json()) as { requestTime?: number | string; data?: { serverTime?: string } };
    const server = Number(raw.data?.serverTime ?? raw.requestTime);
    if (Number.isFinite(server) && server > 0) return String(Math.trunc(server));
  } catch {
    /* 对不上就用本机时间 */
  }
  return Date.now().toString();
}

async function bitget(method: "GET" | "POST", path: string, body: string, key: string, secret: string, passphrase: string) {
  const send = async (timestamp: string) => {
    const res = await fetch(HOST + path, {
      method,
      headers: {
        "ACCESS-KEY": key,
        "ACCESS-SIGN": await sign(secret, timestamp, method, path, body),
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
        locale: "zh-CN",
      },
      body: method === "POST" ? body : undefined,
      signal: AbortSignal.timeout(12000),
    });
    const raw = (await res.json()) as { code?: string; msg?: string; requestTime?: number | string; data?: { orderId?: string } };
    return { code: String(raw.code ?? ""), msg: String(raw.msg ?? ""), orderId: String(raw.data?.orderId ?? ""), requestTime: String(raw.requestTime ?? "") };
  };
  const first = await send(await exchangeNow());
  if (first.code !== "40012") return first;
  const retryAt = Number(first.requestTime) > 1_000 ? String(Math.trunc(Number(first.requestTime)) - 1_000) : String(Date.now() - 1_000);
  return send(retryAt);
}

export async function loadCfdQuotes(): Promise<CfdQuote[]> {
  const res = await fetch(`${HOST}/api/v3/cfd/market/tickers`, { signal: AbortSignal.timeout(8000) });
  const raw = (await res.json()) as { data?: Array<{ symbol?: string; bid1?: string; ask1?: string }> };
  const rows = Array.isArray(raw.data) ? raw.data : [];
  const quotes: CfdQuote[] = [];
  for (const symbol of CFD_SYMBOLS) {
    const row = rows.find((item) => item.symbol === symbol);
    const bid = Number(row?.bid1);
    const ask = Number(row?.ask1);
    if (row && Number.isFinite(bid) && Number.isFinite(ask)) quotes.push({ symbol, bid, ask });
  }
  return quotes;
}

export async function submitCfdOrder(input: { key: string; secret: string; passphrase: string; side: "buy" | "sell"; symbol: CfdSymbol; takeProfit?: string; stopLoss?: string }) {
  const order: Record<string, string> = {
    symbol: input.symbol,
    side: input.side,
    orderType: "market",
    qty: "0.01",
    clientOid: `js${Date.now().toString(36)}`.slice(0, 32),
  };
  if (input.takeProfit) order.takeProfit = input.takeProfit;
  if (input.stopLoss) order.stopLoss = input.stopLoss;
  const result = await bitget("POST", "/api/v3/cfd/trade/place-order", JSON.stringify(order), input.key, input.secret, input.passphrase);
  if (result.code === "00000") return { ok: true as const, text: `交易所收下了。止盈 ${input.takeProfit || "没带"}，止损 ${input.stopLoss || "没带"}。` };
  return { ok: false as const, text: readCfdError(result.code, result.msg).text };
}

export async function submitCfdClose(input: { key: string; secret: string; passphrase: string; symbol: CfdSymbol }) {
  const result = await bitget("POST", "/api/v3/cfd/trade/close-positions", JSON.stringify({ symbol: input.symbol }), input.key, input.secret, input.passphrase);
  if (result.code === "00000") return { ok: true as const, text: "持仓已平。" };
  return { ok: false as const, text: readCfdError(result.code, result.msg).text };
}
export const cfdQuotes = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const quotes = await loadCfdQuotes();
    return quotes.length ? { ok: true as const, quotes } : { ok: false as const, error: "黄金报价这一会儿没到", quotes };
  } catch {
    return { ok: false as const, error: "黄金报价这一会儿没到", quotes: [] as CfdQuote[] };
  }
});

export const testCfdKey = createServerFn({ method: "POST" })
  .validator((input: { key?: string; secret?: string; passphrase?: string }) => ({
    key: String(input?.key ?? "").trim().slice(0, 128),
    secret: String(input?.secret ?? "").trim().slice(0, 128),
    passphrase: String(input?.passphrase ?? "").trim().slice(0, 64),
  }))
  .handler(async ({ data }) => {
    if (!data.key || !data.secret || !data.passphrase) return { ok: false as const, accepted: false, text: "三样都要填。" };
    try {
      const result = await bitget("POST", "/api/v3/cfd/trade/place-order", "{\"size\":\"0\"}", data.key, data.secret, data.passphrase);
      const read = readCfdError(result.code, result.msg);
      return { ok: read.accepted, accepted: read.accepted, text: read.text };
    } catch {
      return { ok: false as const, accepted: false, text: "交易所没有应答。" };
    }
  });

export const closeCfd = createServerFn({ method: "POST" })
  .validator((input: { key?: string; secret?: string; passphrase?: string; symbol?: string }) => ({
    key: String(input?.key ?? "").trim().slice(0, 128),
    secret: String(input?.secret ?? "").trim().slice(0, 128),
    passphrase: String(input?.passphrase ?? "").trim().slice(0, 64),
    symbol: CFD_SYMBOLS.includes(input?.symbol as CfdSymbol) ? (input?.symbol as CfdSymbol) : "XAUUSD",
  }))
  .handler(async ({ data }) => {
    if (!data.key || !data.secret || !data.passphrase) return { ok: false as const, text: "先填 API。" };
    try {
      const result = await bitget("POST", "/api/v3/cfd/trade/close-positions", JSON.stringify({ symbol: data.symbol }), data.key, data.secret, data.passphrase);
      if (result.code === "00000") return { ok: true as const, text: "持仓已平。" };
      return { ok: false as const, text: readCfdError(result.code, result.msg).text };
    } catch {
      return { ok: false as const, text: "平仓没有应答。" };
    }
  });

export const placeCfdOrder = createServerFn({ method: "POST" })
  .validator((input: { key?: string; secret?: string; passphrase?: string; side?: string; symbol?: string; takeProfit?: string; stopLoss?: string }) => ({
    key: String(input?.key ?? "").trim().slice(0, 128),
    secret: String(input?.secret ?? "").trim().slice(0, 128),
    passphrase: String(input?.passphrase ?? "").trim().slice(0, 64),
    side: input?.side === "sell" ? "sell" : "buy",
    symbol: CFD_SYMBOLS.includes(input?.symbol as CfdSymbol) ? (input?.symbol as CfdSymbol) : "XAUUSD",
    takeProfit: /^\d+(\.\d{1,2})?$/.test(String(input?.takeProfit ?? "")) ? String(input?.takeProfit) : "",
    stopLoss: /^\d+(\.\d{1,2})?$/.test(String(input?.stopLoss ?? "")) ? String(input?.stopLoss) : "",
  }))
  .handler(async ({ data }) => {
    if (!data.key || !data.secret || !data.passphrase) return { ok: false as const, text: "先填 API。" };
    const order: Record<string, string> = {
      symbol: data.symbol,
      side: data.side,
      orderType: "market",
      qty: "0.01",
      clientOid: `js${Date.now().toString(36)}`.slice(0, 32),
    };
    if (data.takeProfit) order.takeProfit = data.takeProfit;
    if (data.stopLoss) order.stopLoss = data.stopLoss;
    const body = JSON.stringify(order);
    try {
      const result = await bitget("POST", "/api/v3/cfd/trade/place-order", body, data.key, data.secret, data.passphrase);
      if (result.code === "00000") {
        const aim = data.takeProfit ? `止盈 ${data.takeProfit}，止损 ${data.stopLoss}` : "没有带止盈止损";
        return { ok: true as const, text: `交易所收下了。${aim}。` };
      }
      return { ok: false as const, text: readCfdError(result.code, result.msg).text };
    } catch {
      return { ok: false as const, text: "交易所没有应答。" };
    }
  });
