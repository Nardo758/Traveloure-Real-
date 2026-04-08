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
import { registerTripRoutes } from "./trips";
import { registerIntelligenceRoutes } from "./intelligence";
import { registerAiRoutes } from "./ai";
import { registerIntegrationRoutes } from "./integrations";
import { registerCoordinationRoutes } from "./coordination";
import { registerUserFeatureRoutes } from "./user-features";
import { registerAffiliateRoutes } from "./affiliates";
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


export function registerContentTypeRoutes(app: Express, resolveSlug: (slug: string) => string = (s) => s): void {
  app.get("/api/vendors", async (req, res) => {
    const { category, city } = req.query;
    const vendorList = await storage.getVendors(
      category as string | undefined, 
      city as string | undefined
    );
    res.json(vendorList);
  });

  app.post("/api/vendors", isAuthenticated, async (req, res) => {
    try {
      const input = insertVendorSchema.parse(req.body);
      const vendor = await storage.createVendor(input);
      res.status(201).json(vendor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating vendor:", err);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.get("/api/service-categories", async (req, res) => {
    const categories = await storage.getServiceCategories();
    res.json(categories);
  });

  app.get("/api/service-categories/provider-counts", async (_req, res) => {
    try {
      const counts = await db
        .select({
          categoryId: serviceProviderForms.categoryId,
          count: sql<number>`count(*)::int`,
        })
        .from(serviceProviderForms)
        .where(isNotNull(serviceProviderForms.categoryId))
        .groupBy(serviceProviderForms.categoryId);
      const map: Record<string, number> = {};
      counts.forEach(c => { if (c.categoryId) map[c.categoryId] = c.count; });
      res.json(map);
    } catch (error: any) {
      console.error("Failed to fetch provider counts:", error?.message || error);
      res.status(500).json({});
    }
  });

  app.post("/api/service-categories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.parse(req.body);
      const category = await storage.createServiceCategory(input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.get("/api/service-categories/:categoryId/subcategories", async (req, res) => {
    const subcategories = await storage.getServiceSubcategories(req.params.categoryId);
    res.json(subcategories);
  });

  app.post("/api/service-subcategories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceSubcategorySchema.parse(req.body);
      const subcategory = await storage.createServiceSubcategory(input);
      res.status(201).json(subcategory);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create subcategory" });
    }
  });

  app.get("/api/custom-venues", async (req, res) => {
    const { userId, tripId, experienceType } = req.query;
    const venues = await storage.getCustomVenues(
      userId as string | undefined,
      tripId as string | undefined,
      experienceType as string | undefined
    );
    res.json(venues);
  });

  app.get("/api/custom-venues/:id", async (req, res) => {
    const venue = await storage.getCustomVenue(req.params.id);
    if (!venue) {
      return res.status(404).json({ message: "Custom venue not found" });
    }
    res.json(venue);
  });

  app.post("/api/custom-venues", isAuthenticated, async (req, res) => {
    try {
      const input = insertCustomVenueSchema.parse(req.body);
      const venue = await storage.createCustomVenue(input);
      res.status(201).json(venue);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating custom venue:", err);
      res.status(500).json({ message: "Failed to create custom venue" });
    }
  });

  app.patch("/api/custom-venues/:id", isAuthenticated, async (req, res) => {
    try {
      const input = insertCustomVenueSchema.partial().parse(req.body);
      const updated = await storage.updateCustomVenue(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Custom venue not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update custom venue" });
    }
  });

  app.delete("/api/custom-venues/:id", isAuthenticated, async (req, res) => {
    await storage.deleteCustomVenue(req.params.id);
    res.status(204).send();
  });

  app.get("/api/experience-types", async (req, res) => {
    const types = await storage.getExperienceTypes();
    // Filter out legacy slugs that have been aliased
    const legacySlugs = Object.keys(slugAliases);
    const filteredTypes = types.filter(t => !legacySlugs.includes(t.slug));
    res.json(filteredTypes);
  });

  app.get("/api/experience-types/:slug", async (req, res) => {
    const resolvedSlug = resolveSlug(req.params.slug);
    const type = await storage.getExperienceTypeBySlug(resolvedSlug);
    if (!type) {
      return res.status(404).json({ message: "Experience type not found" });
    }
    res.json(type);
  });

  app.get("/api/experience-types/:id/steps", async (req, res) => {
    const steps = await storage.getExperienceTemplateSteps(req.params.id);
    res.json(steps);
  });

  app.get("/api/experience-types/:id/tabs", async (req, res) => {
    try {
      const tabs = await storage.getExperienceTemplateTabs(req.params.id);
      res.json(tabs);
    } catch (error) {
      console.error("Error fetching template tabs:", error);
      res.status(500).json({ message: "Failed to fetch template tabs" });
    }
  });

  app.get("/api/experience-types/:id/universal-filters", async (req, res) => {
    try {
      const filters = await storage.getExperienceUniversalFilters(req.params.id);
      res.json(filters);
    } catch (error) {
      console.error("Error fetching universal filters:", error);
      res.status(500).json({ message: "Failed to fetch universal filters" });
    }
  });

  app.get("/api/faqs", async (req, res) => {
    const category = req.query.category as string | undefined;
    const faqsList = await storage.getFAQs(category);
    res.json(faqsList);
  });

  app.post("/api/faqs", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertFaqSchema.parse(req.body);
      const faq = await storage.createFAQ(input);
      res.status(201).json(faq);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  app.patch("/api/faqs/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertFaqSchema.partial().parse(req.body);
      const updated = await storage.updateFAQ(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "FAQ not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update FAQ" });
    }
  });

  app.delete("/api/faqs/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteFAQ(req.params.id);
    res.status(204).send();
  });

  app.get("/api/service-templates", async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    const templates = await storage.getServiceTemplates(categoryId);
    res.json(templates);
  });

  app.get("/api/service-templates/:id", async (req, res) => {
    const template = await storage.getServiceTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  });

  app.get("/api/my-purchased-templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const purchases = await storage.getTemplatePurchases({ buyerId: userId });
      
      // Get full template data for each purchase
      const templatesWithPurchases = await Promise.all(
        purchases.map(async (purchase) => {
          const template = await storage.getExpertTemplate(purchase.templateId);
          return { ...purchase, template };
        })
      );
      
      res.json(templatesWithPurchases);
    } catch (err) {
      console.error("Error fetching purchased templates:", err);
      res.status(500).json({ message: "Failed to fetch purchased templates" });
    }
  });

  app.get("/api/revenue-splits", async (req, res) => {
    try {
      const splits = await storage.getRevenueSplits();
      res.json(splits);
    } catch (err) {
      console.error("Error fetching revenue splits:", err);
      res.status(500).json({ message: "Failed to fetch revenue splits" });
    }
  });
}
