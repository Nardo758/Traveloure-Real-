/**
 * A REFUND WE DID NOT ISSUE STOPS THE EARNINGS MINT — board task #1288, ledger
 * `2026-09-24-out-of-band-refund-blocks-mint`. Pure: no db, no Stripe.
 *
 * Every refund the platform issues is created with `metadata.source` (the whole-row refund, the
 * bundle partial settlement, the artifact-rejection refund, the AI-task proposal refund, the
 * coordination-fee refund). A refund made in the Stripe DASHBOARD, or by anything else outside our
 * code, carries no such tag. That is the ONE test for "out of band" (§18 rule 1): the webhook and
 * the tests both call `outOfBandRefunds`, and nothing re-derives it.
 *
 * When one is seen, the webhook stamps `booking_details.outOfBandRefund` on every service booking
 * paid by that PaymentIntent. `outOfBandRefundOf` is the one reader of that stamp. Its presence
 * means the booking may NOT complete and may NOT mint earnings until a human resolves it.
 *
 * What this cannot tell (§13): WHICH booking a partial dashboard refund was meant for, when one
 * PaymentIntent paid several. So every booking on that PaymentIntent is stamped, and none is
 * guessed. The stamp names the refund ids and the cents Stripe reported, never an amount of ours.
 *
 * AN ADMIN MAY CLEAR A STAMP (decision-maker, Sep 24, 2026 — a goodwill partial refund whose seller
 * should still be paid). The clear moves the stamp into the append-only history
 * `booking_details.outOfBandRefundCleared` with who, when and a required note. A refund id in that
 * history is never stamped again on the same booking, so a webhook redelivery cannot undo a clear;
 * a NEW refund on the same payment still is.
 */

export const OUT_OF_BAND_REFUND_KEY = "outOfBandRefund" as const;
export const OUT_OF_BAND_REFUND_CLEARED_KEY = "outOfBandRefundCleared" as const;

export interface StripeRefundLike {
  id: string;
  amount: number;
  metadata?: Record<string, string> | null;
}

export interface OutOfBandRefundMarker {
  detectedAt: string;
  lastSeenAt: string;
  paymentIntentId: string;
  chargeId: string | null;
  refundIds: string[];
  /** Cents of the refunds above, exactly as Stripe reported them. */
  amountCents: number;
}

/** True when the refund was created by our code — it carries our `metadata.source` tag. */
export function isPlatformIssuedRefund(refund: StripeRefundLike): boolean {
  const source = refund.metadata?.source;
  return typeof source === "string" && source.trim().length > 0;
}

/** The refunds on a charge that our code did not issue, in the order Stripe listed them. */
export function outOfBandRefunds(refunds: readonly StripeRefundLike[]): StripeRefundLike[] {
  return refunds.filter((r) => r && typeof r.id === "string" && r.id.length > 0 && !isPlatformIssuedRefund(r));
}

/** The stamp on a booking, or null when it has none. Never throws on a malformed row. */
export function outOfBandRefundOf(bookingDetails: unknown): OutOfBandRefundMarker | null {
  if (!bookingDetails || typeof bookingDetails !== "object") return null;
  const marker = (bookingDetails as Record<string, unknown>)[OUT_OF_BAND_REFUND_KEY];
  if (!marker || typeof marker !== "object") return null;
  return marker as OutOfBandRefundMarker;
}

/** Refund ids an admin already cleared on this booking. Never throws on a malformed row. */
export function clearedOutOfBandRefundIds(bookingDetails: unknown): Set<string> {
  const ids = new Set<string>();
  if (!bookingDetails || typeof bookingDetails !== "object") return ids;
  const history = (bookingDetails as Record<string, unknown>)[OUT_OF_BAND_REFUND_CLEARED_KEY];
  if (!Array.isArray(history)) return ids;
  for (const entry of history) {
    const refundIds = entry && typeof entry === "object" ? (entry as Record<string, unknown>).refundIds : null;
    if (Array.isArray(refundIds)) for (const id of refundIds) if (typeof id === "string") ids.add(id);
  }
  return ids;
}
