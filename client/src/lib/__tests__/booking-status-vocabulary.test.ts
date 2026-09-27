import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CLOSED_BOOKING_STATUSES,
  ITEM_BOOKING_LABELS,
  ITEM_BOOKING_STATUS_VOCABULARY,
  itemBookingStatusEntry,
} from "../../../../shared/booking-visibility";
import {
  BOOKING_DETAIL_PATH,
  ITEM_BOOKING_ACTION_LABELS,
  ITEM_BOOKING_NOTES,
  PAYMENT_FAILED_PILL_LABEL,
  effectiveRoutingStatus,
  isBookedActivity,
  itemBookingAction,
  itemBookingLabel,
  itemBookingState,
} from "../item-booking-state";
import { routingCountsFromPlancard } from "../plan-row-model";

/**
 * R154 — a plan item reads "Booked" only for a real paid booking (ledger
 * `2026-09-27-booking-status-vocabulary`; decision-maker ruled Sep 27, 2026; extends R145).
 *
 * Pure pins for the ONE shared vocabulary (shared/booking-visibility.ts) and the ONE client reading of
 * it (client/src/lib/item-booking-state.ts): per status, whether it counts as booked, the word, the
 * action and the routing bucket — plus a source pin that "Booked" is drawn for `booked` alone.
 *
 * Run: npx tsx --test client/src/lib/__tests__/booking-status-vocabulary.test.ts
 */

const bk = (status: string) => ({ id: `b-${status}`, status });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(HERE, rel), "utf8");

test("V1 the shared table states the ruling, status by status", () => {
  assert.deepEqual(itemBookingStatusEntry("payment_pending"), {
    countsAsBooked: false,
    labelKey: "payment_processing",
    action: null,
  });
  assert.deepEqual(itemBookingStatusEntry("failed"), {
    countsAsBooked: false,
    labelKey: "payment_failed",
    action: "retry_checkout",
  });
  assert.deepEqual(itemBookingStatusEntry("expired"), { countsAsBooked: false, labelKey: null, action: null });
  assert.deepEqual(itemBookingStatusEntry("disputed"), {
    countsAsBooked: true,
    labelKey: "under_review",
    action: "open_booking",
  });
  assert.deepEqual(itemBookingStatusEntry("cancelled"), { countsAsBooked: false, labelKey: "cancelled", action: null });
  assert.deepEqual(itemBookingStatusEntry("refunded"), { countsAsBooked: false, labelKey: "refunded", action: null });
});

test("V2 cancelled/refunded come FROM CLOSED_BOOKING_STATUSES, never a restated list", () => {
  for (const s of CLOSED_BOOKING_STATUSES) {
    assert.ok(Object.prototype.hasOwnProperty.call(ITEM_BOOKING_STATUS_VOCABULARY, s), s);
    assert.equal(itemBookingStatusEntry(s).countsAsBooked, false);
  }
});

test("V3 the unchanged booked statuses keep reading booked", () => {
  for (const s of ["confirmed", "deposit_paid", "in_progress", "awaiting_acceptance", "completion_declared", "partially_completed", "completed"]) {
    assert.deepEqual(itemBookingStatusEntry(s), { countsAsBooked: true, labelKey: "booked", action: null }, s);
    const a = { booking: bk(s), routingStatus: "purchased" };
    assert.equal(isBookedActivity(a), true, s);
    assert.equal(itemBookingState(a), "booked", s);
  }
});

test("C1 payment_pending: not booked, 'Payment processing', no action, no purchased bucket", () => {
  const a = { endedBooking: bk("payment_pending"), routingStatus: "purchased" };
  assert.equal(isBookedActivity(a), false);
  assert.equal(itemBookingState(a), "payment_processing");
  assert.equal(itemBookingLabel("payment_processing"), "Payment processing");
  assert.equal(itemBookingAction(a), null);
  assert.equal(effectiveRoutingStatus(a), null, "neither bought nor anything else yet (§13)");
});

test("C2 failed: not booked, back to Ready to book, 'Payment didn't go through', Try again", () => {
  const a = { endedBooking: bk("failed"), routingStatus: "purchased" };
  assert.equal(isBookedActivity(a), false);
  assert.equal(itemBookingState(a), "payment_failed");
  assert.equal(itemBookingLabel("payment_failed"), "Payment didn't go through");
  assert.equal(PAYMENT_FAILED_PILL_LABEL, "Ready to book");
  assert.equal(effectiveRoutingStatus(a), "ready_for_checkout");
  assert.equal(itemBookingAction(a), "retry_checkout");
  assert.equal(ITEM_BOOKING_ACTION_LABELS.retry_checkout, "Try again");
  // Still true on a row already back in checkout; an expert hand-off wins.
  assert.equal(itemBookingState({ endedBooking: bk("failed"), routingStatus: "ready_for_checkout" }), "payment_failed");
  assert.equal(itemBookingState({ endedBooking: bk("failed"), routingStatus: "with_expert" }), null);
});

test("C3 expired: not booked, NO booking line, no action, only its routing status", () => {
  const onPurchased = { endedBooking: bk("expired"), routingStatus: "purchased" };
  assert.equal(isBookedActivity(onPurchased), false, "never Booked, even on a stale purchased routing status");
  assert.equal(itemBookingState(onPurchased), null);
  assert.equal(itemBookingAction(onPurchased), null);
  assert.equal(effectiveRoutingStatus(onPurchased), null);
  const onCheckout = { endedBooking: bk("expired"), routingStatus: "ready_for_checkout" };
  assert.equal(itemBookingState(onCheckout), null);
  assert.equal(effectiveRoutingStatus(onCheckout), "ready_for_checkout");
});

test("C4 disputed: COUNTS as booked, reads 'Under review', links to the booking, never 'Booked'", () => {
  const a = { booking: bk("disputed"), routingStatus: "purchased" };
  assert.equal(isBookedActivity(a), true, "a real, paid booking — counted booked");
  assert.equal(effectiveRoutingStatus(a), "purchased");
  assert.equal(itemBookingState(a), "under_review");
  assert.notEqual(itemBookingState(a), "booked");
  assert.equal(itemBookingLabel("under_review"), "Under review");
  assert.equal(itemBookingAction(a), "open_booking");
  assert.equal(ITEM_BOOKING_ACTION_LABELS.open_booking, "View booking");
  assert.equal(BOOKING_DETAIL_PATH, "/my-bookings");
});

test("C5 the word Booked belongs to `booked` alone — no other label or note says it", () => {
  for (const [state, label] of Object.entries(ITEM_BOOKING_LABELS)) {
    if (state === "booked") continue;
    assert.doesNotMatch(label, /\bbooked\b/i, `label for ${state}`);
  }
  for (const [state, note] of Object.entries(ITEM_BOOKING_NOTES)) {
    if (note) assert.doesNotMatch(note, /\bbooked\b/i, `note for ${state}`);
  }
  assert.doesNotMatch(PAYMENT_FAILED_PILL_LABEL, /\bbooked\b/i);
});

test("C6 My Plans counts: disputed purchased, failed in checkout, pending/expired nowhere", () => {
  const counts = routingCountsFromPlancard({
    days: [
      {
        activities: [
          { booking: bk("confirmed"), routingStatus: "purchased" },
          { booking: bk("disputed"), routingStatus: "purchased" },
          { endedBooking: bk("failed"), routingStatus: "purchased" },
          { endedBooking: bk("payment_pending"), routingStatus: "purchased" },
          { endedBooking: bk("expired"), routingStatus: "purchased" },
          { routingStatus: "in_planning" },
        ],
      },
    ],
  });
  assert.deepEqual(counts, { in_planning: 1, with_expert: 0, ready_for_checkout: 1, purchased: 2 });
});

test("P1 source pin: the Booked pill and the 'booked' line are drawn for `booked` alone", () => {
  const acts = read("../../components/plancard/ActivitiesSection.tsx");
  const badgeStart = acts.indexOf("export function RoutingBadge(");
  const badgeEnd = acts.indexOf("export function ItemBookingActionLink(");
  assert.ok(badgeStart > 0 && badgeEnd > badgeStart, "RoutingBadge located");
  const badge = acts.slice(badgeStart, badgeEnd);
  assert.doesNotMatch(badge, /if \(activity\.booking\) \{/, "the Booked pill must not key on `booking` presence");
  const guard = badge.indexOf('if (bookingState === "booked") {');
  const tint = badge.indexOf("BOOKED_TINT.label");
  assert.ok(guard >= 0 && tint > guard, "BOOKED_TINT is drawn only inside the `booked` guard");
  assert.equal(badge.split("BOOKED_TINT.label").length - 1, 1, "exactly one Booked pill");

  const slip = read("../../components/plancard/SlipView.tsx");
  const lineStart = slip.indexOf("function secondaryLine(");
  const line = slip.slice(lineStart, slip.indexOf("function SlipItemRow(", lineStart));
  const notesFirst = line.indexOf('if (bookingState && bookingState !== "booked") return ITEM_BOOKING_NOTES[bookingState];');
  const bookedWord = line.indexOf("`booked · #${ref}`");
  assert.ok(notesFirst >= 0 && bookedWord > notesFirst, "the not-booked notes return before the 'booked' line");
});
