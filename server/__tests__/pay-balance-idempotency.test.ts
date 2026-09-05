/**
 * THE BALANCE IDEMPOTENCY KEY — the §15-layer-a half of ledger `2026-09-04-cost-split-phase-one`,
 * provable with no database, no server and no Stripe.
 *
 * Before this ruling the key was `bal-<bookingId>`: deterministic per BOOKING, which was correct
 * while the owner was the only possible payer. With a second possible payer it is a hazard, because
 * `stripePaymentService.createPaymentIntent` builds the PaymentIntent FROM THE ACTOR — their Stripe
 * customer, their email, their saved payment method. The same key presented with a different actor
 * is the same key with different parameters: Stripe answers that with an idempotency error, or
 * worse, hands back the FIRST payer's PaymentIntent — a charge against the wrong person's card.
 *
 *   K1  ONE PAYER, MANY RETRIES ⇒ ONE KEY. This is the property §15 layer a depends on and the one
 *       the extension must not lose: a double-click still produces the SAME single PaymentIntent.
 *   K2  TWO PAYERS ⇒ TWO KEYS, on the same booking.
 *   K3  TWO BOOKINGS ⇒ TWO KEYS, for the same payer (the pre-existing property, unchanged).
 *   K4  THE KEY IS PURE — no clock, no counter, no randomness. A retry after a process restart
 *       must rebuild the identical key or the dedupe silently stops working.
 *   K5  A BLANK PART THROWS rather than degrading to the pre-ruling per-booking shape that two
 *       payers can share. A key that silently loses its actor is the exact bug this closes.
 *   K6  THE KEY CONTAINS THE BOOKING AND THE PAYER — the extension is additive, so an operator
 *       reading a Stripe request log can still find the booking.
 *
 * Run solo: npx tsx --test server/__tests__/pay-balance-idempotency.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBalanceIdempotencyKey } from "../services/balance-payer.service";

const BOOKING_A = "booking-aaa";
const BOOKING_B = "booking-bbb";
const OWNER = "user-owner";
const COLLABORATOR = "user-collab";

test("K1 — the same payer retrying the same booking gets the SAME key", () => {
  const first = buildBalanceIdempotencyKey(BOOKING_A, OWNER);
  const second = buildBalanceIdempotencyKey(BOOKING_A, OWNER);
  const third = buildBalanceIdempotencyKey(BOOKING_A, OWNER);
  assert.equal(first, second);
  assert.equal(second, third);
});

test("K2 — two DIFFERENT payers on the same booking get DIFFERENT keys", () => {
  const ownerKey = buildBalanceIdempotencyKey(BOOKING_A, OWNER);
  const collaboratorKey = buildBalanceIdempotencyKey(BOOKING_A, COLLABORATOR);
  assert.notEqual(ownerKey, collaboratorKey);
});

test("K3 — the same payer on two bookings gets DIFFERENT keys (unchanged from before)", () => {
  assert.notEqual(buildBalanceIdempotencyKey(BOOKING_A, OWNER), buildBalanceIdempotencyKey(BOOKING_B, OWNER));
});

test("K4 — the key is a pure function of its two inputs (deterministic across retries)", () => {
  const keys = new Set<string>();
  for (let i = 0; i < 50; i++) keys.add(buildBalanceIdempotencyKey(BOOKING_A, COLLABORATOR));
  assert.equal(keys.size, 1, "a key that varies between calls cannot deduplicate a retry");
});

test("K5 — a blank booking id or payer id THROWS, never degrades to a shareable key", () => {
  for (const blank of ["", "   ", null, undefined]) {
    assert.throws(
      () => buildBalanceIdempotencyKey(BOOKING_A, blank as any),
      /payerUserId is required/,
      `payer ${JSON.stringify(blank)} must not produce a key`,
    );
    assert.throws(
      () => buildBalanceIdempotencyKey(blank as any, OWNER),
      /bookingId is required/,
      `booking ${JSON.stringify(blank)} must not produce a key`,
    );
  }
});

test("K6 — the key still names the booking, and now also names the payer", () => {
  const key = buildBalanceIdempotencyKey(BOOKING_A, COLLABORATOR);
  assert.ok(key.includes(BOOKING_A), "an operator must still be able to find the booking in a Stripe log");
  assert.ok(key.includes(COLLABORATOR), "the actor is what makes two payers' keys differ");
  // The pre-ruling key shape is a strict PREFIX of the new one — the extension is additive.
  assert.ok(key.startsWith(`bal-${BOOKING_A}-`));
});
