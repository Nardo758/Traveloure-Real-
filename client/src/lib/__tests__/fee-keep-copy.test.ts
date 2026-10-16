import { test } from "node:test";
import assert from "node:assert/strict";
import { earnKeepSentence, providerKeepLine, platformTakePercent } from "../fee-keep-copy";

const pct = (r: number | string) => ({ rate_type: "percent", default_rate: r });

test("K1: the F3 line is built from the two bands, word for word", () => {
  assert.equal(
    earnKeepSentence(pct(0.15), pct("0.10")),
    "Experts and planners keep 85% of your planning fee (15% beta cohort rate, locked when you join, 30 days' written notice before any change). Providers keep 90% (10%).",
  );
});

test("K2: the numbers follow the band, not a literal", () => {
  assert.equal(providerKeepLine(pct(0.12)), "Providers keep 88% (12%).");
  assert.match(earnKeepSentence(pct(0.2), null)!, /keep 80% of your planning fee \(20% beta/);
});

test("K3: a band with no usable answer gives no sentence", () => {
  for (const bad of [null, undefined, { rate_type: "flat", default_rate: 0.1 }, pct("x"), pct(1.5), pct(-0.1)]) {
    assert.equal(platformTakePercent(bad as any), null);
    assert.equal(providerKeepLine(bad as any), null);
  }
  assert.equal(earnKeepSentence(null, undefined), null);
  assert.equal(earnKeepSentence(null, pct(0.1)), "Providers keep 90% (10%).");
});
