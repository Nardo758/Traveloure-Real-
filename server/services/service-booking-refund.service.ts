/**
 * THE APP REFUND WITH ITS LEDGER — one implementation, two callers (§18 rule 1; ledger
 * `2026-09-27-admin-exception-refund`, lane 4 of the R154 status trace).
 *
 * Extracted verbatim from `POST /api/bookings/refund` so the admin exception refund
 * (`POST /api/admin/bookings/:bookingId/exception-refund`) runs the SAME path a traveler's refund
 * does, in the same order:
 *   1. the lost-chargeback preflight (PR #1066) — refuse BEFORE the ledger moves when this refund
 *      would reach into money a lost dispute already returned;
 *   2. the ledger, FIRST (§18 Phase 4): a full refund reverses the in-escrow earnings, and platform
 *      revenue is reversed by the refunded fraction (a partial refund keeps the retained share);
 *   3. `refundServiceBooking` — the non-final claim, the Stripe call under its deterministic key,
 *      the audit row in `refunds`, then `status='refunded'` (§15/§15b);
 *   4. the plan item back from `purchased` (the routing reversal's sole writer).
 * A status the refund refuses is refused before step 2 (it used to be refused only at step 3, after
 * the ledger had moved). Amounts are the caller's server-derived options (§14). Errors propagate unchanged
 * (`LostChargebackRefundBlockedError` is thrown as a `LostChargebackPreflightRefusal` result
 * instead, so the caller can answer 409 with the same body it always has).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { stripePaymentService, ServiceBookingRefundRefusedError } from "./stripe-payment.service";
import { APP_REFUND_REFUSED_FROM_STATUSES } from "../utils/booking-from-states";
import { revertPurchasedItemsForBooking } from "./item-routing.service";

export interface RefundWithLedgerOptions {
  reason?: string;
  amountOverride?: number;
  feeRefundPercent?: number;
  /** The share of the whole charge being refunded (1 = full). Drives the ledger reversal only. */
  refundFraction: number;
}

export type RefundWithLedgerResult =
  | { ok: false; lostChargeback: unknown }
  | {
      ok: true;
      refund: Awaited<ReturnType<typeof stripePaymentService.refundServiceBooking>>;
      revertedPlanItems: number;
      reversedEarnings: number;
      skippedPaidOut: number;
      reversedRevenueRows: unknown;
    };

export async function refundServiceBookingWithLedger(
  bookingId: string,
  opts: RefundWithLedgerOptions,
): Promise<RefundWithLedgerResult> {
  const refundOpts: { amountOverride?: number; feeRefundPercent?: number } = {};
  if (opts.amountOverride !== undefined) refundOpts.amountOverride = opts.amountOverride;
  if (opts.feeRefundPercent !== undefined) refundOpts.feeRefundPercent = opts.feeRefundPercent;

  // A status the refund will refuse (payment_pending, failed, disputed) is refused HERE, before the
  // ledger moves — `refundServiceBooking` refuses the same list inside its claim, but by then the
  // earnings and revenue reversals below had already run, leaving a reversed ledger beside an
  // unrefunded booking. `refunded` passes through: the refund answers `alreadyRefunded` and the
  // reversals are idempotent no-ops.
  const current = (await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${bookingId} LIMIT 1`)).rows?.[0] as
    | { status: string }
    | undefined;
  if (current && current.status !== "refunded" && APP_REFUND_REFUSED_FROM_STATUSES.includes(current.status)) {
    throw new ServiceBookingRefundRefusedError(current.status);
  }

  const { checkServiceBookingRefundPreflight, lostChargebackRefusalBody } = await import(
    "./lost-chargeback-guard.service"
  );
  const guard = await checkServiceBookingRefundPreflight(bookingId, refundOpts);
  if (!guard.allowed) return { ok: false, lostChargeback: lostChargebackRefusalBody(guard) };

  const reversal =
    opts.refundFraction >= 1
      ? await storage.reverseEarningsForBooking(bookingId)
      : { reversed: 0, skippedPaidOut: 0 };
  const reversedRevenueRows = await storage.reversePlatformRevenueForBooking(bookingId, new Date(), opts.refundFraction);

  const refund = await stripePaymentService.refundServiceBooking(
    bookingId,
    opts.reason,
    Object.keys(refundOpts).length ? refundOpts : undefined,
  );

  const routingReversal = await revertPurchasedItemsForBooking(bookingId);
  return {
    ok: true,
    refund,
    revertedPlanItems: routingReversal.reverted,
    reversedEarnings: reversal.reversed,
    skippedPaidOut: reversal.skippedPaidOut,
    reversedRevenueRows,
  };
}
