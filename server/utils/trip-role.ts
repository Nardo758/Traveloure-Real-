/**
 * Trip role resolution utility.
 *
 * Access is resolved by ASSIGNMENT ONLY. The caller's platform role-string
 * (expert / admin / travel_expert / …) NEVER grants access on its own — a
 * previous version short-circuited to "expert" for any platform expert/admin,
 * which let them mutate ANY trip regardless of assignment (broken access control).
 *
 * Assignment lives in exactly two stores, both keyed per-trip:
 *   - trip_collaborators   — explicit owner / expert / friend rows
 *   - trip_expert_advisors — assigned experts (the live assign workflow writes
 *                            this; status pending/accepted). Role-agnostic, so an
 *                            assigned travel_expert/local_expert is now correctly
 *                            granted (previously denied by the role-string mismatch).
 */
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { tripCollaborators } from "@shared/schema";

export type TripRole = "owner" | "expert" | "friend" | null;

/**
 * Returns the caller's effective role for a trip, by assignment only:
 *  - "owner" / "expert" / "friend" — explicit trip_collaborators row
 *  - "expert" — an active trip_expert_advisors assignment (pending/accepted)
 *  - null     — no assignment ⇒ no access (platform role grants nothing)
 */
export async function getTripRole(tripId: string, userId: string): Promise<TripRole> {
  if (!userId) return null;

  // 1. Explicit collaborator row wins (owner / expert / friend).
  const rows = await db
    .select({ role: tripCollaborators.role })
    .from(tripCollaborators)
    .where(and(eq(tripCollaborators.tripId, tripId), eq(tripCollaborators.userId, userId)))
    .limit(1);

  if (rows.length > 0) {
    return rows[0].role as TripRole;
  }

  // 2. Assigned expert — a real per-trip assignment in trip_expert_advisors.
  //    Platform role is NOT consulted; only an actual assignment grants access.
  const assigned = await db.execute(sql`
    SELECT 1 FROM trip_expert_advisors
    WHERE trip_id = ${tripId}
      AND local_expert_id = ${userId}
      AND status IN ('pending', 'accepted')
    LIMIT 1
  `);
  if (assigned.rows && assigned.rows.length > 0) {
    return "expert";
  }

  return null;
}

/**
 * Returns true if the caller may mutate the trip (add/edit/remove activities, change transport mode).
 * Only owner and expert roles can mutate; friend is suggest-only. (Unchanged policy —
 * the fix is in role *resolution* above, not in this mutate predicate.)
 */
export function canMutateTrip(role: TripRole): boolean {
  return role === "owner" || role === "expert";
}
