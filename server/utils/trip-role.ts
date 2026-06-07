/**
 * Trip role resolution utility.
 * Checks trip_collaborators first, then falls back to platform role for expert/admin bypass.
 */
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { tripCollaborators } from "@shared/schema";
import { storage } from "../storage";

export type TripRole = "owner" | "expert" | "friend" | null;

/**
 * Returns the caller's effective role for a trip:
 *  - "owner"  — has owner row in trip_collaborators
 *  - "expert" — has expert row in trip_collaborators OR is a platform expert/admin
 *  - "friend" — has friend row in trip_collaborators
 *  - null     — no access at all
 *
 * Platform experts and admins always get "expert" access to any trip (backward-compat).
 */
export async function getTripRole(tripId: string, userId: string): Promise<TripRole> {
  const rows = await db
    .select({ role: tripCollaborators.role })
    .from(tripCollaborators)
    .where(and(eq(tripCollaborators.tripId, tripId), eq(tripCollaborators.userId, userId)))
    .limit(1);

  if (rows.length > 0) {
    return rows[0].role as TripRole;
  }

  const user = await storage.getUser(userId);
  if (!user) return null;

  if (user.role === "admin" || user.role === "expert") {
    return "expert";
  }

  return null;
}

/**
 * Returns true if the caller may mutate the trip (add/edit/remove activities, change transport mode).
 * Only owner and expert roles can mutate; friend is suggest-only.
 */
export function canMutateTrip(role: TripRole): boolean {
  return role === "owner" || role === "expert";
}
