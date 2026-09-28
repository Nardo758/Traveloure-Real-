/**
 * NO PAYMENT, NO EARNINGS — the ONE definition of "payment on record" (ledger
 * `2026-09-28-no-payment-no-earnings`). Pure: no db, no Stripe.
 *
 * A `service_bookings` row carries a payment on record when, and only when, the promotion that made
 * its payment real stamped `booking_details.paidCharge = { status, amount, at }` IN THE SAME
 * TRANSACTION as its atomic flip. The writers are exactly the paid transitions:
 *
 *   - `promoteOneBooking`      payment_pending → confirmed | deposit_paid  (checkout-claim.service.ts)
 *   - `promoteBalancePayment`  deposit_paid → confirmed, stamped `balance_paid`  (same file)
 *   - the transport hosted-session confirm  pending → confirmed  (stripe.service.ts)
 *
 * and the stamp is built by ONE server helper (`server/services/payment-on-record.ts`), guarded by
 * `server/__tests__/payment-on-record-writers.test.ts`. A status is not a payment: before this lane,
 * seven production rows sat in `pending`/`confirmed` with no PaymentIntent, and the completion mint
 * would have paid their seller. `hasPaymentOnRecord` is what every earning path, earnings display
 * and completion step reads, so there is one predicate, not two (§18 rule 1).
 *
 * NO BACKFILL (§13): production held zero paid bookings when this landed, so no existing row needs
 * the stamp. A legacy row is inert BY PREDICATE, not by mutation — its status is never rewritten.
 *
 * The key is server-authored (§19d): `shared/booking-details-admission.ts` strips it at every client
 * birth, so a body can never plant a payment on record.
 */

import { isEarningBooking } from "./booking-visibility";

export const PAID_CHARGE_KEY = "paidCharge" as const;

/** The paid transitions a stamp may name. `balance_paid` is the balance leg of a deposit booking. */
export const PAID_CHARGE_STATUSES = ["confirmed", "deposit_paid", "balance_paid"] as const;
export type PaidChargeStatus = (typeof PAID_CHARGE_STATUSES)[number];

/** The reason every refusal in this lane names, in logs and in API answers. */
export const NO_PAYMENT_ON_RECORD = "no_payment_on_record" as const;

export interface PaidCharge {
  status: PaidChargeStatus;
  /** Dollars the paid transition charged, or null when the row could not say (§13 — never 0). */
  amount: number | null;
  /** ISO instant of the paid transition. */
  at: string;
}

const STATUS_SET: ReadonlySet<string> = new Set<string>(PAID_CHARGE_STATUSES);

/** The stamp on a booking's details, or null when it has none. Never throws on a malformed row. */
export function paidChargeOf(bookingDetails: unknown): PaidCharge | null {
  if (!bookingDetails || typeof bookingDetails !== "object") return null;
  const raw = (bookingDetails as Record<string, unknown>)[PAID_CHARGE_KEY];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string" || !STATUS_SET.has(r.status)) return null;
  const amount = typeof r.amount === "number" && Number.isFinite(r.amount) ? r.amount : null;
  return { status: r.status as PaidChargeStatus, amount, at: typeof r.at === "string" ? r.at : "" };
}

export interface PaymentOnRecordRow {
  bookingDetails?: unknown;
  booking_details?: unknown;
  /**
   * This predicate's own answer, projected by the server onto an EARNER payload
   * (`sanitizeBookingForExpert`), whose `booking_details` is cut down to operational keys and so no
   * longer carries the stamp. It is the output of `hasPaymentOnRecord` on the raw row, never a
   * second rule.
   */
  paymentOnRecord?: boolean;
}

/**
 * THE predicate. True when the row carries a paid transition's stamp. Accepts the drizzle shape
 * (`bookingDetails`), a raw SQL row (`booking_details`) or an earner payload carrying the server's
 * projected answer (`paymentOnRecord`), so a reader never re-derives it.
 */
export function hasPaymentOnRecord(row: PaymentOnRecordRow | null | undefined): boolean {
  if (!row) return false;
  if (typeof row.paymentOnRecord === "boolean") return row.paymentOnRecord;
  const details = row.bookingDetails !== undefined ? row.bookingDetails : row.booking_details;
  return paidChargeOf(details) !== null;
}

/**
 * The earnings-display predicate: a row may be summed or shown as money only when its STATUS is an
 * earning one AND it carries a payment on record. The Money page, the earnings-by-source panel and
 * the expert payout breakdown all read this (§18 rule 1).
 */
export function isEarningBookingRow(
  row: (PaymentOnRecordRow & { status?: string | null }) | null | undefined,
): boolean {
  return !!row && isEarningBooking(row.status) && hasPaymentOnRecord(row);
}
