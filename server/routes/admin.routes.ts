import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
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
  expertPayouts, providerPayouts,
  eaClientRelationships,
  eaExecutives, insertEaExecutiveSchema,
  eaEvents, insertEaEventSchema,
  eaTravelArrangements, insertEaTravelArrangementSchema,
  eaGifts, insertEaGiftSchema,
  eaSavedVenues, insertEaSavedVenueSchema,
  eaCommunications, insertEaCommunicationSchema,
  eaAiTasks, insertEaAiTaskSchema,
  userAndExpertContracts,
  expertSelectedServices,
  localKnowledgeNuggets, insertLocalKnowledgeNuggetSchema,
  contentPlacementRules,
  type InsertContentPlacementRule,
} from "@shared/schema";
import {
  TAB_CONTENT_TYPE_MAP,
  TAB_AFFILIATE_CATEGORIES,
  SURFACE_DEFAULT_CONTENT_TYPES,
  SURFACE_DEFAULT_AFFILIATE_CATEGORIES,
  SURFACE_SLUGS,
} from "@shared/content-surface-map";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "../itinerary-optimizer";
import { amadeusService } from "../services/amadeus.service";
import { viatorService } from "../services/viator.service";
import { cacheService } from "../services/cache.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { claudeService } from "../services/claude.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "../services/routes.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService } from "../services/grok.service";
import { feverService } from "../services/fever.service";
import { feverCacheService } from "../services/fever-cache.service";
import { expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow, serviceCategories, visaRequirementsCache, expertServiceOfferings, expertServiceCategories, cityNeighborhoods, travelPulseHiddenGems } from "@shared/schema";
import { coordinationService } from "../services/coordination.service";
import { vendorManagementService } from "../services/vendor-management.service";
import { budgetService } from "../services/budget.service";
import { itineraryIntelligenceService } from "../services/itinerary-intelligence.service";
import { emergencyService } from "../services/emergency.service";
import { experienceCatalogService } from "../services/experience-catalog.service";
import { opportunityEngineService } from "../services/opportunity-engine.service";
import { aiUsageService } from "../services/ai-usage.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "../utils/data-sanitizer";
import { transportLegs, sharedItineraries, mapsExportCache, expertUpdatedItineraries, affiliateProducts, contentRegistry } from "@shared/schema";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "../services/transport-leg-calculator";
import { buildGoogleNavUrl, buildAppleNavUrl } from "../services/maps-url-builder";
import { generateKml } from "../services/kml-generator";
import { generateGpx } from "../services/gpx-generator";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "../infrastructure";
import { 
  insertTripParticipantSchema, 
  insertVendorContractSchema, 
  insertTripTransactionSchema,
  insertItineraryItemSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema,
  insertProviderAvailabilityScheduleSchema,
  insertProviderBlackoutDateSchema,
  tripExpertAdvisors,
} from "@shared/schema";
import {
  EXPERT_SHARE_RATE,
  PLATFORM_FEE_RATE,
  resolveCommissionRates,
  type CommissionRates,
} from "../services/commission";

const router = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    })
    .trim();
}

function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      (result as Record<string, any>)[key] = sanitizeInput(result[key]);
    }
  }
  return result;
}

async function verifyTripOwnership(tripId: string, userId: string): Promise<boolean> {
  const trip = await storage.getTrip(tripId);
  return trip?.userId === userId;
}

function logItineraryChange(tripId: string, who: string, action: string, changeType: string, role: string, activityId?: string, metadata?: any) {
  return storage.createItineraryChange({
    tripId,
    activityId: activityId || null,
    who,
    action,
    changeType,
    role,
    metadata: metadata || {},
  }).catch(err => console.error("Failed to log itinerary change:", err));
}

function mapFeverCategoryToEventType(category: string): string {
  const categoryMap: Record<string, string> = {
    'experiences': 'cultural', 'concerts': 'cultural', 'theater': 'cultural',
    'exhibitions': 'cultural', 'festivals': 'cultural', 'nightlife': 'nightlife',
    'food-drink': 'culinary', 'sports': 'sports', 'wellness': 'wellness',
    'tours': 'cultural', 'classes': 'cultural', 'family': 'family',
  };
  return categoryMap[category] || 'other';
}

function serviceCategorySlugToFeeCategory(slug: string | null | undefined): string {
  if (!slug) return "default";
  if (/transport|logistics|shuttle|transfer/.test(slug)) return "transportation";
  if (/lodg|accommodation|hotel|hostel|resort/.test(slug)) return "accommodation";
  if (/dining|food|culinary|restaurant/.test(slug)) return "dining";
  if (/tour|experience|activit|adventure|outdoor/.test(slug)) return "activities";
  if (/flight|air|airline/.test(slug)) return "flights";
  if (/car.?rental|rental|vehicle/.test(slug)) return "car_rental";
  if (/insurance|safety|security/.test(slug)) return "insurance";
  return "default";
}


const requireAdminLocal = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
  const user = await db.select({ role: users.role }).from(users)
    .where(eq(users.id, req.user?.claims?.sub)).then(r => r[0]);
  if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
};

router.get("/api/admin/stats", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Get counts from database
      const allUsers = await db.select().from(users);
      const allBookings = await storage.getServiceBookings({});
      const pendingExperts = await storage.getLocalExpertForms("pending");
      const pendingProviders = await storage.getServiceProviderForms("pending");
      
      const totalUsers = allUsers.length;
      const totalBookings = allBookings.length;
      
      // Calculate revenue from completed bookings
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // This month's revenue
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const monthlyRevenue = completedBookings
        .filter(b => {
          const date = b.createdAt ? new Date(b.createdAt) : null;
          return date && date.getMonth() === thisMonth && date.getFullYear() === thisYear;
        })
        .reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // New users today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newUsersToday = allUsers.filter(u => {
        const created = u.createdAt ? new Date(u.createdAt) : null;
        return created && created >= today;
      }).length;
      
      res.json({
        totalUsers,
        totalBookings,
        totalRevenue,
        monthlyRevenue,
        newUsersToday,
        pendingExpertApplications: pendingExperts.length,
        pendingProviderApplications: pendingProviders.length,
      });
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });


router.get("/api/admin/bookings", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const status = req.query.status as string | undefined;
      const allBookings = await storage.getServiceBookings(status ? { status } : {});
      const enrichedBookings = await Promise.all(allBookings.map(async (booking) => {
        const traveler = await storage.getUser(booking.travelerId);
        const provider = await storage.getUser(booking.providerId);
        const service = await storage.getProviderServiceById(booking.serviceId);
        return {
          ...booking,
          traveler: traveler ? { id: traveler.id, firstName: traveler.firstName, lastName: traveler.lastName, email: traveler.email } : null,
          provider: provider ? { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, email: provider.email } : null,
          service: service ? { id: service.id, serviceName: service.serviceName } : null,
        };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("Admin bookings error:", err);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });


router.get("/api/admin/revenue", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const allBookings = await storage.getServiceBookings({});
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      const totalGross = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
      res.json({
        totalRevenue,
        totalGross,
        totalBookings: allBookings.length,
        completedBookings: completedBookings.length,
      });
    } catch (err) {
      console.error("Admin revenue error:", err);
      res.status(500).json({ message: "Failed to fetch revenue" });
    }
  });

  // Admin: Get all expert applications

router.get("/api/admin/expert-applications", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getLocalExpertForms(status);
    res.json(forms);
  });

  // Admin: Update expert application status

router.patch("/api/admin/expert-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const updated = await storage.updateLocalExpertFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // If approved, update user role based on expert type
    if (status === "approved") {
      // Use the expertType from the form, default to "expert" for backwards compatibility
      const role = (updated as any).expertType || "expert";
      await db.update(users).set({ role }).where(eq(users.id, updated.userId));

      // Auto-populate expert's service catalogue from their application selections
      const selectedOfferingIds = ((updated as any).selectedServices ?? []) as string[];
      if (selectedOfferingIds.length > 0) {
        await db.insert(expertSelectedServices)
          .values(selectedOfferingIds.map(serviceOfferingId => ({
            expertId: updated.userId,
            serviceOfferingId,
            isActive: true,
          })))
          .onConflictDoNothing();
      }

      // Notify the user to complete Stripe Connect setup
      await db.insert(notifications).values({
        userId: updated.userId,
        type: "application_approved",
        title: "Application Approved! 🎉",
        message: "Congratulations! Your expert application has been approved. Complete your Stripe Connect setup to start receiving payouts.",
        data: { link: "/expert/earnings" },
      });
    }
    
    res.json(updated);
  });

  // === Provider Application Routes ===
  
  // Get current user's provider application

router.get("/api/admin/provider-applications", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getServiceProviderForms(status);
    res.json(forms);
  });

  // Admin: Get active platform service providers with their services

router.get("/api/admin/platform-service-providers", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { serviceProviderForms, providerServices, serviceCategories } = await import("@shared/schema");

    // Get approved provider forms
    const approvedForms = await db
      .select()
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.status, "approved"))
      .orderBy(sql`created_at desc`);

    // For each provider, fetch their services and user info
    const enriched = await Promise.all(approvedForms.map(async (form) => {
      const [providerUser] = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email, profileImageUrl: users.profileImageUrl })
        .from(users).where(eq(users.id, form.userId));

      const services = await db
        .select({
          id: providerServices.id,
          serviceName: providerServices.serviceName,
          serviceType: providerServices.serviceType,
          price: providerServices.price,
          priceType: providerServices.priceType,
          deliveryMethod: providerServices.deliveryMethod,
          status: providerServices.status,
          isFeatured: providerServices.isFeatured,
          bookingsCount: providerServices.bookingsCount,
          totalRevenue: providerServices.totalRevenue,
          averageRating: providerServices.averageRating,
          reviewCount: providerServices.reviewCount,
          location: providerServices.location,
          formStatus: providerServices.formStatus,
          categoryId: providerServices.categoryId,
        })
        .from(providerServices)
        .where(eq(providerServices.userId, form.userId))
        .orderBy(sql`bookings_count desc`);

      const totalBookings = services.reduce((s, sv) => s + (sv.bookingsCount ?? 0), 0);
      const totalRevenue = services.reduce((s, sv) => s + parseFloat(sv.totalRevenue ?? "0"), 0);
      const activeServices = services.filter(sv => sv.status === "active").length;

      return { ...form, user: providerUser ?? null, services, totalBookings, totalRevenue, activeServices };
    }));

    res.json(enriched);
  });

  // Admin: Update provider application status

router.patch("/api/admin/provider-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const updated = await storage.updateServiceProviderFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // If approved, update user role to service_provider
    if (status === "approved") {
      await db.update(users).set({ role: "service_provider" }).where(eq(users.id, updated.userId));
      // Notify the user to complete Stripe Connect setup
      await db.insert(notifications).values({
        userId: updated.userId,
        type: "application_approved",
        title: "Application Approved! 🎉",
        message: "Congratulations! Your provider application has been approved. Complete your Stripe Connect setup to start receiving payouts.",
        data: { link: "/provider/earnings" },
      });
    }
    
    res.json(updated);
  });

  // GET /api/expert/application-status — user-facing live step status for expert applicants

router.post("/api/admin/service-templates", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { title, description, suggestedPrice, sortOrder } = req.body;
      if (!title) {
        return res.status(400).json({ message: "title is required" });
      }
      // Resolve (or create) the canonical Itinerary Planning category
      let categoryRow = await db.select({ id: expertServiceCategories.id })
        .from(expertServiceCategories)
        .where(eq(expertServiceCategories.name, "Itinerary Planning"))
        .then(r => r[0]);
      if (!categoryRow) {
        const [inserted] = await db.insert(expertServiceCategories)
          .values({ name: "Itinerary Planning", isDefault: true, sortOrder: 1 })
          .returning({ id: expertServiceCategories.id });
        categoryRow = inserted;
      }
      const [esoRow] = await db.insert(expertServiceOfferings).values({
        categoryId:  categoryRow.id,
        name:        title,
        description: description ?? null,
        price:       suggestedPrice ?? "0",
        isDefault:   true,
        sortOrder:   sortOrder ?? 0,
      }).returning();
      // Return ServiceTemplate-compatible shape so existing admin UIs don't break
      res.status(201).json({
        id:               esoRow.id,
        title:            esoRow.name,
        description:      esoRow.description,
        categoryId:       null,
        serviceType:      null,
        deliveryMethod:   null,
        deliveryTimeframe: null,
        suggestedPrice:   esoRow.price,
        requirements:     null,
        whatIncluded:     null,
        isActive:         esoRow.isDefault ?? true,
        sortOrder:        esoRow.sortOrder,
        createdAt:        esoRow.createdAt,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Update template (admin only)

router.patch("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateServiceTemplate(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Delete template (admin only - soft delete)

router.delete("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceTemplate(req.params.id);
    res.status(204).send();
  });

  // === Admin Service Category Management ===

  // Get all categories with subcategories

router.get("/api/admin/categories", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const type = req.query.type as string | undefined;
    const categories = await storage.getServiceCategories(type);
    const subcategories = await storage.getAllServiceSubcategories();
    
    // Attach subcategories to each category
    const categoriesWithSubs = categories.map(cat => ({
      ...cat,
      subcategories: subcategories.filter(sub => sub.categoryId === cat.id)
    }));
    res.json(categoriesWithSubs);
  });

  // Get single category

router.get("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const category = await storage.getServiceCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    const subcategories = await storage.getServiceSubcategories(req.params.id);
    res.json({ ...category, subcategories });
  });

  // Create category (admin only)

router.post("/api/admin/categories", isAuthenticated, async (req, res) => {
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

  // Update category (admin only)

router.patch("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.partial().parse(req.body);
      const updated = await storage.updateServiceCategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  // Delete category (admin only)

router.delete("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceCategory(req.params.id);
    res.status(204).send();
  });

  // Create subcategory (admin only)

router.post("/api/admin/categories/:categoryId/subcategories", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const category = await storage.getServiceCategoryById(req.params.categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      const input = insertServiceSubcategorySchema.parse({ ...req.body, categoryId: req.params.categoryId });
      const subcategory = await storage.createServiceSubcategory(input);
      res.status(201).json(subcategory);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create subcategory" });
    }
  });

  // Update subcategory (admin only)

router.patch("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceSubcategorySchema.partial().parse(req.body);
      const updated = await storage.updateServiceSubcategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Subcategory not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update subcategory" });
    }
  });

  // Delete subcategory (admin only)

router.delete("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceSubcategory(req.params.id);
    res.status(204).send();
  });

  // Seed 15 core categories (admin only - run once)

router.post("/api/admin/seed-categories", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const coreCategories = [
      { name: "Photography & Videography", slug: "photography-videography", description: "Portrait, event, engagement, family, architectural photography and travel videos, drone footage", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["portfolio", "insurance"], priceRange: { min: 150, max: 1000 }, sortOrder: 1 },
      { name: "Transportation & Logistics", slug: "transportation-logistics", description: "Private drivers, airport transfers, day trips, specialty transport", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance", "vehicle_registration"], priceRange: { min: 50, max: 800 }, sortOrder: 2 },
      { name: "Food & Culinary", slug: "food-culinary", description: "Private chefs, cooking lessons, meal prep, sommelier services, food tours", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["culinary_credentials", "food_handler_license"], priceRange: { min: 100, max: 600 }, sortOrder: 3 },
      { name: "Childcare & Family", slug: "childcare-family", description: "Babysitters, nannies, kids activity coordinators, family assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "cpr_certification", "references"], priceRange: { min: 20, max: 150 }, sortOrder: 4 },
      { name: "Tours & Experiences", slug: "tours-experiences", description: "Tour guides, walking tours, museum tours, adventure guides, cultural experiences", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["tour_guide_license", "insurance"], priceRange: { min: 100, max: 500 }, sortOrder: 5 },
      { name: "Personal Assistance", slug: "personal-assistance", description: "Travel companions, personal concierge, executive assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "references", "first_aid"], priceRange: { min: 100, max: 300 }, sortOrder: 6 },
      { name: "TaskRabbit Services", slug: "taskrabbit-services", description: "Handyman, delivery, cleaning, property management", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 30, max: 200 }, sortOrder: 7 },
      { name: "Health & Wellness", slug: "health-wellness", description: "Fitness instructors, massage therapists, yoga teachers, wellness coaches", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["certification", "insurance"], priceRange: { min: 50, max: 200 }, sortOrder: 8 },
      { name: "Beauty & Styling", slug: "beauty-styling", description: "Hair stylists, makeup artists, personal stylists", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 75, max: 300 }, sortOrder: 9 },
      { name: "Pets & Animals", slug: "pets-animals", description: "Pet sitters, dog walkers, animal experience guides", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["references"], priceRange: { min: 25, max: 100 }, sortOrder: 10 },
      { name: "Events & Celebrations", slug: "events-celebrations", description: "Event coordinators, florists, bakers, party planners", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 1500 }, sortOrder: 11 },
      { name: "Technology & Connectivity", slug: "technology-connectivity", description: "Tech support, social media management, photography editing", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 50, max: 150 }, sortOrder: 12 },
      { name: "Language & Translation", slug: "language-translation", description: "Translators, interpreters, language tutors", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["certification", "references"], priceRange: { min: 50, max: 200 }, sortOrder: 13 },
      { name: "Specialty Services", slug: "specialty-services", description: "Wedding coordinators, relocation specialists, legal/visa assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 200, max: 2000 }, sortOrder: 14 },
      { name: "Custom / Other", slug: "custom-other", description: "Custom service requests, user-suggested categories", categoryType: "service_provider", verificationRequired: true, requiredDocuments: [], priceRange: { min: 0, max: 0 }, sortOrder: 15 },
      // New categories from comprehensive directory
      { name: "Lodging & Accommodation", slug: "lodging-accommodation", description: "Vacation rentals, B&Bs, homestays, glamping, houseboat rentals, room hosts", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["property_license", "insurance"], priceRange: { min: 50, max: 1000 }, sortOrder: 16 },
      { name: "Music & Performance", slug: "music-performance", description: "Live musicians, bands, DJs, string quartets, vocalists, ceremony musicians, music instructors", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 2000 }, sortOrder: 17 },
      { name: "Entertainment", slug: "entertainment", description: "Comedians, magicians, acrobats, fire performers, caricature artists, game coordinators, kids entertainers", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 1500 }, sortOrder: 18 },
      { name: "Floral & Decoration", slug: "floral-decoration", description: "Florists, floral designers, balloon artists, event stylists, backdrop designers, centerpiece designers", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 3000 }, sortOrder: 19 },
      { name: "Arts & Crafts Instruction", slug: "arts-crafts-instruction", description: "Painting, pottery, jewelry making, dance, calligraphy, woodworking, drawing, photography instruction", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio", "certification"], priceRange: { min: 50, max: 300 }, sortOrder: 20 },
      { name: "Companionship & Assistance", slug: "companionship-assistance", description: "Travel companions, local friends, shopping assistants, elderly and child travel companions, day-of coordinators", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "references"], priceRange: { min: 50, max: 400 }, sortOrder: 21 },
      { name: "Rental Services", slug: "rental-services", description: "Bicycle, car, scooter, boat, camping, beach equipment, sports equipment, costume and baby equipment rentals", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["insurance", "business_license"], priceRange: { min: 20, max: 500 }, sortOrder: 22 },
      { name: "Cultural & Educational", slug: "cultural-educational", description: "Cultural ambassadors, history lecturers, etiquette consultants, wedding officiants, archaeologist guides", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["credentials", "references"], priceRange: { min: 50, max: 500 }, sortOrder: 23 },
      { name: "Attire & Fashion", slug: "attire-fashion", description: "Wedding dress designers, tailors, tuxedo rental, wardrobe stylists, jewelry rental and accessories", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 50, max: 2000 }, sortOrder: 24 },
      { name: "Safety & Security", slug: "safety-security", description: "Personal security guards, safety consultants, first aid trainers, crowd control specialists", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "certification", "insurance"], priceRange: { min: 100, max: 500 }, sortOrder: 25 },
      { name: "Business & Professional", slug: "business-professional", description: "Notaries, legal consultants, real estate consultants, permit coordinators, immigration consultants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "credentials"], priceRange: { min: 100, max: 1000 }, sortOrder: 26 },
      { name: "Technical Services", slug: "technical-services", description: "Audio engineers, lighting technicians, sound systems, LED screen operators, projection mapping, visual effects", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 2000 }, sortOrder: 27 },
      { name: "Restaurants & Dining", slug: "restaurants-dining", description: "Restaurants, dining experiences, private dining, food and drink venues", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["business_license", "food_handler_license"], priceRange: { min: 20, max: 500 }, sortOrder: 28 },
    ];
    
    const created = [];
    for (const cat of coreCategories) {
      try {
        const existing = await storage.getServiceCategoryBySlug(cat.slug);
        if (!existing) {
          const newCat = await storage.createServiceCategory(cat as any);
          created.push(newCat);
        }
      } catch (err) {
        console.error(`Failed to create category ${cat.name}:`, err);
      }
    }
    
    res.json({ message: `Created ${created.length} categories`, categories: created });
  });

  // === Enhanced Expert Services Routes ===

  // Get all expert service categories with offerings (public)

router.get("/api/admin/custom-services/pending", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const services = await storage.getExpertCustomServicesByStatus("submitted");
    res.json(services);
  });

  // Admin: Approve custom service

router.post("/api/admin/custom-services/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const service = await storage.getExpertCustomServiceById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only approve submitted services" });
      }

      const approved = await storage.approveExpertCustomService(req.params.id, adminId);

      // Promote approved service to ESO (canonical catalog) if not already there
      try {
        const existing = await db.select({ id: expertServiceOfferings.id })
          .from(expertServiceOfferings)
          .where(eq(expertServiceOfferings.externalId, service.id))
          .then(r => r[0]);
        if (!existing) {
          let categoryRow = await db.select({ id: expertServiceCategories.id })
            .from(expertServiceCategories)
            .where(eq(expertServiceCategories.name, "Itinerary Planning"))
            .then(r => r[0]);
          if (!categoryRow) {
            const [ins] = await db.insert(expertServiceCategories)
              .values({ name: "Itinerary Planning", isDefault: true, sortOrder: 1 })
              .returning({ id: expertServiceCategories.id });
            categoryRow = ins;
          }
          const catId = (service as any).existingCategoryId ?? categoryRow.id;
          await db.insert(expertServiceOfferings).values({
            categoryId:   catId,
            name:         service.title,
            description:  service.description ?? null,
            price:        service.price,
            isDefault:    false,
            sortOrder:    400,
            expertId:     service.expertId,
            externalId:   service.id,
            status:       "approved",
            reviewedAt:   new Date(),
            reviewedBy:   adminId,
          });
        }
      } catch (esoErr) {
        console.warn("[ESO] Failed to promote approved custom service to ESO (non-fatal):", esoErr);
      }

      res.json(approved);
    } catch (err) {
      console.error("Error approving custom service:", err);
      res.status(500).json({ message: "Failed to approve custom service" });
    }
  });

  // Admin: Reject custom service

router.post("/api/admin/custom-services/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const service = await storage.getExpertCustomServiceById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only reject submitted services" });
      }

      const rejected = await storage.rejectExpertCustomService(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting custom service:", err);
      res.status(500).json({ message: "Failed to reject custom service" });
    }
  });

  // === Expert Templates (Income Streams) ===
  
  // Get all published templates (public)

router.get("/api/admin/destination-events/pending", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any).claims.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const events = await storage.getPendingDestinationEvents();
    res.json(events);
  });

  // Admin: Approve destination event

router.post("/api/admin/destination-events/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only approve pending events" });
      }

      const approved = await storage.approveDestinationEvent(req.params.id, adminId);
      res.json(approved);
    } catch (err) {
      console.error("Error approving destination event:", err);
      res.status(500).json({ message: "Failed to approve event" });
    }
  });

  // Admin: Reject destination event

router.post("/api/admin/destination-events/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any).claims.sub;
      const user = await db.select().from(users).where(eq(users.id, adminId)).then(r => r[0]);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only reject pending events" });
      }

      const rejected = await storage.rejectDestinationEvent(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting destination event:", err);
      res.status(500).json({ message: "Failed to reject event" });
    }
  });

  // Get single service by ID (public - for booking page)

router.get("/api/admin/data/location-summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { feverEventCache, hotelCache, activityCache, flightCache } = await import("@shared/schema");
      const { sql } = await import("drizzle-orm");
      
      // Get events by city
      const eventData = await db.select({
        cityCode: feverEventCache.cityCode,
        city: feverEventCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${feverEventCache.lastUpdated})`,
      })
      .from(feverEventCache)
      .groupBy(feverEventCache.cityCode, feverEventCache.city);

      // Get hotels by city
      const hotelData = await db.select({
        cityCode: hotelCache.cityCode,
        city: hotelCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${hotelCache.lastUpdated})`,
      })
      .from(hotelCache)
      .groupBy(hotelCache.cityCode, hotelCache.city);

      // Get activities by destination
      const activityData = await db.select({
        destination: activityCache.destination,
        city: activityCache.city,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${activityCache.lastUpdated})`,
      })
      .from(activityCache)
      .groupBy(activityCache.destination, activityCache.city);

      // Get flights by origin/destination
      const flightData = await db.select({
        origin: flightCache.originCode,
        destination: flightCache.destinationCode,
        count: sql<number>`count(*)::int`,
        lastUpdated: sql<string>`max(${flightCache.lastUpdated})`,
      })
      .from(flightCache)
      .groupBy(flightCache.originCode, flightCache.destinationCode);

      // Get totals
      const totals = {
        events: eventData.reduce((sum, e) => sum + e.count, 0),
        hotels: hotelData.reduce((sum, h) => sum + h.count, 0),
        activities: activityData.reduce((sum, a) => sum + a.count, 0),
        flights: flightData.reduce((sum, f) => sum + f.count, 0),
      };

      res.json({
        events: eventData,
        hotels: hotelData,
        activities: activityData,
        flights: flightData,
        totals,
      });
    } catch (error) {
      console.error("[Admin] Location summary error:", error);
      res.status(500).json({ error: "Failed to get location summary" });
    }
  });

  // Manually refresh all cities (admin only)

router.get("/api/admin/affiliate/reconciliation", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const partner = (req.query.partner as string) || undefined;
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }

      const { affiliateReconciliationService } = await import("../services/affiliate-reconciliation.service");
      const result = await affiliateReconciliationService.getReconciliationView(period, partner);
      res.json(result);
    } catch (error: any) {
      console.error("[Reconciliation] Error:", error);
      res.status(500).json({ message: "Failed to get reconciliation data", error: error.message });
    }
  });

  // Admin: Update reconciliation status for an earnings row

router.patch("/api/admin/affiliate/reconciliation/:earningId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { earningId } = req.params;
      const { status, notes, partnerReferenceId } = req.body;
      const validStatuses = ["unmatched", "matched", "disputed", "written_off"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const { affiliateReconciliationService } = await import("../services/affiliate-reconciliation.service");
      await affiliateReconciliationService.updateReconciliationStatus(earningId, status, notes, partnerReferenceId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Reconciliation] Update error:", error);
      res.status(500).json({ message: "Failed to update reconciliation status", error: error.message });
    }
  });

  // Get products for a specific location (for itinerary integration)

router.get("/api/admin/content/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const summary = await storage.getContentTrackingSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content summary", error: error.message });
    }
  });

  // Get all content registry entries (admin only)

router.get("/api/admin/content/registry", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { status, contentType, ownerId, flagged, limit, offset } = req.query;
      const content = await storage.getContentRegistry({
        status: status as string,
        contentType: contentType as string,
        ownerId: ownerId as string,
        flagged: flagged === 'true',
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content registry", error: error.message });
    }
  });

  // Get content by tracking number

router.get("/api/admin/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const content = await storage.getContentByTrackingNumber(trackingNumber);
      if (!content) {
        return res.status(404).json({ message: "Content not found" });
      }

      // Get related data
      const versions = await storage.getContentVersions(trackingNumber);
      const flags = await storage.getContentFlags(trackingNumber);
      const invoices = await storage.getInvoicesByTrackingNumber(trackingNumber);

      res.json({
        content,
        versions,
        flags,
        invoices,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content details", error: error.message });
    }
  });

  // Register new content (manual registration via API)

router.post("/api/admin/content/register", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { contentType, contentId, ownerId, title, description, status, metadata } = req.body;

      if (!contentType || !contentId) {
        return res.status(400).json({ message: "contentType and contentId are required" });
      }

      // Auto-generate tracking number for manual API registration
      const trackingNumber = await storage.generateTrackingNumber('TRV');

      const content = await storage.registerContent({
        trackingNumber,
        contentType,
        contentId,
        ownerId,
        title,
        description,
        status: status || 'published',
        metadata: metadata || {},
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to register content", error: error.message });
    }
  });

  // Get moderation queue (flagged content)

router.get("/api/admin/content/moderation/queue", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const queue = await storage.getModerationQueue();
      res.json(queue);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get moderation queue", error: error.message });
    }
  });

  // Moderate content

router.post("/api/admin/content/:trackingNumber/moderate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const { action, notes } = req.body;

      if (!['approve', 'suspend', 'delete'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be: approve, suspend, or delete" });
      }

      const result = await storage.moderateContent(
        trackingNumber,
        userId,
        action,
        notes
      );

      if (!result) {
        return res.status(404).json({ message: "Content not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to moderate content", error: error.message });
    }
  });

  // Flag content

router.get("/api/admin/content/flags/pending", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const flags = await storage.getPendingFlags();
      res.json(flags);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pending flags", error: error.message });
    }
  });

  // Resolve flag (admin only)

router.post("/api/admin/content/flags/:flagId/resolve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { flagId } = req.params;
      const { resolution } = req.body;

      if (!resolution) {
        return res.status(400).json({ message: "resolution is required" });
      }

      const result = await storage.resolveFlag(flagId, userId, resolution);
      if (!result) {
        return res.status(404).json({ message: "Flag not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to resolve flag", error: error.message });
    }
  });

  // ============================================================
  // ADMIN SERVICES REGISTRY
  // ============================================================


router.get("/api/admin/services/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const all = await storage.getAllProviderServices();
      const byStatus: Record<string, number> = {};
      let totalRevenue = 0;
      let totalBookings = 0;
      let featuredCount = 0;
      for (const s of all) {
        const sKey = s.status ?? "unknown";
        byStatus[sKey] = (byStatus[sKey] || 0) + 1;
        totalRevenue += parseFloat(s.totalRevenue ?? "0");
        totalBookings += s.bookingsCount ?? 0;
        if (s.isFeatured) featuredCount++;
      }
      res.json({
        total: all.length,
        byStatus,
        totalRevenue,
        totalBookings,
        featuredCount,
        averageRating: all.length > 0
          ? all.reduce((sum, s) => sum + parseFloat(s.averageRating ?? "0"), 0) / all.filter(s => s.averageRating).length
          : 0,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch services summary", error: err.message });
    }
  });


router.get("/api/admin/services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { status, search, category } = req.query;
      const all = await storage.getAllProviderServices();

      const providerIds = Array.from(new Set(all.map(s => s.userId)));
      const providerRows = providerIds.length > 0
        ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users).where(inArray(users.id, providerIds))
        : [];
      const providerMap = Object.fromEntries(providerRows.map(p => [p.id, p]));

      let services = all.map(s => ({
        ...s,
        providerName: providerMap[s.userId]
          ? `${providerMap[s.userId].firstName ?? ""} ${providerMap[s.userId].lastName ?? ""}`.trim() || providerMap[s.userId].email
          : "Unknown",
        providerEmail: providerMap[s.userId]?.email,
      }));

      if (status && status !== "all") services = services.filter(s => s.status === status);
      if (category && category !== "all") services = services.filter(s => s.categoryId === category);
      if (search) {
        const q = (search as string).toLowerCase();
        services = services.filter(s =>
          s.serviceName.toLowerCase().includes(q) ||
          (s.providerName as string).toLowerCase().includes(q) ||
          s.trackingNumber?.toLowerCase().includes(q) ||
          s.location?.toLowerCase().includes(q)
        );
      }

      services.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      res.json(services);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch services", error: err.message });
    }
  });


router.patch("/api/admin/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { status } = req.body;
      if (!["active", "paused", "draft", "suspended"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const [updated] = await db.update(providerServices)
        .set({ status, updatedAt: new Date() })
        .where(eq(providerServices.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update service status", error: err.message });
    }
  });


router.patch("/api/admin/services/:id/featured", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { isFeatured } = req.body;
      const [updated] = await db.update(providerServices)
        .set({ isFeatured: Boolean(isFeatured), updatedAt: new Date() })
        .where(eq(providerServices.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update featured status", error: err.message });
    }
  });


router.delete("/api/admin/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const [row] = await db.select().from(providerServices).where(eq(providerServices.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ message: "Service not found" });
      await db.delete(providerServices).where(eq(providerServices.id, req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete service", error: err.message });
    }
  });

  // === Content Invoices API ===

  // Create invoice for content

router.post("/api/admin/invoices", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber, customerId, providerId, invoiceType, amount, currency, taxAmount, discountAmount, notes, dueDate } = req.body;

      if (!trackingNumber || !invoiceType || !amount) {
        return res.status(400).json({ message: "trackingNumber, invoiceType, and amount are required" });
      }

      const totalAmount = amount + (taxAmount || 0) - (discountAmount || 0);

      const invoice = await storage.createContentInvoice({
        invoiceNumber: `INV-${trackingNumber}`,
        trackingNumber,
        customerId,
        providerId,
        invoiceType,
        amount,
        currency: currency || 'USD',
        taxAmount: taxAmount || 0,
        discountAmount: discountAmount || 0,
        totalAmount,
        notes,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create invoice", error: error.message });
    }
  });

  // Get invoice by number

router.get("/api/admin/invoices/:invoiceNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const invoice = await storage.getContentInvoice(invoiceNumber);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoice", error: error.message });
    }
  });

  // Update invoice status

router.patch("/api/admin/invoices/:invoiceNumber/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const { status, paymentReference } = req.body;

      if (!status) {
        return res.status(400).json({ message: "status is required" });
      }

      const result = await storage.updateInvoiceStatus(invoiceNumber, status, paymentReference);
      if (!result) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update invoice status", error: error.message });
    }
  });

  // Get invoices by customer

router.get("/api/admin/ai-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const summary = await aiUsageService.getSummary(start, end);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage summary", error: error.message });
    }
  });

  // Get daily AI usage for charts

router.get("/api/admin/ai-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const dailyUsage = await aiUsageService.getDailyUsage(days);
      res.json(dailyUsage);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily AI usage", error: error.message });
    }
  });

  // Get recent AI usage logs

router.get("/api/admin/ai-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await aiUsageService.getRecentLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage logs", error: error.message });
    }
  });

  // Get AI pricing info

router.get("/api/admin/ai-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      res.json({
        providers: {
          grok: {
            models: {
              'grok-2': { input: 200, output: 1000 },
              'grok-2-vision': { input: 200, output: 1000 },
              'grok-4': { input: 300, output: 1500 },
              'grok-4.1-fast': { input: 20, output: 50 },
            },
            note: "Prices in cents per 1M tokens"
          },
          anthropic: {
            models: {
              'claude-3-sonnet': { input: 300, output: 1500 },
              'claude-3-opus': { input: 1500, output: 7500 },
            },
            note: "Prices in cents per 1M tokens"
          }
        },
        lastUpdated: "2026-01-27"
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pricing info", error: error.message });
    }
  });

  // External API Usage Tracking (Amadeus, etc.)

router.get("/api/admin/api-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const summary = await apiUsageService.getUsageSummary(30);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage summary", error: error.message });
    }
  });


router.get("/api/admin/api-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const daily = await apiUsageService.getDailyUsage(30);
      res.json(daily);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily API usage", error: error.message });
    }
  });


router.get("/api/admin/api-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const logs = await apiUsageService.getRecentLogs(100);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage logs", error: error.message });
    }
  });


router.get("/api/admin/api-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const pricing = apiUsageService.getPricingInfo();
      res.json(pricing);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API pricing info", error: error.message });
    }
  });

  // === Revenue Tracking Endpoints ===

  // Admin unified revenue dashboard

router.get("/api/admin/revenue/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const dashboard = await revenueTrackingService.getUnifiedDashboard();
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue dashboard", error: error.message });
    }
  });

  // Platform revenue summary with filters

router.get("/api/admin/revenue/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      
      const summary = await storage.getPlatformRevenueSummary(startDate, endDate);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue summary", error: error.message });
    }
  });

  // Platform revenue transactions list

router.get("/api/admin/revenue/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      const sourceType = req.query.sourceType ? String(req.query.sourceType) : undefined;
      
      const transactions = await storage.getPlatformRevenue({ startDate, endDate, sourceType });
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue transactions", error: error.message });
    }
  });

  // Revenue report by content tracking number

router.get("/api/admin/revenue/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const report = await revenueTrackingService.getContentRevenueReport(req.params.trackingNumber);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content revenue report", error: error.message });
    }
  });

  // Unified revenue endpoint — fans out to all affiliate/payment streams in parallel

router.get("/api/admin/revenue/unified", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }

      const [
        { getTravelpayoutsStatistics },
        { getViatorCommissions },
        { getFeverCommissions },
        { getBookingComCommissions },
        { getApiCostsSummary },
      ] = await Promise.all([
        import("../services/travelpayouts/statistics.service"),
        import("../services/viator-commissions.service"),
        import("../services/fever-commissions.service"),
        import("../services/booking-com-commissions.service"),
        import("../services/api-costs.service"),
      ]);

      // Compute period-specific date bounds for Stripe query
      const now = new Date();
      const periodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            end: now,
          };
        }
        // this_month
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now,
        };
      })();

      // Comparison (prior) period bounds for MoM badge
      const priorPeriodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
            end: new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          };
        }
        // this_month → compare against last calendar month
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
        };
      })();

      const [travelpayouts, viator, fever, bookingCom, apiCosts, stripePeriodSummary, stripePriorSummary] = await Promise.all([
        getTravelpayoutsStatistics(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD", balance: 0, byPartner: [] })),
        getViatorCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getFeverCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getBookingComCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getApiCostsSummary(period).catch(() => ({ entries: [], totalCostDollars: 0 })),
        // Fetch period-accurate Stripe total directly from DB
        storage.getPlatformRevenueSummary(periodBounds.start, periodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
        // Fetch prior period for MoM comparison
        storage.getPlatformRevenueSummary(priorPeriodBounds.start, priorPeriodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
      ]);

      const stripeThisMonth = stripePeriodSummary.totalPlatformFee;
      const stripeLastMonth = stripePriorSummary.totalPlatformFee;
      // Use period-accurate DB query result (not all-time totalRevenue)
      const stripeTotal = stripePeriodSummary.totalPlatformFee;
      const stripeGrowthPercent = stripeLastMonth > 0
        ? Math.round(((stripeThisMonth - stripeLastMonth) / stripeLastMonth) * 1000) / 10
        : 0;

      // Use only reconciliation-confirmed affiliate totals when available
      let confirmedAffiliateTotal = 0;
      try {
        const { affiliateReconciliationService } = await import("../services/affiliate-reconciliation.service");
        confirmedAffiliateTotal = await affiliateReconciliationService.getConfirmedAffiliateTotal(
          periodBounds.start,
          periodBounds.end
        );
      } catch (_) { /* ignore — fallback to raw totals */ }

      const rawAffiliateRevenue =
        (travelpayouts.total || 0) +
        (viator.total || 0) +
        (fever.total || 0) +
        (bookingCom.total || 0);

      // Always use confirmed (matched) totals; raw affiliate numbers are for context only.
      // If reconciliation has never run, confirmed will be 0 — that is the correct conservative figure.
      const totalAffiliateRevenue = confirmedAffiliateTotal;

      const totalNetRevenue = stripeTotal + totalAffiliateRevenue - apiCosts.totalCostDollars;

      res.json({
        period,
        totalNetRevenue,
        stripe: {
          configured: true,
          thisMonth: stripeThisMonth,
          lastMonth: stripeLastMonth,
          total: stripeTotal,
          currency: "USD",
          growthPercent: stripeGrowthPercent,
        },
        travelpayouts,
        viator,
        fever,
        bookingCom,
        apiCosts,
      });
    } catch (error: any) {
      console.error("[UnifiedRevenue] Error:", error);
      res.status(500).json({ message: "Failed to get unified revenue data", error: error.message });
    }
  });

  // Admin unified revenue export (CSV or PDF)

router.get("/api/admin/revenue/unified/export", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const format = ((req.query.format as string) || "csv").toLowerCase();
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }
      if (!["csv", "pdf"].includes(format)) {
        return res.status(400).json({ message: "Invalid format. Use: csv, pdf" });
      }

      const [
        { getTravelpayoutsStatistics },
        { getViatorCommissions },
        { getFeverCommissions },
        { getBookingComCommissions },
        { getApiCostsSummary },
        { revenueTrackingService },
      ] = await Promise.all([
        import("../services/travelpayouts/statistics.service"),
        import("../services/viator-commissions.service"),
        import("../services/fever-commissions.service"),
        import("../services/booking-com-commissions.service"),
        import("../services/api-costs.service"),
        import("../services/revenue-tracking.service"),
      ]);

      const now = new Date();
      const periodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            end: now,
          };
        }
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now,
        };
      })();

      const [stripe, travelpayouts, viator, fever, bookingCom, apiCosts, stripePeriodSummary, transactions] = await Promise.all([
        revenueTrackingService.getUnifiedDashboard().catch(() => null),
        getTravelpayoutsStatistics(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD", balance: 0, byPartner: [] })),
        getViatorCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getFeverCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getBookingComCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getApiCostsSummary(period).catch(() => ({ entries: [], totalCostDollars: 0 })),
        storage.getPlatformRevenueSummary(periodBounds.start, periodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
        storage.getPlatformRevenue({ startDate: periodBounds.start, endDate: periodBounds.end }).catch(() => []),
      ]);

      const stripeTotal = stripePeriodSummary.totalPlatformFee;
      const totalAffiliateRevenue = (travelpayouts.total || 0) + (viator.total || 0) + (fever.total || 0) + (bookingCom.total || 0);
      const totalNetRevenue = stripeTotal + totalAffiliateRevenue - apiCosts.totalCostDollars;

      const periodLabel = period === "last_month" ? "Last Month" : period === "last_90_days" ? "Last 90 Days" : "This Month";
      const exportedAt = now.toISOString();
      const fmt = (n: number) => n.toFixed(2);

      if (format === "csv") {
        const rows: string[] = [];
        const addRow = (...cols: (string | number)[]) => rows.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));
        const addBlank = () => rows.push("");
        const addHeader = (title: string) => { addBlank(); addRow(title); };

        addRow("Traveloure - Unified Revenue Export");
        addRow(`Period: ${periodLabel}`);
        addRow(`Exported: ${exportedAt}`);

        addHeader("REVENUE STREAM TOTALS");
        addRow("Stream", "This Month (USD)", "Last Month (USD)", "Period Total (USD)");
        addRow("Stripe (Platform Fees)", fmt(stripe?.platform?.thisMonth || 0), fmt(stripe?.platform?.lastMonth || 0), fmt(stripeTotal));
        addRow("Travelpayouts", fmt(travelpayouts.thisMonth || 0), fmt(travelpayouts.lastMonth || 0), fmt(travelpayouts.total || 0));
        addRow("Viator", fmt(viator.thisMonth || 0), fmt(viator.lastMonth || 0), fmt(viator.total || 0));
        addRow("Fever", fmt(fever.thisMonth || 0), fmt(fever.lastMonth || 0), fmt(fever.total || 0));
        addRow("Booking.com", fmt(bookingCom.thisMonth || 0), fmt(bookingCom.lastMonth || 0), fmt(bookingCom.total || 0));
        addRow("API Costs (deducted)", "", "", `-${fmt(apiCosts.totalCostDollars)}`);
        addRow("NET REVENUE", "", "", fmt(totalNetRevenue));

        if ((travelpayouts as any).byPartner?.length) {
          addHeader("TRAVELPAYOUTS PARTNER BREAKDOWN");
          addRow("Partner", "This Month (USD)", "Last Month (USD)", "Period Total (USD)");
          for (const p of (travelpayouts as any).byPartner) {
            addRow(p.partnerLabel || p.partner, fmt(p.thisMonth || 0), fmt(p.lastMonth || 0), fmt(p.total || 0));
          }
        }

        if (apiCosts.entries?.length) {
          addHeader("API COST BREAKDOWN");
          addRow("Provider", "API Calls", "Cost (USD)");
          for (const e of apiCosts.entries) {
            addRow(e.provider, e.calls, fmt(e.costDollars));
          }
          addRow("TOTAL API COSTS", "", fmt(apiCosts.totalCostDollars));
        }

        if (Array.isArray(transactions) && transactions.length) {
          addHeader("RECENT TRANSACTIONS");
          addRow("Date", "Source Type", "Gross Amount (USD)", "Platform Fee (USD)", "Tracking #");
          for (const tx of transactions) {
            addRow(
              new Date((tx as any).date).toLocaleDateString("en-US"),
              tx.sourceType || "",
              fmt(Number(tx.grossAmount) || 0),
              fmt(Number(tx.platformFee) || 0),
              tx.trackingNumber || ""
            );
          }
        }

        const csvContent = rows.join("\r\n");
        const filename = `traveloure-revenue-${period}-${now.toISOString().slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send("\uFEFF" + csvContent); // BOM for Excel UTF-8
      }

      // PDF: generate a real PDF using pdfkit
      const PDFDocument = (await import("pdfkit")).default;
      const periodTransactions = Array.isArray(transactions) ? transactions : [];

      const filename = `traveloure-revenue-${period}-${now.toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);

      const COL_GRAY = "#6b7280";
      const COL_GREEN = "#16a34a";
      const COL_BLACK = "#111827";
      const COL_HEADER_BG = "#f3f4f6";

      // Helper: sanitize string for PDF output (strip control chars)
      const safe = (v: unknown) => String(v ?? "").replace(/[\x00-\x1F\x7F]/g, " ").slice(0, 200);

      // Title
      doc.fontSize(18).fillColor(COL_BLACK).font("Helvetica-Bold").text("Traveloure – Unified Revenue Report");
      doc.fontSize(10).fillColor(COL_GRAY).font("Helvetica").text(`Period: ${periodLabel}   |   Exported: ${exportedAt}`);
      doc.moveDown(0.5);

      // Net Revenue highlight
      doc.fontSize(13).fillColor(COL_GREEN).font("Helvetica-Bold").text(`Net Revenue: $${fmt(totalNetRevenue)} USD`);
      doc.moveDown(1);

      // Helper: draw a simple table
      const drawTable = (headers: string[], colWidths: number[], rows: (string | number)[][], highlightLast = false) => {
        const startX = doc.page.margins.left;
        const rowH = 18;
        let y = doc.y;

        // Header row
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COL_BLACK);
        let x = startX;
        headers.forEach((h, i) => {
          doc.rect(x, y, colWidths[i], rowH).fill(COL_HEADER_BG).stroke("#d1d5db");
          doc.fillColor(COL_BLACK).text(h, x + 4, y + 4, { width: colWidths[i] - 8, lineBreak: false });
          x += colWidths[i];
        });
        y += rowH;

        // Data rows
        doc.font("Helvetica").fontSize(9);
        rows.forEach((row, ri) => {
          if (y + rowH > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          const isLast = highlightLast && ri === rows.length - 1;
          x = startX;
          row.forEach((cell, ci) => {
            doc.rect(x, y, colWidths[ci], rowH).fill(isLast ? "#f9fafb" : "#ffffff").stroke("#e5e7eb");
            doc.font(isLast ? "Helvetica-Bold" : "Helvetica").fillColor(COL_BLACK)
              .text(safe(cell), x + 4, y + 4, { width: colWidths[ci] - 8, lineBreak: false });
            x += colWidths[ci];
          });
          y += rowH;
        });
        doc.y = y;
        doc.moveDown(1);
      };

      // Revenue Streams
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("Revenue Stream Totals");
      doc.moveDown(0.3);
      drawTable(
        ["Stream", "This Month", "Last Month", "Period Total"],
        [210, 100, 100, 100],
        [
          ["Stripe (Platform Fees)", `$${fmt(stripe?.platform?.thisMonth || 0)}`, `$${fmt(stripe?.platform?.lastMonth || 0)}`, `$${fmt(stripeTotal)}`],
          ["Travelpayouts", `$${fmt(travelpayouts.thisMonth || 0)}`, `$${fmt(travelpayouts.lastMonth || 0)}`, `$${fmt(travelpayouts.total || 0)}`],
          ["Viator", `$${fmt(viator.thisMonth || 0)}`, `$${fmt(viator.lastMonth || 0)}`, `$${fmt(viator.total || 0)}`],
          ["Fever", `$${fmt(fever.thisMonth || 0)}`, `$${fmt(fever.lastMonth || 0)}`, `$${fmt(fever.total || 0)}`],
          ["Booking.com", `$${fmt(bookingCom.thisMonth || 0)}`, `$${fmt(bookingCom.lastMonth || 0)}`, `$${fmt(bookingCom.total || 0)}`],
          ["API Costs (deducted)", "", "", `-$${fmt(apiCosts.totalCostDollars)}`],
          ["NET REVENUE", "", "", `$${fmt(totalNetRevenue)}`],
        ],
        true
      );

      // Travelpayouts partner breakdown
      const partners = (travelpayouts as any).byPartner ?? [];
      if (partners.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("Travelpayouts Partner Breakdown");
        doc.moveDown(0.3);
        drawTable(
          ["Partner", "This Month", "Last Month", "Period Total"],
          [210, 100, 100, 100],
          partners.map((p: any) => [
            safe(p.partnerLabel || p.partner),
            `$${fmt(p.thisMonth || 0)}`,
            `$${fmt(p.lastMonth || 0)}`,
            `$${fmt(p.total || 0)}`,
          ])
        );
      }

      // API costs breakdown
      if (apiCosts.entries?.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("API Cost Breakdown");
        doc.moveDown(0.3);
        drawTable(
          ["Provider", "API Calls", "Cost (USD)"],
          [240, 130, 130],
          [
            ...apiCosts.entries.map((e: any) => [safe(e.provider), String(e.calls), `$${fmt(e.costDollars)}`]),
            ["TOTAL API COSTS", "", `$${fmt(apiCosts.totalCostDollars)}`],
          ],
          true
        );
      }

      // Transactions
      if (periodTransactions.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text(`Transactions (${periodTransactions.length})`);
        doc.moveDown(0.3);
        drawTable(
          ["Date", "Source Type", "Gross Amount", "Platform Fee", "Tracking #"],
          [80, 140, 90, 90, 110],
          periodTransactions.map((tx: any) => [
            new Date(tx.date).toLocaleDateString("en-US"),
            safe(tx.sourceType),
            `$${fmt(tx.grossAmount || 0)}`,
            `$${fmt(tx.platformFee || 0)}`,
            safe(tx.trackingNumber || ""),
          ])
        );
      }

      doc.end();
      return;
    } catch (error: any) {
      console.error("[RevenueExport] Error:", error);
      res.status(500).json({ message: "Failed to export revenue data", error: error.message });
    }
  });

  // Provider earnings endpoints
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings

router.get("/api/admin/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const status = req.query.status as string | undefined;
      const validStatuses = ['pending', 'processing', 'approved', 'completed', 'failed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status filter" });
      }
      const [expertPayouts, providerPayouts] = await Promise.all([
        storage.getAllExpertPayouts(status),
        storage.getAllProviderPayouts(status),
      ]);
      const allPayouts = [
        ...expertPayouts.map(p => ({ ...p, requesterType: 'expert' as const })),
        ...providerPayouts.map(p => ({ ...p, requesterType: 'provider' as const })),
      ].sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      res.json(allPayouts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get payouts", error: error.message });
    }
  });


router.patch("/api/admin/payouts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { id } = req.params;
      const { status, notes, transactionId, payoutReference, requesterType } = req.body;
      const validStatuses = ['processing', 'completed', 'failed'];
      const validTypes = ['expert', 'provider'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: processing, completed, failed" });
      }
      if (!requesterType || !validTypes.includes(requesterType)) {
        return res.status(400).json({ error: "Invalid requesterType. Must be 'expert' or 'provider'" });
      }
      let updated;
      if (status === 'completed') {
        const recipientId = requesterType === 'expert'
          ? (await db.select({ expertId: expertPayouts.expertId }).from(expertPayouts).where(eq(expertPayouts.id, id)))[0]?.expertId
          : (await db.select({ providerId: providerPayouts.providerId }).from(providerPayouts).where(eq(providerPayouts.id, id)))[0]?.providerId;

        if (!recipientId) {
          return res.status(404).json({ error: "Payout not found" });
        }

        const recipientStripe = await storage.getUserStripeAccount(recipientId);

        if (recipientStripe.stripeAccountId && recipientStripe.canReceivePayments) {
          const { stripeConnectService } = await import('../services/stripe-connect.service');
          const payoutAmount = requesterType === 'expert'
            ? (await db.select({ amount: expertPayouts.amount }).from(expertPayouts).where(eq(expertPayouts.id, id)))[0]?.amount
            : (await db.select({ amount: providerPayouts.amount }).from(providerPayouts).where(eq(providerPayouts.id, id)))[0]?.amount;

          const payoutAmountNum = parseFloat(payoutAmount || '0');

          // Check platform balance before initiating transfer
          try {
            const platformBalance = await stripeConnectService.getAccountBalance();
            if (platformBalance.available < payoutAmountNum) {
              return res.status(402).json({
                error: `Insufficient platform balance. Available: $${platformBalance.available.toFixed(2)}, Required: $${payoutAmountNum.toFixed(2)}`,
                platformAvailable: platformBalance.available,
                required: payoutAmountNum,
              });
            }
          } catch (balanceError: any) {
            console.error('Failed to check platform balance:', balanceError);
            return res.status(500).json({ error: "Failed to check platform balance before transfer" });
          }

          try {
            const transfer = await stripeConnectService.createTransfer(
              payoutAmountNum,
              'usd',
              recipientStripe.stripeAccountId,
              `Traveloure ${requesterType} payout`,
              { payoutId: id, requesterType, recipientId }
            );

            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'completed', notes, transfer.transferId);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'completed', notes, transfer.transferId);
            }

            // Send in-app notification to the recipient
            try {
              await storage.createNotification({
                userId: recipientId,
                type: 'payout_processed',
                title: 'Payout Processed',
                message: `Your payout of $${payoutAmountNum.toFixed(2)} has been processed and is on its way to your Stripe account.`,
                data: { payoutId: id, amount: payoutAmountNum, transferId: transfer.transferId },
              });
            } catch (notifError) {
              console.error('Failed to send payout notification:', notifError);
            }
          } catch (stripeError: any) {
            console.error('Stripe transfer failed:', stripeError);
            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            }
            return res.json({ ...updated, stripeError: stripeError.message });
          }
        } else {
          return res.status(400).json({
            error: "Recipient does not have an active Stripe Connect account. They must complete onboarding first.",
            recipientId,
            hasStripeAccount: !!recipientStripe.stripeAccountId,
            canReceivePayments: recipientStripe.canReceivePayments,
          });
        }
      } else {
        if (requesterType === 'expert') {
          updated = await storage.updateExpertPayoutStatus(id, status, notes, transactionId);
        } else {
          updated = await storage.updateProviderPayoutStatus(id, status, notes, payoutReference);
        }
      }
      if (!updated) {
        return res.status(404).json({ error: "Payout not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update payout", error: error.message });
    }
  });

  // === Logistics: Temporal Anchors ===


router.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      const role = req.query.role as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      let conditions: any[] = [];
      if (search) {
        conditions.push(
          or(
            like(users.email, `%${search}%`),
            like(users.firstName, `%${search}%`),
            like(users.lastName, `%${search}%`)
          )
        );
      }
      if (role) {
        conditions.push(eq(users.role, role));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const allUsers = await db.select().from(users).where(whereClause).limit(limit).offset(offset).orderBy(desc(users.createdAt));
      const [totalResult] = await db.select({ count: count() }).from(users).where(whereClause);

      const enrichedUsers = await Promise.all(allUsers.map(async (u) => {
        const userTrips = await db.select({ count: count() }).from(trips).where(eq(trips.userId, u.id));
        const userBookings = await db.select().from(serviceBookings).where(eq(serviceBookings.travelerId, u.id));
        const totalSpent = userBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        return {
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          email: u.email || "",
          role: u.role || "user",
          status: "active",
          joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
          trips: userTrips[0]?.count || 0,
          spent: `$${totalSpent.toLocaleString()}`,
        };
      }));

      res.json({
        users: enrichedUsers,
        total: totalResult?.count || 0,
        page,
        limit,
      });
    } catch (err) {
      console.error("Admin users error:", err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // === Admin Trips/Plans Management ===

router.get("/api/admin/trips", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      const status = req.query.status as string | undefined;

      let conditions: any[] = [];
      if (search) {
        conditions.push(
          or(
            like(trips.title, `%${search}%`),
            like(trips.destination, `%${search}%`)
          )
        );
      }
      if (status) {
        conditions.push(eq(trips.status, status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const allTrips = await db.select().from(trips).where(whereClause).orderBy(desc(trips.createdAt)).limit(100);

      const enrichedTrips = await Promise.all(allTrips.map(async (t) => {
        const owner = await storage.getUser(t.userId || '');
        return {
          id: t.id,
          title: t.title || "Untitled Trip",
          type: t.eventType || "Travel",
          destination: t.destination || "TBD",
          startDate: t.startDate,
          endDate: t.endDate,
          guests: t.numberOfTravelers || 1,
          budget: t.budget ? `$${Number(t.budget).toLocaleString()}` : "N/A",
          status: t.status || "draft",
          user: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email : "Unknown",
          created: t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
        };
      }));

      const statusCounts = {
        total: enrichedTrips.length,
        active: enrichedTrips.filter(t => t.status === "planning" || t.status === "confirmed").length,
        pending: enrichedTrips.filter(t => t.status === "draft").length,
        completed: enrichedTrips.filter(t => t.status === "completed").length,
      };

      res.json({ trips: enrichedTrips, stats: statusCounts });
    } catch (err) {
      console.error("Admin trips error:", err);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  // === Admin Analytics Overview ===

router.get("/api/admin/analytics/overview", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await db.select().from(users);
      const allBookings = await storage.getServiceBookings({});
      const allTrips = await db.select().from(trips);
      const allReviews = await db.select().from(serviceReviews);

      const totalUsers = allUsers.length;
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);

      const destCounts: Record<string, { bookings: number; revenue: number }> = {};
      allTrips.forEach(t => {
        const dest = t.destination || "Unknown";
        if (!destCounts[dest]) destCounts[dest] = { bookings: 0, revenue: 0 };
        destCounts[dest].bookings++;
        destCounts[dest].revenue += Number(t.budget || 0);
      });
      const topDestinations = Object.entries(destCounts)
        .map(([name, data]) => ({ name, bookings: data.bookings, revenue: `$${data.revenue.toLocaleString()}` }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5);

      const roleCounts: Record<string, number> = {};
      allUsers.forEach(u => {
        const role = u.role || "user";
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
      const userDemographics = Object.entries(roleCounts)
        .map(([segment, count]) => ({
          segment: segment.charAt(0).toUpperCase() + segment.slice(1) + "s",
          percentage: Math.round((count / totalUsers) * 100),
        }))
        .sort((a, b) => b.percentage - a.percentage);

      const now = new Date();
      const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weeklyActivity = weekDays.map((day, i) => {
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() - (now.getDay() - i));
        const dayUsers = allUsers.filter(u => {
          if (!u.createdAt) return false;
          const d = new Date(u.createdAt);
          return d.toDateString() === dayDate.toDateString();
        }).length;
        return { day, users: dayUsers };
      });

      const avgRating = allReviews.length > 0
        ? allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length
        : 0;

      res.json({
        metrics: [
          { label: "Total Users", value: totalUsers.toLocaleString(), change: `+${allUsers.filter(u => { const d = u.createdAt ? new Date(u.createdAt) : null; return d && d > new Date(now.getTime() - 30*24*60*60*1000); }).length} this month`, positive: true },
          { label: "Total Bookings", value: allBookings.length.toLocaleString(), change: `${completedBookings.length} completed`, positive: true },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, change: `${allBookings.filter(b => b.status === "pending").length} pending`, positive: true },
          { label: "Avg Rating", value: avgRating.toFixed(1), change: `${allReviews.length} reviews`, positive: avgRating >= 4.0 },
        ],
        topDestinations,
        userDemographics,
        weeklyActivity,
      });
    } catch (err) {
      console.error("Admin analytics error:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Country/Region Analytics

router.get("/api/admin/analytics/by-country", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get experts by country
      const expertsByCountry = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
        pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`);

      // Get providers by country (from serviceProviderForms)
      const { serviceProviderForms } = await import("@shared/schema");
      const providersByCountry = await db.select({
        country: serviceProviderForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
        pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.country)
      .orderBy(sql`count(*) desc`);

      // Get trips by destination country (extract country from destination string)
      const tripsByDestination = await db.select({
        destination: trips.destination,
        count: sql<number>`count(*)::int`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      // Get bookings summary
      const allBookings = await storage.getServiceBookings({});
      const bookingsByStatus = {
        total: allBookings.length,
        completed: allBookings.filter(b => b.status === "completed").length,
        pending: allBookings.filter(b => b.status === "pending").length,
        cancelled: allBookings.filter(b => b.status === "cancelled").length,
      };

      res.json({
        expertsByCountry: expertsByCountry.map(e => ({
          country: e.country || "Unknown",
          total: e.count,
          approved: e.approved || 0,
          pending: e.pending || 0,
        })),
        providersByCountry: providersByCountry.map(p => ({
          country: p.country || "Unknown",
          total: p.count,
          approved: p.approved || 0,
          pending: p.pending || 0,
        })),
        tripsByDestination: tripsByDestination.map(t => ({
          destination: t.destination || "Unknown",
          count: t.count,
        })),
        bookingsSummary: bookingsByStatus,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Country analytics error:", err);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  // Expert Analytics - detailed breakdown

router.get("/api/admin/analytics/experts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Experts by country
      const byCountry = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`);

      // Experts by city
      const byCity = await db.select({
        city: localExpertForms.city,
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.city, localExpertForms.country)
      .orderBy(sql`count(*) desc`)
      .limit(15);

      // Expert application status summary
      const statusSummary = await db.select({
        status: localExpertForms.status,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .groupBy(localExpertForms.status);

      // Experts by experience level
      const byExperience = await db.select({
        years: localExpertForms.yearsOfExperience,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.yearsOfExperience)
      .orderBy(sql`count(*) desc`);

      res.json({
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        byCity: byCity.map(c => ({
          city: c.city || "Unknown",
          country: c.country || "",
          count: c.count,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        byExperience: byExperience.map(e => ({
          years: e.years || "Unknown",
          count: e.count,
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Expert analytics error:", err);
      res.status(500).json({ message: "Failed to fetch expert analytics" });
    }
  });

  // Provider Analytics - detailed breakdown

router.get("/api/admin/analytics/providers", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceProviderForms, providerServices, serviceBookings } = await import("@shared/schema");

      // Providers by business type
      const byBusinessType = await db.select({
        businessType: serviceProviderForms.businessType,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.businessType)
      .orderBy(sql`count(*) desc`);

      // Providers by country
      const byCountry = await db.select({
        country: serviceProviderForms.country,
        count: sql<number>`count(*)::int`,
        approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.country)
      .orderBy(sql`count(*) desc`);

      // Provider application status summary
      const statusSummary = await db.select({
        status: serviceProviderForms.status,
        count: sql<number>`count(*)::int`,
      })
      .from(serviceProviderForms)
      .groupBy(serviceProviderForms.status);

      // Active services count
      const activeServices = await db.select({
        count: sql<number>`count(*)::int`,
      })
      .from(providerServices)
      .where(eq(providerServices.status, "active"));

      // Top providers by bookings
      const topProviders = await db.select({
        userId: providerServices.userId,
        serviceName: providerServices.serviceName,
        bookingsCount: providerServices.bookingsCount,
        totalRevenue: providerServices.totalRevenue,
        averageRating: providerServices.averageRating,
      })
      .from(providerServices)
      .orderBy(desc(providerServices.bookingsCount))
      .limit(10);

      res.json({
        byBusinessType: byBusinessType.map(b => ({
          type: b.businessType || "Unknown",
          total: b.count,
          approved: b.approved || 0,
        })),
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        activeServicesCount: activeServices[0]?.count || 0,
        topProviders: topProviders.map(p => ({
          serviceName: p.serviceName,
          bookings: p.bookingsCount || 0,
          revenue: `$${Number(p.totalRevenue || 0).toLocaleString()}`,
          rating: Number(p.averageRating || 0).toFixed(1),
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Provider analytics error:", err);
      res.status(500).json({ message: "Failed to fetch provider analytics" });
    }
  });

  // === Tourism Analytics Dashboard ===

router.get("/api/admin/analytics/tourism", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceBookings, providerServices, localExpertForms, serviceProviderForms } = await import("@shared/schema");

      // 1. Destination Demand - Most searched/booked destinations
      const destinationDemand = await db.select({
        destination: trips.destination,
        searchCount: sql<number>`count(*)::int`,
        totalBudget: sql<number>`sum(COALESCE(budget::numeric, 0))::numeric`,
        avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(15);

      // 2. Booking Trends Over Time (last 12 months)
      const bookingTrends = await db.select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric`,
      })
      .from(serviceBookings)
      .where(sql`created_at >= now() - interval '12 months'`)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

      // 3. Source Markets - Where travelers come from (experts/providers by country as proxy)
      const sourceMarkets = await db.select({
        country: localExpertForms.country,
        count: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(isNotNull(localExpertForms.country))
      .groupBy(localExpertForms.country)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Also get user sign-up trends by month as additional source market data
      const usersByMonth = await db.select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`created_at >= now() - interval '12 months'`)
      .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
      .orderBy(sql`to_char(created_at, 'YYYY-MM')`);

      // 4. Spending Patterns by Destination
      const spendingPatterns = await db.select({
        destination: trips.destination,
        avgSpend: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
        minSpend: sql<number>`min(COALESCE(budget::numeric, 0))::numeric`,
        maxSpend: sql<number>`max(COALESCE(budget::numeric, 0))::numeric`,
        tripCount: sql<number>`count(*)::int`,
      })
      .from(trips)
      .where(sql`budget > 0`)
      .groupBy(trips.destination)
      .orderBy(sql`avg(COALESCE(budget::numeric, 0)) desc`)
      .limit(10);

      // 5. Party Composition (based on adults, kids, numberOfTravelers)
      const allTrips = await db.select({
        adults: trips.adults,
        kids: trips.kids,
        numberOfTravelers: trips.numberOfTravelers,
      }).from(trips);

      const partyComposition = {
        solo: 0,
        couples: 0,
        families: 0,
        groups: 0,
      };

      allTrips.forEach(trip => {
        const adults = trip.adults || 1;
        const kids = trip.kids || 0;
        const total = trip.numberOfTravelers || adults + kids;

        if (total === 1) {
          partyComposition.solo++;
        } else if (total === 2 && kids === 0) {
          partyComposition.couples++;
        } else if (kids > 0) {
          partyComposition.families++;
        } else if (total > 2) {
          partyComposition.groups++;
        } else {
          partyComposition.couples++;
        }
      });

      // 6. Seasonality - Bookings by month (using trip start dates)
      const seasonality = await db.select({
        month: sql<number>`EXTRACT(MONTH FROM start_date)::int`,
        count: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
      })
      .from(trips)
      .where(isNotNull(trips.startDate))
      .groupBy(sql`EXTRACT(MONTH FROM start_date)`)
      .orderBy(sql`EXTRACT(MONTH FROM start_date)`);

      // 7. Event Types breakdown
      const eventTypes = await db.select({
        eventType: trips.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(trips)
      .groupBy(trips.eventType)
      .orderBy(sql`count(*) desc`);

      // 8. Summary metrics
      const totalTrips = allTrips.length;
      const totalBookings = await db.select({ count: sql<number>`count(*)::int` }).from(serviceBookings);
      const completedBookings = await db.select({ 
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric` 
      })
      .from(serviceBookings)
      .where(eq(serviceBookings.status, "completed"));

      const avgTripDuration = await db.select({
        avgDays: sql<number>`avg(EXTRACT(DAY FROM (end_date - start_date)))::numeric`,
      })
      .from(trips)
      .where(sql`start_date IS NOT NULL AND end_date IS NOT NULL`);

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      res.json({
        destinationDemand: destinationDemand.map(d => ({
          destination: d.destination || "Unknown",
          searches: d.searchCount,
          totalBudget: Math.round(Number(d.totalBudget || 0)),
          avgBudget: Math.round(Number(d.avgBudget || 0)),
        })),
        bookingTrends: bookingTrends.map(b => ({
          month: b.month,
          bookings: b.count,
          revenue: Math.round(Number(b.revenue || 0)),
        })),
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          travelers: s.count,
        })),
        userGrowth: usersByMonth.map(u => ({
          month: u.month,
          users: u.count,
        })),
        spendingPatterns: spendingPatterns.map(s => ({
          destination: s.destination || "Unknown",
          avgSpend: Math.round(Number(s.avgSpend || 0)),
          minSpend: Math.round(Number(s.minSpend || 0)),
          maxSpend: Math.round(Number(s.maxSpend || 0)),
          trips: s.tripCount,
        })),
        partyComposition: [
          { type: "Solo", count: partyComposition.solo, color: "#8884d8" },
          { type: "Couples", count: partyComposition.couples, color: "#82ca9d" },
          { type: "Families", count: partyComposition.families, color: "#ffc658" },
          { type: "Groups", count: partyComposition.groups, color: "#ff7c43" },
        ],
        seasonality: monthNames.map((name, i) => {
          const monthData = seasonality.find(s => s.month === i + 1);
          return {
            month: name,
            monthNum: i + 1,
            bookings: monthData?.count || 0,
            avgBudget: Math.round(Number(monthData?.avgBudget || 0)),
          };
        }),
        eventTypes: eventTypes.map(e => ({
          type: e.eventType || "vacation",
          count: e.count,
        })),
        summary: {
          totalTrips,
          totalBookings: totalBookings[0]?.count || 0,
          completedBookings: completedBookings[0]?.count || 0,
          totalRevenue: Math.round(Number(completedBookings[0]?.revenue || 0)),
          avgTripDuration: Math.round(Number(avgTripDuration[0]?.avgDays || 0)),
          avgPartySize: totalTrips > 0 
            ? Math.round(allTrips.reduce((sum, t) => sum + (t.numberOfTravelers || t.adults || 1) + (t.kids || 0), 0) / totalTrips * 10) / 10
            : 0,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Tourism analytics error:", err);
      res.status(500).json({ message: "Failed to fetch tourism analytics" });
    }
  });

  // === Admin System Health ===

router.get("/api/admin/system/health", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dbStart = Date.now();
      let dbStatus = "operational";
      try {
        await db.select({ count: count() }).from(users);
      } catch {
        dbStatus = "degraded";
      }
      const dbLatency = Date.now() - dbStart;

      const services = [
        { service: "Web Server", status: "operational", uptime: "99.9%", latency: `${process.uptime().toFixed(0)}s uptime` },
        { service: "Database", status: dbStatus, uptime: dbLatency < 100 ? "99.9%" : "99.0%", latency: `${dbLatency}ms` },
        { service: "AI Processing", status: "operational", uptime: "99.5%" },
        { service: "Payment Gateway", status: "operational", uptime: "99.9%" },
        { service: "Email Service", status: "operational", uptime: "99.5%" },
        { service: "CDN", status: "operational", uptime: "99.9%" },
      ];

      let aiUsage = { used: 0, limit: 1000000, cost: "$0" };
      let apiUsage = { transactions: 0, volume: "$0" };
      try {
        const { aiUsageService: aiSvc } = await import('../services/ai-usage.service');
        const summary = await aiSvc.getSummary();
        aiUsage = { used: summary.totalTokens || 0, limit: 1000000, cost: `$${(summary.totalCostDollars || 0).toFixed(2)}` };
      } catch {}

      try {
        const allBookings = await storage.getServiceBookings({});
        const completedBookings = allBookings.filter(b => b.status === "completed");
        const volume = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        apiUsage = { transactions: allBookings.length, volume: `$${volume.toLocaleString()}` };
      } catch {}

      res.json({
        services,
        apiUsage: {
          claude: aiUsage,
          stripe: apiUsage,
          email: { sent: 0, bounceRate: "0%" },
        },
      });
    } catch (err) {
      console.error("System health error:", err);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  // === Admin Global Search ===

router.get("/api/admin/search", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const q = (req.query.q as string) || "";
      if (!q.trim()) {
        return res.json({ results: [], counts: {} });
      }

      const searchPattern = `%${q}%`;

      const matchedUsers = await db.select().from(users)
        .where(or(
          like(users.email, searchPattern),
          like(users.firstName, searchPattern),
          like(users.lastName, searchPattern)
        ))
        .limit(10);

      const matchedTrips = await db.select().from(trips)
        .where(or(
          like(trips.title, searchPattern),
          like(trips.destination, searchPattern)
        ))
        .limit(10);

      const matchedServices = await db.select().from(providerServices)
        .where(or(
          like(providerServices.serviceName, searchPattern),
          like(providerServices.location, searchPattern)
        ))
        .limit(10);

      const results = [
        ...matchedUsers.map(u => ({
          id: u.id,
          type: u.role === "expert" ? "expert" as const : u.role === "provider" ? "provider" as const : "user" as const,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          description: u.email || "",
          meta: `Role: ${u.role || "user"}`,
        })),
        ...matchedTrips.map(t => ({
          id: t.id,
          type: "plan" as const,
          name: t.title || "Untitled Trip",
          description: `${t.destination || "TBD"} - ${t.startDate || ""}`,
          meta: t.budget ? `Budget: $${Number(t.budget).toLocaleString()}` : undefined,
        })),
        ...matchedServices.map(s => ({
          id: s.id,
          type: "provider" as const,
          name: s.serviceName || "Unnamed Service",
          description: s.location || "",
          meta: s.averageRating ? `${s.averageRating} rating` : undefined,
        })),
      ];

      const [userCount] = await db.select({ count: count() }).from(users);
      const [expertCount] = await db.select({ count: count() }).from(users).where(eq(users.role, "expert"));
      const [tripCount] = await db.select({ count: count() }).from(trips);
      const [serviceCount] = await db.select({ count: count() }).from(providerServices);

      res.json({
        results,
        counts: {
          users: userCount?.count || 0,
          experts: expertCount?.count || 0,
          providers: serviceCount?.count || 0,
          plans: tripCount?.count || 0,
        },
      });
    } catch (err) {
      console.error("Admin search error:", err);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // === Platform Stats (Public) ===

router.get("/api/admin/notifications", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = user.claims.sub;
      const adminNotifications = await db.select().from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(50);

      const enriched = adminNotifications.map(n => ({
        id: n.id,
        type: n.type?.includes("warning") || n.type?.includes("dispute") ? "warning"
          : n.type?.includes("success") || n.type?.includes("payment") ? "success"
          : n.type?.includes("alert") ? "alert"
          : "info",
        category: n.relatedType || "System",
        title: n.title || "Notification",
        message: n.message || "",
        time: n.createdAt ? getRelativeTime(n.createdAt) : "Unknown",
        read: n.isRead || false,
      }));

      res.json(enriched);
    } catch (err) {
      console.error("Admin notifications error:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  function getRelativeTime(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // ============================================================
  // SHAREABLE ITINERARY CARD SYSTEM
  // ============================================================

  // POST /api/itinerary-variants/:variantId/share

router.get("/api/admin/reports/destination-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { searchAnalytics, demandSignals } = await import("@shared/schema");
      
      // Aggregate search data by destination
      const destinationDemand = await db.select({
        destination: searchAnalytics.destination,
        searchCount: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${searchAnalytics.userId})::int`,
        avgTravelers: sql<number>`avg(${searchAnalytics.travelers})::numeric(10,1)`,
        topOriginCountries: sql<string>`array_agg(distinct ${searchAnalytics.ipCountry}) filter (where ${searchAnalytics.ipCountry} is not null)`,
      })
      .from(searchAnalytics)
      .where(isNotNull(searchAnalytics.destination))
      .groupBy(searchAnalytics.destination)
      .orderBy(sql`count(*) desc`)
      .limit(50);

      res.json({
        reportType: "destination_demand",
        generatedAt: new Date().toISOString(),
        data: destinationDemand,
        summary: {
          totalDestinations: destinationDemand.length,
          totalSearches: destinationDemand.reduce((sum, d) => sum + d.searchCount, 0),
        }
      });
    } catch (err) {
      console.error("Destination demand report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Service Provider Market Report

router.get("/api/admin/reports/provider-market", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { serviceProviderForms, providerServices } = await import("@shared/schema");
      
      // Market overview by business type
      const marketByType = await db.select({
        businessType: serviceProviderForms.businessType,
        providerCount: sql<number>`count(*)::int`,
        countries: sql<number>`count(distinct ${serviceProviderForms.country})::int`,
      })
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.status, "approved"))
      .groupBy(serviceProviderForms.businessType)
      .orderBy(sql`count(*) desc`);

      // Top performing services
      const topServices = await db.select({
        serviceName: providerServices.serviceName,
        bookings: providerServices.bookingsCount,
        revenue: providerServices.totalRevenue,
        rating: providerServices.averageRating,
      })
      .from(providerServices)
      .where(eq(providerServices.status, "active"))
      .orderBy(desc(providerServices.bookingsCount))
      .limit(20);

      res.json({
        reportType: "provider_market",
        generatedAt: new Date().toISOString(),
        marketByType,
        topServices,
      });
    } catch (err) {
      console.error("Provider market report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Geographic Insights Report (sell to countries/tourism boards)

router.get("/api/admin/reports/geographic-insights", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Travelers by origin
      const travelerOrigins = await db.select({
        country: trips.destination,
        tripCount: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(cast(${trips.budget} as numeric))::numeric(10,2)`,
        avgTravelers: sql<number>`avg(${trips.numberOfTravelers})::numeric(10,1)`,
      })
      .from(trips)
      .groupBy(trips.destination)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Expert coverage by region
      const expertCoverage = await db.select({
        country: localExpertForms.country,
        city: localExpertForms.city,
        expertCount: sql<number>`count(*)::int`,
      })
      .from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.country, localExpertForms.city)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      res.json({
        reportType: "geographic_insights",
        generatedAt: new Date().toISOString(),
        travelerOrigins,
        expertCoverage,
        insights: {
          topDestinations: travelerOrigins.slice(0, 5).map(t => t.country),
          underservedMarkets: expertCoverage.filter(e => e.expertCount < 3).map(e => `${e.city}, ${e.country}`),
        }
      });
    } catch (err) {
      console.error("Geographic insights error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Conversion Funnel Report

router.get("/api/admin/reports/conversion-funnel", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { bookingFunnelAnalytics } = await import("@shared/schema");
      
      const funnelData = await db.select({
        stage: bookingFunnelAnalytics.funnelStage,
        count: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${bookingFunnelAnalytics.userId})::int`,
        avgPrice: sql<number>`avg(${bookingFunnelAnalytics.price})::numeric(10,2)`,
      })
      .from(bookingFunnelAnalytics)
      .groupBy(bookingFunnelAnalytics.funnelStage);

      const stages = ["search", "view", "cart", "checkout", "payment", "complete"];
      const orderedFunnel = stages.map(stage => {
        const data = funnelData.find(f => f.stage === stage);
        return {
          stage,
          count: data?.count || 0,
          uniqueUsers: data?.uniqueUsers || 0,
          avgPrice: data?.avgPrice || 0,
        };
      });

      res.json({
        reportType: "conversion_funnel",
        generatedAt: new Date().toISOString(),
        funnel: orderedFunnel,
        conversionRates: {
          searchToView: orderedFunnel[0].count > 0 ? ((orderedFunnel[1].count / orderedFunnel[0].count) * 100).toFixed(1) + "%" : "0%",
          viewToCart: orderedFunnel[1].count > 0 ? ((orderedFunnel[2].count / orderedFunnel[1].count) * 100).toFixed(1) + "%" : "0%",
          cartToComplete: orderedFunnel[2].count > 0 ? ((orderedFunnel[5].count / orderedFunnel[2].count) * 100).toFixed(1) + "%" : "0%",
        }
      });
    } catch (err) {
      console.error("Conversion funnel error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });


  // Track activity/service interactions

router.get("/api/admin/reports/activity-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { activityBookingAnalytics } = await import("@shared/schema");
      
      // Activity types by popularity
      const byActivityType = await db.select({
        activityType: activityBookingAnalytics.activityType,
        views: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'viewed' then 1 else 0 end)::int`,
        inquiries: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'inquired' then 1 else 0 end)::int`,
        bookings: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end)::int`,
        revenue: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then ${activityBookingAnalytics.price} else 0 end)::numeric(12,2)`,
        avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
        avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
      })
      .from(activityBookingAnalytics)
      .groupBy(activityBookingAnalytics.activityType)
      .orderBy(sql`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end) desc`);

      // Activities by destination
      const byDestination = await db.select({
        destination: activityBookingAnalytics.destination,
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Activities by trip type
      const byTripType = await db.select({
        tripType: activityBookingAnalytics.tripType,
        activityType: activityBookingAnalytics.activityType,
        count: sql<number>`count(*)::int`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      // Top origin countries for activities
      const byOriginCountry = await db.select({
        originCountry: activityBookingAnalytics.travelerOriginCountry,
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.travelerOriginCountry, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(30);

      res.json({
        reportType: "activity_demand",
        generatedAt: new Date().toISOString(),
        byActivityType: byActivityType.map(a => ({
          type: a.activityType,
          views: a.views || 0,
          inquiries: a.inquiries || 0,
          bookings: a.bookings || 0,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
          avgPrice: `$${Number(a.avgPrice || 0).toFixed(0)}`,
          avgGroupSize: a.avgGroupSize || 0,
          conversionRate: a.views > 0 ? `${((a.bookings / a.views) * 100).toFixed(1)}%` : "0%",
        })),
        byDestination,
        byTripType,
        byOriginCountry: byOriginCountry.map(o => ({
          country: o.originCountry || "Unknown",
          activityType: o.activityType,
          bookings: o.bookings,
          avgSpend: `$${Number(o.avgSpend || 0).toFixed(0)}`,
        })),
        insights: {
          topActivities: byActivityType.slice(0, 5).map(a => a.activityType),
          highestRevenue: byActivityType.sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 3).map(a => a.activityType),
          highestConversion: byActivityType.filter(a => a.views > 10).sort((a, b) => (b.bookings / b.views) - (a.bookings / a.views)).slice(0, 3).map(a => a.activityType),
        }
      });
    } catch (err) {
      console.error("Activity demand report error:", err);
      res.status(500).json({ message: "Failed to generate activity report" });
    }
  });

  // Activity trends by category (for selling to specific industries)

router.get("/api/admin/reports/activity-trends/:activityType", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const activityType = req.params.activityType;
      const { activityBookingAnalytics } = await import("@shared/schema");
      
      // Detailed breakdown for specific activity type
      const destinations = await db.select({
        destination: activityBookingAnalytics.destination,
        country: activityBookingAnalytics.country,
        bookings: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
        avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.country)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      const travelerProfiles = await db.select({
        tripType: activityBookingAnalytics.tripType,
        originCountry: activityBookingAnalytics.travelerOriginCountry,
        count: sql<number>`count(*)::int`,
        avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
        avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.travelerOriginCountry)
      .orderBy(sql`count(*) desc`)
      .limit(20);

      res.json({
        reportType: `activity_trends_${activityType}`,
        activityType,
        generatedAt: new Date().toISOString(),
        topDestinations: destinations,
        travelerProfiles,
        summary: {
          totalBookings: destinations.reduce((sum, d) => sum + d.bookings, 0),
          totalRevenue: `$${destinations.reduce((sum, d) => sum + Number(d.revenue || 0), 0).toLocaleString()}`,
          topMarket: destinations[0]?.destination || "N/A",
        }
      });
    } catch (err) {
      console.error("Activity trends report error:", err);
      res.status(500).json({ message: "Failed to generate activity trends" });
    }
  });


  // Track enhanced trip analytics

router.get("/api/admin/reports/destination-benchmark/:destination", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const destination = decodeURIComponent(req.params.destination);
      const { tripAnalyticsEnhanced, activityBookingAnalytics } = await import("@shared/schema");
      
      // Aggregate destination metrics
      const metrics = await db.select({
        totalTrips: sql<number>`count(*)::int`,
        avgBudget: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
        avgLengthOfStay: sql<number>`avg(${tripAnalyticsEnhanced.lengthOfStay})::numeric(5,1)`,
        avgLeadTime: sql<number>`avg(${tripAnalyticsEnhanced.leadTimeDays})::numeric(5,1)`,
        avgPartySize: sql<number>`avg(${tripAnalyticsEnhanced.partySize})::numeric(5,1)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination),
        eq(tripAnalyticsEnhanced.destinationRegion, destination)
      ));

      // Source markets
      const sourceMarkets = await db.select({
        country: tripAnalyticsEnhanced.originCountry,
        count: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.originCountry)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Trip purposes
      const tripPurposes = await db.select({
        purpose: tripAnalyticsEnhanced.tripPurpose,
        count: sql<number>`count(*)::int`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.tripPurpose)
      .orderBy(sql`count(*) desc`);

      // Party compositions
      const partyTypes = await db.select({
        composition: tripAnalyticsEnhanced.partyComposition,
        count: sql<number>`count(*)::int`,
        avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(tripAnalyticsEnhanced.partyComposition)
      .orderBy(sql`count(*) desc`);

      // Top activities
      const activities = await db.select({
        activityType: activityBookingAnalytics.activityType,
        bookings: sql<number>`count(*)::int`,
        revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
      })
      .from(activityBookingAnalytics)
      .where(and(
        or(
          eq(activityBookingAnalytics.destination, destination),
          eq(activityBookingAnalytics.country, destination),
          eq(activityBookingAnalytics.city, destination)
        ),
        eq(activityBookingAnalytics.bookingStatus, "booked")
      ))
      .groupBy(activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`)
      .limit(10);

      // Seasonality (by month)
      const seasonality = await db.select({
        month: sql<string>`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`,
        count: sql<number>`count(*)::int`,
      })
      .from(tripAnalyticsEnhanced)
      .where(or(
        eq(tripAnalyticsEnhanced.destinationCity, destination),
        eq(tripAnalyticsEnhanced.destinationCountry, destination)
      ))
      .groupBy(sql`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`)
      .orderBy(sql`count(*) desc`);

      res.json({
        reportType: "destination_benchmark",
        destination,
        generatedAt: new Date().toISOString(),
        overview: metrics[0] || {},
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          visitors: s.count,
          avgSpend: `$${Number(s.avgSpend || 0).toLocaleString()}`,
          share: metrics[0]?.totalTrips ? `${((s.count / metrics[0].totalTrips) * 100).toFixed(1)}%` : "0%",
        })),
        tripPurposes: tripPurposes.map(t => ({
          purpose: t.purpose || "Unknown",
          count: t.count,
        })),
        partyTypes: partyTypes.map(p => ({
          type: p.composition || "Unknown",
          count: p.count,
          avgSpend: `$${Number(p.avgSpend || 0).toLocaleString()}`,
        })),
        topActivities: activities.map(a => ({
          activity: a.activityType,
          bookings: a.bookings,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
        })),
        seasonality: seasonality.map(s => ({
          month: s.month?.trim() || "Unknown",
          bookings: s.count,
        })),
        insights: {
          topSourceMarket: sourceMarkets[0]?.country || "N/A",
          primaryTripPurpose: tripPurposes[0]?.purpose || "N/A",
          mostPopularActivity: activities[0]?.activityType || "N/A",
          peakSeason: seasonality[0]?.month?.trim() || "N/A",
        }
      });
    } catch (err) {
      console.error("Destination benchmark error:", err);
      res.status(500).json({ message: "Failed to generate benchmark report" });
    }
  });


  // === AUTO-INFER ANALYTICS FROM USER BEHAVIOR ===
  
  // Middleware/helper to infer trip analytics from itinerary data
  async function inferTripAnalytics(tripId: string, userId: string) {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      
      // Get trip data
      const trip = await storage.getTrip(tripId);
      if (!trip) return;

      // Get itinerary items for this trip
      const itineraryData = await db.select().from(generatedItineraries).where(eq(generatedItineraries.tripId, tripId)).then(r => r[0]);
      const items = itineraryData?.itineraryData as any;

      // Infer party composition from travelers + event type
      let partyComposition = "group";
      const travelers = trip.numberOfTravelers || 1;
      const eventType = trip.eventType || "vacation";
      
      if (travelers === 1) partyComposition = "solo";
      else if (travelers === 2 && ["honeymoon", "anniversary", "proposal", "romantic"].includes(eventType)) partyComposition = "couple";
      else if (travelers <= 4 && eventType === "vacation") partyComposition = "family";
      else partyComposition = "group";

      // Infer if has children from activities (look for kid-friendly keywords)
      let hasChildren = false;
      if (items?.dailyItinerary) {
        const allActivities = JSON.stringify(items.dailyItinerary).toLowerCase();
        hasChildren = allActivities.includes("kid") || allActivities.includes("child") || 
                     allActivities.includes("family") || allActivities.includes("playground") ||
                     allActivities.includes("zoo") || allActivities.includes("aquarium");
      }

      // Calculate length of stay
      const startDate = trip.startDate ? new Date(trip.startDate) : null;
      const endDate = trip.endDate ? new Date(trip.endDate) : null;
      const lengthOfStay = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

      // Determine season
      let season = null;
      if (startDate) {
        const month = startDate.getMonth();
        if (month >= 2 && month <= 4) season = "spring";
        else if (month >= 5 && month <= 7) season = "summer";
        else if (month >= 8 && month <= 10) season = "fall";
        else season = "winter";
      }

      // Infer destination details
      const destination = trip.destination || "";
      // Try to extract country from destination string
      const destinationParts = destination.split(",").map(s => s.trim());
      const destinationCity = destinationParts[0] || destination;
      const destinationCountry = destinationParts.length > 1 ? destinationParts[destinationParts.length - 1] : null;

      // Infer price segment from budget
      let priceSegment = "mid-range";
      const budget = parseFloat(trip.budget || "0");
      const dailyBudget = lengthOfStay && lengthOfStay > 0 ? budget / lengthOfStay : budget;
      if (dailyBudget < 100) priceSegment = "budget";
      else if (dailyBudget < 300) priceSegment = "mid-range";
      else if (dailyBudget < 500) priceSegment = "luxury";
      else priceSegment = "ultra-luxury";

      // Infer primary activity from itinerary
      let primaryActivity = null;
      if (items?.dailyItinerary) {
        const activityCounts: Record<string, number> = {};
        for (const day of items.dailyItinerary) {
          for (const activity of day.activities || []) {
            const type = activity.type || activity.category || "sightseeing";
            activityCounts[type] = (activityCounts[type] || 0) + 1;
          }
        }
        primaryActivity = Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      }

      // Upsert analytics record
      await db.insert(tripAnalyticsEnhanced).values({
        tripId,
        userId,
        destinationCity,
        destinationCountry,
        tripStartDate: startDate,
        tripEndDate: endDate,
        lengthOfStay,
        season,
        partySize: travelers,
        partyComposition,
        hasChildren,
        tripPurpose: eventType,
        totalBudget: trip.budget,
        priceSegment,
        primaryActivity,
      }).onConflictDoUpdate({
        target: [tripAnalyticsEnhanced.tripId],
        set: {
          partyComposition,
          hasChildren,
          lengthOfStay,
          season,
          priceSegment,
          primaryActivity,
        }
      });

      return true;
    } catch (err) {
      console.error("Error inferring trip analytics:", err);
      return false;
    }
  }

  // Hook into itinerary generation to auto-capture analytics

router.get("/api/admin/fee-config", isAuthenticated, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          id, category,
          CAST(platform_fee_percent AS FLOAT) AS platform_fee_percent,
          CAST(expert_share_percent AS FLOAT)  AS expert_share_percent,
          ai_keeps_100,
          CAST(min_fee AS FLOAT) AS min_fee,
          CAST(max_fee AS FLOAT) AS max_fee,
          is_active,
          updated_by,
          updated_at
        FROM booking_fee_configs
        ORDER BY category
      `);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


router.post("/api/admin/fee-config", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const {
        category,
        platformFeePercent,
        expertSharePercent,
        aiKeeps100,
        minFee,
        maxFee,
        isActive,
      } = req.body;

      if (!category) return res.status(400).json({ error: "category required" });

      await db.execute(sql`
        INSERT INTO booking_fee_configs (
          id, category, platform_fee_percent, expert_share_percent,
          ai_keeps_100, min_fee, max_fee, is_active, updated_by, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${category}, ${platformFeePercent ?? 12}, ${expertSharePercent ?? 75},
          ${aiKeeps100 ?? true}, ${minFee ?? null}, ${maxFee ?? null}, ${isActive ?? true},
          ${userId}, NOW(), NOW()
        )
        ON CONFLICT (category) DO UPDATE SET
          platform_fee_percent = EXCLUDED.platform_fee_percent,
          expert_share_percent  = EXCLUDED.expert_share_percent,
          ai_keeps_100          = EXCLUDED.ai_keeps_100,
          min_fee               = EXCLUDED.min_fee,
          max_fee               = EXCLUDED.max_fee,
          is_active             = EXCLUDED.is_active,
          updated_by            = EXCLUDED.updated_by,
          updated_at            = NOW()
      `);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/booking-fee-config?category=accommodation
  // Used by itinerary page to get the live fee rate for a category

router.get("/api/admin/lead-routing-logs", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await db.execute(sql`
        SELECT
          lrl.*,
          u.first_name || ' ' || u.last_name AS user_name,
          eu.first_name || ' ' || eu.last_name AS expert_name
        FROM lead_routing_logs lrl
        LEFT JOIN users u ON u.id = lrl.user_id
        LEFT JOIN users eu ON eu.id = lrl.assigned_expert_id
        ORDER BY lrl.created_at DESC
        LIMIT ${limit}
      `);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/admin/lead-routing-logs/:id/override — admin override assignment

router.patch("/api/admin/lead-routing-logs/:id/override", isAuthenticated, async (req, res) => {
    try {
      const adminId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { id } = req.params;
      const { newExpertId } = req.body;

      await db.execute(sql`
        UPDATE lead_routing_logs
        SET assigned_expert_id = ${newExpertId}, overridden_by = ${adminId}
        WHERE id = ${id}
      `);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/routing-queue — routed leads awaiting admin confirmation

router.get("/api/admin/routing-queue", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any)?.claims?.sub ?? (req.user as any)?.id)).then(r => r[0]);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const result = await db.execute(sql`
        SELECT
          er.id,
          er.trip_id,
          er.user_id,
          er.destination_city,
          er.request_type,
          er.status,
          er.assigned_expert_id,
          er.created_at,
          er.assigned_at,
          u.first_name || ' ' || u.last_name AS traveler_name,
          u.email AS traveler_email,
          eu.first_name || ' ' || eu.last_name AS expert_name,
          eu.email AS expert_email,
          lrl.top_score,
          lrl.scores_json
        FROM expert_requests er
        LEFT JOIN users u ON u.id = er.user_id
        LEFT JOIN users eu ON eu.id = er.assigned_expert_id
        LEFT JOIN lead_routing_logs lrl ON lrl.trip_id = er.trip_id
          AND lrl.assigned_expert_id = er.assigned_expert_id
        WHERE er.assigned_expert_id IS NOT NULL
          AND er.status NOT IN ('confirmed', 'completed', 'cancelled')
          AND NOT EXISTS (
            SELECT 1 FROM trip_expert_advisors tea
            WHERE tea.trip_id = er.trip_id
              AND tea.local_expert_id = er.assigned_expert_id
          )
        ORDER BY er.created_at DESC
        LIMIT 100
      `);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Shared handler: confirm lead → workspace bridge (used by both route aliases below)
  async function confirmLeadAssignmentHandler(requestId: string, req: any, res: any) {
    const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any)?.claims?.sub ?? (req.user as any)?.id)).then(r => r[0]);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const queueResult = await db.execute(sql`
      SELECT * FROM expert_requests WHERE id = ${requestId}
    `);
    const row = queueResult.rows?.[0] as any;
    if (!row) return res.status(404).json({ error: "Routing request not found" });
    if (!row.assigned_expert_id) return res.status(400).json({ error: "No expert assigned to this request" });
    if (!row.trip_id) return res.status(400).json({ error: "Request has no associated trip" });

    const assignment = await db.transaction(async (tx) => {
      // Lock the expert_requests row to serialise concurrent confirms
      await tx.execute(sql`SELECT id FROM expert_requests WHERE id = ${requestId} FOR UPDATE`);

      // Idempotency: return the existing advisor row if one already exists
      const [existing] = await tx.select().from(tripExpertAdvisors)
        .where(and(
          eq(tripExpertAdvisors.tripId, row.trip_id),
          eq(tripExpertAdvisors.localExpertId, row.assigned_expert_id),
        ))
        .limit(1);

      if (existing) return existing;

      // Insert; ON CONFLICT DO NOTHING handles the rare concurrent-insert race
      const [created] = await tx.insert(tripExpertAdvisors)
        .values({
          tripId: row.trip_id,
          localExpertId: row.assigned_expert_id,
          status: "assigned",
          workspaceStatus: "draft",
          assignedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // If concurrent insert won the race, fetch the winning row
      const result = created ?? await tx.select().from(tripExpertAdvisors)
        .where(and(
          eq(tripExpertAdvisors.tripId, row.trip_id),
          eq(tripExpertAdvisors.localExpertId, row.assigned_expert_id),
        ))
        .then(r => r[0]);

      // Flip expert_requests status
      await tx.execute(sql`
        UPDATE expert_requests SET status = 'assigned', assigned_at = NOW() WHERE id = ${requestId}
      `);

      return result;
    });

    return res.json({ assignment });
  }

  // POST /api/admin/leads/:expertRequestId/confirm — canonical endpoint (task spec)

router.post("/api/admin/leads/:expertRequestId/confirm", isAuthenticated, async (req, res) => {
    try {
      await confirmLeadAssignmentHandler(req.params.expertRequestId, req, res);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/routing-queue/:requestId/confirm — legacy alias (UI still uses this)

router.post("/api/admin/routing-queue/:requestId/confirm", isAuthenticated, async (req, res) => {
    try {
      await confirmLeadAssignmentHandler(req.params.requestId, req, res);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/routing-queue/:requestId/reassign — pick a different expert

router.post("/api/admin/routing-queue/:requestId/reassign", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await db.select().from(users).where(eq(users.id, (req.user as any)?.claims?.sub ?? (req.user as any)?.id)).then(r => r[0]);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { requestId } = req.params;
      const { expertId } = req.body;
      if (!expertId) return res.status(400).json({ error: "expertId is required" });

      const queueResult = await db.execute(sql`
        SELECT * FROM expert_requests WHERE id = ${requestId}
      `);
      const row = queueResult.rows?.[0] as any;
      if (!row) return res.status(404).json({ error: "Routing request not found" });
      if (row.status === "confirmed") return res.status(409).json({ error: "Assignment already confirmed; cannot reassign" });

      await db.execute(sql`
        UPDATE expert_requests
        SET assigned_expert_id = ${expertId}, assigned_at = NOW()
        WHERE id = ${requestId}
      `);

      const expertResult = await db.execute(sql`
        SELECT first_name || ' ' || last_name AS expert_name FROM users WHERE id = ${expertId}
      `);
      const expertName = (expertResult.rows?.[0] as any)?.expert_name || expertId;

      res.json({ success: true, newExpertId: expertId, expertName });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-capture accommodation preference from hotel searches/bookings

router.get("/api/admin/local-experts/nugget-counts", isAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select({ expertUserId: localKnowledgeNuggets.expertUserId, count: count() })
        .from(localKnowledgeNuggets)
        .groupBy(localKnowledgeNuggets.expertUserId);
      const map: Record<string, number> = {};
      for (const r of rows) map[r.expertUserId] = Number(r.count);
      res.json(map);
    } catch (err) {
      console.error("[Knowledge Nuggets] admin counts error:", err);
      res.status(500).json({ message: "Failed to fetch nugget counts" });
    }
  });

  // GET /api/knowledge-nuggets/city — for AI to pull nuggets by city

router.get("/api/admin/content-placement-rules", requireAdminLocal, async (req, res) => {
    try {
      const { cityName, surface, contentSource } = req.query as Record<string, string>;
      const rules = await storage.getContentPlacementRules({
        cityName: cityName || undefined,
        surface: surface || undefined,
        contentSource: contentSource || undefined,
        isActive: undefined,
      });
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch placement rules", error: err.message });
    }
  });

  // POST /api/admin/content-placement-rules — create a rule

router.post("/api/admin/content-placement-rules", requireAdminLocal, async (req, res) => {
    try {
      const rule = await storage.createContentPlacementRule(req.body as InsertContentPlacementRule);
      res.status(201).json(rule);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create placement rule", error: err.message });
    }
  });

  // PATCH /api/admin/content-placement-rules/:id — update a rule

router.patch("/api/admin/content-placement-rules/:id", requireAdminLocal, async (req, res) => {
    try {
      const rule = await storage.updateContentPlacementRule(req.params.id, req.body);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update placement rule", error: err.message });
    }
  });

  // DELETE /api/admin/content-placement-rules/:id — delete a rule

router.delete("/api/admin/content-placement-rules/:id", requireAdminLocal, async (req, res) => {
    try {
      await storage.deleteContentPlacementRule(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete placement rule", error: err.message });
    }
  });

  // POST /api/admin/content-placement-rules/auto-index
  // Scans affiliate_products and content_registry, matches them to active TravelPulse
  // cities by city/country name, and upserts placement rules with appropriate surfaces.

router.post("/api/admin/content-placement-rules/auto-index", requireAdminLocal, async (req, res) => {
    try {
      // 1. Load all TravelPulse cities
      const cities = await db.select({
        cityName: travelPulseCities.cityName,
        country: travelPulseCities.country,
        pulseScore: travelPulseCities.pulseScore,
      }).from(travelPulseCities).limit(200);

      if (!cities.length) {
        return res.json({ created: 0, message: "No TravelPulse cities found. Seed city data first." });
      }

      // Build a fast lookup: lowercase city name → city data
      const cityLookup = new Map(cities.map(c => [c.cityName.toLowerCase(), c]));

      const rulesToUpsert: InsertContentPlacementRule[] = [];

      // 2. Scan affiliate_products
      const products = await db.select({
        id: affiliateProducts.id,
        name: affiliateProducts.name,
        city: affiliateProducts.city,
        country: affiliateProducts.country,
        category: affiliateProducts.category,
      }).from(affiliateProducts)
        .where(eq(affiliateProducts.isActive, true))
        .limit(2000);

      for (const p of products) {
        const cityKey = (p.city ?? "").toLowerCase();
        const cityData = cityLookup.get(cityKey) ||
          Array.from(cityLookup.values()).find(c =>
            cityKey.includes(c.cityName.toLowerCase()) ||
            c.cityName.toLowerCase().includes(cityKey)
          );
        if (!cityData) continue;

        // Determine which surfaces this product's category matches
        const surfaces = (SURFACE_SLUGS as readonly string[]).filter(slug => {
          const cats = SURFACE_DEFAULT_AFFILIATE_CATEGORIES[slug as keyof typeof SURFACE_DEFAULT_AFFILIATE_CATEGORIES] ?? [];
          const pCat = (p.category ?? "").toLowerCase();
          return cats.some(c => pCat.includes(c) || c.includes(pCat));
        });
        if (!surfaces.length) surfaces.push("travelpulse-discover");

        rulesToUpsert.push({
          contentSource: "affiliate_product",
          sourceId: p.id,
          contentLabel: p.name,
          cityName: cityData.cityName,
          country: cityData.country,
          surfaces,
          minPulseScore: 0,
          isPinned: false,
          isAutoTagged: true,
          isActive: true,
          notes: `Auto-indexed from affiliate_products`,
        });
      }

      // 3. Scan content_registry (published only, with location metadata)
      const registryItems = await db.select({
        id: contentRegistry.id,
        title: contentRegistry.title,
        contentType: contentRegistry.contentType,
        metadata: contentRegistry.metadata,
      }).from(contentRegistry)
        .where(eq(contentRegistry.status, "published"))
        .limit(2000);

      for (const r of registryItems) {
        const meta = (r.metadata ?? {}) as Record<string, any>;
        const rawCity: string = meta.city ?? meta.location ?? meta.destination ?? "";
        if (!rawCity) continue;

        const cityKey = rawCity.toLowerCase().split(",")[0].trim();
        const cityData = cityLookup.get(cityKey) ||
          Array.from(cityLookup.values()).find(c =>
            cityKey.includes(c.cityName.toLowerCase()) ||
            c.cityName.toLowerCase().includes(cityKey)
          );
        if (!cityData) continue;

        // Determine surfaces from content type
        const surfaces = (SURFACE_SLUGS as readonly string[]).filter(slug => {
          const types = SURFACE_DEFAULT_CONTENT_TYPES[slug as keyof typeof SURFACE_DEFAULT_CONTENT_TYPES] ?? [];
          return types.includes(r.contentType as any);
        });
        if (!surfaces.length) surfaces.push("travelpulse-discover");

        rulesToUpsert.push({
          contentSource: "content_registry",
          sourceId: r.id,
          contentLabel: r.title ?? undefined,
          cityName: cityData.cityName,
          country: cityData.country,
          surfaces,
          minPulseScore: 0,
          isPinned: false,
          isAutoTagged: true,
          isActive: true,
          notes: `Auto-indexed from content_registry`,
        });
      }

      const created = await storage.bulkUpsertContentPlacementRules(rulesToUpsert);
      res.json({
        created,
        total: rulesToUpsert.length,
        cities: cities.length,
        affiliateScanned: products.length,
        registryScanned: registryItems.length,
        message: `Auto-indexed ${created} new rules across ${cities.length} TravelPulse cities`,
      });
    } catch (err: any) {
      console.error("[ContentMap] auto-index error:", err);
      res.status(500).json({ message: "Auto-index failed", error: err.message });
    }
  });

export default router;
