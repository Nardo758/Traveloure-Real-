/**
 * FP-2 / Package A item 4 — the wizard's required-field set (pure unit; no DB, no browser).
 *
 * THE RULE UNDER TEST is two-way: **the asterisk set equals the enforced set.** The audit found
 * it broken in both directions — asterisked fields no client check looked at, and enforced blocks
 * wearing no asterisk — so the negatives here matter as much as the positives:
 *
 *   NEGATIVES: nothing that no layer enforces may appear in this list (Description and Duration
 *   are the two that used to carry a false asterisk), and an EXPERT must not inherit a
 *   provider-only publish gate (their submit writes `status:'draft'`, which the server's gates
 *   exempt).
 *   POSITIVES: price, required category fields and the attestation confirmations — the three the
 *   audit proved were enforced-but-unrouted or asterisked-but-unchecked.
 *
 * Run: npx tsx --test client/src/lib/__tests__/service-form-required.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryFieldUnanswered,
  effectivePriceScalar,
  missingRequiredForFinal,
  type ServiceFormRequiredInput,
} from "../service-form-required";

/** A complete, VALID provider listing — every test starts from "nothing is missing". */
function completeProvider(over: Partial<ServiceFormRequiredInput> = {}): ServiceFormRequiredInput {
  return {
    role: "provider",
    isEditMode: false,
    name: "Morning Tea Ceremony in a Machiya",
    categoryId: "cat-arts",
    offeringCategoryUnresolved: false,
    serviceOfferingTypeId: "off-tea",
    expertOfferingTypeId: "",
    needsMeetingPoint: true,
    meetingPoint: "Hanamikoji-dori, Gion",
    deliveryMethod: "in-person",
    serviceFile: "",
    deliverableUploaded: false,
    priceType: "Fixed",
    basePrice: 68,
    pricingTiers: [],
    categoryFields: [],
    categoryAttributes: {},
    attestationGateBlocked: false,
    ...over,
  };
}

const labels = (input: ServiceFormRequiredInput) => missingRequiredForFinal(input).map((m) => m.label);

// ── NEGATIVES FIRST ───────────────────────────────────────────────────────────────────────────

test("N1: a complete provider listing is missing NOTHING", () => {
  assert.deepEqual(missingRequiredForFinal(completeProvider()), []);
});

test("N2: no un-enforced field can enter the list — Description and Duration are NOT required", () => {
  // Neither exists as an input at all, which is the structural version of this assertion: the
  // predicate cannot block on a field it never receives. Both were asterisked in the wizard while
  // `provider_services.description` / `delivery_timeframe` are nullable and no publish gate reads
  // them; FP-2 removed the asterisks rather than inventing a client-only block.
  const complete = completeProvider();
  assert.equal("description" in complete, false);
  assert.equal("duration" in complete, false);
  assert.deepEqual(missingRequiredForFinal(complete), []);
});

test("N3: an EXPERT does not inherit the provider-only publish gates", () => {
  // The server's price / deliverable gates key on `status:'active'`, which only a provider's
  // final action sends. An expert with no price and an empty pdf deliverable must still be able
  // to submit for review (their write is `status:'draft'`).
  const expert = completeProvider({
    role: "expert",
    serviceOfferingTypeId: "",
    expertOfferingTypeId: "tier-1",
    basePrice: 0,
    deliveryMethod: "pdf",
    needsMeetingPoint: false,
    serviceFile: "",
  });
  assert.deepEqual(missingRequiredForFinal(expert), []);
});

test("N4: a remote listing is never asked for a meeting point or a deliverable", () => {
  const remote = completeProvider({
    deliveryMethod: "call",
    needsMeetingPoint: false,
    meetingPoint: "",
  });
  assert.deepEqual(missingRequiredForFinal(remote), []);
});

test("N5: a boolean category field marked required is never 'missing' — false is an answer", () => {
  const withBool = completeProvider({
    categoryFields: [{ fieldKey: "wheelchair", label: "Wheelchair accessible", type: "boolean", required: true }],
    categoryAttributes: { wheelchair: false },
  });
  assert.deepEqual(missingRequiredForFinal(withBool), []);
  assert.equal(categoryFieldUnanswered({ fieldKey: "b", label: "B", type: "boolean", required: true }, false), false);
  // …and an OPTIONAL field left blank is not missing either.
  assert.equal(categoryFieldUnanswered({ fieldKey: "x", label: "X", type: "text", required: false }, ""), false);
});

// ── POSITIVES — the three FP-2 bound ─────────────────────────────────────────────────────────

test("P1: PRICE now binds for a provider (mirrors the server's PRICE_REQUIRED gate)", () => {
  assert.deepEqual(labels(completeProvider({ basePrice: 0 })), ["Price"]);
  assert.deepEqual(labels(completeProvider({ basePrice: "" })), ["Price"]);
  // The step is named so the "still needed" link can jump there.
  assert.equal(missingRequiredForFinal(completeProvider({ basePrice: 0 }))[0].step, 1);
});

test("P2: a package-tiers listing is judged on its LOWEST POSITIVE TIER, as the server is", () => {
  const tiers = completeProvider({ priceType: "Package tiers", basePrice: 0, pricingTiers: [{ price: "120" }, { price: "80" }] });
  assert.deepEqual(missingRequiredForFinal(tiers), []);
  assert.equal(effectivePriceScalar(tiers), 80);
  // No positive tier ⇒ missing, and it says which thing is missing.
  const empty = completeProvider({ priceType: "Package tiers", basePrice: 0, pricingTiers: [{ price: "0" }, { price: "" }] });
  assert.equal(effectivePriceScalar(empty), null);
  assert.deepEqual(labels(empty), ["A package tier with a price above zero"]);
});

test("P3: a REQUIRED category field binds, by its own label", () => {
  const transport = completeProvider({
    categoryFields: [
      { fieldKey: "vehicle_type", label: "Vehicle Type", type: "select", required: true },
      { fieldKey: "seats", label: "Number of Seats", type: "number", required: true },
      { fieldKey: "notes", label: "Notes", type: "text", required: false },
    ],
    categoryAttributes: { vehicle_type: "", seats: 6 },
  });
  assert.deepEqual(labels(transport), ["Vehicle Type"]);
  assert.equal(missingRequiredForFinal(transport)[0].step, 2);
  // A multiselect with nothing picked is unanswered; one pick answers it.
  const multi = completeProvider({
    categoryFields: [{ fieldKey: "langs", label: "Languages", type: "multiselect", required: true }],
    categoryAttributes: { langs: [] },
  });
  assert.deepEqual(labels(multi), ["Languages"]);
});

test("P4: an ENFORCED block that wore no asterisk now names itself (attestations)", () => {
  const blocked = completeProvider({ attestationGateBlocked: true });
  assert.deepEqual(labels(blocked), ["The confirmations on Terms & requirements"]);
  assert.equal(missingRequiredForFinal(blocked)[0].step, 4);
});

// ── The pre-FP-2 checks are UNCHANGED (no regression on what already bound) ───────────────────

test("P5: name / category / offering / meeting point / deliverable still bind exactly as before", () => {
  assert.deepEqual(labels(completeProvider({ name: "" })), ["Service name"]);
  assert.deepEqual(labels(completeProvider({ categoryId: "" })), ["Category"]);
  assert.deepEqual(
    labels(completeProvider({ categoryId: "", offeringCategoryUnresolved: true })),
    ["Category — this offering resolves to no category (see Step 1)"],
  );
  assert.deepEqual(labels(completeProvider({ serviceOfferingTypeId: "" })), ["An offering from the catalog"]);
  assert.deepEqual(labels(completeProvider({ meetingPoint: "   " })), ["Meeting point"]);
  assert.deepEqual(
    labels(completeProvider({ deliveryMethod: "pdf", needsMeetingPoint: false, meetingPoint: "", serviceFile: "" })),
    ["Deliverable file (upload or link)"],
  );
  // An uploaded deliverable satisfies it without a pasted URL (ruling 58's protected rail).
  assert.deepEqual(
    labels(completeProvider({ deliveryMethod: "pdf", needsMeetingPoint: false, meetingPoint: "", deliverableUploaded: true })),
    [],
  );
  // EDIT mode grandfathers the offering link (an existing row need not re-pick one).
  assert.deepEqual(labels(completeProvider({ isEditMode: true, serviceOfferingTypeId: "" })), []);
});

test("P6: every entry carries a step in range, so the jump link can never point nowhere", () => {
  const everythingMissing = completeProvider({
    name: "",
    categoryId: "",
    serviceOfferingTypeId: "",
    basePrice: 0,
    meetingPoint: "",
    deliveryMethod: "pdf",
    categoryFields: [{ fieldKey: "vehicle_type", label: "Vehicle Type", type: "select", required: true }],
    categoryAttributes: {},
    attestationGateBlocked: true,
  });
  const missing = missingRequiredForFinal(everythingMissing);
  assert.ok(missing.length >= 7, `expected every gate to report, got ${missing.length}`);
  for (const m of missing) {
    assert.ok(m.step >= 1 && m.step <= 4, `${m.label} points at step ${m.step}`);
    assert.ok(m.label.trim().length > 0);
  }
});
