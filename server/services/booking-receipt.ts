/**
 * What a traveler was charged for one booking, read off the row the promotion stamped.
 * `total_amount` is the listing price. `paidCharge.amount` is the dollars Stripe took.
 * Absent when there is no paid stamp (§13 — never a guessed total).
 */
import { paidChargeOf } from "@shared/payment-on-record";
import { travelerFeeChargedOf } from "./refund-breakdown";

export interface BookingReceipt {
  amountCharged?: string;
  subtotal?: string;
  conciergeFee?: string;
  travelerFee?: string;
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function bookingReceiptFromRow(row: {
  totalAmount?: string | number | null;
  bookingDetails?: unknown;
}): BookingReceipt {
  const receipt: BookingReceipt = {};
  const paid = paidChargeOf(row.bookingDetails);
  if (paid && paid.amount != null && Number.isFinite(paid.amount)) {
    receipt.amountCharged = money(paid.amount);
  }
  if (row.totalAmount != null && row.totalAmount !== "") {
    const sub = typeof row.totalAmount === "number" ? row.totalAmount : parseFloat(String(row.totalAmount));
    if (Number.isFinite(sub)) receipt.subtotal = money(sub);
  }
  const details =
    row.bookingDetails && typeof row.bookingDetails === "object"
      ? (row.bookingDetails as Record<string, unknown>)
      : null;
  const charge = details?.travelerCharge;
  const concierge =
    charge && typeof charge === "object" ? (charge as Record<string, unknown>).conciergeFee : null;
  if (concierge != null && concierge !== "") {
    const n = parseFloat(String(concierge));
    if (Number.isFinite(n) && n > 0) receipt.conciergeFee = money(n);
  }
  const fee = travelerFeeChargedOf(row.bookingDetails);
  if (fee > 0) receipt.travelerFee = money(fee);
  return receipt;
}
