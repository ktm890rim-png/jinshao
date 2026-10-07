import assert from "node:assert/strict";
import test from "node:test";
import { communityLane, matchScript, type ScriptAlert } from "./community.ts";
import { judgeLanes, mechanismLane, newsLane, tvLane } from "./lanes.ts";
import type { Pipeline } from "./pipeline.ts";

const ny = Date.UTC(2026, 9, 7, 15, 0);
const asia = Date.UTC(2026, 9, 7, 2, 0);

function alert(scriptId: string, side: "long" | "short", at: number): ScriptAlert {
  return { scriptId, side, at, price: 4140 };
}

test("names match the public scripts and unknown names do not", () => {
  assert.equal(matchScript("SuperTrend")?.id, "supertrend");
  assert.equal(matchScript("唐奇安突破")?.id, "donchian");
  assert.equal(matchScript("某个闭源邀请脚本"), null);
});

test("direction and trigger must agree, and the opening range only counts in New York", () => {
  assert.equal(communityLane([alert("supertrend", "long", ny)], ny).role, "abstain");
  assert.equal(communityLane([alert("supertrend", "long", ny), alert("donchian", "short", ny)], ny).role, "conflict");
  assert.equal(communityLane([alert("supertrend", "long", ny), alert("donchian", "long", ny)], ny).role, "confirm");
  assert.equal(communityLane([alert("supertrend", "long", ny), alert("donchian", "long", ny), alert("opening", "short", ny)], ny).role, "conflict");
  assert.equal(communityLane([alert("supertrend", "long", asia), alert("donchian", "long", asia), alert("opening", "short", asia)], asia).role, "confirm");
  assert.equal(communityLane([alert("wavetrend", "short", ny)], ny).role, "abstain");
  assert.equal(communityLane([alert("supertrend", "long", ny), alert("donchian", "long", ny), alert("wavetrend", "short", ny)], ny).role, "conflict");
});

test("a community conflict cannot become a formal signal", () => {
  const pipe: Pipeline = {
    phase: "草稿",
    loop: "core",
    verdict: "deliver",
    side: "long",
    entry: 4140,
    stop: 4130,
    targets: [4150],
    why: ["规则过了"],
    work: 80,
    seats: [
      { id: "data", name: "数据", role: "", score: 1, note: "", live: false },
      { id: "facts", name: "实事", role: "", score: 0.8, note: "", live: true },
      { id: "face", name: "呈现", role: "", score: 0.9, note: "", live: true },
    ],
  };
  const judged = judgeLanes({
    pipe,
    news: newsLane(asia),
    mech: mechanismLane({ spread: 0.3, latencyMs: 80, quoteAt: asia, bars: [], now: asia }),
    tv: tvLane(null, "", "long", 4140, asia),
    community: { role: "conflict", note: "不一致" },
    lastSignalAt: null,
    now: asia,
    confirmed: true,
  });
  assert.equal(judged.grade, "预备");
  assert.notEqual(judged.grade, "正式");
});
