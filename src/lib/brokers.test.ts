import assert from "node:assert/strict";
import test from "node:test";
import { brokerDeskUrl, explainLoginError, flattenBrokers, linkReport, pickHosts } from "./brokers.ts";

test("broker search keeps company and server, not the access addresses", () => {
  const rows = flattenBrokers([
    {
      companyName: "BTGT Mauritius Capital Ltd.",
      results: [{ name: "Bitget-MT5-LIVE1", access: ["1.2.3.4:443"] }],
    },
    { companyName: "", results: [{ name: "Skip" }] },
  ]);
  assert.deepEqual(rows, [{ company: "BTGT Mauritius Capital Ltd.", server: "Bitget-MT5-LIVE1" }]);
  assert.equal(JSON.stringify(rows).includes("1.2.3.4"), false);
});

test("login tries the direct port before the others", () => {
  const hosts = pickHosts(["1.1.1.1:50068", "8.8.8.8:443", "9.9.9.9:1950"]);
  assert.deepEqual(hosts, [
    { host: "8.8.8.8", port: 443 },
    { host: "1.1.1.1", port: 50068 },
  ]);
});

test("Bitget gets its own trading page and the demo terminal is separate", () => {
  assert.equal(brokerDeskUrl("BTGT Mauritius Capital Ltd.", "Bitget-MT5-LIVE2"), "https://www.bitgettradfi.com/tradfi");
  assert.equal(brokerDeskUrl("Doo Technology Singapore Pte. Ltd.", "DooTechnology-Live"), "https://www.dooprime.com");
  const report = linkReport("Bitget-MT5-LIVE2", "254286878");
  assert.equal(report.title, "终端已打开");
});

test("an expired bridge is not reported as a wrong password", () => {
  const text = explainLoginError('{"message":"CloudTrial failed: Trial expired. Please purchase full version. (:442859)","stackTrace":"at Login"}');
  assert.match(text, /试用到期/);
  assert.equal(text.includes("442859"), false);
  assert.equal(text.includes("stackTrace"), false);
});
