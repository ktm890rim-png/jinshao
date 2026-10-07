import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Cable, Calendar, CandlestickChart, Github, Library, MessagesSquare, Radio, Rows3, Search, Shield, Waypoints, Workflow } from "lucide-react";
import { askSentinel, digCommunity, judgeSignal, refineSource } from "@/lib/agent";
import { useDesk } from "@/lib/desk-store";
import { fmtClock, px, sideLabel } from "@/lib/format";
import { evaluate } from "@/lib/indicators/engine";
import { OP_LABEL, OPERANDS, draftFromText, operandNeedsLength, operandWithType } from "@/lib/indicators/parse";
import { rollSignals } from "@/lib/indicators/signals";
import type { EvalHit, Indicator, Lead, Operand, Side, Signal } from "@/lib/indicators/types";
import { TF_LABEL } from "@/lib/indicators/types";
import { fetchMarket, fetchSpot, type QuoteBook } from "@/lib/market";
import { TOPICS, type TopicId } from "@/lib/topics";
import { TapeChart } from "./tv-chart";
import { GraphBoard, LinkBoard, OrderFlow } from "./atelier";
import { CatPanel } from "./cat-panel";
import { CommandDeck, GateLine } from "./command";
import { type Tick } from "./quote";
import { useAtelier } from "@/lib/atelier-store";
import { seeds } from "@/lib/indicators/seeds";
import { runPipeline, type Pipeline } from "@/lib/pipeline";
import { learnDesk, type StudyReport } from "@/lib/study";
import { StudyBoard } from "./study-board";
import { ConfluenceBoard } from "./confluence-board";
import { calendarState } from "@/lib/calendar";
import { judgeLanes, mechanismLane, newsLane, tvLane, type TvHook } from "@/lib/lanes";
import { communityLane, matchScript, ROLE_LABEL, SCRIPTS, type ScriptAlert } from "@/lib/community";
import { shareTarget } from "@/lib/share";
import { decide, type Decision } from "@/lib/decision";
import { assess } from "@/lib/terminal";
import { DecisionBoard } from "./decision-board";
import { Lab, type Prefs } from "./lab";
import { LiveTrade } from "./live-trade";
import { TerminalView } from "./terminal-view";
import type { Note } from "@/lib/playbook";
import { BacktestBoard, CommunityBoard, HomeBoard, SetupBoard } from "./platform";
import { HedgeCard } from "./hedge-card";
import { HookBox, MonitorBoard } from "./monitor";

type Tab = "watch" | "terminal" | "command" | "flow" | "arch" | "link" | "mine" | "lib" | "judge" | "study" | "macro" | "lab" | "replay" | "setup" | "dig";

function opText(op: Operand): string {
  if (op.type === "const") return String(op.value);
  const name = OPERANDS.find((item) => item.type === op.type)?.label ?? op.type;
  return operandNeedsLength(op) ? `${name} ${op.length}` : name;
}

function sameSignals(a: Signal[], b: Signal[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function absorb(leads: Lead[]): number {
  const made: Indicator[] = [];
  for (const lead of leads) {
    if (lead.snippet.length < 40) continue;
    const drafts = draftFromText(lead.snippet, {
      source: lead.origin,
      sourceUrl: lead.url,
      sourceNote: lead.snippet.slice(0, 500),
      armed: false,
    });
    const short = lead.title.split("/").pop()?.replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, "").slice(0, 8) || "社区";
    for (const draft of drafts) {
      draft.name = `${short}${draft.side === "long" ? "多" : "空"}`.slice(0, 16);
      draft.thesis = `从 ${lead.origin === "github" ? "GitHub" : "TradingView"} 自动收来，还没让哨兵改写。${lead.blurb}`.slice(0, 180);
      made.push(draft);
    }
  }
  if (made.length) useDesk.getState().adopt(made);
  return made.length;
}

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function ShareCard() {
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<ReturnType<typeof shareTarget>>({ kind: "preview" });

  useEffect(() => {
    setTarget(shareTarget(window.location.origin, window.location.hostname));
  }, []);

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote(done);
    } catch {
      setNote(text);
    }
  }

  return (
    <div className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm">发给别人</p>
          <p className="mt-1 text-xs leading-5 text-cream-dim">
            {target.kind === "public" ? "这条地址谁打开都能用，也能嵌进别的网页。" : "预览地址发出去别人打不开。发布之后，再回来复制。"}
          </p>
        </div>
        {target.kind === "public" ? (
          <button type="button" onClick={() => void copy(target.url, "已复制。发给谁都能打开。")} className="h-10 shrink-0 rounded-full bg-gold px-4 text-sm text-ink">
            复制链接
          </button>
        ) : null}
      </div>
      {target.kind === "public" ? (
        <>
          <p className="mt-2 break-all text-xs text-gold">{target.url}</p>
          <button type="button" onClick={() => void copy(target.embed, "嵌入代码已复制。贴到别的网页里就能用。")} className="mt-2 text-xs text-gold">
            复制嵌入代码
          </button>
        </>
      ) : null}
      {note ? <p className="mt-2 text-xs leading-5 text-cream">{note}</p> : null}
    </div>
  );
}

function InstallBar() {
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"ios" | "android" | "desktop">("desktop");
  const [canPrompt, setCanPrompt] = useState(false);
  const promptRef = useRef<InstallPrompt | null>(null);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone || localStorage.getItem("jinsao-install-hide") === "1") setGone(true);
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setMode("ios");
    else if (/android/i.test(ua)) setMode("android");
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPrompt;
      setCanPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (gone) return null;

  async function install() {
    const prompt = promptRef.current;
    if (!prompt) {
      setOpen(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    promptRef.current = null;
    setCanPrompt(false);
    if (choice.outcome === "accepted") setGone(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-panel px-4 py-3 shadow-panel">
        <p className="text-sm leading-5">装到主屏幕，全屏打开，像一个 App。</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem("jinsao-install-hide", "1");
              setGone(true);
            }}
            className="h-10 px-2 text-sm text-cream-dim"
          >
            先不用
          </button>
          <button type="button" onClick={() => void install()} className="h-10 rounded-full bg-gold px-4 text-sm text-ink">
            {canPrompt ? "安装" : "怎么装"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="rounded-2xl bg-panel px-4 py-3 text-sm leading-6 shadow-panel">
          {mode === "ios" ? (
            <>
              <p>聊天窗口里加不了主屏幕。发布之后，用 Safari 打开金哨：</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>点底部分享按钮</li>
                <li>选「添加到主屏幕」</li>
                <li>点右上角「添加」</li>
              </ol>
            </>
          ) : mode === "android" ? (
            <p>用 Chrome 打开发布后的金哨，点浏览器菜单里的「安装应用」或「添加到主屏幕」。</p>
          ) : (
            <p>电脑上用 Chrome 或 Edge 打开发布后的金哨，地址栏右侧会出现安装图标。</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Desk() {
  const indicators = useDesk((s) => s.indicators);
  const signals = useDesk((s) => s.signals);
  const messages = useDesk((s) => s.messages);
  const watchOn = useDesk((s) => s.watchOn);
  const [tab, setTab] = useState<Tab>("watch");
  const [embed, setEmbed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setEmbed(new URLSearchParams(window.location.search).get("embed") === "1");
  }, []);
  const [market, setMarket] = useState<Awaited<ReturnType<typeof fetchMarket>> | null>(null);
  const [evals, setEvals] = useState<EvalHit[]>([]);
  const [pipe, setPipe] = useState<Pipeline | null>(null);
  const [secret, setSecret] = useState("");
  const [hook, setHook] = useState<TvHook | null>(null);
  const [alerts, setAlerts] = useState<ScriptAlert[]>([]);
  const [hookNote, setHookNote] = useState("");
  const [confirm, setConfirm] = useState<{ barTime: number; side: Side } | null>(null);
  const [killed, setKilled] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ account: 10000, riskPct: 0.5, streak: 0, tradesToday: 0 });
  const [notes, setNotes] = useState<Note[]>([]);
  const [review, setReview] = useState("");
  const [book, setBook] = useState<QuoteBook | null>(null);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [study, setStudy] = useState<StudyReport | null>(null);
  const [studyError, setStudyError] = useState("");
  const [studyBusy, setStudyBusy] = useState(false);
  const [topic, setTopic] = useState<TopicId>("gold");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [digging, setDigging] = useState(false);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState("");
  const seen = useRef<Set<string> | null>(null);
  const dug = useRef(false);

  useEffect(() => {
    const done = useDesk.persist.onFinishHydration(() => {
      setHydrated(true);
      setKilled(localStorage.getItem("jinsao-kill") === "1");
      try {
        const saved = JSON.parse(localStorage.getItem("jinsao-prefs") || "") as Prefs;
        if (saved && typeof saved.account === "number") setPrefs(saved);
      } catch {
        /* 没有存过风控 */
      }
      try {
        const saved = JSON.parse(localStorage.getItem("jinsao-notes") || "[]") as Note[];
        if (Array.isArray(saved)) setNotes(saved.slice(0, 40));
      } catch {
        /* 没有判断记录 */
      }
      const have = new Set(useDesk.getState().indicators.map((item) => item.id));
      const missing = seeds.filter((item) => item.id.startsWith("seed-laomao") && !have.has(item.id));
      if (missing.length) useDesk.getState().adopt(missing);
    });
    void useDesk.persist.rehydrate();
    void useAtelier.persist.rehydrate();
    return done;
  }, []);

  useEffect(() => {
    let stop = false;
    const pull = () => {
      fetchMarket()
        .then((data) => {
          if (!stop) setMarket(data);
        })
        .catch(() => {
          if (!stop) setMarket({ ok: false, error: "行情这一会儿没接上" });
        });
    };
    pull();
    const quote = window.setInterval(pull, 60000);
    return () => {
      stop = true;
      window.clearInterval(quote);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    let busy = false;
    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await fetchSpot();
        if (stop) return;
        setBook(next);
        if (next.mid != null) {
          const bid = next.bid ?? next.mid;
          const ask = next.ask ?? next.mid;
          const mid = next.mid;
          setTicks((prev) => {
            const last = prev[0];
            if (last && Math.abs(last.mid - mid) < 0.005) return prev;
            return [{ at: next.at, mid, bid, ask, up: !last || mid >= last.mid }, ...prev].slice(0, 14);
          });
          if (useDesk.getState().watchOn) {
            const prevSignals = useDesk.getState().signals;
            if (prevSignals.length) {
              const rolled = rollSignals({ prev: prevSignals, evals: [], price: mid, now: Date.now(), conflict: false });
              if (!sameSignals(prevSignals, rolled)) useDesk.getState().setSignals(rolled);
            }
          }
        }
      } catch {
        /* 下一拍再问 */
      } finally {
        busy = false;
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  const barTime = market?.ok ? (market.bars[market.bars.length - 1]?.t ?? 0) : 0;
  const armedKey = indicators
    .filter((item) => item.armed)
    .map((item) => item.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!barTime || !market?.ok) return;
    let stop = false;
    const packed = useDesk
      .getState()
      .indicators.filter((item) => item.armed)
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        name: item.name,
        side: item.side,
        timeframe: item.timeframe,
        logic: item.logic,
        conditions: item.conditions,
      }));
    void learnDesk({ data: { indicators: packed, force: false } })
      .then((res) => {
        if (stop) return;
        if (!res.ok) setStudyError(res.error);
        else {
          setStudy(res.report);
          setStudyError("");
        }
      })
      .catch(() => {
        if (!stop) setStudyError("这轮没有写进库");
      });
    return () => {
      stop = true;
    };
  }, [barTime, armedKey, market]);

  async function restudy() {
    if (!market?.ok) return;
    setStudyBusy(true);
    setStudyError("");
    try {
      const packed = useDesk
        .getState()
        .indicators.filter((item) => item.armed)
        .slice(0, 8)
        .map((item) => ({
          id: item.id,
          name: item.name,
          side: item.side,
          timeframe: item.timeframe,
          logic: item.logic,
          conditions: item.conditions,
        }));
      const res = await learnDesk({ data: { indicators: packed, force: true } });
      if (!res.ok) setStudyError(res.error);
      else setStudy(res.report);
    } catch {
      setStudyError("这轮没有写进库");
    } finally {
      setStudyBusy(false);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("jinsao-tv");
      if (!raw) return;
      const saved = JSON.parse(raw) as { secret?: string; hook?: TvHook | null; alerts?: ScriptAlert[] };
      if (typeof saved.secret === "string") setSecret(saved.secret);
      if (saved.hook && saved.hook.secret && saved.hook.name) setHook(saved.hook);
      if (Array.isArray(saved.alerts)) setAlerts(saved.alerts.filter((item) => item && item.scriptId && item.side));
    } catch {
      /* 旧记录读不了就当没有 */
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !market?.ok || !watchOn) return;
    const armed = useDesk.getState().indicators.filter((item) => item.armed);
    const nextEvals = armed.map((item) => evaluate(item, market.bars, Date.now()));
    const swiss = book?.sources.find((item) => item.id === "swissquote")?.mid;
    const other = book?.sources.find((item) => item.id === "goldapi")?.mid;
    const divergence = swiss != null && other != null ? Math.abs(swiss - other) : null;
    const price = book?.mid ?? market.spot;
    const agenda = calendarState(Date.now());
    const pipeNow = runPipeline({
      bars: market.bars,
      evals: nextEvals,
      price,
      now: Date.now(),
      divergence,
      eventRisk: agenda.block ? agenda.risk : 0,
      eventNote: agenda.block ? agenda.reason : null,
    });
    const at = Date.now();
    const barTime = market.bars[market.bars.length - 1]?.t ?? 0;
    const confirmed = confirm != null && confirm.barTime === barTime && confirm.side === pipeNow.side;
    const spread = book?.bid != null && book.ask != null ? book.ask - book.bid : null;
    const judged = judgeLanes({
      pipe: pipeNow,
      news: newsLane(at),
      mech: mechanismLane({ spread, latencyMs: book?.latencyMs ?? null, quoteAt: book?.at ?? null, bars: market.bars, now: at }),
      tv: tvLane(hook, secret, pipeNow.side, price, at),
      community: communityLane(alerts, at),
      lastSignalAt: useDesk.getState().signals[0]?.at ?? null,
      now: at,
      confirmed,
    });
    setPipe(pipeNow);
    const released =
      judged.grade === "正式" && pipeNow.side !== "flat" && pipeNow.entry != null && pipeNow.stop != null
        ? [
            {
              id: "pipe",
              name: "总控放行",
              side: pipeNow.side,
              timeframe: "5m" as const,
              hit: true,
              score: 1,
              met: [...pipeNow.why, ...judged.lines].map((label) => ({ label, ok: true })),
              barTime,
              entry: pipeNow.entry,
              stop: pipeNow.stop,
              target: pipeNow.targets[1] ?? pipeNow.targets[0] ?? null,
            },
          ]
        : [];
    const prev = useDesk.getState().signals;
    const next = rollSignals({
      prev,
      evals: released,
      price: market.spot,
      now: Date.now(),
      conflict: released.length === 0,
    });
    if (!sameSignals(prev, next)) useDesk.getState().setSignals(next);
    setEvals(nextEvals);
  }, [hydrated, market, watchOn, indicators, book, hook, secret, confirm, alerts]);

  useEffect(() => {
    if (!hydrated) return;
    if (!seen.current) {
      seen.current = new Set(useDesk.getState().signals.map((item) => item.id));
      return;
    }
    for (const signal of signals) {
      if (seen.current.has(signal.id)) continue;
      seen.current.add(signal.id);
      const plan = `${sideLabel(signal.side)} ${signal.names.join("、")}。入场 ${px(signal.entry)}，止损 ${px(signal.stop)}，出场 ${px(signal.target)}。${signal.why.slice(0, 2).join("。")}`;
      useDesk.getState().push("sentinel", `信号已交给机器人。${plan}`);
    }
  }, [hydrated, signals]);

  useEffect(() => {
    if (!hydrated || dug.current) return;
    const id = window.setTimeout(() => {
      if (dug.current) return;
      dug.current = true;
      void runDig("gold", true);
    }, 3000);
    return () => window.clearTimeout(id);
  }, [hydrated]);

  async function runDig(next: TopicId, silent: boolean) {
    setTopic(next);
    setDigging(true);
    setNote("");
    if (!silent) setTab("mine");
    try {
      const res = await digCommunity({ data: { topic: next } });
      if (!res.ok) {
        setLogs(res.logs ?? []);
        setNote(res.error);
        return;
      }
      setLeads(res.leads);
      const kept = absorb(res.leads);
      const extra = kept ? `本地收进 ${kept} 条草稿，先不武装。` : "这轮源码没能直接落成草稿。";
      setLogs([...(res.logs ?? []), extra]);
    } catch {
      setNote("社区这一会儿没翻开");
    } finally {
      setDigging(false);
    }
  }

  async function refineLead(lead: Lead) {
    setBusy(lead.id);
    setNote("");
    try {
      const res = await refineSource({
        data: {
          text: lead.snippet || lead.url,
          title: lead.title,
          url: lead.url,
          origin: lead.origin,
          mode: "pine",
        },
      });
      if (!res.ok || !res.indicators.length) {
        setNote(res.ok ? "没整理出规则" : res.error);
        setPaste(lead.snippet ? "" : lead.url);
        return;
      }
      useDesk.getState().adopt(res.indicators);
      setNote(res.local ? "模型没接上，已放本地草稿。去指标库看，武装后才盯盘。" : "哨兵改写完了，在指标库。武装之后才参与盯盘。");
      setTab("lib");
    } catch {
      setNote("整理没有完成");
    } finally {
      setBusy(null);
    }
  }

  async function refinePaste(raw?: string) {
    const text = (raw ?? paste).trim();
    if (text.length < 8) {
      setNote("先把 Pine 源码贴进来，不要只贴链接");
      return;
    }
    setBusy("paste");
    try {
      const res = await refineSource({ data: { text, title: "手贴", origin: "note", mode: "pine" } });
      if (!res.ok || !res.indicators.length) {
        setNote(res.ok ? "没整理出规则" : res.error);
        return;
      }
      useDesk.getState().adopt(res.indicators);
      setPaste("");
      setNote(res.local ? "已按关键词入库。可以再点哨兵改写。" : "已整理入库。");
      setTab("lib");
    } catch {
      setNote("整理没有完成");
    } finally {
      setBusy(null);
    }
  }

  const live = signals.find((item) => item.status === "live") ?? null;
  const conflict =
    evals.some((item) => item.hit && item.side === "long") && evals.some((item) => item.hit && item.side === "short");
  const armedCount = indicators.filter((item) => item.armed).length;
  const now = Date.now();
  const spread = book?.bid != null && book.ask != null ? book.ask - book.bid : null;
  const news = newsLane(now);
  const mech = mechanismLane({ spread, latencyMs: book?.latencyMs ?? null, quoteAt: book?.at ?? null, bars: market?.ok ? market.bars : [], now });
  const external = tvLane(hook, secret, pipe?.side ?? "flat", book?.mid ?? null, now);
  const community = communityLane(alerts, now);
  const confirmed = confirm != null && pipe != null && confirm.barTime === barTime && confirm.side === pipe.side;
  const decision = market?.ok
    ? decide(market.bars, book?.mid ?? market.spot, now, {
        spread,
        halt: killed ? "总闸关着" : news.kind === "mute" ? news.note : mech.veto ? mech.reason : null,
        losses: prefs.streak,
        tradesToday: prefs.tradesToday,
      })
    : null;
  const read = market?.ok ? assess(market.bars, book?.mid ?? market.spot, now, spread) : null;
  const judgment = pipe ? judgeLanes({ pipe, news, mech, tv: external, community, lastSignalAt: signals[0]?.at ?? null, now, confirmed }) : null;
  useEffect(() => {
    if (!decision || !market?.ok) return;
    const bar = market.bars[market.bars.length - 1];
    if (!bar) return;
    setNotes((prev) => {
      if (prev[0] && prev[0].at === bar.t && prev[0].grade === decision.grade && prev[0].side === decision.side) return prev;
      const why = [...decision.reasons, ...decision.blocks].slice(0, 4).join("，") || decision.lifeLabel;
      const next = [{ at: bar.t, grade: decision.grade, side: decision.side, score: decision.score, why }, ...prev.filter((item) => item.at !== bar.t)].slice(0, 40);
      localStorage.setItem("jinsao-notes", JSON.stringify(next));
      return next;
    });
  }, [decision, market]);

  return (
    <main className="min-h-dvh bg-ink text-cream">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="font-serif text-xl leading-none text-cream">金哨</p>
            <p className={"mt-1 text-sm tabular-nums " + (book?.mid != null ? "text-gold" : "text-cream-dim")}>
              {book?.mid != null ? px(book.mid) : "正在接报价"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={watchOn}
            onClick={() => useDesk.setState({ watchOn: !watchOn })}
            className="flex h-11 items-center gap-2 rounded-full bg-panel px-3 shadow-panel"
          >
            <span className={"size-2 rounded-full " + (watchOn ? "live-dot bg-gold" : "bg-cream-dim")} />
            <span className="text-sm">{watchOn ? "值班中" : "已歇哨"}</span>
          </button>
        </div>
      </header>
      <LiveTrade price={book?.mid ?? (market?.ok ? market.spot : null)} />

      <div className="mx-auto grid max-w-5xl gap-4 px-4 pt-4 pb-28 lg:grid-cols-5">
        {tab === "command" ? (
          <div className="lg:col-span-5">
            <CommandDeck pipe={pipe} book={book} ticks={ticks} />
          </div>
        ) : tab === "study" ? (
          <div className="lg:col-span-5">
            <StudyBoard report={study} error={studyError} busy={studyBusy} onAgain={() => void restudy()} />
          </div>
        ) : tab === "macro" ? (
          <div className="lg:col-span-5">
            <ConfluenceBoard bars={market?.ok ? market.bars : []} price={book?.mid ?? (market?.ok ? market.spot : null)} study={study} />
          </div>
        ) : tab === "replay" ? (
          <div className="lg:col-span-5">
            <BacktestBoard bars={market?.ok ? market.bars : []} />
          </div>
        ) : tab === "setup" ? (
          <div className="lg:col-span-5">
            <SetupBoard onOpen={setTab} />
          </div>
        ) : tab === "terminal" ? (
          <div className="lg:col-span-5">
            <TerminalView
              bars={market?.ok ? market.bars : []}
              decision={decision}
              read={read}
              notes={notes}
              busy={busy === "ask"}
              reply={review}
              onAsk={async (questionText) => {
                setBusy("ask");
                try {
                  const res = await askSentinel({ data: { question: questionText.slice(0, 400), tape: tapeOf(market, evals, live, decision) } });
                  setReview(res.ok ? res.text : res.error);
                } catch {
                  setReview("复盘没有送出去");
                } finally {
                  setBusy(null);
                }
              }}
            />
          </div>
        ) : (
          <>
        <section className="space-y-4 lg:col-span-3">
          {tab === "watch" ? <HomeBoard price={book?.mid ?? null} decision={decision} evals={evals} /> : null}
          {tab === "watch" ? <HedgeCard /> : null}
          <DecisionBoard
            decision={decision}
            price={book?.mid ?? null}
            change={
              book?.mid != null && market?.ok
                ? book.mid - (market.bars[Math.max(0, market.bars.length - 288)]?.c ?? book.mid)
                : null
            }
            read={read}
          />
          {!embed ? <ShareCard /> : null}
          {!embed ? <InstallBar /> : null}
          {judgment ? (
            <MonitorBoard
              book={book}
              news={news}
              mech={mech}
              tv={external}
              judgment={judgment}
              pipe={pipe}
              onConfirm={
                pipe && pipe.side !== "flat" && pipe.entry != null
                  ? () => setConfirm({ barTime, side: pipe.side as Side })
                  : undefined
              }
            />
          ) : null}
          <TapeChart
            bars={market?.ok ? market.bars : []}
            book={book}
            ticks={ticks}
            indicators={indicators.filter((item) => item.armed)}
            absorbing={busy === "paste"}
            onAbsorb={(text) => void refinePaste(text)}
            zone={decision?.plan ? { entryLow: decision.plan.entryLow, entryHigh: decision.plan.entryHigh, stop: decision.plan.stop, tp1: decision.plan.tp1 } : null}
          />
          <p className="text-xs leading-5 text-cream-dim">
            {market?.ok ? "现货锚定。图是 TradingView 的，只负责看" : market?.error ?? "K 线还在接"}。正式信号仍走闸门。消息面和机制只能否决或降级，TradingView 告警只做确认。
          </p>
          <GateLine pipe={pipe} />
          {market?.ok ? <CatPanel bars={market.bars} /> : null}
          {market?.ok && conflict ? (
            <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cinnabar shadow-panel">多空同时亮，机器人先按兵，不把两张单叠在一起。</p>
          ) : market?.ok && live ? (
            <OrderCard signal={live} busy={busy === live.id} onJudge={() => void judge(live, setBusy)} />
          ) : market?.ok ? (
            <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cream-dim shadow-panel">
              {armedCount ? "闸门还没放行。指标亮了也不等于能进。" : "还没有武装的指标。去指标库打开几条。"}
            </p>
          ) : null}
        </section>

        <section className="lg:col-span-2">
          {tab === "watch" && <Watch evals={evals} signals={signals} armed={armedCount} advice={study?.advice ?? ""} onStudy={() => setTab("study")} />}
          {tab === "flow" && <OrderFlow bars={market?.ok ? market.bars : []} />}
          {tab === "arch" && <GraphBoard bars={market?.ok ? market.bars : []} />}
          {tab === "link" && (
            <div className="space-y-3">
              <HookBox
                secret={secret}
                hook={hook}
                note={hookNote}
                onSave={(nextSecret, nextHook, nextNote) => {
                  const script = nextHook ? matchScript(nextHook.name) : null;
                  const nextAlerts = script
                    ? [{ scriptId: script.id, side: nextHook!.side, at: nextHook!.at, price: nextHook!.price }, ...alerts.filter((item) => item.scriptId !== script.id)].slice(0, 12)
                    : alerts;
                  const note = nextHook && !script && nextNote.includes("收下了") ? `${nextNote} 名字没对上社区脚本，只当一条无名告警。` : nextNote;
                  setSecret(nextSecret);
                  setHook(nextHook);
                  setAlerts(nextAlerts);
                  setHookNote(note);
                  localStorage.setItem("jinsao-tv", JSON.stringify({ secret: nextSecret, hook: nextHook, alerts: nextAlerts }));
                }}
              />
              <LinkBoard sources={book?.sources} />
            </div>
          )}
          {tab === "mine" && <CommunityBoard />}
          {tab === "dig" && (
            <Mine
              topic={topic}
              leads={leads}
              logs={logs}
              digging={digging}
              paste={paste}
              busy={busy}
              note={note}
              onTopic={(id) => void runDig(id, false)}
              onPaste={setPaste}
              onRefineLead={(lead) => void refineLead(lead)}
              onRefinePaste={() => void refinePaste()}
            />
          )}
          {tab === "lib" && <LibraryView busy={busy} setBusy={setBusy} note={note} />}
          {tab === "lab" && (
            <Lab
              bars={market?.ok ? market.bars : []}
              decision={decision}
              price={book?.mid ?? null}
              killed={killed}
              onKill={(next) => {
                setKilled(next);
                localStorage.setItem("jinsao-kill", next ? "1" : "0");
              }}
              prefs={prefs}
              onPrefs={(next) => {
                setPrefs(next);
                localStorage.setItem("jinsao-prefs", JSON.stringify(next));
              }}
              onResult={(kind) => {
                setPrefs((prev) => {
                  const next = { ...prev, tradesToday: prev.tradesToday + 1, streak: kind === "loss" ? prev.streak + 1 : 0 };
                  localStorage.setItem("jinsao-prefs", JSON.stringify(next));
                  return next;
                });
              }}
            />
          )}
          {tab === "judge" && (
            <Judge
              messages={messages}
              question={question}
              setQuestion={setQuestion}
              busy={busy === "ask"}
              tape={tapeOf(market, evals, live, decision)}
              onAsk={async () => {
                const q = question.trim();
                if (q.length < 2) return;
                useDesk.getState().push("user", q);
                setQuestion("");
                setBusy("ask");
                try {
                  const res = await askSentinel({ data: { question: q, tape: tapeOf(market, evals, live, decision) } });
                  useDesk.getState().push("sentinel", res.ok ? res.text : res.error);
                } catch {
                  useDesk.getState().push("sentinel", "这一问没有送出去");
                } finally {
                  setBusy(null);
                }
              }}
            />
          )}
        </section>
          </>
        )}
      </div>

      <nav className="safe-nav fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 px-2 pt-1 backdrop-blur">
        <div className="nav-scroll mx-auto flex max-w-5xl gap-1 overflow-x-auto">
          <TabButton id="watch" tab={tab} setTab={setTab} icon={<Radio className="size-5" />} label="仪表盘" />
          <TabButton id="lib" tab={tab} setTab={setTab} icon={<Library className="size-5" />} label="指标库" />
          <TabButton id="mine" tab={tab} setTab={setTab} icon={<Search className="size-5" />} label="社区" />
          <TabButton id="replay" tab={tab} setTab={setTab} icon={<BookOpen className="size-5" />} label="回测" />
          <TabButton id="setup" tab={tab} setTab={setTab} icon={<Shield className="size-5" />} label="设置" />
        </div>
      </nav>
    </main>
  );
}

function tapeOf(market: Awaited<ReturnType<typeof fetchMarket>> | null, evals: EvalHit[], live: Signal | null, decision: Decision | null): string {
  const price = market?.ok ? `现货 ${px(market.spot)}，${market.basisNote}` : "行情未知";
  const rows = evals
    .map((item) => `${item.name} ${sideLabel(item.side)} ${item.hit ? "命中" : `${Math.round(item.score * 100)}%`} ${item.met.map((m) => `${m.label}${m.ok ? "成" : "否"}`).join(" ")}`)
    .join("\n");
  const order = live ? `在途指令 ${sideLabel(live.side)} 入${px(live.entry)} 止${px(live.stop)} 出${px(live.target)}` : "没有在途指令";
  const call = decision
    ? `判断 ${decision.grade} ${decision.score}。依据 ${decision.reasons.join("，") || "无"}。不做 ${decision.blocks.join("，") || "无"}。`
    : "判断还没有";
  return `${price}\n${order}\n${call}\n${rows}`.slice(0, 1500);
}

async function judge(signal: Signal, setBusy: (id: string | null) => void) {
  setBusy(signal.id);
  try {
    const brief = `${sideLabel(signal.side)} ${signal.names.join("、")}。入场 ${px(signal.entry)}，止损 ${px(signal.stop)}，出场 ${px(signal.target)}，盈亏比 ${signal.rr.toFixed(1)}。理由：${signal.why.join("；")}`;
    const res = await judgeSignal({ data: { brief } });
    if (!res.ok) {
      useDesk.getState().push("sentinel", res.error);
      return;
    }
    useDesk.getState().setAi(signal.id, res.text);
    useDesk.getState().push("sentinel", res.text);
  } catch {
    useDesk.getState().push("sentinel", "研判没有送出去");
  } finally {
    setBusy(null);
  }
}

function TabButton({
  id,
  tab,
  setTab,
  icon,
  label,
}: {
  id: Tab;
  tab: Tab;
  setTab: (tab: Tab) => void;
  icon: ReactNode;
  label: string;
}) {
  const on = tab === id;
  return (
    <button type="button" onClick={() => setTab(id)} className={"flex h-14 w-16 shrink-0 flex-col items-center justify-center gap-1 text-xs " + (on ? "text-gold" : "text-cream-dim")}>
      {icon}
      {label}
    </button>
  );
}

function OrderCard({ signal, busy, onJudge }: { signal: Signal; busy: boolean; onJudge: () => void }) {
  return (
    <article className="rounded-2xl bg-panel p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gold">机器人指令</p>
        <p className={"text-sm " + (signal.side === "long" ? "text-gold" : "text-cinnabar")}>{sideLabel(signal.side)}</p>
      </div>
      <h2 className="mt-2 font-serif text-lg text-balance">{signal.names.join(" · ")}</h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat k="入场" v={px(signal.entry)} />
        <Stat k="止损" v={px(signal.stop)} />
        <Stat k="出场" v={px(signal.target)} />
      </dl>
      <p className="mt-3 text-xs leading-5 text-cream-dim">{signal.why.join("。")}</p>
      {signal.ai ? <p className="mt-3 text-sm leading-6 text-cream">{signal.ai}</p> : null}
      <button type="button" disabled={busy} onClick={onJudge} className="mt-3 h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-60">
        {busy ? "哨兵在看" : "请哨兵研判怎么进、怎么出"}
      </button>
    </article>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-ink px-2 py-2">
      <dt className="text-xs text-cream-dim">{k}</dt>
      <dd className="mt-1 text-sm tabular-nums text-cream">{v}</dd>
    </div>
  );
}

function Watch({ evals, signals, armed, advice, onStudy }: { evals: EvalHit[]; signals: Signal[]; armed: number; advice: string; onStudy: () => void }) {
  const sorted = [...evals].sort((a, b) => b.score - a.score);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-cream-dim">
        <CandlestickChart className="size-4 text-gold" />
        在岗 {armed} 条
      </div>
      {advice ? (
        <button type="button" onClick={onStudy} className="w-full rounded-2xl bg-panel px-4 py-3 text-left shadow-panel">
          <p className="text-xs text-gold">研习建议</p>
          <p className="mt-1 text-sm leading-6 text-cream">{advice}</p>
        </button>
      ) : null}
      {sorted.length === 0 ? <p className="text-sm text-cream-dim">{armed ? "行情一到，这几条就开始套。" : "去指标库武装几条，哨兵才盯。"}</p> : null}
      {sorted.map((item) => (
        <article key={item.id} className="rounded-2xl bg-panel p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base">{item.name}</h3>
            <span className={"text-xs " + (item.hit ? "text-gold" : "text-cream-dim")}>{item.hit ? "触发" : "观察"}</span>
          </div>
          <p className="mt-1 text-xs text-cream-dim">
            {sideLabel(item.side)} · {TF_LABEL[item.timeframe]} · {item.met.filter((m) => m.ok).length}/{item.met.length}
          </p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink">
            <div className="h-full bg-gold" style={{ width: `${Math.round(item.score * 100)}%` }} />
          </div>
          <ul className="mt-3 space-y-1">
            {item.met.map((m) => (
              <li key={m.label} className={"text-sm " + (m.ok ? "text-cream" : "text-cream-dim")}>
                {m.ok ? "已满足" : "未满足"} · {m.label}
              </li>
            ))}
          </ul>
        </article>
      ))}
      {signals.slice(0, 6).map((signal) => (
        <p key={signal.id} className="text-xs leading-5 text-cream-dim">
          {fmtClock(signal.at)} {sideLabel(signal.side)} {signal.names.join("、")} · {signal.status === "live" ? "在途" : signal.status === "target" ? "到目标" : "已止损"}
        </p>
      ))}
    </div>
  );
}

function Mine({
  topic,
  leads,
  logs,
  digging,
  paste,
  busy,
  note,
  onTopic,
  onPaste,
  onRefineLead,
  onRefinePaste,
}: {
  topic: TopicId;
  leads: Lead[];
  logs: string[];
  digging: boolean;
  paste: string;
  busy: string | null;
  note: string;
  onTopic: (id: TopicId) => void;
  onPaste: (v: string) => void;
  onRefineLead: (lead: Lead) => void;
  onRefinePaste: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-cream-dim">
        下面是公开、能看规则、不限黄金的社区脚本。它们不推价格。先接三条收盘告警：超级趋势定方向，唐奇安或趋势线做触发，开盘区间只在纽约时段确认。同一根意见不一致就降级。闭源的不收。
      </p>
      <div className="space-y-2">
        {SCRIPTS.map((script) => (
          <article key={script.id} className="rounded-2xl bg-panel px-4 py-3 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm text-cream">{script.name}</h3>
              <span className="text-xs text-gold">{script.first ? "先接" : ROLE_LABEL[script.role]}</span>
            </div>
            <p className="mt-1 text-xs text-cream-dim">{script.author} · {ROLE_LABEL[script.role]}</p>
            <p className="mt-1 text-xs leading-5 text-cream-dim">{script.note}</p>
            <a href={script.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-gold">
              原链接
            </a>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TOPICS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTopic(item.id)}
            className={"h-10 rounded-full px-4 text-sm " + (topic === item.id ? "bg-gold text-ink" : "bg-panel text-cream shadow-panel")}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-panel p-4 shadow-panel">
        <p className="text-xs text-gold">{digging ? "哨兵正在翻社区" : "挖掘记录"}</p>
        <ul className="mt-2 space-y-1">
          {logs.length === 0 ? <li className="text-sm text-cream-dim">还没有记录</li> : null}
          {logs.map((line, index) => (
            <li key={`${index}-${line}`} className="text-sm leading-6 text-cream">
              {line}
            </li>
          ))}
        </ul>
      </div>
      {leads.map((lead) => (
        <article key={lead.id} className="rounded-2xl bg-panel p-4 shadow-panel">
          <div className="flex items-center gap-2 text-xs text-cream-dim">
            {lead.origin === "github" ? <Github className="size-4" /> : <CandlestickChart className="size-4" />}
            {lead.origin === "github" ? "GitHub" : "TradingView"}
          </div>
          <h3 className="mt-2 break-words text-base text-balance">{lead.title}</h3>
          <p className="mt-1 text-xs leading-5 text-cream-dim">{lead.blurb}</p>
          {lead.snippet ? (
            <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-xs leading-5 text-cream-dim">{lead.snippet.slice(0, 280)}</pre>
          ) : null}
          <div className="mt-3 flex gap-2">
            <a href={lead.url} target="_blank" rel="noreferrer" className="flex h-11 flex-1 items-center justify-center rounded-full bg-ink text-sm text-cream">
              打开
            </a>
            <button
              type="button"
              disabled={busy === lead.id || !lead.snippet}
              onClick={() => onRefineLead(lead)}
              className="h-11 flex-1 rounded-full bg-gold text-sm text-ink disabled:opacity-60"
            >
              {busy === lead.id ? "改写中" : lead.snippet ? "改写运用" : "源码未公开"}
            </button>
          </div>
        </article>
      ))}
      <label className="block rounded-2xl bg-panel p-4 shadow-panel">
        <span className="text-sm">粘贴 Pine 源码</span>
        <textarea
          value={paste}
          onChange={(e) => onPaste(e.target.value)}
          rows={8}
          spellCheck={false}
          className="mt-3 w-full resize-none rounded-xl border border-line bg-ink px-3 py-3 font-mono text-xs text-cream outline-none"
          placeholder={"//@version=5\nindicator(\"黄金\", overlay=true)\n// 从 TradingView 编辑器整段复制"}
        />
        <button type="button" disabled={busy === "paste"} onClick={onRefinePaste} className="mt-3 h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-60">
          {busy === "paste" ? "改写中" : "改写并入库"}
        </button>
      </label>
      {note ? <p className="text-sm leading-6 text-cinnabar">{note}</p> : null}
    </div>
  );
}

function LibraryView({ busy, setBusy, note }: { busy: string | null; setBusy: (id: string | null) => void; note: string }) {
  const indicators = useDesk((s) => s.indicators);
  const [q, setQ] = useState("");
  const query = q.trim();
  const shown = indicators.filter((ind) => {
    if (!query) return true;
    const blob = `${ind.name} ${ind.thesis} ${ind.timeframe} ${ind.side}`.toLowerCase();
    return blob.includes(query.toLowerCase());
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-cream-dim">武装之后才参与盯盘。种子和社区草稿都在这台设备上。</p>
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜名称、周期、多空" className="h-11 w-full rounded-full border border-line bg-ink px-4 text-sm text-cream outline-none" />
      {note ? <p className="text-sm text-gold">{note}</p> : null}
      {shown.length ? shown.map((ind) => (
        <IndicatorCard key={ind.id} ind={ind} busy={busy === ind.id} setBusy={setBusy} />
      )) : <p className="text-sm text-cream-dim">没有对上的指标。</p>}
    </div>
  );
}

function IndicatorCard({ ind, busy, setBusy }: { ind: Indicator; busy: boolean; setBusy: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(ind);
  useEffect(() => setDraft(ind), [ind]);

  async function rewrite() {
    setBusy(ind.id);
    try {
      const payload = JSON.stringify({
        name: ind.name,
        thesis: ind.thesis,
        side: ind.side,
        timeframe: ind.timeframe,
        logic: ind.logic,
        conditions: ind.conditions.map(({ label, left, op, right }) => ({ label, left, op, right })),
        exit: ind.exit,
      });
      const res = await refineSource({
        data: {
          text: payload,
          title: ind.name,
          url: ind.sourceUrl ?? "",
          origin: ind.source === "tradingview" || ind.source === "github" ? ind.source : "note",
          mode: "optimize",
        },
      });
      if (res.ok && res.indicators[0]) {
        useDesk.getState().saveEdits({ ...res.indicators[0], id: ind.id, armed: ind.armed, source: ind.source, sourceUrl: ind.sourceUrl });
      }
    } catch {
      /* 改写失败就留着原规则 */
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-2xl bg-panel p-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base">{ind.name}</h3>
          <p className="mt-1 text-xs text-cream-dim">
            {sideLabel(ind.side)} · {TF_LABEL[ind.timeframe]} · {ind.source === "github" ? "GitHub" : ind.source === "tradingview" ? "TradingView" : ind.source === "seed" ? "哨所" : "手贴"} · {new Date(ind.updatedAt).toLocaleDateString("zh-CN")}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={ind.armed} onClick={() => useDesk.getState().toggle(ind.id)} className={"h-11 shrink-0 rounded-full px-4 text-sm " + (ind.armed ? "bg-gold text-ink" : "bg-ink text-cream")}>
          {ind.armed ? "在岗" : "武装"}
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-cream-dim">{ind.thesis}</p>
      <ul className="mt-3 space-y-1">
        {ind.conditions.map((c) => (
          <li key={c.id} className="text-sm text-cream">
            {c.label} · {opText(c.left)} {OP_LABEL[c.op]} {opText(c.right)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs tabular-nums text-cream-dim">
        止损 {ind.exit.stopAtrMult} ATR · 目标 {ind.exit.targetR} R
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="h-11 flex-1 rounded-full bg-ink text-sm">
          {open ? "收起" : "编辑"}
        </button>
        <button type="button" disabled={busy} onClick={() => void rewrite()} className="h-11 flex-1 rounded-full bg-ink text-sm text-gold disabled:opacity-60">
          {busy ? "改写中" : "哨兵改写"}
        </button>
      </div>
      {open ? (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-cream-dim">
            名称
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 16) })} className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-base text-cream" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-cream-dim">
              方向
              <select value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value === "short" ? "short" : "long" })} className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-2 text-base text-cream">
                <option value="long">做多</option>
                <option value="short">做空</option>
              </select>
            </label>
            <label className="text-xs text-cream-dim">
              周期
              <select
                value={draft.timeframe}
                onChange={(e) => setDraft({ ...draft, timeframe: e.target.value === "5m" || e.target.value === "1h" ? e.target.value : "15m" })}
                className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-2 text-base text-cream"
              >
                <option value="5m">5分</option>
                <option value="15m">15分</option>
                <option value="1h">1小时</option>
              </select>
            </label>
          </div>
          {draft.conditions.map((cond, index) => (
            <div key={cond.id} className="space-y-2 rounded-xl bg-ink p-3">
              <OperandField label="左" value={cond.left} onChange={(left) => {
                const conditions = draft.conditions.slice();
                conditions[index] = { ...cond, left };
                setDraft({ ...draft, conditions });
              }} />
              <select
                value={cond.op}
                onChange={(e) => {
                  const conditions = draft.conditions.slice();
                  conditions[index] = { ...cond, op: e.target.value as typeof cond.op };
                  setDraft({ ...draft, conditions });
                }}
                className="h-11 w-full rounded-xl border border-line bg-panel px-2 text-base"
              >
                {Object.entries(OP_LABEL).map(([op, label]) => (
                  <option key={op} value={op}>{label}</option>
                ))}
              </select>
              <OperandField label="右" value={cond.right} onChange={(right) => {
                const conditions = draft.conditions.slice();
                conditions[index] = { ...cond, right };
                setDraft({ ...draft, conditions });
              }} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-cream-dim">
              止损 ATR
              <input type="number" step="0.1" value={draft.exit.stopAtrMult} onChange={(e) => setDraft({ ...draft, exit: { ...draft.exit, stopAtrMult: Number(e.target.value) } })} className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-base" />
            </label>
            <label className="text-xs text-cream-dim">
              目标 R
              <input type="number" step="0.1" value={draft.exit.targetR} onChange={(e) => setDraft({ ...draft, exit: { ...draft.exit, targetR: Number(e.target.value) } })} className="mt-1 h-11 w-full rounded-xl border border-line bg-ink px-3 text-base" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => useDesk.getState().saveEdits(draft)} className="h-11 flex-1 rounded-full bg-gold text-sm text-ink">
              保存修改
            </button>
            <button type="button" onClick={() => useDesk.getState().remove(ind.id)} className="h-11 flex-1 rounded-full bg-ink text-sm text-cinnabar">
              移出库
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function OperandField({ label, value, onChange }: { label: string; value: Operand; onChange: (op: Operand) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-xs text-cream-dim">{label}</span>
      <select
        value={value.type}
        onChange={(e) => onChange(operandWithType(e.target.value as Operand["type"]))}
        className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-panel px-2 text-base"
      >
        {OPERANDS.map((item) => (
          <option key={item.type} value={item.type}>{item.label}</option>
        ))}
      </select>
      {operandNeedsLength(value) ? (
        <input
          type="number"
          value={value.length}
          onChange={(e) => onChange({ ...value, length: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
          className="h-11 w-20 rounded-xl border border-line bg-panel px-2 text-base tabular-nums"
        />
      ) : null}
      {value.type === "const" ? (
        <input
          type="number"
          value={value.value}
          step="0.1"
          onChange={(e) => onChange({ type: "const", value: Number(e.target.value) })}
          className="h-11 w-24 rounded-xl border border-line bg-panel px-2 text-base tabular-nums"
        />
      ) : null}
    </div>
  );
}

function Judge({
  messages,
  question,
  setQuestion,
  busy,
  tape,
  onAsk,
}: {
  messages: { id: string; role: "user" | "sentinel"; text: string }[];
  question: string;
  setQuestion: (v: string) => void;
  busy: boolean;
  tape: string;
  onAsk: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-cream-dim">问现在该不该进。哨兵只根据旁边这张盘面和在岗指标回答，不会自己编新闻。</p>
      <div className="space-y-2">
        {messages.length === 0 ? <p className="rounded-2xl bg-panel px-4 py-3 text-sm text-cream-dim shadow-panel">信号出来时，会先记在这里。你也可以直接问。</p> : null}
        {messages.map((msg) => (
          <p key={msg.id} className={"rounded-2xl px-4 py-3 text-sm leading-6 shadow-panel " + (msg.role === "user" ? "bg-ink text-cream" : "bg-panel text-cream")}>
            {msg.text}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {["现在该不该进？", "出场看哪里？", "为什么还没信号？"].map((q) => (
          <button key={q} type="button" onClick={() => setQuestion(q)} className="h-10 rounded-full bg-panel px-3 text-sm text-cream shadow-panel">
            {q}
          </button>
        ))}
      </div>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-line bg-panel px-3 py-3 text-base outline-none" placeholder="问哨兵" />
      <button type="button" disabled={busy || question.trim().length < 2} onClick={onAsk} className="h-11 w-full rounded-full bg-gold text-sm text-ink disabled:opacity-60">
        {busy ? "在看盘" : "发送"}
      </button>
      <p className="sr-only">{tape}</p>
    </div>
  );
}
