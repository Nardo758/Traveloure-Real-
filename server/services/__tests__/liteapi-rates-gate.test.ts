/**
 * S1-d-2 — the LiteAPI rates gate and its config (ledger `2026-10-10-s1-d2-liteapi-rates`), R299 shape.
 *
 *   RG1 a cap of 0, an unreadable counter or a spent cap refuses BEFORE the call: no request, no row
 *   RG2 under the cap the call runs and ONE usage row is recorded; a thrown call is recorded as a failure
 *       (it still counts toward the cap) and rethrown
 *   RG3 config: LITEAPI_RATES_DAILY_CAP defaults and reads by name (0 allowed = paused); currency and
 *       nationality are ISO-shaped or the default; the timeout is positive
 *
 * Run: npx tsx --test server/services/__tests__/liteapi-rates-gate.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gatedLiteapiRatesCall, type LiteapiRatesGateDeps } from "../liteapi-rates-gate";
import {
  LITEAPI_RATES_DAILY_CAP_DEFAULT,
  liteapiCurrency,
  liteapiGuestNationality,
  liteapiRatesDailyCap,
  liteapiRatesTimeoutMs,
} from "../../config/liteapi.config";

function deps(cap: number, used: number | null) {
  const rows: Array<{ success: boolean }> = [];
  const d: LiteapiRatesGateDeps = { dailyCap: () => cap, countToday: async () => used, record: async (r) => void rows.push(r) };
  return { d, rows };
}

test("RG1 refused before the call: cap 0, unreadable, spent", async () => {
  for (const [cap, used] of [[0, 0], [10, null], [10, 10]] as const) {
    const { d, rows } = deps(cap, used);
    let called = false;
    const out = await gatedLiteapiRatesCall(async () => { called = true; return 1; }, { userId: "u", env: "sandbox", deps: d });
    assert.deepEqual(out, { refused: "paused" });
    assert.equal(called, false);
    assert.equal(rows.length, 0);
  }
});

test("RG2 under the cap: one row per call; a failure is recorded and rethrown", async () => {
  const ok = deps(10, 9);
  assert.deepEqual(await gatedLiteapiRatesCall(async () => "body", { userId: "u", env: "sandbox", deps: ok.d }), { value: "body" });
  assert.deepEqual(ok.rows.map((r) => r.success), [true]);
  const bad = deps(10, 0);
  await assert.rejects(gatedLiteapiRatesCall(async () => { throw new Error("timeout"); }, { userId: null, env: "sandbox", deps: bad.d }), /timeout/);
  assert.deepEqual(bad.rows.map((r) => r.success), [false]);
});

test("RG3 config by name", () => {
  assert.equal(liteapiRatesDailyCap({}), LITEAPI_RATES_DAILY_CAP_DEFAULT);
  assert.equal(liteapiRatesDailyCap({ LITEAPI_RATES_DAILY_CAP: "0" }), 0);
  assert.equal(liteapiRatesDailyCap({ LITEAPI_RATES_DAILY_CAP: "50" }), 50);
  assert.equal(liteapiRatesDailyCap({ LITEAPI_RATES_DAILY_CAP: "-3" }), LITEAPI_RATES_DAILY_CAP_DEFAULT);
  assert.equal(liteapiCurrency({ LITEAPI_CURRENCY: "jpy" }), "JPY");
  assert.equal(liteapiCurrency({ LITEAPI_CURRENCY: "dollars" }), "USD");
  assert.equal(liteapiGuestNationality({ LITEAPI_GUEST_NATIONALITY: "jp" }), "JP");
  assert.equal(liteapiGuestNationality({}), "US");
  assert.ok(liteapiRatesTimeoutMs({ LITEAPI_RATES_TIMEOUT_MS: "0" }) > 0);
});
