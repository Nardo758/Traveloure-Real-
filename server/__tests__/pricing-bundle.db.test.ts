/**
 * GET /api/pricing — pricing display bundle (Phase 1 of the /pricing rebuild lane).
 *
 * NO LITERALS: every expectation is recomputed from the same `plans` / `fee_bands` /
 * `optimization_fees` reads the handler itself uses — never a hardcoded price — so
 * re-pricing a row is not a test edit.
 *
 * Run with:
 *   npx tsx --test server/__tests__/pricing-bundle.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getPricingHandler } from "../routes/pricing.routes";
import { requirePlan, PLAN_KEYS } from "../services/plans.service";
import { requireBand, requireFlatCentsBand, requireCountBand } from "../services/fee-resolution.service";
import { getFee } from "../services/optimization-fee.service";

function makeRes() {
  const captured = { status: 200, body: null as any };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: any) {
      captured.body = body;
      return res;
    },
  };
  return { captured, res };
}

async function callHandler() {
  const { captured, res } = makeRes();
  await getPricingHandler({} as any, res as any);
  return captured;
}

let originalTripPassPriceCents: number;

before(async () => {
  const tripPass = await requirePlan(PLAN_KEYS.TRIP_PASS);
  originalTripPassPriceCents = tripPass.priceCents;
});

after(async () => {
  await db.execute(
    sql`UPDATE plans SET price_cents = ${originalTripPassPriceCents} WHERE key = ${PLAN_KEYS.TRIP_PASS}`,
  );
});

test("the bundle is composed entirely from live plans/fee_bands/optimization_fees rows", async () => {
  const { status, body } = await callHandler();
  assert.equal(status, 200);

  const [tripPass, plusAnnual, proMonthly] = await Promise.all([
    requirePlan(PLAN_KEYS.TRIP_PASS),
    requirePlan(PLAN_KEYS.PLUS_ANNUAL),
    requirePlan(PLAN_KEYS.PRO_MONTHLY),
  ]);
  const [travelerFee, aiTask, doneForYou, standard, stepped, rails, proStep] = await Promise.all([
    requireBand("traveler_service_fee"),
    requireFlatCentsBand("concierge:ai_task"),
    requireBand("concierge:done_for_you_deposit_pct"),
    requireBand("limited"),
    requireBand("moderate"),
    requireBand("provider_rails"),
    requireCountBand("provider:pro_band_step"),
  ]);

  assert.equal(body.serviceFeePct, Math.round(travelerFee.rate * 100 * 10) / 10);
  assert.equal(body.serviceFeeCapCents, Math.round((travelerFee.maxAmount as number) * 100));
  assert.equal(body.aiTaskCents, aiTask.rate);
  assert.equal(body.doneForYouDepositPct, Math.round(doneForYou.rate * 100 * 10) / 10);
  assert.equal(body.proRateStandard, Math.round(standard.rate * 100 * 10) / 10);
  assert.equal(body.proRateStepped, Math.round(stepped.rate * 100 * 10) / 10);
  assert.equal(body.railsRate, Math.round(rails.rate * 100 * 10) / 10);
  assert.equal(body.proBandStep, proStep.rate);

  assert.deepEqual(body.tripPass, {
    key: "trip_pass",
    name: tripPass.name,
    priceCents: tripPass.priceCents,
    interval: "trip",
  });
  assert.deepEqual(body.plusAnnual, {
    key: "plus_annual",
    name: plusAnnual.name,
    priceCents: plusAnnual.priceCents,
    interval: "year",
  });
  assert.equal(body.proMonthly.priceCents, proMonthly.priceCents);
  assert.equal(body.proMonthly.key, "pro_monthly");
});

test("all provider commission bands resolve as active percent bands at their ratified rates", async () => {
  const expectedRates = {
    limited: 0.12,
    moderate: 0.08,
    commercial: 0.06,
    premium: 0.04,
  };

  for (const [bandKey, expectedRate] of Object.entries(expectedRates)) {
    const band = await requireBand(bandKey);
    assert.equal(band.rateType, "percent", `${bandKey} must be percent-typed`);
    assert.equal(band.rate, expectedRate, `${bandKey} must retain its ratified rate`);
  }
});

test("a plan-row price change reaches the response immediately, no code touched", async () => {
  const before = await callHandler();
  const bumped = before.body.tripPass.priceCents + 500;
  await db.execute(sql`UPDATE plans SET price_cents = ${bumped} WHERE key = ${PLAN_KEYS.TRIP_PASS}`);

  const after = await callHandler();
  assert.equal(after.body.tripPass.priceCents, bumped, "the plan edit must reach the next resolution");
  assert.notEqual(after.body.tripPass.priceCents, before.body.tripPass.priceCents);
});

test("the optimizer display is sourced from optimization_fees.getFee, not a fee_bands key", async () => {
  const expected = await getFee(null, "simple");
  const { body } = await callHandler();
  assert.deepEqual(body.optimizerRunDisplay, {
    priceCents: expected.priceCents,
    currency: expected.currency,
    complexityTier: "simple",
  });

  // A legacy `optimizer:run` fee-band row may exist (dead, per the pricing map's explicit
  // exclusion) — the handler must never read it. If it happens to hold the SAME value as
  // optimization_fees right now this pin is silent-but-safe; its job is to catch a future
  // regression that reads the band directly.
  const legacyBand = await db.execute(
    sql`SELECT default_rate FROM fee_bands WHERE band_key = 'optimizer:run' AND is_active = true LIMIT 1`,
  );
  if (legacyBand.rows.length > 0) {
    const legacyCents = Number((legacyBand.rows[0] as any).default_rate);
    if (Number.isFinite(legacyCents) && legacyCents !== expected.priceCents) {
      assert.notEqual(
        body.optimizerRunDisplay.priceCents,
        legacyCents,
        "the response must not match the legacy fee_bands row when it disagrees with optimization_fees",
      );
    }
  }
});

test("a missing/mismatched required band fails loudly (500), never a fabricated price", async () => {
  await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = 'concierge:ai_task'`);
  try {
    const { status, body } = await callHandler();
    assert.equal(status, 500);
    assert.ok(body?.message, "must return an error body, not a partial/fabricated bundle");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = 'concierge:ai_task'`);
  }
});
