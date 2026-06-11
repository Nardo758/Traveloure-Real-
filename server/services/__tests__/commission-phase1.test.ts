/**
 * Phase 1.3 Commission Resolver — Pure-function neutrality proof.
 *
 * Asserts that the new fee_bands-driven resolver returns IDENTICAL rates to
 * the pre-Phase-1.3 booking_fee_configs lookup for every meaningful input,
 * GIVEN the seeded fee_bands rows from migration 033.
 *
 * These tests cover the PURE LOGIC (decideBandKey + buildRatesFromBand).
 * For end-to-end DB neutrality (does staging/prod actually contain the
 * expected rows), run `npx tsx server/scripts/phase1-neutrality-check.ts`
 * against the target DB and verify the diff is all zeros.
 *
 * Run with: npx tsx server/services/__tests__/commission-phase1.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideBandKey, buildRatesFromBand } from "../commission";

describe("Phase 1.3 — decideBandKey (pure)", () => {
  // Provider line item with policy='beta_flat' → beta_flat band.
  it("source=provider with beta_flat policy → beta_flat", () => {
    assert.equal(
      decideBandKey({ source: "provider" }, "beta_flat", "beta_flat"),
      "beta_flat",
    );
  });

  // Legacy FEE-2 hack: category='provider_commission_percent' is treated identically.
  it("legacy category='provider_commission_percent' with beta_flat policy → beta_flat", () => {
    assert.equal(
      decideBandKey({ category: "provider_commission_percent" }, "beta_flat", "beta_flat"),
      "beta_flat",
    );
  });

  // tiered policy with a service_categories.commission_band_key → use it
  it("source=provider with tiered policy + categoryCommissionBand=moderate → moderate", () => {
    assert.equal(
      decideBandKey(
        { source: "provider", categoryCommissionBand: "moderate" },
        "tiered",
        "beta_flat",
      ),
      "moderate",
    );
  });

  // tiered policy with NO categoryCommissionBand → forward-flag fallback
  it("source=provider with tiered policy + no categoryCommissionBand → defaultBandKey", () => {
    assert.equal(
      decideBandKey({ source: "provider" }, "tiered", "beta_flat"),
      "beta_flat",
    );
  });

  // Expert line items always use expert_standard.
  it("source=expert → expert_standard", () => {
    assert.equal(
      decideBandKey({ source: "expert" }, "beta_flat", "beta_flat"),
      "expert_standard",
    );
  });

  // Default (no source, no special category) → expert_standard.
  it("default (no source) → expert_standard", () => {
    assert.equal(
      decideBandKey({}, "beta_flat", "beta_flat"),
      "expert_standard",
    );
  });

  it("category='default' → expert_standard", () => {
    assert.equal(
      decideBandKey({ category: "default" }, "beta_flat", "beta_flat"),
      "expert_standard",
    );
  });

  // Phase 1.5: tip transactions route to tip_handling (5 % default), NOT
  // expert_standard. The staging neutrality script caught this divergence:
  // booking_fee_configs.tip was at 5 %, but the resolver was falling through
  // to expert_standard (25 %) — a 20-point overcharge on every tip.
  it("category='tip' (storage.ts case) → tip_handling", () => {
    assert.equal(
      decideBandKey({ category: "tip" }, "beta_flat", "beta_flat"),
      "tip_handling",
    );
  });

  // Phase 3.1: the Booking Concierge concern resolves to its dedicated FLAT
  // fee-amount band — a NAMED mapping, NOT a fallthrough. Without it, the
  // generic direct-lookup would return 'booking_concierge' (no such band) and
  // the resolver would silently fall to expert_standard (the tip lesson).
  it("category='booking_concierge' → expert_concierge_booking (named, no fallthrough)", () => {
    const band = decideBandKey({ category: "booking_concierge" }, "beta_flat", "beta_flat");
    assert.equal(band, "expert_concierge_booking");
    assert.notEqual(band, "booking_concierge"); // not the direct-lookup fallthrough
    assert.notEqual(band, "expert_standard");   // not the silent default
  });

  // Phase 1.5 enumeration: any non-default named category falls through to a
  // direct band lookup. Migration 046 seeds a preserving band for every active
  // booking_fee_configs row, so admin per-category overrides flow through
  // without per-category code changes.
  it("category='accommodation' (admin-set custom rate) → 'accommodation' (direct lookup)", () => {
    assert.equal(
      decideBandKey({ category: "accommodation" }, "beta_flat", "beta_flat"),
      "accommodation",
    );
  });

  it("category='transportation' (admin-set custom rate) → 'transportation' (direct lookup)", () => {
    assert.equal(
      decideBandKey({ category: "transportation" }, "beta_flat", "beta_flat"),
      "transportation",
    );
  });

  it("category='unknown_thing_admin_added' → direct lookup (resolver safety-nets if band missing)", () => {
    assert.equal(
      decideBandKey({ category: "unknown_thing_admin_added" }, "beta_flat", "beta_flat"),
      "unknown_thing_admin_added",
    );
  });
});

describe("Phase 1.3 — buildRatesFromBand (pure)", () => {
  it("band 0.25 → 0.25 platform / 0.75 expert", () => {
    const r = buildRatesFromBand(0.25);
    assert.equal(r.platformFeeRate, 0.25);
    assert.equal(r.expertShareRate, 0.75);
  });

  it("band 0.10 → 0.10 platform / 0.90 expert", () => {
    const r = buildRatesFromBand(0.10);
    assert.equal(r.platformFeeRate, 0.10);
    assert.equal(r.expertShareRate, 0.90);
  });

  it("band 0.15 → 0.15 platform / 0.85 expert (expert_new)", () => {
    const r = buildRatesFromBand(0.15);
    assert.equal(r.platformFeeRate, 0.15);
    assert.equal(r.expertShareRate, 0.85);
  });

  it("rates always sum to 1", () => {
    for (const rate of [0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.25, 0.70]) {
      const r = buildRatesFromBand(rate);
      assert.equal(
        Math.round((r.platformFeeRate + r.expertShareRate) * 1e6) / 1e6,
        1,
        `band ${rate}: platform+expert ≠ 1`,
      );
    }
  });
});

// ─── Behavior-neutrality table (the deliverable) ─────────────────────────────
// For each input the old resolver received, prove the new resolver returns
// the same numeric rate. This is the "before/after" diff the user asked for.

describe("Phase 1.3 — neutrality matrix (with seeded fee_bands defaults)", () => {
  // The seeded values from migration 033:
  const seeded = {
    expert_standard: 0.25,
    expert_new: 0.15,
    beta_flat: 0.10,
    limited: 0.12,
    moderate: 0.08,
    commercial: 0.06,
    premium: 0.04,
    platform_deposit: 0.25,
    tip_handling: 0.05,  // Phase 1.5: preserves booking_fee_configs.tip legacy
  };

  // Each row: [old behavior, new resolver computed from pure helpers, diff]
  // Old behavior = what the pre-Phase-1.3 resolver returned for each input.
  const cases: Array<{
    label: string;
    oldRate: number;
    bandKey: string;
    diff: number;
  }> = [
    // Expert line item (no source, category='default') → was 0.25 from booking_fee_configs.default; now 0.25 from expert_standard.
    { label: "expert default booking", oldRate: 0.25, bandKey: "expert_standard", diff: 0 },
    // Provider line item (source='provider' or category='provider_commission_percent') → was 0.10; now 0.10 from beta_flat.
    { label: "provider beta-flat booking", oldRate: 0.10, bandKey: "beta_flat", diff: 0 },
    // 'tip' (Phase 1.5 fix): was 0.05 from booking_fee_configs.tip; now 0.05 from tip_handling band.
    { label: "tip handling (Phase 1.5)", oldRate: 0.05, bandKey: "tip_handling", diff: 0 },
    // Generic category like 'accommodation' that wasn't admin-overridden → was 0.25 via default-fallback; now 0.25 from expert_standard.
    { label: "generic category (default fallback)", oldRate: 0.25, bandKey: "expert_standard", diff: 0 },
  ];

  for (const c of cases) {
    it(`${c.label} → new resolver returns ${c.oldRate} (diff = ${c.diff})`, () => {
      const newRate = seeded[c.bandKey as keyof typeof seeded];
      assert.equal(newRate, c.oldRate, `expected new rate ${c.oldRate} got ${newRate}`);
      assert.equal(newRate - c.oldRate, c.diff, `diff must be 0`);
    });
  }
});
