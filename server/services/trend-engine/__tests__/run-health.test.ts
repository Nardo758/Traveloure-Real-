/**
 * run-health.test.ts — TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`): a run that
 * returned per-market errors is recorded `partial` WITH its messages, never `success` with a blank
 * error (trend-engine audit §5 — the production rows said success over 8 BestTime/PredictHQ errors).
 * Run: npx tsx --test server/services/trend-engine/__tests__/run-health.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runHealthFor, LAST_RUN_ERROR_MAX } from "../run-health";

test("H1: no errors ⇒ success, no error text", () => {
  assert.deepEqual(runHealthFor({ errors: [] }), { status: "success", error: null });
});

test("H2: any per-market error ⇒ partial, messages kept in order", () => {
  const r = runHealthFor({ errors: ["kyoto: BestTime API 402 at /forecasts: no credits", "goa: timeout"] });
  assert.equal(r.status, "partial");
  assert.equal(r.error, "kyoto: BestTime API 402 at /forecasts: no credits | goa: timeout");
});

test("H3: the stored text is capped at the failure branch's length", () => {
  const r = runHealthFor({ errors: Array.from({ length: 50 }, (_, i) => `m${i}: ${"x".repeat(40)}`) });
  assert.equal(r.error!.length, LAST_RUN_ERROR_MAX);
});
