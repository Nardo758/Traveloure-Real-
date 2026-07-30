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
import { tripExpertAdvisors } from "@shared/schema";

/** Advisor statuses that GRANT per-trip access. Closed allow-list — see file header. */
export const TRIP_ADVISOR_ACCESS_STATUSES = ["pending", "accepted", "assigned"] as const;

/** Advisor statuses that explicitly DENY. Documentary — anything not in the allow-list denies. */
export const TRIP_ADVISOR_DENIED_STATUSES = ["rejected"] as const;

/**
 * Pure predicate over a single advisor-row status value. Fails closed: a non-string
 * (NULL/undefined) or unrecognised value returns false.
 */
export function tripAdvisorStatusGrantsAccess(status: unknown): boolean {
  return (
    typeof status === "string" &&
    (TRIP_ADVISOR_ACCESS_STATUSES as readonly string[]).includes(status)
  );
}

/**
 * True when `userId` holds an access-granting `trip_expert_advisors` row on `tripId`.
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
        inArray(tripExpertAdvisors.status, [...TRIP_ADVISOR_ACCESS_STATUSES]),
      ),
    )
    .limit(1);
  return !!row;
}
