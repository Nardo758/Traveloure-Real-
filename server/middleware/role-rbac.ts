import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
// Canonical role families (role-vocabulary audit, Jul 27 2026). This file previously carried
// its own EXPERT_ROLES list that INCLUDED executive_assistant — diverging from the client
// (role-utils.ts) and the ratified EA-console model (§9: EA is its own /ea namespace, gated
// by isEA, not an expert-family member). EA pages consume /api/ea/* only, so dropping EA
// from the expert family removes unused server surface, not a working path.
import { isExpertRole, isProviderRole, isEarnerRole } from "@shared/roles";
import { getUserId } from "../utils/auth";

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
  const userId = getUserId(req);
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
 * isEarner — middleware that allows either expert-family or provider users, plus admins.
 *
 * GAP 1 fix (expert-loop object-flow audit, Jul 30 2026): `POST/PATCH /api/provider/services`
 * is CLAUDE.md §5's single shared offering-creation endpoint for BOTH roles
 * (`ServiceForm.tsx` posts here regardless of `role="expert"` vs `role="provider"`), but the
 * RBAC backstop below gated the whole `/api/provider/services` prefix with `isProvider`
 * (service_provider-only) — every expert-role account 403'd. This middleware is the
 * shared/roles.ts family union (`isEarnerRole` = `isExpertRole || isProviderRole`), scoped only
 * to that one shared prefix; the rest of `/api/provider/*` (verification-status, dashboard,
 * analytics, earnings) stays provider-only via `isProvider` below — the backstop is kept, not
 * removed, just corrected to match who is actually allowed to write to this endpoint.
 *
 * Queries the database for the real role — never trusts session claims alone.
 * Returns 401 if unauthenticated, 403 if wrong role.
 */
export const isEarner = async (req: any, res: any, next: any) => {
  if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
    if (!row || (!isEarnerRole(row.role) && row.role !== "admin")) {
      return res.status(403).json({ message: "Expert or provider access required" });
    }
    next();
  } catch (err) {
    console.error("isEarner middleware error:", err);
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
  const userId = getUserId(req);
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
