import { useEffect, useRef, useState } from "react";
import { resample } from "@/lib/indicators/bars";
import { chartLayers, type ChartLine, type ChartMark } from "@/lib/indicators/engine";
import { catLevels, readCat } from "@/lib/indicators/laomao";
import { atr, ema, highest, lowest, roc, rsi, sma, stdev } from "@/lib/indicators/math";
import { useDesk } from "@/lib/desk-store";
import type { Bar, Indicator } from "@/lib/indicators/types";
import { fetchChart, type QuoteBook } from "@/lib/market";
import { QuoteStage, type Tick } from "./quote";

const VIEWS = [
  { id: 1, label: "1分" },
  { id: 5, label: "5分" },
  { id: 15, label: "15分" },
  { id: 30, label: "30分" },
  { id: 60, label: "1时" },
  { id: 240, label: "4时" },
  { id: 1440, label: "日" },
] as const;

function tvInterval(minutes: number): string {
  if (minutes >= 1440) return "D";
  return String(minutes);
}

function linePath(values: number[], slot: number, y: (p: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = i * slot + slot / 2;
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

function withLive(bars: Bar[], minutes: number, price: number | null, now: number): Bar[] {
  if (!bars.length || price == null) return bars;
  const ms = minutes * 60_000;
  const bucket = Math.floor(now / ms) * ms;
  const last = bars[bars.length - 1];
  const copy = bars.slice();
  if (bucket <= last.t) {
    copy[copy.length - 1] = { ...last, c: price, h: Math.max(last.h, price), l: Math.min(last.l, price) };
    return copy;
  }
  copy.push({ t: bucket, o: last.c, h: Math.max(last.c, price), l: Math.min(last.c, price), c: price });
  return copy;
}

function CandleSvg({
  bars,
  live,
  lines,
  marks,
  levels,
  zone,
}: {
  bars: Bar[];
  live: number | null;
  lines: ChartLine[];
  marks: ChartMark[];
  levels: { price: number; label: string; tone: "gold" | "cinnabar" | "dim" }[];
  zone?: { entryLow: number; entryHigh: number; stop: number; tp1: number } | null;
}) {
  const start = Math.max(0, bars.length - 64);
  const view = bars.slice(start);
  const w = 360;
  const h = 228;
  const axis = 54;
  const plot = w - axis;
  if (view.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[58vh] min-h-[380px] w-full bg-ink" role="img" aria-label="黄金走势" preserveAspectRatio="none">
        <text x="16" y="114" fill="#b7ad9c" fontSize="13">
          正在接 K 线
        </text>
      </svg>
    );
  }
  const shownLines = lines.map((line) => ({ ...line, values: line.values.slice(start) }));
  const shownMarks = marks.filter((mark) => mark.index >= start).map((mark) => ({ ...mark, index: mark.index - start }));
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of view) {
    lo = Math.min(lo, b.l);
    hi = Math.max(hi, b.h);
  }
  for (const line of shownLines) {
    for (const v of line.values) {
      if (!Number.isFinite(v)) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (live != null) {
    lo = Math.min(lo, live);
    hi = Math.max(hi, live);
  }
  const span = Math.max(hi - lo, 0.6);
  const mid = (hi + lo) / 2;
  lo = mid - span / 2;
  hi = mid + span / 2;
  const pad = span * 0.08;
  lo -= pad;
  hi += pad;
  const slot = plot / view.length;
  const y = (p: number) => h - ((p - lo) / (hi - lo)) * (h - 16) - 8;
  const ly = live == null ? null : y(live);
  const up = live != null && view.length ? live >= view[view.length - 1].o : true;
  const tag = up ? "#d4a853" : "#c45c4a";
  const near = levels.filter((level) => level.price >= lo && level.price <= hi);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[58vh] min-h-[380px] w-full bg-ink" role="img" aria-label="黄金走势" preserveAspectRatio="none">
      {[1, 2, 3].map((i) => (
        <line key={i} x1="0" x2={plot} y1={(h / 4) * i} y2={(h / 4) * i} stroke="#2c2822" strokeWidth="1" />
      ))}
      {shownLines.map((line) => (
        <path key={line.label} d={linePath(line.values, slot, y)} fill="none" stroke={line.color} strokeWidth="1.4" />
      ))}
      {view.map((b, i) => {
        const x = i * slot + slot / 2;
        const rising = b.c >= b.o;
        const color = rising ? "#d4a853" : "#c45c4a";
        const top = y(Math.max(b.o, b.c));
        const bot = y(Math.min(b.o, b.c));
        return (
          <g key={b.t}>
            <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} stroke={color} strokeWidth="1" />
            <rect x={x - Math.max(1.2, slot * 0.32)} y={top} width={Math.max(2.2, slot * 0.64)} height={Math.max(1, bot - top)} fill={color} />
          </g>
        );
      })}
      {shownMarks.map((mark) => {
        const b = view[mark.index];
        if (!b) return null;
        const x = mark.index * slot + slot / 2;
        const long = mark.side === "long";
        const tip = long ? y(b.l) + 3 : y(b.h) - 3;
        const base = long ? tip + 7 : tip - 7;
        return (
          <polygon key={`${mark.index}-${mark.name}`} points={`${x},${tip} ${x - 3.5},${base} ${x + 3.5},${base}`} fill={long ? "#d4a853" : "#c45c4a"}>
            <title>{mark.name}</title>
          </polygon>
        );
      })}
      {zone && zone.entryHigh > lo && zone.entryLow < hi ? (
        <rect x="0" y={y(zone.entryHigh)} width={plot} height={Math.max(2, y(zone.entryLow) - y(zone.entryHigh))} fill="#d4a853" opacity="0.16" />
      ) : null}
      {near.map((level) => {
        const stroke = level.tone === "cinnabar" ? "#c45c4a" : level.tone === "gold" ? "#d4a853" : "#b7ad9c";
        const yy = y(level.price);
        return (
          <g key={level.label}>
            <line x1="0" x2={plot} y1={yy} y2={yy} stroke={stroke} strokeDasharray="4 3" strokeWidth="1" />
            <text x="4" y={yy - 3} fill={stroke} fontSize="9">
              {level.label}
            </text>
          </g>
        );
      })}
      {[hi, (hi + lo) / 2, lo]
        .filter((price) => ly == null || Math.abs(y(price) - ly) > 16)
        .map((price) => (
          <text key={price} x={w - 2} y={y(price) + 3} fill="#8a8175" fontSize="9" textAnchor="end">
            {price.toFixed(1)}
          </text>
        ))}
      {ly != null && live != null ? (
        <g key={live.toFixed(2)} className="quote-flash">
          <line x1="0" x2={plot} y1={ly} y2={ly} stroke={tag} strokeDasharray="3 3" strokeWidth="1" />
          <rect x={plot + 2} y={ly - 8} width={axis - 4} height={16} rx="2" fill={tag} />
          <text x={w - 4} y={ly + 4} fill="#0e0d0b" fontSize="9" textAnchor="end">
            {live.toFixed(2)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

const CHART_STUDIES = [
  { id: "sma", name: "SMA 20", group: "趋势", tv: "MASimple@tv-basicstudies" },
  { id: "ema", name: "EMA 21", group: "趋势", tv: "MAExp@tv-basicstudies" },
  { id: "bb", name: "布林带", group: "趋势", tv: "BB@tv-basicstudies" },
  { id: "donchian", name: "唐奇安通道", group: "趋势", tv: "DonchianChannels@tv-basicstudies" },
  { id: "vwap", name: "VWAP", group: "趋势", tv: "VWAP@tv-basicstudies" },
  { id: "ichimoku", name: "一目均衡", group: "趋势", tv: "IchimokuCloud@tv-basicstudies" },
  { id: "rsi", name: "RSI", group: "摆动", tv: "RSI@tv-basicstudies" },
  { id: "macd", name: "MACD", group: "摆动", tv: "MACD@tv-basicstudies" },
  { id: "stoch", name: "随机指标", group: "摆动", tv: "Stochastic@tv-basicstudies" },
  { id: "cci", name: "CCI", group: "摆动", tv: "CCI@tv-basicstudies" },
  { id: "atr", name: "ATR", group: "波动", tv: "ATR@tv-basicstudies" },
  { id: "roc", name: "变动率", group: "摆动", tv: "ROC@tv-basicstudies" },
] as const;

function OscPane({ title, a, b, floor, ceil }: { title: string; a: number[]; b?: number[]; floor: number; ceil: number }) {
  const start = Math.max(0, a.length - 64);
  const left = a.slice(start);
  const right = b?.slice(start);
  const w = 360;
  const h = 72;
  const y = (v: number) => h - ((v - floor) / (ceil - floor || 1)) * (h - 12) - 6;
  const slot = w / Math.max(left.length, 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full border-t border-line bg-ink" preserveAspectRatio="none" role="img" aria-label={title}>
      <text x="8" y="12" fill="#8a8175" fontSize="10">
        {title}
      </text>
      <path d={linePath(left, slot, y)} fill="none" stroke="#d4a853" strokeWidth="1.3" />
      {right ? <path d={linePath(right, slot, y)} fill="none" stroke="#f3ecdf" strokeWidth="1.1" /> : null}
    </svg>
  );
}

export function TapeChart({
  bars,
  book,
  ticks,
  indicators,
  absorbing,
  onAbsorb,
  zone,
}: {
  bars: Bar[];
  book: QuoteBook | null;
  ticks: Tick[];
  indicators: Indicator[];
  absorbing: boolean;
  onAbsorb: (text: string) => void;
  zone?: { entryLow: number; entryHigh: number; stop: number; tp1: number } | null;
}) {
  const [minutes, setMinutes] = useState(5);
  const [engine, setEngine] = useState<"tv" | "desk">("tv");
  const [picked, setPicked] = useState<string[]>(["ema", "sma"]);
  const [query, setQuery] = useState("");
  const [pineOpen, setPineOpen] = useState(false);
  const [pine, setPine] = useState("");
  const toggle = useDesk((s) => s.toggle);
  const [feed, setFeed] = useState<{ key: number; bars: Bar[] } | null>(null);
  const [feedNote, setFeedNote] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const price = book?.mid ?? null;
  const feedKey = minutes === 1 ? 1 : minutes === 240 ? 60 : minutes === 1440 ? 1440 : 0;

  useEffect(() => {
    if (!feedKey) return;
    let stop = false;
    const pull = () => {
      fetchChart({ data: { minutes: feedKey } })
        .then((data) => {
          if (stop) return;
          if (data.ok) {
            setFeed({ key: feedKey, bars: data.bars });
            setFeedNote("");
          } else setFeedNote(data.error);
        })
        .catch(() => {
          if (!stop) setFeedNote("这个周期的 K 线没接上");
        });
    };
    pull();
    const id = window.setInterval(pull, 40_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [feedKey]);

  useEffect(() => {
    if (engine !== "tv") return;
    const el = host.current;
    if (!el) return;
    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    wrap.style.height = "100%";
    wrap.style.width = "100%";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: "OANDA:XAUUSD",
      interval: tvInterval(minutes),
      timezone: "Asia/Shanghai",
      theme: "dark",
      style: "1",
      locale: "zh_CN",
      hide_top_toolbar: true,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      support_host: "https://www.tradingview.com",
    });
    wrap.append(widget, script);
    el.replaceChildren(wrap);
    return () => el.replaceChildren();
  }, [engine, minutes]);

  const source = feedKey ? (feed?.key === feedKey ? feed.bars : []) : bars;
  const viewBars = source.length ? withLive(resample(source, minutes), minutes, price, Date.now()) : [];
  const close = viewBars.map((bar) => bar.c);
  const high = viewBars.map((bar) => bar.h);
  const low = viewBars.map((bar) => bar.l);
  const has = (id: string) => picked.includes(id);
  const baseLines: ChartLine[] = [];
  if (viewBars.length > 20) {
    if (has("sma")) baseLines.push({ label: "SMA 20", color: "#f3ecdf", values: sma(close, 20) });
    if (has("ema")) baseLines.push({ label: "EMA 21", color: "#d4a853", values: ema(close, 21) });
    if (has("bb")) {
      const mid = sma(close, 20);
      const sd = stdev(close, 20);
      baseLines.push({ label: "布林中", color: "#e7c98a", values: mid });
      baseLines.push({ label: "布林上", color: "#d4a853", values: mid.map((v, i) => (Number.isFinite(v) && Number.isFinite(sd[i]) ? v + sd[i] * 2 : Number.NaN)) });
      baseLines.push({ label: "布林下", color: "#d4a853", values: mid.map((v, i) => (Number.isFinite(v) && Number.isFinite(sd[i]) ? v - sd[i] * 2 : Number.NaN)) });
    }
    if (has("donchian")) {
      baseLines.push({ label: "唐奇安上", color: "#f3ecdf", values: highest(high, 20) });
      baseLines.push({ label: "唐奇安下", color: "#c45c4a", values: lowest(low, 20) });
    }
  }
  const layers = feedKey || engine === "tv" ? { lines: [] as ChartLine[], marks: [] as ChartMark[] } : chartLayers(indicators.filter((item) => item.armed), bars, minutes);
  const lines = [...baseLines, ...layers.lines.filter((line) => line.values.length === viewBars.length)];
  const cat = engine === "desk" && viewBars.length > 30 ? readCat(viewBars) : null;
  const levels = cat ? catLevels(cat) : [];
  const marks = [...layers.marks];
  for (const mark of cat?.marks ?? []) {
    if (!marks.some((item) => item.index === mark.index)) marks.push(mark);
  }
  const panes: { title: string; a: number[]; b?: number[]; floor: number; ceil: number }[] = [];
  if (viewBars.length > 30) {
    if (has("rsi")) panes.push({ title: "RSI 14", a: rsi(close, 14), floor: 0, ceil: 100 });
    if (has("macd")) {
      const fast = ema(close, 12);
      const slow = ema(close, 26);
      const macdLine = close.map((_, i) => (Number.isFinite(fast[i]) && Number.isFinite(slow[i]) ? fast[i] - slow[i] : Number.NaN));
      const signal = ema(macdLine.map((v) => (Number.isFinite(v) ? v : 0)), 9);
      const finite = macdLine.filter((v) => Number.isFinite(v));
      const peak = Math.max(0.4, ...finite.map((v) => Math.abs(v)));
      panes.push({ title: "MACD", a: macdLine, b: signal, floor: -peak, ceil: peak });
    }
    if (has("stoch")) {
      const hh = highest(high, 14);
      const ll = lowest(low, 14);
      const k = close.map((c, i) => (Number.isFinite(hh[i]) && hh[i] !== ll[i] ? ((c - ll[i]) / (hh[i] - ll[i])) * 100 : Number.NaN));
      panes.push({ title: "随机指标", a: k, b: sma(k.map((v) => (Number.isFinite(v) ? v : 50)), 3), floor: 0, ceil: 100 });
    }
    if (has("atr")) {
      const series = atr(high, low, close, 14);
      const finite = series.filter((v) => Number.isFinite(v));
      panes.push({ title: "ATR 14", a: series, floor: 0, ceil: Math.max(...finite, 1) });
    }
    if (has("roc")) {
      const series = roc(close, 12);
      const finite = series.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v));
      const peak = Math.max(0.2, ...finite);
      panes.push({ title: "变动率", a: series, floor: -peak, ceil: peak });
    }
  }
  const needle = query.trim();
  const shownStudies = CHART_STUDIES.filter((item) => !needle || item.name.toLowerCase().includes(needle.toLowerCase()));
  const shownMine = indicators.filter((item) => !needle || item.name.includes(needle));
  const groups = ["趋势", "摆动", "波动"] as const;

  return (
    <div className="space-y-3">
      <QuoteStage book={book} ticks={ticks} />
      <div className="overflow-hidden rounded-2xl bg-ink shadow-panel">
        <div className="flex items-center gap-2 px-3 pt-2">
          <div className="nav-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMinutes(item.id)}
                className={"h-8 shrink-0 rounded-full px-2.5 text-xs " + (minutes === item.id ? "bg-gold text-ink" : "text-cream-dim")}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setEngine((v) => (v === "tv" ? "desk" : "tv"))}
            className="h-8 shrink-0 rounded-full bg-panel px-2.5 text-xs text-gold"
          >
            {engine === "tv" ? "哨图" : "TV"}
          </button>
        </div>
        {engine === "tv" ? (
          <div ref={host} className="relative mt-2 w-full overflow-hidden" style={{ height: "68vh", minHeight: 460 }} />
        ) : (
          <>
            <CandleSvg bars={viewBars} live={price} lines={lines} marks={marks} levels={levels} zone={zone} />
            {panes.slice(0, 2).map((pane) => (
              <OscPane key={pane.title} {...pane} />
            ))}
          </>
        )}
        {engine === "desk" ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-2 text-xs text-cream-dim">
            {lines.map((line) => (
              <span key={line.label} className="inline-flex items-center gap-1">
                <span className="inline-block h-0.5 w-3" style={{ background: line.color }} />
                {line.label}
              </span>
            ))}
            {marks.length ? <span>箭头是已经满足的 K 线</span> : null}
            {feedNote ? <span>{feedNote}</span> : null}
          </div>
        ) : null}
        <div className="space-y-3 px-3 pt-3 pb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜指标、策略，点一下就画到图上"
            className="h-11 w-full rounded-full border border-line bg-ink px-4 text-sm text-cream outline-none"
          />
          {groups.map((group) => {
            const items = shownStudies.filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="text-xs text-cream-dim">{group}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {items.map((item) => {
                    const on = picked.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPicked((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))}
                        className={"h-8 rounded-full px-3 text-xs " + (on ? "bg-gold text-ink" : "bg-panel text-cream")}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {shownMine.length ? (
            <div>
              <p className="text-xs text-cream-dim">我的策略</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {shownMine.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      toggle(item.id);
                      if (!item.armed) setEngine("desk");
                    }}
                    className={"h-8 rounded-full px-3 text-xs " + (item.armed ? "bg-gold text-ink" : "bg-panel text-cream")}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {engine === "tv" ? (
            <p className="text-xs leading-5 text-cream-dim">这张图只负责看，不算进场。周期跟着上面走。自己的策略点了会切到哨图，线才画得上去。</p>
          ) : (
            <p className="text-xs leading-5 text-cream-dim">点亮的指标直接画在这张 K 线上。摆动指标画在图下面那一栏。</p>
          )}
          <button type="button" onClick={() => setPineOpen((v) => !v)} className="text-xs text-gold">
            {pineOpen ? "收起 Pine" : "贴 Pine"}
          </button>
          {pineOpen ? (
            <label className="block">
              <textarea
                value={pine}
                onChange={(e) => setPine(e.target.value)}
                rows={5}
                spellCheck={false}
                className="w-full resize-none rounded-xl border border-line bg-ink px-3 py-3 font-mono text-xs text-cream outline-none"
                placeholder={"//@version=5\nindicator(\"黄金\", overlay=true)"}
              />
              <button
                type="button"
                disabled={absorbing}
                onClick={() => onAbsorb(pine)}
                className="mt-2 h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-60"
              >
                {absorbing ? "改写中" : "吸收这段 Pine，改写入库"}
              </button>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
