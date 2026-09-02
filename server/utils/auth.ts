import type { Request } from "express";
import { storage } from "../storage";

/**
 * Normalizes user ID extraction across all three auth methods:
 *
 *   Email auth    → req.user = { claims: { sub: uuid, ... }, expires_at: ... }
 *   Replit OAuth  → req.user = { id: uuid, claims: { sub: uuid, ... }, ... }
 *   Facebook OAuth→ req.user = { id: uuid, ... }
 *
 * Always use this helper instead of accessing req.user directly in routes.
 * Accessing (req.user as any).claims.sub directly crashes for Replit/Facebook
 * users whose session shape has `id` instead of (or in addition to) `claims.sub`.
 *
 * @returns The user's UUID string, or null if not authenticated.
 */
export function getUserId(req: Request): string | null {
  const user = req.user as any;
  if (!user) return null;
  return user.claims?.sub ?? user.id ?? null;
}

/**
 * Same as getUserId but throws a typed error when the user is not authenticated.
 * Use in routes that have already passed through isAuthenticated middleware.
 */
export function requireUserId(req: Request): string {
  const id = getUserId(req);
  if (!id) throw new Error("Unauthenticated — no user ID on session");
  return id;
}

/**
 * @deprecated NEVER use this for an authorization decision — use `getDbRole` /
 * `requireDbAdmin` below (CLAUDE.md §2: the ratified posture is a DB role
 * lookup on the session's user id).
 *
 * The value here is the role string the login path stamped onto the session, which is
 * stale for up to the session TTL (7 days) and simply absent on the Replit OIDC shape.
 * Kept only so a non-authorization consumer (audit-log labelling, telemetry) can record
 * what the session claimed. It has no remaining callers in this repo.
 */
export function getSessionRole(req: Request): string {
  const user = req.user as any;
  if (!user) return 'user';
  return user.claims?.role ?? user.role ?? 'user';
}

/** Single point of truth for "what role does the DB say this user has right now". */
async function lookupDbRole(userId: string): Promise<string | null> {
  const user = await storage.getUser(userId);
  return (user?.role as string | undefined) ?? null;
}

/**
 * Resolves the acting user's role from the DATABASE — the §2 posture.
 *
 * WHY THIS EXISTS (audit findings 8 + 14): the session role string is wrong in both
 * directions.
 *   - It is STALE: the login paths (replitAuth.ts, emailAuth.ts) stamp `claims.role` once
 *     and the session lives for 7 days, so a demoted admin keeps the admin tier for up to
 *     a week (finding 8 — `GET /api/bookings/:id` handed out the full row, Stripe payment
 *     intent ids included, off that snapshot).
 *   - It is ABSENT: the Replit OIDC session shape carries no top-level `role` at all, so a
 *     `req.user?.role !== 'admin'` check fails CLOSED for real admins (finding 14).
 *
 * A DB lookup answers both: the role is whatever the row says RIGHT NOW, on every session
 * shape. Costs one `users` read per request on the paths that need it (never in a loop —
 * resolve once per request and pass the value down).
 *
 * Fails closed: no session, no user row, or a lookup error ⇒ `null` ⇒ callers fall back to
 * the least-privileged tier. Never throws.
 */
export async function getDbRole(req: Request): Promise<string | null> {
  const id = getUserId(req);
  if (!id) return null;
  try {
    return await lookupDbRole(id);
  } catch (err) {
    console.error("[auth] getDbRole lookup failed — denying elevated access:", err);
    return null;
  }
}

/**
 * Express middleware form of the §2 posture — mirrors `adminApiGuard`
 * (server/routes.ts) for admin routes that live OUTSIDE the `/api/admin` prefix and are
 * therefore not covered by the blanket guard (e.g. the Fever cache refresh endpoints).
 * 401 unauthenticated / 403 non-admin / 500 on lookup error; no bypass.
 */
export async function requireDbAdmin(req: any, res: any, next: any) {
  if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const id = getUserId(req);
  if (!id) return res.status(401).json({ message: "Authentication required" });
  let role: string | null;
  try {
    role = await lookupDbRole(id);
  } catch (err) {
    console.error("[auth] requireDbAdmin lookup failed:", err);
    return res.status(500).json({ message: "Authorization check failed" });
  }
  if (role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}
