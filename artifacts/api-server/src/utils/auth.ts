import type { Request } from "express";

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
 * Returns the user's role from the session. Falls back to 'user'.
 */
export function getSessionRole(req: Request): string {
  const user = req.user as any;
  if (!user) return 'user';
  return user.claims?.role ?? user.role ?? 'user';
}
