/**
 * Wave 2 / lane S4 ("money out of creation", ledger row 99) — the post-creation "Pricing & fees"
 * drawer's pure logic (`../pricing-fees.ts`), plus static-source proofs that the moved fields are
 * gone from the wizard and present only in the drawer.
 *
 * Run: npx tsx --test client/src/lib/__tests__/pricing-fees.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CANCELLATION_POLICY_TYPE_OPTIONS,
  buildPricingFeesPatch,
  buildSurchargeTiersPayload,
  emptyPricingFeesState,
  pricingFeesFromService,
  pricingFeesSummary,
  type PricingFeesState,
} from "../pricing-fees";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══ Round trip: hydrate from a saved service row → edit → build the PATCH body ═══════════════

describe("pricingFeesFromService — hydration mirrors ServiceForm's own mapServiceToForm slice", () => {
  it("a fresh listing (no money config saved) hydrates to the honest empty state", () => {
    const state = pricingFeesFromService({}, []);
    assert.equal(state.surchargeMode, "none");
    assert.equal(state.depositEnabled, false);
    assert.equal(state.cancellationPolicyType, "");
    assert.deepEqual(state.surchargeTiers, []);
  });

  it("round-trips a fully configured listing — flat surcharge, percentage deposit, moderate cancellation", () => {
    const service = {
      surchargeMode: "flat",
      surchargeFlatAmount: "20.00",
      surchargePerKm: null,
      surchargeMaxKm: 50,
      depositEnabled: true,
      depositType: "percentage",
      depositPercentage: 30,
      depositFlatAmount: null,
      cancellationPolicyType: "moderate",
      cancellationPolicy: "See details.",
    };
    const state = pricingFeesFromService(service, []);
    assert.equal(state.surchargeMode, "flat");
    assert.equal(state.surchargeFlatAmount, "20.00");
    assert.equal(state.surchargeMaxKm, "50");
    assert.equal(state.depositEnabled, true);
    assert.equal(state.depositType, "percentage");
    assert.equal(state.depositPercentage, "30");
    assert.equal(state.cancellationPolicyType, "moderate");
    assert.equal(state.cancellationPolicy, "See details.");
  });

  it("hydrates saved zones-mode tier child rows (mirrors the surcharge-tiers GET)", () => {
    const state = pricingFeesFromService(
      { surchargeMode: "zones" },
      [{ radiusKm: 5, fee: 10 }, { radiusKm: 15, fee: 25 }],
    );
    assert.equal(state.surchargeMode, "zones");
    assert.deepEqual(state.surchargeTiers, [
      { radiusKm: "5", fee: "10" },
      { radiusKm: "15", fee: "25" },
    ]);
  });

  it("an unrecognized/legacy surchargeMode value falls back to 'none', never a guess", () => {
    const state = pricingFeesFromService({ surchargeMode: "something-legacy" }, []);
    assert.equal(state.surchargeMode, "none");
  });
});

describe("buildPricingFeesPatch — the PATCH /api/provider/services/:id body", () => {
  it("mocked PATCH round trip: edit surcharge + cancellation from a hydrated draft, verify the exact body", () => {
    const state: PricingFeesState = {
      ...emptyPricingFeesState(),
      surchargeMode: "flat",
      surchargeFlatAmount: "20.00",
    };
    // Simulate the drawer's edits.
    state.cancellationPolicyType = "strict";
    state.cancellationPolicy = "50% refund window.";

    const patch = buildPricingFeesPatch(state);
    assert.deepEqual(patch, {
      surchargeMode: "flat",
      surchargeFlatAmount: "20.00",
      surchargePerKm: null,
      surchargeMaxKm: null,
      depositEnabled: false,
      depositType: null,
      depositPercentage: null,
      depositFlatAmount: null,
      cancellationPolicyType: "strict",
      cancellationPolicy: "50% refund window.",
    });
    // NEVER includes price, revenueShareRate, or any rate-bearing field (§18) — the patch is a
    // fixed, closed shape, not a spread of the whole drawer state.
    assert.equal("price" in patch, false);
    assert.equal("revenueShareRate" in patch, false);
    assert.equal("surchargeTiers" in patch, false);
  });

  it("deposit OFF clears type/percentage/flat to null even if the fields still hold stale text", () => {
    const state: PricingFeesState = {
      ...emptyPricingFeesState(),
      depositEnabled: false,
      depositType: "percentage",
      depositPercentage: "40", // stale leftover from before the provider unchecked the box
    };
    const patch = buildPricingFeesPatch(state);
    assert.equal(patch.depositEnabled, false);
    assert.equal(patch.depositType, null);
    assert.equal(patch.depositPercentage, null);
  });

  it("deposit flat amount only sent when type is 'flat', never leaked from the percentage field", () => {
    const state: PricingFeesState = {
      ...emptyPricingFeesState(),
      depositEnabled: true,
      depositType: "flat",
      depositFlatAmount: "50.00",
      depositPercentage: "30", // must be ignored — wrong type
    };
    const patch = buildPricingFeesPatch(state);
    assert.equal(patch.depositFlatAmount, "50.00");
    assert.equal(patch.depositPercentage, null);
  });

  it("blank strings become null, never a fabricated 0 (§13)", () => {
    const patch = buildPricingFeesPatch(emptyPricingFeesState());
    assert.equal(patch.surchargeFlatAmount, null);
    assert.equal(patch.surchargePerKm, null);
    assert.equal(patch.surchargeMaxKm, null);
    assert.equal(patch.cancellationPolicyType, null);
    assert.equal(patch.cancellationPolicy, null);
  });
});

describe("buildSurchargeTiersPayload — the zones-mode child-row PUT body", () => {
  it("drops half-answered rows (either side blank) rather than saving a broken ring", () => {
    const payload = buildSurchargeTiersPayload([
      { radiusKm: "5", fee: "10" },
      { radiusKm: "", fee: "20" },
      { radiusKm: "15", fee: "" },
      { radiusKm: "25", fee: "30" },
    ]);
    assert.deepEqual(payload, { tiers: [{ radiusKm: "5", fee: "10" }, { radiusKm: "25", fee: "30" }] });
  });

  it("an empty ring list saves an empty list (an explicit clear, not an omission)", () => {
    assert.deepEqual(buildSurchargeTiersPayload([]), { tiers: [] });
  });
});

describe("pricingFeesSummary — honest, never-fabricated one-liner", () => {
  it("not applicable (remote / no pickup) states so plainly, ignores any stale surcharge fields", () => {
    const state: PricingFeesState = { ...emptyPricingFeesState(), surchargeMode: "flat", surchargeFlatAmount: "20" };
    const summary = pricingFeesSummary(state, { surchargeApplicable: false });
    assert.match(summary, /no travel surcharge \(not applicable/);
  });

  it("states the configured deposit and cancellation policy honestly", () => {
    const state: PricingFeesState = {
      ...emptyPricingFeesState(),
      depositEnabled: true,
      depositType: "percentage",
      depositPercentage: "25",
      cancellationPolicyType: "moderate",
    };
    const summary = pricingFeesSummary(state, { surchargeApplicable: true });
    assert.match(summary, /deposit 25% at booking/);
    assert.match(summary, /cancellation: Moderate/);
  });

  it("nothing configured reads as nothing configured, not a blank line", () => {
    const summary = pricingFeesSummary(emptyPricingFeesState(), { surchargeApplicable: true });
    assert.match(summary, /no travel surcharge\./.source ? /no travel surcharge/ : /no travel surcharge/);
    assert.match(summary, /no deposit/);
    assert.match(summary, /no cancellation policy set/);
  });
});

describe("CANCELLATION_POLICY_TYPE_OPTIONS — the sole copy now lives here", () => {
  it("carries the four concrete-window options the server actually enforces", () => {
    assert.deepEqual(
      CANCELLATION_POLICY_TYPE_OPTIONS.map((o) => o.value),
      ["flexible", "moderate", "strict", "non_refundable"],
    );
  });
});

// ═══ Static-source proofs: moved fields are ABSENT from the wizard, PRESENT only in the drawer ═

const serviceFormSrc = readFileSync(resolve(__dirname, "../../components/ServiceForm.tsx"), "utf-8");
const drawerSrc = readFileSync(resolve(__dirname, "../../components/provider/pricing-fees-drawer.tsx"), "utf-8");
// The mock's ⑨ "one map-authoring component" moved the radius CONTROL out of the wizard's
// Getting-there card and onto the map canvas (pin + radius + stops + zones in one place).
// The invariant this file guards is unchanged: radius is MAP GEOMETRY and must never live
// in the pricing drawer — its home is now the authoring map, not a bare wizard field.
const mapAuthoringSrc = readFileSync(resolve(__dirname, "../../components/provider/service-map-authoring.tsx"), "utf-8");

describe("moved fields are absent from the wizard (ServiceForm.tsx)", () => {
  const movedControlTestids = [
    "segmented-surcharge-mode",
    "input-surcharge-flat-amount",
    "input-surcharge-per-km",
    "input-surcharge-max-km",
    "button-add-surcharge-tier",
    "checkbox-deposit-enabled",
    "select-deposit-type",
    "input-deposit-percentage",
    "input-deposit-flat-amount",
    "select-cancellation-policy-type",
    "textarea-cancellation-policy",
  ];

  for (const testid of movedControlTestids) {
    it(`ServiceForm.tsx no longer renders data-testid="${testid}"`, () => {
      assert.equal(
        serviceFormSrc.includes(`data-testid="${testid}"`),
        false,
        `${testid} is still authored in the wizard — it should have moved to the Pricing & fees drawer`,
      );
    });
  }

  it("the wizard's Booking Terms card still keeps Lead Time (not moved — not fee-adjacent)", () => {
    assert.match(serviceFormSrc, /data-testid="input-lead-time"/);
  });

  it("Service Radius stays map geometry — on the authoring map, never in the pricing drawer", () => {
    // Moved from the wizard's Getting-there card to the one-canvas map authoring component
    // (mock callout ⑨) — same invariant, new home.
    assert.match(mapAuthoringSrc, /serviceRadius|radiusKm/);
    assert.doesNotMatch(drawerSrc, /serviceRadius/);
  });

  it("the wizard points to the drawer where the fields went, rather than silently dropping them", () => {
    assert.match(serviceFormSrc, /Pricing &amp; fees/);
  });
});

describe("moved fields are present in the drawer (pricing-fees-drawer.tsx)", () => {
  const drawerControlTestids = [
    "segmented-pf-surcharge-mode",
    "input-pf-surcharge-flat-amount",
    "input-pf-surcharge-per-km",
    "input-pf-surcharge-max-km",
    "button-pf-add-surcharge-tier",
    "checkbox-pf-deposit-enabled",
    "select-pf-deposit-type",
    "input-pf-deposit-percentage",
    "input-pf-deposit-flat-amount",
    "select-pf-cancellation-policy-type",
    "textarea-pf-cancellation-policy",
    "button-pf-save",
  ];

  for (const testid of drawerControlTestids) {
    it(`pricing-fees-drawer.tsx renders data-testid="${testid}"`, () => {
      assert.match(drawerSrc, new RegExp(`data-testid="${testid}"`));
    });
  }

  it("never READS or WRITES a rate-bearing field (§18) — no '.revenueShareRate', no '% commission' input", () => {
    // The module doc is allowed to NAME revenueShareRate (explaining why it's absent); what must
    // never appear is an actual property access/assignment on it.
    assert.equal(/[.\[]\s*["']?revenueShareRate/.test(drawerSrc), false);
    assert.match(drawerSrc, /commission is not shown or set here/);
  });

  it("writes only through the existing PATCH + surcharge-tiers rails — no new endpoint literal", () => {
    assert.match(drawerSrc, /apiRequest\(\s*"PATCH",\s*`\/api\/provider\/services\/\$\{serviceId\}`/);
    assert.match(drawerSrc, /apiRequest\(\s*\n?\s*"PUT",\s*\n?\s*`\/api\/provider\/services\/\$\{serviceId\}\/surcharge-tiers`/);
  });
});

// ═══ Checklist integration (item 3): none of the moved fields is required-for-final ═══════════

describe("checklist integration — the required-for-final set was never touched", () => {
  const requiredSrc = readFileSync(resolve(__dirname, "../service-form-required.ts"), "utf-8");

  it("buildRequiredItems names no surcharge/deposit/cancellation id — nothing to redirect to the drawer", () => {
    for (const forbidden of ["surcharge", "deposit", "cancellation"]) {
      assert.equal(
        new RegExp(`id:\\s*["']${forbidden}`, "i").test(requiredSrc),
        false,
        `service-form-required.ts must not gain a required row for '${forbidden}' — S4 moved these fields, it did not change what is required for final submit`,
      );
    }
  });
});
