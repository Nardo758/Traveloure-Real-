import { verifyTripOwnership } from '../utils/trip-ownership';
import { authorizeTripLogistics } from '../utils/trip-logistics-auth';
import { checkProviderPublishGate } from '../services/provider-publish.service';
import { withQueryTimer } from '../utils/queryTimer';
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { createRateLimiter } from "../infrastructure/rate-limiter";
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
  aiBlueprints, vendors, insertVendorSchema, expertVendorCoordination,
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
  // Read-only, for the audit-logged admin override on the booking-request respond gate
  // (resolving the row's REAL owner so the storage-layer owner predicate still applies).
  providerBookingRequests,
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

/**
 * Resolves an `expert_vendor_coordination` row to the trip it belongs to, so the
 * `:vendorId`-scoped handlers (PUT/DELETE) can run the SAME per-trip authorization as their
 * `:tripId`-scoped siblings. `expert_vendor_coordination.trip_id` is NOT NULL with an
 * `ON DELETE CASCADE` FK to `trips` (shared/schema.ts), so every vendor row has exactly one
 * authoritative trip — no linkage had to be invented.
 *
 * Returns null when no such vendor row exists; callers must NOT treat that as authorized.
 */
async function getVendorCoordinationTripId(vendorId: string): Promise<string | null> {
  const [row] = await db
    .select({ tripId: expertVendorCoordination.tripId })
    .from(expertVendorCoordination)
    .where(eq(expertVendorCoordination.id, vendorId))
    .limit(1);
  return row?.tripId ?? null;
}




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
      // SECURITY (§13 trip-data IDOR class): the platform-role check above is NOT authorization —
      // it only proves the caller is *an* expert, not an expert on THIS trip. Without the canonical
      // per-trip gate any expert account could read any traveler's anchors/energy/vendor set.
      const authError = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/expert/trips/:tripId/constraints",
      );
      if (authError) return res.status(authError.status).json({ message: authError.message });
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
      // SECURITY (§13 trip-data IDOR class): per-trip authorization, not just "is an expert".
      const authError = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/expert/trips/:tripId/vendors",
      );
      if (authError) return res.status(authError.status).json({ message: authError.message });
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
      // SECURITY (§13 trip-data IDOR class): per-trip authorization BEFORE the write, so an
      // unassigned expert cannot plant vendor records on another traveler's trip.
      const authError = await authorizeTripLogistics(
        req.params.tripId, userId, "POST /api/expert/trips/:tripId/vendors",
      );
      if (authError) return res.status(authError.status).json({ message: authError.message });
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
      // SECURITY (§13 trip-data IDOR class): there is no :tripId in this path, so resolve the
      // vendor row to its OWNING trip and authorize THAT trip. A vendor id that does not exist is
      // never authorized (404 below, matching this handler's existing not-found convention).
      const vendorTripId = await getVendorCoordinationTripId(req.params.vendorId);
      if (!vendorTripId) return res.status(404).json({ message: "Vendor not found" });
      const authError = await authorizeTripLogistics(
        vendorTripId, userId, "PUT /api/expert/vendors/:vendorId",
      );
      if (authError) return res.status(authError.status).json({ message: authError.message });
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
      // SECURITY (§13 trip-data IDOR class): resolve the vendor row to its OWNING trip and
      // authorize THAT trip before the destructive delete. An unknown vendor id keeps this
      // handler's existing idempotent-delete response (200 {success:true}) — nothing is deleted
      // and no existence oracle is introduced — but it is NEVER treated as authorization.
      const vendorTripId = await getVendorCoordinationTripId(req.params.vendorId);
      if (vendorTripId) {
        const authError = await authorizeTripLogistics(
          vendorTripId, userId, "DELETE /api/expert/vendors/:vendorId",
        );
        if (authError) return res.status(authError.status).json({ message: authError.message });
        await storage.deleteVendorCoordination(req.params.vendorId);
      }
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
      // SECURITY (§13 cross-provider IDOR, class B): this handler used to gate on the provider
      // ROLE STRING only and then call `storage.deleteProviderBlackoutDate(id)`, which filtered
      // on the id alone — so ANY provider could delete ANY other provider's blackout row
      // (proven: provider-2 deleted provider-1's row). The owner predicate now lives in the
      // storage WHERE clause; here we only decide WHICH owner scope the caller may act in.
      //
      // Non-admin: the scope is the session user, full stop — a provider can only ever delete
      // their own row. Admin: preserved as an explicit, audit-logged override that resolves the
      // row's REAL owner and passes it through (so the data-layer predicate still applies rather
      // than being bypassed). A row that does not exist and a row the caller does not own return
      // the SAME 404 — no cross-provider existence oracle.
      let ownerScope = userId as string;
      if (user.role === "admin") {
        const row = await storage.getProviderBlackoutDateById(req.params.id);
        if (!row) return res.status(404).json({ message: "Blackout date not found" });
        ownerScope = row.providerId;
        console.log(
          `[audit] admin cross-provider blackout delete actor=${userId} providerId=${ownerScope} blackoutId=${req.params.id}`,
        );
      }
      const deleted = await storage.deleteProviderBlackoutDate(req.params.id, ownerScope);
      if (!deleted) return res.status(404).json({ message: "Blackout date not found" });
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
      // SECURITY (§13 cross-provider IDOR, class B): this handler used to gate on the provider
      // ROLE STRING only and then call `storage.updateBookingRequest(id, …)`, which filtered on
      // the id alone — so provider-2 could ACCEPT provider-1's booking request, taking a real
      // business decision on another merchant's behalf (proven). The owner predicate now lives
      // in the storage WHERE clause; here we only decide WHICH owner scope the caller may act in.
      //
      // Non-admin: the scope is the session user, full stop — so the live consumer
      // (client/src/components/logistics/provider-booking-context.tsx on /provider/dashboard)
      // keeps working unchanged for the row's real owner. Admin: preserved as an explicit,
      // audit-logged override that resolves the row's REAL owner and passes it through, so the
      // data-layer predicate still applies rather than being bypassed. A request that does not
      // exist and one the caller does not own both return the SAME 404 — no existence oracle.
      let ownerScope = userId as string;
      if (user.role === "admin") {
        const [row] = await db
          .select({ providerId: providerBookingRequests.providerId })
          .from(providerBookingRequests)
          .where(eq(providerBookingRequests.id, req.params.requestId))
          .limit(1);
        if (!row) return res.status(404).json({ message: "Request not found" });
        ownerScope = row.providerId;
        console.log(
          `[audit] admin cross-provider booking-request respond actor=${userId} providerId=${ownerScope} requestId=${req.params.requestId}`,
        );
      }
      const updated = await storage.updateBookingRequest(req.params.requestId, ownerScope, {
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


  // Knowledge-nugget CRUD ported to the MOUNTED server/routes/expert-console.routes.ts
  // (sidebar-audit repair, 2026-07-25) — do not re-add handlers here (§9: no stale twins).


  // GET /api/admin/local-experts/nugget-counts — nugget count per local expert

// Rate limit for the visa lookup below. This replaces a reference to an undefined
// `visaRateLimit(ip)` — the name existed nowhere in the codebase, so every call to this
// PUBLIC, UNAUTHENTICATED endpoint threw a ReferenceError before it did anything (the same
// shape as the undefined `requireProviderRole` §9 records). The throttle was clearly
// intended — the handler falls through to a cache-miss AI/external lookup, i.e. real spend
// on an unauthenticated route — so it is implemented with the real primitive rather than
// deleted. Middleware, because that is what createRateLimiter returns; the hand-rolled
// `if (limiter(ip))` shape it was written against does not exist.
const visaRequirementsLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) =>
    `visa-requirements:${(req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown"}`,
  handler: (_req, res) => {
    res.status(429).json({ message: "Too many requests. Please wait a minute before trying again." });
  },
});

router.post("/api/visa/requirements", visaRequirementsLimiter, async (req, res) => {
    try {
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
      // SECURITY (migration 157): `expertId` was computed here and then never passed, so this
      // returned the 20 most recent contracts PLATFORM-WIDE — other earners' service names,
      // client destinations and amounts — to any authenticated caller. It is now the required
      // first argument, so the scope is visible at the call site and the compiler enforces it.
      const expertId = (req.user as any).id || (req.user as any).claims?.sub;
      if (!expertId) return res.status(401).json({ message: "Not authenticated" });
      const limit = Math.min(parseInt(req.query.limit as string || "20"), 100);
      res.json(await getRecentExpertContracts(expertId, limit));
    } catch (err) {
      console.error("[Expert] getContracts error:", err);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  // ─── Content Placement Rules (Admin) ────────────────────────────────────────

  // Local admin guard for this scope (requireAdmin is defined in the outer registerRoutes scope)
  const requireAdminLocal = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
    const role = await getUserRole((req.user as any)?.claims?.sub ?? (req.user as any)?.id);
    if (role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
  };

  // GET /api/admin/content-placement-rules — list with optional filters

export default router;
