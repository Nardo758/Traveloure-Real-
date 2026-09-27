/**
 * THE ONE REFUND BREAKDOWN (ledger `2026-09-27-cancel-preview-equals-refund`; Terms §8.1: "the amount
 * displayed there is the amount refunded"). Pure — no db, no Stripe.
 *
 * A booking refund is two shares, and they were computed in two places:
 *   - the BOOKING share — what the booking row charged the traveler (`travelerChargeForRow`), at the
 *     cancellation tier's percent;
 *   - the TRAVELER SERVICE FEE share — the fee actually charged (`booking_details.travelerServiceFee`),
 *     at the percent R156 prescribes (the tier's percent for a traveler cancellation, 100 for a
 *     provider/expert cancellation or a made-whole refund).
 * The cancellation PREVIEW computed the first share only and called it "the refund"; the refund then
 * added the second. On `main` 521d00a10 a $105 booking with a $10 fee at the 50% tier previewed $52.50
 * and refunded $57.50 (and $105.00 vs $115.00 at the 100% tier). Now the preview, the cancel route,
 * the admin refund route and `refundServiceBooking` all read THIS function (§18 rule 1), so the number
 * shown before the act is the number Stripe is asked for.
 *
 * R156's EXCLUSIONS: payment-processing and currency-conversion fees are never part of a refund. The
 * platform charges the traveler neither, so there is no amount to subtract — the breakdown NAMES them
 * (`nonRefundable`) so a surface can say so, and never invents a figure for them (§13).
 */

/** R156: never part of a refund. Named, never priced — the platform charges the traveler neither. */
export const R156_NON_REFUNDABLE = ["payment_processing", "currency_conversion"] as const;

export interface RefundBreakdown {
  /** What the booking row charged the traveler, in dollars (the refund ceiling for the booking share). */
  bookingChargedDollars: number;
  /** The traveler service fee actually charged, in dollars (0 when waived or never assessed). */
  feeChargedDollars: number;
  bookingRefundDollars: number;
  feeRefundDollars: number;
  /** The whole refund — what the traveler gets back, and what Stripe is asked for. */
  totalRefundDollars: number;
  /** The percent applied to the fee share (0–100). */
  feeRefundPercent: number;
  nonRefundable: readonly string[];
}

/** The traveler service fee this booking actually charged, in dollars. A waived fee charged nothing. */
export function travelerFeeChargedOf(bookingDetails: unknown): number {
  const feeSnap = (bookingDetails && typeof bookingDetails === "object"
    ? (bookingDetails as Record<string, any>).travelerServiceFee
    : null) ?? null;
  if (!feeSnap || feeSnap.waived === true) return 0;
  const charged = Number(feeSnap.charged);
  return Number.isFinite(charged) && charged > 0 ? charged : 0;
}

/**
 * The breakdown for an explicit booking-share amount and fee percent — `refundServiceBooking`'s own
 * options. Clamps the booking share to [0, charged]; an omitted fee percent follows the existing rule
 * (a full refund refunds the full fee, a policy-scaled one refunds none unless told).
 */
export function computeRefundBreakdown(input: {
  bookingChargedDollars: number;
  feeChargedDollars: number;
  amountOverride?: number;
  feeRefundPercent?: number;
}): RefundBreakdown {
  const charged = Number.isFinite(input.bookingChargedDollars) ? Math.max(input.bookingChargedDollars, 0) : 0;
  const bookingRefund =
    input.amountOverride !== undefined ? Math.min(Math.max(input.amountOverride, 0), charged) : charged;
  const feeRefundPercent =
    input.feeRefundPercent !== undefined
      ? Math.min(Math.max(input.feeRefundPercent, 0), 100)
      : input.amountOverride === undefined
        ? 100 // a full booking refund makes the traveler whole on the fee too
        : 0; // a policy-scaled refund with no explicit fee % refunds no fee (conservative)
  const feeCharged = Number.isFinite(input.feeChargedDollars) ? Math.max(input.feeChargedDollars, 0) : 0;
  const feeRefund = feeCharged > 0 ? Math.round(feeCharged * (feeRefundPercent / 100) * 100) / 100 : 0;
  const total = Math.round((bookingRefund + feeRefund) * 100) / 100;
  return {
    bookingChargedDollars: charged,
    feeChargedDollars: feeCharged,
    bookingRefundDollars: bookingRefund,
    feeRefundDollars: feeRefund,
    totalRefundDollars: total,
    feeRefundPercent,
    nonRefundable: R156_NON_REFUNDABLE,
  };
}

/** The breakdown for a cancellation TIER: both shares at the tier's percent (R156). */
export function tierRefundBreakdown(input: {
  bookingChargedDollars: number;
  feeChargedDollars: number;
  percent: number;
}): RefundBreakdown {
  const charged = Number.isFinite(input.bookingChargedDollars) ? Math.max(input.bookingChargedDollars, 0) : 0;
  return computeRefundBreakdown({
    bookingChargedDollars: charged,
    feeChargedDollars: input.feeChargedDollars,
    amountOverride: Math.round(charged * input.percent) / 100, // percent of dollars, rounded to cents
    feeRefundPercent: input.percent,
  });
}

/**
 * The options `refundServiceBooking` must be given to send EXACTLY this breakdown. Every caller that
 * previewed a breakdown builds its refund through this — never by passing the previewed TOTAL as the
 * booking share (the defect this module exists to close).
 */
export function refundOptionsFor(b: RefundBreakdown): { amountOverride: number; feeRefundPercent: number } {
  return { amountOverride: b.bookingRefundDollars, feeRefundPercent: b.feeRefundPercent };
}
