/**
 * purchase-status — how a `service_bookings.status` reads on a traveler surface, stated ONCE.
 *
 * Ledger `2026-09-07-trip-card-one-page` (Console & AI Concierge brief lane L9); CLAUDE.md
 * Locked Decision 42 D9, Locked Decision 44 (e), §15b, §13.
 *
 * The Trip Card's Purchases drawer reads the SAME `service_bookings` rows the slip's bookings
 * section reads (the plancard payload's `bookings`), and must render "prepared, awaiting
 * purchase" DISTINCTLY from "booked" — the §15b claim machine's own vocabulary made legible:
 *   `payment_pending`  a CLAIM, not yet authorized (no PaymentIntent, or one still in flight).
 *                      It is not booked and it may be voided by the TTL sweep; say so.
 *   `deposit_paid`     authorized and paid in part — booked, with a balance still due (§15d).
 *   `confirmed`        authorized and paid — booked.
 *   `completed`        booked and fulfilled.
 *   anything else      shown VERBATIM (refunded, cancelled, disputed…) — never folded into
 *                      "booked", never into "prepared".
 *   NULL / empty       no label at all: a row that recorded no status makes no claim (§13).
 */

export type PurchaseKind = "prepared" | "booked" | "other";

export interface PurchaseStatusReading {
  kind: PurchaseKind;
  label: string;
}

export function readPurchaseStatus(status: string | null | undefined): PurchaseStatusReading | null {
  const raw = typeof status === "string" ? status.trim() : "";
  if (raw.length === 0) return null;
  switch (raw) {
    case "payment_pending":
      return { kind: "prepared", label: "Prepared · awaiting purchase" };
    case "deposit_paid":
      return { kind: "booked", label: "Booked · balance due" };
    case "confirmed":
      return { kind: "booked", label: "Booked" };
    case "completed":
      return { kind: "booked", label: "Booked · completed" };
    default:
      return { kind: "other", label: raw.replace(/_/g, " ") };
  }
}
