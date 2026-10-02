import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { z } from "zod";
import { db } from "../../db";
import { eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { users } from "@shared/models/auth";
import { localExpertForms, serviceProviderForms, expertRequests, trips } from "@shared/schema";
import { sanitizeText } from "../../utils/text-sanitizer";
import { requestAccountDeletion } from "../../automations/messaging/_core-auth";
import { runCoreJourney } from "../../automations/messaging/_core-worker";

// The recorded version is the one the Terms page displays — one constant both read.
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "@shared/legal-versions";

// Sanitize user object to remove sensitive fields before sending to client
function sanitizeUser(user: any) {
  if (!user) return user;
  const { password, instagramAccessToken, ...safeUser } = user;
  return safeUser;
}

const acceptTermsSchema = z.object({
  acceptTerms: z.boolean().refine(val => val === true, { message: "You must accept the Terms of Service" }),
  acceptPrivacy: z.boolean().refine(val => val === true, { message: "You must accept the Privacy Policy" }),
});

// Profile update schema
const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).transform(sanitizeText).optional(),
  lastName: z.string().trim().min(1).max(100).transform(sanitizeText).optional(),
  bio: z.string().max(500).transform(sanitizeText).optional(),
  profileImageUrl: z.string().url().optional().nullable(),
  specialties: z.array(z.string().trim().min(1).max(100).transform(sanitizeText)).max(30).optional(),
  preferredCurrency: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
});

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Session verification endpoint
  app.get("/api/auth/session", async (req: any, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.json({ authenticated: false, user: null });
    }
    try {
      const userId = req.user?.claims?.sub ?? req.user?.id;
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
  // Request marks pending_deletion and schedules the completion for seven days
  // later. Successful reauthentication cancels it. The messaging worker queues
  // the original-address completion email and anonymizes atomically at expiry,
  // deactivates forms and purges sessions, retaining compliance records.
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

      const pending = await requestAccountDeletion(userId);
      // No PII, forms or password are changed during grace. A later successful
      // login cancels the durable completion job.
      req.logout(() => {});
      res.json({ success: true, ...pending,
        message: "Deletion scheduled in 7 days. Sign in during that time to cancel." });
      void runCoreJourney({ userId }).catch((error) => console.error("[account-delete] journey failed", error));
    } catch (error) {
      console.error("[account-delete] error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });
}
