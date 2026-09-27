import { test } from "node:test";
import assert from "node:assert/strict";
import { ENDED_BOOKING_LABELS, endedBookingState, isBookedActivity } from "../item-booking-state";
import { routingCountsFromPlancard } from "../plan-row-model";

/**
 * R145 — a refunded or cancelled item never reads "Booked" (ledger `2026-09-27-refunded-item-status`).
 * Pure pins for the ONE client reading of the server's `booking` / `endedBooking` split.
 *
 * Run: npx tsx --test client/src/lib/__tests__/item-booking-state.test.ts
 */

const live = { id: "b1", status: "confirmed" };
const refunded = { id: "b2", status: "refunded" };
const cancelled = { id: "b3", status: "cancelled" };

test("I1 a live booking is booked and discloses no ended state", () => {
  const a = { booking: live, routingStatus: "purchased" };
  assert.equal(isBookedActivity(a), true);
  assert.equal(endedBookingState(a), null);
});

test("I2 a refunded + reverted item is not booked and says Refunded", () => {
  const a = { endedBooking: refunded, routingStatus: "in_planning" };
  assert.equal(isBookedActivity(a), false);
  assert.equal(endedBookingState(a), "refunded");
  assert.equal(ENDED_BOOKING_LABELS.refunded, "Refunded");
});

test("I3 a non-refundable cancel (routing still purchased) is not booked and says Cancelled", () => {
  const a = { endedBooking: cancelled, routingStatus: "purchased" };
  assert.equal(isBookedActivity(a), false, "an ended booking beats the stale purchased routing status");
  assert.equal(endedBookingState(a), "cancelled");
});

test("I4 once re-routed, the new routing state wins over the old ended booking", () => {
  assert.equal(endedBookingState({ endedBooking: refunded, routingStatus: "with_expert" }), null);
  assert.equal(endedBookingState({ endedBooking: refunded, routingStatus: "ready_for_checkout" }), null);
});

test("I5 legacy: no booking keys and routing purchased still reads booked (unchanged)", () => {
  assert.equal(isBookedActivity({ routingStatus: "purchased" }), true);
  assert.equal(isBookedActivity({ routingStatus: "in_planning" }), false);
  assert.equal(endedBookingState({ routingStatus: "purchased" }), null);
});

test("I6 an unknown closed status is read as the weaker claim, cancelled", () => {
  assert.equal(endedBookingState({ endedBooking: { status: null }, routingStatus: "in_planning" }), "cancelled");
});

test("I7 the routing counts agree: refunded counts as planning, cancelled-purchased counts as nothing", () => {
  const counts = routingCountsFromPlancard({
    days: [
      {
        activities: [
          { booking: live, routingStatus: "purchased" },
          { endedBooking: refunded, routingStatus: "in_planning" },
          { endedBooking: cancelled, routingStatus: "purchased" },
        ],
      },
    ],
  });
  assert.deepEqual(counts, { in_planning: 1, with_expert: 0, ready_for_checkout: 0, purchased: 1 });
});
