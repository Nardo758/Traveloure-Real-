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
 *   - trip_expert_advisors — assigned experts, resolved by the CANONICAL predicate
 *                            `isTripAdvisor` (server/utils/trip-advisor.ts): the
 *                            allow-list is pending/accepted/assigned, rejected and any
 *                            unknown status DENY. Role-agnostic, so an assigned
 *                            travel_expert/local_expert is correctly granted.
 */
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { tripCollaborators } from "@shared/schema";
import { isTripAdvisor } from "./trip-advisor";

export type TripRole = "owner" | "expert" | "friend" | null;

/**
 * Returns the caller's effective role for a trip, by assignment only:
 *  - "owner" / "expert" / "friend" — explicit trip_collaborators row
 *  - "expert" — an access-granting trip_expert_advisors assignment (pending/accepted/assigned)
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

  // 2. Assigned expert — a real per-trip assignment in trip_expert_advisors, resolved by the
  //    CANONICAL predicate (server/utils/trip-advisor.ts). Platform role is NOT consulted; only
  //    an actual assignment grants access. This branch used to inline
  //    `status IN ('pending','accepted')`, which wrongly EXCLUDED `'assigned'` (written by an
  //    admin lead-confirm) — L20 Part A. Only the status predicate changed; the role-string
  //    return semantics of this function are untouched.
  if (await isTripAdvisor(tripId, userId)) {
    return "expert";
  }

  return null;
}

/**
 * THE WRITE ARM OF THIS MODULE IS RETIRED (punchlist V-29 = option B, decision-maker ruled
 * 2026-09-15; ledger `2026-09-15-v29-one-trip-write-resolver`).
 *
 * `getTripWriteRole` and `canMutateTrip` used to live here and answered "may this person rewrite
 * the plan?" — the question CLAUDE.md Locked Decision 42 **D17** rules must have exactly ONE
 * answer. There were two, and they disagreed about three principals: this one resolved the OWNER
 * only through a `trip_collaborators` row (it never read `trips.user_id`) and carried neither the
 * trip AUTHOR nor an admin branch, so every caller bolted `isTripAuthor` on beside it.
 *
 * THE ONE PREDICATE IS NOW
 *   `authorizeTripLogistics(tripId, userId, route, { requireWriteAccess: true })`
 *   (server/utils/trip-logistics-auth.ts)
 * — owner off the `trips` row, §12 WRITE-status advisor (accepted/assigned, NEVER pending), trip
 * author, audit-logged admin. Do not re-introduce a second one here: a parallel "may this person
 * rewrite the plan?" test is the derivation-drift class §18 rule 1 names, and its return is pinned
 * by `server/__tests__/one-trip-write-resolver.db.test.ts` (W6).
 *
 * `getTripRole` above SURVIVES and is unchanged: it is the READ resolver (plancard read, trip
 * GET/PDF, the affiliate-booking trip-access check), and §12 deliberately grants a `pending`
 * advisor there. Because it still resolves the owner from `trip_collaborators`, the owner-row
 * data invariant every mint site writes (`storage.createTrip`, the two raw-SQL mints, the
 * ready-made clone, `server/seeds/trip-ownership.seed.ts`) is STILL load-bearing and was
 * deliberately left in place by that lane.
 */
