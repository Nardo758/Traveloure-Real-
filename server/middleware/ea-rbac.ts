import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * isEA — middleware that allows only executive_assistant and admin users.
 *
 * Apply to every /api/ea/* route so non-EA authenticated users (regular
 * travelers, providers, experts) cannot read or write EA client data.
 *
 * Admins are allowed through so platform staff can debug EA data.
 *
 * Permission matrix: docs/planning/ea-rbac-matrix.md
 */
export const isEA = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const userId =
    (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

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
