import assert from "node:assert/strict";
import { evaluate } from "./engine.ts";
import { rollSignals } from "./signals.ts";
import type { Bar, Indicator, Signal } from "./types.ts";

function rising(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = i < 30 ? 100 : 100 + (i - 29) * 2;
    return { t: 1_700_000_000_000 + i * 300_000, o: c - 0.2, h: c + 0.5, l: c - 0.5, c };
  });
}

const base: Indicator = {
  id: "t",
  name: "测",
  thesis: "",
  sourceNote: "",
  source: "seed",
  side: "long",
  timeframe: "5m",
  armed: true,
  logic: "all",
  conditions: [{ id: "c", label: "上", left: { type: "close" }, op: "gt", right: { type: "ema", length: 10 } }],
  exit: { stopAtrMult: 1, atrLength: 14, targetR: 2 },
  updatedAt: 0,
};

const bars = rising(50);
const now = bars[bars.length - 1].t + 300_000;
const hit = evaluate(base, bars, now);
assert.equal(hit.hit, true);
assert.ok(hit.stop != null && hit.stop < hit.entry!);

const crossBars = rising(31);
const cross: Indicator = {
  ...base,
  id: "x",
  conditions: [{ id: "c2", label: "破", left: { type: "close" }, op: "cross_up", right: { type: "highest", length: 8 } }],
};
const crossed = evaluate(cross, crossBars, crossBars[crossBars.length - 1].t + 300_000);
assert.equal(crossed.hit, true);

const later = evaluate(cross, bars, now);
assert.equal(later.hit, false);

const live: Signal = {
  id: "s",
  at: 1,
  barTime: 1,
  side: "long",
  names: ["测"],
  indicatorIds: ["t"],
  entry: 100,
  stop: 99,
  target: 104,
  rr: 4,
  why: ["测"],
  status: "live",
};
const stopped = rollSignals({ prev: [live], evals: [], price: 98, now: 2, conflict: false });
assert.equal(stopped[0].status, "stopped");
const held = rollSignals({
  prev: [live],
  evals: [{ ...hit, id: "t", hit: true }],
  price: 100,
  now: 3,
  conflict: false,
});
assert.equal(held.length, 1);
assert.equal(held[0].status, "live");

console.log("engine ok");
