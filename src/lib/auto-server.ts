import { createServerFn } from "@tanstack/react-start";
import { CFD_SYMBOLS, loadCfdQuotes, submitCfdClose, submitCfdOrder, type CfdSymbol } from "./cfd";
import { newsLane } from "./lanes";
import { loadM1 } from "./market";
import { cleanPlan, DEFAULT_PLAN, m1Scalp, planSentence, readWords, trailLock, type ScalpPlan } from "./m1-scalp";

export type AutoFill = {
  at: number;
  side: "buy" | "sell";
  entry: number;
  exit: number | null;
  pnl: number | null;
  points: number;
  text: string;
};

type Job = {
  on: boolean;
  key: string;
  secret: string;
  passphrase: string;
  symbol: CfdSymbol;
  held: "buy" | "sell" | null;
  entry: number | null;
  tp: number | null;
  sl: number | null;
  points: number;
  note: string;
  fills: AutoFill[];
  lastAt: number;
  protect: boolean;
  busy: boolean;
  lossStreak: number;
  dayLoss: number;
  day: string;
  pauseUntil: number;
  be: boolean;
  usedBar: number;
  plan: ScalpPlan;
  lossTimes: number[];
  lastSignal: string;
  logs: { at: number; text: string }[];
};

const job: Job = {
  on: false,
  key: "",
  secret: "",
  passphrase: "",
  symbol: "XAUUSD",
  held: null,
  entry: null,
  tp: null,
  sl: null,
  points: 1,
  note: "",
  fills: [],
  lastAt: 0,
  protect: true,
  busy: false,
  lossStreak: 0,
  dayLoss: 0,
  day: "",
  pauseUntil: 0,
  be: false,
  usedBar: 0,
  plan: cleanPlan(DEFAULT_PLAN),
  lossTimes: [],
  lastSignal: "",
  logs: [],
};

let timer: ReturnType<typeof setInterval> | null = null;

export function autoView() {
  return {
    on: job.on,
    symbol: job.symbol,
    held: job.held,
    entry: job.entry,
    tp: job.tp,
    sl: job.sl,
    points: job.points,
    note: job.note,
    fills: job.fills.slice(0, 30),
    protect: job.protect,
    tripped: Date.now() < job.pauseUntil,
    logs: job.logs.slice(0, 8),
  };
}

function remember(text: string) {
  job.note = text;
  job.logs = [{ at: Date.now(), text }, ...job.logs].slice(0, 20);
}

function markLoss(net: number) {
  job.lossStreak += 1;
  job.dayLoss = Number((job.dayLoss + Math.abs(net)).toFixed(2));
  const now = Date.now();
  job.lossTimes = [...job.lossTimes.filter((at) => now - at < 5 * 60_000), now];
  const dayStop = job.plan.dayStop > 0 ? job.plan.dayStop : 3;
  if (job.dayLoss >= dayStop) {
    job.pauseUntil = now + 12 * 60 * 60_000;
    remember(`今天已亏 ${job.dayLoss} 美元，停止开新仓。`);
  } else if (job.lossTimes.length >= 3) {
    job.pauseUntil = now + 30 * 60_000;
    remember("熔断：5 分钟里亏了 3 笔，停 30 分钟。");
  } else if (job.lossStreak >= (job.plan.lossPause > 0 ? job.plan.lossPause : 3)) {
    const bars = job.plan.pauseBars > 0 ? job.plan.pauseBars : 3;
    job.pauseUntil = now + bars * 60_000;
    remember(`连亏 ${job.lossStreak} 笔，停 ${bars} 分钟。`);
  }
}

async function tick() {
  if (!job.on || job.busy || !job.key) return;
  await ensurePlan();
  job.busy = true;
  try {
    const quotes = await loadCfdQuotes();
    const quote = quotes.find((item) => item.symbol === job.symbol);
    const mark = job.held === "sell" ? quote?.ask : quote?.bid;
    if (job.held && job.entry != null && job.tp != null && job.sl != null && mark != null) {
      const favor = job.held === "buy" ? mark - job.entry : job.entry - mark;
      const lock = trailLock(favor, job.plan.trailArm, job.plan.trailStep, job.plan.trailPush > 0 ? job.plan.trailPush : job.plan.trailStep);
      if (lock != null) {
        const next = job.held === "buy" ? job.entry + lock : job.entry - lock;
        const tighter = job.held === "buy" ? next > job.sl : next < job.sl;
        if (tighter) {
          job.sl = next;
          job.be = true;
          job.note = lock === 0 ? `浮盈 ${job.plan.trailArm}，止损收到成本。` : `浮盈 ${favor.toFixed(2)}，止损锁住 ${lock.toFixed(2)}。`;
        }
      }
      const hitTp = job.held === "buy" ? mark >= job.tp : mark <= job.tp;
      const hitSl = job.held === "buy" ? mark <= job.sl : mark >= job.sl;
      if (job.be && hitSl && !hitTp) {
        const closed = await submitCfdClose({ key: job.key, secret: job.secret, passphrase: job.passphrase, symbol: job.symbol });
        if (closed.ok) {
          const net = Number((favor - 0.06).toFixed(2));
          job.fills = [{ at: Date.now(), side: job.held, entry: job.entry, exit: mark, pnl: net, points: 1, text: net > 0 ? "锁利出场" : "回到成本" }, ...job.fills].slice(0, 30);
          job.held = null;
          job.entry = null;
          job.tp = null;
          job.sl = null;
          job.be = false;
          job.protect = false;
          job.lastAt = Date.now();
          if (net < 0) markLoss(net);
          else job.lossStreak = 0;
          if (Date.now() >= job.pauseUntil) remember(net > 0 ? `锁住约 ${net} 美元。` : "回到成本已平，只亏手续费。");
          return;
        }
      }
      if (hitTp || hitSl) {
        const pnl = Number((job.held === "buy" ? mark - job.entry : job.entry - mark).toFixed(2));
        const net = Number((pnl - 0.06).toFixed(2));
        job.fills = [{ at: Date.now(), side: job.held, entry: job.entry, exit: mark, pnl: net, points: job.points, text: hitTp ? "碰到止盈" : "碰到止损" }, ...job.fills].slice(0, 30);
        job.held = null;
        job.entry = null;
        job.tp = null;
        job.sl = null;
        job.be = false;
        job.protect = false;
        job.lastAt = Date.now();
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
        if (job.day !== today) {
          job.day = today;
          job.dayLoss = 0;
          job.lossTimes = [];
        }
        if (net < 0) {
          remember(`止损约 ${net} 美元`);
          markLoss(net);
        } else {
          job.lossStreak = 0;
          remember(`止盈到手约 ${net} 美元`);
        }
        return;
      }
    }
    if (job.held && job.entry == null) {
      job.held = null;
      job.protect = false;
    }
    if (job.held || Date.now() - job.lastAt < 2_000) return;
    if (Date.now() < job.pauseUntil) {
      if (!job.note.includes("熔断") && !job.note.includes("今天已亏")) job.note = "连亏暂停中，先不开。";
      return;
    }
    const news = newsLane(Date.now());
    if (news.kind === "mute") {
      job.note = "重大数据窗口，不开新仓。";
      return;
    }
    if (quote && quote.ask - quote.bid > job.plan.spread) {
      job.note = `点差大于 ${job.plan.spread}，这轮不开。`;
      return;
    }
    const bars = await loadM1();
    if (!bars || !quote) {
      job.note = "M1 这一会儿没接上，自动还开着。";
      return;
    }
    const call = m1Scalp(bars, Date.now(), job.plan);
    const closed = bars.filter((bar) => bar.t + 60_000 <= Date.now());
    const barT = (closed.at(-1) ?? bars.at(-1))?.t ?? 0;
    if (!call.side) {
      job.note = call.wait;
      return;
    }
    if (barT && barT === job.usedBar) {
      job.note = "这根做过了，等下一根。";
      return;
    }
    const creds = { key: job.key, secret: job.secret, passphrase: job.passphrase, symbol: job.symbol };
    const price = call.side === "buy" ? quote.ask : quote.bid;
    const plan = {
      tp: call.tp,
      sl: call.sl,
      takeProfit: (price + (call.side === "buy" ? call.tp : -call.tp)).toFixed(2),
      stopLoss: (price + (call.side === "buy" ? -call.sl : call.sl)).toFixed(2),
    };
    if (call.sl > 0.8) {
      job.note = "单笔止损超过 0.8 美元，这一单不下。";
      return;
    }
    if (job.held) {
      job.note = "已经有一单，不再加仓。";
      return;
    }
    const signalKey = `${call.side}:${barT || price.toFixed(2)}`;
    if (job.lastSignal === signalKey && Date.now() - job.lastAt < 3_000) {
      job.note = "防重：3 秒内同一信号不下第二单。";
      return;
    }
    if (!(Number(plan.stopLoss) > 0) || !(Number(plan.takeProfit) > 0)) {
      job.note = "止损没算出来，这一单不下。";
      return;
    }
    const placed = await submitCfdOrder({ ...creds, side: call.side, takeProfit: plan.takeProfit, stopLoss: plan.stopLoss });
    job.lastAt = Date.now();
    job.lastSignal = signalKey;
    if (!placed.ok) {
      remember(placed.text);
      return;
    }
    if (placed.text.includes("没带")) {
      await submitCfdClose(creds);
      remember("止损没挂上，已把这一单平掉。");
      return;
    }
    job.held = call.side;
    job.entry = price;
    job.tp = Number(plan.takeProfit);
    job.sl = Number(plan.stopLoss);
    job.points = 1;
    job.protect = false;
    job.be = false;
    job.usedBar = barT;
    remember(`${call.reasons.join("·")}，已${call.side === "buy" ? "买入" : "卖出"} 0.01。止盈 ${plan.tp}，止损 ${plan.sl}。浮盈 ${job.plan.trailArm} 收到成本，之后每 ${job.plan.trailStep} 往前推。`);
    job.fills = [{ at: Date.now(), side: call.side, entry: price, exit: null, pnl: null, points: 1, text: "开仓" }, ...job.fills].slice(0, 30);
  } catch {
    job.note = "这一轮没送出去，自动还开着。";
  } finally {
    job.busy = false;
  }
}

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => void tick(), 5000);
}

export const autoStatus = createServerFn({ method: "GET" }).handler(async () => autoView());

export const startAuto = createServerFn({ method: "POST" })
  .validator((input: { key?: string; secret?: string; passphrase?: string; symbol?: string }) => ({
    key: String(input?.key ?? "").trim().slice(0, 128),
    secret: String(input?.secret ?? "").trim().slice(0, 128),
    passphrase: String(input?.passphrase ?? "").trim().slice(0, 64),
    symbol: CFD_SYMBOLS.includes(input?.symbol as CfdSymbol) ? (input?.symbol as CfdSymbol) : "XAUUSD",
  }))
  .handler(async ({ data }) => {
    if (!data.key || !data.secret || !data.passphrase) return { ok: false as const, text: "先填 API。" };
    job.on = true;
    job.key = data.key;
    job.secret = data.secret;
    job.passphrase = data.passphrase;
    job.symbol = data.symbol;
    job.held = null;
    job.entry = null;
    job.protect = false;
    job.note = "自动开着。用的是策略窗口里保存的那一套。";
    ensureTimer();
    return { ok: true as const, text: job.note };
  });

export const stopAuto = createServerFn({ method: "POST" }).handler(async () => {
  job.on = false;
  job.protect = true;
  remember("自动停了。");
  if (timer) clearInterval(timer);
  timer = null;
  return autoView();
});

export const emergencyStop = createServerFn({ method: "POST" }).handler(async () => {
  job.on = false;
  job.protect = true;
  if (timer) clearInterval(timer);
  timer = null;
  if (job.key && job.held) {
    const closed = await submitCfdClose({ key: job.key, secret: job.secret, passphrase: job.passphrase, symbol: job.symbol });
    if (closed.ok) {
      job.held = null;
      job.entry = null;
      job.tp = null;
      job.sl = null;
      job.be = false;
      remember("应急停止。持仓已平，不再开新仓。");
      return autoView();
    }
  }
  remember("应急停止。不再开新仓。");
  return autoView();
});

export const releaseAuto = createServerFn({ method: "POST" }).handler(async () => {
  if (!job.on) return autoView();
  job.protect = false;
  job.held = null;
  job.entry = null;
  job.note = "按新信号继续剥。点差和手续费已经算进止盈。";
  return autoView();
});

let planReady = false;

async function ensurePlan() {
  if (planReady) return;
  try {
    const { readFileSync } = await import("node:fs");
    job.plan = cleanPlan(JSON.parse(readFileSync("data/scalp-strategy.json", "utf8")) as Partial<ScalpPlan>);
  } catch {
    job.plan = cleanPlan(null);
  }
  planReady = true;
}

async function writePlan(plan: ScalpPlan) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync("data", { recursive: true });
  writeFileSync("data/scalp-strategy.json", JSON.stringify(plan));
}

async function previewPlan(plan: ScalpPlan) {
  const bars = await loadM1();
  if (!bars) return "M1 这一会儿没接上，策略已经按你填的存了。";
  const call = m1Scalp(bars, Date.now(), plan);
  if (!call.side) return `当前这根：${call.wait}`;
  return `当前这根会${call.side === "buy" ? "做多" : "做空"}：${call.reasons.join("·")}，止盈 ${call.tp}，止损 ${call.sl}`;
}

export const scalpPlan = createServerFn({ method: "GET" }).handler(async () => {
  await ensurePlan();
  return job.plan;
});

export const saveScalpPlan = createServerFn({ method: "POST" })
  .validator((input: Partial<ScalpPlan> | null) => cleanPlan(input))
  .handler(async ({ data }) => {
    job.plan = data;
    planReady = true;
    try {
      await writePlan(data);
    } catch {
      /* 内存里已经换上，文件写失败也不挡这一轮 */
    }
    const preview = await previewPlan(data);
    return { ok: true as const, plan: data, preview };
  });

export const previewScalpPlan = createServerFn({ method: "POST" })
  .validator((input: Partial<ScalpPlan> | null) => cleanPlan(input))
  .handler(async ({ data }) => ({ preview: await previewPlan(data) }));

export const applyStrategyText = createServerFn({ method: "POST" })
  .validator((input: { text?: string } | null) => ({ text: String(input?.text ?? "").trim().slice(0, 8000) }))
  .handler(async ({ data }) => {
    if (data.text.length < 2) return { ok: false as const, said: "先写你要怎么做。", preview: "", plan: job.plan };
    await ensurePlan();
    const local = readWords(data.text, job.plan);
    let plan = local.plan;
    let said = local.said;
    let fromModel = false;
    const key = process.env.XAI_API_KEY;
    if (!key) {
      said = "模型钥匙没接上，先按能认出的词存了。";
    } else {
      try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "grok-4.5",
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "你把交易者的中文或英文策略改成 JSON，只输出 JSON。格式：{\"said\":\"一句中文，说明你听成了什么、改了哪几条\",\"plan\":{只写要改的字段}}。plan 字段只能是：trend,reversal 布尔；style 为 auto、spike 或 confirm；fast,slow,pull,extend,wick,swing,trendTp,trendSl,runTp,runSl,revTp,revSl,trailArm,trailStep,trailPush,spike,spread,minHits,volMult,rangeMult,closePct,lossPause,pauseBars,dayStop 数字；chopOff 布尔。单位是黄金美元。trailArm=浮盈多少收到成本。trailStep=之后每隔多少推进。trailPush=每次把止损往前推多少，没写就不要填。急涨急跌、插针、扫完收回用 style=spike。要凑够几条条件才做用 style=confirm 和 minHits。只说止盈没分种类，就 trendTp、runTp、revTp 填同一个。原文很长也要把止盈止损、保本、推进读出来。不要发明原文没有的数字。",
              },
              { role: "user", content: `当前策略：${JSON.stringify(job.plan)}\n原文：${data.text}` },
            ],
          }),
          signal: AbortSignal.timeout(18000),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = body.choices?.[0]?.message?.content ?? "";
        const parsed = JSON.parse(content) as { said?: string; plan?: Partial<ScalpPlan> };
        plan = cleanPlan({ ...job.plan, ...(parsed.plan ?? {}) });
        said = String(parsed.said ?? "").trim().slice(0, 280) || planSentence(plan);
        fromModel = true;
      } catch {
        said = "模型这回没读完，先按能认出的词存了。";
      }
    }
    job.plan = plan;
    planReady = true;
    try {
      await writePlan(plan);
    } catch {
      /* 内存里已经换上 */
    }
    return { ok: true as const, said, preview: planSentence(plan), plan, fromModel };
  });



