import type { Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, setupFacebookAuth, setupEmailAuth } from "./replit_integrations/auth";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
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
import { db } from "./db";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant } from "./itinerary-optimizer";
import messagesRouter from "./routes/messages";
import { amadeusService } from "./services/amadeus.service";
import { viatorService } from "./services/viator.service";
import { cacheService } from "./services/cache.service";
import { cacheSchedulerService } from "./services/cache-scheduler.service";
import { claudeService } from "./services/claude.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "./services/routes.service";
import { aiOrchestrator } from "./services/ai-orchestrator";
import { grokService } from "./services/grok.service";
import { feverService } from "./services/fever.service";
import { feverCacheService } from "./services/fever-cache.service";
import { expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow, serviceCategories, visaRequirementsCache, expertServiceOfferings, cityNeighborhoods, travelPulseHiddenGems } from "@shared/schema";
import { coordinationService } from "./services/coordination.service";
import { vendorManagementService } from "./services/vendor-management.service";
import { budgetService } from "./services/budget.service";
import { itineraryIntelligenceService } from "./services/itinerary-intelligence.service";
import { emergencyService } from "./services/emergency.service";
import { experienceCatalogService } from "./services/experience-catalog.service";
import { opportunityEngineService } from "./services/opportunity-engine.service";
import { aiUsageService } from "./services/ai-usage.service";
import { getSequencingRulesForTemplate } from "./services/smart-sequencing.service";
import { complexityTier } from "./services/smart-sequencing.service";
import { getFee } from "./services/optimization-fee.service";
import { trackAnthropicResponse } from "./services/ai-cost-tracker";
import { experienceTypes as experienceTypesTable } from "@shared/schema";
import Stripe from "stripe";
import { sharedCache } from "./services/shared-cache.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "./utils/data-sanitizer";
import { transportLegs, sharedItineraries, mapsExportCache, expertUpdatedItineraries, affiliateProducts, contentRegistry } from "@shared/schema";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "./services/transport-leg-calculator";
import { buildGoogleNavUrl, buildAppleNavUrl } from "./services/maps-url-builder";
import { generateKml } from "./services/kml-generator";
import { generateGpx } from "./services/gpx-generator";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "./infrastructure";
import instagramRoutes from "./routes/instagram";
import identityRoutes from "./routes/identity.routes";
import webhooksRoutes from "./routes/webhooks.routes";
import bookingsRoutes from "./routes/bookings";
import bookingActionsRoutes from "./routes/booking-actions";
import myItineraryRoutes from "./routes/my-itinerary.routes";
import transportHubRoutes from "./routes/transport-hub.routes";
import plancardRoutes from "./routes/plancard.routes";
import optimizationRoutes from "./routes/optimization.routes";
import conciergeRoutes from "./routes/concierge.routes";
import tripsRoutes from "./routes/trips.routes";
import adminRoutes from "./routes/admin.routes";
import expertsRoutes from "./routes/experts.routes";
import contentRoutes from "./routes/content.routes";
import paymentsRoutes from "./routes/payments.routes";
import bookingsDomainRoutes from "./routes/bookings-domain.routes";
import crossSellRoutes from "./routes/cross-sell.routes";
import savedItemsRoutes from "./routes/saved-items.routes";
import { CREDIT_PACKAGES } from "@shared/credit-packages";
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

// ─── Commission constants & resolver (canonical source: server/services/commission.ts) ─
import {
  EXPERT_SHARE_RATE,
  PLATFORM_FEE_RATE,
  resolveCommissionRates,
  type CommissionRates,
} from "./services/commission";

// ─── Service-category → booking_fee_configs category mapping ─────────────────
// serviceCategories.slug values are detailed provider-category slugs (e.g.
// "transportation-logistics"). booking_fee_configs.category uses broader domain
// names ("transportation", "accommodation", …). This helper bridges the two.
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

// Helper function to verify trip ownership
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

// Helper function to map Fever categories to TravelPulse event types
function mapFeverCategoryToEventType(category: string): string {
  const categoryMap: Record<string, string> = {
    'experiences': 'cultural',
    'concerts': 'cultural',
    'theater': 'cultural',
    'exhibitions': 'cultural',
    'festivals': 'cultural',
    'nightlife': 'nightlife',
    'food-drink': 'culinary',
    'sports': 'sports',
    'wellness': 'wellness',
    'tours': 'cultural',
    'classes': 'cultural',
    'family': 'family',
  };
  return categoryMap[category] || 'other';
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Simple XSS sanitization - strips HTML tags and dangerous characters
function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    })
    .trim();
}

// Sanitize object string fields recursively
function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      result[key] = sanitizeInput(result[key]);
    }
  }
  return result;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  try {
    await setupAuth(app);
    registerAuthRoutes(app);
    setupFacebookAuth(app);
    setupEmailAuth(app);
  } catch (error) {
    console.warn("Auth setup failed (OK for development):", (error as Error).message);
    // Continue without auth - public routes will still work
  }

  // Chat / Conversations routes (GET/POST/PATCH/DELETE /api/conversations)
  registerChatRoutes(app);

  // ─── Seed canonical service templates (per-title idempotent) ───────────────
  // The six templates previously hardcoded in the frontend are promoted to DB
  // rows so there is a single canonical source. Each template is checked by
  // title individually so partial/legacy DB state is handled correctly.
  (async () => {
    try {
      const CANONICAL_TEMPLATES = [
        {
          title: "Quick Consultation",
          description: "15-minute video call to answer quick travel questions and provide immediate guidance",
          serviceType: "consultation",
          deliveryMethod: "video",
          deliveryTimeframe: "15 min",
          suggestedPrice: "29",
          requirements: JSON.stringify(["Travel question or topic to discuss"]),
          whatIncluded: JSON.stringify(["15-min video call", "Personalized advice", "Follow-up summary email"]),
          isActive: true,
          sortOrder: 1,
        },
        {
          title: "Cart Review & Optimization",
          description: "Expert review of your travel cart to find savings and better alternatives",
          serviceType: "review",
          deliveryMethod: "document",
          deliveryTimeframe: "24 hours",
          suggestedPrice: "49",
          requirements: JSON.stringify(["Cart link or selections", "Budget constraints"]),
          whatIncluded: JSON.stringify(["Written recommendations", "Alternative suggestions", "Savings estimate"]),
          isActive: true,
          sortOrder: 2,
        },
        {
          title: "Full Trip Planning",
          description: "Comprehensive trip planning from start to finish with personalized itinerary",
          serviceType: "planning",
          deliveryMethod: "hybrid",
          deliveryTimeframe: "3-5 days",
          suggestedPrice: "249",
          requirements: JSON.stringify(["Destination", "Dates", "Budget", "Interests", "Travel style"]),
          whatIncluded: JSON.stringify(["Full itinerary", "Booking links", "Restaurant reservations", "Daily schedule", "Packing list"]),
          isActive: true,
          sortOrder: 3,
        },
        {
          title: "Destination Deep Dive",
          description: "In-depth guide to a specific destination with local insights and hidden gems",
          serviceType: "custom",
          deliveryMethod: "document",
          deliveryTimeframe: "48 hours",
          suggestedPrice: "79",
          requirements: JSON.stringify(["Destination", "Travel dates", "Interests"]),
          whatIncluded: JSON.stringify(["PDF guide", "Local recommendations", "Maps", "Insider tips", "Safety advice"]),
          isActive: true,
          sortOrder: 4,
        },
        {
          title: "Honeymoon Planning Package",
          description: "Romantic trip planning with special touches and memorable experiences",
          serviceType: "planning",
          deliveryMethod: "hybrid",
          deliveryTimeframe: "5-7 days",
          suggestedPrice: "399",
          requirements: JSON.stringify(["Couple preferences", "Budget", "Dates", "Special requests"]),
          whatIncluded: JSON.stringify(["Custom itinerary", "Romantic experiences", "Special arrangements", "Booking assistance"]),
          isActive: true,
          sortOrder: 5,
        },
        {
          title: "Group Trip Coordinator",
          description: "Organize and coordinate travel for groups with complex logistics",
          serviceType: "planning",
          deliveryMethod: "video",
          deliveryTimeframe: "1 week",
          suggestedPrice: "349",
          requirements: JSON.stringify(["Group size", "Budget per person", "Destination preferences", "Special needs"]),
          whatIncluded: JSON.stringify(["Group logistics", "Shared itinerary", "Booking coordination", "Communication support"]),
          isActive: true,
          sortOrder: 6,
        },
      ];

      // Check each template by title individually (truly idempotent)
      const existing = await storage.getServiceTemplates();
      const existingTitles = new Set(existing.map((t: any) => t.title));
      let inserted = 0;
      for (const tpl of CANONICAL_TEMPLATES) {
        if (!existingTitles.has(tpl.title)) {
          await storage.createServiceTemplate(tpl as any);
          inserted++;
        }
      }
      if (inserted > 0) {
        console.log(`[Seed] Inserted ${inserted} canonical service template(s) into DB.`);
      }
    } catch (err) {
      console.warn("[Seed] Could not seed service templates:", err);
    }
  })();

  // ─── Seed / backfill booking_fee_configs (idempotent) ──────────────────────
  // Ensures the canonical default row (platform 25% / expert 75%) always exists,
  // and backfills any legacy 70/30 rows that were inserted before the policy change.
  (async () => {
    try {
      // 1. Upsert the 'default' row only if it doesn't already exist
      await db.execute(sql`
        INSERT INTO booking_fee_configs
          (id, category, platform_fee_percent, expert_share_percent, ai_keeps_100, is_active, created_at, updated_at)
        VALUES
          (gen_random_uuid(), 'default', 25, 75, true, true, NOW(), NOW())
        ON CONFLICT (category) DO NOTHING
      `);
      // 2. Backfill any rows that still carry the old 70/30 default
      await db.execute(sql`
        UPDATE booking_fee_configs
        SET expert_share_percent = '75.00',
            platform_fee_percent = '25.00'
        WHERE CAST(expert_share_percent AS NUMERIC) = 70
          AND CAST(platform_fee_percent  AS NUMERIC) = 30
      `);
    } catch (err) {
      console.warn("[Seed] Could not seed/backfill booking_fee_configs:", err);
    }
  })();

  // ─── Seed 6 canonical templates into expert_service_offerings (per-name idempotent) ──
  // expert_service_offerings is the canonical template catalog. The 6 service
  // creation templates are seeded here so the table is no longer disconnected
  // from the template UI and from-template flow.
  (async () => {
    try {
      // expert_service_categories was dropped by migration 013; insert with null categoryId.
      const categoryId: string | null = null;

      const CANONICAL_OFFERINGS = [
        { name: "Quick Consultation",         description: "15-minute video call to answer quick travel questions and provide immediate guidance",         price: "29.00",  sortOrder: 101 },
        { name: "Cart Review & Optimization", description: "Expert review of your travel cart to find savings and better alternatives",                   price: "49.00",  sortOrder: 102 },
        { name: "Full Trip Planning",         description: "Comprehensive trip planning from start to finish with personalized itinerary",                price: "249.00", sortOrder: 103 },
        { name: "Destination Deep Dive",      description: "In-depth guide to a specific destination with local insights and hidden gems",                price: "79.00",  sortOrder: 104 },
        { name: "Honeymoon Planning Package", description: "Romantic trip planning with special touches and memorable experiences",                      price: "399.00", sortOrder: 105 },
        { name: "Group Trip Coordinator",     description: "Organize and coordinate travel for groups with complex logistics",                           price: "349.00", sortOrder: 106 },
      ];
      const existingEso = await db.select({ name: expertServiceOfferings.name }).from(expertServiceOfferings);
      const existingEsoNames = new Set(existingEso.map((o: any) => o.name));
      let esoInserted = 0;
      for (const offering of CANONICAL_OFFERINGS) {
        if (!existingEsoNames.has(offering.name)) {
          await db.insert(expertServiceOfferings).values({
            categoryId,
            name: offering.name,
            description: offering.description,
            price: offering.price,
            isDefault: true,
            sortOrder: offering.sortOrder,
          });
          esoInserted++;
        }
      }
      if (esoInserted > 0) {
        console.log(`[Seed] Inserted ${esoInserted} canonical template(s) into expert_service_offerings.`);
      }
    } catch (err) {
      console.warn("[Seed] Could not seed expert_service_offerings:", err);
    }
  })();

  // Instagram API routes
  app.use("/api/instagram", instagramRoutes);

  // Bookings API routes - Stripe payments, availability, pricing
  app.use("/api/bookings", bookingsRoutes);

  // Booking Actions API routes - Expert Review, Save, Share
  app.use("/api", bookingActionsRoutes);
  app.use("/api/messages", messagesRouter);

  // My Itinerary routes - final itinerary view with smart sequencing
  app.use(myItineraryRoutes);

  // Transport Hub routes - booking interface for transport legs
  app.use(transportHubRoutes);

  // PlanCard routes - change tracking, comments, structured day data
  app.use(plancardRoutes);

  // Optimization routes - heuristic preview + payment-gated AI optimization
  app.use(optimizationRoutes);

  // Concierge routes - pay-per-use Concierge layer (intent log; Phase 5 adds router + quote)
  app.use(conciergeRoutes);

  // Identity verification routes (Stripe Identity + Persona KYB)
  app.use("/api/identity", identityRoutes);
  // Webhook handlers for Stripe Identity and Persona — mounted at /api/webhooks
  app.use("/api/webhooks", webhooksRoutes);

  // ── Extracted route modules (defrag P1-P6) ──────────────────────────────────
  // These routers were extracted from routes.ts and take priority via first-match.
  // The corresponding app.* handlers below remain as fallback during migration.
  app.use(tripsRoutes);
  app.use(adminRoutes);
  app.use(expertsRoutes);
  app.use(contentRoutes);
  app.use(paymentsRoutes);
  app.use(bookingsDomainRoutes);
  app.use(crossSellRoutes);
  app.use(savedItemsRoutes);
  // ────────────────────────────────────────────────────────────────────────────


}
