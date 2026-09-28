/**
 * ONE BOOKING'S SHARE OF A PAYMENTINTENT, AND WHEN A REFUND WE DID NOT ISSUE HAS COVERED IT
 * (R163, ledger `2026-09-27-dashboard-refund-reads-refunded`). Pure: no db, no Stripe.
 *
 * TWO HALVES, ONE RULE (§18 rule 1):
 *
 *   `bookingChargeShare` / `chargeShareTolerance` are the drift job's own derivations, MOVED here
 *   unchanged from `server/jobs/stripeReconciliation.ts` (`expectedChargeForRow` / `amountTolerance`,
 *   kind A4). The job still sums them per PaymentIntent to judge `amount_mismatch`; this file is
 *   now the one place "what did this row cost the traveler" and "how much rounding is honest" are
 *   written.
 *
 *   `outOfBandRefundCoversShare` is the refund reconciliation rule the status LABEL reads: the
 *   cumulative refunds our code did not issue (Stripe's own cents, off the #1288 stamp
 *   `booking_details.outOfBandRefund.amountCents`) against the shares of the bookings that
 *   PaymentIntent paid which our own rails have NOT already refunded. A booking reads "Refunded"
 *   exactly when those refunds reach the whole of that still-live remainder — then every live
 *   booking on the payment, this one included, is provably refunded in full.
 *
 * WHAT IT WILL NOT CLAIM (§13): when one PaymentIntent paid several still-live bookings and the
 * dashboard refund is smaller than all of them, Stripe does not say which booking it was for, so
 * NONE is called refunded — a partial dashboard refund never makes a booking read "Refunded". The
 * rule errs toward "not refunded": a share our rails already refunded IN PART without moving the
 * row to `refunded` (a bundle partial settlement) is still counted whole, which can only make the
 * threshold harder to reach, never easier.
 *
 * READ-SIDE ONLY. Nothing here writes a status, moves money or decides a payout. The #1288 mint
 * refusal and the earnings hold are unchanged and keep answering on the stamp itself.
 */
import { travelerChargeForRow } from "./traveler-charge";

export interface BookingChargeShareFacts {
  /** `service_bookings.total_amount`. */
  totalAmount: string | number | null;
  /** `service_bookings.platform_fee`. */
  platformFee: string | number | null;
  /** `booking_details.travelerCharge.conciergeFee` — null ⇒ a pre-A3 row. */
  conciergeFeeSnapshot: string | number | null;
  /** `booking_details.travelerServiceFee.charged` — the traveler service fee that rode the charge. */
  travelerFeeCharged: string | number | null;
}

/**
 * The Stripe amount ONE booking row accounts for, in DOLLARS: the traveler's charge (the ONE
 * `travelerChargeForRow`) plus the traveler service fee, which is held in booking_details rather
 * than a column. Moved verbatim from the drift job's `expectedChargeForRow`.
 */
export function bookingChargeShare(facts: BookingChargeShareFacts): number {
  const fee = parseFloat(String(facts.travelerFeeCharged ?? "0"));
  return (
    travelerChargeForRow({
      totalAmount: facts.totalAmount,
      platformFee: facts.platformFee,
      conciergeFeeSnapshot: facts.conciergeFeeSnapshot,
    }).amount + (Number.isFinite(fee) ? fee : 0)
  );
}

/**
 * Money comparison tolerance, in DOLLARS. NOT a fee, a rate or a margin (§8) — it is the exact
 * accumulated rounding error of the checkout arithmetic. Each booking row persists two
 * `.toFixed(2)` values (`total_amount`, `platform_fee`), each ≤ half a cent from the unrounded
 * float the Stripe total was composed from, and Stripe's own `Math.round` to cents adds one more.
 * So the honest bound is one cent per row plus one. Moved verbatim from the drift job.
 */
export function chargeShareTolerance(rowCount: number): number {
  return 0.01 * rowCount + 0.01;
}

export interface PaymentIntentShareRow {
  id: string;
  status: string | null;
  /** `bookingChargeShare` of the row, in dollars. */
  share: number;
}

/**
 * Has the refund we did not issue covered this booking's WHOLE share? True only when the
 * cumulative out-of-band refunds reach every still-live share on the PaymentIntent (live = not
 * already `refunded` through our own rails, whose refunds carry our `metadata.source` and are
 * therefore not in `foreignRefundedCents`). A booking our rails already refunded is answered by
 * its own status, not by this rule.
 */
export function outOfBandRefundCoversShare(input: {
  bookingId: string;
  /** The booking's own stamp: `booking_details.outOfBandRefund.amountCents` (null ⇒ no stamp). */
  foreignRefundedCents: number | null | undefined;
  /** EVERY service booking the same PaymentIntent paid, this one included. */
  rowsOnPaymentIntent: readonly PaymentIntentShareRow[];
}): boolean {
  const refunded = Number(input.foreignRefundedCents);
  if (!Number.isFinite(refunded) || refunded <= 0) return false;
  const self = input.rowsOnPaymentIntent.find((r) => r.id === input.bookingId);
  if (!self || self.status === "refunded") return false;
  const live = input.rowsOnPaymentIntent.filter((r) => r.status !== "refunded");
  const liveTotal = live.reduce((sum, r) => sum + (Number.isFinite(r.share) ? r.share : 0), 0);
  if (!(liveTotal > 0)) return false;
  return refunded / 100 >= liveTotal - chargeShareTolerance(live.length);
}
