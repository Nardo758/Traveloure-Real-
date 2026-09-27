import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBookedActivity, itemBookingLabel, itemBookingState } from "../item-booking-state";
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

test("I1 a live booking is booked and reads booked", () => {
  const a = { booking: live, routingStatus: "purchased" };
  assert.equal(isBookedActivity(a), true);
  assert.equal(itemBookingState(a), "booked");
});

test("I2 a refunded + reverted item is not booked and says Refunded", () => {
  const a = { endedBooking: refunded, routingStatus: "in_planning" };
  assert.equal(isBookedActivity(a), false);
  assert.equal(itemBookingState(a), "refunded");
  assert.equal(itemBookingLabel("refunded"), "Refunded");
});

test("I3 a non-refundable cancel (routing still purchased) is not booked and says Cancelled", () => {
  const a = { endedBooking: cancelled, routingStatus: "purchased" };
  assert.equal(isBookedActivity(a), false, "an ended booking beats the stale purchased routing status");
  assert.equal(itemBookingState(a), "cancelled");
});

test("I4 once re-routed, the new routing state wins over the old ended booking", () => {
  assert.equal(itemBookingState({ endedBooking: refunded, routingStatus: "with_expert" }), null);
  assert.equal(itemBookingState({ endedBooking: refunded, routingStatus: "ready_for_checkout" }), null);
});

test("I5 legacy: no booking keys and routing purchased still reads booked (unchanged)", () => {
  assert.equal(isBookedActivity({ routingStatus: "purchased" }), true);
  assert.equal(isBookedActivity({ routingStatus: "in_planning" }), false);
  assert.equal(itemBookingState({ routingStatus: "purchased" }), null);
});

test("I6 an unknown closed status is read as the weaker claim, cancelled", () => {
  assert.equal(itemBookingState({ endedBooking: { status: null }, routingStatus: "in_planning" }), "cancelled");
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

/**
 * R157 (ledger `2026-09-27-retry-failed-payment`): "Try again" after a failed payment must put the
 * item back in checkout BEFORE opening it. After a failed payment the item still reads `purchased`
 * and its cart line was cleared at authorization, so a bare link to the checkout opened it without
 * the item. Source pins on the ONE component that draws the action (both the slip and the PlanCard
 * mount it): it asks the EXISTING routing rail for `ready_for_checkout`, reads a refusal through the
 * one hook, and opens the checkout only after that succeeds — never a plain link to it. The server
 * half (the rail accepting the request only for a failed booking) is
 * server/__tests__/retry-failed-payment.db.test.ts.
 */
test("I8 Try again re-projects the item through the routing rail, then opens checkout", () => {
  const ROOT = resolve(import.meta.dirname, "../../../..");
  const src = readFileSync(resolve(ROOT, "client/src/components/plancard/ActivitiesSection.tsx"), "utf8");
  const start = src.indexOf("export function ItemBookingActionLink(");
  assert.ok(start >= 0, "the one action component exists");
  const end = src.indexOf("\nexport function ", start + 1);
  const block = src.slice(start, end);
  assert.match(
    block,
    /\/items\/\$\{activity\.id\}\/route`, \{ to: "ready_for_checkout" \}/,
    "asks the routing rail for ready_for_checkout",
  );
  assert.ok(block.includes("useRouteRefusalToast("), "a refusal reads through the one hook");
  const post = block.indexOf('apiRequest("POST"');
  const go = block.indexOf("setLocation(BUY_NOW_CART_PATH)");
  assert.ok(post >= 0 && go > post, "checkout opens only after the re-projection request");
  assert.equal(/href=\{?[^}\n]*BUY_NOW_CART_PATH/.test(block), false, "no plain link to a checkout that lacks the item");
  for (const mount of ["client/src/components/plancard/SlipView.tsx", "client/src/components/plancard/ActivitiesSection.tsx"]) {
    const m = readFileSync(resolve(ROOT, mount), "utf8");
    const uses = m.match(/<ItemBookingActionLink[^>]*>/g) ?? [];
    assert.ok(uses.length > 0, `${mount} mounts the action`);
    for (const use of uses) assert.ok(use.includes("tripId={tripId}"), `${mount}: every mount names the plan (${use})`);
  }
});
