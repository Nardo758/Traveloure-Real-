import { test } from "node:test";
import assert from "node:assert/strict";
import { earnKeepSentence, providerKeepLine, providerReviewKeepLine, platformTakePercent } from "../fee-keep-copy";

test("K1: today's resolver rates render the line, without the beta-cohort clause", () => {
  assert.equal(
    earnKeepSentence({ expertPlatformRate: 0.25, providerPlatformRate: 0.1 }),
    "Experts and planners keep 75% of your planning fee. Providers keep 90% (10%).",
  );
  assert.doesNotMatch(earnKeepSentence({ expertPlatformRate: 0.15, providerPlatformRate: 0.1 })!, /cohort|locked|notice/);
});

test("K2: the numbers follow the resolver, not a literal", () => {
  assert.equal(providerKeepLine({ providerPlatformRate: 0.12 }), "Providers keep 88% (12%).");
  assert.equal(earnKeepSentence({ expertPlatformRate: 0.15 }), "Experts and planners keep 85% of your planning fee.");
});

test("K3: a rate with no usable answer gives no sentence for its half", () => {
  for (const bad of [null, undefined, "", "x", 1, 1.5, -0.1]) {
    assert.equal(platformTakePercent(bad as any), null);
    assert.equal(providerKeepLine({ providerPlatformRate: bad as any }), null);
  }
  assert.equal(earnKeepSentence(null), null);
  assert.equal(earnKeepSentence({ expertPlatformRate: null, providerPlatformRate: 0.1 }), "Providers keep 90% (10%).");
});

test("K4 (FE-2): a cohort rate carries the F3 clause, with the server's notice days", () => {
  assert.equal(
    earnKeepSentence({ expertPlatformRate: 0.15, providerPlatformRate: 0.1, expertCohort: { label: "beta", noticeDays: 30 } }),
    "Experts and planners keep 85% of your planning fee: beta cohort rate, locked when you join, 30 days' written notice before any change. Providers keep 90% (10%).",
  );
  // No notice days from the server: the notice clause is left out, never a typed number.
  assert.equal(
    earnKeepSentence({ expertPlatformRate: 0.15, expertCohort: { label: "beta", noticeDays: null } }),
    "Experts and planners keep 85% of your planning fee: beta cohort rate, locked when you join.",
  );
  // A cohort with no rate still gives no sentence.
  assert.equal(earnKeepSentence({ expertPlatformRate: null, expertCohort: { label: "beta", noticeDays: 30 } }), null);
});

test("K5 (S-21): the provider review line is the earner's share, and a missing rate hides it", () => {
  assert.equal(providerReviewKeepLine({ providerPlatformRate: 0.12 }), "You keep 88% of each booking");
  assert.equal(providerReviewKeepLine({ providerPlatformRate: 0 }), "You keep 100% of each booking");
  for (const bad of [null, undefined, "", "x", 1, 1.5, -0.1]) {
    assert.equal(providerReviewKeepLine({ providerPlatformRate: bad as any }), null);
  }
  assert.equal(providerReviewKeepLine(null), null);
  // /earn keeps its own sentence.
  assert.equal(providerKeepLine({ providerPlatformRate: 0.12 }), "Providers keep 88% (12%).");
});
