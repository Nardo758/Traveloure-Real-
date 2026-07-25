/**
 * trip-authorship.ts — the AUTHORING-mode auth check (ready-made brief v1.1 §2).
 *
 * authorized(trip, caller) := assignment(tripId, caller) exists   // assignment mode
 *                          OR isTripAuthor(tripId, caller)        // authoring mode (this file)
 *
 * Rules (hard):
 *  • This is a NAMED, EXPLICIT check comparing PRESENT values — `author_id IS NOT NULL` is enforced
 *    in the query itself, so the house `null === null` bug class cannot re-enter here.
 *  • It must NEVER be routed through getTripRole/canMutateTrip (known pre-launch bypass — separate
 *    fix). Where authoring must coexist with getTripRole-gated handlers (plancard read, the two
 *    per-item edit/delete routes), this check is added as a PARALLEL branch beside it.
 *  • It must not copy `isExpertAssignedToTrip`'s status-blind advisor lookup — authorship has no
 *    status; it is a direct column equality.
 */
import { db } from "../db";
import { trips } from "@shared/schema";
import { and, eq, isNotNull } from "drizzle-orm";

/** True iff the trip exists AND trips.author_id is non-null AND equals the caller's id. */
export async function isTripAuthor(tripId: string, userId: string | undefined | null): Promise<boolean> {
  if (!tripId || !userId) return false;
  const [row] = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), isNotNull(trips.authorId), eq(trips.authorId, userId)))
    .limit(1);
  return !!row;
}

/** Fetch the trip iff the caller authors it (authoring-mode bootstrap). Null otherwise. */
export async function getAuthoredTrip(tripId: string, userId: string | undefined | null) {
  if (!tripId || !userId) return null;
  const [row] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), isNotNull(trips.authorId), eq(trips.authorId, userId)))
    .limit(1);
  return row ?? null;
}
