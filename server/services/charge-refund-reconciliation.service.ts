import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { deriveClaimedSlotIds, deriveClaimedSlotUnits } from "./checkout-claim.service";

export interface ChargeRefundReconciliationResult {
  fullyRefunded: boolean;
  /** All service bookings paid by this Charge's PaymentIntent. */
  bookingIds: string[];
  newlyRefundedBookings: Array<{
    id: string;
    slot_id: string | null;
    booking_details: Record<string, unknown> | null;
  }>;
  bookingStatuses: Record<string, string>;
}

/**
 * Reconcile every service booking on a charge from Stripe's cumulative, authoritative
 * cent amounts. Refund metadata is deliberately irrelevant to the full/partial decision:
 * a shared-charge partial refund never makes an individual booking terminal.
 */
export async function reconcileChargeRefund(
  charge: Stripe.Charge,
  refunds: readonly Stripe.Refund[],
): Promise<ChargeRefundReconciliationResult> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  const amountCents = charge.amount;
  const refundedCents = charge.amount_refunded;

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !Number.isSafeInteger(refundedCents) ||
    refundedCents < 0 ||
    refundedCents > amountCents
  ) {
    throw new Error(`Refunded charge ${charge.id} has invalid charge/refund cent amounts`);
  }

  const fullyRefunded = refundedCents === amountCents;
  const uniqueRefunds = new Map<string, Stripe.Refund>();
  for (const refund of refunds) {
    if (!refund?.id || !Number.isSafeInteger(refund.amount) || refund.amount < 0) {
      throw new Error(`Refunded charge ${charge.id} contains a refund without valid ID/amount`);
    }
    uniqueRefunds.set(refund.id, refund);
  }
  if (refundedCents > 0 && uniqueRefunds.size === 0) {
    throw new Error(`Refunded charge ${charge.id} has a refund total but no refund IDs`);
  }
  const distinctRefunds = Array.from(uniqueRefunds.values()).sort((a, b) => a.id.localeCompare(b.id));
  const result = await db.transaction(async (tx) => {
    // The refunds table intentionally has no unique refund-ID constraint. Serialize every
    // writer for an ID, then make insertion idempotent across the app and webhook paths.
    for (const refund of distinctRefunds) {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(hashtext(${refund.id}), hashtext('stripe-refund-audit'))
      `);
      await tx.execute(sql`
        INSERT INTO refunds (
          stripe_refund_id, stripe_charge_id, stripe_payment_intent_id,
          amount, currency, status, created_at
        )
        SELECT ${refund.id}, ${charge.id}, ${paymentIntentId},
               ${refund.amount / 100}, ${charge.currency}, ${refund.status ?? "completed"}, NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM refunds WHERE stripe_refund_id = ${refund.id}
         )
      `);
      await tx.execute(sql`
        UPDATE refunds
           SET stripe_charge_id = COALESCE(stripe_charge_id, ${charge.id}),
               stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ${paymentIntentId}),
               status = CASE
                 WHEN status IN ('succeeded', 'failed', 'canceled') THEN status
                 ELSE COALESCE(${refund.status ?? null}, status)
               END
         WHERE stripe_refund_id = ${refund.id}
      `);
    }

    const locked = paymentIntentId
      ? await tx.execute(sql`
          SELECT id, status, slot_id, booking_details
            FROM service_bookings
           WHERE stripe_payment_intent_id = ${paymentIntentId}
           ORDER BY id
           FOR UPDATE
        `)
      : { rows: [] };
    const rows = (locked.rows ?? []) as Array<{
      id: string;
      status: string;
      slot_id: string | null;
      booking_details: Record<string, unknown> | null;
    }>;
    const sharedPayment = rows.length > 1;
    const newlyRefundedBookings: ChargeRefundReconciliationResult["newlyRefundedBookings"] = [];
    const bookingStatuses: Record<string, string> = {};

    for (const row of rows) {
      // The SQL-side GREATEST is the persistence guard for out-of-order Charge snapshots:
      // an older partial event cannot lower a full cumulative amount already stored.
      // Status is likewise terminal-monotonic: a partial replay preserves `refunded`.
      const nextStatus = fullyRefunded || row.status === "refunded" ? "refunded" : row.status;
      const newlyRefunded = fullyRefunded && row.status !== "refunded";
      await tx.execute(sql`
        UPDATE service_bookings
           SET status = ${nextStatus},
               booking_details = COALESCE(booking_details, '{}'::jsonb) ||
                 jsonb_build_object(
                   'chargeRefund', jsonb_build_object(
                       'amountCents', GREATEST(
                         COALESCE((booking_details->'chargeRefund'->>'amountCents')::bigint, 0),
                         ${refundedCents}::bigint
                       ),
                       'chargeAmountCents', GREATEST(
                         COALESCE((booking_details->'chargeRefund'->>'chargeAmountCents')::bigint, 0),
                         ${amountCents}::bigint
                       ),
                      'sharedPayment', COALESCE(
                        (booking_details->'chargeRefund'->>'sharedPayment')::boolean,
                        false
                      ) OR ${sharedPayment}::boolean
                   )
                 ),
               updated_at = NOW()
          WHERE id = ${row.id}
      `);
      bookingStatuses[row.id] = nextStatus;
      if (newlyRefunded) {
        newlyRefundedBookings.push(row);

        // The slot decrement and terminal booking transition are one transaction. A failed slot
        // write rolls the status transition back; a webhook retry can safely perform both again.
        const slotIds = Array.from(new Set(deriveClaimedSlotIds(row.booking_details, row.slot_id)));
        const units = deriveClaimedSlotUnits(row.booking_details);
        for (const slotId of slotIds) {
          await tx.execute(sql`
            UPDATE vendor_availability_slots
               SET booked_count = GREATEST(COALESCE(booked_count, 0) - ${units}, 0),
                   status = CASE
                     WHEN status = 'fully_booked'
                       AND GREATEST(COALESCE(booked_count, 0) - ${units}, 0) < COALESCE(capacity, 1)
                       THEN 'available'
                     ELSE status
                   END,
                   updated_at = NOW()
             WHERE id = ${slotId}
          `);
        }
      }
    }
    return {
      newlyRefundedBookings,
      bookingStatuses,
      bookingRows: rows,
    };
  });

  // Full charge refunds reverse held/releasable seller earnings and recognized platform revenue
  // for every linked booking, regardless of refund source. The out-of-band stamp and alert were
  // committed first and are deliberately untouched. Both ledger writers are replay-safe; if one
  // fails, throw so a webhook redelivery can finish the remaining work.
  if (fullyRefunded) {
    for (const row of result.bookingRows) {
      await storage.reverseEarningsForBooking(row.id);
      await storage.reversePlatformRevenueForBooking(row.id, new Date(), 1);
    }
  }

  return {
    fullyRefunded,
    bookingIds: result.bookingRows.map((row) => row.id),
    newlyRefundedBookings: result.newlyRefundedBookings,
    bookingStatuses: result.bookingStatuses,
  };
}