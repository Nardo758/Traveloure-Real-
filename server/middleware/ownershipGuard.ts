/**
 * IDOR Protection Middleware
 * Blocks Insecure Direct Object Reference attempts by verifying that the
 * authenticated user owns (or is an admin of) the requested resource.
 *
 * Usage:
 *   router.get("/resource/:id",
 *     isAuthenticated,
 *     requireOwnership(async (req) => {
 *       const row = await db.select().from(table).where(eq(table.id, req.params.id));
 *       return row[0]?.userId ?? null;
 *     }),
 *     handler
 *   );
 */
import { getDbRole } from "../utils/auth";

export function requireOwnership(
  getResourceUserId: (req: any) => Promise<string | number | null>
) {
  return async (req: any, res: any, next: any) => {
    try {
      const resourceUserId = await getResourceUserId(req);

      if (resourceUserId === null) {
        return res.status(404).json({ message: "Not found" });
      }

      const actorId =
        (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      // The admin bypass is an AUTHORIZATION decision, so the role comes from the DB
      // (CLAUDE.md §2), never the session's stale/absent role claim — same class as audit
      // findings 8/14. Resolved lazily: an owner never triggers the lookup, so the hot
      // path costs nothing and only a cross-owner request pays for one `users` read.
      const isOwner = String(resourceUserId) === String(actorId);
      const actorRole = isOwner ? null : await getDbRole(req);

      if (!isOwner && actorRole !== "admin") {
        console.warn(
          `[IDOR ATTEMPT] User ${actorId} tried to access resource owned by ` +
            `${resourceUserId} at ${req.method} ${req.path}`
        );
        return res.status(403).json({ message: "Access denied" });
      }

      next();
    } catch (err) {
      console.error("[ownershipGuard] error:", err);
      res.status(500).json({ message: "Error verifying resource ownership" });
    }
  };
}
