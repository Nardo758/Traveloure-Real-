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
      const actorRole =
        (req.user as any)?.claims?.role ?? (req.user as any)?.role;

      if (
        String(resourceUserId) !== String(actorId) &&
        actorRole !== "admin"
      ) {
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
