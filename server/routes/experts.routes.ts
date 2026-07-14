import { verifyTripOwnership } from '../utils/trip-ownership';
import { checkProviderPublishGate } from '../services/provider-publish.service';
import { withQueryTimer } from '../utils/queryTimer';
import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { isEA } from "../middleware/ea-rbac";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, isNull, asc } from "drizzle-orm";
// NOTE: db is intentionally NOT imported here. All raw queries use experts-query.service.ts or storage.
import {
  getLocalExpertFormByUserId, getServiceProviderFormByUserId, getProviderVerificationStatus,
  getExpertServiceOfferingById, getTravelPulseData,
  getExpertAiTasks, createExpertAiTask, updateExpertAiTask,
  getExpertAiTaskById, getExpertAiTasksSince, insertAiInteractionForExpert,
  getAvailableSchedulesByDay, getAllProviderBlackoutDates,
  getUserByEmail, getEaClientRelationshipByClient, createEaClientRelationship,
  getEaClientRelationshipById, updateEaClientRelationship, deleteEaClientRelationship,
  insertNotification,
  getEaExecutives, createEaExecutive, getEaExecutiveById, updateEaExecutive, deleteEaExecutive,
  getEaEvents, createEaEvent, getEaEventById, updateEaEvent, deleteEaEvent,
  getEaTravelArrangements, createEaTravelArrangement, getEaTravelArrangementById,
  updateEaTravelArrangement, deleteEaTravelArrangement,
  getEaGifts, createEaGift, getEaGiftById, updateEaGift, deleteEaGift,
  getEaSavedVenues, createEaSavedVenue, getEaSavedVenueById, updateEaSavedVenue, deleteEaSavedVenue,
  getEaCommunications, createEaCommunication, deleteEaCommunication,
  getEaAiTasks, createEaAiTask, getEaAiTaskById, updateEaAiTask, deleteEaAiTask,
  getLocalKnowledgeNuggets, createLocalKnowledgeNugget, getLocalKnowledgeNuggetById,
  updateLocalKnowledgeNugget, deleteLocalKnowledgeNugget, getLocalKnowledgeNuggetsByCity,
  insertVisaRequirementCache, getVisaAssistanceServices, getRecentExpertContracts,
  getUserRole,
} from "../services/experts-query.service";
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
import { calculateCommission, BookingType } from "../utils/commissionCalculator";

import { trackAnthropicResponse } from "../services/ai-cost-tracker";

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


// Slug aliasing for backward compatibility
const slugAliases: Record<string, string> = {
  "romance": "date-night",
  "corporate": "corporate-events",
};

function resolveSlug(slug: string): string {
  return slugAliases[slug] || slug;
}

router.patch("/api/expert/role", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      // Verify caller is an approved expert — non-experts cannot self-promote
      const form = await storage.getLocalExpertForm(userId);
      if (!form) {
        return res.status(403).json({ message: "No expert application found" });
      }
      if (form.status !== "approved") {
        return res.status(403).json({ message: "Only approved experts can change their role" });
      }

      const { expertType } = req.body;
      const validTypes = ["travel_expert", "local_expert", "event_planner", "executive_assistant"];
      if (!expertType || !validTypes.includes(expertType)) {
        return res.status(400).json({ message: "Invalid expert type" });
      }

      // Local Expert requires specific vetting — only allow if already a local_expert
      const currentType = form.expertType;
      if (expertType === "local_expert" && currentType !== "local_expert") {
        return res.status(403).json({
          message: "Switching to Local Expert requires admin review. Please contact support to have your application re-evaluated.",
          requiresReview: true,
        });
      }

      await storage.updateLocalExpertFormType(userId, expertType);
      res.json({ success: true, expertType });
    } catch (err) {
      console.error("Error updating expert role:", err);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // PATCH /api/expert/profile-notes — Save expert's notes style description

router.get("/api/expert/service-templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      // Resolve the expert's role from their application form
      const formRow = await db
        .select({ expertType: localExpertForms.expertType })
        .from(localExpertForms)
        .where(eq(localExpertForms.userId, userId))
        .then((r) => r[0]);

      const expertRole = formRow?.expertType ?? null; // null = no form submitted yet

      // expertId and isActive columns dropped in migration 013; all ESO rows are platform templates.
      // Filter by targetRoles only.
      const rows = await db
        .select()
        .from(expertServiceOfferings)
        .where(
          or(
            isNull(expertServiceOfferings.targetRoles),
            expertRole
              ? sql`${expertRole} = ANY(${expertServiceOfferings.targetRoles})`
              : sql`false`
          )
        )
        .orderBy(expertServiceOfferings.sortOrder);

      const ROLE_LABELS: Record<string, string> = {
        local_expert:  "Local Expert",
        travel_expert: "Travel Advisor",
        event_planner: "Event Planner",
        executive_assistant: "Executive Assistant",
      };

      const templates = rows.map((o) => {
        const isRoleSpecific =
          Array.isArray(o.targetRoles) && o.targetRoles.length > 0;
        return {
          id: o.id,
          title: o.name,
          description: o.description,
          categoryId: null,
          serviceType: null,
          deliveryMethod: null,
          deliveryTimeframe: null,
          suggestedPrice: o.price,
          requirements: null,
          whatIncluded: null,
          isActive: o.isDefault ?? true,
          sortOrder: o.sortOrder,
          createdAt: o.createdAt,
          targetRoles: o.targetRoles ?? [],
          roleBadge: isRoleSpecific && expertRole
            ? ROLE_LABELS[expertRole] ?? expertRole
            : null,
        };
      });

      res.json(templates);
    } catch (err) {
      console.error("Error fetching expert service templates:", err);
      res.status(500).json({ message: "Failed to fetch service templates" });
    }
  });

  // GET /api/expert/role — returns the expert's role type and a human-readable label
  // Used by the UI to show the role callout even when no role-specific templates exist yet.

router.get("/api/expert/role", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      const formRow = await db
        .select({ expertType: localExpertForms.expertType })
        .from(localExpertForms)
        .where(eq(localExpertForms.userId, userId))
        .then((r) => r[0]);

      const expertRole = formRow?.expertType ?? null;

      const ROLE_LABELS: Record<string, string> = {
        local_expert:        "Local Expert",
        travel_expert:       "Travel Advisor",
        event_planner:       "Event Planner",
        executive_assistant: "Executive Assistant",
      };

      res.json({
        role:      expertRole,
        roleLabel: expertRole ? (ROLE_LABELS[expertRole] ?? expertRole) : null,
      });
    } catch (err) {
      console.error("Error fetching expert role:", err);
      res.status(500).json({ message: "Failed to fetch expert role" });
    }
  });

  // Create service from template

router.get("/api/provider/earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const earnings = await storage.getProviderEarnings(userId);
      res.json(earnings);
    } catch (error: any) {
      console.error("Provider earnings error:", error);
      res.status(500).json({ message: "Failed to get provider earnings", error: error.message });
    }
  });


router.get("/api/provider/earnings/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const summary = await storage.getProviderEarningsSummary(userId);
      // Return both legacy field names and the names the payouts UI expects
      res.json({
        ...summary,
        totalEarnings: summary.total,
        availableForPayout: summary.available,
        pendingPayout: summary.pending,
        commissionRate: summary.total > 0 ? (summary.paidOut / summary.total) : 0,
      });
    } catch (error: any) {
      console.error("Provider earnings summary error:", error);
      res.status(500).json({ message: "Failed to get provider earnings summary", error: error.message });
    }
  });


router.get("/api/provider/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const details = await revenueTrackingService.getProviderRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Provider earnings details error:", error);
      res.status(500).json({ message: "Failed to get provider earnings details", error: error.message });
    }
  });

  // Expert earnings details endpoint
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings

router.get("/api/expert/earnings/details", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const details = await revenueTrackingService.getExpertRevenueDetails(userId);
      res.json(details);
    } catch (error: any) {
      console.error("Expert earnings details error:", error);
      res.status(500).json({ message: "Failed to get expert earnings details", error: error.message });
    }
  });

  // === Stripe Connect Onboarding ===


router.get("/api/expert/trips/:tripId/constraints", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      const energy = await storage.getEnergyTracking(req.params.tripId);
      const vendorCoord = await storage.getVendorCoordination(req.params.tripId);
      const bookingReqs = await storage.getBookingRequestsByTrip(req.params.tripId);

      const { analyzeAnchorOptimization } = await import('../services/anchor-suggestion.service');
      const tips = await analyzeAnchorOptimization(req.params.tripId);

      res.json({
        trip: {
          id: trip.id,
          title: trip.title,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          eventType: trip.eventType,
        },
        anchors,
        dayBoundaries: boundaries,
        energyTracking: energy,
        vendorCoordination: vendorCoord,
        bookingRequests: bookingReqs,
        optimizationTips: tips,
        summary: {
          totalAnchors: anchors.length,
          immovableAnchors: anchors.filter(a => a.isImmovable).length,
          confirmedVendors: vendorCoord.filter(v => v.status === 'confirmed' || v.status === 'contract_signed').length,
          pendingVendors: vendorCoord.filter(v => v.status === 'pending' || v.status === 'contacted').length,
          warningCount: tips.filter((t: any) => t.severity === 'warning' || t.severity === 'critical').length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load constraints", error: error.message });
    }
  });


router.get("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendors = await storage.getVendorCoordination(req.params.tripId);
      const confirmed = vendors.filter(v => v.status === 'confirmed' || v.status === 'contract_signed');
      const pending = vendors.filter(v => v.status === 'pending' || v.status === 'contacted');
      res.json({ vendors, confirmed, pending, total: vendors.length });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load vendors", error: error.message });
    }
  });


router.post("/api/expert/trips/:tripId/vendors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendorInput = z.object({
        vendorName: z.string().min(1).max(255),
        serviceType: z.string().min(1).max(100),
        vendorCategory: z.string().min(1).max(100),
        status: z.string().max(50).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        notes: z.string().max(1000).optional(),
        quotedAmount: z.string().optional(),
      }).parse(req.body);
      const vendor = await storage.createVendorCoordination({
        ...vendorInput,
        tripId: req.params.tripId,
        expertId: userId,
      });
      res.json(vendor);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add vendor", error: error.message });
    }
  });


router.put("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      const vendorUpdateInput = z.object({
        vendorName: z.string().min(1).max(255).optional(),
        serviceType: z.string().min(1).max(100).optional(),
        status: z.string().max(50).optional(),
        contactEmail: z.string().email().optional(),
        contactPhone: z.string().max(50).optional(),
        notes: z.string().max(1000).optional(),
        quotedAmount: z.string().optional(),
      }).parse(req.body);
      const updated = await storage.updateVendorCoordination(req.params.vendorId, vendorUpdateInput);
      if (!updated) return res.status(404).json({ message: "Vendor not found" });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update vendor", error: error.message });
    }
  });


router.delete("/api/expert/vendors/:vendorId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }
      await storage.deleteVendorCoordination(req.params.vendorId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete vendor", error: error.message });
    }
  });

  // === Provider: Availability Management ===


router.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const schedule = await storage.getProviderAvailability(userId);
      const blackouts = await storage.getProviderBlackoutDates(userId);
      res.json({ schedule, blackoutDates: blackouts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load availability", error: error.message });
    }
  });


router.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const scheduleInput = z.object({
        dayOfWeek: z.number().min(0).max(6),
        startTime: z.string().min(1),
        endTime: z.string().min(1),
        isAvailable: z.boolean().optional(),
      }).parse(req.body);
      const entry = await storage.setProviderAvailability({
        ...scheduleInput,
        providerId: userId,
      });
      res.json(entry);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to set availability", error: error.message });
    }
  });


router.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderAvailability(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete availability", error: error.message });
    }
  });


router.post("/api/provider/blackout-dates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const blackoutInput = z.object({
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        reason: z.string().max(500).optional(),
      }).parse(req.body);
      const blackout = await storage.addProviderBlackoutDate({
        ...blackoutInput,
        providerId: userId,
      });
      res.json(blackout);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to add blackout date", error: error.message });
    }
  });


router.delete("/api/provider/blackout-dates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      await storage.deleteProviderBlackoutDate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete blackout date", error: error.message });
    }
  });

  // === Provider: Booking Requests ===


router.get("/api/provider/booking-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const requests = await storage.getBookingRequests(userId);
      res.json({ requests });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load requests", error: error.message });
    }
  });


router.put("/api/provider/booking-requests/:requestId/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== "provider" && user.role !== "service_provider" && user.role !== "admin")) {
        return res.status(403).json({ message: "Provider access required" });
      }
      const responseInput = z.object({
        status: z.enum(["accepted", "rejected", "counter_offered"]),
        counterOffer: z.string().optional().nullable(),
        providerResponse: z.string().max(2000).optional(),
      }).parse(req.body);
      const updated = await storage.updateBookingRequest(req.params.requestId, {
        status: responseInput.status,
        counterOffer: responseInput.counterOffer || null,
        providerResponse: responseInput.providerResponse,
      });
      if (!updated) return res.status(404).json({ message: "Request not found" });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to respond", error: error.message });
    }
  });

  // ==========================================
  // Constraint Propagation & Workflow Services
  // ==========================================


router.get("/api/provider/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      const settings = await storage.getProviderSettings(userId);
      if (!settings) {
        return res.json({
          instantBooking: false,
          autoResponse: true,
          minimumLeadTimeDays: 7,
          targetResponseTimeHours: 2,
          payoutFrequency: "monthly",
          minimumPayoutAmount: "100",
          notificationsJson: { newBookings: true, bookingUpdates: true, messages: true, reviews: true, payouts: true, marketing: false },
        });
      }
      res.json(settings);
    } catch (err) {
      console.error("[Provider] getSettings error:", err);
      res.status(500).json({ message: "Failed to get settings" });
    }
  });


router.patch("/api/provider/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = await requireProviderRole(req, res);
      if (!userId) return;
      // Strip ownership/identity fields to prevent mass assignment
      const { userId: _uid, id: _id, createdAt: _ca, updatedAt: _ua, providerId: _pid, ...safeSettings } = req.body as any;
      const settings = await storage.upsertProviderSettings(userId, safeSettings);
      res.json(settings);
    } catch (err) {
      console.error("[Provider] upsertSettings error:", err);
      res.status(500).json({ message: "Failed to save settings" });
    }
  });

  // === Itinerary Items CRUD (PATCH + DELETE only; GET/POST defined at Itinerary Intelligence Routes) ===
  async function canAccessTripItems(tripId: string, userId: string): Promise<boolean> {
    const owned = await verifyTripOwnership(tripId, userId);
    if (owned) return true;
    return await storage.isExpertAssignedToTrip(tripId, userId);
  }


router.patch("/api/expert/assignments/:assignmentId/workspace-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { assignmentId } = req.params;
      const { workspaceStatus } = req.body;
      const validTransitions: Record<string, string[]> = {
        draft: ["in_review"],
        in_review: ["delivered"],
        delivered: [],
      };
      if (!workspaceStatus || !(workspaceStatus in validTransitions)) {
        return res.status(400).json({ message: "Invalid workspaceStatus. Must be: draft, in_review, or delivered" });
      }
      const assignment = await storage.getExpertAssignment(assignmentId);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.localExpertId !== userId) return res.status(403).json({ message: "Access denied" });
      const current = assignment.workspaceStatus ?? "draft";
      if (!validTransitions[current]?.includes(workspaceStatus)) {
        return res.status(400).json({ message: `Cannot transition workspace status from '${current}' to '${workspaceStatus}'. Allowed: ${validTransitions[current]?.join(", ") || "none"}` });
      }
      const updated = await storage.updateExpertAssignmentWorkspaceStatus(assignmentId, workspaceStatus);
      res.json(updated);
    } catch (err) {
      console.error("[Expert] workspace-status error:", err);
      res.status(500).json({ message: "Failed to update workspace status" });
    }
  });

  // === Expert Assigned Trips list (powers Dashboard + Assigned Trips page) ===

router.get("/api/expert/assigned-trips", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const rows = await db
        .select({
          trip_id: tripExpertAdvisors.tripId,
          trip_title: trips.title,
          destination: trips.destination,
          start_date: trips.startDate,
          end_date: trips.endDate,
          status: tripExpertAdvisors.status,
          assigned_at: tripExpertAdvisors.assignedAt,
          traveler_first: users.firstName,
          traveler_last: users.lastName,
          suggestion_count: sql<number>`(
            SELECT COUNT(*) FROM trip_suggestions
            WHERE trip_id = ${tripExpertAdvisors.tripId}
            AND expert_id = ${userId}
          )`,
        })
        .from(tripExpertAdvisors)
        .innerJoin(trips, eq(tripExpertAdvisors.tripId, trips.id))
        .leftJoin(users, eq(trips.userId, users.id))
        .where(eq(tripExpertAdvisors.localExpertId, userId))
        .orderBy(desc(tripExpertAdvisors.assignedAt));

      res.json(rows.map(r => ({
        trip_id: r.trip_id,
        trip_title: r.trip_title || r.destination,
        destination: r.destination,
        start_date: r.start_date,
        end_date: r.end_date,
        traveler_name: [r.traveler_first, r.traveler_last].filter(Boolean).join(" ") || "Traveler",
        status: r.status,
        assigned_at: r.assigned_at,
        suggestion_count: Number(r.suggestion_count) || 0,
      })));
    } catch (err) {
      console.error("[Expert] assigned-trips error:", err);
      res.status(500).json({ message: "Failed to fetch assigned trips" });
    }
  });

  // === Trip Commission ===

// ── EA RBAC: every /api/ea/* route requires executive_assistant or admin role ──
router.use("/api/ea", isEA);

router.get("/api/ea/clients", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const rows = await db
        .select({
          id: eaClientRelationships.id,
          clientUserId: eaClientRelationships.clientUserId,
          clientEmail: eaClientRelationships.clientEmail,
          displayName: eaClientRelationships.displayName,
          notes: eaClientRelationships.notes,
          billingName: eaClientRelationships.billingName,
          billingEmail: eaClientRelationships.billingEmail,
          billingAddress: eaClientRelationships.billingAddress,
          paymentNotes: eaClientRelationships.paymentNotes,
          preferredCurrency: eaClientRelationships.preferredCurrency,
          createdAt: eaClientRelationships.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
          userProfileImageUrl: users.profileImageUrl,
        })
        .from(eaClientRelationships)
        .leftJoin(users, eq(eaClientRelationships.clientUserId, users.id))
        .where(eq(eaClientRelationships.eaUserId, eaUserId))
        .orderBy(desc(eaClientRelationships.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[EA] getClients error:", err);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // POST /api/ea/clients — add a client (by email lookup)

router.post("/api/ea/clients", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { email, displayName, notes } = z.object({
        email: z.string().email(),
        displayName: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      // Look up the user by email
      const foundUser = await getUserByEmail(email);

      // Check not already added
      const existing = await getEaClientRelationshipByClient(eaUserId, foundUser?.id ?? null, email);
      if (existing) {
        return res.status(409).json({ message: "Client already added" });
      }

      const created = await createEaClientRelationship({
        eaUserId,
        clientUserId: foundUser?.id ?? null,
        clientEmail: email,
        displayName: displayName || (foundUser ? `${foundUser.firstName ?? ""} ${foundUser.lastName ?? ""}`.trim() : email),
        notes: notes ?? null,
      });

      res.status(201).json(created);
    } catch (err) {
      console.error("[EA] addClient error:", err);
      res.status(500).json({ message: "Failed to add client" });
    }
  });

  // PATCH /api/ea/clients/:id — update payment info / notes

router.patch("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const updates = z.object({
        displayName: z.string().optional(),
        notes: z.string().optional(),
        billingName: z.string().optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().optional(),
        paymentNotes: z.string().optional(),
        preferredCurrency: z.string().optional(),
      }).parse(req.body);

      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });

      const updated = await updateEaClientRelationship(id, updates);
      res.json(updated);
    } catch (err) {
      console.error("[EA] updateClient error:", err);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // DELETE /api/ea/clients/:id — remove client relationship

router.delete("/api/ea/clients/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });
      await deleteEaClientRelationship(id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteClient error:", err);
      res.status(500).json({ message: "Failed to remove client" });
    }
  });

  // POST /api/ea/clients/:id/push — send a notification to the client

router.post("/api/ea/clients/:id/push", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id;
      const { id } = req.params;
      const { title, message } = z.object({
        title: z.string().min(1).max(255),
        message: z.string().min(1),
      }).parse(req.body);

      const row = await getEaClientRelationshipById(id, eaUserId);
      if (!row) return res.status(404).json({ message: "Client not found" });
      if (!row.clientUserId) return res.status(400).json({ message: "Client does not have a platform account" });

      await insertNotification({
        userId: row.clientUserId,
        type: "ea_message",
        title,
        message,
        relatedId: eaUserId,
        relatedType: "ea_user",
        data: { fromEaUserId: eaUserId },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] pushNotification error:", err);
      res.status(500).json({ message: "Failed to send notification" });
    }
  });

  // ============================================================
  // EA EXECUTIVE MANAGEMENT
  // ============================================================


router.get("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaExecutives(eaUserId));
    } catch (err) {
      console.error("[EA] getExecutives error:", err);
      res.status(500).json({ message: "Failed to fetch executives" });
    }
  });


router.post("/api/ea/executives", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaExecutiveSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaExecutive(body));
    } catch (err) {
      console.error("[EA] createExecutive error:", err);
      res.status(400).json({ message: "Failed to create executive" });
    }
  });


router.patch("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaExecutiveById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      res.json(await updateEaExecutive(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateExecutive error:", err);
      res.status(500).json({ message: "Failed to update executive" });
    }
  });


router.delete("/api/ea/executives/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaExecutiveById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Executive not found" });
      await deleteEaExecutive(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteExecutive error:", err);
      res.status(500).json({ message: "Failed to delete executive" });
    }
  });

  // ============================================================
  // EA EVENTS
  // ============================================================


router.get("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaEvents(eaUserId));
    } catch (err) {
      console.error("[EA] getEvents error:", err);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });


router.post("/api/ea/events", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaEventSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaEvent(body));
    } catch (err) {
      console.error("[EA] createEvent error:", err);
      res.status(400).json({ message: "Failed to create event" });
    }
  });


router.patch("/api/ea/events/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaEventById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Event not found" });
      res.json(await updateEaEvent(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateEvent error:", err);
      res.status(500).json({ message: "Failed to update event" });
    }
  });


router.delete("/api/ea/events/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaEvent(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteEvent error:", err);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // ============================================================
  // EA TRAVEL ARRANGEMENTS
  // ============================================================


router.get("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaTravelArrangements(eaUserId));
    } catch (err) {
      console.error("[EA] getTravel error:", err);
      res.status(500).json({ message: "Failed to fetch travel arrangements" });
    }
  });


router.post("/api/ea/travel", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaTravelArrangementSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaTravelArrangement(body));
    } catch (err) {
      console.error("[EA] createTravel error:", err);
      res.status(400).json({ message: "Failed to create travel arrangement" });
    }
  });


router.patch("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaTravelArrangementById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Travel arrangement not found" });
      res.json(await updateEaTravelArrangement(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateTravel error:", err);
      res.status(500).json({ message: "Failed to update travel arrangement" });
    }
  });


router.delete("/api/ea/travel/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaTravelArrangement(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteTravel error:", err);
      res.status(500).json({ message: "Failed to delete travel arrangement" });
    }
  });

  // ============================================================
  // EA GIFTS
  // ============================================================


router.get("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaGifts(eaUserId));
    } catch (err) {
      console.error("[EA] getGifts error:", err);
      res.status(500).json({ message: "Failed to fetch gifts" });
    }
  });


router.post("/api/ea/gifts", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaGiftSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaGift(body));
    } catch (err) {
      console.error("[EA] createGift error:", err);
      res.status(400).json({ message: "Failed to create gift" });
    }
  });


router.patch("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaGiftById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Gift not found" });
      res.json(await updateEaGift(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateGift error:", err);
      res.status(500).json({ message: "Failed to update gift" });
    }
  });


router.delete("/api/ea/gifts/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaGift(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteGift error:", err);
      res.status(500).json({ message: "Failed to delete gift" });
    }
  });

  // ============================================================
  // EA SAVED VENUES
  // ============================================================


router.get("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaSavedVenues(eaUserId));
    } catch (err) {
      console.error("[EA] getVenues error:", err);
      res.status(500).json({ message: "Failed to fetch venues" });
    }
  });


router.post("/api/ea/venues", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaSavedVenueSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaSavedVenue(body));
    } catch (err) {
      console.error("[EA] createVenue error:", err);
      res.status(400).json({ message: "Failed to save venue" });
    }
  });


router.patch("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaSavedVenueById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "Venue not found" });
      res.json(await updateEaSavedVenue(req.params.id, req.body));
    } catch (err) {
      console.error("[EA] updateVenue error:", err);
      res.status(500).json({ message: "Failed to update venue" });
    }
  });


router.delete("/api/ea/venues/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaSavedVenue(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteVenue error:", err);
      res.status(500).json({ message: "Failed to delete venue" });
    }
  });

  // ============================================================
  // EA COMMUNICATIONS
  // ============================================================


router.get("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getEaCommunications(eaUserId));
    } catch (err) {
      console.error("[EA] getCommunications error:", err);
      res.status(500).json({ message: "Failed to fetch communications" });
    }
  });


router.post("/api/ea/communications", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaCommunicationSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaCommunication(body));
    } catch (err) {
      console.error("[EA] createCommunication error:", err);
      res.status(400).json({ message: "Failed to log communication" });
    }
  });


router.delete("/api/ea/communications/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaCommunication(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteCommunication error:", err);
      res.status(500).json({ message: "Failed to delete communication" });
    }
  });

  // ============================================================
  // EA AI TASKS
  // ============================================================


router.get("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const { status } = req.query;
      res.json(await getEaAiTasks(eaUserId, status as string | undefined));
    } catch (err) {
      console.error("[EA] getAiTasks error:", err);
      res.status(500).json({ message: "Failed to fetch AI tasks" });
    }
  });


router.post("/api/ea/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const body = insertEaAiTaskSchema.parse({ ...req.body, eaUserId });
      res.status(201).json(await createEaAiTask(body));
    } catch (err) {
      console.error("[EA] createAiTask error:", err);
      res.status(400).json({ message: "Failed to create AI task" });
    }
  });


router.patch("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      const row = await getEaAiTaskById(req.params.id, eaUserId);
      if (!row) return res.status(404).json({ message: "AI task not found" });
      const updates: Record<string, any> = { ...req.body };
      if (req.body.status === "approved") updates.approvedAt = new Date();
      if (req.body.status === "rejected") updates.rejectedAt = new Date();
      res.json(await updateEaAiTask(req.params.id, updates));
    } catch (err) {
      console.error("[EA] updateAiTask error:", err);
      res.status(500).json({ message: "Failed to update AI task" });
    }
  });


router.delete("/api/ea/ai-tasks/:id", isAuthenticated, async (req, res) => {
    try {
      const eaUserId = (req.user as any).id || (req.user as any).claims?.sub;
      await deleteEaAiTask(req.params.id, eaUserId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EA] deleteAiTask error:", err);
      res.status(500).json({ message: "Failed to delete AI task" });
    }
  });

  // ============================================================
  // LOCAL EXPERT KNOWLEDGE NUGGETS
  // ============================================================

  // GET /api/expert/knowledge-nuggets — list own nuggets

router.get("/api/expert/knowledge-nuggets", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      res.json(await getLocalKnowledgeNuggets(expertId));
    } catch (err) {
      console.error("[Knowledge Nuggets] list error:", err);
      res.status(500).json({ message: "Failed to fetch knowledge nuggets" });
    }
  });

  // POST /api/expert/knowledge-nuggets — create nugget

router.post("/api/expert/knowledge-nuggets", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const parsed = insertLocalKnowledgeNuggetSchema.safeParse({ ...req.body, expertUserId: expertId });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
      }
      res.status(201).json(await createLocalKnowledgeNugget(parsed.data));
    } catch (err) {
      console.error("[Knowledge Nuggets] create error:", err);
      res.status(500).json({ message: "Failed to create knowledge nugget" });
    }
  });

  // PATCH /api/expert/knowledge-nuggets/:id — update own nugget

router.patch("/api/expert/knowledge-nuggets/:id", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const { id } = req.params;
      const existing = await getLocalKnowledgeNuggetById(id, expertId);
      if (!existing) return res.status(404).json({ message: "Nugget not found" });
      const allowed = ["nuggetType", "city", "linkedPoi", "linkedNeighbourhood", "insight", "targetAudience", "notFor", "seasonality"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }
      updates.updatedAt = new Date();
      res.json(await updateLocalKnowledgeNugget(id, updates));
    } catch (err) {
      console.error("[Knowledge Nuggets] update error:", err);
      res.status(500).json({ message: "Failed to update knowledge nugget" });
    }
  });

  // DELETE /api/expert/knowledge-nuggets/:id — delete own nugget

router.delete("/api/expert/knowledge-nuggets/:id", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const { id } = req.params;
      const existing = await getLocalKnowledgeNuggetById(id, expertId);
      if (!existing) return res.status(404).json({ message: "Nugget not found" });
      await deleteLocalKnowledgeNugget(id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Knowledge Nuggets] delete error:", err);
      res.status(500).json({ message: "Failed to delete knowledge nugget" });
    }
  });

  // GET /api/admin/local-experts/nugget-counts — nugget count per local expert

router.post("/api/visa/requirements", async (req, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (visaRateLimit(ip)) {
        return res.status(429).json({ message: "Too many requests. Please wait a minute before trying again." });
      }
      const { passportCountry, destinationCountry } = req.body;
      if (!passportCountry || !destinationCountry) {
        return res.status(400).json({ message: "passportCountry and destinationCountry are required" });
      }

      const { forceRefresh } = req.body;

      // Check cache first (7-day TTL), unless force-refresh requested
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      if (forceRefresh) {
        // Delete stale cache entry so we re-fetch fresh data
        await db
          .delete(visaRequirementsCache)
          .where(
            and(
              eq(visaRequirementsCache.passportCountry, passportCountry.toLowerCase()),
              eq(visaRequirementsCache.destinationCountry, destinationCountry.toLowerCase()),
            )
          );
      } else {
        const cached = await db
          .select()
          .from(visaRequirementsCache)
          .where(
            and(
              eq(visaRequirementsCache.passportCountry, passportCountry.toLowerCase()),
              eq(visaRequirementsCache.destinationCountry, destinationCountry.toLowerCase()),
              sql`${visaRequirementsCache.cachedAt} > ${sevenDaysAgo}`
            )
          )
          .limit(1)
          .then((r) => r[0]);

        if (cached) {
          return res.json({
            visaRequired: cached.visaRequired,
            visaTypes: cached.visaTypes,
            requiredDocuments: cached.requiredDocuments,
            processingTime: cached.processingTime,
            feeRange: cached.feeRange,
            disclaimer: cached.disclaimer,
            fromCache: true,
            cachedAt: cached.cachedAt,
          });
        }
      }

      // Call Claude to get visa requirements
      const prompt = `You are a visa information assistant. Provide visa requirements for a ${passportCountry} passport holder traveling to ${destinationCountry}.

Return ONLY valid JSON in this exact structure (no additional text):
{
  "visa_required": true or false,
  "visa_types": ["Tourist Visa", "Business Visa"],
  "required_documents": ["Valid passport (6+ months validity)", "Completed visa application form", "Passport-sized photos", "Bank statements (last 3 months)", "Travel itinerary", "Hotel bookings"],
  "processing_time": "5-10 business days",
  "fee_range": "$50-$160 USD depending on visa type",
  "disclaimer": "This information is for general guidance only. Requirements may change at any time. Always verify with the official embassy or consulate of ${destinationCountry} before traveling."
}

If no visa is required (visa-free or visa-on-arrival), set visa_required to false and explain in the disclaimer. Be specific and accurate based on commonly known visa policies.`;

      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      });
      trackAnthropicResponse(completion, { sourceType: "ai_expert" });

      const text = (completion.content[0] as any).text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ message: "Failed to parse AI response" });
      }
      const parsed = JSON.parse(jsonMatch[0]);

      // Store in cache
      const nowTs = new Date();
      await insertVisaRequirementCache({
        passportCountry: passportCountry.toLowerCase(),
        destinationCountry: destinationCountry.toLowerCase(),
        visaRequired: Boolean(parsed.visa_required),
        visaTypes: parsed.visa_types || [],
        requiredDocuments: parsed.required_documents || [],
        processingTime: parsed.processing_time || null,
        feeRange: parsed.fee_range || null,
        disclaimer: parsed.disclaimer || null,
      });

      res.json({
        visaRequired: parsed.visa_required,
        visaTypes: parsed.visa_types || [],
        requiredDocuments: parsed.required_documents || [],
        processingTime: parsed.processing_time,
        feeRange: parsed.fee_range,
        disclaimer: parsed.disclaimer,
        fromCache: false,
        cachedAt: nowTs,
      });
    } catch (err) {
      console.error("[Visa] requirements error:", err);
      res.status(500).json({ message: "Failed to fetch visa requirements" });
    }
  });

  // GET /api/visa/experts — returns visa-assistance services with real provider names

router.get("/api/visa/experts", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string || "6"), 20);
      const services = await getVisaAssistanceServices(limit);
      res.json({ services, total: services.length });
    } catch (err) {
      console.error("[Visa] experts error:", err);
      res.status(500).json({ message: "Failed to fetch visa experts" });
    }
  });


router.get("/api/expert/contracts/recent", isAuthenticated, async (req, res) => {
    try {
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      const limit = Math.min(parseInt(req.query.limit as string || "20"), 100);
      res.json(await getRecentExpertContracts(limit));
    } catch (err) {
      console.error("[Expert] getContracts error:", err);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  // ─── Content Placement Rules (Admin) ────────────────────────────────────────

  // Local admin guard for this scope (requireAdmin is defined in the outer registerRoutes scope)
  const requireAdminLocal = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
    const role = await getUserRole(req.user?.claims?.sub);
    if (role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
  };

  // GET /api/admin/content-placement-rules — list with optional filters

export default router;
