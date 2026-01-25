import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { z } from "zod";

const CURRENT_TERMS_VERSION = "1.0";
const CURRENT_PRIVACY_VERSION = "1.0";

const acceptTermsSchema = z.object({
  acceptTerms: z.boolean().refine(val => val === true, { message: "You must accept the Terms of Service" }),
  acceptPrivacy: z.boolean().refine(val => val === true, { message: "You must accept the Privacy Policy" }),
});

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Accept terms and privacy policy
  app.post("/api/auth/accept-terms", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
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
        user,
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
}
