import assert from "node:assert/strict";
import test from "node:test";
import { nextAutoOrder, readCfdError, scalpTargets } from "./cfd.ts";

test("a rejected key is not treated as a placed order", () => {
  const read = readCfdError("40006", "Invalid ACCESS_KEY");
  assert.equal(read.accepted, false);
  assert.match(read.text, /Key 不对/);
});

test("a confident scalp takes two points and a normal one takes one", () => {
  const sure = scalpTargets("buy", 4132.76, "A+");
  const thin = scalpTargets("sell", 4132.76, "A");
  assert.equal(sure?.points, 2);
  assert.equal(sure?.takeProfit, "4134.96");
  assert.equal(sure?.stopLoss, "4131.56");
  assert.equal(thin?.points, 1);
  assert.equal(thin?.takeProfit, "4131.56");
  assert.equal(thin?.stopLoss, "4133.96");
});

test("auto does not add to the side it already holds", () => {
  assert.equal(nextAutoOrder("buy", "long", true, "A+"), null);
  assert.equal(nextAutoOrder("buy", "short", true, "A"), "sell");
  assert.equal(nextAutoOrder(null, "long", true, "B"), null);
  assert.equal(nextAutoOrder(null, "long", false, "A+"), null);
});

test("a parameter error means the key passed and no order was assumed", () => {
  const read = readCfdError("43001", "parameter size required");
  assert.equal(read.accepted, true);
  assert.match(read.text, /没出去/);
  assert.equal(read.text.includes("00000"), false);
});
