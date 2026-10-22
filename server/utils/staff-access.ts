/**
 * requireStaff(permission) — the ONE staff gate for a single permission.
 *
 * Role is read from the database on the session user id (the same posture as
 * `requireDbAdmin`). Admin holds every permission. Support and moderator hold
 * only the fixed map in `shared/staff-permissions.ts`. The blanket `/api/admin`
 * guard uses that same map, so a staff role cannot reach a route this helper
 * would refuse, and this helper still refuses if the blanket guard is loosened.
 */
import { staffHasPermission, type StaffPermission } from "@shared/staff-permissions";
import { storage } from "../storage";
import { getUserId } from "./auth";

export function requireStaff(permission: StaffPermission) {
  return async (req: any, res: any, next: any) => {
    if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const id = getUserId(req);
    if (!id) return res.status(401).json({ message: "Authentication required" });

    let user: Awaited<ReturnType<typeof storage.getUser>>;
    try {
      user = await storage.getUser(id);
    } catch (err) {
      console.error("[auth] requireStaff lookup failed:", err);
      return res.status(500).json({ message: "Authorization check failed" });
    }

    if (!user || user.isDeleted) {
      return res.status(403).json({
        message: user?.isDeleted ? "This account has been deleted" : "Admin access required",
      });
    }
    if (user.isSuspended) {
      return res.status(403).json({
        message: "Your account has been suspended. Please contact support.",
        reason: user.suspensionReason ?? undefined,
      });
    }
    if (!staffHasPermission(user.role, permission)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    return next();
  };
}
