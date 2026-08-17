/**
 * Gap #18 — delete-with-bookings (Gate G5, ratified Aug 13 2026: "refuse + archive, mirroring
 * the shipped withdraw precedent").
 *
 * `service_bookings.service_id` is ON DELETE CASCADE, so deleting a `provider_services` row
 * silently destroys every booking row on it — including the record a traveler's receipt,
 * review and the earner's payout all point at. Before this guard, DELETE
 * `/api/provider/services/:id` performed no booking check at all.
 *
 * ONE assessment, both delete rails (provider + expert service-listings), so the two handlers
 * can never disagree about what blocks a deletion:
 *
 *   OPEN rows        → refuse (`HAS_OPEN_BOOKINGS`): the traveler is still owed an answer, a
 *                      delivery, or a dispute resolution — or a §15b claim is still in flight
 *                      and the promote/void machinery needs the row to exist.
 *   TRANSACTED rows  → refuse (`HAS_BOOKING_HISTORY`): sold history is never deleted — the
 *                      ready-made withdraw precedent's rule (c2), which the ratified G5 line
 *                      itself cites. NOTE this deliberately supersedes the mock's "once the
 *                      last booking is delivered, deleting it becomes possible" bullet: a
 *                      delivered booking IS transacted history, and cascade-deleting it would
 *                      erase a real receipt. The mock bullet holds only for bookings that end
 *                      cancelled-unpaid, which do not block.
 *   anything else    → deletable (`cancelled` unpaid / `failed` never-real rows cascade away).
 *
 * The offered alternative on either refusal is ARCHIVE (`status='archived'`): the listing
 * leaves every public surface immediately (they all filter `status='active'`), existing
 * bookings stand, and history keeps a listing to point at.
 *
 * The vocabulary lives in `shared/booking-visibility.ts` (OPEN_BOOKING_STATUSES /
 * TRANSACTED_BOOKING_STATUSES) beside the console's other status predicates — one shared
 * definition, never a hand-kept copy here.
 */
import { count, inArray } from "drizzle-orm";
import { db } from "../db";
import { serviceBookings } from "@shared/schema";
import {
  OPEN_BOOKING_STATUSES,
  TRANSACTED_BOOKING_STATUSES,
} from "@shared/booking-visibility";

export interface ServiceDeletionRefusal {
  code: "HAS_OPEN_BOOKINGS" | "HAS_BOOKING_HISTORY";
  openCount: number;
  transactedCount: number;
  /** The client renders the archive offer from this — it is always true on a refusal. */
  archiveOffered: true;
  message: string;
}

/**
 * Decide whether the given service rows may be deleted. Pass every id the delete would take
 * with it (for a parent property that would be the parent + its rooms — though the
 * `parent_service_id` ON DELETE RESTRICT refuses that case before this guard matters).
 * Returns null when deletion is allowed.
 */
export async function assessServiceDeletion(
  serviceIds: string[],
  serviceName?: string,
): Promise<ServiceDeletionRefusal | null> {
  if (serviceIds.length === 0) return null;
  const rows = await db
    .select({ status: serviceBookings.status, n: count() })
    .from(serviceBookings)
    .where(inArray(serviceBookings.serviceId, serviceIds))
    .groupBy(serviceBookings.status);

  let openCount = 0;
  let transactedCount = 0;
  for (const row of rows) {
    const status = row.status ?? "";
    if ((OPEN_BOOKING_STATUSES as readonly string[]).includes(status)) {
      openCount += Number(row.n);
    } else if ((TRANSACTED_BOOKING_STATUSES as readonly string[]).includes(status)) {
      transactedCount += Number(row.n);
    }
  }

  if (openCount === 0 && transactedCount === 0) return null;

  const name = serviceName ? `"${serviceName}"` : "This listing";
  if (openCount > 0) {
    return {
      code: "HAS_OPEN_BOOKINGS",
      openCount,
      transactedCount,
      archiveOffered: true,
      message:
        `${name} has ${openCount} upcoming booking${openCount === 1 ? "" : "s"}. Deleting it ` +
        `would leave those travelers holding a booking for a listing that no longer exists — ` +
        `the record their receipt, review and payout all point at. Archive it instead: it ` +
        `leaves your Catalog and search immediately, and the bookings stand.`,
    };
  }
  return {
    code: "HAS_BOOKING_HISTORY",
    openCount,
    transactedCount,
    archiveOffered: true,
    message:
      `${name} was booked and paid for. Deleting it would erase the record its receipts, ` +
      `reviews and payouts point at, so a sold listing's history is never deleted. Archive it ` +
      `instead: it leaves your Catalog and search immediately, and the history keeps a ` +
      `listing to point at.`,
  };
}
