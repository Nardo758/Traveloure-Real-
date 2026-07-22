import { verifyTripOwnership } from '../utils/trip-ownership';
import { checkProviderPublishGate } from '../services/provider-publish.service';
import { withQueryTimer } from '../utils/queryTimer';
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, isNull, asc } from "drizzle-orm";
import {
  getLocalExpertFormByUserId, getServiceProviderFormByUserId, getProviderVerificationStatus,
  getExpertServiceOfferingById, getTravelPulseData,
  getExpertAiTasks, createExpertAiTask, updateExpertAiTask,
  getExpertAiTaskById, getExpertAiTasksSince, insertAiInteractionForExpert,
  getAvailableSchedulesByDay, getAllProviderBlackoutDates,
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
import { partnerEventsCacheService } from "../services/partner-events-cache.service";
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

      // No application submitted — tell the client so it can prompt the user.
      if (!formRow) {
        return res.json({ requiresApplication: true, templates: [] });
      }

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

      res.json({ requiresApplication: false, templates });
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
      const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
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
      const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
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
      const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
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
      const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
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
      const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
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


// [dead-dup removed] GET/POST/DELETE /api/provider/availability lived here on a weekly-schedule +
// blackout model, but are DEAD: the mounted routes.ts already serves the same paths on a per-date
// vendor-slot model (routes.ts:7999-8070), which wins (registered first; this router was never
// mounted). Removed as duplicate code. NOTE (filed): the two impls diverge on the data model
// (weekly-schedule+blackout vs vendor-slots) — the live one does NOT read blackout dates; the
// blackout write endpoints below are consequently orphaned pending the availability-model decision.

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

  // NOTE: GET/PATCH /api/provider/settings were extracted to the MOUNTED
  // server/routes/provider.routes.ts (Kyoto-supply activation). The copies here were dark
  // (this file is imported-but-unmounted) and referenced an undefined `requireProviderRole`,
  // so they would have thrown even if reached. See CLAUDE.md §9.

  // === Itinerary Items CRUD (PATCH + DELETE only; GET/POST defined at Itinerary Intelligence Routes) ===
  async function canAccessTripItems(tripId: string, userId: string): Promise<boolean> {
    const owned = await verifyTripOwnership(tripId, userId);
    if (owned) return true;
    return await storage.isExpertAssignedToTrip(tripId, userId);
  }



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
