import { useEffect, useState } from "react";
import { autoStatus, startAuto, stopAuto } from "@/lib/auto-server";
import { brokerDeskUrl, searchBrokers, type BrokerRow } from "@/lib/brokers";
import { CFD_SYMBOLS, cfdQuotes, placeCfdOrder, scalpTargets, testCfdKey, type CfdQuote, type CfdSymbol } from "@/lib/cfd";
import type { Decision } from "@/lib/decision";

type Saved = { company: string; server: string; login: string };

export function BrokerSearch({ decision }: { decision: Decision | null }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<BrokerRow | null>(null);
  const [login, setLogin] = useState("");
  const [quotes, setQuotes] = useState<CfdQuote[]>([]);
  const [symbol, setSymbol] = useState<CfdSymbol>("XAUUSD");
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [armed, setArmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [autoOn, setAutoOn] = useState(false);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("jinsao-mt5") || "") as Saved;
      if (raw?.company && raw.server) {
        setPicked({ company: raw.company, server: raw.server });
        setLogin(raw.login || "");
      }
    } catch {
      /* 没有记过账户 */
    }
  }, []);

  useEffect(() => {
    const pull = () => {
      void autoStatus()
        .then((view) => setAutoOn(view.on))
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setRows([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setBusy(true);
      void searchBrokers({ data: { q: query } })
        .then((res) => {
          setRows(res.rows);
          setNote(res.ok ? (res.rows.length ? "" : "这个名字没有对上券商。") : res.error);
        })
        .catch(() => setNote("券商目录这一会儿没打开"))
        .finally(() => setBusy(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  function choose(row: BrokerRow) {
    setPicked(row);
    setNote("");
    localStorage.setItem("jinsao-mt5", JSON.stringify({ company: row.company, server: row.server, login }));
  }

  const desk = picked ? brokerDeskUrl(picked.company, picked.server) : null;
  const bitget = Boolean(desk?.includes("bitget"));

  useEffect(() => {
    if (!bitget) return;
    let gone = false;
    const pull = () => {
      void cfdQuotes().then((res) => {
        if (!gone && res.ok) setQuotes(res.quotes);
      });
    };
    pull();
    const timer = window.setInterval(pull, 2000);
    return () => {
      gone = true;
      window.clearInterval(timer);
    };
  }, [bitget]);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-cream-dim">搜 MT5 券商</span>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="doo 或 btgt"
          className="mt-1 h-11 w-full rounded-full border border-line bg-ink px-4 text-sm text-cream outline-none"
        />
      </label>
      {busy ? <p className="text-xs text-cream-dim">正在查券商目录</p> : null}
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {rows.map((row) => (
          <li key={`${row.company}-${row.server}`}>
            <button
              type="button"
              onClick={() => choose(row)}
              className={"w-full rounded-2xl px-3 py-3 text-left " + (picked?.server === row.server && picked.company === row.company ? "bg-ink" : "bg-ink/40")}
            >
              <p className="text-sm text-cream">{row.company}</p>
              <p className="mt-1 text-xs text-cream-dim">{row.server}</p>
            </button>
          </li>
        ))}
      </ul>
      {picked ? (
        <div className="space-y-2">
          <p className="text-sm text-cream">{picked.company}</p>
          <p className="text-xs text-gold">{picked.server}</p>
          <input
            value={login}
            onChange={(event) => {
              const nextLogin = event.target.value.replace(/\D/g, "").slice(0, 16);
              setLogin(nextLogin);
              localStorage.setItem("jinsao-mt5", JSON.stringify({ company: picked.company, server: picked.server, login: nextLogin }));
            }}
            inputMode="numeric"
            placeholder="账号"
            className="h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm text-cream outline-none"
          />
          <p className="text-xs leading-5 text-cream-dim">点差按 14 点（0.14），0.01 手来回手续费 0.06。吃 1 个点要走出 1.20，吃 2 个点要走出 2.20，扣完才剩那 1 或 2 美元。退出 App 不会自己关。</p>
          {bitget ? (
            <button
              type="button"
              onClick={() => {
                if (autoOn) {
                  void stopAuto().then(() => {
                    setAutoOn(false);
                    setNote("自动停了。");
                  });
                  return;
                }
                if (!armed) {
                  setNote("先测试钥匙。");
                  return;
                }
                setSending(true);
                void startAuto({ data: { key, secret, passphrase, symbol } })
                  .then((res) => {
                    setAutoOn(res.ok);
                    setNote(res.text);
                  })
                  .catch(() => setNote("自动没有挂上。"))
                  .finally(() => setSending(false));
              }}
              className={"h-11 w-full rounded-full text-sm text-ink " + (autoOn ? "bg-cinnabar" : "bg-gold")}
            >
              {autoOn ? "自动开着，点此关闭" : "打开自动"}
            </button>
          ) : null}
          {bitget ? (
            <div className="space-y-2">
              <ul className="space-y-1">
                {quotes.map((quote) => (
                  <li key={quote.symbol} className="flex justify-between text-sm tabular-nums">
                    <span>{quote.symbol}</span>
                    <span>{quote.bid.toFixed(2)} / {quote.ask.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <select value={symbol} onChange={(event) => { setSymbol(event.target.value as CfdSymbol); setArmed(false); }} className="h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm">
                {CFD_SYMBOLS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <input value={key} onChange={(event) => { setKey(event.target.value); setArmed(false); }} autoComplete="off" placeholder="API Key" className="h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm" />
              <input value={secret} onChange={(event) => { setSecret(event.target.value); setArmed(false); }} type="password" autoComplete="off" placeholder="Secret" className="h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm" />
              <input value={passphrase} onChange={(event) => { setPassphrase(event.target.value); setArmed(false); }} type="password" autoComplete="off" placeholder="Passphrase" className="h-11 w-full rounded-xl border border-line bg-ink px-3 text-sm" />
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setSending(true);
                  void testCfdKey({ data: { key, secret, passphrase } })
                    .then((res) => {
                      setArmed(res.accepted);
                      setNote(res.text);
                    })
                    .catch(() => setNote("交易所没有应答。"))
                    .finally(() => setSending(false));
                }}
                className="h-11 w-full rounded-full bg-panel text-sm text-cream"
              >
                测试钥匙
              </button>
              <div className="grid grid-cols-2 gap-2">
                {(["buy", "sell"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    disabled={!armed || sending}
                    onClick={() => {
                      const quote = quotes.find((item) => item.symbol === symbol);
                      const price = side === "buy" ? quote?.ask : quote?.bid;
                      const plan = price ? scalpTargets(side, price, decision?.grade === "A+" ? "A+" : "A") : null;
                      setSending(true);
                      void placeCfdOrder({ data: { key, secret, passphrase, side, symbol, takeProfit: plan?.takeProfit, stopLoss: plan?.stopLoss } })
                        .then((res) => setNote(res.text))
                        .catch(() => setNote("交易所没有应答。"))
                        .finally(() => setSending(false));
                    }}
                    className={"h-11 rounded-full text-sm text-ink disabled:opacity-40 " + (side === "buy" ? "bg-gold" : "bg-cinnabar")}
                  >
                    {side === "buy" ? "买入 0.01" : "卖出 0.01"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {bitget ? null : (
            <p className="text-sm leading-6 text-cream">这个券商登不上。金哨只能用 Bitget 的 API 钥匙下单。别的 MT5 没有把交易接口开放给这个网页，账号和密码送不过去。</p>
          )}
        </div>
      ) : null}
      {note ? <p className="text-sm leading-6 text-cream">{note}</p> : null}
    </div>
  );
}
