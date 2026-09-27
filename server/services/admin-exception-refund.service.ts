/**
 * THE ADMIN EXCEPTION REFUND (decision-maker ruled Sep 27, 2026 — lane 4 of the R154 status trace;
 * ledger `2026-09-27-admin-exception-refund`).
 *
 * An admin refunds a booking OUTSIDE its cancellation policy — full, or a partial amount they name —
 * with a required reason. It is not a new money path: it runs the ONE app refund
 * (`refundServiceBookingWithLedger` → `refundServiceBooking`), so it takes the same non-final claim,
 * the same deterministic Stripe key, writes the same `refunds` audit row and the same ledger
 * reversals, and it can happen at most ONCE per booking (the claim refuses a second). The admin's id
 * and reason go to the access audit log.
 *
 * REFUSED, by name and before anything moves: `payment_pending` (nothing was charged yet), `failed`
 * (nothing was charged), `disputed` (a dispute is refunded only by resolving it), plus what cannot be
 * refunded again — `refunded`, `expired` (never paid), a booking the app already refunded (its refund
 * record is on the row), and one a Stripe-dashboard refund already fully covered.
 *
 * THE AMOUNT: the admin names cents, never more than the traveler was charged (booking + fee actually
 * charged — both server-derived, §14). A partial is split between the two shares at one percentage
 * (`exceptionRefundBreakdown`), and Stripe is asked for exactly the cents entered. Over the charge is
 * refused, never clamped.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { stripePaymentService } from "./stripe-payment.service";
import { exceptionRefundBreakdown, computeRefundBreakdown, type RefundBreakdown } from "./refund-breakdown";
import { REFUND_ATTEMPT_KEY, REFUND_RECORD_KEY } from "@shared/booking-refund-record";

export type ExceptionRefundRefusal =
  | "not_found"
  | "payment_pending"
  | "failed"
  | "disputed"
  | "refunded"
  | "expired"
  | "already_refunded_by_app"
  | "refunded_outside_platform"
  | "no_payment";

export const EXCEPTION_REFUND_REFUSAL_MESSAGES: Record<ExceptionRefundRefusal, string> = {
  not_found: "No such booking.",
  payment_pending: "This booking has not been paid yet, so there is nothing to refund.",
  failed: "This booking's payment failed, so nothing was charged.",
  disputed: "This booking is under dispute. Resolve the dispute instead (uphold refunds it).",
  refunded: "This booking is already refunded.",
  expired: "This booking was never paid (its checkout expired).",
  already_refunded_by_app: "This booking already has a refund issued by the platform; a second refund is not possible here.",
  refunded_outside_platform: "This booking was already fully refunded in the Stripe dashboard.",
  no_payment: "This booking has no payment on record to refund.",
};

export interface ExceptionRefundQuote {
  bookingId: string;
  status: string;
  bookingChargedCents: number;
  feeChargedCents: number;
  chargedCents: number;
  refusal: ExceptionRefundRefusal | null;
  refusalMessage: string | null;
}

export async function quoteExceptionRefund(bookingId: string): Promise<ExceptionRefundQuote> {
  const row = (
    await db.execute(sql`
      SELECT id, status, total_amount, platform_fee, insurance_fee, stripe_payment_intent_id, booking_details
      FROM service_bookings WHERE id = ${bookingId} LIMIT 1
    `)
  ).rows?.[0] as any;
  if (!row) {
    return { bookingId, status: "", bookingChargedCents: 0, feeChargedCents: 0, chargedCents: 0, refusal: "not_found", refusalMessage: EXCEPTION_REFUND_REFUSAL_MESSAGES.not_found };
  }
  const shares = stripePaymentService.chargedSharesForRow(row);
  const bookingChargedCents = Math.round(shares.bookingChargedDollars * 100);
  const feeChargedCents = Math.round(shares.feeChargedDollars * 100);
  const details = (row.booking_details ?? {}) as Record<string, unknown>;
  let refusal: ExceptionRefundRefusal | null = null;
  const status = String(row.status ?? "");
  if (status === "payment_pending" || status === "failed" || status === "disputed" || status === "refunded" || status === "expired") {
    refusal = status;
  } else if (details[REFUND_ATTEMPT_KEY] || details[REFUND_RECORD_KEY]) {
    refusal = "already_refunded_by_app";
  } else if (!row.stripe_payment_intent_id) {
    refusal = "no_payment";
  } else {
    const { isFullyRefundedOutOfBand } = await import("./out-of-band-refund.service");
    if (await isFullyRefundedOutOfBand(bookingId)) refusal = "refunded_outside_platform";
  }
  return {
    bookingId,
    status,
    bookingChargedCents,
    feeChargedCents,
    chargedCents: bookingChargedCents + feeChargedCents,
    refusal,
    refusalMessage: refusal ? EXCEPTION_REFUND_REFUSAL_MESSAGES[refusal] : null,
  };
}

/** The breakdown for a request, or null when the amount is not a positive number of cents within the charge. */
export function exceptionBreakdownFor(quote: ExceptionRefundQuote, request: { mode: "full" } | { mode: "partial"; amountCents: number }): RefundBreakdown | null {
  const input = { bookingChargedDollars: quote.bookingChargedCents / 100, feeChargedDollars: quote.feeChargedCents / 100 };
  if (request.mode === "full") return quote.chargedCents > 0 ? computeRefundBreakdown(input) : null;
  return exceptionRefundBreakdown({ ...input, amountCents: request.amountCents });
}

export type ExceptionRefundOutcome =
  | { ok: false; refusal: ExceptionRefundRefusal | "invalid_amount" | "lost_chargeback"; message: string; body?: unknown }
  | {
      ok: true;
      refundId: string | null;
      refundedCents: number;
      bookingRefundCents: number;
      feeRefundCents: number;
      alreadyRefunded: boolean;
      reversedEarnings: number;
      skippedPaidOut: number;
      revertedPlanItems: number;
    };

export async function issueExceptionRefund(input: {
  bookingId: string;
  adminId: string;
  reason: string;
  request: { mode: "full" } | { mode: "partial"; amountCents: number };
}): Promise<ExceptionRefundOutcome> {
  const quote = await quoteExceptionRefund(input.bookingId);
  if (quote.refusal) return { ok: false, refusal: quote.refusal, message: quote.refusalMessage! };
  const b = exceptionBreakdownFor(quote, input.request);
  if (!b) {
    return {
      ok: false,
      refusal: "invalid_amount",
      message: `The amount must be more than $0 and at most what the traveler was charged ($${(quote.chargedCents / 100).toFixed(2)}).`,
    };
  }
  const totalCents = Math.round(b.totalRefundDollars * 100);
  const full = totalCents === quote.chargedCents;
  const { refundServiceBookingWithLedger } = await import("./service-booking-refund.service");
  const done = await refundServiceBookingWithLedger(input.bookingId, {
    // Kept verbatim on the `refunds` audit row; Stripe gets its own enum value (toStripeRefundReason).
    reason: `admin_exception_refund: ${input.reason}`,
    // A full refund sends no booking override (the whole charge, fee at the breakdown's make-whole
    // percent); a partial sends both shares. `b` is non-null only when something was charged.
    ...(full ? { feeRefundPercent: b.feeRefundPercent } : { amountOverride: b.bookingRefundDollars, feeRefundPercent: b.feeRefundPercent }),
    refundFraction: totalCents / quote.chargedCents,
  });
  if (!done.ok) return { ok: false, refusal: "lost_chargeback", message: "A lost chargeback already returned this money.", body: done.lostChargeback };
  const r: any = done.refund;
  return {
    ok: true,
    refundId: r?.refundId ?? r?.stripeRefundId ?? null,
    refundedCents: typeof r?.amount === "number" ? Math.round(r.amount * 100) : totalCents,
    bookingRefundCents: Math.round(b.bookingRefundDollars * 100),
    feeRefundCents: Math.round(b.feeRefundDollars * 100),
    alreadyRefunded: !!r?.alreadyRefunded,
    reversedEarnings: done.reversedEarnings,
    skippedPaidOut: done.skippedPaidOut,
    revertedPlanItems: done.revertedPlanItems,
  };
}
