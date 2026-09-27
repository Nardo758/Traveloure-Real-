/**
 * WHAT A BOOKING'S REFUND WAS, AND HOW A SURFACE SAYS IT (R163 amendment, merged design;
 * decision-maker Sep 27, 2026). Pure — no db, no Stripe.
 *
 * Two server-authored `booking_details` keys (§19d: never client-settable at birth):
 *   - `serviceBookingRefundAttempt` — the NON-FINAL claim `refundServiceBooking` takes BEFORE the
 *     Stripe call. It never makes a booking read "Refunded".
 *   - `serviceBookingRefund` — written by the SAME atomic conditional that sets status `refunded`,
 *     once Stripe has returned a refund that did not fail: what went back and what was charged.
 *
 * A refund we did NOT issue (Stripe dashboard) is the #1288 stamp instead; `refundSummaryFor` reads
 * both, and for a payment shared by several bookings it never attributes a partial amount to one of
 * them (§13) — it says it was a shared-payment refund and names the charge's total.
 */
import { OUT_OF_BAND_REFUND_KEY } from "./out-of-band-refund";

export const REFUND_ATTEMPT_KEY = "serviceBookingRefundAttempt" as const;
export const REFUND_RECORD_KEY = "serviceBookingRefund" as const;

export interface ServiceBookingRefundRecord {
  refundId: string;
  /** Cents Stripe refunded: the booking share plus the traveler-service-fee share. */
  amountCents: number;
  bookingRefundCents?: number;
  feeRefundCents?: number;
  /** Cents this booking charged the traveler (its share plus the fee), for the percentage. */
  chargedCents?: number | null;
  refundedAt?: string;
}

/**
 * The refund a traveler surface may state for one booking, or null when there is nothing to say.
 *   - `own`: a refund the platform issued for THIS booking — amount of charged, and a percent when
 *     it was less than the whole.
 *   - `shared_payment`: a refund we did not issue on a payment several bookings share; the amount
 *     is the payment's, never this booking's.
 *   - `out_of_band`: a refund we did not issue on a payment only this booking made.
 */
export type RefundSummary =
  | { kind: "own"; refundedCents: number; chargedCents: number | null; percent: number | null }
  | { kind: "out_of_band"; refundedCents: number; chargedCents: number | null; percent: number | null }
  | { kind: "shared_payment"; refundedCents: number; paymentCents: number | null };

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function percentOf(refunded: number, charged: number | null): number | null {
  if (!charged) return null;
  const pct = Math.round((refunded / charged) * 100);
  return pct >= 100 ? null : pct; // a full refund states no percentage
}

export function refundSummaryFor(input: {
  bookingDetails: unknown;
  /** How many service bookings the same PaymentIntent paid (this one included). */
  bookingsOnPayment: number;
}): RefundSummary | null {
  const bd = (input.bookingDetails && typeof input.bookingDetails === "object" ? input.bookingDetails : {}) as Record<string, any>;
  const own = bd[REFUND_RECORD_KEY];
  const ownCents = positiveInt(own?.amountCents);
  if (ownCents) {
    const charged = positiveInt(own?.chargedCents);
    return { kind: "own", refundedCents: ownCents, chargedCents: charged, percent: percentOf(ownCents, charged) };
  }
  const foreign = bd[OUT_OF_BAND_REFUND_KEY];
  const foreignCents = positiveInt(foreign?.amountCents);
  if (foreignCents) {
    const paymentCents = positiveInt(foreign?.chargeAmountCents);
    if (input.bookingsOnPayment > 1) return { kind: "shared_payment", refundedCents: foreignCents, paymentCents };
    return { kind: "out_of_band", refundedCents: foreignCents, chargedCents: paymentCents, percent: percentOf(foreignCents, paymentCents) };
  }
  return null;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The ONE sentence a traveler reads about a refund. Written HERE and nowhere else. */
export function refundSummaryLine(summary: RefundSummary | null | undefined): string | null {
  if (!summary) return null;
  if (summary.kind === "shared_payment") {
    return summary.paymentCents
      ? `Refund on a shared payment: ${dollars(summary.refundedCents)} of the ${dollars(summary.paymentCents)} payment`
      : `Refund on a shared payment: ${dollars(summary.refundedCents)}`;
  }
  return summary.chargedCents
    ? `${dollars(summary.refundedCents)} of ${dollars(summary.chargedCents)} refunded`
    : `${dollars(summary.refundedCents)} refunded`;
}

/** The badge suffix for a booking that reads "Refunded": "(50%)" for a partial own refund. */
export function refundedBadgeLabel(base: string, summary: RefundSummary | null | undefined): string {
  if (summary && summary.kind !== "shared_payment" && summary.percent !== null) return `${base} (${summary.percent}%)`;
  return base;
}
