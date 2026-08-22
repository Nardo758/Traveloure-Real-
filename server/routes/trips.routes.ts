import { verifyTripOwnership } from '../utils/trip-ownership';
import { getUserId } from "../utils/auth";
import { authorizeTripLogistics, authorizeTripOwnerTier } from '../utils/trip-logistics-auth';
import { createRateLimiter } from "../infrastructure/rate-limiter";
import { withQueryTimer } from '../utils/queryTimer';
import path from "path";
import fs from "fs";
import { transformDevHtml } from "../vite-dev-html";
import crypto from "crypto";
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
// W2 (Trip-Canon Lane 1 Phase 1b): `cart_items` has exactly ONE writer — the projection module.
// NOTE: the apply-to-cart handler below is a §9 SHADOWED copy (this router mounts LAST, so the
// inline routes.ts copy wins the path). It is re-pointed anyway so no live-or-dead file retains a
// direct cart write. Passthrough; behavior identical.
import * as cartProjection from "../services/cart-projection.service";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
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
  localKnowledgeNuggets, insertLocalKnowledgeNuggetSchema,
  contentPlacementRules,
  optimizationFees,
  experienceTypes,
  type InsertContentPlacementRule,
} from "@shared/schema";
import {
  TAB_CONTENT_TYPE_MAP,
  TAB_AFFILIATE_CATEGORIES,
  SURFACE_DEFAULT_CONTENT_TYPES,
  SURFACE_DEFAULT_AFFILIATE_CATEGORIES,
  SURFACE_SLUGS,
} from "@shared/content-surface-map";
// L3b′: the itinerary-share / OG family renders from the ONE TripPlan service's VARIANT producer
// (docs/EXECUTION_MAP.md §3, CLAUDE.md §18) instead of its own hand-rolled variant shape.
import {
  assembleTripPlanFromVariant,
  TripPlanVariantNotFoundError,
} from "../services/trip-plan.service";
import type { PreviewTripPlan, VariantFullTripPlan } from "@shared/trip-plan";
// §18 L4 (migration 154): trip-scoped legs live in the same table behind their own service.
import { getTripTransportLegs, isTripScopedLeg } from "../services/trip-transport-legs.service";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant, type TripPreferences } from "../itinerary-optimizer";
import { complexityTier } from "../services/smart-sequencing.service";
import { getFee } from "../services/optimization-fee.service";
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
import { travelPulseService } from "../services/travelpulse.service";
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
  resolveCommissionRates,
  type CommissionRates,
} from "../services/commission";
import { getTripRole, getTripWriteRole, canMutateTrip } from "../utils/trip-role";
import { isTripAuthor } from "../utils/trip-authorship";
// Plan-approval mode-flip (migration 164, QA_PUNCH_LIST W2-A item 13): see routes.ts's import of
// the same module for the full rationale. Advisor-only gate — never owner, never author.
import { isPlanApprovedForExpert, PLAN_APPROVED_SUGGEST_INSTEAD_ERROR } from "../utils/plan-approval";

import { trackAnthropicResponse } from "../services/ai-cost-tracker";

const router = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Session-shape-safe user id read. Email/password sessions carry
// { claims: { sub: userId } } with no top-level req.user.id — a bare
// `(req as any).user?.id` read is always undefined for those sessions
// (the ea.routes.ts getEaUserId fallback pattern, applied here for the
// same bug class on the itinerary-share/expert-review surface).
function getReqUserId(req: any): string | undefined {
  return getUserId(req)!;
}

// SECURITY (§13 trip-data IDOR class): POST /api/trips/:tripId/vendors/bulk-email is an
// OUTBOUND-MAIL primitive — it fans caller-authored subject/body out to real vendor
// addresses under the platform's sending identity. Authorization alone does not bound
// abuse (a legitimate owner can still be used to blast their own vendor list), so the
// endpoint is throttled per acting user, mirroring the service-requests limiter pattern
// (server/routes/service-requests.routes.ts) rather than inventing a new mechanism.
// Keyed by the session user (isAuthenticated runs first), IP as fallback. Deliberately NO
// loopback skip: the throttle is part of the endpoint's contract and must be provable.
const vendorBulkEmailLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxRequests: 5,
  keyGenerator: (req: any) => `vendor-bulk-email:${getReqUserId(req) ?? req.ip ?? "unknown"}`,
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


router.get(api.trips.list.path, isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const status = req.query.status as string | undefined;
    const trips = await withQueryTimer(
      "trips-dashboard-list",
      () => storage.getTrips(userId, status),
      (req.user as any)?.claims?.role
    );
    res.json(trips);
  });


router.get(api.trips.get.path, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }
    // Check access: owner, assigned expert, managing EA, or guest with shareToken.
    // requireOwnership middleware cannot be used here because unauthenticated guests
    // may access via shareToken — so ownership is enforced inline with IDOR logging.
    const userId = getUserId(req)!;
    const shareToken = req.query.token as string | undefined;

    // Block fully-anonymous requests with neither a session nor a share token.
    const hasSession = typeof (req as any).isAuthenticated === "function" && (req as any).isAuthenticated();
    const hasToken = typeof shareToken === "string" && shareToken.length > 0;
    if (!hasSession && !hasToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const isOwner = trip.userId && trip.userId === userId;
    const isExpert = userId != null && (trip as any).expertId === userId;
    const isManagingEa = userId != null && (trip as any).managedByEaId === userId;
    const isGuestWithToken = shareToken && trip.shareToken === shareToken;
    if (!isOwner && !isExpert && !isManagingEa && !isGuestWithToken) {
      if (userId) {
        console.warn(
          `[IDOR ATTEMPT] User ${userId} tried to access resource owned by ` +
            `${trip.userId} at GET ${req.path}`
        );
      }
      return res.status(403).json({ message: "Access denied" });
    }

    // GAP 5 fix (expert-loop object-flow audit, Jul 30 2026): "delivered" previously had no
    // persistent signal on the trip itself — only a one-shot notification the traveler could
    // dismiss/miss, with no fallback UI truth. Additive, server-only field (a sibling agent
    // renders it): the most recent active (pending/accepted) assignment's workspaceStatus, or
    // null when no expert is currently assigned.
    const [advisorRow] = await db.select({ workspaceStatus: tripExpertAdvisors.workspaceStatus })
      .from(tripExpertAdvisors)
      .where(and(
        eq(tripExpertAdvisors.tripId, trip.id),
        inArray(tripExpertAdvisors.status, ["pending", "accepted"]),
      ))
      .orderBy(desc(tripExpertAdvisors.assignedAt))
      .limit(1);

    // §21 (ratified Aug 9 2026): `trips.expertNotes` is the Workstation's PRIVATE build-note
    // field (PATCH /api/trips/:tripId/expert-notes, booking-actions.ts) — it must never be
    // delivered to the traveler. This handler's viewer set includes the trip OWNER (the
    // traveler themselves) and a plain-shareToken guest, neither of which is a builder-side
    // principal; only the trip-column expert / managing EA is. Redact it here rather than trust
    // every future consumer of the `...trip` spread to know not to render it — the same posture
    // `/api/itinerary-share/:token` below already takes for its own (unrelated)
    // `shared_itineraries.expertNotes` column. `expertTravelerNote` (§21's traveler-facing
    // counterpart) is NOT redacted — it is meant for exactly this audience.
    const canSeePrivateExpertNotes = isExpert || isManagingEa;
    res.json({
      ...trip,
      expertNotes: canSeePrivateExpertNotes ? trip.expertNotes : null,
      expertWorkspaceStatus: advisorRow?.workspaceStatus ?? null,
    });
  });


// POST /api/trips — create a trip (guest or authenticated)
// Guests get null userId; authenticated users get their userId.
// Guests receive a shareToken to access the trip until sign-up.
router.post(api.trips.create.path, async (req, res) => {
    try {
      const input = api.trips.create.input.parse(req.body);
      // Sanitize string inputs to prevent XSS
      const sanitizedInput = sanitizeObject(input);
      
      // Additional validations
      if (sanitizedInput.startDate && sanitizedInput.endDate) {
        if (new Date(sanitizedInput.endDate) < new Date(sanitizedInput.startDate)) {
          return res.status(400).json({ message: "End date must be on or after start date" });
        }
      }
      if (sanitizedInput.budget && parseFloat(sanitizedInput.budget) < 0) {
        return res.status(400).json({ message: "Budget must be a positive number" });
      }
      
      const userId = getUserId(req)!;
      const trip = await storage.createTrip({ ...sanitizedInput, userId });

      // If guest, ensure they have a shareToken for access
      if (!userId && !trip.shareToken) {
        const token = crypto.randomBytes(32).toString("hex");
        const updated = await storage.setTripShareToken(trip.id, token);
        return res.status(201).json(updated);
      }

      res.status(201).json(trip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });


// PATCH /api/trips/:id — update trip (auth: owner/EA, or guest via shareToken)
router.patch(api.trips.update.path, async (req, res) => {
    try {
      const input = api.trips.update.input.parse(req.body);
      // Sanitize string inputs to prevent XSS
      const sanitizedInput = sanitizeObject(input);
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const userId = getUserId(req)!;
      const shareToken = req.query.token as string | undefined;
      const isOwner = trip.userId && trip.userId === userId;
      const isManagingEa = (trip as any).managedByEaId === userId;
      const isGuestWithToken = shareToken && trip.shareToken === shareToken;

      if (!isOwner && !isManagingEa && !isGuestWithToken) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const updatedTrip = await storage.updateTrip(req.params.id, sanitizedInput);
      res.json(updatedTrip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

// POST /api/trips/:id/claim — link a guest trip to an authenticated user
// Called after a guest signs up, to claim their draft trips.
router.post("/api/trips/:id/claim", isAuthenticated, async (req, res) => {
    try {
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const { shareToken } = req.body;
      if (!shareToken || trip.shareToken !== shareToken) {
        return res.status(401).json({ message: "Invalid share token" });
      }

      // Only unclaimed (null userId) trips can be claimed
      if (trip.userId) {
        return res.status(409).json({ message: "Trip already claimed" });
      }

      const userId = getUserId(req)!;
      const updated = await storage.claimTrip(req.params.id, userId);
      res.json(updated);
    } catch (err) {
      console.error("[trips] claim error:", err);
      res.status(500).json({ message: "Failed to claim trip" });
    }
  });


router.delete(api.trips.delete.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    
    const userId = getUserId(req)!;
    if (trip.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

    await storage.deleteTrip(req.params.id);
    res.status(204).send();
  });


// REMOVED (Lane 2a): duplicate of the hardcoded 2-day stub (see routes.ts). Zero
// producers; real generation is the Claude/Grok AI paths. Deleted with its inline twin.


// §9 mount-order-dead twin (this handler always loses to the identically-routed
// POST /api/trips/:id/generate-itinerary in routes.ts — see registerRoutes' tripsRoutes
// mount comment). Kept in sync for safety only.
//
// NOT widened to match the live copy's gate (deliberate, per this lane's brief). The live
// copy now authorizes via a composite predicate — `authorizeTripLogistics` (owner ‖
// trip_expert_advisors-assigned expert ‖ trip author ‖ audit-logged admin) OR the two trip
// columns `trip.expertId`/`trip.managedByEaId` — while THIS handler still only checks
// `trip.userId === callerUserId || admin`. That is an UNDER-grant relative to the live
// copy (it would 403 an assigned advisor, a `trips.expertId`-linked expert, or a managing
// EA), not a hole — the narrower check never admits anyone the live copy would deny. Do
// NOT copy the live composite predicate over here mechanically: which principals
// `authorizeTripLogistics` itself should admit is the trip-role lane's call (see CLAUDE.md
// §13 "Trip-access model divergence + owner under-grant (L10)"), and the reconciliation
// sweep (§9) must resolve this pair's auth model deliberately, not have it inherited
// silently from a dead-twin sync pass.
router.post(api.trips.generateItinerary.path, isAuthenticated, async (req, res) => {
    try {
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      // IDOR guard — only the trip owner (or admin) may generate an itinerary.
      // Without this, any authenticated user could burn AI credits and overwrite
      // another user's itinerary_items by guessing a trip UUID.
      const callerUserId = getUserId(req)!;
      const callerRole = (req.user as any)?.claims?.role ?? (req.user as any)?.role;
      if (trip.userId && String(trip.userId) !== String(callerUserId) && callerRole !== "admin") {
        console.warn(
          `[IDOR ATTEMPT] User ${callerUserId} tried to generate itinerary for trip ` +
          `owned by ${trip.userId} at ${req.path}`
        );
        return res.status(403).json({ message: "Access denied" });
      }

      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const destination = trip.destination || "the destination";
      const travelers = trip.numberOfTravelers || 1;
      const preferences = trip.preferences || "";

      let itineraryData: any;

      try {
        const prompt = `Create a detailed ${duration}-day travel itinerary for ${destination} for ${travelers} traveler(s).${preferences ? ` Preferences: ${preferences}.` : ""}

Return ONLY valid JSON in this exact structure:
{
  "days": [
    {
      "day": 1,
      "title": "Day theme title",
      "activities": [
        {
          "time": "09:00 AM",
          "title": "Activity name",
          "description": "2-3 sentence description",
          "type": "sightseeing|food|travel|rest|adventure|shopping|culture",
          "locationName": "Specific place name",
          "durationMinutes": 90,
          "estimatedCost": 20
        }
      ]
    }
  ]
}

Include 4-6 activities per day. Make it realistic, specific to ${destination}, and culturally accurate.`;

        const completion = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }],
        });
        trackAnthropicResponse(completion, { sourceType: "ai_traveler" });

        const text = (completion.content[0] as any).text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        itineraryData = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      } catch (aiErr) {
        console.error("AI generation failed, using contextual fallback:", aiErr);
        itineraryData = {
          days: Array.from({ length: duration }, (_, i) => ({
            day: i + 1,
            title: i === 0 ? "Arrival & Orientation" : i === duration - 1 ? "Departure Day" : `Exploration Day ${i + 1}`,
            activities: [
              { time: "09:00 AM", title: `Morning in ${destination}`, description: `Start your day exploring the highlights of ${destination}.`, type: "sightseeing", locationName: destination, durationMinutes: 120, estimatedCost: 0 },
              { time: "12:00 PM", title: "Local Lunch", description: `Try authentic local cuisine in ${destination}.`, type: "food", locationName: "Local Restaurant", durationMinutes: 60, estimatedCost: 20 },
              { time: "2:00 PM", title: "Cultural Experience", description: `Immerse yourself in the culture and history of ${destination}.`, type: "culture", locationName: destination, durationMinutes: 150, estimatedCost: 15 },
              { time: "7:00 PM", title: "Dinner", description: "Enjoy a relaxing dinner after a full day.", type: "food", locationName: "Local Restaurant", durationMinutes: 90, estimatedCost: 30 },
            ],
          })),
        };
      }

      // Upsert: update if exists, create if not
      const existing = await storage.getGeneratedItineraryByTripId(trip.id);
      let itinerary;
      if (existing) {
        itinerary = await storage.updateGeneratedItineraryData(existing.id, itineraryData, "generated");
      } else {
        itinerary = await storage.createGeneratedItinerary({ tripId: trip.id, itineraryData, status: "generated" });
      }

      // Rebuild itinerary_items — delete old, insert new
      const newItems: any[] = [];
      for (const day of itineraryData.days || []) {
        for (const activity of day.activities || []) {
          newItems.push({
            tripId: trip.id,
            title: activity.title || "Activity",
            description: activity.description || "",
            itemType: activity.type || "activity",
            status: "planned",
            dayNumber: day.day,
            startTime: activity.time || "",
            durationMinutes: activity.durationMinutes || 60,
            locationName: activity.locationName || destination,
            estimatedCost: activity.estimatedCost != null ? String(activity.estimatedCost) : null,
            currency: "USD",
            // §12 origin stamp (ledger 2026-08-22-provenance-defects): this rebuild is the AI
            // generator's output — without the stamp a whole AI-built plan landed origin-NULL,
            // which the schema defines as permanently ambiguous. Server-derived, never from a body.
            origin: "ai",
          });
        }
      }
      await storage.replaceItineraryItems(trip.id, newItems);

      res.status(201).json(itinerary);
    } catch (err) {
      console.error("Error generating itinerary:", err);
      res.status(500).json({ message: "Failed to generate itinerary" });
    }
  });

  // Create generated itinerary (save AI-generated itinerary)

router.get(api.touristPlaces.search.path, async (req, res) => {
    const query = req.query.query as string;
    if (!query) return res.json([]);
    const results = await storage.searchTouristPlaces(query);
    res.json(results);
  });

  // Chats Routes
  // SECURITY: User data is sanitized and contact info in messages is redacted

router.get(api.chats.list.path, isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const userRole = (req.user as any).claims.role || 'user';
    const chats = await storage.getChats(userId);
    
    // Log access for audit trail
    storage.logAccess({
      actorId: userId,
      actorRole: userRole,
      action: 'view_chats',
      resourceType: 'chat',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    // Enrich chats with sanitized participant info and redacted messages
    const enrichedChats = await Promise.all(chats.map(async (chat) => {
      // Get the other participant's info (sanitized)
      const otherUserId = chat.senderId === userId ? chat.receiverId : chat.senderId;
      
      // Redact any contact info from message content
      const redactedMessage = redactContactInfo(chat.message);
      
      let participant = null;
      if (otherUserId) {
        const otherUser = await storage.getUser(otherUserId);
        if (otherUser) {
          const sanitizedUser = sanitizeUserForRole(otherUser, userRole, false);
          participant = {
            ...sanitizedUser,
            displayName: getDisplayName(otherUser.firstName, otherUser.lastName)
          };
        }
      }
      
      return {
        ...chat,
        message: redactedMessage, // Contact info redacted
        participant
      };
    }));
    
    res.json(enrichedChats);
  });


router.post(api.chats.create.path, isAuthenticated, async (req, res) => {
     try {
      const input = api.chats.create.input.parse(req.body);
      // For MVP, just create it directly
      const chat = await storage.createChat(input);
      res.status(201).json(chat);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Help Guide Trips Routes

router.get(api.helpGuideTrips.list.path, async (req, res) => {
    const trips = await storage.getHelpGuideTrips();
    res.json(trips);
  });


router.get(api.helpGuideTrips.get.path, async (req, res) => {
    const trip = await storage.getHelpGuideTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  });

  // AI Blueprint Generation API

// §9 Lane 5a (Defect 1): the `POST /api/itinerary-comparisons` handler that lived here was a
// mount-order-dead twin of the inline copy in routes.ts (this router mounts LAST, so its copy
// always lost the path race). It carried the ONLY paid-optimization gate; that gate is now
// harvested into the live routes.ts copy and this born-dead duplicate is DELETED — the §9 rule
// is "harvest the superior delta into the live copy, leave no stale twin behind".


router.get("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const comparisons = await withQueryTimer(
        "itinerary-comparisons-fetch",
        () => storage.getComparisonsByUserId(userId),
        (req.user as any)?.role
      );
      res.json(comparisons);
    } catch (error) {
      console.error("Error fetching comparisons:", error);
      res.status(500).json({ message: "Failed to fetch comparisons" });
    }
  });


router.get("/api/itinerary-comparisons/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const result = await getComparisonWithVariants(req.params.id);

      if (!result) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (result.comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching comparison:", error);
      res.status(500).json({ message: "Failed to fetch comparison" });
    }
  });


router.post("/api/itinerary-comparisons/:id/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const comparisonId = req.params.id;
      const { baselineItems: inlineBaselineItems, feedback: rawFeedback } = req.body;

      // Sprint-1 dislike loop: whitelisted "what to fix" chips from a re-run.
      // They flow into TripPreferences.feedback, where selectVariantStrategy
      // gives them top priority over inferred preferences.
      const FEEDBACK_CHIPS = new Set(["too_expensive", "too_packed", "wrong_areas", "wrong_vibe"]);
      const dislikeFeedback: string[] = Array.isArray(rawFeedback)
        ? rawFeedback.filter((f: unknown): f is string => typeof f === "string" && FEEDBACK_CHIPS.has(f)).slice(0, 4)
        : [];

      const comparison = await storage.getItineraryComparison(comparisonId);

      if (!comparison) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let baselineItems: any[] = [];

      if (inlineBaselineItems && inlineBaselineItems.length > 0) {
        baselineItems = inlineBaselineItems.map((item: any, index: number) => ({
          id: `inline-${index}`,
          name: item.name,
          description: item.description || "",
          serviceType: "external",
          price: parseFloat(item.price || "0"),
          // §13: no fabricated fallback rating — unknown stays unknown.
          rating: typeof item.rating === "number" ? item.rating : undefined,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else if (comparison.userExperienceId) {
        const items = await storage.getUserExperienceItems(comparison.userExperienceId);

        baselineItems = items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          serviceType: item.providerServiceId ? "provider" : "external",
          price: parseFloat(item.price || "0"),
          // §13: user-experience items have no rating source — omit, don't invent.
          location: item.location,
          duration: 120,
          dayNumber: 1,
          timeSlot: item.scheduledTime || "morning",
        }));
      } else {
        const cartItemsData = await storage.getCartItemsWithServices(userId);

        baselineItems = cartItemsData.map((item, index) => ({
          id: item.cartItem.id,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          // §13: only the service's REAL aggregate; no 4.5 stand-in for unrated.
          rating: item.service?.averageRating ? parseFloat(item.service.averageRating) : undefined,
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
        }));
      }

      if (baselineItems.length === 0) {
        return res.status(400).json({ message: "No items to optimize. Add services to your cart or experience first." });
      }

      const availableServices = await storage.getActiveProviderServices(100);

      res.json({ message: "Optimization started", status: "generating" });

      // Build trip preferences for adaptive variant strategy. Dislike feedback
      // applies even without a trip row (it's an explicit instruction, not an
      // inferred preference).
      let tripPreferencesForGen: TripPreferences | undefined =
        dislikeFeedback.length > 0 ? { feedback: dislikeFeedback } : undefined;
      if (comparison.tripId) {
        const tripRowForGen = await storage.getTrip(comparison.tripId);
        if (tripRowForGen) {
          const prefsForGen = (tripRowForGen.preferences as Record<string, any>) || {};
          tripPreferencesForGen = {
            eventType: tripRowForGen.eventType,
            budget: tripRowForGen.budget ? parseFloat(tripRowForGen.budget) : null,
            travelStyles: Array.isArray(prefsForGen.travelStyles) ? prefsForGen.travelStyles : [],
            ...(dislikeFeedback.length > 0 ? { feedback: dislikeFeedback } : {}),
          };
        }
      }

      generateOptimizedItineraries(
        comparisonId,
        userId,
        baselineItems,
        availableServices,
        comparison.destination || "Unknown",
        comparison.startDate || new Date().toISOString(),
        comparison.endDate || new Date().toISOString(),
        comparison.budget ? parseFloat(comparison.budget) : undefined,
        comparison.travelers || 1,
        comparison.tripId || undefined,
        undefined,
        tripPreferencesForGen
      ).catch((err) => console.error("Background optimization error:", err));

    } catch (error) {
      console.error("Error starting optimization:", error);
      res.status(500).json({ message: "Failed to start optimization" });
    }
  });


router.post("/api/itinerary-comparisons/:id/select", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { variantId } = req.body;

      const comparison = await storage.getItineraryComparison(req.params.id);

      if (!comparison) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await selectVariant(req.params.id, variantId);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: "Variant selected", variant: result.variant });
    } catch (error) {
      console.error("Error selecting variant:", error);
      res.status(500).json({ message: "Failed to select variant" });
    }
  });


router.post("/api/itinerary-comparisons/:id/apply-to-cart", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const comparisonId = req.params.id;

      const comparison = await storage.getItineraryComparison(comparisonId);

      if (!comparison || comparison.userId !== userId) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (!comparison.selectedVariantId) {
        return res.status(400).json({ message: "No variant selected" });
      }

      const variantItems = await storage.getItineraryVariantItemsByVariantId(comparison.selectedVariantId);
      await cartProjection.replaceUserCartWithVariantItems(userId, variantItems);
      res.json({ message: "Cart updated with selected itinerary", itemsAdded: variantItems.length });
    } catch (error) {
      console.error("Error applying to cart:", error);
      res.status(500).json({ message: "Failed to apply itinerary to cart" });
    }
  });

  // === COORDINATION HUB API ROUTES ===

  // Vendor Availability Slots

  const quickStartItinerarySchema = z.object({
    destination: z.string().min(1),
    country: z.string().optional(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
    travelers: z.number().min(1).default(2),
    interests: z.array(z.string()).default([]),
    pacePreference: z.enum(["relaxed", "moderate", "packed"]).default("moderate"),
  });

router.post("/api/quick-start-itinerary", isAuthenticated, async (req, res) => {
    try {
      const parsed = quickStartItinerarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = getUserId(req)!;
      const { destination, country, dates, travelers, interests, pacePreference } = parsed.data;

      // Fetch city intelligence from TravelPulse
      const cityIntelligence = await travelPulseService.getCityIntelligence(destination);
      
      // Build TravelPulse context for the AI
      let travelPulseContext: any = undefined;
      
      if (cityIntelligence) {
        const city = cityIntelligence.city;
        travelPulseContext = {
          pulseScore: city.pulseScore,
          trendingScore: city.trendingScore,
          crowdLevel: city.crowdLevel,
          aiBudgetEstimate: city.aiBudgetEstimate,
          aiTravelTips: city.aiTravelTips,
          aiLocalInsights: city.aiLocalInsights,
          aiMustSeeAttractions: city.aiMustSeeAttractions,
          aiSeasonalHighlights: city.aiSeasonalHighlights,
          aiUpcomingEvents: city.aiUpcomingEvents,
          hiddenGems: cityIntelligence.hiddenGems?.slice(0, 5).map((g: any) => ({
            name: g.name,
            description: g.description,
            gemScore: g.gemScore,
          })),
          happeningNow: cityIntelligence.happeningNow?.slice(0, 5).map((h: any) => ({
            name: h.name,
            type: h.type,
          })),
        };
      }

      // Generate default dates if not provided (3-day trip starting tomorrow)
      const startDate = dates?.start || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = dates?.end || new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Generate itinerary with city intelligence context
      const itineraryRequest = {
        destination: country ? `${destination}, ${country}` : destination,
        dates: { start: startDate, end: endDate },
        travelers,
        interests: interests.length > 0 ? interests : ["culture", "food", "nature"],
        pacePreference,
        travelPulseContext,
      };

      const result = await aiOrchestrator.generateAutonomousItinerary(itineraryRequest, {
        userId,
      });

      // Store generated itinerary
      const saved = await storage.saveAiGeneratedItinerary({
        userId,
        destination: itineraryRequest.destination,
        startDate: itineraryRequest.dates.start,
        endDate: itineraryRequest.dates.end,
        title: result.title,
        summary: result.summary,
        totalEstimatedCost: result.totalEstimatedCost?.toString(),
        itineraryData: result.dailyItinerary,
        accommodationSuggestions: result.accommodationSuggestions || [],
        packingList: result.packingList || [],
        travelTips: result.travelTips || [],
        provider: "grok",
        status: "generated",
      });

      res.json({
        ...result,
        id: saved.id,
        cityIntelligence: cityIntelligence ? {
          pulseScore: cityIntelligence.city?.pulseScore,
          trendingScore: cityIntelligence.city?.trendingScore,
          hiddenGemsCount: cityIntelligence.hiddenGems?.length || 0,
          happeningNowCount: cityIntelligence.happeningNow?.length || 0,
          alertsCount: cityIntelligence.alerts?.length || 0,
        } : null,
      });
    } catch (error: any) {
      console.error("Quick start itinerary error:", error);
      res.status(500).json({ message: error.message || "Itinerary generation failed" });
    }
  });

  // AI Chat endpoint - General purpose chat
  const chatSchema = z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    })),
    systemContext: z.string().optional(),
    preferProvider: z.enum(["grok", "claude", "auto"]).optional(),
  });


router.get("/api/trips/:tripId/participants", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const participants = await coordinationService.getParticipants(req.params.tripId);
    res.json(participants);
  }));


router.get("/api/trips/:tripId/participants/stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getParticipantStats(req.params.tripId);
    res.json(stats);
  }));


router.get("/api/trips/:tripId/participants/payment-stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getPaymentStats(req.params.tripId);
    res.json(stats);
  }));


router.get("/api/trips/:tripId/participants/dietary", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const dietary = await coordinationService.getDietaryRequirements(req.params.tripId);
    res.json(dietary);
  }));


router.post("/api/trips/:tripId/participants", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!await verifyTripOwnership(req.params.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const validatedData = insertTripParticipantSchema.parse({
        ...req.body,
        tripId: req.params.tripId,
      });
      const participant = await coordinationService.createParticipant(validatedData);
      res.status(201).json(participant);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create participant" });
    }
  });


// §9 mount-order-dead twin (this handler always loses to the identically-routed
// POST /api/trips/:tripId/participants/bulk-invite in routes.ts). ESCALATED, not fixed:
// the live copy gates on `authorizeTripOwnerTier` (owner ‖ trip author ‖ audit-logged
// admin — deliberately WITHOUT the assigned-expert branch, "L20 tier 4 — participant PII
// is OWNER-only, never an assigned expert" per the live copy's comment). That helper is a
// private, unexported function local to routes.ts (a hard-excluded file for this lane) —
// it is not reachable from here, and `authorizeTripLogistics` is NOT an equivalent
// substitute (it WOULD admit the assigned expert, reopening exactly the disclosure the
// live gate exists to prevent). Left unauthorized rather than mis-gated; the fix belongs
// to whoever owns routes.ts / the reconciliation sweep — either export/hoist
// `authorizeTripOwnerTier` into the shared trip-logistics-auth module, or apply it here
// once it is reachable.
router.post("/api/trips/:tripId/participants/bulk-invite", isAuthenticated, async (req, res) => {
    try {
      const { emails } = req.body;
      const participants = await coordinationService.bulkInvite(req.params.tripId, emails);
      res.status(201).json(participants);
    } catch (error) {
      res.status(500).json({ message: "Failed to send invites" });
    }
  });

  // --- Vendor Contracts Routes ---

router.get("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
    try {
      const contracts = await vendorManagementService.getContracts(req.params.tripId);
      res.json(contracts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });


router.get("/api/trips/:tripId/contracts/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await vendorManagementService.getContractStats(req.params.tripId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contract stats" });
    }
  });


router.get("/api/trips/:tripId/contracts/upcoming-payments", isAuthenticated, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const payments = await vendorManagementService.getUpcomingPayments(req.params.tripId, days);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming payments" });
    }
  });


router.get("/api/trips/:tripId/contracts/overdue", isAuthenticated, async (req, res) => {
    try {
      const overdue = await vendorManagementService.getOverduePayments(req.params.tripId);
      res.json(overdue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch overdue payments" });
    }
  });


// §9 mount-order-dead twin (this handler always loses to the identically-routed
// POST /api/trips/:tripId/contracts in routes.ts). ESCALATED, not fixed: the live copy
// gates vendor-CONTRACT CREATION on `authorizeTripOwnerTier` (owner ‖ author ‖
// audit-logged admin, no assigned-expert branch — "creating a financial/legal artifact on
// the traveler's trip is owner-only", per the live copy's block comment), while contract
// READS there use the broader `authorizeTripLogistics`. That owner-tier helper is a
// private, unexported function local to routes.ts (hard-excluded for this lane) and is not
// reachable here; substituting `authorizeTripLogistics` would wrongly admit the assigned
// expert into creating financial/legal artifacts, which the live gate exists to prevent.
// Left unauthorized rather than mis-gated — see the participants/bulk-invite twin above
// for the same reasoning; fix belongs to routes.ts's owner / the reconciliation sweep.
router.post("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
    try {
      const contract = await vendorManagementService.createContract({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to create contract" });
    }
  });

// Document upload for vendor contracts.
//
// SECURITY (§13 P0 trip-data IDOR cluster, "class E" — the path only LOOKED trip-scoped):
// this handler previously ran on `isAuthenticated` alone and used ONLY
// `req.params.contractId`; `:tripId` was never validated and never even read, so any
// authenticated user could attach an arbitrary base64 file to ANY vendor contract on ANY
// trip by naming their own tripId (or a garbage one) in the path. Two independent checks
// are required and both are applied here, in this order:
//   1. AUTHORIZE THE TRIP IN THE PATH — L20 tier: vendor-contract WRITES are OWNER-only
//      (creating/altering a financial/legal artifact on the traveler's trip is not the
//      assigned expert's job), so this uses `authorizeTripOwnerTier` (owner ‖ trip author ‖
//      audit-logged admin), NOT the broader `authorizeTripLogistics`. Matches the live
//      `POST /api/trips/:tripId/contracts` create gate in routes.ts.
//   2. TIE THE CONTRACT TO THAT TRIP — authorization on `:tripId` is worthless if
//      `:contractId` may belong to a different trip. The contract is resolved and its
//      `tripId` compared to the authorized path trip.
// Order matters: the trip gate runs BEFORE the contract is resolved, so an unauthorized
// caller learns nothing about which contract ids exist (no existence oracle), and a
// foreign contract is reported with the same 404 as a non-existent one.
router.post("/api/trips/:tripId/contracts/:contractId/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = getReqUserId(req);
      const { tripId, contractId } = req.params;

      const denied = await authorizeTripOwnerTier(
        tripId, userId, "POST /api/trips/:tripId/contracts/:contractId/documents",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const contract = await vendorManagementService.getContract(contractId);
      if (!contract || contract.tripId !== tripId) {
        return res.status(404).json({ message: "Contract not found on this trip" });
      }

      const { documentType, fileName, fileBase64, mimeType } = req.body;

      if (!fileBase64 || !fileName || !documentType) {
        return res.status(400).json({ message: "Missing required fields: fileBase64, fileName, documentType" });
      }
      if (!["contract", "signed", "attachment"].includes(documentType)) {
        return res.status(400).json({ message: "documentType must be contract, signed, or attachment" });
      }

      const fileBuffer = Buffer.from(fileBase64, "base64");
      const result = await vendorManagementService.uploadContractDocument(
        contractId,
        documentType,
        fileName,
        fileBuffer,
        mimeType || "application/octet-stream"
      );

      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to upload document" });
    }
  });

// Bulk email to vendors.
//
// SECURITY (§13 P0 trip-data IDOR cluster, "class E" + outbound mail): this handler
// previously ran on `isAuthenticated` alone, so any authenticated user could aim
// attacker-authored `subject`/`body` at another traveler's vendor list, sent under the
// platform's own sending identity ("Traveloure Coordination"). Three controls:
//   1. TRIP AUTHORIZATION — L20 tier: vendor COORDINATION is the assigned expert's job, so
//      the tier is owner ‖ assigned expert (‖ author ‖ audit-logged admin) =
//      `authorizeTripLogistics`. The canonical advisor predicate landed today, so a
//      *rejected* advisor is denied here.
//   2. EVERY `contractId` MUST BELONG TO THIS TRIP — `contractIds` is caller-supplied and
//      was an independent second IDOR. The service layer already dropped foreign contracts
//      (`c.tripId === tripId` in sendBulkVendorEmail), but it did so SILENTLY — a caller
//      could not tell a foreign id from a vendor with no email on file. The route now
//      resolves the trip's own contract ids and REJECTS the request (400) if any requested
//      id is not among them, so the trip-scoping is explicit and honest rather than an
//      accident of a downstream filter.
//   3. RATE LIMIT — `vendorBulkEmailLimiter` (5 / 10 min per acting user), because
//      authorization alone does not bound an outbound-mail primitive.
router.post("/api/trips/:tripId/vendors/bulk-email", isAuthenticated, vendorBulkEmailLimiter, async (req, res) => {
    try {
      const userId = getReqUserId(req);
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "POST /api/trips/:tripId/vendors/bulk-email",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const { contractIds, subject, body, includeCalendarInvite, eventDate } = req.body;

      if (!contractIds || !Array.isArray(contractIds) || contractIds.length === 0) {
        return res.status(400).json({ message: "contractIds must be a non-empty array" });
      }
      // Bound the fan-out (an unbounded array is a mail-amplification lever even for the owner).
      if (contractIds.length > 100) {
        return res.status(400).json({ message: "contractIds may not exceed 100 entries" });
      }
      if (!contractIds.every((id: unknown) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "contractIds must be non-empty strings" });
      }

      if (!subject || !body) {
        return res.status(400).json({ message: "subject and body are required" });
      }
      if (typeof subject !== "string" || typeof body !== "string") {
        return res.status(400).json({ message: "subject and body must be strings" });
      }

      // Second IDOR: tie every requested contract to the authorized trip.
      const tripContractIds = new Set(
        (await vendorManagementService.getContracts(req.params.tripId)).map((c) => c.id),
      );
      const foreign = (contractIds as string[]).filter((id) => !tripContractIds.has(id));
      if (foreign.length > 0) {
        return res.status(400).json({
          message: "One or more contractIds do not belong to this trip",
          count: foreign.length,
        });
      }

      const result = await vendorManagementService.sendBulkVendorEmail(
        req.params.tripId,
        contractIds,
        subject,
        body,
        {
          includeCalendarInvite: includeCalendarInvite || false,
          eventDate: eventDate ? new Date(eventDate) : undefined,
        }
      );

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to send bulk email" });
    }
  });

// Generate vendor contact sheet.
//
// SECURITY (§13 P0 trip-data IDOR cluster): this handler previously ran on
// `isAuthenticated` alone and returned every vendor's name, email, phone, postal address,
// contact person and private notes for ANY trip id — bulk third-party PII egress in JSON,
// CSV or PDF to any logged-in account. L20 tier: vendor coordination is the assigned
// expert's job, so reads are owner ‖ assigned expert (‖ author ‖ audit-logged admin) =
// `authorizeTripLogistics`; a *rejected* advisor is denied by the canonical predicate.
router.get("/api/trips/:tripId/vendors/contact-sheet", isAuthenticated, async (req, res) => {
    try {
      const userId = getReqUserId(req);
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/vendors/contact-sheet",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const format = (req.query.format as string) || "json";

      if (!["json", "csv", "pdf"].includes(format)) {
        return res.status(400).json({ message: "format must be json, csv, or pdf" });
      }

      const result = await vendorManagementService.generateContactSheet(req.params.tripId, format as any);

      if (format === "pdf") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="vendor-contacts-${Date.now()}.pdf"`);
        res.send(result as Buffer);
      } else if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="vendor-contacts-${Date.now()}.csv"`);
        res.send(result as Buffer);
      } else {
        res.json(JSON.parse(result as string));
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to generate contact sheet" });
    }
  });

router.get("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
    try {
      const transactions = await budgetService.getTransactions(req.params.tripId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });


router.get("/api/trips/:tripId/budget/summary", isAuthenticated, async (req, res) => {
    try {
      const budget = parseFloat(req.query.budget as string) || 0;
      const summary = await budgetService.getBudgetSummary(req.params.tripId, budget);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch budget summary" });
    }
  });


router.get("/api/trips/:tripId/budget/categories", isAuthenticated, async (req, res) => {
    try {
      const breakdown = await budgetService.getCategoryBreakdown(req.params.tripId);
      res.json(breakdown);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category breakdown" });
    }
  });


router.get("/api/trips/:tripId/budget/settle-up", isAuthenticated, async (req, res) => {
    try {
      const settleUp = await budgetService.getSettleUpSummary(req.params.tripId);
      res.json(settleUp);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate settle up" });
    }
  });


// §9 mount-order-dead twins (this handler and the two below always lose to their
// identically-routed POST /api/trips/:tripId/transactions[/split] and
// /budget/calculate-split in routes.ts). ESCALATED, not fixed: the live block ("L20 tier
// 1 — money-between-people is OWNER-only (+ author/admin)") gates EVERY handler in this
// budget/transactions block — reads included — on `authorizeTripOwnerTier`, explicitly
// NOT `authorizeTripLogistics`, because "an assigned expert has their own commission view
// and never needs it" per the live copy's comment. That owner-tier helper is a private,
// unexported function local to routes.ts (hard-excluded for this lane); substituting
// `authorizeTripLogistics` here would wrongly admit the assigned expert into another
// party's money-between-people ledger. Left unauthorized rather than mis-gated — same
// reasoning as the participants/bulk-invite and contracts twins above; fix belongs to
// routes.ts's owner / the reconciliation sweep.
router.post("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
    try {
      const transaction = await budgetService.createTransaction({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(transaction);
    } catch (error) {
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });


router.post("/api/trips/:tripId/transactions/split", isAuthenticated, async (req, res) => {
    try {
      const { totalAmount, category, description, paidByParticipantId, splits } = req.body;
      const transactions = await budgetService.createSplitTransaction(
        req.params.tripId,
        totalAmount,
        category,
        description,
        paidByParticipantId,
        splits
      );
      res.status(201).json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to create split transaction" });
    }
  });


router.post("/api/trips/:tripId/budget/calculate-split", isAuthenticated, async (req, res) => {
    try {
      const { totalAmount, method, customSplits } = req.body;
      const splits = await budgetService.calculateSplit(req.params.tripId, totalAmount, method, customSplits);
      res.json(splits);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate split" });
    }
  });


router.get("/api/trips/:tripId/itinerary-items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId } = req.params;
      const owned = await verifyTripOwnership(tripId, userId);
      const assigned = owned ? true : await storage.isExpertAssignedToTrip(tripId, userId);
      if (!owned && !assigned) return res.status(403).json({ message: "Access denied" });
      const items = await storage.getItineraryItems(tripId);
      const grouped: Record<number, typeof items> = {};
      for (const item of items) {
        const day = item.dayNumber;
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(item);
      }
      const days = Object.keys(grouped)
        .map(Number)
        .sort((a, b) => a - b)
        .map((dayNumber) => ({ dayNumber, items: grouped[dayNumber] }));
      res.json({ days, total: items.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch itinerary items" });
    }
  });


router.get("/api/trips/:tripId/itinerary/schedules", isAuthenticated, async (req, res) => {
    try {
      const schedules = await itineraryIntelligenceService.getDaySchedules(req.params.tripId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch day schedules" });
    }
  });


router.get("/api/trips/:tripId/itinerary/analyze", isAuthenticated, async (req, res) => {
    try {
      const analysis = await itineraryIntelligenceService.analyzeItinerary(req.params.tripId);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze itinerary" });
    }
  });


router.get("/api/trips/:tripId/itinerary/recommendations", isAuthenticated, async (req, res) => {
    try {
      const destination = req.query.destination as string || "destination";
      const recommendations = await itineraryIntelligenceService.getAIRecommendations(req.params.tripId, destination);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });

  // Authoritative POST: requires trip ownership or expert assignment; validates via Zod schema

router.post("/api/trips/:tripId/itinerary-items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const userName = (req.user as any).claims.name || "User";
      const { tripId } = req.params;
      const tripRole = await getTripRole(tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends can only suggest activities, not add them directly" : "Access denied" });
      }
      const parsed = insertItineraryItemSchema.safeParse({ ...req.body, tripId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      // §12: itinerary_items.origin is stamped server-side from the ACTOR's role, never trusted
      // from req.body (the insert schema omits it; the PATCH path already strips it). An owner's
      // manual add is 'traveler'; an assigned advisor/expert's is 'expert'. This is the provenance
      // a cloned ready-made trip's buyer-added items were previously missing (audit finding).
      const origin = tripRole === "expert" ? "expert" : "traveler";
      const item = await storage.createItineraryItem({ ...parsed.data, origin } as any);
      logItineraryChange(tripId, userName, `Added "${item.title}"`, "add", tripRole!, item.id);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create itinerary item" });
    }
  });


// RETIRED (V4 rail-unification, Aug 7 2026): this was already a §9 mount-order-dead twin of
// `PATCH /api/itinerary-items/:id` in routes.ts (routes.ts registers first and always won —
// this copy never served traffic). The LIVE copy in routes.ts is now retired too (zero live
// callers; see its comment there for the full rationale) in favor of the canonical
// `PATCH /api/trips/:tripId/itinerary-items/:itemId` below. Removed here rather than left as a
// dead duplicate of retired code.


router.post("/api/itinerary-items/:id/backup", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      const tripRole = await getTripRole(existing.tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends cannot set backup plans" : "Access denied" });
      }
      const { backupItemId } = req.body;
      const item = await itineraryIntelligenceService.setBackupPlan(req.params.id, backupItemId);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to set backup plan" });
    }
  });


router.post("/api/trips/:tripId/itinerary/reorder", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const userName = (req.user as any).claims.name || "User";
      const { tripId } = req.params;
      const tripRole = await getTripRole(tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends cannot reorder activities" : "Access denied" });
      }
      const { dayNumber, itemIds } = req.body;
      const items = await itineraryIntelligenceService.reorderItems(tripId, dayNumber, itemIds);
      logItineraryChange(tripId, userName, `Reordered Day ${dayNumber} activities`, "reorder", tripRole!);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder items" });
    }
  });


// §9 mount-order-dead twin (this handler always loses to the identically-routed
// POST /api/trips/:tripId/itinerary/optimize-order in routes.ts — see registerRoutes'
// tripsRoutes mount comment). Kept in sync for safety only.
// SECURITY (P0-b IDOR, kept safe for the reconciliation sweep): this endpoint carried
// `isAuthenticated` ONLY — no trip authorization at all — despite reordering the trip's own
// itinerary. Its sibling `reorder` handler above uses `getTripRole`/`canMutateTrip`; that
// model is left untouched here (not this lane's call to unify) and `authorizeTripLogistics`
// is used instead, matching the fix the live copy already carries.
router.post("/api/trips/:tripId/itinerary/optimize-order", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId,
        userId,
        "POST /api/trips/:tripId/itinerary/optimize-order",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const { dayNumber } = req.body;
      const optimizedOrder = await itineraryIntelligenceService.optimizeOrder(req.params.tripId, dayNumber);
      res.json({ optimizedOrder });
    } catch (error) {
      res.status(500).json({ message: "Failed to optimize order" });
    }
  });


router.post("/api/itinerary/estimate-travel", isAuthenticated, async (req, res) => {
    try {
      const { fromLat, fromLng, toLat, toLng, mode } = req.body;
      const estimate = itineraryIntelligenceService.estimateTravelTime(fromLat, fromLng, toLat, toLng, mode);
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ message: "Failed to estimate travel time" });
    }
  });

  // POST /api/trips/:tripId/activate-transport
  // Creates or reuses an itinerary comparison+variant for the trip's AI-generated itinerary,
  // then calculates and persists real transport legs so users can select modes.

router.post("/api/trips/:tripId/activate-transport", isAuthenticated, async (req, res) => {
    try {
      const { tripId } = req.params;
      const userId = getReqUserId(req);

      const trip = await storage.getTrip(tripId);
      if (!trip || trip.userId !== userId) return res.status(404).json({ error: "Trip not found" });

      const genItinerary = await storage.getGeneratedItineraryByTripId(tripId);
      if (!(genItinerary as any)?.itineraryData) {
        return res.status(404).json({ error: "No generated itinerary found for this trip" });
      }

      let comparison = await storage.getComparisonByTripAndUser(tripId, userId);
      if (!comparison) {
        comparison = await storage.createItineraryComparison({
          userId,
          tripId,
          title: trip.title || trip.destination || "My Trip",
          destination: trip.destination,
          status: "active",
        });
      }

      let variant = await storage.getAiVariantByComparison(comparison.id);
      if (!variant) {
        variant = await storage.createItineraryVariant({
          comparisonId: comparison.id,
          name: "AI Generated",
          source: "ai",
          status: "active",
        });
      }

      const data: any = (genItinerary as any).itineraryData;
      const daysData: any[] = data?.days || data?.dailyItinerary || [];

      const activities: import("../services/transport-leg-calculator").ActivityLocation[] = [];
      for (const day of daysData) {
        const dayNum: number = day.day || day.dayNumber || 1;
        const dayActs: any[] = day.activities || [];
        dayActs.forEach((act: any, idx: number) => {
          if (act.lat && act.lng) {
            activities.push({
              id: act.id || `day${dayNum}-act${idx}`,
              name: act.title || act.name || "Activity",
              lat: parseFloat(act.lat),
              lng: parseFloat(act.lng),
              scheduledTime: act.time || act.startTime || `${9 + idx}:00`,
              dayNumber: dayNum,
              order: idx,
            });
          }
        });
      }

      if (activities.length < 2) {
        return res.json({ variantId: variant.id, legs: [], message: "Not enough geolocated activities to calculate transport" });
      }

      await calculateTransportLegs(variant.id, activities, trip.destination || "", {});

      const savedLegs = await storage.getTransportLegsByVariantId(variant.id);

      return res.json({
        variantId: variant.id,
        legs: savedLegs.map(leg => ({
          id: leg.id,
          legOrder: leg.legOrder,
          dayNumber: leg.dayNumber,
          fromName: leg.fromName,
          toName: leg.toName,
          fromLat: leg.fromLat,
          fromLng: leg.fromLng,
          toLat: leg.toLat,
          toLng: leg.toLng,
          recommendedMode: leg.recommendedMode,
          userSelectedMode: leg.userSelectedMode,
          distanceDisplay: leg.distanceDisplay,
          estimatedDurationMinutes: leg.estimatedDurationMinutes,
          estimatedCostUsd: leg.estimatedCostUsd,
          alternativeModes: leg.alternativeModes || [],
        })),
      });
    } catch (err: any) {
      console.error("Activate transport error:", err);
      res.status(500).json({ error: "Failed to activate transport" });
    }
  });


// RETIRED (V4 rail-unification, Aug 7 2026): §9 mount-order-dead twin of
// `DELETE /api/itinerary-items/:id` in routes.ts, which is itself now retired — see the PATCH
// removal note above and routes.ts's comment for the full rationale.

  // --- Emergency Routes ---

router.get("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
    try {
      const contacts = await emergencyService.getContacts(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });


router.get("/api/trips/:tripId/emergency-contacts/by-type", isAuthenticated, async (req, res) => {
    try {
      const contacts = await emergencyService.getContactsByType(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });


// §9 mount-order-dead twins (this handler and the one below always lose to their
// identically-routed POST /api/trips/:tripId/emergency-contacts and /emergency/initialize
// in routes.ts). ESCALATED, not fixed: the live copies gate on `authorizeTripOwnerTier`
// (owner-only, no assigned-expert branch — note the GET reads in this same block DO use
// the broader `authorizeTripLogistics`, so this is a deliberate read/write split, not an
// oversight). That owner-tier helper is a private, unexported function local to routes.ts
// (hard-excluded for this lane); substituting `authorizeTripLogistics` would wrongly admit
// the assigned expert into owner-only writes. Left unauthorized rather than mis-gated —
// same reasoning as the other owner-tier twins above; fix belongs to routes.ts's owner /
// the reconciliation sweep.
router.post("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
    try {
      const contact = await emergencyService.createContact({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ message: "Failed to create emergency contact" });
    }
  });


router.post("/api/trips/:tripId/emergency/initialize", isAuthenticated, async (req, res) => {
    try {
      const { countryCode } = req.body;
      const result = await emergencyService.initializeTripEmergencyInfo(req.params.tripId, countryCode);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize emergency info" });
    }
  });


router.get("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
      const alerts = await emergencyService.getActiveAlerts(req.params.tripId);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });


router.get("/api/trips/:tripId/alerts/summary", isAuthenticated, async (req, res) => {
    try {
      const summary = await emergencyService.getAlertSummary(req.params.tripId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alert summary" });
    }
  });


// §9 mount-order-dead twin (this handler always loses to the identically-routed
// POST /api/trips/:tripId/alerts in routes.ts — see registerRoutes' tripsRoutes mount
// comment). Kept in sync for safety only.
// SECURITY (found during the L21 sweep, kept safe for the reconciliation sweep): this
// endpoint carried `isAuthenticated` ONLY — no trip authorization — despite writing a
// safety alert onto the trip. The live copy gates on `authorizeTripLogistics` (owner ‖
// assigned expert ‖ author ‖ audit-logged admin — the ONE tier-3 write an assigned expert
// may perform, per the live copy's comment), so that is mirrored here.
router.post("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId,
        userId,
        "POST /api/trips/:tripId/alerts",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const alert = await emergencyService.createAlert({
        ...req.body,
        tripId: req.params.tripId,
      });
      res.status(201).json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to create alert" });
    }
  });


router.get("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      res.json(anchors);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get temporal anchors", error: error.message });
    }
  });


// Route-boundary coercion for anchor datetimes. JSON cannot carry a JS Date, so
// the shared Drizzle `anchorDatetime` contract (a strict z.date()) is unsatisfiable
// over HTTP — every client would 400. We coerce HERE (not in the shared schema, which
// stays untouched) so any caller — this UI, the expert workspace, future callers — can
// send an ISO string. z.coerce.date() still REJECTS non-dates (Invalid Date → 400).
const anchorCreateInput = insertTemporalAnchorSchema.extend({
  anchorDatetime: z.coerce.date(),
});
// Update: all fields optional; tripId omitted so an anchor can't be reassigned to
// another trip (mass-assign guard). Same coercion on anchorDatetime.
const anchorUpdateInput = insertTemporalAnchorSchema
  .omit({ tripId: true })
  .partial()
  .extend({ anchorDatetime: z.coerce.date().optional() });

router.post("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const body = { ...req.body, tripId: req.params.tripId };

      if (!body.anchorDatetime && body.dayNumber && body.suggestedTime) {
        const startDate = trip.startDate?.toString() || new Date().toISOString().split('T')[0];
        const tripStart = new Date(startDate);
        const anchorDate = new Date(tripStart);
        anchorDate.setDate(anchorDate.getDate() + (body.dayNumber - 1));
        const [h, m] = body.suggestedTime.split(':');
        anchorDate.setHours(parseInt(h), parseInt(m), 0, 0);
        body.anchorDatetime = anchorDate.toISOString();
        delete body.dayNumber;
        delete body.suggestedTime;
      }

      const input = anchorCreateInput.parse(body);
      const anchor = await storage.createTemporalAnchor(input);
      res.status(201).json(anchor);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });


router.put("/api/anchors/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      // Resolve the anchor → its owning trip, then apply owner ‖ assigned ‖ admin.
      // Unknown id → 404; forbidden → 403 below, per codebase convention. NOTE: because
      // unknown (404) and forbidden (403) differ, anchor-id existence is enumerable by an
      // authenticated user — accepted as low-sensitivity (anchor ids carry no secret).
      const existing = await storage.getTemporalAnchorById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Anchor not found" });
      const denied = await authorizeTripLogistics(existing.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });
      // Validate-then-mutate: coerce the datetime + reject tripId reassignment
      // (was: raw req.body passed straight to the update — an unvalidated contract gap).
      const updates = anchorUpdateInput.parse(req.body);
      const updated = await storage.updateTemporalAnchor(req.params.id, updates);
      if (!updated) return res.status(404).json({ message: "Anchor not found" });
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update anchor", error: error.message });
    }
  });


router.delete("/api/anchors/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      // Resolve the anchor → its owning trip, then apply owner ‖ assigned ‖ admin.
      // Unknown id → 404; forbidden → 403 below, per codebase convention. NOTE: because
      // unknown (404) and forbidden (403) differ, anchor-id existence is enumerable by an
      // authenticated user — accepted as low-sensitivity (anchor ids carry no secret).
      const existing = await storage.getTemporalAnchorById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Anchor not found" });
      const denied = await authorizeTripLogistics(existing.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });
      await storage.deleteTemporalAnchor(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete anchor", error: error.message });
    }
  });

  // === Logistics: Day Boundaries ===


router.get("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      res.json(boundaries);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get day boundaries", error: error.message });
    }
  });


router.post("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const input = insertDayBoundarySchema.parse({ ...req.body, tripId: req.params.tripId });
      const boundary = await storage.createDayBoundary(input);
      res.status(201).json(boundary);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === Logistics: Schedule Validation ===


router.post("/api/trips/:tripId/validate-schedule", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      const boundaries = await storage.getDayBoundaries(req.params.tripId);

      // Check for conflicts: activities overlapping anchor buffer zones
      const conflicts: Array<{ anchorId: string; anchorType: string; conflict: string }> = [];

      for (const anchor of anchors) {
        const anchorTime = new Date(anchor.anchorDatetime).getTime();
        const bufferStart = anchorTime - (anchor.bufferBefore || 0) * 60000;
        const bufferEnd = anchorTime + (anchor.bufferAfter || 0) * 60000;

        // Check against proposed items in the request body
        const proposedItems = req.body.items || [];
        for (const item of proposedItems) {
          if (item.startTime && item.dayNumber) {
            const itemStart = new Date(`${item.date || ''}T${item.startTime}`).getTime();
            const itemEnd = item.endTime ? new Date(`${item.date || ''}T${item.endTime}`).getTime() : itemStart + (item.durationMinutes || 60) * 60000;

            if (itemStart < bufferEnd && itemEnd > bufferStart) {
              conflicts.push({
                anchorId: anchor.id,
                anchorType: anchor.anchorType,
                conflict: `Activity "${item.title}" overlaps with ${anchor.anchorType} buffer zone (${anchor.description || ''})`,
              });
            }
          }
        }
      }

      res.json({
        valid: conflicts.length === 0,
        conflicts,
        anchorsChecked: anchors.length,
        boundariesChecked: boundaries.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to validate schedule", error: error.message });
    }
  });

  // === Logistics: Energy Calculation ===




  // === Logistics: Template Presets ===


router.get("/api/logistics/presets/:templateSlug", async (req, res) => {
    try {
      const { getPresetsForTemplate } = await import('../services/logistics-presets.service');
      const presets = getPresetsForTemplate(req.params.templateSlug);
      if (!presets) {
        return res.json({ anchors: [], dayBoundaries: [] });
      }
      res.json(presets);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get presets", error: error.message });
    }
  });




router.post("/api/trips/:tripId/anchors/:anchorId/impacts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const { detectAnchorImpacts } = await import('../services/logistics-presets.service');
      const impacts = await detectAnchorImpacts(req.params.tripId, req.params.anchorId);
      res.json({ impacts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to detect impacts", error: error.message });
    }
  });

  // === Logistics: AI Anchor Suggestions ===


router.post("/api/trips/:tripId/anchor-suggestions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const { templateSlug } = req.body;
      const startDate = trip.startDate?.toString() || new Date().toISOString().split('T')[0];
      const endDate = trip.endDate?.toString() || startDate;
      const start = new Date(startDate);
      const end = new Date(endDate);
      const numberOfDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);

      const { generateAnchorSuggestions } = await import('../services/anchor-suggestion.service');
      const suggestions = await generateAnchorSuggestions({
        tripId: req.params.tripId,
        destination: trip.destination || "Unknown",
        templateSlug: templateSlug || trip.eventType || "travel",
        startDate,
        endDate,
        numberOfDays,
      });
      res.json({ suggestions });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate suggestions", error: error.message });
    }
  });


router.get("/api/trips/:tripId/anchor-optimization", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const { analyzeAnchorOptimization } = await import('../services/anchor-suggestion.service');
      const tips = await analyzeAnchorOptimization(req.params.tripId);
      res.json({ tips });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to analyze anchors", error: error.message });
    }
  });

  // ==========================================
  // Expert/Provider Logistics Integration
  // ==========================================

  // === Expert: Client Constraint Visibility ===


router.post("/api/itinerary-variants/:variantId/share", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = getReqUserId(req);
      const { sharedWithUserId, permissions = "view", transportPreferences } = req.body;

      const variant = await storage.getItineraryVariantById(variantId);
      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const comparison = await storage.getItineraryComparison(variant.comparisonId);
      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const shareToken = crypto.randomUUID();
      const replitDomains = process.env.REPLIT_DOMAINS;
      const baseUrl = replitDomains
        ? `https://${replitDomains.split(",")[0].trim()}`
        : (process.env.REPL_SLUG
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : `https://traveloure.com`);

      await storage.createSharedItinerary({
        shareToken,
        variantId,
        sharedByUserId: userId,
        sharedWithUserId: sharedWithUserId || null,
        permissions,
        transportPreferences: transportPreferences || null,
      });

      if (sharedWithUserId) {
        await storage.createNotification({
          userId: sharedWithUserId,
          type: "itinerary_shared",
          title: "Itinerary shared with you",
          message: `A traveler has shared their itinerary to ${comparison.destination} with you for review.`,
          data: { shareToken, variantId, destination: comparison.destination },
        } as any);
      }

      res.json({
        shareToken,
        shareUrl: `${baseUrl}/itinerary-view/${shareToken}`,
        expiresAt: null,
      });
    } catch (err: any) {
      console.error("Share itinerary error:", err);
      res.status(500).json({ error: "Failed to share itinerary" });
    }
  });

  // GET /api/trips/:id/share-info — Returns share token + expert review status for a trip (owner only)

router.get("/api/trips/:id/share-info", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const tripId = req.params.id;

      const comparisons = await storage.getComparisonsByTripAndUser(tripId, userId);
      if (comparisons.length === 0) return res.json({});

      const variantRows = await storage.getVariantsByComparisonIds(comparisons.map(c => c.id));
      if (variantRows.length === 0) return res.json({});

      const shares = await storage.getSharedItinerariesByVariantIds(variantRows.map(v => v.id), userId);

      if (shares.length === 0) return res.json({});

      const latest = shares[shares.length - 1];
      return res.json({
        shareToken: latest.shareToken,
        variantId: latest.variantId,
        expertStatus: latest.expertStatus,
        expertNotes: latest.expertNotes,
        expertDiff: latest.expertDiff,
      });
    } catch (err: any) {
      console.error("Share info error:", err);
      res.status(500).json({ error: "Failed to fetch share info" });
    }
  });

  // GET /api/itinerary-share/:token — PUBLIC

router.get("/api/itinerary-share/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const shared = await storage.getSharedItineraryByToken(token);
      if (!shared) return res.status(404).json({ error: "Shared itinerary not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "This share link has expired" });
      }

      await storage.incrementSharedItineraryViewCount(shared.id, shared.viewCount);

      // ── Thin caller (L3b′): the plan assembly lives in the ONE TripPlan service, VARIANT
      // producer. The share token is keyed on `variantId`, so the plan is assembled from the
      // variant's own snapshot rows and NEVER from the live trip — a share link keeps rendering
      // exactly what was shared. The token gate above is authoritative; the assembler authorizes
      // nothing (redaction level = channel contract). This surface has always rendered the full
      // body to a token holder, so it asks for 'full' — and then emits ONLY the pre-existing
      // response keys below, so nothing the envelope newly carries (vendorPhone,
      // confirmationNumber, meetingPoint, expertNote, booked/bookVia, …) leaks onto this surface.
      let plan: VariantFullTripPlan;
      try {
        plan = await assembleTripPlanFromVariant(shared.variantId, "full");
      } catch (e) {
        if (e instanceof TripPlanVariantNotFoundError) {
          return res.status(404).json({ error: "Variant not found" });
        }
        throw e;
      }

      const [exportCache, sharer] = await Promise.all([
        storage.getMapsExportCacheByVariantId(shared.variantId),
        storage.getUserPublicProfile(shared.sharedByUserId),
      ]);

      // §16 (L11): the `linkedProductUrl` key + the raw-leg read that fed it are REMOVED —
      // this was the one deliberate response-key deletion for this lane. TripPlan already never
      // carries an affiliate/deep-link URL (the URL stays server-side, §16); the client no longer
      // has any use for it either — the shared-itinerary view now offers its own booking-agent-rail
      // affordance per leg (LegBookingPanel, itinerary-view.tsx), which fetches booking options
      // live via the existing authenticated GET /api/transport-legs/:legId/options instead of
      // reading a raw URL out of this payload. A signed-out token holder gets no booking
      // affordance at all (the rail requires auth) rather than a broken one (§13).
      const days = plan.days.map(day => ({
        dayNumber: day.dayNumber,
        // `dateIso` is the machine YYYY-MM-DD the envelope carries; "" when the snapshot has no
        // start date (the pre-existing behaviour — never a guessed date).
        date: day.dateIso ?? "",
        activities: day.activities.map(a => ({
          id: a.id,
          name: a.name,
          startTime: a.startTime,
          endTime: a.endTime,
          lat: a.lat,
          lng: a.lng,
          category: a.category ?? null,
          cost: a.cost,
          description: a.description ?? null,
          location: a.location,
          duration: a.durationMinutes ?? null,
        })),
        transportLegs: day.transports.map(leg => ({
          id: leg.id,
          legOrder: leg.legOrder,
          fromName: leg.fromName,
          toName: leg.toName,
          recommendedMode: leg.recommendedMode,
          userSelectedMode: leg.userSelectedMode,
          distanceDisplay: leg.distanceDisplay,
          distanceMeters: leg.distanceMeters ?? null,
          estimatedDurationMinutes: leg.estimatedDurationMinutes,
          estimatedCostUsd: leg.estimatedCostUsd,
          energyCost: leg.energyCost ?? null,
          alternativeModes: leg.alternativeModes,
          fromLat: leg.fromLat,
          fromLng: leg.fromLng,
          toLat: leg.toLat,
          toLng: leg.toLng,
        })),
      }));

      // Totals run over the plan's FULL leg list (`plan.legs`), which — like the read this
      // replaced — includes legs whose day carries no items.
      const totalTransportCost = plan.legs.reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
      const totalTransportMinutes = plan.legs.reduce((sum, l) => sum + (l.estimatedDurationMinutes || 0), 0);

      // This endpoint is PUBLIC (no auth required) — any token holder can reach it, including
      // an anonymous "view"-only link passed to a friend/family member. expertNotes/expertDiff
      // carry the expert's PRIVATE per-activity review commentary and must never leave the
      // server for a non-owner/anonymous request (client-side gating alone is not a gate — see
      // itinerary-view.tsx's isOwnerView-conditioned rendering, which this closes the server hole for).
      const requesterId = getReqUserId(req);
      const isOwner = !!(shared.sharedByUserId && requesterId === shared.sharedByUserId);
      // The expert-review flow (a "suggest"/"edit" permission link) is the one non-owner
      // holder allowed to see the expert's notes/diff — that's the reviewing expert's own
      // content. A plain "view" link (the everyday friend/family share) never sees it.
      const canSeeExpertContent = isOwner || shared.permissions === "suggest" || shared.permissions === "edit";

      // §21 (ratified Aug 9 2026): the TRAVELER-FACING trip-level delivery note. This is a
      // DIFFERENT column (`trips.expertTravelerNote`) from the `expertNotes`/`expertDiff` above
      // (`shared_itineraries`' own private per-share-review commentary) — never confuse the two.
      // Unlike those, this field is meant for EVERY viewer of a delivered plan (no
      // `canSeeExpertContent` gate) — a "view"-only friend/family link is exactly the audience
      // §21 wrote this note for. Best-effort: `plan.meta.tripId` is nullable for a variant
      // produced off a trip-less optimizer comparison (shared/trip-plan.ts), in which case there
      // is no `trips` row to read the note from and it stays null (§13 — never guessed).
      let expertTravelerNote: string | null = null;
      if (plan.meta.tripId) {
        const linkedTrip = await storage.getTrip(plan.meta.tripId);
        expertTravelerNote = linkedTrip?.expertTravelerNote ?? null;
      }

      res.json({
        variant: {
          id: plan.meta.sourceRef.id,
          name: plan.meta.title,
          description: plan.meta.description,
          destination: plan.meta.destination,
          dateRange: {
            start: plan.meta.dates.start,
            end: plan.meta.dates.end,
          },
          // RAW producer figures (decimal string / int) — see TripPlanSourceFigures.
          totalCost: plan.sourceFigures?.totalCost ?? null,
          optimizationScore: plan.sourceFigures?.optimizationScore ?? null,
          days,
          transportSummary: {
            totalLegs: plan.legs.length,
            totalMinutes: totalTransportMinutes,
            totalCostUsd: Math.round(totalTransportCost * 100) / 100,
          },
        },
        mapsLinks: {
          googleMapsPerDay: exportCache?.googleMapsUrls || {},
          appleMapsPerDay: exportCache?.appleMapsUrls || {},
          appleMapsWebPerDay: exportCache?.appleMapsWebUrls || {},
          kmlDownloadUrl: `/api/itinerary-share/${token}/export/kml`,
          gpxDownloadUrl: `/api/itinerary-share/${token}/export/gpx`,
        },
        sharedBy: sharer
          ? {
              name: [sharer.firstName, sharer.lastName].filter(Boolean).join(" ") || "A traveler",
              avatarUrl: sharer.profileImageUrl,
              // Owner's raw internal userId is redacted from anonymous/non-owner responses —
              // nothing off-owner needs it, and it's needless PII exposure on a public token endpoint.
              userId: isOwner ? sharer.id : null,
            }
          : { name: "A traveler", avatarUrl: null, userId: null },
        permissions: shared.permissions,
        expertStatus: shared.expertStatus,
        // Private expert review content — never sent to a non-owner "view"-only link holder.
        expertNotes: canSeeExpertContent ? (shared.expertNotes || null) : null,
        expertDiff: canSeeExpertContent ? (shared.expertDiff || null) : null,
        // §21: traveler-facing trip-level note — every viewer gets it, see comment above.
        expertTravelerNote,
        transportPreferences: shared.transportPreferences,
        shareToken: token,
        isOwner,
      });
    } catch (err: any) {
      console.error("Get shared itinerary error:", err);
      res.status(500).json({ error: "Failed to load shared itinerary" });
    }
  });

  // GET /api/trips/:tripId/transport-legs
  // Returns the trip's transport legs: the most recent selected VARIANT's legs (the original
  // behavior, unchanged for its live consumer client/src/pages/itinerary.tsx) PLUS the trip's own
  // trip-scoped legs (§18 L4 / migration 154).
  //
  // §9 NO-SHADOW NOTE: L4a needed exactly this path for its Workstation read
  // (`?includeProposed=1`). This handler is the LIVE copy of the path, so it was EXTENDED here
  // rather than re-registered in the new (earlier-mounted) transport-legs.routes.ts — a second
  // registration would have silently shadowed this one and changed what /itinerary receives.
  //
  // Trip-scoped visibility: CONFIRMED only by default (a traveler-safe read — a machine `proposed`
  // leg is never returned without the explicit editor flag). `?includeProposed=1` adds proposals
  // for the Workstation editor, whose caller is authorized identically.

router.get("/api/trips/:tripId/transport-legs", isAuthenticated, async (req, res) => {
    try {
      const { tripId } = req.params;
      const userId = getUserId(req)!;

      // Owner keeps the original fast path; the assigned expert / author / (audit-logged) admin
      // branch is ADDITIVE — the canonical trip-logistics model, which the Workstation editor
      // needs (an assigned expert does not own the trip). Nobody who passed before is refused now.
      const tripOwned = await verifyTripOwnership(tripId, userId);
      if (!tripOwned) {
        const denied = await authorizeTripLogistics(
          tripId,
          userId,
          "GET /api/trips/:tripId/transport-legs",
        );
        // 404 preserved (not 403) — the original response for a caller with no access to the trip.
        if (denied) return res.status(404).json({ error: "Trip not found" });
      }

      const includeProposed = req.query.includeProposed === "1" || req.query.includeProposed === "true";
      const tripScopedLegs = await getTripTransportLegs(tripId, { includeProposed });

      const selectedVariant = await storage.getSelectedVariantByTrip(tripId);
      if (!selectedVariant?.selectedVariantId) {
        // Expert-built trips have no comparison at all — variantId stays null, exactly as before,
        // and the trip's own legs (if any) are what this trip has.
        return res.json({ legs: tripScopedLegs, variantId: null });
      }

      const variantLegs = (await storage.getTransportLegsByVariantId(selectedVariant.selectedVariantId))
        .sort((a: any, b: any) => a.legOrder - b.legOrder);

      res.json({
        legs: [...variantLegs, ...tripScopedLegs],
        variantId: selectedVariant.selectedVariantId,
      });
    } catch (err: any) {
      console.error("Get trip transport legs error:", err);
      res.status(500).json({ error: "Failed to load transport legs" });
    }
  });

  // PATCH /api/transport-legs/:legId/mode
  // Accepts either authenticated session (owner) or a suggest-permissions shareToken (expert without login)

router.patch("/api/transport-legs/:legId/mode", async (req, res) => {
    try {
      const { legId } = req.params;
      const { selectedMode, shareToken } = req.body;
      const userId = getUserId(req)!;

      if (!selectedMode) return res.status(400).json({ error: "selectedMode is required" });
      if (!userId && !shareToken) return res.status(401).json({ error: "Authentication or share token required" });

      const leg = await storage.getTransportLegById(legId);
      if (!leg) return res.status(404).json({ error: "Transport leg not found" });

      // §18 L4 (migration 154): a TRIP-scoped leg has no variant, so the variant→comparison→owner
      // lookup below cannot authorize it — and a missing `variantOwner` used to skip the ownership
      // block entirely. Trip-scoped legs are therefore authorized on the TRIP (owner ‖ assigned
      // expert ‖ author ‖ audit-logged admin); the share-token branch does not apply (share tokens
      // are variant-scoped), so a token-only caller is refused.
      if (isTripScopedLeg(leg)) {
        const denied = await authorizeTripLogistics(
          leg.tripId,
          userId,
          "PATCH /api/transport-legs/:legId/mode (trip-scoped)",
        );
        if (denied) return res.status(denied.status).json({ error: denied.message });
      }

      // Ownership check: verify via the variant's comparison owner OR valid suggest share token
      const variantOwner = leg.variantId
        ? await storage.getVariantWithComparisonOwner(leg.variantId)
        : null;
      if (variantOwner) {
        const isOwner = userId && variantOwner.userId === userId;

        if (!isOwner) {
          if (shareToken) {
            const shared = await storage.getSharedItineraryByTokenAndVariant(shareToken, leg.variantId);
            if (!shared) return res.status(403).json({ error: "Not authorized to update this transport leg" });
            if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
              return res.status(410).json({ error: "Share link has expired" });
            }
            if (shared.permissions !== "suggest") {
              return res.status(403).json({ error: "This share link does not allow modifications" });
            }
          } else {
            return res.status(403).json({ error: "Not authorized to update this transport leg" });
          }
        }
      }

      const alternatives = (leg.alternativeModes as any[]) || [];
      const selected = alternatives.find((a: any) => a.mode === selectedMode);

      let newDuration = leg.estimatedDurationMinutes;
      let newCost = leg.estimatedCostUsd;
      let newEnergy = leg.energyCost;

      if (selected) {
        newDuration = selected.durationMinutes;
        newCost = selected.costUsd;
        newEnergy = selected.energyCost;
      }

      const prevDuration = leg.estimatedDurationMinutes;
      const timeDiff = newDuration - prevDuration;

      await storage.updateTransportLegMode(legId, {
        userSelectedMode: selectedMode,
        estimatedDurationMinutes: newDuration,
        estimatedCostUsd: newCost ?? null,
        energyCost: newEnergy ?? 0,
      });

      // Regenerate maps URLs for all days (reflects new mode selection, replaces stale KML/GPX cache).
      // `maps_export_cache` is keyed on variant_id (NOT NULL), so a trip-scoped leg has no cache row
      // to regenerate — skipped rather than attempted-and-swallowed.
      let updatedMapsUrls: { googleMapsUrls: Record<number, string>; appleMapsUrls: Record<number, string>; appleMapsWebUrls: Record<number, string> } | null = null;
      if (leg.variantId) {
        try {
          updatedMapsUrls = await regenerateMapsUrlsFromLegs(leg.variantId, leg.dayNumber);
        } catch (mapsErr) {
          console.error("Maps URL regeneration error (non-critical):", mapsErr);
        }
      }

      let downstreamMessage = "";
      if (timeDiff < 0) {
        downstreamMessage = `Switching to ${selectedMode} saves ${Math.abs(timeDiff)} minutes.`;
      } else if (timeDiff > 0) {
        downstreamMessage = `Switching to ${selectedMode} adds ${timeDiff} minutes.`;
      } else {
        downstreamMessage = `Transport mode updated to ${selectedMode}.`;
      }

      if (variantOwner) {
        const compTripId = await storage.getComparisonTripId(variantOwner.comparisonId);
        if (compTripId) {
          const who = userId ? ((req.user as any)?.claims?.name || "User") : "Guest";
          logItineraryChange(compTripId, who, `Changed transport mode to ${selectedMode} (${leg.fromName} → ${leg.toName})`, "transport", shareToken ? "friend" : "owner", undefined, { legId, selectedMode, previousMode: leg.userSelectedMode || leg.recommendedMode });
        }
      }

      res.json({
        updatedLeg: {
          id: legId,
          userSelectedMode: selectedMode,
          estimatedDurationMinutes: newDuration,
          estimatedCostUsd: newCost,
          energyCost: newEnergy,
        },
        downstreamImpact: {
          nextActivityStartTimeShift: -timeDiff,
          message: downstreamMessage,
        },
        updatedMapsUrls,
      });
    } catch (err: any) {
      console.error("Update transport mode error:", err);
      res.status(500).json({ error: "Failed to update transport mode" });
    }
  });

  // ── L12: KML/GPX export, built from the ONE variant producer (assembleTripPlanFromVariant),
  // not bespoke raw-DB reads. Ratified calls implemented below (see the two helpers + the
  // version marker just above the handlers):
  //   ① legs ordered deterministically by (dayNumber, legOrder) — the producer's
  //      `getOrderedTransportLegsByVariantId` already does this at the SQL level, and
  //      `buildExportDays` re-asserts it locally so the export's own ordering is not merely
  //      inherited-and-hoped-for.
  //   ② a placemark/waypoint whose coordinates are not real (null/NaN/out-of-range/(0,0)) is
  //      skipped entirely — `isRealCoordinate` — never emitted at lat 0 (§13, null island).
  //   ③ the cache is versioned so a stale pre-migration (old-shape) cached export can never be
  //      served post-deploy — see EXPORT_FORMAT_MARKER below.

  /** RATIFIED CALL ②: never a fabricated/impossible point. */
  function isRealCoordinate(lat: number | null | undefined, lng: number | null | undefined): lat is number {
    if (lat == null || lng == null) return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat === 0 && lng === 0) return false; // null island — never a real trip location
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    return true;
  }

  function buildExportDays(plan: VariantFullTripPlan) {
    return [...plan.days]
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map(day => ({
        dayNumber: day.dayNumber,
        date: day.dateIso ?? "",
        activities: day.activities
          .filter(a => isRealCoordinate(a.lat, a.lng))
          .map(a => ({
            lat: a.lat as number,
            lng: a.lng as number,
            name: a.name,
            scheduledTime: a.startTime || "",
          })),
        // RATIFIED CALL ①: re-sorted here (not just inherited from the producer) so the
        // export's own ordering contract holds independently of upstream assumptions.
        transportLegs: [...day.transports]
          .sort((a, b) => a.legOrder - b.legOrder)
          .map(l => ({
            legOrder: l.legOrder,
            fromName: l.fromName,
            toName: l.toName,
            recommendedMode: l.recommendedMode,
            estimatedDurationMinutes: l.estimatedDurationMinutes,
            estimatedCostUsd: l.estimatedCostUsd,
            distanceDisplay: l.distanceDisplay,
          })),
      }));
  }

  // RATIFIED CALL ③: `maps_export_cache` is keyed only on `variant_id` (FK'd to
  // `itineraryVariants`, so a suffixed/fake key would violate the FK — no schema change is in
  // scope here anyway). Least-invasive fix: version the CONTENT itself with a marker comment.
  // A cached blob missing or mismatching the marker (i.e. anything written before this change)
  // is treated as a miss — regenerated and overwritten — so the old raw-DB-order /
  // null-island-emitting shape can never be served again post-deploy, with no migration.
  const EXPORT_FORMAT_MARKER = "<!-- traveloure-export-format:v2-variant-producer -->";

  function withExportVersionMarker(xml: string): string {
    const declEnd = xml.indexOf("?>");
    if (declEnd === -1) return `${EXPORT_FORMAT_MARKER}\n${xml}`;
    const insertAt = declEnd + 2;
    return `${xml.slice(0, insertAt)}\n${EXPORT_FORMAT_MARKER}${xml.slice(insertAt)}`;
  }

  function isCurrentExport(content: string | null | undefined): content is string {
    return !!content && content.includes(EXPORT_FORMAT_MARKER);
  }

  // GET /api/itinerary-share/:token/export/kml

router.get("/api/itinerary-share/:token/export/kml", async (req, res) => {
    try {
      const { token } = req.params;

      const shared = await storage.getSharedItineraryByToken(token);
      if (!shared) return res.status(404).json({ error: "Not found" });

      let plan: VariantFullTripPlan;
      try {
        plan = await assembleTripPlanFromVariant(shared.variantId, "full");
      } catch (e) {
        if (e instanceof TripPlanVariantNotFoundError) {
          return res.status(404).json({ error: "Variant not found" });
        }
        throw e;
      }

      const cached = await storage.getMapsExportCacheByVariantId(shared.variantId);
      const cachedKml: string | undefined = cached?.kmlContent;
      let kmlContent: string | null = isCurrentExport(cachedKml) ? cachedKml : null;

      if (!kmlContent) {
        kmlContent = withExportVersionMarker(generateKml({
          tripName: plan.meta.title ?? "Trip",
          destination: plan.meta.destination ?? "Trip",
          days: buildExportDays(plan),
        }));

        await storage.updateMapsExportCache(shared.variantId, { kmlContent });
      }

      res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.kml"`);
      res.send(kmlContent);
    } catch (err: any) {
      console.error("KML export error:", err);
      res.status(500).json({ error: "Failed to generate KML" });
    }
  });

  // GET /api/itinerary-share/:token/export/gpx

router.get("/api/itinerary-share/:token/export/gpx", async (req, res) => {
    try {
      const { token } = req.params;

      const shared = await storage.getSharedItineraryByToken(token);
      if (!shared) return res.status(404).json({ error: "Not found" });

      let plan: VariantFullTripPlan;
      try {
        plan = await assembleTripPlanFromVariant(shared.variantId, "full");
      } catch (e) {
        if (e instanceof TripPlanVariantNotFoundError) {
          return res.status(404).json({ error: "Variant not found" });
        }
        throw e;
      }

      const cached = await storage.getMapsExportCacheByVariantId(shared.variantId);
      const cachedGpx: string | undefined = cached?.gpxContent;
      let gpxContent: string | null = isCurrentExport(cachedGpx) ? cachedGpx : null;

      if (!gpxContent) {
        gpxContent = withExportVersionMarker(generateGpx({
          tripName: plan.meta.title ?? "Trip",
          destination: plan.meta.destination ?? "Trip",
          days: buildExportDays(plan),
        }));

        await storage.updateMapsExportCache(shared.variantId, { gpxContent });
      }

      res.setHeader("Content-Type", "application/gpx+xml");
      res.setHeader("Content-Disposition", `attachment; filename="traveloure-itinerary.gpx"`);
      res.send(gpxContent);
    } catch (err: any) {
      console.error("GPX export error:", err);
      res.status(500).json({ error: "Failed to generate GPX" });
    }
  });

  // GET /api/itinerary-share/:token/navigate/:dayNumber/:legOrder

router.get("/api/itinerary-share/:token/navigate/:dayNumber/:legOrder", async (req, res) => {
    try {
      const { token, dayNumber, legOrder } = req.params;
      const { platform = "google", currentLat, currentLng } = req.query as Record<string, string>;

      const shared = await storage.getSharedItineraryByToken(token);
      if (!shared) return res.status(404).json({ error: "Not found" });

      const leg = await storage.getTransportLegByDayOrder(shared.variantId, parseInt(dayNumber), parseInt(legOrder));

      if (!leg) return res.status(404).json({ error: "Leg not found" });

      const mode = leg.userSelectedMode || leg.recommendedMode;
      const fromLat = currentLat ? parseFloat(currentLat) : leg.fromLat;
      const fromLng = currentLng ? parseFloat(currentLng) : leg.fromLng;

      let url: string;
      if (platform === "apple") {
        url = buildAppleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      } else {
        url = buildGoogleNavUrl(fromLat, fromLng, leg.toLat, leg.toLng, mode);
      }

      res.redirect(302, url);
    } catch (err: any) {
      console.error("Navigate error:", err);
      res.status(500).json({ error: "Failed to build navigation URL" });
    }
  });

  // GET /api/transport-legs/user — returns all transport legs for the current user across all shared itineraries

router.get("/api/transport-legs/user", isAuthenticated, async (req, res) => {
    try {
      const userId = getReqUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const userLegs = await storage.getUserTransportLegsWithJoin(userId);
      res.json(userLegs);
    } catch (err: any) {
      console.error("Get user transport legs error:", err);
      res.status(500).json({ error: "Failed to get transport legs" });
    }
  });

  // GET /api/itinerary-variants/:variantId/transport-legs

router.get("/api/itinerary-variants/:variantId/transport-legs", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = getReqUserId(req);

      // Verify ownership: the variant must belong to a comparison owned by the requesting user
      const variantOwner = await storage.getVariantWithComparisonOwner(variantId);
      if (!variantOwner) return res.status(404).json({ error: "Variant not found" });
      if (variantOwner.userId !== userId) return res.status(403).json({ error: "Not authorized" });

      const legs = await storage.getTransportLegsByVariantId(variantId);
      res.json(legs);
    } catch (err: any) {
      console.error("Get transport legs error:", err);
      res.status(500).json({ error: "Failed to get transport legs" });
    }
  });

  // POST /api/itinerary-variants/:variantId/calculate-transport

router.post("/api/itinerary-variants/:variantId/calculate-transport", isAuthenticated, async (req, res) => {
    try {
      const { variantId } = req.params;
      const userId = getReqUserId(req);
      const { userPrefs } = req.body;

      const variant = await storage.getItineraryVariantById(variantId);
      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const comparison = await storage.getItineraryComparison(variant.comparisonId);
      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const items = await storage.getItineraryVariantItemsByVariantId(variantId);

      const activities = items
        .filter(item => item.latitude && item.longitude)
        .map((item, idx) => ({
          id: item.id,
          name: item.name,
          lat: parseFloat(item.latitude as any),
          lng: parseFloat(item.longitude as any),
          scheduledTime: item.startTime || `09:${String(idx * 30 % 60).padStart(2, "0")}`,
          dayNumber: item.dayNumber,
          order: item.sortOrder || idx,
        }));

      const legs = await calculateTransportLegs(
        variantId,
        activities,
        comparison.destination || "",
        userPrefs || {}
      );

      res.json({ legs, count: legs.length });
    } catch (err: any) {
      console.error("Calculate transport error:", err);
      res.status(500).json({ error: "Failed to calculate transport legs" });
    }
  });

  // POST /api/itinerary-share/:token/suggest — DEPRECATED: Expert suggests modifications (legacy)
  // Use POST /api/expert-review/:shareToken/submit instead (stores full snapshot)

router.post("/api/itinerary-share/:token/suggest", async (req, res) => {
    try {
      const { token } = req.params;
      const { notes, activityDiffs, transportDiffs } = req.body;
      const userId = getReqUserId(req);

      if (!userId) return res.status(401).json({ error: "Authentication required to submit suggestions" });
      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });

      const shared = await storage.getSharedItineraryByToken(token);
      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow suggestions" });
      }

      const variant = await storage.getItineraryVariantById(shared.variantId);
      if (!variant) return res.status(404).json({ error: "Variant not found" });
      const comparison = await storage.getItineraryComparison(variant.comparisonId);

      // Build diff payload
      const expertDiff = {
        activityDiffs: activityDiffs || {},
        transportDiffs: transportDiffs || {},
        submittedAt: new Date().toISOString(),
      };

      // Save diff + notes + update status on shared_itineraries
      await storage.updateSharedItineraryExpertReview(shared.id, "review_sent", { notes, diff: expertDiff });

      // Send notification to the owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await storage.createNotification({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert has reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
        });
      }

      res.json({ success: true, message: "Edits sent to traveler" });
    } catch (err: any) {
      console.error("Expert suggest error:", err);
      res.status(500).json({ error: "Failed to send suggestions" });
    }
  });

  // PATCH /api/itinerary-share/:token/acknowledge — Owner accepts or rejects expert edits

router.patch("/api/itinerary-share/:token/acknowledge", async (req, res) => {
    try {
      const { token } = req.params;
      const { action } = req.body;
      const userId = getReqUserId(req);

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const shared = await storage.getSharedItineraryByToken(token);
      if (!shared) return res.status(404).json({ error: "Share not found" });

      // Only the original sharer (owner) can acknowledge
      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";
      await storage.updateSharedItineraryExpertReview(shared.id, newStatus);

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("Acknowledge expert edits error:", err);
      res.status(500).json({ error: "Failed to acknowledge edits" });
    }
  });

  // POST /api/expert-review/:shareToken/submit — Expert submits diff + notes to expert_updated_itineraries

router.post("/api/expert-review/:shareToken/submit", async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { notes, activityDiffs, transportDiffs } = req.body;
      const userId = getReqUserId(req);

      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });
      if (!userId) return res.status(401).json({ error: "Authentication required to submit expert edits" });

      const shared = await storage.getSharedItineraryByToken(shareToken);
      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow expert edits" });
      }

      const variant = await storage.getItineraryVariantById(shared.variantId);
      if (!variant) return res.status(404).json({ error: "Variant not found" });
      const comparison = await storage.getItineraryComparison(variant.comparisonId);

      // Build full itinerary snapshot: original items with expert diffs applied
      const [originalItems, originalLegs] = await Promise.all([
        storage.getItineraryVariantItemsByVariantId(shared.variantId),
        storage.getTransportLegsByVariantId(shared.variantId),
      ]);

      const resolvedActivityDiffs = activityDiffs || {};
      const resolvedTransportDiffs = transportDiffs || {};

      // Helper: merge HH:MM expert edit with the original ISO date to produce a full ISO timestamp
      const mergeExpertTime = (originalISO: string | null | undefined, hhMM: string | undefined): string | null | undefined => {
        if (!hhMM) return originalISO;
        if (!originalISO) return originalISO;
        try {
          const base = new Date(originalISO);
          const [h, m] = hhMM.split(":").map(Number);
          base.setHours(h, m, 0, 0);
          return base.toISOString();
        } catch {
          // Malformed date/time input — keep the original ISO string unchanged.
          return originalISO;
        }
      };

      const editedActivities = originalItems.map(item => {
        const diff = resolvedActivityDiffs[item.id];
        if (!diff) return { id: item.id, name: item.name, startTime: item.startTime, endTime: item.endTime, dayNumber: item.dayNumber, sortOrder: item.sortOrder, location: item.location, description: item.description };
        return {
          id: item.id,
          name: diff.name ?? item.name,
          startTime: mergeExpertTime(item.startTime, diff.startTime) ?? item.startTime,
          endTime: item.endTime,
          dayNumber: item.dayNumber,
          sortOrder: item.sortOrder,
          location: item.location,
          description: diff.note ? `${item.description || ""}\nExpert note: ${diff.note}`.trim() : item.description,
          expertNote: diff.note,
        };
      });

      const editedLegs = originalLegs.map(leg => {
        const diff = resolvedTransportDiffs[leg.id];
        if (!diff) return { id: leg.id, legOrder: leg.legOrder, dayNumber: leg.dayNumber, recommendedMode: leg.recommendedMode, userSelectedMode: leg.userSelectedMode };
        return { id: leg.id, legOrder: leg.legOrder, dayNumber: leg.dayNumber, recommendedMode: leg.recommendedMode, userSelectedMode: diff.newMode };
      });

      const itinerarySnapshot = {
        variantId: shared.variantId,
        variantName: variant.name,
        editedAt: new Date().toISOString(),
        activities: editedActivities,
        transportLegs: editedLegs,
        expertNotes: notes,
        diffs: {
          activityDiffs: resolvedActivityDiffs,
          transportDiffs: resolvedTransportDiffs,
        },
      };

      const expertDiff = {
        activityDiffs: resolvedActivityDiffs,
        transportDiffs: resolvedTransportDiffs,
        submittedAt: new Date().toISOString(),
      };

      // Save full edited snapshot + message to expert_updated_itineraries
      await storage.saveExpertUpdatedItinerary({
        tripId: comparison?.tripId || null,
        shareToken,
        itineraryData: itinerarySnapshot,
        message: notes,
        status: "pending",
        createdById: userId,
      });

      // Update shared_itineraries with status + diff for traveler review
      await storage.updateSharedItineraryExpertReview(shared.id, "review_sent", { notes, diff: expertDiff });

      // Notify the itinerary owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        // GAP 4 fix (expert-loop object-flow audit, Jul 30 2026): this notification previously
        // carried no `data` at all, so the notifications-page renderer (which only shows an
        // action button when `n.data?.tripId` is truthy — client/src/pages/notifications.tsx)
        // fell through to nothing clickable. The real review/accept UI lives at the token-scoped
        // `/itinerary-view/:token` route (NOT `/trip/:id` — this is a variant/share-token flow,
        // not always trip-backed), so `workspacePath` points there; `tripId` is set to the real
        // trip id when the comparison has one, else the variant id (still a truthy identifier —
        // the renderer only gates visibility on it, the actual link comes from `workspacePath`).
        await storage.createNotification({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
          data: {
            tripId: comparison.tripId || shared.variantId,
            workspacePath: `/itinerary-view/${shareToken}`,
          },
        } as any);
      }

      res.json({ success: true, message: "Edits submitted and traveler notified" });
    } catch (err: any) {
      console.error("Expert review submit error:", err);
      res.status(500).json({ error: "Failed to submit expert edits" });
    }
  });

  // PATCH /api/expert-review/:shareToken/acknowledge — Owner acknowledges expert edits

router.patch("/api/expert-review/:shareToken/acknowledge", async (req, res) => {
    try {
      const { shareToken } = req.params;
      const { action, acceptedDiffIds, rejectedDiffIds } = req.body;
      const userId = getReqUserId(req);

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const shared = await storage.getSharedItineraryByToken(shareToken);
      if (!shared) return res.status(404).json({ error: "Share not found" });

      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";

      // If partial accept/reject, update expert_diff to reflect accepted subset
      if (action === "accept" && (acceptedDiffIds || rejectedDiffIds)) {
        const currentDiff = shared.expertDiff;
        if (currentDiff && rejectedDiffIds?.length > 0) {
          const updatedActivityDiffs = { ...currentDiff.activityDiffs };
          const updatedTransportDiffs = { ...currentDiff.transportDiffs };
          for (const id of rejectedDiffIds) {
            delete updatedActivityDiffs[id];
            delete updatedTransportDiffs[id];
          }
          const updatedDiff = { ...currentDiff, activityDiffs: updatedActivityDiffs, transportDiffs: updatedTransportDiffs };
          await storage.updateSharedItineraryExpertReview(shared.id, newStatus, { diff: updatedDiff });
        } else {
          await storage.updateSharedItineraryExpertReview(shared.id, newStatus);
        }
      } else {
        await storage.updateSharedItineraryExpertReview(shared.id, newStatus);
      }

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error("Expert review acknowledge error:", err);
      res.status(500).json({ error: "Failed to acknowledge edits" });
    }
  });

  // Social sharing meta-tag injection for /itinerary-view/:token
  // This route intercepts the SPA route and injects Open Graph tags into the HTML
  // so social crawlers (Twitter, Facebook, Slack, etc.) see them in <head>.

router.get("/itinerary-view/:token", async (req, res, next) => {
    try {
      const { token } = req.params;

      // Fetch share metadata from DB
      const shared = await storage.getSharedItineraryByToken(token);
      if (!shared) return next(); // Let SPA handle 404

      // ── Thin caller (L3b′): 'preview' is the OG/link-card channel — meta ONLY, no itinerary body
      // of any kind is loaded or rendered (§3). Assembled from the VARIANT snapshot the token is
      // keyed on, so an existing link's card text never changes because the trip moved on.
      let preview: PreviewTripPlan | null = null;
      try {
        preview = await assembleTripPlanFromVariant(shared.variantId, "preview");
      } catch (e) {
        // A share row whose variant is gone: fall through to the same generic copy this route has
        // always used rather than 404 the SPA route.
        if (!(e instanceof TripPlanVariantNotFoundError)) throw e;
      }

      const destination = preview?.meta.destination || "an amazing destination";
      const variantName = preview?.meta.title || "Travel Itinerary";
      const title = `${variantName} – ${destination} | Traveloure`;
      const description = `Explore this AI-powered itinerary for ${destination}. View day-by-day activities, transport options, and more — shared via Traveloure.`;
      const shareUrl = `${req.protocol}://${req.get("host")}/itinerary-view/${token}`;

      // Use a destination-based image for og:image (Unsplash source for travel images)
      const encodedDest = encodeURIComponent(destination);
      const ogImage = `https://source.unsplash.com/1200x630/?travel,${encodedDest}`;

      const ogTags = [
        `<title>${title}</title>`,
        `<meta name="description" content="${description}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:url" content="${shareUrl}" />`,
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="${description}" />`,
        `<meta property="og:image" content="${ogImage}" />`,
        `<meta property="og:site_name" content="Traveloure" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${title}" />`,
        `<meta name="twitter:description" content="${description}" />`,
        `<meta name="twitter:image" content="${ogImage}" />`,
      ].join("\n    ");

      // Read index.html and inject tags into <head>. ESM-safe resolution (no __dirname in the
      // dev runtime — the ReferenceError silently killed injection via catch/next()); prod
      // serves the BUILT template (hashed assets) whenever it exists.
      let template: string;
      const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
      const clientTemplateProd = path.resolve(process.cwd(), "dist", "public", "index.html");
      const templatePath =
        process.env.NODE_ENV === "production" && fs.existsSync(clientTemplateProd)
          ? clientTemplateProd
          : clientTemplateDev;

      if (!fs.existsSync(templatePath)) return next();

      template = fs.readFileSync(templatePath, "utf-8");
      // Strip the template's own static og:title/og:description before injecting ours —
      // otherwise crawlers see duplicate tags (the injected pair still wins on order, but
      // duplicates are sloppy). Only sites that inject their own tags run this.
      template = template.replace(/<meta property="og:(title|description)"[^>]*>\s*/g, "");
      template = template.replace("<head>", `<head>\n    ${ogTags}`);
      // Dev-only: run the raw index.html through Vite's transform so the React-refresh
      // preamble/client injections are present (prod never registers a transformer, so this
      // is a no-op pass-through there).
      template = await transformDevHtml(req.originalUrl, template);

      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (err) {
      console.error("OG meta injection error:", err);
      next(); // Fall through to SPA on error
    }
  });

  // ============================================
  // DATA TRACKING & MONETIZATION APIs
  // ============================================

  async function inferTripAnalytics(tripId: string, userId: string) {
    try {
      const trip = await storage.getTrip(tripId);
      if (!trip) return;
      const itineraryData = await storage.getGeneratedItineraryByTripId(tripId);
      const items = itineraryData?.itineraryData as any;
      let partyComposition = "group";
      const travelers = trip.numberOfTravelers || 1;
      const eventType = trip.eventType || "vacation";
      if (travelers === 1) partyComposition = "solo";
      else if (travelers === 2 && ["honeymoon", "anniversary", "proposal", "romantic"].includes(eventType)) partyComposition = "couple";
      else if (travelers <= 4 && eventType === "vacation") partyComposition = "family";
      let hasChildren = false;
      if (items?.dailyItinerary) {
        const allActivities = JSON.stringify(items.dailyItinerary).toLowerCase();
        hasChildren = allActivities.includes("kid") || allActivities.includes("child") || allActivities.includes("family") || allActivities.includes("playground") || allActivities.includes("zoo") || allActivities.includes("aquarium");
      }
      const startDate = trip.startDate ? new Date(trip.startDate) : null;
      const endDate = trip.endDate ? new Date(trip.endDate) : null;
      const lengthOfStay = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
      let season = null;
      if (startDate) { const month = startDate.getMonth(); if (month >= 2 && month <= 4) season = "spring"; else if (month >= 5 && month <= 7) season = "summer"; else if (month >= 8 && month <= 10) season = "fall"; else season = "winter"; }
      const destination = trip.destination || "";
      const destinationParts = destination.split(",").map((s: string) => s.trim());
      const destinationCity = destinationParts[0] || destination;
      const destinationCountry = destinationParts.length > 1 ? destinationParts[destinationParts.length - 1] : null;
      let priceSegment = "mid-range";
      const budget = parseFloat(trip.budget || "0");
      const dailyBudget = lengthOfStay && lengthOfStay > 0 ? budget / lengthOfStay : budget;
      if (dailyBudget < 100) priceSegment = "budget"; else if (dailyBudget < 300) priceSegment = "mid-range"; else if (dailyBudget < 500) priceSegment = "luxury"; else priceSegment = "ultra-luxury";
      let primaryActivity = null;
      if (items?.dailyItinerary) {
        const activityCounts: Record<string, number> = {};
        for (const day of items.dailyItinerary) { for (const activity of day.activities || []) { const type = activity.type || activity.category || "sightseeing"; activityCounts[type] = (activityCounts[type] || 0) + 1; } }
        primaryActivity = Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      }
      await storage.upsertTripAnalytics({ tripId, userId, destinationCity, destinationCountry, tripStartDate: startDate, tripEndDate: endDate, lengthOfStay, season, partySize: travelers, partyComposition, hasChildren, tripPurpose: eventType, totalBudget: trip.budget, priceSegment, primaryActivity });
    } catch (err) { console.error("Error inferring trip analytics:", err); }
  }

  async function canAccessTripItems(tripId: string, userId: string): Promise<boolean> {
    const owned = await verifyTripOwnership(tripId, userId);
    if (owned) return true;
    return await storage.isExpertAssignedToTrip(tripId, userId);
  }

  // Track search events (called from frontend)

router.post("/api/trips/:tripId/analytics/infer", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const tripId = req.params.tripId;
      
      // Verify ownership
      const trip = await storage.getTrip(tripId);
      if (!trip || trip.userId !== userId) {
        return res.status(404).json({ message: "Trip not found" });
      }

      await inferTripAnalytics(tripId, userId);
      res.json({ success: true, message: "Analytics captured" });
    } catch (err) {
      console.error("Infer analytics error:", err);
      res.status(500).json({ message: "Failed to capture analytics" });
    }
  });

  // Track searches automatically (what destinations were considered)

router.patch("/api/trips/:tripId/itinerary-items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId, itemId } = req.params;
      // D1 (ruling, Aug 7 2026 — "a PENDING advisor may not write"): this is a trip-item
      // MUTATION path, so it resolves the advisor branch through the WRITE allow-list
      // (`getTripWriteRole` — accepted/assigned, NOT pending) instead of `getTripRole`.
      const tripRole = await getTripWriteRole(tripId, userId);
      // Authoring mode (ready-made brief §2/§4): PARALLEL named author branch beside getTripRole —
      // the helper is deliberately untouched (known pre-launch bypass, separate fix).
      const authorMayMutate = canMutateTrip(tripRole) ? false : await isTripAuthor(tripId, userId);
      if (!canMutateTrip(tripRole) && !authorMayMutate) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends can only suggest changes, not edit activities directly" : "Access denied" });
      }
      // FABLE-REVIEW: the mode-flip gate. `tripRole === "expert"` is the advisor-only branch of
      // canMutateTrip (never owner — see trip-role.ts; never the authored-build author, which
      // takes the separate authorMayMutate branch above and never reaches "expert" here).
      if (tripRole === "expert" && await isPlanApprovedForExpert(tripId, userId)) {
        return res.status(409).json(PLAN_APPROVED_SUGGEST_INSTEAD_ERROR);
      }
      const existing = await storage.getItineraryItemByIdAndTrip(itemId, tripId);
      if (!existing) return res.status(404).json({ message: "Item not found in this trip" });
      // Strip immutable/ownership fields to prevent mass-assignment. `origin` (D2, ratified Aug 7
      // 2026) is provenance stamped only at CREATE time — a PATCH must never let a client
      // retroactively rewrite it.
      // `expertNote` is DELIBERATELY left in `safeBody` and reaches the DB write below — it is the
      // TRAVELER-FACING per-item note (§21, migration 152) PlanCard already renders, distinct from
      // the trip-level PRIVATE `trips.expertNotes` (Workstation build notes) and the trip-level
      // traveler-facing `trips.expertTravelerNote` (PATCH /api/trips/:tripId/expert-traveler-note,
      // below). This write path already carried it — the §21 audit's "Workstation write path" gap
      // was the client never sending the field, not a missing server allow-list entry.
      const { id: _id, tripId: _tripId, createdAt: _createdAt, updatedAt: _updatedAt, suggestedBy: _sb, origin: _origin, ...safeBody } = req.body as any;
      const updated = await storage.updateItineraryItem(itemId, safeBody);
      if (!updated) return res.status(404).json({ message: "Item not found" });
      res.json(updated);
    } catch (err) {
      console.error("[ItineraryItems] PATCH error:", err);
      res.status(500).json({ message: "Failed to update itinerary item" });
    }
  });


router.delete("/api/trips/:tripId/itinerary-items/:itemId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId, itemId } = req.params;
      // D1 (ruling, Aug 7 2026): trip-item MUTATION path — WRITE-gated role (see PATCH above).
      const tripRole = await getTripWriteRole(tripId, userId);
      // Authoring mode (ready-made brief §2/§4): parallel named author branch (see PATCH above).
      const authorMayMutate = canMutateTrip(tripRole) ? false : await isTripAuthor(tripId, userId);
      if (!canMutateTrip(tripRole) && !authorMayMutate) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends cannot remove activities" : "Access denied" });
      }
      // FABLE-REVIEW: the mode-flip gate — see the PATCH handler above for the full rationale.
      if (tripRole === "expert" && await isPlanApprovedForExpert(tripId, userId)) {
        return res.status(409).json(PLAN_APPROVED_SUGGEST_INSTEAD_ERROR);
      }
      const existing = await storage.getItineraryItemByIdAndTrip(itemId, tripId);
      if (!existing) return res.status(404).json({ message: "Item not found in this trip" });
      // R15 (ledger 2026-08-17-partner-demand-r15-transition-log): record WHO removed the item on
      // the same-transaction `item_removed` diary row. The actor is derived from the trip
      // authorization above (never req.body): an assigned expert acting on the plan ⇒ "expert",
      // otherwise the owner/author ⇒ "traveler".
      await storage.deleteItineraryItem(itemId, {
        actorType: tripRole === "expert" ? "expert" : "traveler",
        actorId: userId,
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[ItineraryItems] DELETE error:", err);
      res.status(500).json({ message: "Failed to delete itinerary item" });
    }
  });


// PATCH /api/trips/:tripId/expert-traveler-note — §21 (ratified Aug 9 2026, migration 187):
// TRAVELER-FACING trip-level delivery note ("Note from your expert", rendered atop the delivered
// plan — client/src/components/plancard/PlanCard.tsx). DISTINCT from the PRIVATE
// PATCH /api/trips/:tripId/expert-notes (server/routes/booking-actions.ts), which is the
// Workstation's own build-notes rail and must NEVER be delivered to the traveler — never merge
// the two write rails, never let one endpoint write the other's column.
//
// Write-gated through the canonical `authorizeTripLogistics` posture (owner ‖ accepted/assigned
// advisor ‖ trip author ‖ audit-logged admin) with `requireWriteAccess: true` — the same §12
// posture ("a PENDING advisor may not write") the itinerary-item mutation routes above use — since
// this endpoint mutates trip-visible content exactly like they do. This is a deliberately BROADER
// gate than the private-notes PATCH it mirrors in shape (that one is assignment-only, a known
// narrower gap — see this file's PATCH itinerary-items handler for the same owner/author/advisor
// posture already established elsewhere in this router).
router.patch("/api/trips/:tripId/expert-traveler-note", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId } = req.params;
      const denied = await authorizeTripLogistics(
        tripId, userId, "PATCH /api/trips/:tripId/expert-traveler-note", { requireWriteAccess: true },
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });

      const raw = (req.body as any)?.expertTravelerNote;
      if (raw !== null && raw !== undefined && typeof raw !== "string") {
        return res.status(400).json({ message: "expertTravelerNote must be a string or null" });
      }
      const trimmed = typeof raw === "string" ? raw.trim() : null;
      if (trimmed && trimmed.length > 2000) {
        return res.status(400).json({ message: "expertTravelerNote must be 2000 characters or fewer" });
      }
      // Empty string → null (the "no note" value), matching the private rail's own convention.
      const expertTravelerNote = trimmed ? trimmed : null;

      await storage.updateTrip(tripId, { expertTravelerNote });
      res.json({ ok: true, expertTravelerNote });
    } catch (err) {
      console.error("[Advisor] saveExpertTravelerNote error:", err);
      res.status(500).json({ message: "Failed to save expert traveler note" });
    }
  });


  // === EA Client Delegation Routes ===

  // GET /api/ea/clients — list all clients managed by this EA

export default router;
