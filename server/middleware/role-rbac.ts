import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
// Canonical role families (role-vocabulary audit, Jul 27 2026). This file previously carried
// its own EXPERT_ROLES list that INCLUDED executive_assistant — diverging from the client
// (role-utils.ts) and the ratified EA-console model (§9: EA is its own /ea namespace, gated
// by isEA, not an expert-family member). EA pages consume /api/ea/* only, so dropping EA
// from the expert family removes unused server surface, not a working path.
import { isExpertRole, isProviderRole } from "@shared/roles";

/**
 * isExpert — middleware that allows only expert-role users and admins.
 *
 * Queries the database for the real role — never trusts session claims alone.
 * Returns 401 if unauthenticated, 403 if wrong role.
 */
export const isExpert = async (req: any, res: any, next: any) => {
  if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    if (!row || (!isExpertRole(row.role) && row.role !== "admin")) {
      return res.status(403).json({ message: "Expert access required" });
    }
    next();
  } catch (err) {
    console.error("isExpert middleware error:", err);
    return res.status(500).json({ message: "Authorization check failed" });
  }
};

/**
 * isProvider — middleware that allows only service_provider users and admins.
 *
 * Queries the database for the real role — never trusts session claims alone.
 * Returns 401 if unauthenticated, 403 if wrong role.
 */
export const isProvider = async (req: any, res: any, next: any) => {
  if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    if (!row || (!isProviderRole(row.role) && row.role !== "admin")) {
      return res.status(403).json({ message: "Provider access required" });
    }
    next();
  } catch (err) {
    console.error("isProvider middleware error:", err);
    return res.status(500).json({ message: "Authorization check failed" });
  }
};
