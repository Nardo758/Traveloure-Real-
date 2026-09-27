/**
 * THE ITEM BOOKING STATE — what a plan item's row may say about its linked booking (R145, ledger
 * `2026-09-27-refunded-item-status`; R154, ledger `2026-09-27-booking-status-vocabulary`; both ruled
 * by the decision-maker Sep 27, 2026; CLAUDE.md LD 44 (e) — "booked" only with a confirmation in hand).
 *
 * The server (`linkedBookingFields`, server/services/trip-plan.service.ts) is the ONE place a linked
 * `service_bookings` row is split into `booking` (it COUNTS AS BOOKED) or `endedBooking` (it does not:
 * `payment_pending`, `failed`, `expired`, `cancelled`, `refunded`). Both halves of that split and every
 * word a row prints come from ONE shared table, `ITEM_BOOKING_STATUS_VOCABULARY`
 * (shared/booking-visibility.ts). This module is the ONE client reading of it (§18 rule 1), so the slip
 * row, the PlanCard badge, My Plans' routing counts and the comparison board's anchors cannot disagree.
 *
 * THE ONE PLACE LABEL AND ACCOUNTING DIFFER — `disputed`. It rides `booking` (a real, paid booking:
 * funds held, the row exists), so it is booked for counts and the item-kind rule; but its state here is
 * `under_review`, it reads "Under review" and NEVER "Booked", and it offers a link to the booking —
 * "Booked" tells a traveler they need not act, and a dispute means they may not have what they paid for.
 *
 * NOTHING HERE WRITES, CHARGES OR AUTHORIZES. It reads three DTO fields and returns a word.
 */
import {
  ITEM_BOOKING_LABELS,
  itemBookingLabelStatus,
  itemBookingStatusEntry,
  type ItemBookingAction,
  type ItemBookingLabelKey,
} from "@shared/booking-visibility";

export type ItemBookingState = ItemBookingLabelKey;
export type { ItemBookingAction };

export interface ItemBookingLike {
  booking?: { status?: string | null } | null | unknown;
  endedBooking?: { status?: string | null; refundedOutOfBand?: boolean | null } | null;
  routingStatus?: string | null;
  /** R157: server-derived — can a failed payment's "Try again" open a checkout that holds this item? */
  retryOpensCheckout?: boolean;
}

/**
 * The status a row's LABEL reads. R163 (ledger `2026-09-27-dashboard-refund-reads-refunded`): the
 * server's `refundedOutOfBand` answer — a dashboard refund that covered the booking's whole share —
 * reads as `refunded` through the ONE shared reading `itemBookingLabelStatus`; nothing money-shaped
 * is derived here.
 */
function statusOf(b: unknown): string | null {
  if (b && typeof b === "object") {
    const o = b as { status?: unknown; refundedOutOfBand?: unknown };
    return itemBookingLabelStatus({
      status: typeof o.status === "string" ? o.status : null,
      refundedOutOfBand: o.refundedOutOfBand === true,
    });
  }
  return null;
}

/**
 * Is this row booked — for MONEY and COUNTS? A `booking` whose status counts as booked says yes
 * (`disputed` included — it is a real booking). An `endedBooking` says no, even when the item's routing
 * status still reads `purchased` (a non-refundable cancel, or a failed payment, leaves it there). With
 * neither, the legacy explicit `purchased` routing status still counts, exactly as before R145.
 */
export function isBookedActivity(a: ItemBookingLike): boolean {
  if (a.booking) return itemBookingStatusEntry(statusOf(a.booking)).countsAsBooked;
  if (a.endedBooking) return false;
  return a.routingStatus === "purchased";
}

/**
 * The state this row's booking line shows, or null for NO booking line.
 *   booked / under_review — a `booking` that counts as booked (the word depends on its status).
 *   payment_processing / payment_failed / cancelled / refunded — a linked booking that is not booked.
 *   null — no linked booking; `expired` (the ruling draws no line for it); or an ended booking the item
 *          has MOVED ON from (re-routed to an expert, or back to checkout), where the new routing state is
 *          the true answer. A failed payment keeps its note on a `ready_for_checkout` row — "Ready to book"
 *          is exactly where the ruling puts it.
 * An ended booking whose status the vocabulary does not list is read as `cancelled`, the weaker claim
 * (§13 — never "refunded" without the server saying so).
 */
export function itemBookingState(a: ItemBookingLike): ItemBookingState | null {
  if (a.booking) {
    const entry = itemBookingStatusEntry(statusOf(a.booking));
    if (entry.countsAsBooked) return entry.labelKey ?? "booked";
  }
  const ended = a.booking ?? a.endedBooking;
  if (!ended) return null;
  const entry = itemBookingStatusEntry(statusOf(ended));
  const state: ItemBookingState | null = entry.countsAsBooked ? "cancelled" : entry.labelKey;
  if (state == null) return null;
  const rs = a.routingStatus ?? null;
  if (rs === "with_expert") return null;
  if (rs === "ready_for_checkout" && state !== "payment_failed") return null;
  return state;
}

/** The one action a row's booking line offers (`open_booking` for a dispute, `retry_checkout` for a failure). */
export function itemBookingAction(a: ItemBookingLike): ItemBookingAction | null {
  const state = itemBookingState(a);
  if (state === "under_review") return "open_booking";
  if (state === "payment_failed") return "retry_checkout";
  return null;
}

/**
 * The routing bucket this row COUNTS and PILLS as. A booked row (disputed included) is `purchased`; a
 * failed payment is back to `ready_for_checkout` ("Ready to book"); a not-booked linked booking whose
 * item still says `purchased` is in NO bucket (§13 — neither bought nor anything else); otherwise the
 * item's own routing status.
 */
export function effectiveRoutingStatus(a: ItemBookingLike): string | null {
  if (isBookedActivity(a)) return "purchased";
  const rs = a.routingStatus ?? null;
  if (itemBookingState(a) === "payment_failed" && rs !== "with_expert") return "ready_for_checkout";
  if ((a.booking || a.endedBooking) && rs === "purchased") return null;
  return rs;
}

/** The word a surface prints for a booking state. Written in shared/booking-visibility.ts and nowhere else. */
export function itemBookingLabel(state: ItemBookingState): string {
  return ITEM_BOOKING_LABELS[state];
}

/**
 * Where "Under review" links: the traveler's bookings ledger (My Bookings), where the dispute lives.
 * There is no per-booking detail route, and the ledger reads no booking query parameter, so none is
 * appended — a link that pretends to anchor would be a claim the page does not keep (§13).
 */
export const BOOKING_DETAIL_PATH = "/my-bookings";

/** The pill a failed payment wears: the ruling puts the item "back to Ready to book". */
export const PAYMENT_FAILED_PILL_LABEL = "Ready to book";

/**
 * The sentence under a row whose booking is not simply booked. `booked` carries none here (the slip
 * writes its own "booked · #ref" line). NEVER the word "Booked" for anything but `booked` — pinned.
 */
export const ITEM_BOOKING_NOTES: Readonly<Record<ItemBookingState, string | null>> = {
  booked: null,
  under_review: "Under review — this booking has an open dispute",
  payment_processing: "Payment processing — nothing to do yet",
  payment_failed: "Payment didn't go through",
  refunded: "Refunded — the booking was refunded",
  cancelled: "Cancelled — the booking was cancelled",
};

/** The copy a failed row's action and a disputed row's link carry. Written once. */
export const ITEM_BOOKING_ACTION_LABELS: Readonly<Record<ItemBookingAction, string>> = {
  open_booking: "View booking",
  retry_checkout: "Try again",
};

/**
 * R157 (ledger `2026-09-27-retry-failed-payment`): where a failed payment's retry lands. The server
 * says `retryOpensCheckout: false` when the listing publishes no price or the seller must accept first
 * — the cart can hold no line for it, so the action reads "Back to plan" and opens the slip instead of
 * an empty checkout. Absent (an older payload) keeps "Try again" → checkout, today's behaviour.
 */
export const ITEM_BOOKING_RETRY_TO_PLAN_LABEL = "Back to plan";
export function retryGoesToPlan(a: ItemBookingLike): boolean {
  return a.retryOpensCheckout === false;
}
