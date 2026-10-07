import assert from "node:assert/strict";
import test from "node:test";
import { judgeHedge } from "./hedge.ts";

test("oil up and gold down is a hedge", () => {
  const read = judgeHedge(-0.4, 0.8);
  assert.equal(read.kind, "hedge");
  assert.match(read.title, /油涨/);
});

test("both up is not a hedge", () => {
  assert.equal(judgeHedge(0.5, 0.9).kind, "together");
});

test("a small wiggle stays quiet", () => {
  assert.equal(judgeHedge(0.05, -0.1).kind, "quiet");
});
