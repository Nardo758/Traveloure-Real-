import { getAuth } from "@clerk/express";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";

/**
 * Clerk-based authentication + JIT provisioning middleware.
 *
 * Bridge: users.id = sessionClaims.userId (legacy Replit Auth sub for migrated
 * users; Clerk native ID for new users). All DB lookups use this field.
 *
 * Sets req.dbUser (the local DB row) and req.user (legacy-compatible shape for
 * getUserId() and other callers that read req.user.claims.sub / req.user.id).
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  // sessionClaims.userId = legacy Replit Auth sub for migrated users (preserved as
  // Clerk externalId) OR Clerk native ID for brand-new users.
  // NEVER pass auth.userId (Clerk native ID) to local DB lookups for migrated users.
  const userId = (auth?.sessionClaims as any)?.userId || auth?.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    let [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!dbUser) {
      // JIT provision: first authenticated request creates the local row.
      // Populate nullable identity columns from sessionClaims (frozen at insert —
      // Clerk is the source of truth for subsequent reads; local copy satisfies
      // any NOT NULL constraints and avoids null in FK-dependent display queries).
      const claims = auth?.sessionClaims as Record<string, unknown> | undefined;
      const [inserted] = await db
        .insert(users)
        .values({
          id: userId,
          role: "user",
          email: (claims?.email as string) || undefined,
          firstName: (claims?.firstName as string) || undefined,
          lastName: (claims?.lastName as string) || undefined,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        dbUser = inserted;
      } else {
        // Race condition — another concurrent request already inserted; fetch it.
        [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      }
    }

    if (!dbUser) {
      return res.status(401).json({ message: "User not found" });
    }

    if (dbUser.isDeleted) {
      return res.status(403).json({ message: "This account has been deleted" });
    }

    if (dbUser.isSuspended) {
      return res.status(403).json({
        message: "Your account has been suspended. Please contact support.",
        reason: dbUser.suspensionReason ?? undefined,
      });
    }

    (req as any).dbUser = dbUser;
    // Maintain backward-compat shape for getUserId(req) and any code that reads
    // req.user.claims.sub, req.user.id, or req.user.role directly.
    (req as any).user = {
      claims: { sub: userId, role: dbUser.role },
      id: userId,
      role: dbUser.role,
    };
    next();
  } catch (err) {
    console.error("[requireAuth] error:", err);
    return res.status(500).json({ message: "Authorization check failed" });
  }
};
