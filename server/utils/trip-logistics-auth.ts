/**
 * Canonical authorization for per-trip LOGISTICS routes (temporal anchors, day
 * boundaries, impact detection, anchor suggestions, energy, presets).
 *
 * Access = owner ‖ assigned-expert ‖ admin — matching the correct reference
 * implementation in booking-actions.ts (`workspace-constraints`), which this
 * replaces the inline `user.role !== "expert"` bypass with. A platform role
 * string NEVER grants access on its own: an expert reaches a trip's logistics
 * only via a real `trip_expert_advisors` assignment (isExpertAssignedToTrip).
 *
 * Admin cross-trip access is allowed but AUDIT-LOGGED (interim: server logger
 * with actor/route/tripId, pending the dedicated audit-log lane).
 *
 * Returns `null` when the caller is authorized; otherwise the `{status, message}`
 * the route should send. 401 stays reserved for unauthenticated; unauthorized is 403.
 */
import { storage } from "../storage";
import { verifyTripOwnership } from "./trip-ownership";
import { logger } from "../infrastructure/logger";

export async function authorizeTripLogistics(
  tripId: string,
  userId: string | undefined | null,
  route: string,
): Promise<{ status: number; message: string } | null> {
  if (!userId) return { status: 401, message: "Not authenticated" };

  // Owner of the trip.
  if (await verifyTripOwnership(tripId, userId)) return null;

  // Expert assigned to this specific trip (trip_expert_advisors) — role-agnostic.
  if (await storage.isExpertAssignedToTrip(tripId, userId)) return null;

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
