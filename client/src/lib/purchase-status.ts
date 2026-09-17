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
    // LD 46 (ledger `2026-09-15-d24-d26-acceptance-columns`, surfaces lane
    // `2026-09-17-surfaces-acceptance-completion`). Both words are CLAIMS ABOUT WHOSE TURN IT IS,
    // not about completion: nothing has minted in either, and neither may read as "completed".
    //   `awaiting_acceptance`  the artifact was delivered and the traveler has not answered — the
    //                          ball is with the BUYER. (D-27's timer ASKs by moving a row here; it
    //                          may never complete one in the seller's favour.)
    //   `revision_requested`   the traveler asked for a change and the ball is with the SELLER.
    // The DATE either state is measured from, and the window it closes on, are NOT here: they are
    // the server's own `acceptance` read-out, because a window length restated on a client is a
    // second authority the day `acceptanceWindowDays()` moves (§18 rule 1).
    case "awaiting_acceptance":
      return { kind: "booked", label: "Booked · waiting for your acceptance" };
    case "revision_requested":
      return { kind: "booked", label: "Booked · revision requested" };
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
