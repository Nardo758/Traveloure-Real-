/**
 * Beta rollout fees (ledger 2026-10-02-beta-rollout-fees).
 * Pure rules plus source pins. No database.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  FEE_POLICY_SETTING_KEYS,
  UNCONFIGURED_PROVIDER_BAND_KEY,
  feeBandPatchNeedsConfirm,
  percentBandRateInUnitInterval,
  providerCommissionBandKey,
  quoteOwnerShareForAccept,
  travelerServiceFeeAmount,
} from "../../../shared/fee-policy";
import { decideBandKey } from "../commission";
import { BETA_FLAT_BAND } from "../fee-band-requirements";

describe("provider policy", () => {
  it("beta_flat ignores the category band and the expert default", () => {
    assert.equal(
      decideBandKey(
        { source: "provider", categoryCommissionBand: "activities" },
        "beta_flat",
        "expert_standard",
      ),
      BETA_FLAT_BAND,
    );
    assert.equal(
      decideBandKey({ source: "provider" }, "beta_flat", "expert_standard"),
      BETA_FLAT_BAND,
    );
    assert.equal(
      providerCommissionBandKey({
        policy: "",
        categoryBandKey: "moderate",
        defaultBandKey: "expert_standard",
        betaBandKey: BETA_FLAT_BAND,
      }),
      BETA_FLAT_BAND,
    );
  });

  it("an unknown policy does not fall through to expert_standard", () => {
    const key = decideBandKey({ source: "provider" }, "something_else", "expert_standard");
    assert.equal(key, UNCONFIGURED_PROVIDER_BAND_KEY);
    assert.notEqual(key, "expert_standard");
  });

  it("tiered still uses the category band, and experts stay on expert_standard", () => {
    assert.equal(
      decideBandKey(
        { source: "provider", categoryCommissionBand: "moderate" },
        "tiered",
        "expert_standard",
      ),
      "moderate",
    );
    assert.equal(decideBandKey({ source: "expert" }, "beta_flat", "expert_standard"), "expert_standard");
  });
});

describe("traveler fee cap", () => {
  it("applies the rate, then the dollar cap", () => {
    const small = travelerServiceFeeAmount(100, 0.07, 25);
    assert.equal(small.amount, 7);
    assert.equal(small.capApplied, false);
    const large = travelerServiceFeeAmount(1000, 0.07, 25);
    assert.equal(large.amount, 25);
    assert.equal(large.capApplied, true);
    const open = travelerServiceFeeAmount(1000, 0.07, null);
    assert.equal(open.amount, 70);
    assert.equal(open.capApplied, false);
  });
});

describe("quote share pin", () => {
  it("a stored share wins over a later live rate", () => {
    assert.equal(quoteOwnerShareForAccept("0.900000", 0.75), 0.9);
    assert.equal(quoteOwnerShareForAccept(null, 0.88), 0.88);
    assert.equal(quoteOwnerShareForAccept(1.2, 0.88), 0.88);
    assert.equal(quoteOwnerShareForAccept(null, null), null);
  });
});

describe("admin edit gates", () => {
  it("a percent fraction stays inside 0 to 1, and a money field needs confirm", () => {
    assert.equal(percentBandRateInUnitInterval(0), true);
    assert.equal(percentBandRateInUnitInterval(1), true);
    assert.equal(percentBandRateInUnitInterval(1.01), false);
    assert.equal(feeBandPatchNeedsConfirm({ defaultRate: 0.1 }), true);
    assert.equal(feeBandPatchNeedsConfirm({ isActive: false }), true);
    assert.equal(feeBandPatchNeedsConfirm({ displayName: "label" }), false);
    assert.deepEqual(
      [...FEE_POLICY_SETTING_KEYS],
      ["active_provider_commission_policy", "default_commission_band_key"],
    );
  });

  it("only an admin writes a band, and the write does not reprice existing rows", () => {
    const admin = fs.readFileSync("server/routes/admin.routes.ts", "utf8");
    const patchStart = admin.indexOf('router.patch("/api/admin/fee-bands/:bandKey"');
    const patchEnd = admin.indexOf('router.get("/api/admin/service-offering-types"');
    const patch = admin.slice(patchStart, patchEnd);
    assert.ok(patchStart > 0 && patchEnd > patchStart);
    assert.match(patch, /user\.role !== "admin"/);
    assert.match(patch, /confirmation_required/);
    assert.match(patch, /feeBandPatchNeedsConfirm/);
    assert.match(patch, /percent_out_of_range/);
    assert.match(patch, /UPDATE fee_bands/);
    assert.doesNotMatch(patch, /UPDATE service_bookings/);
    assert.doesNotMatch(patch, /UPDATE service_quotes/);
    assert.doesNotMatch(patch, /UPDATE expert_earnings/);
    assert.match(patch, /syncPlatformConciergeListingPrice/);
    assert.match(patch, /clearExpertSplitCache/);

    const settingsStart = admin.indexOf('router.patch("/api/admin/platform-settings/:settingKey"');
    const settingsEnd = admin.indexOf('router.get("/api/admin/lead-routing-logs"');
    const settings = admin.slice(settingsStart, settingsEnd);
    assert.match(settings, /user\.role !== "admin"/);
    assert.match(settings, /confirmation_required/);
    assert.match(settings, /FEE_POLICY_SETTING_KEYS/);
    assert.doesNotMatch(settings, /UPDATE service_bookings/);
  });

  it("issue pins the share and accept prefers the stored one", () => {
    const src = fs.readFileSync("server/services/service-quotes.service.ts", "utf8");
    assert.match(src, /ownerShareRate: pinned\.rate/);
    assert.match(src, /quoteOwnerShareForAccept/);
    const view = src.slice(src.indexOf("export function presentQuote"), src.indexOf("async function loadQuote"));
    assert.doesNotMatch(view, /ownerShareRate/);
  });

  it("the provider resolver reads the beta band through the fail-loud accessor", () => {
    const src = fs.readFileSync("server/services/fee-resolution.service.ts", "utf8");
    assert.match(src, /requireBand\(BETA_FLAT_BAND\)/);
    assert.match(src, /travelerServiceFeeAmount/);
  });

  it("migration 338 reactivates beta_flat and does not rewrite bookings", () => {
    const sql = fs.readFileSync("server/migrations/338_beta_rollout_fees.sql", "utf8");
    assert.match(sql, /band_key = 'beta_flat'/);
    assert.match(sql, /is_active = true/);
    assert.match(sql, /owner_share_rate/);
    assert.match(sql, /setting_value = 'tiered'/);
    assert.doesNotMatch(sql, /UPDATE service_bookings/);
    assert.doesNotMatch(sql, /UPDATE expert_earnings/);
    // Reactivating an inactive beta_flat row is the predicate. Deactivating any
    // band (the four tiers included) is refused.
    assert.match(sql, /AND is_active = false/);
    assert.doesNotMatch(sql, /SET is_active = false/);
  });
});
