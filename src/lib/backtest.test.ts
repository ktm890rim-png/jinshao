import assert from "node:assert/strict";
import test from "node:test";
import type { Bar } from "./indicators/types.ts";
import { runBacktest, scanFast } from "./backtest.ts";

test("a rising series produces a report with trades", () => {
  const bars: Bar[] = Array.from({ length: 120 }, (_, i) => {
    const price = 4100 + i * 0.2;
    return { t: 1_700_000_000_000 + i * 60_000, o: price - 0.05, h: price + 0.3, l: price - 0.2, c: price };
  });
  const report = runBacktest(bars);
  assert.ok(report.trades > 0);
  assert.ok(report.winRate >= 0 && report.winRate <= 1);
  const rows = scanFast(bars);
  assert.equal(rows.length, 3);
});
