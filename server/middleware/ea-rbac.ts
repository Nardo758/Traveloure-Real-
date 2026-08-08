import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "../utils/auth";

/**
 * isEA — middleware that allows only executive_assistant and admin users.
 *
 * Apply to every /api/ea/* route so non-EA authenticated users (regular
 * travelers, providers, experts) cannot read or write EA client data.
 *
 * Admins are allowed through so platform staff can debug EA data.
 *
 * Uses getUserId() (not getAuth directly) so anonymous requests — where
 * Clerk's getAuth() throws because clerkMiddleware hasn't set auth state —
 * are safely caught and returned as 401 rather than an unhandled 500.
 *
 * Permission matrix: docs/planning/ea-rbac-matrix.md
 */
export const isEA = async (req: any, res: any, next: any) => {
  // getUserId wraps getAuth in a try/catch so it never throws on anonymous
  // requests; it falls back to the legacy req.user shape for backward compat.
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));

  if (!row || (row.role !== "executive_assistant" && row.role !== "admin")) {
    return res
      .status(403)
      .json({ message: "Executive Assistant access required" });
  }

  next();
};
