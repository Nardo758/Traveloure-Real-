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
 * decide who the refund was for. R163 (ledger `2026-09-27-dashboard-refund-reads-refunded`) makes
 * the stamp VISIBLE: where it covers a booking's whole share (`outOfBandFullyRefundedBookingIds`
 * below) the traveler's surfaces read "Refunded" — a label, still no status write. A human resolves the booking through the existing refund/cancel
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
  mergeRefundSnapshots,
  outOfBandRefundOf,
  outOfBandRefunds,
  type StripeRefundLike,
} from "../../shared/out-of-band-refund";
import { bookingChargeShare, outOfBandRefundCoversShare, type PaymentIntentShareRow } from "./booking-charge-share";

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
  /** The charge's own `amount` in cents, recorded on the stamp so a surface can say "$X of $Y". */
  chargeAmountCents?: number | null;
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
      // R163 amendment: merged BY REFUND ID with what the stamp already holds, so the amount is
      // cumulative and out-of-order snapshots cannot lower it (`mergeRefundSnapshots`).
      const priorMarker = outOfBandRefundOf(r.booking_details);
      const merged = mergeRefundSnapshots(priorMarker?.refunds ?? null, pending);
      const refundIds = merged.refundIds.filter((id) => !cleared.has(id));
      const amountCents = merged.amountCents;
      await tx.execute(sql`
        UPDATE service_bookings
           SET booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
                 ${OUT_OF_BAND_REFUND_KEY}::text, jsonb_build_object(
                   'detectedAt', COALESCE(booking_details #>> ${`{${OUT_OF_BAND_REFUND_KEY},detectedAt}`}::text[], ${nowIso}::text),
                   'lastSeenAt', ${nowIso}::text,
                   'paymentIntentId', ${input.paymentIntentId}::text,
                   'chargeId', ${input.chargeId ?? null}::text,
                   'refundIds', ${JSON.stringify(refundIds)}::jsonb,
                   'refunds', ${JSON.stringify(merged.refunds)}::jsonb,
                   'chargeAmountCents', ${input.chargeAmountCents ?? null}::bigint,
                   'amountCents', ${amountCents}::bigint
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

/**
 * R163, the traveler-action half. A booking whose share a refund we did not issue covered IN FULL
 * reads "Refunded", so the traveler's cancel and dispute rails refuse it with this ONE 409 body —
 * BEFORE any ledger reversal or Stripe call, so no second refund is ever attempted (§14: the button
 * being hidden is not the guard). Same rule as the label (`outOfBandFullyRefundedBookingIds`).
 */
export const REFUNDED_OUT_OF_BAND_REFUSAL = {
  error: "refunded_out_of_band",
  message:
    "This booking has already been refunded in full, so there is nothing left to cancel or dispute. " +
    "Nothing was changed and no further refund was attempted.",
} as const;

export async function isFullyRefundedOutOfBand(bookingId: string): Promise<boolean> {
  return (await outOfBandFullyRefundedBookingIds([bookingId])).has(bookingId);
}

/**
 * R163 (ledger `2026-09-27-dashboard-refund-reads-refunded`; supersedes #1288's leave-for-human
 * reading for the LABEL only). Which of these bookings a refund we did not issue has refunded IN
 * FULL, by the ONE rule `outOfBandRefundCoversShare` (server/services/booking-charge-share.ts): the
 * booking's own stamp — Stripe's cumulative cents — against every still-live share on the same
 * PaymentIntent. A partial dashboard refund answers no.
 *
 * READ-ONLY: this answers a status LABEL. It writes nothing, moves no money and changes no
 * `service_bookings.status`; the stamp, the mint refusal, the earnings hold and the admin clear are
 * exactly as #1288 left them. Only stamped rows cost a second query, and an empty input costs none.
 */
export async function outOfBandFullyRefundedBookingIds(bookingIds: readonly (string | null | undefined)[]): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = Array.from(new Set(bookingIds.filter((id): id is string => typeof id === "string" && id.length > 0)));
  if (ids.length === 0) return out;
  const stamped = await db.execute(sql`
    SELECT id, stripe_payment_intent_id,
           (booking_details #>> ${`{${OUT_OF_BAND_REFUND_KEY},amountCents}`}::text[]) AS foreign_cents
      FROM service_bookings
     WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
       AND (COALESCE(booking_details, '{}'::jsonb) -> ${OUT_OF_BAND_REFUND_KEY}::text) IS NOT NULL
       AND stripe_payment_intent_id IS NOT NULL
  `);
  const targets = (stamped.rows ?? []) as Array<{ id: string; stripe_payment_intent_id: string; foreign_cents: string | null }>;
  if (targets.length === 0) return out;
  const intents = Array.from(new Set(targets.map((t) => t.stripe_payment_intent_id)));
  const siblings = await db.execute(sql`
    SELECT id, status, stripe_payment_intent_id, total_amount, platform_fee,
           booking_details->'travelerCharge'->>'conciergeFee' AS concierge_fee,
           booking_details->'travelerServiceFee'->>'charged' AS traveler_fee_charged
      FROM service_bookings
     WHERE stripe_payment_intent_id IN (${sql.join(intents.map((pi) => sql`${pi}`), sql`, `)})
  `);
  const byIntent = new Map<string, PaymentIntentShareRow[]>();
  for (const r of (siblings.rows ?? []) as any[]) {
    const list = byIntent.get(r.stripe_payment_intent_id) ?? [];
    list.push({
      id: String(r.id),
      status: r.status ?? null,
      share: bookingChargeShare({
        totalAmount: r.total_amount,
        platformFee: r.platform_fee,
        conciergeFeeSnapshot: r.concierge_fee,
        travelerFeeCharged: r.traveler_fee_charged,
      }),
    });
    byIntent.set(r.stripe_payment_intent_id, list);
  }
  for (const t of targets) {
    const covered = outOfBandRefundCoversShare({
      bookingId: t.id,
      foreignRefundedCents: t.foreign_cents == null ? null : Number(t.foreign_cents),
      rowsOnPaymentIntent: byIntent.get(t.stripe_payment_intent_id) ?? [],
    });
    if (covered) out.add(t.id);
  }
  return out;
}
