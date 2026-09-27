/**
 * data-sanitizer.ts — QA-1 pinning tests (pure unit; no DB, no HTTP).
 *
 * THE BUG THIS CLOSES: `sanitizeBookingForExpert`'s strip list named `paymentIntentId` (wrong
 * casing — no `service_bookings` column of that name exists; the nearest match,
 * `reconciliationExceptions.paymentIntentId`, is an unrelated admin table) and `stripeSessionId`
 * (no such column anywhere in shared/schema.ts) instead of the REAL columns
 * `stripePaymentIntentId` / `stripeDepositIntentId` / `stripeBalanceIntentId`
 * (shared/schema.ts:1078,1095-1096). No live leak was observed today only because enrichment
 * nulls the field first (see the provider/expert bookings routes) — the strip list itself was
 * wrong, and §19a states this column class ("written ONLY by the shared promotion /
 * balance-authorization paths") must never round-trip to a client at all, regardless of whether
 * anything currently reads it off the response.
 *
 * Run: npx tsx --test server/utils/__tests__/data-sanitizer.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EARNER_VISIBLE_BOOKING_DETAIL_KEYS, sanitizeBookingForExpert } from "../data-sanitizer";

/**
 * A raw `service_bookings` row with EVERY column populated, camelCase field names exactly as
 * `shared/schema.ts`'s `serviceBookings` table declares them — including the three real
 * payment-identity columns the old strip list missed.
 */
function rawServiceBookingRow(): Record<string, any> {
  return {
    id: "booking-1",
    trackingNumber: "TRK-00001",
    serviceId: "service-1",
    travelerId: "traveler-1",
    providerId: "provider-1",
    contractId: "contract-1",
    bookingDetails: { note: "window seat" },
    tripId: "trip-1",
    status: "confirmed",
    totalAmount: "200.00",
    platformFee: "24.00",
    insuranceFee: "0.00",
    providerEarnings: "176.00",
    // The three real §19a-governed columns — the actual leak surface.
    stripePaymentIntentId: "pi_live_secret_123",
    stripeDepositIntentId: "pi_live_secret_deposit",
    stripeBalanceIntentId: "pi_live_secret_balance",
    depositAmount: "50.00",
    depositPaid: true,
    balanceAmount: "150.00",
    balancePaid: false,
    balanceDueAt: "2026-09-01T00:00:00.000Z",
    bookingMetadata: {},
    source: "direct",
    crossSellSourceContentId: null,
    acquisitionRef: null,
    slotId: "slot-1",
    idempotencyKey: "idem-key-1",
    confirmedAt: "2026-08-01T00:00:00.000Z",
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    // The stale/wrong-cased names the old list targeted — must ALSO come out (belt-and-braces),
    // even though no live caller sends a row shaped like this.
    paymentIntentId: "should-never-appear-either",
    stripeSessionId: "cs_live_should_never_appear",
    paymentDetails: { cvv: "should-never-appear" },
    cardInfo: { last4: "4242" },
    billingAddress: "123 Main St",
    traveler: { id: "traveler-1", firstName: "Ana", lastName: "Traveler", email: "ana@example.com" },
  };
}

const PAYMENT_IDENTITY_FIELDS = [
  "stripePaymentIntentId",
  "stripeDepositIntentId",
  "stripeBalanceIntentId",
] as const;

// ── NEGATIVES FIRST — no payment-identity field survives sanitization for a limited role ───────

test("N1: a real §19a payment-identity column never round-trips to a provider", () => {
  const sanitized = sanitizeBookingForExpert(rawServiceBookingRow(), "provider", "provider-1");
  for (const field of PAYMENT_IDENTITY_FIELDS) {
    assert.equal(
      field in sanitized,
      false,
      `${field} must be stripped for role=provider (§19a — server-verified-actors only)`,
    );
  }
});

test("N2: a real §19a payment-identity column never round-trips to an expert", () => {
  const sanitized = sanitizeBookingForExpert(rawServiceBookingRow(), "expert", "expert-1");
  for (const field of PAYMENT_IDENTITY_FIELDS) {
    assert.equal(field in sanitized, false, `${field} must be stripped for role=expert`);
  }
});

test("N3: the stale wrong-cased/nonexistent names are still stripped (belt-and-braces)", () => {
  const sanitized = sanitizeBookingForExpert(rawServiceBookingRow(), "provider", "provider-1");
  assert.equal("paymentIntentId" in sanitized, false);
  assert.equal("stripeSessionId" in sanitized, false);
  assert.equal("paymentDetails" in sanitized, false);
  assert.equal("cardInfo" in sanitized, false);
  assert.equal("billingAddress" in sanitized, false);
});

test("N4: nested traveler PII is still sanitized (unrelated to the payment-identity fix)", () => {
  const sanitized = sanitizeBookingForExpert(rawServiceBookingRow(), "provider", "provider-1") as any;
  assert.equal(sanitized.traveler.email, undefined);
  assert.equal(sanitized.traveler.lastName, undefined);
  assert.equal(sanitized.traveler.firstName, "Ana");
});

// ── The positive — everything a role legitimately needs is still there ─────────────────────────

test("P1: operational booking fields survive sanitization untouched", () => {
  const sanitized = sanitizeBookingForExpert(rawServiceBookingRow(), "provider", "provider-1") as any;
  assert.equal(sanitized.id, "booking-1");
  assert.equal(sanitized.status, "confirmed");
  assert.equal(sanitized.totalAmount, "200.00");
  assert.equal(sanitized.platformFee, "24.00");
  assert.equal(sanitized.providerEarnings, "176.00");
  assert.equal(sanitized.trackingNumber, "TRK-00001");
});

test("P2: admin/EA roles (canSeeFull) are untouched — sanitization is role-gated, not blanket", () => {
  const sanitized = sanitizeBookingForExpert(rawServiceBookingRow(), "admin", "admin-1") as any;
  for (const field of PAYMENT_IDENTITY_FIELDS) {
    assert.equal(field in sanitized, true, `admin must still see ${field}`);
  }
});

// ── R163 amendment: the traveler's refund and payment-identity records INSIDE booking_details ──────

function rowWithRefundRecords() {
  return {
    ...rawServiceBookingRow(),
    bookingDetails: {
      scheduledDate: "2026-10-01",
      notes: "window seat",
      stripeIdempotencyKey: "idem_nested_should_never_appear",
      stripeAttemptAt: "2026-09-27T10:00:00.000Z",
      reconciliationException: { paymentIntentId: "pi_nested_should_never_appear" },
      lateSuccessRefund: { refundId: "re_late_should_never_appear" },
      outOfBandRefund: { refundIds: ["re_oob_should_never_appear"], chargeId: "ch_should_never_appear" },
      outOfBandRefundCleared: [{ refundIds: ["re_cleared_should_never_appear"], clearedBy: "admin-1" }],
      serviceBookingRefundAttempt: { state: "processing", idempotencyKey: "refund-sb-should-never-appear" },
      serviceBookingRefund: { refundId: "re_app_should_never_appear", amountCents: 5000 },
      // FU-R167-1: three live keys the old denylist missed, and a key nobody has written yet.
      lostChargebacks: { dp_1: { chargeId: "ch_lost_should_never_appear", paymentIntentId: "pi_lost_should_never_appear" } },
      chargebackReconciliation: { by: "admin_should_never_appear", note: "x" },
      balancePaidByUserId: "user_should_never_appear",
      travelerCharge: { conciergeFee: "5.00" },
      someFutureMoneyKey: "future_should_never_appear",
    },
  };
}

test("N6: an expert or provider never sees the traveler's refund claim, refund record or Stripe keys inside booking_details", () => {
  for (const role of ["provider", "expert"]) {
    const sanitized: any = sanitizeBookingForExpert(rowWithRefundRecords(), role, `${role}-1`);
    for (const key of Object.keys(sanitized.bookingDetails)) {
      assert.ok((EARNER_VISIBLE_BOOKING_DETAIL_KEYS as readonly string[]).includes(key), `${key} is not on the earner allowlist for role=${role}`);
    }
    const raw = JSON.stringify(sanitized);
    assert.equal(/should-never-appear|should_never_appear/.test(raw), false, `no refund or Stripe identifier leaks for role=${role}`);
    // The operational answers survive.
    assert.equal(sanitized.bookingDetails.scheduledDate, "2026-10-01");
    assert.equal(sanitized.bookingDetails.notes, "window seat");
  }
});

test("N7: the earner allowlist is exactly the operational keys (adding one is a decision, not a tidy-up)", () => {
  assert.deepEqual([...EARNER_VISIBLE_BOOKING_DETAIL_KEYS].sort(), [
    "bookingType", "checkIn", "checkOut", "nights", "notes", "pickupLocation", "propertyName",
    "quantity", "roomName", "scheduledDate", "specialRequests", "transportMode", "travelers",
  ]);
  for (const key of ["serviceBookingRefundAttempt", "serviceBookingRefund", "lateSuccessRefund", "outOfBandRefund",
    "stripeIdempotencyKey", "lostChargebacks", "chargebackReconciliation", "balancePaidByUserId", "travelerCharge",
    "travelerServiceFee", "railsAttribution", "bundleComponents", "itineraryItemId", "expiredClaimNotice"]) {
    assert.equal((EARNER_VISIBLE_BOOKING_DETAIL_KEYS as readonly string[]).includes(key), false, `${key} must never be earner-visible`);
  }
});

test("N8: a key nobody has written yet is hidden from earners by default", () => {
  const sanitized: any = sanitizeBookingForExpert(rowWithRefundRecords(), "provider", "provider-1");
  assert.equal("someFutureMoneyKey" in sanitized.bookingDetails, false);
});

test("P3: an admin (canSeeFull) still receives booking_details whole", () => {
  const row = rowWithRefundRecords();
  const sanitized: any = sanitizeBookingForExpert(row, "admin", "admin-1");
  assert.deepEqual(sanitized.bookingDetails, row.bookingDetails);
});
