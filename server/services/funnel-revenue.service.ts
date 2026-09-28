/**
 * T6 `revenue` FUNNEL EVENTS ARE WRITTEN AT THE PAID TRANSITION, NEVER AT A REQUEST (R174, ledger
 * `2026-09-27-funnel-revenue-on-paid`).
 *
 * The one revenue emitter used to fire when an expert booking REQUEST was created — status
 * `pending`, nothing charged — so the funnel counted money nobody had paid. It is deleted. Revenue
 * is now recorded by the ONE promotion that makes a payment real, inside the same transaction as
 * its atomic flip, so the event exists exactly once per paid transition and never for an unpaid row:
 *
 *   - `promoteOneBooking`  payment_pending → confirmed     amount = `bookingChargeShare` (the drift
 *                                                            job's own per-booking share, §18 rule 1)
 *   - `promoteOneBooking`  payment_pending → deposit_paid  amount = `deposit_amount` (what the
 *                                                            deposit PaymentIntent charged)
 *   - `promoteBalancePayment` deposit_paid → confirmed     amount = `balance_amount`
 *
 * Each row carries `paidStatus` naming which of the three it was, so a deposit booking's revenue is
 * its deposit plus its balance and never double-counted, and migration 326's void flag can never
 * touch it. Amounts are SERVER-DERIVED from the row the flip returned (§14) and stored in DOLLARS as
 * the historical rows were. A value that does not parse is OMITTED, never 0 (§13).
 *
 * THE INSERT RUNS IN A SAVEPOINT AND NEVER THROWS (§15b): analytics may not roll back the payment
 * that authorizes it. A failed insert is logged and the promotion commits without its event.
 *
 * THE EVENT DERIVES FROM THE PAYMENT STAMP, NEVER THE REVERSE (ledger
 * `2026-09-28-no-payment-no-earnings`). The same flip first stamps `booking_details.paidCharge`
 * (`server/services/payment-on-record.ts`, NOT savepointed — a paid row without its stamp would read
 * as unpaid to every earning path); the event's `paidStatus` and `amount` are read off that stamp.
 * `paidRevenueAmount` computes the amount the STAMP records.
 */
import { sql } from "drizzle-orm";
import { funnelEvents } from "../../shared/schema";
import { bookingChargeShare } from "./booking-charge-share";
import { logger } from "../infrastructure/logger";
import type { PaidCharge } from "@shared/payment-on-record";

export type PaidRevenueStatus = "confirmed" | "deposit_paid" | "balance_paid";

export interface PaidTransitionRow {
  id: string;
  travelerId: string | null;
  tripId: string | null;
  totalAmount: string | number | null;
  platformFee: string | number | null;
  depositAmount: string | number | null;
  balanceAmount: string | number | null;
  bookingDetails: Record<string, any> | null;
}

function money(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** The amount ONE paid transition charged, in dollars — or null when the row cannot say (§13). Pure. */
export function paidRevenueAmount(status: PaidRevenueStatus, row: PaidTransitionRow): number | null {
  if (status === "deposit_paid") return money(row.depositAmount);
  if (status === "balance_paid") return money(row.balanceAmount);
  if (money(row.totalAmount) === null) return null;
  const details = row.bookingDetails ?? {};
  return money(
    bookingChargeShare({
      totalAmount: row.totalAmount,
      platformFee: row.platformFee,
      conciergeFeeSnapshot: details?.travelerCharge?.conciergeFee ?? null,
      travelerFeeCharged: details?.travelerServiceFee?.charged ?? null,
    }),
  );
}

/**
 * The funnel_events row a paid transition writes, DERIVED FROM ITS PAYMENT STAMP. Pure; exported for
 * tests. Ids and enums only; the row supplies identity (traveler, trip, booking), never the amount.
 */
export function paidRevenueEventValues(stamp: PaidCharge, row: PaidTransitionRow) {
  const properties: Record<string, unknown> = { bookingId: String(row.id), paidStatus: stamp.status };
  if (stamp.amount !== null) properties.amount = stamp.amount;
  return {
    userId: row.travelerId ?? undefined,
    tripId: row.tripId ?? undefined,
    eventType: "revenue",
    stage: "T6",
    properties,
  };
}

/** Maps a `RETURNING` row (snake_case) into the pure input. */
export function paidTransitionRowFromSql(r: any): PaidTransitionRow {
  return {
    id: String(r.id),
    travelerId: r.traveler_id ?? null,
    tripId: r.trip_id ?? null,
    totalAmount: r.total_amount ?? null,
    platformFee: r.platform_fee ?? null,
    depositAmount: r.deposit_amount ?? null,
    balanceAmount: r.balance_amount ?? null,
    bookingDetails: (r.booking_details ?? null) as Record<string, any> | null,
  };
}

/**
 * Writes the event inside the caller's transaction, under a SAVEPOINT. Never throws: a failed insert
 * rolls back to the savepoint only, and the payment flip around it still commits (§15b).
 */
export async function recordPaidRevenueEvent(
  tx: any,
  stamp: PaidCharge,
  row: PaidTransitionRow,
): Promise<boolean> {
  const status = stamp.status;
  try {
    await tx.execute(sql`SAVEPOINT funnel_revenue_event`);
    try {
      await tx.insert(funnelEvents).values(paidRevenueEventValues(stamp, row));
      await tx.execute(sql`RELEASE SAVEPOINT funnel_revenue_event`);
      return true;
    } catch (err) {
      await tx.execute(sql`ROLLBACK TO SAVEPOINT funnel_revenue_event`);
      logger.warn({ err, bookingId: row.id, status }, "[funnel-revenue] revenue event not recorded (payment unaffected)");
      return false;
    }
  } catch (err) {
    logger.warn({ err, bookingId: row.id, status }, "[funnel-revenue] savepoint failed (payment unaffected)");
    return false;
  }
}
