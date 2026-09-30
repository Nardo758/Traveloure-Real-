/**
 * buy-action.test.ts — the buy-side resolver's decision table, pinned.
 *
 * Lane L23 (Console & AI Concierge brief §11.5); ledger `2026-09-07-buy-action-resolver`.
 * Register §A4 ratified ruling 9 (ONE resolver authors the buy button and the landing rule) and
 * ruling 10 (untimed items are their own group, never hidden and never given a time).
 *
 * WHY THIS EXISTS. `resolveBuyAction` is the single author of every buy button on the platform,
 * so a wrong row here is a wrong button on every surface at once — and the failure mode is silent:
 * a plausible-looking button that lands in the wrong store. The table is the implementation, so
 * the table is what is pinned, row by row, in the order §11.5 gives.
 *
 * PURE — no DB, no browser, no clock, no network. The module imports none of those by design.
 *
 *   T1-T14   every row of the table, in order, with the buyer states that can reach it
 *   A1-A3    the `ask` conventions (sign_in?, which_plan?, and the `one`-plan silence)
 *   L1-L3    the landing halves: guest cart, forksFinal, and ruling 10's untimed group
 *   N1       a listing carrying its own CTA field is IGNORED (ruling 9 — no listing has a CTA)
 *   N2       a hidden or non-live row never yields a booking verb
 *   N3       an advisor never yields a landing for a guest
 *   N4       a partner row never lands in `checkout` (LD 43(c), §16 — no platform charge)
 *   S1-S3    §13: an absent fact never becomes a booking verb, and carries its reason
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveBuyAction,
  platformListingBookability,
  type BuyAction,
  type BuyActionBuyer,
  type BuyActionRow,
} from "../buy-action";

const GUEST: BuyActionBuyer = { principal: "guest", plans: "none" };
const MEMBER_NO_PLANS: BuyActionBuyer = { principal: "member", plans: "none" };
const MEMBER_ONE_PLAN: BuyActionBuyer = { principal: "member", plans: "one" };
const MEMBER_MANY: BuyActionBuyer = { principal: "member", plans: "many" };
const MEMBER_CHIP: BuyActionBuyer = { principal: "member", plans: "many", chipTripId: "trip-1" };
const MEMBER_CHIP_FINAL: BuyActionBuyer = {
  principal: "member",
  plans: "many",
  chipTripId: "trip-1",
  chipPlanIsFinal: true,
};

/** An in-app-bookable platform listing, live, priced, in person, with a published calendar. */
function listing(over: Partial<BuyActionRow> = {}): BuyActionRow {
  return {
    kind: "listing",
    bookability: "native",
    deliveryMethod: "in_person",
    bookingMode: "instant",
    hasPrice: true,
    hasPublishedAvailability: true,
    isLive: true,
    ...over,
  };
}

function advisor(over: Partial<BuyActionRow> = {}): BuyActionRow {
  return { kind: "advisor", bookability: "info_only", hasPrice: false, isLive: true, ...over };
}

function readyMade(over: Partial<BuyActionRow> = {}): BuyActionRow {
  return { kind: "ready_made", bookability: "native", hasPrice: true, isLive: true, ...over };
}

function partner(over: Partial<BuyActionRow> = {}): BuyActionRow {
  return { kind: "partner", bookability: "deeplink", hasPrice: true, isLive: true, ...over };
}

const kinds = (a: BuyAction) => [a.primary.kind, a.secondary?.kind ?? null];

// ── T1-T14 · the table, row by row ───────────────────────────────────────────────────────────

test("T1: a non-live row, or one the provider hid, yields Contact (with a handle) or nothing", () => {
  const hidden = resolveBuyAction(listing({ bookingMode: "hidden", sellerHandle: "kyoto-ken" }), MEMBER_CHIP);
  assert.equal(hidden.primary.kind, "message");
  assert.equal(hidden.primary.label, "Contact");
  assert.equal(hidden.landing.store, "none");
  assert.equal(hidden.refusal?.reason, "not_available");

  const dark = resolveBuyAction(listing({ isLive: false }), MEMBER_CHIP);
  assert.equal(dark.primary.kind, "none", "no handle ⇒ no address to offer (LD 40)");
  assert.equal(dark.refusal?.reason, "not_available");
  assert.deepEqual(dark.ask, [], "§11.5 gives row 1 no ask");
});

test("T2: advisor + guest — sign in, no landing, and the refusal says why", () => {
  const a = resolveBuyAction(advisor({ sellerName: "Ken" }), GUEST);
  assert.equal(a.primary.kind, "plan_with");
  assert.equal(a.primary.label, "Plan with Ken");
  assert.deepEqual(a.ask, ["sign_in"]);
  assert.equal(a.landing.store, "none");
  assert.equal(a.refusal?.reason, "sign_in_and_start_a_plan");
});

test("T3: advisor + member with no plans — which_plan first, then the advisor request", () => {
  const a = resolveBuyAction(advisor(), MEMBER_NO_PLANS);
  assert.equal(a.primary.kind, "plan_with");
  assert.equal(a.primary.label, "Plan with this expert", "no name is ever invented (§13)");
  assert.deepEqual(a.ask, ["which_plan"]);
  assert.equal(a.landing.store, "advisor_request");
  assert.equal(a.secondary, undefined, "§11.5 row 3 carries no secondary");
});

test("T4: advisor + member with a chip — nothing to ask; Message is the secondary", () => {
  const a = resolveBuyAction(advisor(), MEMBER_CHIP);
  assert.deepEqual(kinds(a), ["plan_with", "message"]);
  assert.deepEqual(a.ask, []);
  assert.equal(a.landing.store, "advisor_request");
});

test("T5: advisor + member with many plans and no chip — which_plan", () => {
  const a = resolveBuyAction(advisor(), MEMBER_MANY);
  assert.deepEqual(kinds(a), ["plan_with", "message"]);
  assert.deepEqual(a.ask, ["which_plan"]);
  assert.equal(a.landing.store, "advisor_request");
});

test("T6: ready-made + guest — sign in, then the clone", () => {
  const a = resolveBuyAction(readyMade(), GUEST);
  assert.equal(a.primary.kind, "buy_ready_made");
  assert.equal(a.primary.label, "Get this trip");
  assert.deepEqual(a.ask, ["sign_in"]);
  assert.equal(a.landing.store, "clone");
});

test("T7: ready-made + member — the clone is a NEW slip, never merged into an existing plan", () => {
  const a = resolveBuyAction(readyMade(), MEMBER_CHIP);
  assert.deepEqual(a.ask, []);
  assert.equal(a.landing.store, "clone");
  assert.equal(a.landing.forksFinal, false, "a clone is not a plan landing");
});

test("T8: partner, bookable — the agent rail, never an off-site booking CTA (§16)", () => {
  const member = resolveBuyAction(partner(), MEMBER_CHIP);
  assert.equal(member.primary.kind, "agent_rail");
  assert.equal(member.primary.label, "Request booking");
  assert.deepEqual(member.ask, []);
  assert.equal(member.landing.store, "partner_request");

  assert.deepEqual(resolveBuyAction(partner(), GUEST).ask, ["sign_in"]);
});

test("T8b: the partner branch DELEGATES the content-type call to resolveContentCTA", () => {
  // An affiliate row typed informational is a tracked view even though its bookability is a
  // deeplink — the content-type map owns that call, and this wraps it rather than re-testing it.
  const informational = resolveBuyAction(
    partner({ content: { type: "affiliate", bookingType: "informational" } }),
    MEMBER_CHIP,
  );
  assert.equal(informational.primary.kind, "tracked_view");

  const bookable = resolveBuyAction(
    partner({ bookability: "info_only", content: { type: "affiliate", bookingType: "affiliate_bookable" } }),
    MEMBER_CHIP,
  );
  assert.equal(bookable.primary.kind, "agent_rail");
});

test("T9: partner, info-only — View details, no landing, and never a booking verb", () => {
  const a = resolveBuyAction(partner({ bookability: "info_only" }), GUEST);
  assert.equal(a.primary.kind, "tracked_view");
  assert.equal(a.primary.label, "View details");
  assert.equal(a.landing.store, "none");
});

test("T10: listing, info-only — Add to plan, with the row's own fulfilment facts", () => {
  const a = resolveBuyAction(listing({ bookability: "info_only" }), MEMBER_CHIP);
  assert.deepEqual(kinds(a), ["add_to_plan", "message"]);
  assert.equal(a.landing.store, "plan");
  assert.equal(a.landing.timed, true, "in_person needs scheduling");
  assert.equal(a.landing.placeAnchored, true);
});

test("T11: request mode — Request to book, a pending booking, never a charge", () => {
  const a = resolveBuyAction(listing({ bookingMode: "request" }), MEMBER_CHIP);
  assert.deepEqual(kinds(a), ["request_to_book", "add_to_plan"]);
  assert.equal(a.primary.label, "Request to book");
  assert.deepEqual(a.ask, ["party"]);
  assert.equal(a.landing.store, "booking_request");
  assert.notEqual(a.landing.store, "checkout");
  assert.equal(a.refusal, undefined, "the provider CHOSE request — nothing is missing");
});

test("T12: instant + scheduled + a published calendar — Book, slot then party", () => {
  const a = resolveBuyAction(listing(), MEMBER_CHIP);
  assert.deepEqual(kinds(a), ["book", "add_to_plan"]);
  assert.equal(a.primary.label, "Book");
  assert.deepEqual(a.ask, ["slot", "party"]);
  assert.equal(a.landing.store, "checkout");
  assert.equal(a.landing.timed, true);
  assert.equal(a.landing.placeAnchored, true);
});

test("T13: instant + artifact or provider-declared — Book, and the row is UNTIMED (ruling 10)", () => {
  for (const method of ["pdf", "async_messaging", "voice_notes"]) {
    const a = resolveBuyAction(
      listing({ deliveryMethod: method, hasPublishedAvailability: false }),
      MEMBER_CHIP,
    );
    assert.equal(a.primary.kind, "book", method);
    assert.deepEqual(a.ask, [], `${method} asks no slot and no party`);
    assert.equal(a.landing.store, "checkout", method);
    assert.equal(a.landing.timed, false, `${method} is never given a time (ruling 10)`);
    assert.equal(a.landing.placeAnchored, false, method);
  }
});

test("T14: §13 fallback — a fact the payload could not state never becomes a booking verb", () => {
  const noMode = resolveBuyAction(listing({ bookingMode: null }), MEMBER_CHIP);
  assert.deepEqual(kinds(noMode), ["add_to_plan", "message"]);
  assert.equal(noMode.landing.store, "plan");
  assert.equal(noMode.refusal?.reason, "booking_affordance_unknown");
});

// ── A1-A3 · the ask conventions ──────────────────────────────────────────────────────────────

test("A1: sign_in? leads the ask for a guest, on every listing row that lands somewhere", () => {
  assert.deepEqual(resolveBuyAction(listing(), GUEST).ask, ["sign_in", "slot", "party"]);
  assert.deepEqual(resolveBuyAction(listing({ bookingMode: "request" }), GUEST).ask, ["sign_in", "party"]);
  assert.deepEqual(resolveBuyAction(listing({ bookability: "info_only" }), GUEST).ask, ["sign_in"]);
});

test("A2: which_plan? for a member with none, or many-and-no-chip — and NEVER for a guest", () => {
  assert.deepEqual(resolveBuyAction(listing({ bookability: "info_only" }), MEMBER_NO_PLANS).ask, ["which_plan"]);
  assert.deepEqual(resolveBuyAction(listing({ bookability: "info_only" }), MEMBER_MANY).ask, ["which_plan"]);
  assert.deepEqual(resolveBuyAction(listing({ bookability: "info_only" }), MEMBER_CHIP).ask, []);
  // A guest has no plans to choose between; their add lands in the guest cart.
  assert.equal(resolveBuyAction(listing({ bookability: "info_only" }), GUEST).ask.includes("which_plan"), false);
});

test("A3: a member with exactly one plan is not asked which one — there is one, and it is that one", () => {
  assert.deepEqual(resolveBuyAction(listing({ bookability: "info_only" }), MEMBER_ONE_PLAN).ask, []);
  assert.deepEqual(resolveBuyAction(advisor(), MEMBER_ONE_PLAN).ask, []);
});

// ── L1-L3 · the landing half ─────────────────────────────────────────────────────────────────

test("L1: a guest's Add to plan lands in the guest cart, and the descriptor says so", () => {
  const a = resolveBuyAction(listing({ bookability: "info_only" }), GUEST);
  assert.equal(a.landing.store, "guest_cart");
  assert.equal(a.landing.forksFinal, false, "a guest cart has no final plan to fork");
});

test("L2: forksFinal is true only for a PLAN landing whose chipped plan is final", () => {
  assert.equal(resolveBuyAction(listing({ bookability: "info_only" }), MEMBER_CHIP_FINAL).landing.forksFinal, true);
  assert.equal(resolveBuyAction(listing({ bookability: "info_only" }), MEMBER_CHIP).landing.forksFinal, false);
  // A checkout landing is not a plan landing, so it never forks.
  assert.equal(resolveBuyAction(listing(), MEMBER_CHIP_FINAL).landing.forksFinal, false);
});

test("L3: a remote scheduled listing is timed but NOT place-anchored", () => {
  for (const method of ["call", "video"]) {
    const a = resolveBuyAction(listing({ deliveryMethod: method }), MEMBER_CHIP);
    assert.equal(a.landing.timed, true, method);
    assert.equal(a.landing.placeAnchored, false, method);
  }
});

// ── N1-N4 · negatives ────────────────────────────────────────────────────────────────────────

test("N1: a listing carrying its own CTA field is IGNORED — a listing has no CTA (ruling 9)", () => {
  const withCta = { ...listing(), ctaLabel: "Buy now!!", cta: "checkout", buttonKind: "book" } as BuyActionRow;
  assert.deepEqual(resolveBuyAction(withCta, MEMBER_CHIP), resolveBuyAction(listing(), MEMBER_CHIP));
});

test("N2: a hidden or non-live row never yields a booking verb, for any buyer", () => {
  const verbs = new Set(["book", "request_to_book", "buy_ready_made", "agent_rail", "add_to_plan"]);
  for (const buyer of [GUEST, MEMBER_NO_PLANS, MEMBER_ONE_PLAN, MEMBER_MANY, MEMBER_CHIP]) {
    for (const row of [
      listing({ bookingMode: "hidden" }),
      listing({ isLive: false }),
      advisor({ isLive: false }),
      readyMade({ isLive: false }),
      partner({ isLive: false }),
    ]) {
      const a = resolveBuyAction(row, buyer);
      assert.equal(verbs.has(a.primary.kind), false, `${a.primary.kind} on a dark row`);
      assert.equal(a.landing.store, "none");
    }
  }
});

test("N3: an advisor never yields a landing for a guest", () => {
  const a = resolveBuyAction(advisor({ sellerHandle: "ken" }), GUEST);
  assert.equal(a.landing.store, "none");
  assert.notEqual(a.landing.store, "advisor_request");
});

test("N4: a partner row never lands in checkout — a partner takes that payment (LD 43(c), §16)", () => {
  for (const buyer of [GUEST, MEMBER_NO_PLANS, MEMBER_MANY, MEMBER_CHIP]) {
    for (const bookability of ["native", "deeplink", "info_only"] as const) {
      const a = resolveBuyAction(partner({ bookability }), buyer);
      assert.notEqual(a.landing.store, "checkout");
      assert.notEqual(a.landing.store, "plan");
      assert.notEqual(a.primary.kind, "book");
    }
  }
});

// ── S1-S3 · §13, the absences ────────────────────────────────────────────────────────────────

test("S1: no published price ⇒ a request, never a checkout, and the reason is carried", () => {
  const a = resolveBuyAction(listing({ hasPrice: false }), MEMBER_CHIP);
  assert.equal(a.primary.kind, "request_to_book");
  assert.equal(a.landing.store, "booking_request");
  assert.equal(a.refusal?.reason, "no_published_price");
});

test("S2: availability stated as absent ⇒ a request; availability UNKNOWN ⇒ no booking verb at all", () => {
  const stated = resolveBuyAction(listing({ hasPublishedAvailability: false }), MEMBER_CHIP);
  assert.equal(stated.primary.kind, "request_to_book");
  assert.equal(stated.refusal?.reason, "availability_unknown");

  // undefined is NOT false: the payload did not answer, so nothing is claimed in either direction.
  const unknown = resolveBuyAction(listing({ hasPublishedAvailability: undefined }), MEMBER_CHIP);
  assert.equal(unknown.primary.kind, "add_to_plan");
  assert.equal(unknown.landing.store, "plan");
  assert.equal(unknown.refusal?.reason, "availability_unknown");
});

test("S3: an unclassifiable listing is never given a fulfilment shape", () => {
  const a = resolveBuyAction(listing({ deliveryMethod: null, productShape: null }), MEMBER_CHIP);
  assert.equal(a.primary.kind, "add_to_plan");
  assert.equal(a.refusal?.reason, "delivery_method_unstated");
  assert.equal(a.landing.timed, false);
  assert.equal(a.landing.placeAnchored, false);
});

test("S4: a property outranks its delivery method — placed and scheduled either way", () => {
  const a = resolveBuyAction(listing({ deliveryMethod: "pdf", productShape: "property" }), MEMBER_CHIP);
  assert.equal(a.landing.timed, true);
  assert.equal(a.landing.placeAnchored, true);
});

test("S5: a platform listing's bookability comes from resolveBookability, not a literal", () => {
  assert.equal(platformListingBookability("svc-1"), "native");
});
