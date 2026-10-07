import { createServerFn } from "@tanstack/react-start";

export type BrokerRow = { company: string; server: string };

export function flattenBrokers(raw: unknown): BrokerRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: BrokerRow[] = [];
  for (const item of raw) {
    const company = String(item?.companyName ?? "").trim();
    const results = Array.isArray(item?.results) ? item.results : [];
    for (const server of results) {
      const name = String(server?.name ?? "").trim();
      if (!company || !name) continue;
      rows.push({ company, server: name });
      if (rows.length >= 24) return rows;
    }
  }
  return rows;
}

export const searchBrokers = createServerFn({ method: "GET" })
  .validator((input: { q?: string }) => ({ q: String(input?.q ?? "").trim().slice(0, 40) }))
  .handler(async ({ data }) => {
    if (data.q.length < 2) return { ok: true as const, rows: [] as BrokerRow[] };
    try {
      const res = await fetch(`https://mt5.mtapi.io/Search?company=${encodeURIComponent(data.q)}`, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) return { ok: false as const, error: "券商目录这一会儿没打开", rows: [] as BrokerRow[] };
      return { ok: true as const, rows: flattenBrokers(await res.json()) };
    } catch {
      return { ok: false as const, error: "券商目录这一会儿没打开", rows: [] as BrokerRow[] };
    }
  });

export function pickHosts(access: string[]): { host: string; port: number }[] {
  const parsed = access
    .map((item) => {
      const [host, portText] = item.split(":");
      const port = Number(portText);
      return { host: host?.trim() ?? "", port };
    })
    .filter((item) => item.host && Number.isFinite(item.port) && item.port > 0);
  const first = parsed.filter((item) => item.port === 443);
  const rest = parsed.filter((item) => item.port !== 443);
  return [...first, ...rest].slice(0, 2);
}

export const WORKING_TERMINAL = "https://web.metatrader.app/terminal";

export function brokerDeskUrl(company: string, server: string): string | null {
  const blob = `${company} ${server}`.toLowerCase();
  if (blob.includes("bitget") || blob.includes("btgt")) return "https://www.bitgettradfi.com/tradfi";
  if (blob.includes("doo")) return "https://www.dooprime.com";
  return null;
}

export function linkReport(server: string, login: string): { title: string; lines: string[] } {
  const loginOk = /^\d{4,16}$/.test(login);
  return {
    title: "终端已打开",
    lines: [
      server ? `服务器 ${server} 在券商目录里。` : "还没有选择服务器。",
      loginOk ? `账号 ${login} 已记下。密码不经过金哨。` : "账号还没写全。",
    ],
  };
}

export function explainLoginError(text: string): string {
  if (/trial expired/i.test(text)) return "没登上。连接服务的试用到期了，密码没有送到券商。这不是账号写错。";
  const plain = text.replace(/<[^>]+>/g, " ").replace(/[{}[\]"]/g, " ").replace(/\s+/g, " ").trim();
  const message = plain.match(/message\s*:\s*(.{4,80})/i)?.[1] ?? plain.slice(0, 80);
  if (message.length < 4) return "没登上。账号、密码或服务器不对。";
  return `没登上。${message}`;
}

async function hostsFor(server: string): Promise<{ host: string; port: number }[]> {
  const query = server.replace(/-(live|demo).*$/i, "") || server;
  const res = await fetch(`https://mt5.mtapi.io/Search?company=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) return [];
  const raw = await res.json();
  if (!Array.isArray(raw)) return [];
  for (const item of raw) {
    const results = Array.isArray(item?.results) ? item.results : [];
    for (const row of results) {
      if (String(row?.name ?? "") !== server) continue;
      const access = Array.isArray(row?.access) ? row.access.map((value: unknown) => String(value)) : [];
      return pickHosts(access);
    }
  }
  return [];
}

export const loginBroker = createServerFn({ method: "POST" })
  .validator((input: { login?: string; password?: string; server?: string }) => ({
    login: String(input?.login ?? "").replace(/\D/g, "").slice(0, 16),
    password: String(input?.password ?? "").slice(0, 64),
    server: String(input?.server ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (data.login.length < 3 || data.password.length < 1 || !data.server) {
      return { ok: false as const, error: "账号和密码都要填。" };
    }
    const hosts = await hostsFor(data.server).catch(() => []);
    if (!hosts.length) return { ok: false as const, error: "没有找到这台服务器的地址。" };
    const target = hosts[0];
    const params = new URLSearchParams({
      user: data.login,
      password: data.password,
      host: target.host,
      port: String(target.port),
      connectTimeoutSeconds: "8",
    });
    try {
      const res = await fetch(`https://mt5.mtapi.io/Connect?${params}`, { signal: AbortSignal.timeout(12000) });
      const body = (await res.text()).split(data.password).join("");
      if (res.status !== 200) return { ok: false as const, error: explainLoginError(body) };
      const token = body.trim();
      if (!token || token.startsWith("{") || token.startsWith("<")) return { ok: false as const, error: explainLoginError(body) };
      const summaryRes = await fetch(`https://mt5.mtapi.io/AccountSummary?id=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const summary = (await summaryRes.json()) as Record<string, unknown>;
      return {
        ok: true as const,
        token,
        currency: String(summary.currency ?? ""),
        balance: Number(summary.balance ?? 0),
        equity: Number(summary.equity ?? 0),
        margin: Number(summary.margin ?? 0),
        freeMargin: Number(summary.freeMargin ?? 0),
        leverage: Number(summary.leverage ?? 0),
        profit: Number(summary.profit ?? 0),
      };
    } catch {
      return { ok: false as const, error: "服务器没有应答。" };
    }
  });

export const disconnectBroker = createServerFn({ method: "POST" })
  .validator((input: { token?: string }) => ({ token: String(input?.token ?? "").trim().slice(0, 128) }))
  .handler(async ({ data }) => {
    if (!data.token) return { ok: true as const };
    await fetch(`https://mt5.mtapi.io/Disconnect?id=${encodeURIComponent(data.token)}`, { signal: AbortSignal.timeout(8000) }).catch(() => undefined);
    return { ok: true as const };
  });
