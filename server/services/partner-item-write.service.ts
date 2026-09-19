/**
 * PARTNER-ITEM WRITE — Lane P (design doc §5 S5/S6; ledger `2026-09-19-linked-item-purchase-write`).
 *
 * THE DEFECT THIS CLOSES. `PATCH /api/affiliate-booking-requests/:id` (`content.routes.ts`)
 * UNCONDITIONALLY created a brand-new `itinerary_items` row on every human purchase press that
 * carried a `tripId` — even for a Booking Concierge hand-off request, which already NAMES the plan
 * item it is booking via `affiliate_booking_requests.itinerary_item_id` (migration 312, ledger
 * `2026-09-18-concierge-handoff`). The route's own comment said no link column existed; it was
 * stale the moment migration 312 landed. Every concierge-hand-off purchase therefore left the
 * traveler with TWO items for the same thing — the one they planned, and a duplicate the purchase
 * press minted beside it.
 *
 * THE FIX. When a request carries a link, a purchase or a partner confirmation updates THAT item
 * IN PLACE and creates nothing. When it does not (a traveler-initiated request with no plan item
 * to point at — LD 44's open question, not decided here), the caller's existing behaviour is
 * untouched — see the annotated create site in `content.routes.ts`.
 *
 * §14 — THE PAIRING IS SERVER-VERIFIED, NEVER CLIENT-TRUSTED. Each UPDATE below carries
 * `AND trip_id = <the request's own trip_id>` in its WHERE clause, read off the REQUEST row, never
 * off a client-supplied trip id. A linked item that has drifted onto a different trip (moved,
 * deleted and recreated, or any other disagreement between the two rows) updates 0 rows rather
 * than silently writing across a trip boundary.
 *
 * §15 — THE STATEMENT IS THE GUARD. Each function is ONE atomic conditional `UPDATE …
 * WHERE id = ? AND trip_id = ?` (or, for the confirm edge, `WHERE id = ? AND status = 'booked'`).
 * 0 rows matched is a normal, logged, non-throwing outcome — never a fallback create, never an
 * error surfaced to the caller's money/status flow (mirrors `markItemPurchased`'s shape,
 * `item-routing.service.ts`).
 *
 * LD 44 — THIS MODULE NEVER WRITES `routing_status`, `booking_id` OR `origin`. Those three
 * describe facts this rail does not own: `routing_status`/`booking_id` are the CART rail's own
 * projection (ruling 39 — `stripItineraryItemRoutingFields` keeps every partner-rail write clear
 * of them), and `origin` is a provenance question Locked Decision 44 leaves explicitly OPEN for a
 * partner-purchased item — recorded here as still open, not decided by this lane. The two `set()`
 * calls below name only the columns this rail is ruled to own: `status`, `bookingStatus`,
 * `bookingReference`, `confirmationNumber`.
 *
 * §13 — THE LINKED CASE CREATES NOTHING. There is no fallback item for a request whose link has
 * gone stale. A missing link, or a link that no longer resolves onto the request's own trip, is
 * reported and logged — never silently swallowed, never silently repaired by minting a new row.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems } from "@shared/schema";
import { logger } from "../infrastructure/logger";
import { storage } from "../storage";

/** The executor shape both `db` and a drizzle `tx` satisfy. */
type Executor = Pick<typeof db, "update">;

export type PartnerItemWriteOutcome =
  | { updated: true }
  | { updated: false; reason: "no_linked_item" | "item_not_found_or_trip_mismatch" };

/**
 * S5 — the human purchase press. Flips the LINKED item to `status: "booked"` /
 * `bookingStatus: "pending"` in place; never a second item.
 *
 * `confirmationRef` is COALESCEd onto `bookingReference`/`confirmationNumber` — a later call with
 * no ref (or the same ref) never blanks a reference an earlier call already recorded, and a call
 * that does carry one always wins (the traveler's or agent's freshest word on the reference).
 *
 * Returns `{updated:false, reason:"no_linked_item"}` with NO read of `itinerary_items` at all when
 * the request carries no link — the common, expected case for every request this lane does not
 * touch (§13: absence is not an error).
 */
export async function markLinkedItemBooked(
  requestId: string,
  opts: { confirmationRef?: string | null },
  tx: Executor = db,
): Promise<PartnerItemWriteOutcome> {
  const request = await storage.getAffiliateBookingRequestById(requestId);
  if (!request?.itineraryItemId) {
    return { updated: false, reason: "no_linked_item" };
  }

  const ref = opts.confirmationRef ?? null;
  const rows = await tx
    .update(itineraryItems)
    .set({
      status: "booked",
      bookingStatus: "pending",
      bookingReference: sql`COALESCE(${ref}::varchar, ${itineraryItems.bookingReference})`,
      confirmationNumber: sql`COALESCE(${ref}::varchar, ${itineraryItems.confirmationNumber})`,
      updatedAt: new Date(),
    })
    .where(and(eq(itineraryItems.id, request.itineraryItemId), eq(itineraryItems.tripId, request.tripId ?? "")))
    .returning({ id: itineraryItems.id });

  if (rows.length === 0) {
    // 0 rows: the item is gone, or it no longer belongs to this request's own trip (§14 pairing
    // check failed). Logged, never thrown — the purchase itself already stands; see the caller.
    logger.warn(
      { requestId, itemId: request.itineraryItemId, tripId: request.tripId },
      "partner-item-write: markLinkedItemBooked matched 0 rows (item missing or trip mismatch) — no second item created",
    );
    return { updated: false, reason: "item_not_found_or_trip_mismatch" };
  }
  return { updated: true };
}

/**
 * S6 — the partner's own confirmation report. Upgrades the linked item's `bookingStatus` to
 * `"confirmed"` once it has actually been booked (`status = 'booked'`, the state `markLinkedItemBooked`
 * left it in). Called from `confirmFromPartnerReport`, the ONE `confirmed` writer for the request
 * row — this is that same writer's plan-side echo, and it creates no item either.
 */
export async function markLinkedItemConfirmed(
  requestId: string,
  tx: Executor = db,
): Promise<PartnerItemWriteOutcome> {
  const request = await storage.getAffiliateBookingRequestById(requestId);
  if (!request?.itineraryItemId) {
    return { updated: false, reason: "no_linked_item" };
  }

  const rows = await tx
    .update(itineraryItems)
    .set({ bookingStatus: "confirmed", updatedAt: new Date() })
    .where(and(eq(itineraryItems.id, request.itineraryItemId), eq(itineraryItems.status, "booked")))
    .returning({ id: itineraryItems.id });

  if (rows.length === 0) {
    logger.warn(
      { requestId, itemId: request.itineraryItemId },
      "partner-item-write: markLinkedItemConfirmed matched 0 rows (item not in 'booked' status, or missing)",
    );
    return { updated: false, reason: "item_not_found_or_trip_mismatch" };
  }
  return { updated: true };
}
