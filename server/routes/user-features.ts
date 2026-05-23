import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { eq, and, or, like, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { amadeusService } from "../services/amadeus.service";
import { viatorService } from "../services/viator.service";
import { cacheService } from "../services/cache.service";
import { claudeService } from "../services/claude.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService } from "../services/grok.service";
import { feverService } from "../services/fever.service";
import { feverCacheService } from "../services/fever-cache.service";
import { coordinationService } from "../services/coordination.service";
import { vendorManagementService } from "../services/vendor-management.service";
import { budgetService } from "../services/budget.service";
import { aiUsageService } from "../services/ai-usage.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "../utils/data-sanitizer";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "../services/transport-leg-calculator";
import { buildGoogleNavUrl, buildAppleNavUrl } from "../services/maps-url-builder";
import { generateKml } from "../services/kml-generator";
import { generateGpx } from "../services/gpx-generator";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "../infrastructure";
import { 
  users, helpGuideTrips, touristPlaceResults, touristPlacesSearches, 
  aiBlueprints, vendors, insertVendorSchema,
  insertLocalExpertFormSchema, insertServiceProviderFormSchema,
  insertProviderServiceSchema, insertServiceCategorySchema,
  insertServiceSubcategorySchema, insertFaqSchema,
  insertServiceTemplateSchema, insertServiceBookingSchema, insertServiceReviewSchema,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  userExperienceItems, userExperiences, providerServices, cartItems, trips,
  serviceBookings, serviceReviews, notifications, wallets, creditTransactions, serviceProviderForms,
  insertCustomVenueSchema, insertGeneratedItinerarySchema,
  insertTemporalAnchorSchema, insertDayBoundarySchema, insertEnergyTrackingSchema,
  temporalAnchors, itineraryItems, generatedItineraries,
  userAndExpertChats, insertUserAndExpertChatSchema,
  expertPayouts, providerPayouts, platformSettings,
  expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow,
  transportLegs, sharedItineraries, mapsExportCache, expertUpdatedItineraries,
  accessAuditLogs, contentRegistry
} from "@shared/schema";
import { 
  insertTripParticipantSchema, 
  insertVendorContractSchema, 
  insertTripTransactionSchema,
  insertItineraryItemSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema
} from "@shared/schema";
import { api } from "@shared/routes";
import Stripe from "stripe";
import { verifyTripOwnership, logItineraryChange, sanitizeInput, sanitizeObject, mapFeverCategoryToEventType, requireAdmin, checkAIRateLimit } from "./route-utils";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "../services/routes.service";
import { itineraryIntelligenceService } from "../services/itinerary-intelligence.service";
import { emergencyService } from "../services/emergency.service";
import { experienceCatalogService } from "../services/experience-catalog.service";
import { opportunityEngineService } from "../services/opportunity-engine.service";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "../itinerary-optimizer";
import { travelPulseScheduler } from "../services/travelpulse-scheduler.service";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(2000),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
});

const CREDIT_PACKAGES = [
  { id: 1, credits: 50,  price: 49  },
  { id: 2, credits: 100, price: 89  },
  { id: 3, credits: 250, price: 199 },
  { id: 4, credits: 500, price: 349 },
];


export function registerUserFeatureRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/user-experiences", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experiences = await storage.getUserExperiences(userId);
    res.json(experiences);
  });

  app.get("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const items = await storage.getUserExperienceItems(req.params.id);
    res.json({ ...experience, items });
  });

  app.post("/api/user-experiences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const experience = await storage.createUserExperience({ ...req.body, userId });
      res.status(201).json(experience);
    } catch (err) {
      res.status(500).json({ message: "Failed to create experience" });
    }
  });

  app.patch("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const updated = await storage.updateUserExperience(req.params.id, req.body);
    res.json(updated);
  });

  app.delete("/api/user-experiences/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    await storage.deleteUserExperience(req.params.id);
    res.status(204).send();
  });

  app.post("/api/user-experiences/:id/items", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const experience = await storage.getUserExperience(req.params.id);
    if (!experience || experience.userId !== userId) {
      return res.status(404).json({ message: "Experience not found" });
    }
    const item = await storage.addUserExperienceItem({ ...req.body, userExperienceId: req.params.id });
    res.status(201).json(item);
  });

  app.patch("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    const updated = await storage.updateUserExperienceItem(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json(updated);
  });

  app.delete("/api/user-experience-items/:id", isAuthenticated, async (req, res) => {
    await storage.removeUserExperienceItem(req.params.id);
    res.status(204).send();
  });

  app.get("/api/wallet", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getOrCreateWallet(userId);
    res.json(wallet);
  });

  app.get("/api/credits/balance", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getOrCreateWallet(userId);
    const balance = wallet.credits ?? 0;
    const total = Math.max(balance, 250);
    res.json({ balance, total });
  });

  app.get("/api/wallet/transactions", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getWallet(userId);
    if (!wallet) {
      return res.json([]);
    }
    const transactions = await storage.getCreditTransactions(wallet.id);
    res.json(transactions);
  });

  app.post("/api/wallet/add-credits", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId, amount, description } = req.body;
      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid userId or amount" });
      }
      const transaction = await storage.addCredits(userId, amount, description || "Credit purchase");
      res.status(201).json(transaction);
    } catch (err) {
      console.error("Error adding credits:", err);
      res.status(500).json({ message: "Failed to add credits" });
    }
  });

  app.post("/api/credits/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { packageId } = req.body;

      const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
      if (!pkg) {
        return res.status(400).json({ message: "Invalid package" });
      }

      const { credits, price } = pkg;

      const userRecord = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      const userEmail = userRecord?.email || undefined;

      const { getBaseUrl } = await import("../services/stripe.service");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });

      const baseUrl = getBaseUrl();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${credits} Credits`,
                description: `Traveloure credit package - ${credits} credits`,
              },
              unit_amount: Math.round(price * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'credit_purchase',
          userId,
          credits: credits.toString(),
          packageId: packageId?.toString() || '',
        },
        success_url: `${baseUrl}/credits-billing?purchase=success&credits=${credits}`,
        cancel_url: `${baseUrl}/credits-billing?purchase=cancelled`,
      });

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (err: any) {
      console.error("Credit purchase error:", err);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const unreadOnly = req.query.unread === "true";
    const notifications = await storage.getNotifications(userId, unreadOnly);

    const enriched = await Promise.all(notifications.map(async (n) => {
      let tripId: string | null = null;
      if (n.relatedType === "trip" && n.relatedId) {
        tripId = n.relatedId;
      } else if (n.relatedType === "booking" && n.relatedId) {
        try {
          const booking = await storage.getServiceBooking(n.relatedId);
          tripId = booking?.tripId ?? null;
        } catch { tripId = null; }
      }
      return { ...n, tripId };
    }));

    res.json(enriched);
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const count = await storage.getUnreadCount(userId);
    res.json({ count });
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const notification = await storage.markAsRead(req.params.id);
    if (notification && notification.userId !== userId) {
      return res.status(403).json({ message: "Not your notification" });
    }
    res.json(notification);
  });

  app.post("/api/notifications/mark-all-read", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    await storage.markAllAsRead(userId);
    res.json({ success: true });
  });

  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    await storage.deleteNotification(req.params.id);
    res.json({ success: true });
  });

  // POST /api/profile/change-password — change password for email/password accounts
  app.post("/api/profile/change-password", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      const schema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const { users } = await import("../../shared/models/auth");
      const crypto = await import("crypto");

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      // Only email/password accounts can change password here
      if (!user.password) {
        return res.status(400).json({
          message: "Your account uses social login. Password changes are not supported.",
        });
      }

      // Verify current password (scrypt, same as emailAuth.ts)
      const isValid = await new Promise<boolean>((resolve, reject) => {
        const [salt, key] = user.password!.split(":");
        crypto.scrypt(parsed.data.currentPassword, salt, 64, (err, derived) => {
          if (err) reject(err);
          else resolve(key === derived.toString("hex"));
        });
      });
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const newHash = await new Promise<string>((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString("hex");
        crypto.scrypt(parsed.data.newPassword, salt, 64, (err, derived) => {
          if (err) reject(err);
          else resolve(`${salt}:${derived.toString("hex")}`);
        });
      });

      await db.update(users).set({ password: newHash, updatedAt: new Date() }).where(eq(users.id, userId));
      res.json({ success: true });
    } catch (err) {
      console.error("POST /api/profile/change-password error:", err);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // POST /api/profile/photo — upload a base64 profile photo (saved directly to DB)
  app.post("/api/profile/photo", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      const schema = z.object({
        imageData: z.string().min(1), // base64 data URL, e.g. "data:image/jpeg;base64,..."
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      // Validate it's actually an image data URL
      if (!parsed.data.imageData.startsWith("data:image/")) {
        return res.status(400).json({ message: "Only image files are accepted" });
      }
      // Rough size guard: base64 overhead is ~1.37x, so 5 MB image ≈ 6.85 MB base64
      if (parsed.data.imageData.length > 7 * 1024 * 1024) {
        return res.status(400).json({ message: "Image too large. Please choose an image under 5 MB." });
      }
      const { users } = await import("../../shared/models/auth");
      const [updated] = await db
        .update(users)
        .set({ profileImageUrl: parsed.data.imageData, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ profileImageUrl: updated.profileImageUrl });
    } catch (err) {
      console.error("POST /api/profile/photo error:", err);
      res.status(500).json({ message: "Failed to save photo" });
    }
  });

  // DELETE /api/profile/photo — remove the profile photo
  app.delete("/api/profile/photo", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      const { users } = await import("../../shared/models/auth");
      await db
        .update(users)
        .set({ profileImageUrl: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/profile/photo error:", err);
      res.status(500).json({ message: "Failed to remove photo" });
    }
  });

  // PATCH /api/profile — update authenticated user's profile fields
  app.patch("/api/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      const schema = z.object({
        firstName: z.string().min(1).max(100).optional(),
        lastName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      const updates: Record<string, unknown> = {};
      if (parsed.data.firstName !== undefined) updates.firstName = parsed.data.firstName;
      if (parsed.data.lastName !== undefined) updates.lastName = parsed.data.lastName;
      if (parsed.data.bio !== undefined) updates.bio = parsed.data.bio;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }
      const { users } = await import("../../shared/models/auth");
      const [updated] = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _pw, instagramAccessToken: _ig, ...safeUser } = updated as any;
      res.json(safeUser);
    } catch (err) {
      console.error("PATCH /api/profile error:", err);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // /api/chats — used by useChats hook and shared/routes.ts contract
  app.get("/api/chats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const chats = await db
        .select()
        .from(userAndExpertChats)
        .where(
          or(
            eq(userAndExpertChats.senderId, userId),
            eq(userAndExpertChats.receiverId, userId)
          )
        )
        .orderBy(desc(userAndExpertChats.createdAt));
      res.json(chats);
    } catch (err) {
      console.error("Error fetching chats:", err);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  app.post("/api/chats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const parsed = insertUserAndExpertChatSchema.safeParse({ ...req.body, senderId: userId });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      const [chat] = await db.insert(userAndExpertChats).values(parsed.data).returning();
      res.status(201).json(chat);
    } catch (err) {
      console.error("Error creating chat:", err);
      res.status(500).json({ message: "Failed to create chat" });
    }
  });

  // Dev-only: reset reviewer2 test review so REV-03 can always re-submit
  if (process.env.NODE_ENV !== "production") {
    app.delete("/api/dev/reset-test-review", async (req, res) => {
      const REVIEWER2_ID = "rev2-test-user-0000-0000-000000000002";
      const SERVICE_ID   = "24717f66-4741-400e-9f58-97224f8a2856";
      await db.execute(
        sql`DELETE FROM service_reviews WHERE traveler_id = ${REVIEWER2_ID} AND service_id = ${SERVICE_ID}`
      );
      // Recalculate aggregate so reviewCount/averageRating stay consistent
      const remaining = await storage.getServiceReviews(SERVICE_ID);
      const avgRating = remaining.length > 0
        ? remaining.reduce((sum, r) => sum + r.rating, 0) / remaining.length
        : 0;
      await db.update(providerServices)
        .set({ averageRating: String(avgRating.toFixed(2)), reviewCount: remaining.length, updatedAt: new Date() })
        .where(eq(providerServices.id, SERVICE_ID));
      res.json({ ok: true });
    });

    app.delete("/api/dev/reset-provider-response", async (req, res) => {
      const SERVICE_ID = "24717f66-4741-400e-9f58-97224f8a2856";
      await db.execute(
        sql`UPDATE service_reviews SET response_text = NULL, response_at = NULL WHERE service_id = ${SERVICE_ID}`
      );
      res.json({ ok: true });
    });

    // Dev-only: clear hidden state on any review (for REV-13 idempotency)
    app.delete("/api/dev/reset-review-hidden/:reviewId", async (req, res) => {
      const { reviewId } = req.params;
      await storage.unhideServiceReview(reviewId);
      res.json({ ok: true });
    });
  }
}
