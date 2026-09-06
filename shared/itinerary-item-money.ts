/**
 * IS THIS ROW MONEY? — ONE ANSWER, READ BY THE DELETE RAIL AND BY THE SLIP'S OWN TOOLS.
 *
 * Ledger `2026-09-05-slip-own-your-plan`; CLAUDE.md Locked Decision 42 rows S2/D16, §15
 * ("a booked row is money") and §18 rule 1.
 *
 * The slip gives the OWNER a ✕ on their own plan rows. A ✕ on a row the traveler has already
 * bought would sever a `service_bookings` row from the only plan surface that can see it — the
 * same destruction `itineraryItemRebuildDeletable()` exists to refuse on the MACHINE side. So the
 * question "is this row money?" now has two askers (the render rule and the server's refusal), and
 * §18 rule 1 says two askers get ONE answer, not two predicates that agree today.
 *
 * It lives in `shared/` because the two askers are on opposite sides of the wire: the server holds
 * an `itinerary_items` ROW (`routingStatus` / `bookingId` columns) and the client holds the
 * plancard DTO's activity (`routingStatus`, and a `booking` object whose presence IS the booked
 * state). Both reduce to the same two facts, so both call this.
 *
 * A RENDER RULE IS NEVER WHAT KEEPS A WRITE OUT (§14 posture, restated by D16). The client's
 * hidden ✕ is a courtesy; the server's 409 is the guarantee. Do not let one stand in for the other.
 *
 * ── WHY THIS SET IS NARROWER THAN THE REBUILD SET, AND WHY THAT IS NOT DRIFT ──
 * `REBUILD_PROTECTED_STATUSES` (server/services/itinerary-rebuild-guard.ts) also spares
 * `ready_for_checkout`, because a MACHINE wipe — regenerate, snapshot re-apply — must not silently
 * empty a traveler's cart as a side effect of an operation they asked for something else. A person
 * pressing ✕ on one row of their own plan is the opposite act: deliberate, single, and about that
 * row. Taking a not-yet-charged row out of their own checkout queue is a thing a traveler is
 * allowed to do, and refusing it as "item_booked" would be a false statement about their plan
 * (§13). The relationship that MUST hold — and is asserted in the test suite — is one direction:
 * every status this module calls money-committed is also spared by the rebuild guard, so the two
 * rails can never end up with one deleting what the other protects.
 */

/**
 * Routing statuses that mean money has been committed to this row. `purchased` is the routing
 * machine's paid state; there is deliberately no second spelling of it here.
 */
export const ITEM_MONEY_COMMITTED_STATUSES = ["purchased"] as const;

/** The two facts either side reduces to. Both optional: an absent key and a null are the same. */
export interface ItineraryItemMoneyShape {
  /** `itinerary_items.routing_status`. Absent on a row that is not on the routing machine at all. */
  routingStatus?: string | null;
  /** `itinerary_items.booking_id` — or, client-side, the id of the DTO's `booking` object. */
  bookingId?: string | null;
}

/**
 * TRUE when this row carries a real commitment: a purchased routing status, OR a booking reference
 * of its own. The booking clause is belt-and-suspenders in exactly the way the rebuild guard's is
 * — a booked row whose routing status has drifted is still booked.
 */
export function itineraryItemIsMoneyCommitted(row: ItineraryItemMoneyShape | null | undefined): boolean {
  if (!row) return false;
  const status = row.routingStatus ?? null;
  if (status != null && (ITEM_MONEY_COMMITTED_STATUSES as readonly string[]).includes(status)) {
    return true;
  }
  return row.bookingId != null;
}

/**
 * TRUE for the PAID row the ratified `ItemRow` artboard draws with no tools at all. Narrower than
 * `itineraryItemIsMoneyCommitted`: a row that merely carries a booking keeps reorder and edit
 * ("a booked row keeps reorder and edit and loses remove" — callout 5), because moving or renaming
 * a booked line changes the plan's reading of it and destroys nothing.
 */
export function itineraryItemIsPaid(row: ItineraryItemMoneyShape | null | undefined): boolean {
  const status = row?.routingStatus ?? null;
  return status != null && (ITEM_MONEY_COMMITTED_STATUSES as readonly string[]).includes(status);
}

/**
 * The ONE refusal body `DELETE /api/trips/:tripId/itinerary-items/:itemId` answers for a booked
 * row, REGARDLESS OF ROLE (review R14) — the owner's slip, the expert's Workstation and any future
 * caller get the same sentence. Stated once so the client can recognise the code without matching
 * on prose.
 */
export const ITEM_BOOKED_DELETE_ERROR = {
  code: "item_booked",
  message:
    "This item is booked. Cancel the booking first — removing it here would leave the booking with no plan row.",
} as const;
