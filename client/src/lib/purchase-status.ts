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
 *   `completion_declared`  the seller says it is done and the traveler's dispute window is OPEN
 *                      (D-7, ledger `2026-09-15-d36-d39-completion-declared`). Booked — and NOT
 *                      completed: brief Part II §14, "completed is never said before the window
 *                      closes". The word here is the seller's claim, named as a claim.
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
    case "completion_declared":
      return { kind: "booked", label: "Booked · your expert says this is done" };
    case "completed":
      return { kind: "booked", label: "Booked · completed" };
    // D-34 (ledger `2026-09-16-d32-d35-bundle-components`): a bundle with at least one component
    // delivered and at least one NOT. Never folded into "completed" (that word still means EVERY
    // component) and never into "refunded" (a lie about the delivered ones). WHICH component failed
    // is on the row (`bookingDetails.completion.failedComponentIds`), not in this label — the label
    // is one spelling for one state.
    case "partially_completed":
      return { kind: "booked", label: "Booked · partially completed" };
    default:
      return { kind: "other", label: raw.replace(/_/g, " ") };
  }
}
