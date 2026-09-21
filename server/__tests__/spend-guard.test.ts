/**
 * spend-guard.test.ts — ledger `2026-09-21-tavily-spend-breaker`.
 *
 * R-T1-c ratified a $150/month Tavily ceiling as "HARD, CONFIG, LEON-ONLY", and
 * `2026-09-18-tavily-spend-logged` made the spend OBSERVABLE while recording that ENFORCING it
 * "remains a separate, unruled decision". The decision-maker ruled it; this file proves the
 * enforcement.
 *
 * WHAT THIS PROVES (no database — the predicate takes injected reads by design):
 *   G1-G6  the ONE predicate `resolveSpendAuthorization`: under / at / over the cap, an absent
 *          cap, an unreadable meter, and the ORDER of those last two.
 *   B1-B6  the breaker at the Tavily chokepoint, through injected deps: a refused call NEVER
 *          reaches the SDK, NEVER writes an `api_usage_logs` row, and throws a typed error; an
 *          authorized call is untouched; an unreadable meter still calls.
 *
 * B2 is the load-bearing one. The meter this guard reads IS `api_usage_logs`, so a refusal that
 * logged itself would inflate the number that caused it and ratchet the breaker shut on its own
 * output. A test that only asserted "the call was refused" would not catch that.
 *
 * Run: npx tsx --test server/__tests__/spend-guard.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

// tavily-client.ts imports api-usage.service.ts, which imports server/db.ts, which throws at
// import time if DATABASE_URL is unset. ESM hoists static imports before any top-level code runs,
// so the default must be set BEFORE the dynamic imports below take effect (the
// tavily-client.test.ts / booking-verification.test.ts precedent). NO real connection is ever
// made: the predicate takes injected reads, and every breaker test injects its own meter, SDK and
// logger. spend-guard.service.ts itself imports no db at all and needs none of this.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://claude:claude@localhost:5432/traveloure_test";
}

const { resolveSpendAuthorization, SpendCapExceededError, isSpendCapExceeded } = await import(
  "../services/spend-guard.service"
);
const { createTavilyClient, __resetTavilyMeterCacheForTests } = await import(
  "../services/tavily-client"
);

// ═══════════════════════ G — the pure predicate ═══════════════════════════════
test("G1: under the cap authorizes, and names the basis", () => {
  const r = resolveSpendAuthorization({ provider: "tavily", monthToDateUsd: 12.5, capUsd: 150 });
  assert.equal(r.authorized, true);
  assert.equal(r.authorized && r.basis, "under_cap");
});

test("G2: AT the cap refuses — the cap is the amount that may be spent, not a floor to exceed", () => {
  const r = resolveSpendAuthorization({ provider: "tavily", monthToDateUsd: 150, capUsd: 150 });
  assert.equal(r.authorized, false);
  assert.equal(!r.authorized && r.reason, "monthly_cap_reached");
});

test("G3: over the cap refuses and reports both figures", () => {
  const r = resolveSpendAuthorization({ provider: "tavily", monthToDateUsd: 151.2, capUsd: 150 });
  assert.equal(r.authorized, false);
  if (!r.authorized) {
    assert.equal(r.monthToDateUsd, 151.2);
    assert.equal(r.capUsd, 150);
  }
});

test("G4: an ABSENT cap authorizes as no_cap_configured — it is never read as a cap of $0", () => {
  const r = resolveSpendAuthorization({ provider: "tavily", monthToDateUsd: 999, capUsd: null });
  assert.equal(r.authorized, true);
  assert.equal(r.authorized && r.basis, "no_cap_configured");
  // The §13 point: a spend of $999 against NO ceiling is authorized. Reading `null` as 0 would
  // refuse everything and would be a ceiling nobody set.
});

test("G5: an UNREADABLE meter authorizes as meter_unavailable — never as a spend of zero", () => {
  const r = resolveSpendAuthorization({ provider: "tavily", monthToDateUsd: null, capUsd: 150 });
  assert.equal(r.authorized, true);
  assert.equal(r.authorized && r.basis, "meter_unavailable");
  assert.equal(r.authorized && r.monthToDateUsd, null);
});

test("G6: an absent cap is answered BEFORE an unreadable meter", () => {
  // Both are absent. The ruling's order: "nobody set a limit" is a complete answer, so naming a
  // broken meter for a provider with no ceiling would report a problem blocking nothing.
  const r = resolveSpendAuthorization({ provider: "tavily", monthToDateUsd: null, capUsd: null });
  assert.equal(r.authorized && r.basis, "no_cap_configured");
});

// ═══════════════════ B — the breaker at the Tavily chokepoint ═════════════════
function harness(opts: { spend: number | null; cap: number | null }) {
  const calls: string[] = [];
  const logged: any[] = [];
  const sdk = {
    search: async (...a: any[]) => { calls.push("search"); return { results: [] }; },
    extract: async (...a: any[]) => { calls.push("extract"); return { results: [] }; },
  } as any;
  const client = createTavilyClient("test-key", {
    sdk,
    logger: { logApiCall: async (p: any) => { logged.push(p); } },
    readMonthToDateUsd: async () => opts.spend,
    capUsd: opts.cap,
    now: () => 0,
  });
  return { client, calls, logged };
}

test("B1: over the cap — the SDK is never reached", async () => {
  __resetTavilyMeterCacheForTests();
  const { client, calls } = harness({ spend: 150, cap: 150 });
  await assert.rejects(() => client.search("anything" as any));
  assert.deepEqual(calls, [], "a refused call must not reach the Tavily SDK");
});

test("B2: a refused call writes NO api_usage_logs row (it would inflate its own meter)", async () => {
  __resetTavilyMeterCacheForTests();
  const { client, logged } = harness({ spend: 200, cap: 150 });
  await assert.rejects(() => client.extract("https://example.com" as any));
  assert.deepEqual(
    logged,
    [],
    "no Tavily credit was spent, and the meter this guard reads IS api_usage_logs — " +
      "logging a refusal would ratchet the breaker shut on its own output",
  );
});

test("B3: the refusal is a TYPED error, so a caller can tell it from a failed call", async () => {
  __resetTavilyMeterCacheForTests();
  const { client } = harness({ spend: 150, cap: 150 });
  await assert.rejects(
    () => client.search("x" as any),
    (err: unknown) => {
      assert.ok(isSpendCapExceeded(err), "must be a SpendCapExceededError");
      assert.ok(err instanceof SpendCapExceededError);
      assert.equal(err.provider, "tavily");
      assert.equal(err.capUsd, 150);
      // §13: the message says the call was NOT made, so nobody reads it as a Tavily outage.
      assert.match(err.message, /NOT made and nothing was charged/);
      return true;
    },
  );
});

test("B4: under the cap — the call runs and IS logged, exactly as before the breaker", async () => {
  __resetTavilyMeterCacheForTests();
  const { client, calls, logged } = harness({ spend: 10, cap: 150 });
  await client.search("kyoto" as any);
  assert.deepEqual(calls, ["search"]);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].provider, "tavily");
  assert.equal(logged[0].success, true);
});

test("B5: an unreadable meter still calls — the stated fail-OPEN posture", async () => {
  __resetTavilyMeterCacheForTests();
  const { client, calls, logged } = harness({ spend: null, cap: 150 });
  await client.search("kyoto" as any);
  assert.deepEqual(calls, ["search"], "a broken meter must not take ingestion down");
  assert.equal(logged.length, 1);
});

test("B6: no cap configured — the call runs however high the spend", async () => {
  __resetTavilyMeterCacheForTests();
  const { client, calls } = harness({ spend: 10_000, cap: null });
  await client.search("kyoto" as any);
  assert.deepEqual(calls, ["search"]);
});
