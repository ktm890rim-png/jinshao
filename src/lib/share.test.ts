import assert from "node:assert/strict";
import test from "node:test";
import { isPreviewHost, shareTarget } from "./share.ts";

test("preview hosts are not a link you can send", () => {
  assert.equal(isPreviewHost("localhost"), true);
  assert.equal(isPreviewHost("abc.grok-sandbox.com"), true);
  assert.equal(shareTarget("https://abc.grok-sandbox.com", "abc.grok-sandbox.com").kind, "preview");
});

test("a published host can be copied and embedded", () => {
  const target = shareTarget("https://jinshao.grok.me", "jinshao.grok.me");
  assert.equal(target.kind, "public");
  if (target.kind !== "public") return;
  assert.equal(target.url, "https://jinshao.grok.me/");
  assert.match(target.embed, /embed=1/);
});
