import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const EXPERT_ROLES = ["expert", "local_expert", "travel_expert", "event_planner", "executive_assistant"];
const PROVIDER_ROLES = ["service_provider"];

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
    if (!row || (!EXPERT_ROLES.includes(row.role ?? "") && row.role !== "admin")) {
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
    if (!row || (!PROVIDER_ROLES.includes(row.role ?? "") && row.role !== "admin")) {
      return res.status(403).json({ message: "Provider access required" });
    }
    next();
  } catch (err) {
    console.error("isProvider middleware error:", err);
    return res.status(500).json({ message: "Authorization check failed" });
  }
};
