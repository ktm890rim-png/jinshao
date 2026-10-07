import assert from "node:assert/strict";
import test from "node:test";
import { nearestZone, replayRule, reviewNotes } from "./playbook.ts";
import type { Bar } from "./indicators/types.ts";

test("only the nearest fresh demand is kept", () => {
  const bars: Bar[] = [];
  for (let i = 0; i < 12; i++) bars.push({ t: i, o: 100, h: 101, l: 99, c: 100 });
  bars.push({ t: 12, o: 100, h: 100.4, l: 98, c: 98.4 });
  bars.push({ t: 13, o: 98.6, h: 102, l: 98.5, c: 101.5 });
  bars.push({ t: 14, o: 101.4, h: 103, l: 101, c: 102.6 });
  bars.push({ t: 15, o: 102.5, h: 104, l: 102.2, c: 103.4 });
  for (let i = 16; i < 22; i++) bars.push({ t: i, o: 103, h: 104, l: 102.5, c: 103.2 });
  const zone = nearestZone(bars, 103);
  assert.ok(zone);
  assert.equal(zone?.kind, "demand");
});

test("a rule with no matching trades says so", () => {
  const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({ t: i * 300_000, o: 100, h: 101, l: 99, c: 100 }));
  const out = replayRule(bars, { side: "long", sweep: true, volume: true });
  assert.match(out.text, /没有|不够/);
});

test("review waits until there is a record", () => {
  assert.match(reviewNotes([{ at: 1, grade: "NO", side: "flat", score: 10, why: "不够" }]), /不到 3/);
  const text = reviewNotes([
    { at: 1, grade: "NO", side: "flat", score: 10, why: "a" },
    { at: 2, grade: "NO", side: "flat", score: 12, why: "b" },
    { at: 3, grade: "NO", side: "long", score: 20, why: "c" },
    { at: 4, grade: "A", side: "short", score: 80, why: "d" },
  ]);
  assert.match(text, /按兵/);
});
