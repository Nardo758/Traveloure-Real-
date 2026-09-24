/**
 * Post-payment page decisions (board #533, #1293). Pure.
 *   B1 the bookings param is parsed defensively: trimmed, de-duplicated, malformed ids dropped, capped.
 *   B2 only a `confirmed` booking is called confirmed; a pending request says it is waiting and
 *      promises no response time.
 * Run: npx tsx --test client/src/lib/__tests__/booking-confirmation.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingStatusSentence, parseBookingIdsParam } from "../booking-confirmation";

test("B1: parse the bookings param", () => {
  assert.deepEqual(parseBookingIdsParam(" a1, b-2 ,a1,<x>,"), ["a1", "b-2"]);
  assert.deepEqual(parseBookingIdsParam(null), []);
  assert.equal(parseBookingIdsParam(Array.from({ length: 30 }, (_, i) => `id${i}`).join(",")).length, 20);
});

test("B2: confirmed only when confirmed; pending names no deadline", () => {
  assert.equal(bookingStatusSentence("confirmed"), "Confirmed.");
  const pending = bookingStatusSentence("pending");
  assert.match(pending, /waiting for the provider/);
  assert.ok(!/\d+\s*(h|hour|day)/i.test(pending), "no invented response time");
  assert.ok(!/confirmed\./i.test(bookingStatusSentence("payment_pending")));
});

test("B3: a paid checkout lands on the confirmation page with its bookings", async () => {
  const { bookingConfirmationPath } = await import("../booking-confirmation");
  assert.equal(bookingConfirmationPath(["a1", "b2"]), "/booking/confirmation?bookings=a1%2Cb2");
  assert.equal(bookingConfirmationPath([]), "/bookings");
});
