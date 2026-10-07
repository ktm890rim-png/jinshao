import assert from "node:assert/strict";
import test from "node:test";
import { WEEK } from "./calendar.ts";
import { judgeLanes, mechanismLane, newsLane, parseHook, tvLane, type TvHook } from "./lanes.ts";
import type { Pipeline } from "./pipeline.ts";

const fomc = WEEK.find((item) => item.id === "fomc");
if (!fomc) throw new Error("missing fomc");

test("calendar mute and downgrade never invent a direction", () => {
  assert.equal(newsLane(fomc.at).kind, "mute");
  assert.equal(newsLane(fomc.at - 10 * 60_000).kind, "mute");
  assert.equal(newsLane(fomc.at - 16 * 60_000).kind, "downgrade");
  assert.equal(newsLane(fomc.at + 6 * 60_000).kind, "downgrade");
  assert.equal(newsLane(fomc.at + 21 * 60_000).kind, "abstain");
  assert.equal(newsLane(fomc.at - 61 * 60_000).kind, "abstain");
  assert.equal("side" in newsLane(fomc.at), false);
});

test("wide spread vetoes, missing spread does not", () => {
  const open = mechanismLane({ spread: 0.4, latencyMs: 200, quoteAt: 1_000, bars: flatBars(), now: 1_500 });
  assert.equal(open.veto, false);
  const wide = mechanismLane({ spread: 2, latencyMs: 200, quoteAt: 1_000, bars: flatBars(), now: 1_500 });
  assert.equal(wide.veto, true);
  assert.match(wide.reason, /点差/);
  const missing = mechanismLane({ spread: null, latencyMs: null, quoteAt: null, bars: [], now: 0 });
  assert.equal(missing.veto, false);
});

test("webhook cannot open a trade and a bad secret is dropped", () => {
  const hook: TvHook = { secret: "right", name: "超趋势", interval: "5", side: "long", price: 4140, at: 10_000 };
  const quiet = tvLane(hook, "right", "flat", 4140, 10_000);
  assert.equal(quiet.role, "abstain");
  const dropped = tvLane(hook, "wrong", "long", 4140, 10_000);
  assert.equal(dropped.role, "abstain");
  assert.match(dropped.note, /丢掉/);
  const against = tvLane(hook, "right", "short", 4140.2, 10_000);
  assert.equal(against.role, "conflict");
  assert.equal(parseHook("{", 0).ok, false);
  const bad = parseHook(JSON.stringify({ secret: "right", name: "超趋势" }), 0);
  assert.equal(bad.ok, false);
});

test("rules can only draft until a person confirms", () => {
  const pipe = fakePipe();
  const news = newsLane(fomc.at + 3 * 60 * 60_000);
  const mech = mechanismLane({ spread: 0.3, latencyMs: 100, quoteAt: fomc.at, bars: flatBars(), now: fomc.at });
  const tv = tvLane(null, "", "long", 4140, fomc.at);
  const draft = judgeLanes({ pipe, news, mech, tv, lastSignalAt: null, now: fomc.at + 3 * 60 * 60_000 });
  assert.equal(draft.grade, "预备");
  assert.equal(draft.missing, "人工确认");
  const released = judgeLanes({ pipe, news, mech, tv, lastSignalAt: null, now: fomc.at + 3 * 60 * 60_000, confirmed: true });
  assert.equal(released.grade, "正式");
});

test("a delivered long becomes prep when the calendar is mute, and nothing when spread fails", () => {
  const pipe = fakePipe();
  const news = newsLane(fomc.at);
  const mech = mechanismLane({ spread: 0.3, latencyMs: 100, quoteAt: fomc.at, bars: flatBars(), now: fomc.at });
  const tv = tvLane(null, "", "long", 4140, fomc.at);
  const muted = judgeLanes({ pipe, news, mech, tv, lastSignalAt: null, now: fomc.at });
  assert.equal(muted.grade, "预备");
  assert.equal(muted.state, "静音");
  assert.equal(pipe.side, "long");

  const wide = mechanismLane({ spread: 3, latencyMs: 100, quoteAt: fomc.at, bars: flatBars(), now: fomc.at });
  const vetoed = judgeLanes({ pipe, news: newsLane(fomc.at + 3 * 60 * 60_000), mech: wide, tv, lastSignalAt: null, now: fomc.at + 3 * 60 * 60_000 });
  assert.equal(vetoed.grade, "无");
});

function fakePipe(): Pipeline {
  return {
    phase: "交付",
    loop: "core",
    verdict: "deliver",
    side: "long",
    entry: 4140,
    stop: 4130,
    targets: [4150, 4160, 4170],
    why: ["价在均线之上"],
    work: 80,
    seats: [
      { id: "data", name: "数据", role: "", score: 1, note: "", live: false },
      { id: "facts", name: "实事", role: "", score: 0.8, note: "", live: true },
      { id: "face", name: "呈现", role: "", score: 0.9, note: "", live: true },
    ],
  };
}

function flatBars() {
  return Array.from({ length: 20 }, (_, i) => ({ t: i * 300_000, o: 100, h: 100.4, l: 99.8, c: 100.1 }));
}
