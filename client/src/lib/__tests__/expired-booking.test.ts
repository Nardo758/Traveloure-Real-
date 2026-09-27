/**
 * Expired row next step (R164/R165 follow-up). Run: npx tsx --test client/src/lib/__tests__/expired-booking.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { expiredBookingNextStep } from "../expired-booking";

test("X1 an expired booking with a plan item says it is back in the plan and links there", () => {
  assert.deepEqual(expiredBookingNextStep({ status: "expired", tripId: "t1", serviceId: "s1", bookingDetails: { itineraryItemId: "i1" } }), {
    line: "Not completed · back in your plan",
    href: "/plans/t1",
    cta: "Book it from your plan",
  });
});

test("X2 without a plan item it never claims the plan; it links to the listing", () => {
  const s = expiredBookingNextStep({ status: "expired", tripId: "t1", serviceId: "s1", bookingDetails: {} });
  assert.equal(s?.href, "/services/s1");
  assert.doesNotMatch(s!.line, /plan/);
});

test("X3 any other status draws nothing", () => {
  for (const status of ["confirmed", "refunded", "failed", "dispute_lost"]) {
    assert.equal(expiredBookingNextStep({ status, tripId: "t1", serviceId: "s1", bookingDetails: { itineraryItemId: "i1" } }), null);
  }
});
