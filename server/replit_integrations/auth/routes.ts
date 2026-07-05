import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { z } from "zod";
import { db } from "../../db";
import { eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { users } from "@shared/models/auth";
import { localExpertForms, serviceProviderForms, expertRequests, trips } from "@shared/schema";

const CURRENT_TERMS_VERSION = "1.0";
const CURRENT_PRIVACY_VERSION = "1.0";

// Sanitize user object to remove sensitive fields before sending to client
function sanitizeUser(user: any) {
  if (!user) return user;
  const { password, ...safeUser } = user;
  return safeUser;
}

const acceptTermsSchema = z.object({
  acceptTerms: z.boolean().refine(val => val === true, { message: "You must accept the Terms of Service" }),
  acceptPrivacy: z.boolean().refine(val => val === true, { message: "You must accept the Privacy Policy" }),
});

// Profile update schema
const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  bio: z.string().max(500).optional(),
  profileImageUrl: z.string().url().optional().nullable(),
  specialties: z.array(z.string()).optional(),
  preferredCurrency: z.string().length(3).optional(),
});

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Session verification endpoint
  app.get("/api/auth/session", async (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.json({ authenticated: false, user: null });
    }
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.json({ authenticated: false, user: null });
      }
      const user = await authStorage.getUser(userId);
      res.json({ authenticated: true, user: sanitizeUser(user) });
    } catch (error) {
      console.error("Error checking session:", error);
      res.json({ authenticated: false, user: null });
    }
  });

  // Current user info (multiple route aliases)
  app.get("/api/users/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Profile management - GET
  app.get("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Profile management - PATCH (update)
  app.patch("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: "Validation failed",
          errors: validation.error.errors,
        });
      }
      const user = await authStorage.updateUser(userId, validation.data);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Alternate profile route
  app.get("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Get current authenticated user
  app.get("/api/auth/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = await authStorage.getUser(userId);
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = await authStorage.getUser(userId);
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Accept terms and privacy policy
  app.post("/api/auth/accept-terms", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      const validation = acceptTermsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validation.error.errors 
        });
      }

      const user = await authStorage.acceptTerms(
        userId, 
        CURRENT_TERMS_VERSION, 
        CURRENT_PRIVACY_VERSION
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ 
        success: true, 
        user: sanitizeUser(user),
        message: "Terms and privacy policy accepted successfully" 
      });
    } catch (error) {
      console.error("Error accepting terms:", error);
      res.status(500).json({ message: "Failed to accept terms" });
    }
  });

  // Get current terms/privacy versions
  app.get("/api/auth/terms-versions", (req, res) => {
    res.json({
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
  });

  // ─── Soft-delete: DELETE /api/auth/account ──────────────────────────────────
  //
  // Self-service account deletion. Hard deletes are prohibited: booking records,
  // Stripe payment history, and financial data MUST be retained for compliance.
  // Instead we:
  //   1. Anonymize the email  → deleted_{userId}@deleted.traveloure.com
  //   2. Set is_deleted=true + deleted_at=NOW()
  //   3. Cancel pending expert requests owned by the user
  //   4. Deactivate local_expert_forms and service_provider_forms for this user
  //   5. Destroy all active sessions for this user from the sessions store
  //   6. Log the current session out
  //
  // The isAuthenticated middleware already blocks deleted accounts on every
  // subsequent request, so even a race-condition session becomes harmless after
  // the session store rows are deleted in step 5.
  app.delete("/api/auth/account", isAuthenticated, async (req: any, res) => {
    try {
      const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const dbUser = await authStorage.getUser(userId);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Idempotent — if already deleted, return success
      if (dbUser.isDeleted) {
        return res.json({ success: true, message: "Account already deleted" });
      }

      const anonymizedEmail = `deleted_${userId}@deleted.traveloure.com`;

      // 1 & 2: Anonymize email + mark deleted
      await db
        .update(users)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          email: anonymizedEmail,
          password: null,
          instagramAccessToken: null,
        })
        .where(eq(users.id, userId));

      // 3: Cancel pending/queued expert requests owned by this user
      await db
        .update(expertRequests)
        .set({ status: "cancelled" })
        .where(
          eq(expertRequests.userId, userId)
        );

      // 4a: Deactivate local expert form
      await db
        .update(localExpertForms)
        .set({ status: "deactivated" })
        .where(eq(localExpertForms.userId, userId));

      // 4b: Deactivate service provider form
      await db
        .update(serviceProviderForms)
        .set({ status: "deactivated" })
        .where(eq(serviceProviderForms.userId, userId));

      // 5: Destroy all sessions for this user from the PostgreSQL session store.
      // Both email-auth (claims.sub) and Replit OIDC (id) session shapes are covered.
      await db.execute(drizzleSql`
        DELETE FROM sessions
        WHERE sess -> 'passport' -> 'user' -> 'claims' ->> 'sub' = ${userId}
           OR sess -> 'passport' -> 'user' ->> 'id' = ${userId}
      `);

      // 6: Destroy current session
      req.logout(() => {});

      console.info(`[account-delete] User ${userId} soft-deleted`);
      res.json({ success: true, message: "Account deleted successfully" });
    } catch (error) {
      console.error("[account-delete] error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });
}
