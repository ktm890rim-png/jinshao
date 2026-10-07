import assert from "node:assert/strict";
import test from "node:test";
import type { Bar } from "./indicators/types.ts";
import { DEFAULT_PLAN, m1Scalp, readWords, trailLock } from "./m1-scalp.ts";

function flat(n: number, price: number, volume = 100): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    t: 1_700_000_000_000 + i * 60_000,
    o: price,
    h: price + 0.15,
    l: price - 0.15,
    c: price,
    v: volume,
  }));
}

test("an uptrend continuation buys as trend, not as a reversal", () => {
  const bars: Bar[] = Array.from({ length: 80 }, (_, i) => {
    const price = 4100 + i * 0.12;
    return { t: 1_700_000_000_000 + i * 60_000, o: price - 0.06, h: price + 0.04, l: price - 0.1, c: price, v: 100 };
  });
  const call = m1Scalp(bars, bars[bars.length - 1].t + 120_000);
  assert.equal(call.side, "buy");
  assert.equal(call.reasons[0], "顺势");
});

test("a sweep back through the prior low is a reversal buy", () => {
  const bars = flat(80, 4120);
  const t0 = bars[bars.length - 1].t;
  bars.push({ t: t0 + 60_000, o: 4119.85, h: 4120.15, l: 4118.9, c: 4120.05, v: 240 });
  const call = m1Scalp(bars, bars[bars.length - 1].t + 120_000);
  assert.equal(call.side, "buy");
  assert.equal(call.reasons[0], "反转");
});

test("a downtrend close sells", () => {
  const bars: Bar[] = Array.from({ length: 80 }, (_, i) => {
    const price = 4200 - i * 0.2;
    return { t: 1_700_000_000_000 + i * 60_000, o: price + 0.08, h: price + 0.12, l: price - 0.06, c: price, v: 100 };
  });
  const call = m1Scalp(bars, bars[bars.length - 1].t + 120_000);
  assert.equal(call.side, "sell");
});

test("profit of 0.3 locks breakeven and every extra 0.2 steps the stop", () => {
  assert.equal(trailLock(0.29), null);
  assert.equal(trailLock(0.3), 0);
  assert.equal(trailLock(0.49), 0);
  assert.equal(trailLock(0.5), 0.2);
  assert.equal(trailLock(0.7), 0.4);
});
test("spoken rules become the saved plan", () => {
  const heard = readWords("只做顺势。止盈0.4，止损0.3。浮盈到0.25收到成本，之后每0.15往前推。", { ...DEFAULT_PLAN });
  assert.equal(heard.plan.reversal, false);
  assert.equal(heard.plan.trendTp, 0.4);
  assert.equal(heard.plan.trendSl, 0.3);
  assert.equal(heard.plan.trailArm, 0.25);
  assert.equal(heard.plan.trailStep, 0.15);
});

test("a spike-reversal paragraph is saved without a model", () => {
  const heard = readWords("急涨急跌反转。平均波动的1.5倍。平均成交量1.3倍。止损0.40，止盈0.60。浮盈0.25移动成本。", { ...DEFAULT_PLAN });
  assert.equal(heard.plan.style, "spike");
  assert.equal(heard.plan.rangeMult, 1.5);
  assert.equal(heard.plan.volMult, 1.3);
  assert.equal(heard.plan.revSl, 0.4);
  assert.equal(heard.plan.revTp, 0.6);
  assert.equal(heard.plan.trailArm, 0.25);
});

test("a four-condition paragraph sets the trail push", () => {
  const heard = readWords("至少4个条件。EMA8>EMA21。止损0.45，止盈0.70。盈利0.30后保本，之后每盈利0.20移动止损0.10。震荡禁止。暂停20根。连续亏损2单。余额的15%。", { ...DEFAULT_PLAN });
  assert.equal(heard.plan.style, "confirm");
  assert.equal(heard.plan.minHits, 4);
  assert.equal(heard.plan.fast, 8);
  assert.equal(heard.plan.slow, 21);
  assert.equal(heard.plan.trendTp, 0.7);
  assert.equal(heard.plan.trailArm, 0.3);
  assert.equal(heard.plan.trailStep, 0.2);
  assert.equal(heard.plan.trailPush, 0.1);
  assert.equal(heard.plan.pauseBars, 20);
  assert.equal(heard.plan.lossPause, 2);
  assert.equal(heard.plan.chopOff, true);
});
test("a quiet bar stays flat", () => {
  const bars = flat(80, 4100);
  const call = m1Scalp(bars, bars[bars.length - 1].t + 120_000);
  assert.equal(call.side, null);
  assert.ok(call.score < 45);
});
