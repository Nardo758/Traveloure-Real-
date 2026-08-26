/**
 * PRICING LEDGER LANE 1 (Task 1669) — new fee_bands keys + typed accessors, and the `plans` table.
 *
 * Mirrors fee-resolution-authority.db.test.ts's proof shape: an admin edit to the band row must
 * reach the next resolution, with the row read live (no literal expectation baked into the test).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  getOptimizerRunFeeCents,
  getConciergeAiTaskFeeCents,
  getConciergeBookingPct,
  getConciergeBookingCapCents,
  getConciergeDoneForYouDepositPct,
  getReadyMadePlatformBandRule,
  getProviderProBandStep,
  getPlansPlusTaskAllowance,
  OPTIMIZER_RUN_BAND,
  CONCIERGE_AI_TASK_BAND,
  CONCIERGE_BOOKING_PCT_BAND,
  CONCIERGE_BOOKING_CAP_CENTS_BAND,
  CONCIERGE_DONE_FOR_YOU_DEPOSIT_PCT_BAND,
  READY_MADE_PLATFORM_BAND_KEY,
  PROVIDER_PRO_BAND_STEP_BAND,
  PLANS_PLUS_TASK_ALLOWANCE_BAND,
  BandResolutionError,
} from "../services/fee-resolution.service";
import { getPlan, listActivePlans } from "../services/plans.service";

// Snapshot every Lane 1 band's original rate so each test restores it, regardless of order.
const originalRates: Record<string, number> = {};

before(async () => {
  for (const key of [
    OPTIMIZER_RUN_BAND,
    CONCIERGE_AI_TASK_BAND,
    CONCIERGE_BOOKING_PCT_BAND,
    CONCIERGE_BOOKING_CAP_CENTS_BAND,
    CONCIERGE_DONE_FOR_YOU_DEPOSIT_PCT_BAND,
    PROVIDER_PRO_BAND_STEP_BAND,
    PLANS_PLUS_TASK_ALLOWANCE_BAND,
  ]) {
    const res = await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS rate FROM fee_bands WHERE band_key = ${key}`);
    originalRates[key] = Number((res.rows?.[0] as { rate: number } | undefined)?.rate);
  }
});

after(async () => {
  for (const [key, rate] of Object.entries(originalRates)) {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${rate} WHERE band_key = ${key}`);
  }
});

test("optimizer:run resolves 499 cents and reacts live to an admin band edit", async () => {
  assert.equal(await getOptimizerRunFeeCents(), originalRates[OPTIMIZER_RUN_BAND]);
  await db.execute(sql`UPDATE fee_bands SET default_rate = 350 WHERE band_key = ${OPTIMIZER_RUN_BAND}`);
  assert.equal(await getOptimizerRunFeeCents(), 350, "the resolver must reflect the edited row, not a cached/constant value");
});

test("concierge:ai_task resolves as flat cents and reacts live to an admin band edit", async () => {
  assert.equal(await getConciergeAiTaskFeeCents(), originalRates[CONCIERGE_AI_TASK_BAND]);
  await db.execute(sql`UPDATE fee_bands SET default_rate = 150 WHERE band_key = ${CONCIERGE_AI_TASK_BAND}`);
  assert.equal(await getConciergeAiTaskFeeCents(), 150);
});

test("concierge:booking_pct resolves as a percent fraction", async () => {
  const pct = await getConciergeBookingPct();
  assert.equal(pct, originalRates[CONCIERGE_BOOKING_PCT_BAND]);
  assert.ok(pct > 0 && pct < 1, "a percent band must be a 0..1 fraction, not a whole number");
});

test("concierge:booking_cap_cents resolves as flat cents", async () => {
  assert.equal(await getConciergeBookingCapCents(), originalRates[CONCIERGE_BOOKING_CAP_CENTS_BAND]);
});

test("concierge:done_for_you_deposit_pct resolves as a percent fraction", async () => {
  const pct = await getConciergeDoneForYouDepositPct();
  assert.equal(pct, originalRates[CONCIERGE_DONE_FOR_YOU_DEPOSIT_PCT_BAND]);
  assert.ok(pct > 0 && pct < 1);
});

test("ready_made:platform_band resolves the rule string from description, not a numeric rate", async () => {
  const rule = await getReadyMadePlatformBandRule();
  assert.equal(rule, "inherit_expert");
});

test("provider:pro_band_step resolves as a unitless count", async () => {
  assert.equal(await getProviderProBandStep(), originalRates[PROVIDER_PRO_BAND_STEP_BAND]);
});

test("plans:plus_task_allowance resolves as a unitless count", async () => {
  assert.equal(await getPlansPlusTaskAllowance(), originalRates[PLANS_PLUS_TASK_ALLOWANCE_BAND]);
});

test("a rate_type mismatch throws BandResolutionError rather than silently coercing", async () => {
  // Force a real type mismatch by temporarily relabeling provider:pro_band_step's rate_type away
  // from 'count', then prove the accessor refuses rather than returning a value.
  await db.execute(sql`UPDATE fee_bands SET rate_type = 'percent' WHERE band_key = ${PROVIDER_PRO_BAND_STEP_BAND}`);
  try {
    await assert.rejects(
      () => getProviderProBandStep(),
      (e: unknown) => e instanceof BandResolutionError,
    );
  } finally {
    await db.execute(sql`UPDATE fee_bands SET rate_type = 'count' WHERE band_key = ${PROVIDER_PRO_BAND_STEP_BAND}`);
  }
});

test("plans: getPlan resolves the seeded rows by key", async () => {
  const tripPass = await getPlan("trip_pass");
  assert.ok(tripPass, "trip_pass must resolve");
  assert.equal(tripPass!.priceCents, 1900);
  assert.equal(tripPass!.interval, "trip");

  const plusAnnual = await getPlan("plus_annual");
  assert.ok(plusAnnual);
  assert.equal(plusAnnual!.priceCents, 2500);
  assert.equal(plusAnnual!.interval, "year");

  const proMonthly = await getPlan("pro_monthly");
  assert.ok(proMonthly);
  assert.equal(proMonthly!.priceCents, 2900);
  assert.equal(proMonthly!.interval, "month");

  assert.equal(await getPlan("does_not_exist"), null);
});

test("plans: listActivePlans returns all three seeded rows", async () => {
  const all = await listActivePlans();
  const keys = all.map((p) => p.key).sort();
  assert.deepEqual(keys, ["plus_annual", "pro_monthly", "trip_pass"]);
});
