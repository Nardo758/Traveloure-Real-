/**
 * RECORD A REFUND WE DID NOT ISSUE — board task #1288, ledger
 * `2026-09-24-out-of-band-refund-blocks-mint`.
 *
 * Called by the platform webhook's `charge.refunded` arm. Before this, a refund made in the Stripe
 * dashboard left the booking `confirmed`, and the completion mint later credited the seller for
 * money the traveler already had back; the daily reconciliation only DETECTED it the next day
 * (`refund_not_reversed`). Now, for every service booking the refunded PaymentIntent paid:
 *
 *   1. the booking is stamped `booking_details.outOfBandRefund` (merged, never assigned). The status
 *      writer refuses `completed`/`partially_completed` for a stamped row and the mint refuses to
 *      mint for one, so no path can create earnings for it;
 *   2. earnings ALREADY minted and still unpaid (held or releasable) are frozen through the existing
 *      `setBookingEarningsDispute` hold, so the release job and the payout summary skip them;
 *   3. an admin alert names the bookings, once, on first detection.
 *
 * It moves no money and changes no booking status: it does not reverse earnings, refund, cancel or
 * decide who the refund was for. A human resolves the booking through the existing refund/cancel
 * rails. Idempotent: a redelivery rewrites the same stamp (the first `detectedAt` is kept), re-applies
 * the same hold, and raises no second alert.
 *
 * NOT COVERED, stated (§18d): earnings already PAID OUT (no automatic claw-back; the alert says so);
 * PaymentIntents that are not on `service_bookings` (Trip Pass, ready-made purchases, coordination
 * fees, the legacy `bookings` rail) match nothing and are only logged; and the arm runs only while
 * the platform webhook endpoint is subscribed to `charge.refunded`.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { raiseOpsAlert } from "./ops-alert.service";
import { OUT_OF_BAND_REFUND_KEY, outOfBandRefunds, type StripeRefundLike } from "../../shared/out-of-band-refund";

export interface RecordOutOfBandRefundResult {
  /** The refunds on the charge that our code did not issue. Empty ⇒ nothing was written. */
  outOfBand: Array<{ id: string; amountCents: number }>;
  /** Every service booking stamped by this call (already-stamped rows included). */
  bookingIds: string[];
  /** Bookings stamped for the FIRST time by this call — the ones the alert names. */
  newlyStampedBookingIds: string[];
  /** Unpaid earning rows put on hold. */
  heldEarnings: number;
}

export async function recordOutOfBandRefund(input: {
  paymentIntentId: string | null | undefined;
  chargeId: string | null | undefined;
  refunds: readonly StripeRefundLike[];
  now?: Date;
}): Promise<RecordOutOfBandRefundResult> {
  const empty: RecordOutOfBandRefundResult = { outOfBand: [], bookingIds: [], newlyStampedBookingIds: [], heldEarnings: 0 };
  const foreign = outOfBandRefunds(input.refunds);
  if (foreign.length === 0 || !input.paymentIntentId) return empty;

  const nowIso = (input.now ?? new Date()).toISOString();
  const refundIds = foreign.map((r) => r.id);
  const amountCents = foreign.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  const outOfBand = foreign.map((r) => ({ id: r.id, amountCents: r.amount }));

  // ONE statement per PaymentIntent. `detectedAt` keeps the first sighting; the rest is rewritten
  // from the charge's full refund list, which Stripe reports cumulatively, so a redelivery writes
  // the same stamp. `was_stamped` is read from the pre-update row (FROM a self-join on the old
  // version), which is how the alert fires once.
  const stamped = await db.execute(sql`
    UPDATE service_bookings sb
       SET booking_details = COALESCE(sb.booking_details, '{}'::jsonb) || jsonb_build_object(
             ${OUT_OF_BAND_REFUND_KEY}::text, jsonb_build_object(
               'detectedAt', COALESCE(sb.booking_details #>> ${`{${OUT_OF_BAND_REFUND_KEY},detectedAt}`}::text[], ${nowIso}::text),
               'lastSeenAt', ${nowIso}::text,
               'paymentIntentId', ${input.paymentIntentId}::text,
               'chargeId', ${input.chargeId ?? null}::text,
               'refundIds', ${JSON.stringify(refundIds)}::jsonb,
               'amountCents', ${amountCents}::int
             )),
           updated_at = NOW()
      FROM service_bookings prior
     WHERE prior.id = sb.id
       AND sb.stripe_payment_intent_id = ${input.paymentIntentId}
    RETURNING sb.id, (prior.booking_details -> ${OUT_OF_BAND_REFUND_KEY}::text) IS NOT NULL AS was_stamped
  `);
  const rows = (stamped.rows ?? []) as Array<{ id: string; was_stamped: boolean }>;
  if (rows.length === 0) {
    logger.info(
      { paymentIntentId: input.paymentIntentId, refundIds },
      "[out-of-band-refund] refund not issued by us, on a PaymentIntent with no service booking — nothing to hold",
    );
    return { ...empty, outOfBand };
  }

  let heldEarnings = 0;
  for (const row of rows) {
    heldEarnings += await storage.setBookingEarningsDispute(row.id, true);
  }

  const bookingIds = rows.map((r) => r.id);
  const newlyStampedBookingIds = rows.filter((r) => !r.was_stamped).map((r) => r.id);
  if (newlyStampedBookingIds.length > 0) {
    await raiseOpsAlert({
      type: "out_of_band_refund",
      message:
        `A refund we did not issue (Stripe dashboard or other) hit ${newlyStampedBookingIds.length} booking(s). ` +
        `They cannot complete or mint earnings, and unpaid earnings are on hold. Resolve each through the ` +
        `booking refund/cancel rail. Earnings already paid out were not touched.`,
      reason: "charge_refunded_without_platform_source",
      metadata: {
        paymentIntentId: input.paymentIntentId,
        chargeId: input.chargeId ?? null,
        refundIds,
        amountCents,
        bookingIds: newlyStampedBookingIds,
        heldEarnings,
      },
    });
  }
  return { outOfBand, bookingIds, newlyStampedBookingIds, heldEarnings };
}
