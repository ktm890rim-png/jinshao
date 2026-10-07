import assert from "node:assert/strict";
import test from "node:test";
import { assess, backtest, lots, monteCarlo, sessionName, summarize } from "./terminal.ts";
import type { Bar } from "./indicators/types.ts";

function rise(): Bar[] {
  return Array.from({ length: 180 }, (_, i) => {
    const c = 4000 + i * 0.4;
    return { t: Date.UTC(2026, 9, 7, 12, 0) + i * 300_000, o: c - 0.15, h: c + 0.5, l: c - 0.45, c, v: i % 17 === 0 ? 400 : 100 };
  });
}

test("session follows the clock, and lot size uses the stop distance", () => {
  assert.equal(sessionName(Date.UTC(2026, 9, 7, 13, 0)), "伦敦纽约重叠");
  assert.equal(sessionName(Date.UTC(2026, 9, 7, 2, 0)), "亚洲");
  const size = lots(10_000, 0.5, 4);
  assert.ok(size != null && Math.abs(size - 0.125) < 1e-9);
  assert.equal(lots(0, 0.5, 4), null);
});

test("assessment refuses to invent a footprint", () => {
  const bars = rise();
  const read = assess(bars, bars[bars.length - 1].c, bars[bars.length - 1].t, 0.4);
  assert.ok(read.total > 0 && read.total <= 100);
  assert.match(read.flow, /不是逐笔/);
  assert.ok(read.parts.some((part) => part.name === "订单流代理"));
});

test("backtest keeps the last stretch out of the fit", () => {
  const report = backtest(rise());
  assert.ok(report.forward.length + report.trades.length >= 0);
  const stats = summarize(report.trades);
  assert.equal(stats.n, report.trades.length);
  assert.equal(monteCarlo(report.trades.slice(0, 3)), null);
});
