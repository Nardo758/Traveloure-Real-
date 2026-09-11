/**
 * OFFERING COMMERCE CONTRACT — the pure suite (lane OC-A2, ledger
 * `2026-09-11-offering-commerce-resolver`; implementation plan §2 OC-A2).
 *
 * WHY IT IS PINNED THIS HARD. The resolver has no production caller in this lane, so nothing else
 * can tell you it is wrong. It is also the module every later lane reads — OC-A4 refuses an
 * activation on it, OC-B1 snapshots it, OC-B2 routes checkout through it — so an archetype that is
 * quietly one row off becomes a wrong refusal, then a wrong snapshot, then a wrong charge.
 *
 * A1–A17 walk §9's master treatment matrix, one fixture per archetype. C1–C4 pin the composition
 * rules the design's §14 amendment made binding (the four existing classifiers are CALLED, the
 * fundamentals WIN, the disagreement is a FINDING). U1–U6 pin the refusals, which is where §13
 * lives: an unresolvable listing gets a machine-readable reason and never a nearest-looking
 * archetype. S1–S3 pin the provenance clause — seller-declared and platform-default are different
 * facts (plan §0 constraint 3).
 *
 * NEGATIVE SPACE: pure inputs, pure outputs, no database. It proves the resolver's decisions; it
 * proves nothing about which rows production actually holds, and nothing about any surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveOfferingCommerceContract,
  type CommerceArchetype,
  type OfferingCommerceInput,
  type OfferingCommerceContract,
} from "../services/offering-commerce-contract";

function resolved(input: OfferingCommerceInput): {
  contract: OfferingCommerceContract;
  findings: readonly { code: string }[];
} {
  const r = resolveOfferingCommerceContract(input);
  assert.equal(r.resolved, true, `expected a contract, got ${JSON.stringify(r)}`);
  if (!r.resolved) throw new Error("unreachable");
  return { contract: r.contract, findings: r.findings };
}

function refused(input: OfferingCommerceInput): { reason: string; detail: string } {
  const r = resolveOfferingCommerceContract(input);
  assert.equal(r.resolved, false, `expected a refusal, got ${JSON.stringify(r)}`);
  if (r.resolved) throw new Error("unreachable");
  return { reason: r.reason, detail: r.detail };
}

/** A provider listing with the two facts every row must carry to be classifiable at all. */
function providerListing(over: Partial<OfferingCommerceInput> = {}): OfferingCommerceInput {
  return {
    kind: "listing",
    sellerClass: "provider",
    serviceType: "experience",
    deliveryMethod: "in_person",
    categoryKey: "tour_guide",
    priceType: "fixed",
    ...over,
  } as OfferingCommerceInput;
}

function expertListing(over: Partial<OfferingCommerceInput> = {}): OfferingCommerceInput {
  return {
    kind: "listing",
    sellerClass: "expert",
    serviceType: "consultation",
    deliveryMethod: "video",
    offeringTypeKey: "ask_me_anything",
    priceType: "fixed",
    ...over,
  } as OfferingCommerceInput;
}

// ─── A · One fixture per §9 archetype ────────────────────────────────────────────────────────

test("A1 · E1 advisory session — an expert's live call attaches an engagement, never an obligation", () => {
  const { contract } = resolved(expertListing({ offeringTypeKey: "ask_me_anything", deliveryMethod: "call" }));
  assert.equal(contract.commerceArchetype, "E1");
  assert.equal(contract.sellerClass, "expert");
  assert.equal(contract.fulfillmentMode, "live_remote");
  assert.equal(contract.completionRule, "session_end");
  assert.equal(contract.slipEffect, "attach_support");
  assert.equal(contract.requiresItemLink, false);
  assert.deepEqual([...contract.requiredContext], ["topic"]);
});

test("A2 · E2 planning artifact — a planning-tier key is plan work, whatever it is delivered on", () => {
  const { contract } = resolved(
    expertListing({ offeringTypeKey: "full_itinerary", serviceType: "planning", deliveryMethod: "pdf" }),
  );
  assert.equal(contract.commerceArchetype, "E2");
  assert.equal(contract.fulfillmentMode, "async_artifact");
  assert.equal(contract.completionRule, "artifact_accepted");
  assert.equal(contract.slipEffect, "modify_plan");
  assert.equal(contract.allowsTripLevelProjection, true);
  assert.equal(contract.requiresFulfillmentEvidence, true);
});

test("A3 · E3 coordination — the coordination tier splits off E2 by TIER, the only fact that can", () => {
  const { contract } = resolved(
    expertListing({ offeringTypeKey: "booking_concierge", serviceType: "concierge", deliveryMethod: "async_messaging" }),
  );
  assert.equal(contract.commerceArchetype, "E3");
  assert.deepEqual([...contract.requiredContext], ["scope"]);
});

test("A3b · E3 — a PLANNER key is event coordination and attaches rather than modifying", () => {
  const { contract } = resolved(
    expertListing({ offeringTypeKey: "wedding_planner", serviceType: "concierge", deliveryMethod: "in_person" }),
  );
  assert.equal(contract.commerceArchetype, "E3");
  assert.equal(contract.slipEffect, "attach_support");
});

test("A4 · E4 live support window — support coverage attaches to the trip's dates", () => {
  const { contract, findings } = resolved(
    expertListing({ offeringTypeKey: "text_a_local", serviceType: "specialty", deliveryMethod: "async_messaging" }),
  );
  assert.equal(contract.commerceArchetype, "E4");
  assert.equal(contract.slipEffect, "attach_support");
  assert.deepEqual([...contract.requiredContext], ["support_window"]);
  // §9.1 completes E4 at the support window's end; the ruling-63 table says the seller declares.
  // The fundamentals win and the divergence is reported rather than silently reconciled.
  assert.equal(contract.completionRule, "seller_declared");
  assert.ok(findings.some((f) => f.code === "completion_rule_disagrees_with_archetype"));
});

test("A5 · E6 expert physical action — a place-anchored consult is a task, not a session", () => {
  const { contract } = resolved(
    expertListing({ offeringTypeKey: "personal_shopper", serviceType: "action", deliveryMethod: "in_person" }),
  );
  assert.equal(contract.commerceArchetype, "E6");
  assert.equal(contract.fulfillmentMode, "in_person");
  assert.deepEqual([...contract.requiredContext], ["location", "constraints", "expense_policy"]);
});

test("A6 · P1 scheduled place service — an instant in-person listing claims a native slot", () => {
  const { contract } = resolved(providerListing({ bookingMode: "instant", categoryKey: "photography" }));
  assert.equal(contract.commerceArchetype, "P1");
  assert.equal(contract.commitmentMode, "instant");
  assert.equal(contract.inventoryAuthority, "native_slot");
  assert.equal(contract.completionRule, "service_date");
  assert.equal(contract.slipEffect, "add_obligation");
  assert.equal(contract.requiresItemLink, true);
  assert.equal(contract.allowsTripLevelProjection, false);
  assert.deepEqual([...contract.requiredContext], ["slot_or_acceptance", "party_size", "meeting_point"]);
});

test("A7 · P2 live remote service — a video listing needs a slot and a timezone, never a meeting point", () => {
  const { contract } = resolved(
    providerListing({ deliveryMethod: "video", serviceType: "consultation", categoryKey: "photography" }),
  );
  assert.equal(contract.commerceArchetype, "P2");
  assert.equal(contract.fulfillmentMode, "live_remote");
  assert.deepEqual([...contract.requiredContext], ["slot_or_acceptance", "timezone"]);
  assert.ok(!contract.requiredContext.includes("meeting_point"));
});

test("A8 · P3 asynchronous artifact — a delivery WINDOW, never a fake appointment (§18)", () => {
  const { contract } = resolved(
    providerListing({
      deliveryMethod: "pdf",
      serviceType: "planning",
      categoryKey: "custom_other",
      bookingMode: "instant",
    }),
  );
  assert.equal(contract.commerceArchetype, "P3");
  assert.equal(contract.fulfillmentMode, "async_artifact");
  // An artifact has nothing to reserve, so an instantly-bought one claims no inventory at all.
  assert.equal(contract.inventoryAuthority, "none");
  assert.deepEqual([...contract.requiredContext], ["brief", "delivery_window"]);
  assert.ok(!contract.requiredContext.includes("slot_or_acceptance"));
});

test("A9 · P4 asynchronous messaging — a support window and an SLA", () => {
  const { contract } = resolved(
    providerListing({ deliveryMethod: "async_messaging", serviceType: "consultation", categoryKey: "custom_other" }),
  );
  assert.equal(contract.commerceArchetype, "P4");
  assert.deepEqual([...contract.requiredContext], ["support_window", "response_sla"]);
});

test("A10 · P5 custom quote — charged only after the quote, priced by the server", () => {
  const { contract } = resolved(providerListing({ priceType: "custom_quote", bookingMode: "request" }));
  assert.equal(contract.commerceArchetype, "P5");
  assert.equal(contract.commitmentMode, "quote_approve");
  assert.equal(contract.priceAuthority, "server_quote");
  assert.equal(contract.chargeMode, "after_quote");
});

test("A11 · P6 stay — the property owns inventory and the rate; completion is the checkout date", () => {
  const { contract } = resolved(
    providerListing({ productShape: "property", deliveryMethod: "in_person", categoryKey: "accommodation" }),
  );
  assert.equal(contract.commerceArchetype, "P6");
  assert.equal(contract.commitmentMode, "reserve_then_pay");
  assert.equal(contract.fulfillmentMode, "stay");
  assert.equal(contract.inventoryAuthority, "property_inventory");
  assert.equal(contract.priceAuthority, "property_rate");
  assert.equal(contract.completionRule, "checkout_date");
  assert.deepEqual([...contract.requiredContext], ["check_in", "check_out", "guests"]);
});

test("A12 · P7 bundle — completion is ALL components, never the first one", () => {
  const { contract } = resolved(providerListing({ productShape: "bundle", deliveryMethod: "in_person" }));
  assert.equal(contract.commerceArchetype, "P7");
  assert.equal(contract.fulfillmentMode, "bundle");
  assert.equal(contract.inventoryAuthority, "component_inventory");
  assert.equal(contract.completionRule, "all_components");
  assert.equal(contract.requiresFulfillmentEvidence, true);
});

test("A13 · P8 native transport — route endpoints and a pickup time, and no invented route", () => {
  const { contract } = resolved(providerListing({ categoryKey: "private_transportation" }));
  assert.equal(contract.commerceArchetype, "P8");
  assert.deepEqual([...contract.requiredContext], ["route_endpoints", "pickup_time"]);
});

test("A14 · T1 ready-made plan — a clone, not a service line", () => {
  const { contract } = resolved({ kind: "ready_made" });
  assert.equal(contract.commerceArchetype, "T1");
  assert.equal(contract.sellerClass, "traveloure");
  assert.equal(contract.fulfillmentMode, "plan_clone");
  assert.equal(contract.slipEffect, "clone_plan");
  assert.equal(contract.requiresItemLink, false);
});

test("A15 · T2 optimization — a Traveloure fee that modifies the plan", () => {
  const { contract } = resolved({ kind: "optimization" });
  assert.equal(contract.commerceArchetype, "T2");
  assert.equal(contract.chargeMode, "traveloure_fee_only");
  assert.equal(contract.slipEffect, "modify_plan");
});

test("A16 · X1 affiliate — external custody, and no platform charge of any kind (LD 43(c), §16)", () => {
  const { contract } = resolved({ kind: "external_partner" });
  assert.equal(contract.commerceArchetype, "X1");
  assert.equal(contract.commitmentMode, "external_handoff");
  assert.equal(contract.chargeMode, "external");
  assert.equal(contract.priceAuthority, "external_partner");
  assert.equal(contract.slipEffect, "record_external");
  assert.equal(contract.requiresFulfillmentEvidence, true);
});

test("A17 · N1 information — saved, never bought", () => {
  const { contract } = resolved({ kind: "information" });
  assert.equal(contract.commerceArchetype, "N1");
  assert.equal(contract.commitmentMode, "not_purchasable");
  assert.equal(contract.chargeMode, "none");
  assert.equal(contract.priceAuthority, "no_charge");
  assert.equal(contract.slipEffect, "planning_reference_only");
});

test("A18 · every archetype the suite reaches is one §9 declares, and the E-side covers all five", () => {
  const seen = new Set<CommerceArchetype>();
  for (const input of [
    expertListing({ offeringTypeKey: "ask_me_anything", deliveryMethod: "call" }),
    expertListing({ offeringTypeKey: "full_itinerary", deliveryMethod: "pdf" }),
    expertListing({ offeringTypeKey: "booking_concierge", deliveryMethod: "async_messaging" }),
    expertListing({ offeringTypeKey: "text_a_local", deliveryMethod: "async_messaging" }),
    expertListing({ offeringTypeKey: "personal_shopper", deliveryMethod: "in_person" }),
  ]) {
    const r = resolveOfferingCommerceContract(input);
    assert.equal(r.resolved, true);
    if (r.resolved) seen.add(r.contract.commerceArchetype);
  }
  assert.deepEqual([...seen].sort(), ["E1", "E2", "E3", "E4", "E6"]);
});

// ─── C · The composition rules the §14 amendment made binding ────────────────────────────────

test("C1 · an `aff_*` category is a partner row whoever listed it, and never a platform charge", () => {
  const { contract } = resolved(providerListing({ categoryKey: "aff_activities" }));
  assert.equal(contract.commerceArchetype, "X1");
  assert.equal(contract.sellerClass, "external_partner");
  assert.equal(contract.chargeMode, "external");
});

test("C2 · THE FUNDAMENTALS WIN, and the disagreement is a FINDING — P3 on voice notes", () => {
  // §9.2 files a voice-note package under P3 ("asynchronous artifact"); the service fundamentals
  // classify `voice_notes` as provider-declared async delivery, not an artifact file (ruling 69
  // disposition 8). The contract carries the FUNDAMENTALS' answer and reports the divergence.
  const { contract, findings } = resolved(
    providerListing({ deliveryMethod: "voice_notes", serviceType: "planning", categoryKey: "custom_other" }),
  );
  assert.equal(contract.commerceArchetype, "P3");
  assert.equal(contract.fulfillmentMode, "async_messaging");
  const finding = findings.find((f) => f.code === "fulfillment_mode_disagrees_with_archetype");
  assert.ok(finding, "expected the disagreement to surface as a finding, not to be reconciled silently");
});

test("C3 · a clean provider row produces NO findings — the mechanism is not noise", () => {
  const { findings } = resolved(providerListing({ bookingMode: "instant", categoryKey: "photography" }));
  assert.deepEqual(findings, []);
});

test("C4 · slipEffect follows impactClassFor — the same delivery method, two catalogs, two effects", () => {
  // Identical delivery shape. The only difference is which catalog recognises the row, and that is
  // exactly what `impactClassFor` is the authority on.
  const onGround = resolved(providerListing({ deliveryMethod: "in_person", categoryKey: "photography" }));
  const stay = resolved(
    providerListing({ deliveryMethod: "in_person", categoryKey: "accommodation", productShape: "property" }),
  );
  const consult = resolved(expertListing({ offeringTypeKey: "reality_check", deliveryMethod: "video" }));
  assert.equal(onGround.contract.slipEffect, "add_obligation");
  assert.equal(stay.contract.slipEffect, "add_obligation");
  assert.equal(consult.contract.slipEffect, "attach_support");
});

// ─── U · The refusals, which is where §13 lives ──────────────────────────────────────────────

test("U1 · the 61 fixtures: a category-shaped service_type is UNCLASSIFIED, not an error", () => {
  for (const value of ["florist", "av-equipment", "flights"]) {
    const { reason, detail } = refused(providerListing({ serviceType: value }));
    assert.equal(reason, "service_type_outside_declared_vocabulary");
    assert.ok(detail.includes(value));
    // The refusal explains that the column is left alone on purpose — the readers named in R-7
    // depend on those values, so a "cleanup" would break them.
    assert.ok(/R-7/.test(detail));
  }
});

test("U2 · a row with no delivery method and no product shape refuses, and never guesses one", () => {
  const { reason } = refused(providerListing({ deliveryMethod: null, productShape: null }));
  assert.equal(reason, "delivery_shape_unclassifiable");
});

test("U3 · a row neither catalog recognises has no slip effect to state, so it refuses", () => {
  const { reason } = refused(
    providerListing({ categoryKey: "not_a_real_category", offeringTypeKey: null }),
  );
  assert.equal(reason, "catalog_keys_unrecognised");
});

test("U4 · CONTRADICTORY: instant + custom_quote is §11's invalid combination", () => {
  const declared = refused(providerListing({ priceType: "custom_quote", bookingMode: "instant" }));
  assert.equal(declared.reason, "instant_commitment_with_custom_quote");
  assert.ok(declared.detail.includes("listing_declared"));
  // Inherited from the ACCOUNT flag, the combination is just as contradictory — and the refusal
  // says which of the two switches produced it, so the seller knows where to go.
  const inherited = refused(
    providerListing({ priceType: "custom_quote", bookingMode: null, ownerInstantBooking: true }),
  );
  assert.equal(inherited.reason, "instant_commitment_with_custom_quote");
  assert.ok(inherited.detail.includes("account_declared"));
  // P5 must not quietly "correct" the seller by overwriting instant with quote_approve.
  const r = resolveOfferingCommerceContract(
    providerListing({ priceType: "custom_quote", bookingMode: "instant" }),
  );
  assert.equal(r.resolved, false);
});

test("U5 · CONTRADICTORY: a downloadable artifact cannot require a physical meeting point", () => {
  const { reason } = refused(
    providerListing({ deliveryMethod: "pdf", categoryKey: "custom_other", hasMeetingPoint: true }),
  );
  assert.equal(reason, "artifact_delivery_with_meeting_point");
});

test("U6 · NOT PURCHASABLE is a contract, not a refusal — `hidden` resolves and charges nothing", () => {
  const { contract } = resolved(providerListing({ bookingMode: "hidden", categoryKey: "photography" }));
  assert.equal(contract.commitmentMode, "not_purchasable");
  assert.equal(contract.commitmentModeSource, "listing_declared");
  assert.equal(contract.chargeMode, "none");
  assert.equal(contract.priceAuthority, "no_charge");
  assert.equal(contract.inventoryAuthority, "none");
  // It still says what it would do to a plan; it simply cannot be bought.
  assert.equal(contract.slipEffect, "add_obligation");
});

test("U7 · every refusal carries a reason AND a sentence — a refusal is never a bare code (§13)", () => {
  for (const input of [
    providerListing({ serviceType: "florist" }),
    providerListing({ deliveryMethod: null, productShape: null }),
    providerListing({ categoryKey: "nope" }),
    providerListing({ priceType: "custom_quote", bookingMode: "instant" }),
    providerListing({ deliveryMethod: "pdf", categoryKey: "custom_other", hasMeetingPoint: true }),
  ]) {
    const { reason, detail } = refused(input);
    assert.ok(reason.length > 0);
    assert.ok(detail.length > 20, `reason "${reason}" has no explanation`);
  }
});

// ─── S · Seller-declared and platform-default are different facts ────────────────────────────

test("S1 · a stored booking mode is the SELLER's declaration, at the listing", () => {
  const { contract } = resolved(providerListing({ bookingMode: "request", ownerInstantBooking: true }));
  assert.equal(contract.commitmentMode, "request_accept");
  assert.equal(contract.commitmentModeSource, "listing_declared");
});

test("S2 · an unset mode with a real account flag is the seller's declaration, at the account", () => {
  const { contract } = resolved(providerListing({ bookingMode: null, ownerInstantBooking: true }));
  assert.equal(contract.commitmentMode, "instant");
  assert.equal(contract.commitmentModeSource, "account_declared");
});

test("S3 · no stored mode and NO account flag is PLATFORM_DEFAULT — 64 of 67 production listings", () => {
  const { contract } = resolved(providerListing({ bookingMode: null, ownerInstantBooking: undefined }));
  assert.equal(contract.commitmentMode, "request_accept");
  assert.equal(contract.commitmentModeSource, "platform_default");
  // The same mode a seller could have chosen. Only the source tells them apart, which is the whole
  // reason the axis carries one (plan §0 constraint 3).
  const chosen = resolved(providerListing({ bookingMode: null, ownerInstantBooking: false }));
  assert.equal(chosen.contract.commitmentMode, contract.commitmentMode);
  assert.notEqual(chosen.contract.commitmentModeSource, contract.commitmentModeSource);
});

test("S4 · a request-mode listing is charged AFTER acceptance; a deposit listing splits the charge", () => {
  const request = resolved(providerListing({ bookingMode: "request", categoryKey: "photography" }));
  assert.equal(request.contract.chargeMode, "after_acceptance");
  assert.equal(request.contract.inventoryAuthority, "seller_acceptance");
  const deposit = resolved(
    providerListing({ bookingMode: "instant", depositEnabled: true, categoryKey: "photography" }),
  );
  assert.equal(deposit.contract.chargeMode, "deposit_balance");
});

test("S5 · the contract states a version and never states a policy it cannot source (§13)", () => {
  const { contract } = resolved(providerListing({ categoryKey: "photography" }));
  assert.equal(contract.contractVersion, 1);
  for (const absent of ["cancellationPolicyId", "reschedulePolicyId", "disputePolicyId"]) {
    assert.ok(!(absent in contract), `${absent} has no column to source it and must not be emitted`);
  }
});
