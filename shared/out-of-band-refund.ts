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
  /** Stripe's refund status. A `failed`/`canceled` refund returned no money and counts for nothing. */
  status?: string | null;
  metadata?: Record<string, string> | null;
}

export interface OutOfBandRefundMarker {
  detectedAt: string;
  lastSeenAt: string;
  paymentIntentId: string;
  chargeId: string | null;
  refundIds: string[];
  /**
   * CUMULATIVE cents of the live refunds in `refunds` (R163 amendment): the sum over every refund
   * id ever seen on this charge whose status is not failed/canceled. An older snapshot cannot lower
   * it by omitting a refund; a refund Stripe later reports failed stops counting.
   */
  amountCents: number;
  /** Per refund id: its cents and its most final status seen. Absent on a pre-amendment stamp. */
  refunds?: Record<string, { amountCents: number; status: string | null }>;
  /** The charge's own `amount`, so a surface can say "$X of $Y" without guessing. */
  chargeAmountCents?: number | null;
}

/** A refund status that returned no money. */
export function isDeadRefundStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "canceled";
}

/**
 * Merge one snapshot of a charge's refunds into what a booking's stamp already holds, BY REFUND ID
 * (R163 amendment, merged design Sep 27, 2026). Pure. Charge events can arrive out of order, so a
 * refund absent from this snapshot is kept, and a status Stripe already made final is never
 * replaced by an older snapshot's `pending`; a refund that failed stays failed.
 */
export function mergeRefundSnapshots(
  prior: OutOfBandRefundMarker["refunds"] | null | undefined,
  incoming: readonly StripeRefundLike[],
): { refunds: NonNullable<OutOfBandRefundMarker["refunds"]>; amountCents: number; refundIds: string[] } {
  const merged: NonNullable<OutOfBandRefundMarker["refunds"]> = {};
  if (prior && typeof prior === "object") {
    for (const [id, v] of Object.entries(prior)) {
      if (!v || typeof v !== "object") continue;
      const cents = Number((v as any).amountCents);
      merged[id] = { amountCents: Number.isSafeInteger(cents) && cents >= 0 ? cents : 0, status: (v as any).status ?? null };
    }
  }
  for (const r of incoming) {
    if (!r || typeof r.id !== "string" || r.id.length === 0) continue;
    const cents = Number.isSafeInteger(r.amount) && r.amount >= 0 ? r.amount : 0;
    const before = merged[r.id];
    const status = before && isDeadRefundStatus(before.status) ? before.status : r.status ?? before?.status ?? null;
    merged[r.id] = { amountCents: cents, status };
  }
  const refundIds = Object.keys(merged).sort();
  const amountCents = refundIds.reduce((sum, id) => sum + (isDeadRefundStatus(merged[id].status) ? 0 : merged[id].amountCents), 0);
  return { refunds: merged, amountCents, refundIds };
}

/**
 * Is this charge snapshot trustworthy enough to act on? Pure. Returns null when it is, or the reason
 * it is not. Full vs partial is decided from these cumulative cents and NEVER from refund metadata;
 * a charge whose amounts cannot be trusted is an error the delivery is refused on, never a silent
 * "refunded".
 */
export function validateChargeRefundSnapshot(
  charge: { id?: string; amount: unknown; amount_refunded: unknown },
  refunds: readonly { id?: unknown; amount?: unknown }[],
): string | null {
  const amount = charge.amount as number;
  const refunded = charge.amount_refunded as number;
  if (!Number.isSafeInteger(amount) || amount <= 0) return "charge.amount is not a positive integer of cents";
  if (!Number.isSafeInteger(refunded) || refunded < 0) return "charge.amount_refunded is not a non-negative integer of cents";
  if (refunded > amount) return "charge.amount_refunded exceeds charge.amount";
  for (const r of refunds) {
    if (typeof r?.id !== "string" || r.id.length === 0) return "a refund on the charge has no id";
    if (!Number.isSafeInteger(r.amount as number) || (r.amount as number) < 0) return `refund ${r.id} has no valid amount`;
  }
  if (refunded > 0 && refunds.length === 0) return "the charge reports refunded cents but lists no refund";
  return null;
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
