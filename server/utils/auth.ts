import type { Request } from "express";
import { getAuth } from "@clerk/express";

/**
 * Returns the authenticated user's local DB ID from Clerk session claims.
 *
 * Uses sessionClaims.userId (the legacy Replit Auth sub for migrated users,
 * or Clerk native ID for new users) — the same value stored in users.id.
 *
 * Falls back to the legacy passport session shape (req.user.claims?.sub ?? req.user.id)
 * for any code path where Clerk middleware has set req.user directly.
 *
 * @returns The user's ID string, or null if not authenticated.
 */
export function getUserId(req: Request): string | null {
  // Clerk-primary: read from the verified session token.
  try {
    const auth = getAuth(req);
    const clerkId = (auth?.sessionClaims as any)?.userId || auth?.userId;
    if (clerkId) return clerkId;
  } catch {
    // getAuth throws if clerkMiddleware hasn't run — fall through to legacy.
  }

  // Legacy fallback: passport session shape set by requireAuth for backward compat.
  const user = (req as any).user;
  if (!user) return null;
  return user.claims?.sub ?? user.id ?? null;
}

/**
 * Same as getUserId but throws a typed error when the user is not authenticated.
 * Use in routes that have already passed through requireAuth middleware.
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
  const user = (req as any).user;
  if (!user) return "user";
  return user.claims?.role ?? user.role ?? "user";
}
