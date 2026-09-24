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
import {
  OUT_OF_BAND_REFUND_CLEARED_KEY,
  OUT_OF_BAND_REFUND_KEY,
  clearedOutOfBandRefundIds,
  outOfBandRefundOf,
  outOfBandRefunds,
  type StripeRefundLike,
} from "../../shared/out-of-band-refund";

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
  const outOfBand = foreign.map((r) => ({ id: r.id, amountCents: r.amount }));

  // Per booking, under a row lock taken in ONE transaction, so an admin clear and a delivery cannot
  // interleave. `detectedAt` keeps the first sighting; the rest is rewritten from the charge's full
  // refund list, which Stripe reports cumulatively, so a redelivery writes the same stamp. A refund
  // an admin already cleared on a booking is left out for that booking (§13: the clear was a human's
  // answer), so a redelivery cannot re-stamp it; a NEW refund on the same payment still stamps.
  const rows = await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id, booking_details FROM service_bookings
       WHERE stripe_payment_intent_id = ${input.paymentIntentId}
       ORDER BY id
       FOR UPDATE
    `);
    const out: Array<{ id: string; was_stamped: boolean }> = [];
    for (const r of (locked.rows ?? []) as Array<{ id: string; booking_details: unknown }>) {
      const cleared = clearedOutOfBandRefundIds(r.booking_details);
      const pending = foreign.filter((f) => !cleared.has(f.id));
      if (pending.length === 0) continue;
      const refundIds = pending.map((f) => f.id);
      const amountCents = pending.reduce((sum, f) => sum + (Number.isFinite(f.amount) ? f.amount : 0), 0);
      await tx.execute(sql`
        UPDATE service_bookings
           SET booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
                 ${OUT_OF_BAND_REFUND_KEY}::text, jsonb_build_object(
                   'detectedAt', COALESCE(booking_details #>> ${`{${OUT_OF_BAND_REFUND_KEY},detectedAt}`}::text[], ${nowIso}::text),
                   'lastSeenAt', ${nowIso}::text,
                   'paymentIntentId', ${input.paymentIntentId}::text,
                   'chargeId', ${input.chargeId ?? null}::text,
                   'refundIds', ${JSON.stringify(refundIds)}::jsonb,
                   'amountCents', ${amountCents}::int
                 )),
               updated_at = NOW()
         WHERE id = ${r.id}
      `);
      out.push({ id: r.id, was_stamped: outOfBandRefundOf(r.booking_details) !== null });
    }
    return out;
  });
  const refundIds = foreign.map((r) => r.id);
  const amountCents = foreign.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  if (rows.length === 0) {
    logger.info(
      { paymentIntentId: input.paymentIntentId, refundIds },
      "[out-of-band-refund] refund not issued by us: no service booking on this PaymentIntent, or every one was cleared — nothing to hold",
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

export type ClearOutOfBandRefundResult =
  | { cleared: false; reason: "not_found" }
  | {
      cleared: true;
      bookingId: string;
      refundIds: string[];
      /** Earning rows whose hold was released. */
      releasedEarnings: number;
      /** True when the booking is `disputed`: the traveler's own dispute keeps the hold. */
      holdKeptForDispute: boolean;
    };

/**
 * An admin clears a stamp (decision-maker, Sep 24, 2026). ONE atomic conditional: the stamp moves into
 * the append-only `outOfBandRefundCleared` history with who, when and the note, only if a stamp is
 * there — a second clear, or a clear of a booking that was never stamped, matches nothing and is
 * answered `not_found` (one answer for both, Locked Decision 40's posture). After the clear the
 * booking can complete and mint as normal.
 *
 * The earnings hold is released too, EXCEPT on a `disputed` booking: there the hold may be the
 * traveler's own dispute's, and releasing it is the dispute's decision, not this one. It moves no money.
 */
export async function clearOutOfBandRefund(input: {
  bookingId: string;
  actorId: string;
  note: string;
  now?: Date;
}): Promise<ClearOutOfBandRefundResult> {
  const nowIso = (input.now ?? new Date()).toISOString();
  const updated = await db.execute(sql`
    UPDATE service_bookings
       SET booking_details = (booking_details - ${OUT_OF_BAND_REFUND_KEY}::text) || jsonb_build_object(
             ${OUT_OF_BAND_REFUND_CLEARED_KEY}::text,
             COALESCE(booking_details -> ${OUT_OF_BAND_REFUND_CLEARED_KEY}::text, '[]'::jsonb)
               || jsonb_build_array(
                    (booking_details -> ${OUT_OF_BAND_REFUND_KEY}::text)
                      || jsonb_build_object('clearedAt', ${nowIso}::text, 'clearedBy', ${input.actorId}::text, 'note', ${input.note}::text)
                  )
           ),
           updated_at = NOW()
     WHERE id = ${input.bookingId}
       AND (booking_details -> ${OUT_OF_BAND_REFUND_KEY}::text) IS NOT NULL
    RETURNING id, status, booking_details #> ${`{${OUT_OF_BAND_REFUND_CLEARED_KEY}}`}::text[] AS history
  `);
  const row = (updated.rows ?? [])[0] as { id: string; status: string; history: unknown } | undefined;
  if (!row) return { cleared: false, reason: "not_found" };
  const history = Array.isArray(row.history) ? row.history : [];
  const last = history[history.length - 1] as { refundIds?: unknown } | undefined;
  const refundIds = Array.isArray(last?.refundIds) ? (last!.refundIds as string[]) : [];
  const holdKeptForDispute = row.status === "disputed";
  const releasedEarnings = holdKeptForDispute ? 0 : await storage.setBookingEarningsDispute(row.id, false);
  return { cleared: true, bookingId: row.id, refundIds, releasedEarnings, holdKeptForDispute };
}

/** Every booking currently stamped, newest sighting first — the admin work list. */
export async function listOutOfBandRefundBookings(limit = 200) {
  const r = await db.execute(sql`
    SELECT sb.id, sb.status, sb.total_amount, sb.stripe_payment_intent_id, sb.traveler_id, sb.provider_id,
           sb.booking_details -> ${OUT_OF_BAND_REFUND_KEY}::text AS marker,
           ps.service_name
      FROM service_bookings sb
      LEFT JOIN provider_services ps ON ps.id = sb.service_id
     WHERE (sb.booking_details -> ${OUT_OF_BAND_REFUND_KEY}::text) IS NOT NULL
     ORDER BY sb.booking_details #>> ${`{${OUT_OF_BAND_REFUND_KEY},lastSeenAt}`}::text[] DESC NULLS LAST, sb.id
     LIMIT ${limit}
  `);
  return r.rows ?? [];
}
