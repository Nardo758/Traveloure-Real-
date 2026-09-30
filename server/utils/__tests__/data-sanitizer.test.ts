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
import { sanitizeBookingForExpert } from "../data-sanitizer";

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
