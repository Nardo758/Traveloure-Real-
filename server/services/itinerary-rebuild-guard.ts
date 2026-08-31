import { and, isNull, notInArray, type SQL } from "drizzle-orm";
import { itineraryItems } from "@shared/schema";

/**
 * D-1 money-safety guard (ledger 2026-08-31-two-surfaces-one-handoff).
 *
 * A "rebuild items" delete — the AI Regenerate wipe (POST /api/trips/:id/generate-itinerary)
 * and the generated-itinerary snapshot re-apply (saveGeneratedItinerarySnapshot, used by the Grok
 * generate rail and the Plus occasion drafts) — must NEVER destroy a row the traveler has committed
 * money to. Both handlers previously deleted their AI/traveler set with no routing-status guard, so a
 * regenerate could drop an `origin='ai'` stop the traveler had already routed to `ready_for_checkout`
 * or `purchased` (severing a `booking_id` from its plan item).
 *
 * §18 rule 1 (a privileged predicate has ONE author — two authors resolving it two ways is how the
 * class returns): every rebuild delete ANDs in THIS single predicate rather than re-implementing it.
 *
 * Spare anything in checkout or purchased, OR carrying a booking reference — the booking clause is
 * belt-and-suspenders for a booked row whose routing status has drifted (Leon's ruling): a booked row
 * must survive a rebuild whatever its status reads.
 */
export const REBUILD_PROTECTED_STATUSES = ["ready_for_checkout", "purchased"] as const;

/**
 * ANDed into a rebuild DELETE's WHERE clause to restrict it to rows that are safe to replace.
 * A row is deletable only when it is NOT in a protected status AND carries no booking reference.
 */
export function itineraryItemRebuildDeletable(): SQL {
  return and(
    notInArray(itineraryItems.routingStatus, [...REBUILD_PROTECTED_STATUSES]),
    isNull(itineraryItems.bookingId),
  )!;
}
