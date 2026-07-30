/**
 * Canonical authorization for per-trip LOGISTICS routes (temporal anchors, day
 * boundaries, impact detection, anchor suggestions, energy, presets).
 *
 * Access = owner ‖ assigned-expert ‖ admin — matching the correct reference
 * implementation in booking-actions.ts (`workspace-constraints`), which this
 * replaces the inline `user.role !== "expert"` bypass with. A platform role
 * string NEVER grants access on its own: an expert reaches a trip's logistics
 * only via a real access-granting `trip_expert_advisors` assignment, resolved by
 * the canonical `isTripAdvisor` predicate (server/utils/trip-advisor.ts).
 *
 * Admin cross-trip access is allowed but AUDIT-LOGGED (interim: server logger
 * with actor/route/tripId, pending the dedicated audit-log lane).
 *
 * Returns `null` when the caller is authorized; otherwise the `{status, message}`
 * the route should send. 401 stays reserved for unauthenticated; unauthorized is 403.
 *
 * This module ALSO exports `authorizeTripOwnerTier` (below) — the same principal set MINUS
 * the assigned-expert branch, for the L20 tiers an assigned expert must never reach.
 */
import { storage } from "../storage";
import { verifyTripOwnership } from "./trip-ownership";
import { isTripAuthor } from "./trip-authorship";
import { isTripAdvisor } from "./trip-advisor";
import { logger } from "../infrastructure/logger";

export async function authorizeTripLogistics(
  tripId: string,
  userId: string | undefined | null,
  route: string,
): Promise<{ status: number; message: string } | null> {
  if (!userId) return { status: 401, message: "Not authenticated" };

  // Owner of the trip.
  if (await verifyTripOwnership(tripId, userId)) return null;

  // Expert assigned to this specific trip (trip_expert_advisors) — role-agnostic, resolved by
  // the CANONICAL predicate (server/utils/trip-advisor.ts). Called directly rather than through
  // `storage.isExpertAssignedToTrip` so the status allow-list this gate depends on is explicit
  // at the call site: pending/accepted/assigned PASS, rejected and any unknown status DENY.
  if (await isTripAdvisor(tripId, userId)) return null;

  // Authoring mode (ready-made brief §2): the expert who AUTHORS this trip. Explicit named check —
  // deliberately NOT routed through getTripRole (known pre-launch bypass).
  if (await isTripAuthor(tripId, userId)) return null;

  // Admin: allowed, but audit-logged (interim; dedicated audit-log lane filed).
  const user = await storage.getUser(userId);
  if (user?.role === "admin") {
    logger.info(
      { actor: userId, route, tripId, access: "admin-cross-trip-logistics" },
      "admin cross-trip logistics access (interim audit)",
    );
    return null;
  }

  return { status: 403, message: "Not authorized to access this trip" };
}

/**
 * OWNER-tier gate for per-trip data an assigned expert must NEVER see or write
 * (L20 ratified tier table): money-between-people (transactions / budget / settle-up /
 * split), participant PII (bulk-invite), vendor-contract CREATION + contract-document
 * WRITES, and emergency-contact WRITES. Same principal set as `authorizeTripLogistics`
 * **minus the assigned-expert branch**:
 *
 *   owner (`verifyTripOwnership`) ‖ trip author (`isTripAuthor`) ‖ admin (audit-logged)
 *
 * A "friend"/participant principal is intentionally absent: no code path mints a
 * `trip_collaborators` friend row and `trip_participants.userId` is left NULL by the only
 * automated writer, so a participant is not an expressible principal today (L20 Part C).
 *
 * HOISTED (this lane) from the private, unexported `authorizeTripOwnerTier` in
 * `server/routes.ts:193` so routers outside that monolith can apply the owner tier instead
 * of forking it or falling back to the (wrongly broader) `authorizeTripLogistics`.
 * Semantics are byte-for-byte the same as that implementation — the only differences are
 * (a) `verifyTripOwnership` comes from `utils/trip-ownership` (the shared single source of
 * truth, which additionally tolerates the raw-SQL `user_id` shape and swallows errors) and
 * (b) the admin audit line goes through the structured `logger`, matching
 * `authorizeTripLogistics` above.
 *
 * FILED FOLLOW-UP (not this lane — `server/routes.ts` is owned elsewhere right now):
 * re-point routes.ts's private `authorizeTripOwnerTier` at this shared export and delete it,
 * so only ONE implementation of the owner tier survives.
 *
 * Returns `null` when authorized; otherwise the `{status, message}` the route should send.
 */
export async function authorizeTripOwnerTier(
  tripId: string,
  userId: string | undefined | null,
  route: string,
): Promise<{ status: number; message: string } | null> {
  if (!userId) return { status: 401, message: "Not authenticated" };

  if (await verifyTripOwnership(tripId, userId)) return null;

  // Authoring mode (ready-made brief §2): the expert who AUTHORS this trip. Explicit named
  // check — deliberately NOT routed through getTripRole (known pre-launch bypass).
  if (await isTripAuthor(tripId, userId)) return null;

  // Admin: allowed, but audit-logged (interim; dedicated audit-log lane filed).
  const user = await storage.getUser(userId);
  if (user?.role === "admin") {
    logger.info(
      { actor: userId, route, tripId, access: "admin-cross-trip-owner-tier" },
      "admin cross-trip owner-tier access (interim audit)",
    );
    return null;
  }

  return { status: 403, message: "Not authorized to access this trip" };
}
