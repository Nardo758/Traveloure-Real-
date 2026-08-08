/**
 * Clerk Auth Routes
 *
 * Replaces the old Replit Auth routes (GET /api/auth/user, /api/users/me,
 * /api/profile PATCH, /api/auth/session, etc.) with Clerk-backed equivalents.
 *
 * Identity (email, name, avatar) is now owned by Clerk.
 * App-specific data (role, preferences, termsAcceptedAt, etc.) lives in the local users table.
 */
import { Router } from "express";
import { requireAuth, jitProvisionUser } from "../middlewares/requireAuth";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "../utils/auth";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import type { Express } from "express";

function sanitizeUser(user: any) {
  if (!user) return user;
  const { password, ...safeUser } = user;
  return safeUser;
}

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  bio: z.string().max(500).optional(),
  profileImageUrl: z.string().url().optional().nullable(),
  specialties: z.array(z.string()).optional(),
  preferredCurrency: z.string().length(3).optional(),
});

const acceptTermsSchema = z.object({
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "You must accept the Terms of Service",
  }),
  acceptPrivacy: z.boolean().refine((val) => val === true, {
    message: "You must accept the Privacy Policy",
  }),
});

export function registerClerkAuthRoutes(app: Express) {
  // Session check — unauthenticated-safe endpoint.
  // When the caller has a valid Clerk session but no local row (new sign-up),
  // jitProvisionUser creates the row so the first bootstrap call authenticates.
  app.get("/api/auth/session", async (req: any, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.json({ authenticated: false, user: null });
    }
    try {
      let auth: ReturnType<typeof getAuth> | null = null;
      try { auth = getAuth(req); } catch { /* no Clerk token — fall through */ }
      const claims = (auth?.sessionClaims as Record<string, unknown>) ?? undefined;
      const { dbUser } = await jitProvisionUser(userId, claims);
      return res.json({ authenticated: !!dbUser, user: sanitizeUser(dbUser) ?? null });
    } catch {
      return res.json({ authenticated: false, user: null });
    }
  });

  // Current user — unauthenticated-safe (returns null for logged-out users).
  // For authenticated sessions with no local row (new Clerk sign-up), JIT
  // provisioning runs here so the first GET /api/auth/user succeeds immediately
  // rather than waiting for a protected endpoint to trigger requireAuth.
  const meHandler = async (req: any, res: any) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.json(null);
      let auth: ReturnType<typeof getAuth> | null = null;
      try { auth = getAuth(req); } catch { /* no Clerk token — legacy fallback */ }
      const claims = (auth?.sessionClaims as Record<string, unknown>) ?? undefined;
      const { dbUser } = await jitProvisionUser(userId, claims);
      if (!dbUser) return res.json(null);
      return res.json(sanitizeUser(dbUser));
    } catch (err) {
      console.error("[clerk-auth] /api/auth/user error:", err);
      return res.json(null); // safe fallback — never break the loading state
    }
  };

  app.get("/api/auth/user", meHandler);
  app.get("/api/users/me", requireAuth, meHandler);
  app.get("/api/auth/me", requireAuth, meHandler);
  app.get("/api/user/profile", requireAuth, meHandler);

  // Profile update — protected
  const profileUpdateHandler = async (req: any, res: any) => {
    try {
      const userId = getUserId(req)!;
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
      }
      const [updated] = await db
        .update(users)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) return res.status(404).json({ message: "User not found" });
      return res.json(sanitizeUser(updated));
    } catch (err) {
      console.error("[clerk-auth] profile update error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  app.patch("/api/profile", requireAuth, profileUpdateHandler);
  app.patch("/api/user/profile", requireAuth, profileUpdateHandler);
  app.patch("/api/users/me", requireAuth, profileUpdateHandler);

  // Accept terms — protected
  app.post("/api/auth/accept-terms", requireAuth, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const parsed = acceptTermsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.errors });
      }
      const now = new Date();
      const [updated] = await db
        .update(users)
        .set({
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          termsVersion: "1.0",
          privacyVersion: "1.0",
          updatedAt: now,
        })
        .where(eq(users.id, userId))
        .returning();
      return res.json({ success: true, user: sanitizeUser(updated) });
    } catch (err) {
      console.error("[clerk-auth] accept-terms error:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legacy stubs — these routes existed under old email/password auth.
  // Clerk handles login/logout/register client-side; these return clear errors
  // so any remaining client code that hits them gets a useful message.
  app.post("/api/auth/login", (_req, res) => {
    res.status(410).json({
      message: "Email/password auth has been replaced by Clerk. Please use the sign-in page.",
    });
  });
  app.post("/api/auth/register", (_req, res) => {
    res.status(410).json({
      message: "Registration is now handled by Clerk. Please use the sign-up page.",
    });
  });
  app.post("/api/auth/logout", (_req, res) => {
    // Clerk manages browser sessions client-side; this stub returns success so
    // any remaining legacy logout calls don't break.
    res.json({ success: true });
  });
  app.post("/api/auth/forgot-password", (_req, res) => {
    res.status(410).json({
      message: "Password reset is now handled by Clerk. Please use the sign-in page.",
    });
  });
}
