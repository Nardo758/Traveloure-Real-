/**
 * run-health.test.ts — TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`): a run that
 * returned per-market errors is recorded `partial` WITH its messages, never `success` with a blank
 * error (trend-engine audit §5 — the production rows said success over 8 BestTime/PredictHQ errors).
 * Run: npx tsx --test server/services/trend-engine/__tests__/run-health.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runHealthFor, perMarketErrors, LAST_RUN_ERROR_MAX } from "../run-health";

test("H1: no errors ⇒ success, no error text", () => {
  assert.deepEqual(runHealthFor({ errors: [] }), { status: "success", error: null });
});

test("H2: any per-market error ⇒ partial, messages kept in order", () => {
  const r = runHealthFor({ errors: ["kyoto: BestTime API 402 at /forecasts: no credits", "goa: timeout"] });
  assert.equal(r.status, "partial");
  assert.deepEqual(JSON.parse(r.error!), [
    { market: "kyoto", error: "BestTime API 402 at /forecasts: no credits" },
    { market: "goa", error: "timeout" },
  ]);
});

test("H3: each market's message is capped on its own, so one long error cannot crowd out the rest", () => {
  const errors = Array.from({ length: 8 }, (_, i) => `m${i}: ${"x".repeat(2000)}`);
  const stored = JSON.parse(runHealthFor({ errors }).error!);
  assert.equal(stored.length, 8, "every market is kept");
  for (const e of stored) assert.equal(e.error.length, LAST_RUN_ERROR_MAX);
  assert.deepEqual(stored.map((e: any) => e.market), errors.map((_, i) => `m${i}`));
});

test("H4: a message with no market prefix is kept with market null, never guessed", () => {
  assert.deepEqual(perMarketErrors(["fetch failed"]), [{ market: null, error: "fetch failed" }]);
});
