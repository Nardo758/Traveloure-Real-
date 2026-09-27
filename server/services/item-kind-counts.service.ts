/**
 * R151 (ledger `2026-09-27-admin-kind-reflects-refunds`) — the admin's per-kind count of a plan's
 * items, with a CLOSED booking read as NOT BOOKED.
 *
 * `itemKind` (shared/item-kind.ts) rule 1 says "`bookingId` present ⇒ `included`". The refund path
 * (`revertPurchasedItemsForBooking`) deliberately KEEPS `itinerary_items.booking_id` on the row as
 * the honest history of what happened (§13), so a raw read of that column labels a refunded or
 * cancelled item "included" — a purchase the traveler no longer holds. The admin ready-made approval
 * snapshots this count into `insideCounts.byKind`, which the public store card then shows.
 *
 * The fix is on the INPUT, never a second derivation (§18 rule 1): the item's own `booking_id` is
 * passed to the ONE `itemKind` only while its booking counts as booked in the ONE shared vocabulary
 * (`itemBookingStatusEntry`, shared/booking-visibility.ts — R154: `cancelled`/`refunded` and the
 * payment states `payment_pending`/`failed`/`expired` do not; no list invented here). A closed-booking item then falls through the unchanged rules
 * to what it names — its listing (`bookable_separately`), a partner product, or a recommendation.
 * This is the same list PR #1112's `linkedBookingFields` (trip-plan.service.ts) reads for the
 * slip/Trip Card, so the admin count and the traveler surfaces cannot disagree.
 *
 * NOTHING HERE WRITES OR AUTHORIZES — it reads id and status columns and returns counts.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { itineraryItems, serviceBookings } from "@shared/schema";
import { itemBookingLabelStatus, itemBookingStatusEntry } from "@shared/booking-visibility";
import { outOfBandFullyRefundedBookingIds } from "./out-of-band-refund.service";
import { itemKind, type ItemKind, type ItemKindInput } from "@shared/item-kind";

export interface LinkedBookingKindRow extends ItemKindInput {
  /** `service_bookings.status` of the row `booking_id` names; NULL/absent when none is joined. */
  bookingStatus?: string | null;
  /** R163: the server's refund reconciliation answer — a dashboard refund covered the whole share. */
  refundedOutOfBand?: boolean | null;
}

/**
 * The kind of one row whose linked booking's status is known. A booking in a CLOSED status is not
 * a booking the item holds, so it is withheld from rule 1 — never a guessed status: an absent
 * status (no row joined) leaves the id as it was, which is `itemKind`'s own contract.
 */
export function itemKindForLinkedBooking(row: LinkedBookingKindRow): ItemKind {
  // R154 (ledger `2026-09-27-booking-status-vocabulary`): "is this a booking the item holds?" is
  // the ONE vocabulary `linkedBookingFields` reads — closed, in-flight, failed and expired payments
  // are not booked; `disputed` still is. An absent status (no row joined) keeps the id.
  // R163 (ledger `2026-09-27-dashboard-refund-reads-refunded`): the status a label reads, so a
  // dashboard refund that covered the booking's whole share counts as refunded here too.
  const status =
    row.bookingStatus == null && row.refundedOutOfBand !== true
      ? null
      : itemBookingLabelStatus({ status: row.bookingStatus ?? null, refundedOutOfBand: row.refundedOutOfBand });
  const heldBooking = status === null || itemBookingStatusEntry(status).countsAsBooked;
  const bookingId = row.bookingId && !heldBooking ? null : row.bookingId;
  return itemKind({
    bookingId,
    providerServiceId: row.providerServiceId,
    affiliateProductId: row.affiliateProductId,
  });
}

/** Per-kind counts over a plan's items, each read with its booking's live status. */
export async function countItemKindsForTrip(tripId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      bookingId: itineraryItems.bookingId,
      bookingStatus: serviceBookings.status,
      providerServiceId: itineraryItems.providerServiceId,
      affiliateProductId: itineraryItems.affiliateProductId,
    })
    .from(itineraryItems)
    .leftJoin(serviceBookings, eq(serviceBookings.id, itineraryItems.bookingId))
    .where(eq(itineraryItems.tripId, tripId));
  const refundedOutOfBand = await outOfBandFullyRefundedBookingIds(rows.map((r) => r.bookingId));
  const byKind: Record<string, number> = {};
  for (const row of rows) {
    const kind = itemKindForLinkedBooking({
      ...row,
      refundedOutOfBand: row.bookingId ? refundedOutOfBand.has(row.bookingId) : false,
    });
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }
  return byKind;
}
