/**
 * THE ITEM BOOKING STATE — what a plan item's row may say about its booking (R145, ledger
 * `2026-09-27-refunded-item-status`; decision-maker ruled Sep 27, 2026).
 *
 * The server (`linkedBookingFields`, server/services/trip-plan.service.ts) is the ONE place a linked
 * `service_bookings` row is split into `booking` (live — the booked state) or `endedBooking`
 * (CLOSED: `cancelled` / `refunded`, the shared `CLOSED_BOOKING_STATUSES`). This module is the ONE
 * client reading of that split (§18 rule 1), so the slip row, the PlanCard badge, the routing counts
 * and the comparison board's anchors cannot disagree about whether a row is booked.
 *
 * WHY IT EXISTS. A refund reverts the item `purchased → in_planning` but keeps
 * `itinerary_items.booking_id` as history, and a non-refundable cancel closes the booking without
 * touching the item at all (it stays `purchased`). Both rows used to read "Booked". §13: a closed
 * booking is said out loud — "Refunded" / "Cancelled" — never hidden and never called booked.
 *
 * NOTHING HERE WRITES, CHARGES OR AUTHORIZES. It reads three DTO fields and returns a word.
 */

export type EndedBookingState = "refunded" | "cancelled";

export interface ItemBookingLike {
  booking?: unknown;
  endedBooking?: { status?: string | null } | null;
  routingStatus?: string | null;
}

/**
 * Is this row booked? A live booking says yes. An ENDED booking says no — even when the item's
 * routing status still reads `purchased` (the non-refundable cancel leaves it there). With neither,
 * the legacy explicit `purchased` routing status still counts, exactly as before this module.
 */
export function isBookedActivity(a: ItemBookingLike): boolean {
  if (a.booking) return true;
  if (a.endedBooking) return false;
  return a.routingStatus === "purchased";
}

/**
 * The ended booking this row should DISCLOSE, or null. Only while the item has not moved on: once the
 * traveler re-routes a refunded item (to an expert, or to checkout again) the new routing state is the
 * true answer and wins. An unknown closed status is read as `cancelled`, the weaker claim (§13 — never
 * "refunded" without the server saying so).
 */
export function endedBookingState(a: ItemBookingLike): EndedBookingState | null {
  if (a.booking || !a.endedBooking) return null;
  const rs = a.routingStatus ?? null;
  if (rs === "with_expert" || rs === "ready_for_checkout") return null;
  return a.endedBooking.status === "refunded" ? "refunded" : "cancelled";
}

/** The word a surface prints for an ended booking. Written HERE and nowhere else. */
export const ENDED_BOOKING_LABELS: Record<EndedBookingState, string> = {
  refunded: "Refunded",
  cancelled: "Cancelled",
};
