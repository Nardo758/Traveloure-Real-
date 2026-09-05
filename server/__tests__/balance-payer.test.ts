/**
 * WHO MAY PAY A BALANCE — the authorization half of ledger `2026-09-04-cost-split-phase-one`,
 * provable with no database, no server and no Stripe.
 *
 * `canPayBalance` is the ONE thing that decides whether a session user may settle a deposit-paid
 * booking's outstanding balance. It is the only widening this lane makes to a money endpoint, so
 * every rule it carries is pinned here — including the ones that must REFUSE:
 *
 *   B1  OWNER — the pre-ruling rule, unchanged. `service_bookings.traveler_id` always passes.
 *   B2  PAYER PARTICIPANT — a `trip_participants` row on the booking's OWN trip whose `user_id` is
 *       the session user and whose `role` is exactly `payer`.
 *   B3  ANY OTHER ROLE REFUSES — `guest`, `organizer`, a near-miss spelling. The role string is a
 *       money grant; a fuzzy comparison here is how one leaks.
 *   B4  A PAYER ON A DIFFERENT TRIP REFUSES — the trip is re-checked on the row itself, not
 *       assumed from the query that fetched it.
 *   B5  A PARTICIPANT WITH A NULL `user_id` REFUSES — a non-registered guest is not an account,
 *       so it can never be the authenticated actor.
 *   B6  AN UNKNOWN USER REFUSES, and so does a blank/absent session id: a missing actor is never
 *       treated as the owner.
 *
 * Run solo: npx tsx --test server/__tests__/balance-payer.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canPayBalance, buildBalanceIdempotencyKey } from "../services/balance-payer.service";

const OWNER = "user-owner";
const COLLABORATOR = "user-collab";
const STRANGER = "user-stranger";
const TRIP = "trip-1";
const OTHER_TRIP = "trip-2";

/** A deposit-paid booking owned by OWNER, belonging to TRIP. */
const BOOKING = { travelerId: OWNER, tripId: TRIP };

const payerRow = (userId: string | null, tripId: string = TRIP) => ({ tripId, userId, role: "payer" });

test("B1 — the booking's owner may always pay, with no participant rows at all", () => {
  const decision = canPayBalance(BOOKING, OWNER, []);
  assert.equal(decision.allowed, true);
  assert.equal(decision.allowed && decision.payerKind, "owner");
});

test("B1b — the owner passes even on a booking with NO trip (owner-only is the floor)", () => {
  const decision = canPayBalance({ travelerId: OWNER, tripId: null }, OWNER, []);
  assert.equal(decision.allowed, true);
  assert.equal(decision.allowed && decision.payerKind, "owner");
});

test("B2 — a `payer` participant on the SAME trip may pay", () => {
  const decision = canPayBalance(BOOKING, COLLABORATOR, [payerRow(COLLABORATOR)]);
  assert.equal(decision.allowed, true);
  assert.equal(decision.allowed && decision.payerKind, "participant_payer");
});

test("B2b — a booking with NO trip stays owner-only: a payer row cannot reach it", () => {
  const decision = canPayBalance({ travelerId: OWNER, tripId: null }, COLLABORATOR, [payerRow(COLLABORATOR)]);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.reason, "not_owner_and_no_payer_role");
});

test("B3 — every role that is not exactly `payer` is refused", () => {
  for (const role of [
    "guest",
    "organizer",
    "co-organizer",
    "vendor_contact",
    "Payer", // case is not folded — a money grant is not fuzzy-matched
    " payer", // nor is whitespace trimmed
    "payers",
    "",
    null,
    undefined,
  ]) {
    const decision = canPayBalance(BOOKING, COLLABORATOR, [
      { tripId: TRIP, userId: COLLABORATOR, role: role as any },
    ]);
    assert.equal(decision.allowed, false, `role ${JSON.stringify(role)} must not authorize a balance payment`);
    assert.equal(!decision.allowed && decision.reason, "not_owner_and_no_payer_role");
  }
});

test("B4 — a `payer` on a DIFFERENT trip is refused", () => {
  const decision = canPayBalance(BOOKING, COLLABORATOR, [payerRow(COLLABORATOR, OTHER_TRIP)]);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.reason, "not_owner_and_no_payer_role");
});

test("B5 — a participant row with a NULL user_id is refused (a guest is not an account)", () => {
  const decision = canPayBalance(BOOKING, COLLABORATOR, [payerRow(null), { tripId: TRIP, userId: "  ", role: "payer" }]);
  assert.equal(decision.allowed, false);
  assert.equal(!decision.allowed && decision.reason, "not_owner_and_no_payer_role");
});

test("B6 — an unknown user, a blank session and an absent booking all refuse", () => {
  const stranger = canPayBalance(BOOKING, STRANGER, [payerRow(COLLABORATOR)]);
  assert.equal(stranger.allowed, false);
  assert.equal(!stranger.allowed && stranger.reason, "not_owner_and_no_payer_role");

  for (const blank of [null, undefined, "", "   "]) {
    const decision = canPayBalance(BOOKING, blank as any, [payerRow(COLLABORATOR)]);
    assert.equal(decision.allowed, false, `session id ${JSON.stringify(blank)} must never authorize`);
    assert.equal(!decision.allowed && decision.reason, "no_session_user");
  }

  // A booking whose owner column is NULL must not be matched by a blank-ish actor either.
  const nullOwner = canPayBalance({ travelerId: null, tripId: TRIP }, STRANGER, []);
  assert.equal(nullOwner.allowed, false);

  const noBooking = canPayBalance(null, OWNER, []);
  assert.equal(noBooking.allowed, false);
  assert.equal(!noBooking.allowed && noBooking.reason, "no_booking");
});

test("B7 — the helper is importable with no DATABASE_URL (the purity that makes it testable)", () => {
  // The DB read this lane needs lives behind a dynamic import in the same module precisely so this
  // file can exist. If someone converts it to a static `import { db }`, this suite stops running at
  // all — which is the signal, so the assertion is that we got here.
  assert.equal(typeof canPayBalance, "function");
  assert.equal(typeof buildBalanceIdempotencyKey, "function");
});
