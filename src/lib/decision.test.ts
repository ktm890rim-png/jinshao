import assert from "node:assert/strict";
import test from "node:test";
import { decide, riskNotes } from "./decision.ts";
import type { Bar } from "./indicators/types.ts";

test("risk gate blocks a poor payoff and a losing streak", () => {
  const poor = riskNotes({ rr: 1.1, spread: 0.3, stopDist: 2, atr: 2, hot: false, losses: 0, tradesToday: 0 });
  assert.equal(poor.pass, false);
  assert.match(poor.notes.join(" "), /盈亏比/);
  const streak = riskNotes({ rr: 2.1, spread: 0.3, stopDist: 2, atr: 2, hot: false, losses: 3, tradesToday: 1 });
  assert.equal(streak.pass, false);
  assert.match(streak.notes.join(" "), /连亏/);
});

test("without enough bars the desk refuses to call a side", () => {
  const bars: Bar[] = Array.from({ length: 10 }, (_, i) => ({ t: i * 300_000, o: 100, h: 101, l: 99, c: 100 }));
  const call = decide(bars, 100, 10 * 300_000);
  assert.equal(call.grade, "NO");
  assert.equal(call.tradable, false);
  assert.equal(call.side, "flat");
});

test("a rising book can lean long and scalp", () => {
  const bars: Bar[] = Array.from({ length: 160 }, (_, i) => {
    const c = 4000 + i * 0.35;
    return { t: 1_700_000_000_000 + i * 300_000, o: c - 0.2, h: c + 0.4, l: c - 0.5, c, v: 100 };
  });
  const last = bars[bars.length - 1];
  const call = decide(bars, last.c, last.t + 6 * 60_000, { spread: 0.4 });
  assert.notEqual(call.regime, "off");
  assert.equal(call.lifeLabel.includes("禁止"), false);
  if (call.side !== "flat") assert.equal(call.tradable, true);
});
