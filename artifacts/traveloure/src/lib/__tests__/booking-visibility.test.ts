/**
 * FP-5 — the shared booking-visibility predicate (pure unit; no DB, no browser).
 *
 * Evidence: docs/testing/CONSOLE_TABS_EXERCISE.md findings M1, M2, I1, X1 (as-of `f747d0a`). One
 * real checkout failed at the Stripe boundary and left ONE row — `payment_pending` with
 * `stripe_payment_intent_id IS NULL`, an unauthorized claim by construction (§15b). Six console
 * surfaces read it and five disagreed: Today said 0 pending, Inbox said "1 Pending" over an empty
 * list, Customers said "1 booking (1 pending payment)", and Money said the provider's lifetime
 * earnings were $83.60 beside a ledger reading $0.00.
 *
 * This pins the ONE module all of them now consume (shared/booking-visibility.ts), so a sixth
 * answer cannot be written. NEGATIVES FIRST: the provisional claim must be absent from every set
 * that means money or action, because that absence IS the fix.
 *
 * Run: npx tsx --test client/src/lib/__tests__/booking-visibility.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONABLE_BOOKING_STATUSES,
  CLOSED_BOOKING_STATUSES,
  EARNING_BOOKING_STATUSES,
  HISTORY_BOOKING_STATUSES,
  PROVISIONAL_BOOKING_STATUSES,
  RECORD_BOOKING_STATUSES,
  isActionableBooking,
  isClosedBooking,
  isEarningBooking,
  isHistoryBooking,
  isProvisionalBooking,
  isRecordBooking,
} from "@shared/booking-visibility";

/** Every value `service_bookings.status` actually holds in this codebase (plain varchar, no CHECK). */
const ALL_STATUSES = [
  "payment_pending",
  "pending",
  "deposit_paid",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "refunded",
  "failed",
  "disputed",
] as const;

// ── NEGATIVES FIRST — the unauthorized claim is banked and queued NOWHERE ──────────────────────

test("N1: an unauthorized §15b claim is never money", () => {
  // The M1 defect verbatim: `payment_pending` reaching an aggregation labelled earnings.
  assert.equal(isEarningBooking("payment_pending"), false);
  assert.equal((EARNING_BOOKING_STATUSES as readonly string[]).includes("payment_pending"), false);
});

test("N2: an unauthorized §15b claim is never provider-actionable", () => {
  // §18b / ruling 42 SD-1: the owner rail may not move a booking out of a provisional state. A
  // provider Accept on one of these destroyed reclaimable inventory with no code path to return it.
  assert.equal(isActionableBooking("payment_pending"), false);
  assert.equal(isRecordBooking("payment_pending"), false);
  assert.equal((ACTIONABLE_BOOKING_STATUSES as readonly string[]).includes("payment_pending"), false);
});

test("N3: the legacy `pending` birth state is not earnings either", () => {
  // Money's "Pending" tile counted `confirmed || pending` — but nothing has been charged on a
  // `pending` row, so a legacy rail booking inflated a figure labelled earnings just as surely.
  assert.equal(isEarningBooking("pending"), false);
});

test("N4: money that is gone, contested or never happened is not earnings", () => {
  for (const status of ["cancelled", "refunded", "failed", "disputed"]) {
    assert.equal(isEarningBooking(status), false, `${status} must not count as earnings`);
  }
});

test("N5: null / undefined / unknown statuses are excluded from every set", () => {
  // A row with a NULL status (the column is nullable) must never fall THROUGH into a money set.
  for (const value of [null, undefined, "", "PAYMENT_PENDING", "paid", "Confirmed"]) {
    assert.equal(isEarningBooking(value as any), false, `${String(value)} must not be earnings`);
    assert.equal(isActionableBooking(value as any), false, `${String(value)} must not be actionable`);
    assert.equal(isProvisionalBooking(value as any), false, `${String(value)} must not be provisional`);
  }
});

// ── The positives — a genuinely paid booking appears everywhere it should ──────────────────────

test("P1: an authorized booking is money in every earnings surface", () => {
  for (const status of ["confirmed", "deposit_paid", "in_progress", "completed"]) {
    assert.equal(isEarningBooking(status), true, `${status} is authorized money`);
    assert.equal(isRecordBooking(status), true, `${status} belongs in the booking record`);
  }
});

test("P2: `pending` is the one status the earner must respond to", () => {
  assert.equal(isActionableBooking("pending"), true);
  assert.deepEqual([...ACTIONABLE_BOOKING_STATUSES], ["pending"]);
});

test("P3: the provisional set is exactly the §15b claim state", () => {
  assert.equal(isProvisionalBooking("payment_pending"), true);
  assert.deepEqual([...PROVISIONAL_BOOKING_STATUSES], ["payment_pending"]);
});

// ── The structural invariants that keep the surfaces in agreement ──────────────────────────────

test("P4: actionable, provisional and earning are MUTUALLY EXCLUSIVE", () => {
  // X1 in one assertion: no status may be counted by two different console lanes, because that is
  // exactly how one row became "0 pending" here, "1 Pending" there and "$83.60 earnings" elsewhere.
  for (const status of ALL_STATUSES) {
    const memberships = [
      isActionableBooking(status),
      isProvisionalBooking(status),
      isEarningBooking(status),
    ].filter(Boolean).length;
    assert.ok(memberships <= 1, `${status} is claimed by ${memberships} sets — the surfaces will disagree`);
  }
});

test("P5: the Inbox count is the LENGTH OF THE DISPLAYED SET, not a second filter (I1)", () => {
  // The I1 defect was a tile computed by one predicate over a list rendered by another: "1 Pending"
  // above "No bookings waiting", counting a row the page could not display anywhere. The fix is
  // structural — one array, filtered once, whose `.length` IS the number on the tile. This asserts
  // the arithmetic the Inbox now performs, with the exercise's exact bench contents.
  const bench = [
    { id: "claim", status: "payment_pending" },
    { id: "request", status: "pending" },
    { id: "sold", status: "confirmed" },
    { id: "done", status: "completed" },
    { id: "gone", status: "cancelled" },
  ];
  const actionable = bench.filter((b) => isActionableBooking(b.status));
  const awaitingPayment = bench.filter((b) => isProvisionalBooking(b.status));
  const confirmed = bench.filter((b) => b.status === "confirmed").length;
  const completed = bench.filter((b) => b.status === "completed").length;

  assert.equal(actionable.length, 1, "the Pending tile counts the one row the queue can render");
  assert.deepEqual(actionable.map((b) => b.id), ["request"]);
  assert.equal(awaitingPayment.length, 1, "the claim is counted, in its OWN tile, with its own list");
  assert.deepEqual(awaitingPayment.map((b) => b.id), ["claim"]);

  // "Total always equals the sum of the tiles" (the L10b property the Inbox must keep).
  const other = bench.length - confirmed - actionable.length - awaitingPayment.length - completed;
  assert.equal(confirmed + actionable.length + awaitingPayment.length + completed + other, bench.length);
  assert.equal(other, 1, "the cancelled row lands in Other — never silently dropped");
});

test("P6: the Money aggregations bank the paid row and only the paid row (M1)", () => {
  // The exercise's bench, plus one genuinely paid booking so the positive half is proven too.
  const bench = [
    { status: "payment_pending", totalAmount: "95.00", platformFee: "11.40", providerEarnings: "83.60" },
    { status: "confirmed", totalAmount: "200.00", platformFee: "24.00", providerEarnings: "176.00" },
    { status: "cancelled", totalAmount: "40.00", platformFee: "4.80", providerEarnings: "35.20" },
  ];
  const banked = bench.filter((b) => isEarningBooking(b.status));
  const gross = banked.reduce((s, b) => s + Number(b.totalAmount), 0);
  const share = banked.reduce((s, b) => s + Number(b.providerEarnings), 0);

  assert.equal(banked.length, 1, "only the authorized booking is money");
  assert.equal(gross, 200, "gross booking value excludes the never-charged $95 claim");
  assert.equal(share, 176, "the $83.60 'lifetime earnings' that started this finding is gone");
  // The rate was always honest (share/gross, no literal — §8-clean); it is the AMOUNT that moved.
  assert.equal(Math.round((share / gross) * 100) / 100, 0.88);
});

// ── QA-1: cancelled/refunded/declined bookings vanish from Inbox History ───────────────────────
//
// A provider's Decline puts a row at `cancelled` (unpaid) or `refunded` (a paid row, made whole
// via `refundServiceBooking`) — real terminal outcomes History had NO home for, because History
// read `RECORD_BOOKING_STATUSES` alone. NEGATIVES FIRST: a closed row must never re-enter money
// or action, because that absence is what made RECORD safe to reuse as half of HISTORY.

test("N6: a closed (declined/cancelled/refunded) row is never money and never actionable", () => {
  for (const status of CLOSED_BOOKING_STATUSES) {
    assert.equal(isEarningBooking(status), false, `${status} must not count as earnings`);
    assert.equal(isActionableBooking(status), false, `${status} must not be actionable`);
    assert.equal(isProvisionalBooking(status), false, `${status} must not be provisional`);
  }
});

test("N7: a §15b provisional claim and the legacy pending state are never CLOSED or HISTORY", () => {
  // The whole point: History widens to include real declined outcomes, never a claim nobody
  // paid or a request nobody has answered yet — those stay on Queue.
  assert.equal(isClosedBooking("payment_pending"), false);
  assert.equal(isClosedBooking("pending"), false);
  assert.equal(isHistoryBooking("payment_pending"), false);
  assert.equal(isHistoryBooking("pending"), false);
});

test("N8: `failed` and `disputed` are deliberately excluded from CLOSED (stated, not silent)", () => {
  // `failed` never became a real booking (a §15b claim whose Stripe attempt didn't succeed);
  // `disputed` is still open/contested, not a closed outcome. Widening CLOSED to cover either is
  // a deliberate future edit, not something this fix does implicitly.
  assert.equal(isClosedBooking("failed"), false);
  assert.equal(isClosedBooking("disputed"), false);
  assert.equal(isHistoryBooking("failed"), false);
  assert.equal(isHistoryBooking("disputed"), false);
});

test("P7: cancelled and refunded are exactly the CLOSED set, and both appear in History", () => {
  assert.deepEqual([...CLOSED_BOOKING_STATUSES].sort(), ["cancelled", "refunded"]);
  for (const status of CLOSED_BOOKING_STATUSES) {
    assert.equal(isClosedBooking(status), true);
    assert.equal(isHistoryBooking(status), true, `${status} must reach the History tab`);
  }
});

test("P8: HISTORY is exactly RECORD ∪ CLOSED — every authorized status still appears", () => {
  for (const status of RECORD_BOOKING_STATUSES) {
    assert.equal(isHistoryBooking(status), true, `${status} (RECORD) must still reach History`);
  }
  assert.deepEqual(
    [...HISTORY_BOOKING_STATUSES].sort(),
    [...RECORD_BOOKING_STATUSES, ...CLOSED_BOOKING_STATUSES].sort(),
  );
});

test("P9: CLOSED stays outside ACTIONABLE/PROVISIONAL/EARNING — no sixth answer for a decline", () => {
  for (const status of ALL_STATUSES) {
    const memberships = [
      isActionableBooking(status),
      isProvisionalBooking(status),
      isEarningBooking(status),
      isClosedBooking(status),
    ].filter(Boolean).length;
    assert.ok(memberships <= 1, `${status} is claimed by ${memberships} sets — History and Queue will disagree`);
  }
});
