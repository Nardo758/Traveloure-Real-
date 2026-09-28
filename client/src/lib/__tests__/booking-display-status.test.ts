/**
 * R163 (ledger `2026-09-27-dashboard-refund-reads-refunded`) — a booking that READS "Refunded"
 * offers no Cancel and no Dispute. The server half (409 `refunded_out_of_band`) is H2 of
 * server/__tests__/dashboard-refund-reads-refunded.db.test.ts.
 *
 * Run: npx tsx --test client/src/lib/__tests__/booking-display-status.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bookingDisplayStatus } from "../booking-display-status";
import { isBookingCancellable } from "@shared/booking-cancellation";
import { DISPUTABLE_FROM_STATUSES } from "@shared/declared-completion-window";

const dashRefunded = { status: "confirmed", refundedOutOfBand: true as const };
const confirmed = { status: "confirmed" };

test("A1 a dashboard-refunded confirmed booking reads refunded and is neither cancellable nor disputable", () => {
  assert.equal(bookingDisplayStatus(dashRefunded), "refunded");
  assert.equal(isBookingCancellable(bookingDisplayStatus(dashRefunded)), false);
  assert.equal(DISPUTABLE_FROM_STATUSES.includes(bookingDisplayStatus(dashRefunded)), false);
});

test("A2 without the server's flag (a partial refund) the row keeps its own status and actions", () => {
  assert.equal(bookingDisplayStatus(confirmed), "confirmed");
  assert.equal(isBookingCancellable(bookingDisplayStatus(confirmed)), isBookingCancellable("confirmed"));
});

test("A3 My Bookings gates every action on the SAME status the badge reads", () => {
  const ROOT = resolve(import.meta.dirname, "../../../..");
  const src = readFileSync(resolve(ROOT, "client/src/pages/my-bookings.tsx"), "utf8");
  const card = src.slice(src.indexOf("const actionStatus = displayStatusOf(booking);"));
  assert.ok(card.length > 0, "the card derives actionStatus from the one reading");
  for (const gate of [
    "const status = getStatusDisplay(actionStatus);",
    'const canReview = actionStatus === "completed"',
    "const canCancel = isBookingCancellable(actionStatus);",
    // Confirm completion and Dispute also sit behind the one paid predicate (ledger
    // `2026-09-28-no-payment-no-earnings`); the status half still reads actionStatus.
    'const canConfirmOrDispute = paymentOnRecord && (actionStatus === "completed" || confirmedAndDelivered);',
    'const confirmedAndDelivered = actionStatus === "confirmed"',
    "booking={{ ...booking, status: actionStatus } as any}",
  ]) {
    assert.ok(card.includes(gate), `missing gate: ${gate}`);
  }
  const body = card.slice(0, card.indexOf("\nfunction ") > 0 ? card.indexOf("\nfunction ") : undefined);
  assert.equal(/isBookingCancellable\(booking\.status\)/.test(body), false, "no action reads the raw status");
});
