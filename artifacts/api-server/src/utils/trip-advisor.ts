/**
 * CANONICAL trip-advisor access predicate (L20 Part A, ratified Jul 30, 2026).
 *
 * Before this file there were THREE disagreeing implementations of "is this user an
 * assigned expert on this trip?", and every one of them was wrong in a different way:
 *
 *   • `storage.isExpertAssignedToTrip` — STATUS-BLIND (no status filter at all), so a
 *     **rejected** advisor still passed. `authorizeTripLogistics` consumes it, so every
 *     endpoint on that helper inherited the over-grant.
 *   • `booking-actions.service.ts::isExpertAssignedToTrip` and
 *     `utils/trip-role.ts::getTripRole` — filtered `status IN ('pending','accepted')`,
 *     which wrongly EXCLUDED `'assigned'` (the status written when an admin confirms a
 *     routed lead — `admin-query.service.ts::confirmLeadAssignmentTx` and
 *     `admin.routes.ts` lead-confirm), so admin-confirmed experts were locked out of
 *     the very trips they had just been assigned to.
 *
 * This module is the single source of truth. It is an explicit ALLOW-LIST, and it
 * FAILS CLOSED: only the statuses enumerated in TRIP_ADVISOR_ACCESS_STATUSES grant
 * access. `rejected` denies; NULL denies; any future/unrecognised value denies until
 * it is deliberately added here.
 *
 * Statuses actually written to `trip_expert_advisors.status` anywhere in the codebase
 * (full enumeration as of Jul 30, 2026):
 *   'pending'  — column DEFAULT (baseline DDL + shared/schema.ts), storage.createTripExpertAdvisor
 *                default, booking-actions.service.ts ensureTripAdvisorRow + assignExpertAdvisor
 *   'accepted' — storage.acceptTripAssignment, routes.ts booking-accept bridge
 *   'assigned' — admin-query.service.ts confirmLeadAssignmentTx, admin.routes.ts lead-confirm
 *   'rejected' — declared in shared/schema.ts `expertAdvisorStatusEnum`; NO code path
 *                currently writes it, but it is a first-class declared state and is
 *                explicitly DENIED here (it was the live over-grant).
 * There is no DB CHECK on the column, which is precisely why the predicate must be a
 * closed allow-list rather than a deny-list.
 *
 * Do NOT add a status here without deciding what access it should confer.
 */
import { db } from "../db";
import { and, eq, inArray } from "drizzle-orm";
import { tripExpertAdvisors } from "@workspace/db";

/**
 * Advisor statuses that GRANT per-trip READ access. Closed allow-list — see file header.
 * `TRIP_ADVISOR_ACCESS_STATUSES` is the pre-existing name and stays the READ set (unchanged
 * value/semantics) so the ~50 existing read-surface consumers are untouched by construction.
 */
export const TRIP_ADVISOR_ACCESS_STATUSES = ["pending", "accepted", "assigned"] as const;
export const TRIP_ADVISOR_READ_ACCESS_STATUSES = TRIP_ADVISOR_ACCESS_STATUSES;

/**
 * Advisor statuses that GRANT per-trip WRITE access (ruling, Aug 7 2026 — "a PENDING advisor
 * may not write"). A trip's owner still SEES an invited-but-unaccepted expert's standing (the
 * expert must see the assigned trip in Inbox/assigned-trips to decide, so 'pending' stays in
 * the READ set above) but a pending advisor may not create/edit/reorder itinerary items or any
 * other trip-item mutation until they accept (or are admin-confirmed 'assigned'). Deliberately a
 * SEPARATE constant, not a filter applied ad hoc at call sites, so the write allow-list can't
 * silently drift from the read one.
 */
export const TRIP_ADVISOR_WRITE_ACCESS_STATUSES = ["accepted", "assigned"] as const;

/** Advisor statuses that explicitly DENY. Documentary — anything not in the allow-list denies. */
export const TRIP_ADVISOR_DENIED_STATUSES = ["rejected"] as const;

/**
 * Pure predicate over a single advisor-row status value. Fails closed: a non-string
 * (NULL/undefined) or unrecognised value returns false.
 */
export function tripAdvisorStatusGrantsAccess(status: unknown): boolean {
  return (
    typeof status === "string" &&
    (TRIP_ADVISOR_READ_ACCESS_STATUSES as readonly string[]).includes(status)
  );
}

/** Same as `tripAdvisorStatusGrantsAccess`, but against the WRITE allow-list (no 'pending'). */
export function tripAdvisorStatusGrantsWriteAccess(status: unknown): boolean {
  return (
    typeof status === "string" &&
    (TRIP_ADVISOR_WRITE_ACCESS_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * True when `userId` holds a READ-access-granting `trip_expert_advisors` row on `tripId`
 * (pending/accepted/assigned). This is the pre-existing predicate, unchanged — it is what every
 * trip-logistics/plancard/assigned-trips READ surface authorizes against, and 'pending' must
 * keep passing here so an invited expert can see the trip while deciding.
 *
 * The status filter is the SQL projection of the allow-list above, so `inArray` naturally
 * excludes NULL and every unrecognised value (fail-closed at the query level too — the
 * predicate and the query can't drift because both read the same constant).
 */
export async function isTripAdvisor(
  tripId: string | undefined | null,
  userId: string | undefined | null,
): Promise<boolean> {
  if (!tripId || !userId) return false;
  const [row] = await db
    .select({ id: tripExpertAdvisors.id })
    .from(tripExpertAdvisors)
    .where(
      and(
        eq(tripExpertAdvisors.tripId, tripId),
        eq(tripExpertAdvisors.localExpertId, userId),
        inArray(tripExpertAdvisors.status, [...TRIP_ADVISOR_READ_ACCESS_STATUSES]),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * True when `userId` holds a WRITE-access-granting `trip_expert_advisors` row on `tripId`
 * (accepted/assigned — NOT pending). Use this, never `isTripAdvisor`, to gate a trip-item
 * MUTATION path that grants access via the advisor role (create/edit/delete/reorder itinerary
 * items). Read surfaces keep using `isTripAdvisor` above.
 */
export async function isTripAdvisorWithWriteAccess(
  tripId: string | undefined | null,
  userId: string | undefined | null,
): Promise<boolean> {
  if (!tripId || !userId) return false;
  const [row] = await db
    .select({ id: tripExpertAdvisors.id })
    .from(tripExpertAdvisors)
    .where(
      and(
        eq(tripExpertAdvisors.tripId, tripId),
        eq(tripExpertAdvisors.localExpertId, userId),
        inArray(tripExpertAdvisors.status, [...TRIP_ADVISOR_WRITE_ACCESS_STATUSES]),
      ),
    )
    .limit(1);
  return !!row;
}
