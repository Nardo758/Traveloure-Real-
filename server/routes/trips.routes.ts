import path from "path";
import fs from "fs";
import crypto from "crypto";
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
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant, type TripPreferences } from "../itinerary-optimizer";
import { complexityTier } from "../services/smart-sequencing.service";
import { getFee } from "../services/optimization-fee.service";
import Stripe from "stripe";

const stripeForOptimization = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia" as any,
});
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
  EXPERT_SHARE_RATE,
  PLATFORM_FEE_RATE,
  resolveCommissionRates,
  type CommissionRates,
} from "../services/commission";
import { getTripRole, canMutateTrip } from "../utils/trip-role";

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


router.get(api.trips.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const status = req.query.status as string | undefined;
    const trips = await storage.getTrips(userId, status);
    res.json(trips);
  });


router.get(api.trips.get.path, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }
    // Check access: owner, assigned expert, managing EA, or guest with shareToken
    const userId = (req.user as any)?.claims?.sub ?? null;
    const shareToken = req.query.token as string | undefined;
    const isOwner = trip.userId && trip.userId === userId;
    const isExpert = (trip as any).expertId === userId;
    const isManagingEa = (trip as any).managedByEaId === userId;
    const isGuestWithToken = shareToken && trip.shareToken === shareToken;
    if (!isOwner && !isExpert && !isManagingEa && !isGuestWithToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(trip);
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
      
      const userId = (req.user as any)?.claims?.sub ?? null;
      const trip = await storage.createTrip({ ...sanitizedInput, userId });

      // If guest, ensure they have a shareToken for access
      if (!userId && !trip.shareToken) {
        const token = crypto.randomBytes(32).toString("hex");
        const [updated] = await db.update(trips)
          .set({ shareToken: token })
          .where(eq(trips.id, trip.id))
          .returning();
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

      const userId = (req.user as any)?.claims?.sub ?? null;
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

      const userId = (req.user as any).claims.sub;
      const [updated] = await db.update(trips)
        .set({ userId })
        .where(eq(trips.id, req.params.id))
        .returning();

      res.json(updated);
    } catch (err) {
      console.error("[trips] claim error:", err);
      res.status(500).json({ message: "Failed to claim trip" });
    }
  });


router.delete(api.trips.delete.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    
    const userId = (req.user as any).claims.sub;
    if (trip.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

    await storage.deleteTrip(req.params.id);
    res.status(204).send();
  });


router.post("/api/trips/generate-itinerary", isAuthenticated, async (req, res) => {
    const { tripId } = req.body;
    if (!tripId) {
      return res.status(400).json({ message: "tripId is required in the request body" });
    }
    const trip = await storage.getTrip(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    const itinerary = await storage.createGeneratedItinerary({
      tripId: trip.id,
      itineraryData: {
        days: [
          { day: 1, activities: [
            { time: "10:00 AM", title: "Visit City Center", description: "Explore the main square." },
            { time: "2:00 PM", title: "Lunch at Local Cafe", description: "Try the famous pastry." }
          ]},
          { day: 2, activities: [
            { time: "09:00 AM", title: "Museum Tour", description: "Learn about local history." },
            { time: "4:00 PM", title: "Sunset View", description: "Best view in the city." }
          ]}
        ]
      },
      status: "generated"
    });
    res.status(201).json(itinerary);
  });


router.post(api.trips.generateItinerary.path, isAuthenticated, async (req, res) => {
    try {
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

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
          model: "claude-sonnet-4-20250514",
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
        [itinerary] = await db
          .update(generatedItineraries)
          .set({ itineraryData, status: "generated" })
          .where(eq(generatedItineraries.id, existing.id))
          .returning();
      } else {
        itinerary = await storage.createGeneratedItinerary({ tripId: trip.id, itineraryData, status: "generated" });
      }

      // Rebuild itinerary_items — delete old, insert new
      await db.delete(itineraryItems).where(eq(itineraryItems.tripId, trip.id));

      for (const day of itineraryData.days || []) {
        for (const activity of day.activities || []) {
          await db.insert(itineraryItems).values({
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
          });
        }
      }

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
    const userId = (req.user as any).claims.sub;
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

router.post("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { userExperienceId, tripId, title, destination, startDate, endDate, budget, travelers, baselineItems: inlineBaselineItems, experienceTypeSlug, optimizationPaymentId } = req.body;

      // ── Optimization authorization gate ──────────────────────────────────────
      // Comparison records are ALWAYS created (never blocked).
      // The AI optimizer only runs when payment is verified OR a 24h free rerun applies.
      let canRunOptimizer = false;

      // Check free 24h rerun eligibility first (no Stripe call needed)
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [recentRun] = await db
        .select({ id: itineraryComparisons.id })
        .from(itineraryComparisons)
        .where(
          and(
            eq(itineraryComparisons.userId, userId),
            sql`${itineraryComparisons.optimizedAt} >= ${cutoff.toISOString()}`
          )
        )
        .limit(1);

      if (recentRun) {
        canRunOptimizer = true;
      } else if (optimizationPaymentId) {
        // Paid run path — verify payment before allowing optimizer
        // Reject reuse: check if this PI is already tied to any existing comparison
        const [alreadyUsed] = await db
          .select({ id: itineraryComparisons.id })
          .from(itineraryComparisons)
          .where(eq(itineraryComparisons.optimizationPaymentId, optimizationPaymentId))
          .limit(1);
        if (alreadyUsed) {
          return res.status(409).json({
            error: "payment_already_used",
            message: "This optimization payment has already been used. Please start a new optimization.",
          });
        }

        // Require a concrete target when using a payment
        if (!tripId && !userExperienceId) {
          return res.status(400).json({
            error: "target_required",
            message: "Provide tripId or userExperienceId for paid optimization.",
          });
        }

        // Verify with Stripe
        try {
          const pi = await stripeForOptimization.paymentIntents.retrieve(optimizationPaymentId);
          if (pi.status !== "succeeded") {
            return res.status(402).json({ error: "payment_not_confirmed", message: "Optimization payment has not been confirmed." });
          }
          if (pi.metadata?.userId && pi.metadata.userId !== userId) {
            return res.status(403).json({ error: "payment_belongs_to_another_user" });
          }
          if (pi.metadata?.type !== "optimization_fee") {
            return res.status(402).json({ error: "invalid_payment_type" });
          }
          // Strict PI-to-target binding: PI metadata target must match the request target
          const piTargetTrip = pi.metadata?.targetTripId || undefined;
          const piTargetExp = pi.metadata?.targetExperienceId || undefined;
          if (piTargetTrip && piTargetTrip !== tripId) {
            return res.status(402).json({ error: "payment_target_mismatch", message: "Payment was issued for a different trip." });
          }
          if (piTargetExp && piTargetExp !== userExperienceId) {
            return res.status(402).json({ error: "payment_target_mismatch", message: "Payment was issued for a different experience." });
          }
          // Re-derive expected fee from the actual comparison resource (not PI metadata).
          // CON-A.P2 (FEE-A): resolve through the single fee resolver so admin event-type
          // overrides (e.g. wedding $49.99) pass validation. Anti-tampering by server-side
          // recompute — no hardcoded allow-list of amounts.
          let actualEventType: string | undefined;
          if (tripId) {
            const [tRow] = await db.select({ eventType: trips.eventType }).from(trips).where(eq(trips.id, tripId)).limit(1);
            actualEventType = tRow?.eventType ?? undefined;
          } else {
            const [eRow] = await db
              .select({ slug: experienceTypes.slug })
              .from(userExperiences)
              .innerJoin(experienceTypes, eq(userExperiences.experienceTypeId, experienceTypes.id))
              .where(eq(userExperiences.id, userExperienceId!))
              .limit(1);
            actualEventType = eRow?.slug ?? undefined;
          }
          const actualTier = complexityTier(actualEventType);
          const { priceCents: requiredCents, isDisabled: feeDisabled } = await getFee(actualEventType, actualTier);
          if (feeDisabled) {
            return res.status(402).json({
              error: "ai_concierge_disabled",
              message: "AI Concierge is currently disabled for this experience type.",
            });
          }
          if (pi.amount !== requiredCents) {
            return res.status(402).json({
              error: "payment_amount_mismatch",
              message: `Payment amount does not match the required fee for this resource.`,
            });
          }
          canRunOptimizer = true;
        } catch (stripeErr: any) {
          if ((stripeErr as any).statusCode || (stripeErr as any).type === "StripeInvalidRequestError") {
            return res.status(402).json({ error: "payment_verification_failed", message: stripeErr.message });
          }
          throw stripeErr;
        }
      }
      // ── End authorization gate ──────────────────────────────────────────────
      // canRunOptimizer=false → comparison created with status "pending_payment"
      // canRunOptimizer=true  → comparison created with status "generating" + optimizer triggered

      const [comparison] = await db
        .insert(itineraryComparisons)
        .values({
          userId,
          userExperienceId,
          tripId,
          title: title || "My Itinerary Comparison",
          destination,
          startDate,
          endDate,
          budget: budget?.toString(),
          travelers: travelers || 1,
          experienceTypeSlug: experienceTypeSlug || null,
          status: canRunOptimizer ? "generating" : "pending_payment",
          ...(optimizationPaymentId ? { optimizationPaymentId } : {}),
        })
        .returning();

      // Auto-generate AI alternatives immediately
      let baselineItems: any[] = [];

      if (inlineBaselineItems && inlineBaselineItems.length > 0) {
        baselineItems = inlineBaselineItems.map((item: any, index: number) => ({
          id: `inline-${index}`,
          name: item.name,
          description: item.description || "",
          serviceType: item.category || "service",
          price: parseFloat(item.price || "0"),
          rating: item.rating || 4.5,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else {
        // Fall back to cart items
        const cartItemsData = await db
          .select({
            cartItem: cartItems,
            service: providerServices,
          })
          .from(cartItems)
          .leftJoin(providerServices, eq(cartItems.serviceId, providerServices.id))
          .where(eq(cartItems.userId, userId));

        baselineItems = cartItemsData.map((item, index) => ({
          id: item.cartItem.id,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          rating: parseFloat(item.service?.averageRating || "4.5"),
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
          category: item.service?.serviceType || "service",
          provider: "Provider"
        }));
      }

      // Trigger AI optimization in background only when authorized (payment verified or free rerun)
      if (canRunOptimizer && baselineItems.length > 0) {
        const availableServices = await db
          .select()
          .from(providerServices)
          .where(eq(providerServices.status, "active"))
          .limit(100);

        // Ensure dates are in YYYY-MM-DD format
        const formatDate = (d: string | undefined | null) => {
          if (!d) return new Date().toISOString().split('T')[0];
          if (d.includes('T')) return d.split('T')[0];
          return d;
        };

        // Build trip preferences for adaptive variant strategy
        let tripPreferences: TripPreferences | undefined;
        if (tripId) {
          const [tripRow] = await db
            .select({ eventType: trips.eventType, budget: trips.budget, preferences: trips.preferences })
            .from(trips)
            .where(eq(trips.id, tripId))
            .limit(1);
          if (tripRow) {
            const prefs = (tripRow.preferences as Record<string, any>) || {};
            tripPreferences = {
              eventType: tripRow.eventType,
              budget: tripRow.budget ? parseFloat(tripRow.budget) : null,
              travelStyles: Array.isArray(prefs.travelStyles) ? prefs.travelStyles : [],
            };
          }
        }

        generateOptimizedItineraries(
          comparison.id,
          userId,
          baselineItems,
          availableServices,
          destination || "Unknown",
          formatDate(startDate),
          formatDate(endDate),
          budget ? parseFloat(budget) : undefined,
          travelers || 1,
          tripId,
          undefined,
          tripPreferences
        ).catch((err) => console.error("Background optimization error:", err));
      }

      res.status(201).json(comparison);
    } catch (error) {
      console.error("Error creating comparison:", error);
      res.status(500).json({ message: "Failed to create comparison" });
    }
  });


router.get("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const comparisons = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.userId, userId))
        .orderBy(itineraryComparisons.createdAt);

      res.json(comparisons);
    } catch (error) {
      console.error("Error fetching comparisons:", error);
      res.status(500).json({ message: "Failed to fetch comparisons" });
    }
  });


router.get("/api/itinerary-comparisons/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
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
      const userId = (req.user as any).claims.sub;
      const comparisonId = req.params.id;
      const { baselineItems: inlineBaselineItems } = req.body;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, comparisonId),
      });

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
          rating: item.rating || 4.5,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else if (comparison.userExperienceId) {
        const items = await db
          .select()
          .from(userExperienceItems)
          .where(eq(userExperienceItems.userExperienceId, comparison.userExperienceId));

        baselineItems = items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          serviceType: item.providerServiceId ? "provider" : "external",
          price: parseFloat(item.price || "0"),
          rating: 4.5,
          location: item.location,
          duration: 120,
          dayNumber: 1,
          timeSlot: item.scheduledTime || "morning",
        }));
      } else {
        const cartItemsData = await db
          .select({
            cartItem: cartItems,
            service: providerServices,
          })
          .from(cartItems)
          .leftJoin(providerServices, eq(cartItems.serviceId, providerServices.id))
          .where(eq(cartItems.userId, userId));

        baselineItems = cartItemsData.map((item, index) => ({
          id: item.cartItem.id,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          rating: parseFloat(item.service?.averageRating || "4.5"),
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
        }));
      }

      if (baselineItems.length === 0) {
        return res.status(400).json({ message: "No items to optimize. Add services to your cart or experience first." });
      }

      const availableServices = await db
        .select()
        .from(providerServices)
        .where(eq(providerServices.status, "active"))
        .limit(100);

      res.json({ message: "Optimization started", status: "generating" });

      // Build trip preferences for adaptive variant strategy
      let tripPreferencesForGen: TripPreferences | undefined;
      if (comparison.tripId) {
        const [tripRowForGen] = await db
          .select({ eventType: trips.eventType, budget: trips.budget, preferences: trips.preferences })
          .from(trips)
          .where(eq(trips.id, comparison.tripId))
          .limit(1);
        if (tripRowForGen) {
          const prefsForGen = (tripRowForGen.preferences as Record<string, any>) || {};
          tripPreferencesForGen = {
            eventType: tripRowForGen.eventType,
            budget: tripRowForGen.budget ? parseFloat(tripRowForGen.budget) : null,
            travelStyles: Array.isArray(prefsForGen.travelStyles) ? prefsForGen.travelStyles : [],
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
      const userId = (req.user as any).claims.sub;
      const { variantId } = req.body;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, req.params.id),
      });

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
      const userId = (req.user as any).claims.sub;
      const comparisonId = req.params.id;

      const comparison = await db.query.itineraryComparisons.findFirst({
        where: eq(itineraryComparisons.id, comparisonId),
      });

      if (!comparison || comparison.userId !== userId) {
        return res.status(404).json({ message: "Comparison not found" });
      }

      if (!comparison.selectedVariantId) {
        return res.status(400).json({ message: "No variant selected" });
      }

      const variantItems = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, comparison.selectedVariantId));

      await db.delete(cartItems).where(eq(cartItems.userId, userId));

      for (const item of variantItems) {
        if (item.providerServiceId) {
          await db.insert(cartItems).values({
            userId,
            serviceId: item.providerServiceId,
            quantity: 1,
            notes: `Day ${item.dayNumber} - ${item.timeSlot}`,
          });
        }
      }

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

      const userId = (req.user as any).claims.sub;
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
      const [saved] = await db.insert(aiGeneratedItineraries).values({
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
      }).returning();

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
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const participants = await coordinationService.getParticipants(req.params.tripId);
    res.json(participants);
  }));


router.get("/api/trips/:tripId/participants/stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getParticipantStats(req.params.tripId);
    res.json(stats);
  }));


router.get("/api/trips/:tripId/participants/payment-stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getPaymentStats(req.params.tripId);
    res.json(stats);
  }));


router.get("/api/trips/:tripId/participants/dietary", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any).claims.sub;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const dietary = await coordinationService.getDietaryRequirements(req.params.tripId);
    res.json(dietary);
  }));


router.post("/api/trips/:tripId/participants", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
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

// Document upload for vendor contracts
router.post("/api/trips/:tripId/contracts/:contractId/documents", isAuthenticated, async (req, res) => {
    try {
      const { documentType, fileName, fileBase64, mimeType } = req.body;

      if (!fileBase64 || !fileName || !documentType) {
        return res.status(400).json({ message: "Missing required fields: fileBase64, fileName, documentType" });
      }

      const fileBuffer = Buffer.from(fileBase64, "base64");
      const result = await vendorManagementService.uploadContractDocument(
        req.params.contractId,
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

// Bulk email to vendors
router.post("/api/trips/:tripId/vendors/bulk-email", isAuthenticated, async (req, res) => {
    try {
      const { contractIds, subject, body, includeCalendarInvite, eventDate } = req.body;

      if (!contractIds || !Array.isArray(contractIds) || contractIds.length === 0) {
        return res.status(400).json({ message: "contractIds must be a non-empty array" });
      }

      if (!subject || !body) {
        return res.status(400).json({ message: "subject and body are required" });
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

// Generate vendor contact sheet
router.get("/api/trips/:tripId/vendors/contact-sheet", isAuthenticated, async (req, res) => {
    try {
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
      const userId = (req.user as any).claims.sub;
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
      const userId = (req.user as any).claims.sub;
      const userName = (req.user as any).claims.name || "User";
      const { tripId } = req.params;
      const tripRole = await getTripRole(tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends can only suggest activities, not add them directly" : "Access denied" });
      }
      const parsed = insertItineraryItemSchema.safeParse({ ...req.body, tripId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const item = await storage.createItineraryItem(parsed.data as any);
      logItineraryChange(tripId, userName, `Added "${item.title}"`, "add", tripRole!, item.id);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create itinerary item" });
    }
  });


router.patch("/api/itinerary-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const userName = (req.user as any).claims.name || "User";
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      const tripRole = await getTripRole(existing.tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends can only suggest changes, not edit activities directly" : "Access denied" });
      }
      const item = await itineraryIntelligenceService.updateItem(req.params.id, req.body);
      const changedFields = Object.keys(req.body).filter(k => k !== 'id').join(', ');
      logItineraryChange(existing.tripId, userName, `Updated "${existing.title}" (${changedFields})`, "edit", tripRole!, req.params.id);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to update itinerary item" });
    }
  });


router.post("/api/itinerary-items/:id/backup", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
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
      const userId = (req.user as any).claims.sub;
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


router.post("/api/trips/:tripId/itinerary/optimize-order", isAuthenticated, async (req, res) => {
    try {
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
      const userId = (req as any).user?.id;

      const [trip] = await db
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.userId, userId)));
      if (!trip) return res.status(404).json({ error: "Trip not found" });

      const [genItinerary] = await db
        .select()
        .from(generatedItineraries)
        .where(eq(generatedItineraries.tripId, tripId));
      if (!genItinerary?.itineraryData) {
        return res.status(404).json({ error: "No generated itinerary found for this trip" });
      }

      let [comparison] = await db
        .select()
        .from(itineraryComparisons)
        .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)));

      if (!comparison) {
        const [created] = await db.insert(itineraryComparisons).values({
          userId,
          tripId,
          title: trip.title || trip.destination || "My Trip",
          destination: trip.destination,
          status: "active",
        }).returning();
        comparison = created;
      }

      let [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(and(
          eq(itineraryVariants.comparisonId, comparison.id),
          eq(itineraryVariants.source, "ai")
        ));

      if (!variant) {
        const [created] = await db.insert(itineraryVariants).values({
          comparisonId: comparison.id,
          name: "AI Generated",
          source: "ai",
          status: "active",
        }).returning();
        variant = created;
      }

      const data: any = genItinerary.itineraryData;
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

      const savedLegs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, variant.id));

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


router.delete("/api/itinerary-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const userName = (req.user as any).claims.name || "User";
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      const tripRole = await getTripRole(existing.tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends cannot remove activities" : "Access denied" });
      }
      await itineraryIntelligenceService.deleteItem(req.params.id);
      logItineraryChange(existing.tripId, userName, `Removed "${existing.title}"`, "remove", tripRole!, req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete itinerary item" });
    }
  });

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


router.post("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
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
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const anchors = await storage.getTemporalAnchors(req.params.tripId);
      res.json(anchors);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get temporal anchors", error: error.message });
    }
  });


router.post("/api/trips/:tripId/anchors", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

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

      const input = insertTemporalAnchorSchema.parse(body);
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
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const updated = await storage.updateTemporalAnchor(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Anchor not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update anchor", error: error.message });
    }
  });


router.delete("/api/anchors/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      await storage.deleteTemporalAnchor(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete anchor", error: error.message });
    }
  });

  // === Logistics: Day Boundaries ===


router.get("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const boundaries = await storage.getDayBoundaries(req.params.tripId);
      res.json(boundaries);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get day boundaries", error: error.message });
    }
  });


router.post("/api/trips/:tripId/day-boundaries", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

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
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

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


router.post("/api/trips/:tripId/calculate-energy", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      // Get all itinerary items for the trip grouped by day
      const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, req.params.tripId));

      const dayMap = new Map<number, typeof items>();
      for (const item of items) {
        const day = item.dayNumber;
        if (!dayMap.has(day)) dayMap.set(day, []);
        dayMap.get(day)!.push(item);
      }

      const energyByDay: Array<{ dayNumber: number; startingEnergy: number; activityDepletion: number; endingEnergy: number; breakdown: Array<{ itemId: string; title: string; energyCost: number }> }> = [];

      for (const [dayNumber, dayItems] of Array.from(dayMap)) {
        let depletion = 0;
        const breakdown: Array<{ itemId: string; title: string; energyCost: number }> = [];

        for (const item of dayItems) {
          const cost = item.energyCost || 20;
          depletion += cost;
          breakdown.push({ itemId: item.id, title: item.title, energyCost: cost });
        }

        const startingEnergy = 100;
        const endingEnergy = Math.max(0, startingEnergy - depletion);

        energyByDay.push({ dayNumber, startingEnergy, activityDepletion: depletion, endingEnergy, breakdown });

        // Save to database
        await storage.saveEnergyTracking({
          tripId: req.params.tripId,
          dayNumber,
          startingEnergy,
          activityDepletion: depletion,
          endingEnergy,
          recoveryNeeded: endingEnergy < 20,
          recoveryReason: endingEnergy < 20 ? `Energy critically low (${endingEnergy}%) - consider lighter activities` : null,
          energyBreakdown: breakdown,
        });
      }

      res.json({
        tripId: req.params.tripId,
        totalDays: energyByDay.length,
        energyByDay,
        warnings: energyByDay.filter(d => d.endingEnergy < 30).map(d => `Day ${d.dayNumber}: energy drops to ${d.endingEnergy}%`),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to calculate energy", error: error.message });
    }
  });

  // === Workspace Constraints Summary ===


router.get("/api/trips/:tripId/workspace-constraints", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      // Assignment-scoped authorization: owner, admin, or an expert assigned to this specific trip
      const { tripId } = req.params;
      const owned = await verifyTripOwnership(tripId, userId);
      if (!owned) {
        const user = await storage.getUser(userId);
        if (!user) return res.status(401).json({ message: "Not authenticated" });
        if (user.role === "admin") {
          // admins pass through
        } else {
          const assigned = await storage.isExpertAssignedToTrip(tripId, userId);
          if (!assigned) return res.status(403).json({ message: "Access denied" });
        }
      }

      const trip = await storage.getTrip(tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const [anchors, boundaries, energyRecords, items] = await Promise.all([
        storage.getTemporalAnchors(tripId),
        storage.getDayBoundaries(tripId),
        storage.getEnergyTracking(tripId),
        storage.getItineraryItems(tripId),
      ]);

      // Detect anchor conflicts using the logistics service
      const { detectAnchorImpacts } = await import('../services/logistics-presets.service');
      const anchorConflicts: Array<{
        anchorId: string;
        anchorType: string;
        description: string;
        impacts: Array<{ type: string; message: string; severity: 'warning' | 'critical' }>;
      }> = [];
      for (const anchor of anchors) {
        const impacts = await detectAnchorImpacts(tripId, anchor.id);
        if (impacts.length > 0) {
          anchorConflicts.push({
            anchorId: anchor.id,
            anchorType: anchor.anchorType,
            description: anchor.description || anchor.anchorType,
            impacts,
          });
        }
      }

      // Evaluate day-boundary violations against current itinerary items
      const itemsByDay = new Map<number, typeof items>();
      for (const item of items) {
        if (!itemsByDay.has(item.dayNumber)) itemsByDay.set(item.dayNumber, []);
        itemsByDay.get(item.dayNumber)!.push(item);
      }

      const boundaryViolations: Array<{
        dayNumber: number;
        violation: string;
        severity: 'warning' | 'critical';
      }> = [];

      for (const boundary of boundaries) {
        const dayItems = itemsByDay.get(boundary.dayNumber) || [];

        if (boundary.latestActivityEnd && dayItems.length > 0) {
          // Find the latest end time or start time among day's items
          for (const item of dayItems) {
            const itemTime = item.endTime || item.startTime;
            if (itemTime && itemTime > boundary.latestActivityEnd) {
              boundaryViolations.push({
                dayNumber: boundary.dayNumber,
                violation: `Item "${item.title}" ends at ${itemTime}, past the Day ${boundary.dayNumber} limit of ${boundary.latestActivityEnd}`,
                severity: 'warning',
              });
            }
          }
        }

        if (boundary.mustReturnToHotel && dayItems.length > 0) {
          const hasHotel = dayItems.some(i => {
            const t = (i.itemType || '').toLowerCase();
            return t === 'hotel' || t === 'accommodation' || t === 'lodging';
          });
          if (!hasHotel) {
            boundaryViolations.push({
              dayNumber: boundary.dayNumber,
              violation: `Day ${boundary.dayNumber} requires return to hotel but no accommodation item is scheduled`,
              severity: 'warning',
            });
          }
        }
      }

      // Fetch optimizer scores from the most recent variant for this trip
      let optimizerScores: Record<string, number> | null = null;
      const comparisons = await db
        .select({ id: itineraryComparisons.id })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.tripId, tripId))
        .orderBy(desc(itineraryComparisons.createdAt))
        .limit(1);

      if (comparisons.length > 0) {
        const variants = await db
          .select({ id: itineraryVariants.id })
          .from(itineraryVariants)
          .where(eq(itineraryVariants.comparisonId, comparisons[0].id))
          .orderBy(desc(itineraryVariants.createdAt))
          .limit(1);

        if (variants.length > 0) {
          const scoreMetrics = await db
            .select()
            .from(itineraryVariantMetrics)
            .where(
              and(
                eq(itineraryVariantMetrics.variantId, variants[0].id),
                inArray(itineraryVariantMetrics.metricKey, ['balance_score', 'wellness_score', 'pace_score', 'diversity_score'])
              )
            );
          if (scoreMetrics.length > 0) {
            optimizerScores = {};
            for (const m of scoreMetrics) {
              optimizerScores[m.metricKey] = parseFloat(m.value as string);
            }
          }
        }
      }

      res.json({
        anchors,
        dayBoundaries: boundaries,
        energyTracking: energyRecords,
        anchorConflicts,
        boundaryViolations,
        optimizerScores,
        tripExperienceType: trip.experienceType || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch workspace constraints", error: error.message });
    }
  });

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


router.post("/api/trips/:tripId/generate-presets", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

      const { templateSlug, eventDate, userExperienceId } = req.body;
      if (!templateSlug || !eventDate) {
        return res.status(400).json({ message: "templateSlug and eventDate are required" });
      }

      const { generatePresetsForTrip } = await import('../services/logistics-presets.service');
      const result = await generatePresetsForTrip(
        req.params.tripId,
        templateSlug,
        eventDate,
        userExperienceId
      );
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate presets", error: error.message });
    }
  });


router.post("/api/trips/:tripId/anchors/:anchorId/impacts", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

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
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

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
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const trip = await storage.getTrip(req.params.tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });
      if (trip.userId !== userId && user.role !== "admin" && user.role !== "expert") {
        return res.status(403).json({ message: "Not authorized to access this trip" });
      }

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
      const userId = (req as any).user?.id;
      const { sharedWithUserId, permissions = "view", transportPreferences } = req.body;

      const [variant] = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

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

      await db.insert(sharedItineraries).values({
        shareToken,
        variantId,
        sharedByUserId: userId,
        sharedWithUserId: sharedWithUserId || null,
        permissions,
        transportPreferences: transportPreferences || null,
      });

      if (sharedWithUserId) {
        await db.insert(notifications).values({
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
      const userId = (req as any).user?.claims?.sub || (req as any).user?.id;
      const tripId = req.params.id;

      const comparisons = await db
        .select({ id: itineraryComparisons.id, selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(and(eq(itineraryComparisons.tripId, tripId), eq(itineraryComparisons.userId, userId)));

      if (comparisons.length === 0) return res.json({});

      const variantIds = comparisons.map(c => c.id);
      const variantRows = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(inArray(itineraryVariants.comparisonId, variantIds));

      if (variantRows.length === 0) return res.json({});

      const vids = variantRows.map(v => v.id);
      const shares = await db
        .select()
        .from(sharedItineraries)
        .where(and(inArray(sharedItineraries.variantId, vids), eq(sharedItineraries.sharedByUserId, userId)))
        .orderBy(sharedItineraries.createdAt);

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

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Shared itinerary not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "This share link has expired" });
      }

      await db
        .update(sharedItineraries)
        .set({ viewCount: (shared.viewCount || 0) + 1, lastViewedAt: new Date() })
        .where(eq(sharedItineraries.id, shared.id));

      const [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select()
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, shared.variantId));

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

      const [exportCache] = await db
        .select()
        .from(mapsExportCache)
        .where(eq(mapsExportCache.variantId, shared.variantId));

      const [sharer] = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, shared.sharedByUserId));

      const dayNumbers = Array.from(new Set(items.map(i => i.dayNumber))).sort((a, b) => a - b);
      const days = dayNumbers.map(dayNum => {
        const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const dayLegs = legs.filter(l => l.dayNumber === dayNum).sort((a, b) => a.legOrder - b.legOrder);

        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;
        let dateStr = "";
        if (startDate) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + dayNum - 1);
          dateStr = d.toISOString().split("T")[0];
        }

        return {
          dayNumber: dayNum,
          date: dateStr,
          activities: dayItems.map(item => ({
            id: item.id,
            name: item.name,
            startTime: item.startTime,
            endTime: item.endTime,
            lat: item.latitude ? parseFloat(item.latitude as any) : null,
            lng: item.longitude ? parseFloat(item.longitude as any) : null,
            category: item.serviceType,
            cost: item.price ? parseFloat(item.price as any) : 0,
            description: item.description,
            location: item.location,
            duration: item.duration,
          })),
          transportLegs: dayLegs.map(leg => ({
            id: leg.id,
            legOrder: leg.legOrder,
            fromName: leg.fromName,
            toName: leg.toName,
            recommendedMode: leg.recommendedMode,
            userSelectedMode: leg.userSelectedMode,
            distanceDisplay: leg.distanceDisplay,
            distanceMeters: leg.distanceMeters,
            estimatedDurationMinutes: leg.estimatedDurationMinutes,
            estimatedCostUsd: leg.estimatedCostUsd,
            energyCost: leg.energyCost,
            alternativeModes: leg.alternativeModes,
            linkedProductUrl: leg.linkedProductUrl,
            fromLat: leg.fromLat,
            fromLng: leg.fromLng,
            toLat: leg.toLat,
            toLng: leg.toLng,
          })),
        };
      });

      const totalTransportCost = legs.reduce((sum, l) => sum + (l.estimatedCostUsd || 0), 0);
      const totalTransportMinutes = legs.reduce((sum, l) => sum + (l.estimatedDurationMinutes || 0), 0);

      res.json({
        variant: {
          id: variant.id,
          name: variant.name,
          description: variant.description,
          destination: comparison?.destination,
          dateRange: {
            start: comparison?.startDate,
            end: comparison?.endDate,
          },
          totalCost: variant.totalCost,
          optimizationScore: variant.optimizationScore,
          days,
          transportSummary: {
            totalLegs: legs.length,
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
              userId: sharer.id,
            }
          : { name: "A traveler", avatarUrl: null, userId: null },
        permissions: shared.permissions,
        expertStatus: shared.expertStatus,
        expertNotes: shared.expertNotes || null,
        expertDiff: shared.expertDiff || null,
        transportPreferences: shared.transportPreferences,
        shareToken: token,
        isOwner: !!(shared.sharedByUserId && (req as any).user?.id === shared.sharedByUserId),
      });
    } catch (err: any) {
      console.error("Get shared itinerary error:", err);
      res.status(500).json({ error: "Failed to load shared itinerary" });
    }
  });

  // GET /api/trips/:tripId/transport-legs
  // Returns transport legs for the most recent selected variant associated with a trip

router.get("/api/trips/:tripId/transport-legs", isAuthenticated, async (req, res) => {
    try {
      const { tripId } = req.params;
      const userId = (req.user as any).claims.sub;

      const tripOwned = await verifyTripOwnership(tripId, userId);
      if (!tripOwned) {
        return res.status(404).json({ error: "Trip not found" });
      }

      const [comparison] = await db
        .select({ selectedVariantId: itineraryComparisons.selectedVariantId })
        .from(itineraryComparisons)
        .where(
          and(
            eq(itineraryComparisons.tripId, tripId),
            isNotNull(itineraryComparisons.selectedVariantId)
          )
        )
        .orderBy(desc(itineraryComparisons.createdAt))
        .limit(1);

      if (!comparison?.selectedVariantId) {
        return res.json({ legs: [], variantId: null });
      }

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, comparison.selectedVariantId))
        .orderBy(asc(transportLegs.legOrder));

      res.json({ legs, variantId: comparison.selectedVariantId });
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
      const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;

      if (!selectedMode) return res.status(400).json({ error: "selectedMode is required" });
      if (!userId && !shareToken) return res.status(401).json({ error: "Authentication or share token required" });

      const [leg] = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.id, legId));

      if (!leg) return res.status(404).json({ error: "Transport leg not found" });

      // Ownership check: verify via the variant's comparison owner OR valid suggest share token
      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, leg.variantId));

      if (variant) {
        const [comparison] = await db
          .select({ userId: itineraryComparisons.userId })
          .from(itineraryComparisons)
          .where(eq(itineraryComparisons.id, variant.comparisonId));

        const isOwner = userId && comparison?.userId === userId;

        if (!isOwner) {
          if (shareToken) {
            const [shared] = await db
              .select({ permissions: sharedItineraries.permissions, variantId: sharedItineraries.variantId, expiresAt: sharedItineraries.expiresAt })
              .from(sharedItineraries)
              .where(and(eq(sharedItineraries.shareToken, shareToken), eq(sharedItineraries.variantId, leg.variantId)));

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

      await db
        .update(transportLegs)
        .set({
          userSelectedMode: selectedMode,
          estimatedDurationMinutes: newDuration,
          estimatedCostUsd: newCost ?? null,
          energyCost: newEnergy ?? 0,
          updatedAt: new Date(),
        })
        .where(eq(transportLegs.id, legId));

      // Regenerate maps URLs for all days (reflects new mode selection, replaces stale KML/GPX cache)
      let updatedMapsUrls: { googleMapsUrls: Record<number, string>; appleMapsUrls: Record<number, string>; appleMapsWebUrls: Record<number, string> } | null = null;
      try {
        updatedMapsUrls = await regenerateMapsUrlsFromLegs(leg.variantId, leg.dayNumber);
      } catch (mapsErr) {
        console.error("Maps URL regeneration error (non-critical):", mapsErr);
      }

      let downstreamMessage = "";
      if (timeDiff < 0) {
        downstreamMessage = `Switching to ${selectedMode} saves ${Math.abs(timeDiff)} minutes.`;
      } else if (timeDiff > 0) {
        downstreamMessage = `Switching to ${selectedMode} adds ${timeDiff} minutes.`;
      } else {
        downstreamMessage = `Transport mode updated to ${selectedMode}.`;
      }

      if (variant) {
        const [comp] = await db.select({ tripId: itineraryComparisons.tripId }).from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
        if (comp?.tripId) {
          const who = userId ? ((req.user as any)?.claims?.name || "User") : "Guest";
          logItineraryChange(comp.tripId, who, `Changed transport mode to ${selectedMode} (${leg.fromName} → ${leg.toName})`, "transport", shareToken ? "friend" : "owner", undefined, { legId, selectedMode, previousMode: leg.userSelectedMode || leg.recommendedMode });
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

  // GET /api/itinerary-share/:token/export/kml

router.get("/api/itinerary-share/:token/export/kml", async (req, res) => {
    try {
      const { token } = req.params;

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let kmlContent = cached?.kmlContent;

      if (!kmlContent) {
        const dayNumbers = Array.from(new Set(items.map(i => i.dayNumber))).sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        kmlContent = generateKml({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ kmlContent }).where(eq(mapsExportCache.variantId, shared.variantId));
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

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [variant] = await db.select().from(itineraryVariants).where(eq(itineraryVariants.id, shared.variantId));
      const [comparison] = await db.select().from(itineraryComparisons).where(eq(itineraryComparisons.id, variant.comparisonId));
      const items = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, shared.variantId));
      const legs = await db.select().from(transportLegs).where(eq(transportLegs.variantId, shared.variantId));

      const [cached] = await db.select().from(mapsExportCache).where(eq(mapsExportCache.variantId, shared.variantId));

      let gpxContent = cached?.gpxContent;

      if (!gpxContent) {
        const dayNumbers = Array.from(new Set(items.map(i => i.dayNumber))).sort((a, b) => a - b);
        const startDate = comparison?.startDate ? new Date(comparison.startDate) : null;

        const days = dayNumbers.map(dayNum => {
          const dayItems = items.filter(i => i.dayNumber === dayNum).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
          const dayLegs = legs.filter(l => l.dayNumber === dayNum);
          let dateStr = "";
          if (startDate) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + dayNum - 1);
            dateStr = d.toISOString().split("T")[0];
          }
          return {
            dayNumber: dayNum,
            date: dateStr,
            activities: dayItems.map(item => ({
              lat: item.latitude ? parseFloat(item.latitude as any) : 0,
              lng: item.longitude ? parseFloat(item.longitude as any) : 0,
              name: item.name,
              scheduledTime: item.startTime || "",
            })),
            transportLegs: dayLegs.map(l => ({
              legOrder: l.legOrder,
              fromName: l.fromName,
              toName: l.toName,
              recommendedMode: l.recommendedMode,
              estimatedDurationMinutes: l.estimatedDurationMinutes,
              estimatedCostUsd: l.estimatedCostUsd,
              distanceDisplay: l.distanceDisplay,
            })),
          };
        });

        gpxContent = generateGpx({
          tripName: variant.name,
          destination: comparison?.destination || "Trip",
          days,
        });

        await db.update(mapsExportCache).set({ gpxContent }).where(eq(mapsExportCache.variantId, shared.variantId));
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

      const [shared] = await db
        .select({ variantId: sharedItineraries.variantId })
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Not found" });

      const [leg] = await db
        .select()
        .from(transportLegs)
        .where(
          and(
            eq(transportLegs.variantId, shared.variantId),
            eq(transportLegs.dayNumber, parseInt(dayNumber)),
            eq(transportLegs.legOrder, parseInt(legOrder))
          )
        );

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
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const userLegs = await db
        .select({
          id: transportLegs.id,
          variantId: transportLegs.variantId,
          legOrder: transportLegs.legOrder,
          fromName: transportLegs.fromName,
          toName: transportLegs.toName,
          userSelectedMode: transportLegs.userSelectedMode,
          recommendedMode: transportLegs.recommendedMode,
        })
        .from(transportLegs)
        .innerJoin(itineraryVariants, eq(itineraryVariants.id, transportLegs.variantId))
        .innerJoin(itineraryComparisons, eq(itineraryComparisons.id, itineraryVariants.comparisonId))
        .where(eq(itineraryComparisons.userId, userId));

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
      const userId = (req as any).user?.id;

      // Verify ownership: the variant must belong to a comparison owned by the requesting user
      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const legs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, variantId));
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
      const userId = (req as any).user?.id;
      const { userPrefs } = req.body;

      const [variant] = await db
        .select({ id: itineraryVariants.id, comparisonId: itineraryVariants.comparisonId })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      if (!comparison || comparison.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const items = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, variantId));

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
      const userId = (req as any).user?.id;

      if (!userId) return res.status(401).json({ error: "Authentication required to submit suggestions" });
      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow suggestions" });
      }

      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId, name: itineraryVariants.name })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      // Build diff payload
      const expertDiff = {
        activityDiffs: activityDiffs || {},
        transportDiffs: transportDiffs || {},
        submittedAt: new Date().toISOString(),
      };

      // Save diff + notes + update status on shared_itineraries
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = 'review_sent', expert_notes = ${notes}, expert_diff = ${JSON.stringify(expertDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
      );

      // Send notification to the owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await db.insert(notifications).values({
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
      const userId = (req as any).user?.id;

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return res.status(404).json({ error: "Share not found" });

      // Only the original sharer (owner) can acknowledge
      if (!userId) {
        return res.status(401).json({ error: "Authentication required to acknowledge edits" });
      }
      if (shared.sharedByUserId !== userId) {
        return res.status(403).json({ error: "Only the itinerary owner can acknowledge edits" });
      }

      const newStatus = action === "accept" ? "acknowledged" : "rejected";
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
      );

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
      const userId = (req as any).user?.id;

      if (!notes?.trim()) return res.status(400).json({ error: "Notes are required" });
      if (!userId) return res.status(401).json({ error: "Authentication required to submit expert edits" });

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, shareToken));

      if (!shared) return res.status(404).json({ error: "Share not found" });
      if (shared.expiresAt && new Date(shared.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      if (!["suggest", "edit"].includes(shared.permissions)) {
        return res.status(403).json({ error: "This share link does not allow expert edits" });
      }

      const [variant] = await db
        .select({ comparisonId: itineraryVariants.comparisonId, name: itineraryVariants.name })
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      if (!variant) return res.status(404).json({ error: "Variant not found" });

      const [comparison] = await db
        .select({ userId: itineraryComparisons.userId, destination: itineraryComparisons.destination, tripId: itineraryComparisons.tripId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, variant.comparisonId));

      // Build full itinerary snapshot: original items with expert diffs applied
      const originalItems = await db
        .select()
        .from(itineraryVariantItems)
        .where(eq(itineraryVariantItems.variantId, shared.variantId));

      const originalLegs = await db
        .select()
        .from(transportLegs)
        .where(eq(transportLegs.variantId, shared.variantId));

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
      await db.insert(expertUpdatedItineraries).values({
        tripId: comparison?.tripId || null,
        shareToken,
        itineraryData: itinerarySnapshot,
        message: notes,
        status: "pending",
        createdById: userId,
      });

      // Update shared_itineraries with status + diff for traveler review
      await db.execute(
        sql`UPDATE shared_itineraries SET expert_status = 'review_sent', expert_notes = ${notes}, expert_diff = ${JSON.stringify(expertDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
      );

      // Notify the itinerary owner
      if (comparison?.userId) {
        const hasDiffs = Object.keys(expertDiff.activityDiffs).length > 0 || Object.keys(expertDiff.transportDiffs).length > 0;
        const diffSummary = hasDiffs
          ? ` (${Object.keys(expertDiff.activityDiffs).length} activity edits, ${Object.keys(expertDiff.transportDiffs).length} transport changes)`
          : "";
        await db.insert(notifications).values({
          userId: comparison.userId,
          type: "expert_suggestion",
          title: "Expert sent itinerary edits",
          message: `An expert reviewed your "${variant.name}" itinerary for ${comparison.destination || "your trip"} and sent suggestions${diffSummary}: ${notes.substring(0, 150)}${notes.length > 150 ? "..." : ""}`,
          relatedId: shared.variantId,
          relatedType: "itinerary_variant",
        });
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
      const userId = (req as any).user?.id;

      if (!action || !["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'accept' or 'reject'" });
      }

      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, shareToken));

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
          await db.execute(
            sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, expert_diff = ${JSON.stringify(updatedDiff)}::jsonb, updated_at = NOW() WHERE id = ${shared.id}`
          );
        } else {
          await db.execute(
            sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
          );
        }
      } else {
        await db.execute(
          sql`UPDATE shared_itineraries SET expert_status = ${newStatus}, updated_at = NOW() WHERE id = ${shared.id}`
        );
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
      const [shared] = await db
        .select()
        .from(sharedItineraries)
        .where(eq(sharedItineraries.shareToken, token));

      if (!shared) return next(); // Let SPA handle 404

      const [variant] = await db
        .select()
        .from(itineraryVariants)
        .where(eq(itineraryVariants.id, shared.variantId));

      const [comparison] = variant
        ? await db
            .select()
            .from(itineraryComparisons)
            .where(eq(itineraryComparisons.id, variant.comparisonId))
        : [null];

      const destination = comparison?.destination || "an amazing destination";
      const variantName = variant?.name || "Travel Itinerary";
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

      // Read index.html and inject tags into <head>
      let template: string;
      const clientTemplateDev = path.resolve(process.cwd(), "client", "index.html");
      const clientTemplateProd = path.resolve(__dirname, "public", "index.html");
      const templatePath = fs.existsSync(clientTemplateDev) ? clientTemplateDev : clientTemplateProd;

      if (!fs.existsSync(templatePath)) return next();

      template = fs.readFileSync(templatePath, "utf-8");
      template = template.replace("<head>", `<head>\n    ${ogTags}`);

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
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      const trip = await storage.getTrip(tripId);
      if (!trip) return;
      const itineraryData = await db.select().from(generatedItineraries).where(eq(generatedItineraries.tripId, tripId)).then((r: any[]) => r[0]);
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
      await db.insert(tripAnalyticsEnhanced).values({ tripId, userId, destinationCity, destinationCountry, tripStartDate: startDate, tripEndDate: endDate, lengthOfStay, season, partySize: travelers, partyComposition, hasChildren, tripPurpose: eventType, totalBudget: trip.budget, priceSegment, primaryActivity }).onConflictDoUpdate({ target: [tripAnalyticsEnhanced.tripId], set: { partyComposition, hasChildren, lengthOfStay, season, priceSegment, primaryActivity } });
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
      const userId = (req.user as any).claims.sub;
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
      const userId = (req.user as any).claims.sub;
      const { tripId, itemId } = req.params;
      const tripRole = await getTripRole(tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends can only suggest changes, not edit activities directly" : "Access denied" });
      }
      const existing = await db.select().from(itineraryItems)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ message: "Item not found in this trip" });
      // Strip immutable/ownership fields to prevent mass-assignment
      const { id: _id, tripId: _tripId, createdAt: _createdAt, updatedAt: _updatedAt, suggestedBy: _sb, ...safeBody } = req.body as any;
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
      const userId = (req.user as any).claims.sub;
      const { tripId, itemId } = req.params;
      const tripRole = await getTripRole(tripId, userId);
      if (!canMutateTrip(tripRole)) {
        return res.status(403).json({ message: tripRole === "friend" ? "Friends cannot remove activities" : "Access denied" });
      }
      const existing = await db.select({ id: itineraryItems.id }).from(itineraryItems)
        .where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId)))
        .limit(1);
      if (!existing.length) return res.status(404).json({ message: "Item not found in this trip" });
      await storage.deleteItineraryItem(itemId);
      res.json({ success: true });
    } catch (err) {
      console.error("[ItineraryItems] DELETE error:", err);
      res.status(500).json({ message: "Failed to delete itinerary item" });
    }
  });

  // === Expert Assignment Workspace Status ===

router.get("/api/trips/:tripId/commission", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const assignment = await db.select()
        .from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment.length) return res.status(403).json({ message: "Not assigned to this trip" });

      const allItems = await storage.getItineraryItems(tripId);
      // Confirmed items only: exclude terminal/cancelled states
      const CONFIRMED_STATUSES = ["planned", "confirmed", "in_progress", "booked"];
      const items = allItems.filter((item: any) =>
        CONFIRMED_STATUSES.includes(item.status) &&
        item.bookingStatus !== "cancelled"
      );

      // Expert-favorable split policy: EXPERT_SHARE_RATE (75%) floor. Do NOT lower
      // without a product decision — it inverts the split in experts' disfavor.
      // safeParseRate: returns fallback when value is missing, non-numeric, NaN, Infinity, or outside [0,1]
      const safeParseRate = (value: any, fallback: number): number => {
        const n = parseFloat(value);
        return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
      };
      // Derive expert's revenue share rate from their active services (fallback DEFAULT_RATE)
      const expertServices = await storage.getProviderServicesByStatus(userId, "active");
      const expertRate = expertServices.length > 0
        ? expertServices.reduce((sum: number, svc: any) => sum + safeParseRate(svc.revenueShareRate, EXPERT_SHARE_RATE), 0) / expertServices.length
        : EXPERT_SHARE_RATE;

      let totalGross = 0;
      let expertShare = 0;
      const itemBreakdown: Array<{ id: string; title: string; dayNumber: number; cost: number; revenueShareRate: number; expertEarning: number; platformFee: number }> = [];

      for (const item of items) {
        const cost = parseFloat(item.estimatedCost ?? "0");
        const rate = expertRate;
        const earning = cost * rate;
        const fee = cost - earning;
        totalGross += cost;
        expertShare += earning;
        itemBreakdown.push({
          id: item.id,
          title: item.title,
          dayNumber: item.dayNumber,
          cost,
          revenueShareRate: parseFloat(rate.toFixed(4)),
          expertEarning: earning,
          platformFee: fee,
        });
      }

      const platformFee = totalGross - expertShare;

      res.json({
        tripId,
        expertId: userId,
        totalGross: totalGross.toFixed(2),
        expertShare: expertShare.toFixed(2),
        platformFee: platformFee.toFixed(2),
        revenueShareRate: parseFloat(expertRate.toFixed(4)),
        itemCount: items.length,
        itemBreakdown: itemBreakdown.map(b => ({
          ...b,
          cost: b.cost.toFixed(2),
          expertEarning: b.expertEarning.toFixed(2),
          platformFee: b.platformFee.toFixed(2),
        })),
      });
    } catch (err) {
      console.error("[Commission] GET error:", err);
      res.status(500).json({ message: "Failed to calculate commission" });
    }
  });

  // Expert's assignment record for a specific trip (includes id + workspaceStatus)

router.get("/api/trips/:tripId/my-assignment", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const [assignment] = await db.select().from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment) return res.status(404).json({ message: "Not assigned to this trip" });
      res.json(assignment);
    } catch (err) {
      console.error("[Expert] getMyAssignment error:", err);
      res.status(500).json({ message: "Failed to get assignment" });
    }
  });

  // GET /api/trips/:tripId/expert-notes — Retrieve expert notes for a trip (assigned expert only)

router.get("/api/trips/:tripId/expert-notes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const [assignment] = await db.select().from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment) return res.status(403).json({ message: "Not assigned to this trip" });
      const [trip] = await db.select({ expertNotes: trips.expertNotes }).from(trips).where(eq(trips.id, tripId)).limit(1);
      res.json({ expertNotes: trip?.expertNotes ?? "" });
    } catch (err) {
      console.error("[Expert] getExpertNotes error:", err);
      res.status(500).json({ message: "Failed to get expert notes" });
    }
  });

  // PATCH /api/trips/:tripId/expert-notes — Auto-save expert notes (assigned expert only)

router.patch("/api/trips/:tripId/expert-notes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId } = req.params;
      const { expertNotes } = req.body;
      if (typeof expertNotes !== "string") return res.status(400).json({ message: "expertNotes must be a string" });
      const [assignment] = await db.select().from(tripExpertAdvisors)
        .where(and(eq(tripExpertAdvisors.tripId, tripId), eq(tripExpertAdvisors.localExpertId, userId)))
        .limit(1);
      if (!assignment) return res.status(403).json({ message: "Not assigned to this trip" });
      await storage.updateTrip(tripId, { expertNotes });
      res.json({ ok: true });
    } catch (err) {
      console.error("[Expert] saveExpertNotes error:", err);
      res.status(500).json({ message: "Failed to save expert notes" });
    }
  });

  // === EA Client Delegation Routes ===

  // GET /api/ea/clients — list all clients managed by this EA

export default router;
