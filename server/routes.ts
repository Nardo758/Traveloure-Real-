import type { Express } from "express";
import type { Server } from "http";
import { adminRateLimit, aiRateLimit, leadRoutingRateLimit, heavyReadRateLimit } from "./middleware/rateLimiter";
import { getSlowQueryLog, clearSlowQueryLog } from "./utils/queryTimer";
import { redactTemplateContent } from "./utils/template-content-gate";
import { trackFunnelEvent } from "./utils/funnelTracker";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, setupFacebookAuth, setupEmailAuth } from "./replit_integrations/auth";
import { isExpert, isProvider } from "./middleware/role-rbac";
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
  adminNotifications,
  expertRequests,
  funnelEvents,
} from "@shared/schema";
import {
  TAB_CONTENT_TYPE_MAP,
  TAB_AFFILIATE_CATEGORIES,
  SURFACE_DEFAULT_CONTENT_TYPES,
  SURFACE_DEFAULT_AFFILIATE_CATEGORIES,
  SURFACE_SLUGS,
} from "@shared/content-surface-map";
import { db } from "./db";
import { eq, and, or, ilike, sql, desc, count, ne, inArray, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { scoreKnowledgeProof, KNOWLEDGE_PROOF_QUESTIONS } from "./services/expertise-scoring.service";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant, type TripPreferences } from "./itinerary-optimizer";
import messagesRouter from "./routes/messages";
import { availableAtFor } from "./config/earnings-hold.config";
import { aiOrchestrator } from "./services/ai-orchestrator";
import { grokService } from "./services/grok.service";
import { aiGeneratedItineraries, localExpertForms, expertAiTasks, aiInteractions, travelPulseTrending, travelPulseCities, travelPulseHappeningNow, serviceCategories, visaRequirementsCache, expertServiceOfferings, expertServiceCategories, cityNeighborhoods, travelPulseHiddenGems, providerNeighborhoodCoverage, expertTemplates } from "@shared/schema";
import { coordinationService } from "./services/coordination.service";
import { vendorManagementService } from "./services/vendor-management.service";
import { budgetService } from "./services/budget.service";
import { itineraryIntelligenceService } from "./services/itinerary-intelligence.service";
import { emergencyService } from "./services/emergency.service";
import { aiUsageService } from "./services/ai-usage.service";
import { complexityTier } from "./services/smart-sequencing.service";
import { getFee, resolveCoordinationFee } from "./services/optimization-fee.service";
import { buildEventTimeline, getEventVendorGaps } from "./services/event-coordination.service";
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
import upsellRoutes from "./routes/upsell.routes";
import tripsRoutes from "./routes/trips.routes";
import { dedupedRequest, callWithCircuitBreaker } from "./utils/requestDeduplication";
import adminRoutes from "./routes/admin.routes";
import expertsRoutes from "./routes/experts.routes";
import eaRoutes from "./routes/ea.routes";
import providerRoutes from "./routes/provider.routes";
import contentRoutes, { seedDatabase, registerDiscoveryRoutes } from "./routes/content.routes";
import paymentsRoutes from "./routes/payments.routes";
import crossSellRoutes from "./routes/cross-sell.routes";
import expertWorkspaceRoutes from "./routes/expert-workspace.routes";
import { createDMOCrawler } from "./content/scrapers/DMOCrawler";
import { ALL_DMO_SOURCES, getMarketGapSummary } from "./content/providers/DMOSourceRegistry";
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
  templatePurchases,
} from "@shared/schema";

// ─── Commission constants & resolver (canonical source: server/services/commission.ts) ─
import {
  EXPERT_SHARE_RATE,
  PLATFORM_FEE_RATE,
  resolveCommissionRates,
  type CommissionRates,
} from "./services/commission";
import { calculateCommission, BookingType } from "./utils/commissionCalculator";

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
  if (userId == null) return false;
  const trip = await storage.getTrip(tripId);
  return trip?.userId != null && trip.userId === userId;
}

// Guards /api/trips/:id GET and PATCH: requires either an authenticated session
// OR a shareToken query param (guest link access). Does NOT validate the token
// against the trip here — that per-trip check still happens in the handler
// (isGuestWithToken). This only blocks fully-anonymous requests with neither
// a session nor a token, closing the null===null bypass at the middleware layer
// as a defense-in-depth backstop to the handler-level null-guards.
function requireAuthOrShareToken(req: any, res: any, next: any) {
  const hasSession = typeof req.isAuthenticated === "function" && req.isAuthenticated();
  const hasToken = typeof req.query?.token === "string" && req.query.token.length > 0;
  if (!hasSession && !hasToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
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

  // ─── Admin API backstop: default-deny on /api/admin/* ──────────────────────
  // Root-cause fix for the leak class: admin protection was per-endpoint opt-in
  // with no backstop, so routes leaked when a guard was forgotten (POST
  // /api/admin/fee-config was world-writable — any authed user could rewrite the
  // platform's fee/commission splits). This middleware runs BEFORE every admin
  // route is registered below (inline routes here and the mounted adminRoutes
  // router alike), so it covers all /api/admin/* regardless of which router
  // ultimately handles the request. Role is read from a DB lookup on the
  // authenticated session — never a request-supplied value — and it fails
  // closed (401 unauth / 403 non-admin / 500 on lookup error). Existing
  // per-endpoint checks are left in place as harmless belt-and-suspenders.
  const adminApiGuard = async (req: any, res: any, next: any) => {
    try {
      if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const uid = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = uid
        ? await db.select().from(users).where(eq(users.id, uid)).then((r) => r[0])
        : undefined;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      return next();
    } catch (err) {
      console.error("adminApiGuard error:", err);
      return res.status(500).json({ message: "Authorization check failed" });
    }
  };
  app.use("/api/admin", adminApiGuard);

  // ─── Expert / Provider self-service RBAC backstop ──────────────────────────
  // Mirrors the admin guard pattern above. Protects all /api/expert/* and
  // /api/provider/* self-service endpoints so that a regular "user" role account
  // cannot reach expert or provider data even by hitting the API directly.
  //
  // Public/application paths are explicitly excluded:
  //   - /api/expert/application-status  — users checking their own application
  //   - /api/expert/offering-types      — public catalog (no auth needed)
  //   - /api/expert/:id/tip             — regular users tipping an expert
  //   - /api/provider/application-status — users checking their provider application
  //
  // All other /api/expert/* and /api/provider/* routes require the matching role.
  const EXPERT_SELF_SERVICE_PREFIXES = [
    "/api/expert/neighborhoods",
    "/api/expert/profile-notes",
    "/api/expert/selected-services",
    "/api/expert/specializations",
    "/api/expert/service-listings",
    "/api/expert/templates",
    "/api/expert/earnings",
    "/api/expert/template-sales",
    "/api/expert/tips",
    "/api/expert/referrals",
    "/api/expert/affiliate-earnings",
    "/api/expert/revenue-optimization",
    "/api/expert/services",
    "/api/expert/dashboard",
  ];
  const PROVIDER_SELF_SERVICE_PREFIXES = [
    "/api/provider/services",
    "/api/provider/verification-status",
    "/api/provider/dashboard",
  ];
  app.use((req: any, res: any, next: any) => {
    if (req.method === "OPTIONS") return next();
    const p: string = req.path;
    const matchesPrefix = (prefixes: string[]) =>
      prefixes.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
    if (matchesPrefix(EXPERT_SELF_SERVICE_PREFIXES)) return isExpert(req, res, next);
    if (matchesPrefix(PROVIDER_SELF_SERVICE_PREFIXES)) return isProvider(req, res, next);
    next();
  });

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
          // 'pdf' per the canonical deliveryMethodEnum (migration 109 CHECK); was 'document'
          deliveryMethod: "pdf",
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
          // 'pdf' per the canonical deliveryMethodEnum (migration 109 CHECK); was 'document'
          deliveryMethod: "pdf",
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
  // Migration 030 restored expert_service_categories with FK constraint.
  // We look up the "Itinerary Planning" category at runtime rather than
  // hardcoding a UUID, so the seed survives across environments.
  (async () => {
    try {
      // Look up a real category from expert_service_categories (migration 030)
      let categoryId: string | null = null;
      const categoryRows = await db.select({ id: expertServiceCategories.id })
        .from(expertServiceCategories)
        .where(eq(expertServiceCategories.name, 'Itinerary Planning'))
        .limit(1);
      if (categoryRows.length > 0) {
        categoryId = categoryRows[0].id;
      } else {
        // Fallback: create the category if it doesn't exist (idempotent)
        const [newCategory] = await db.insert(expertServiceCategories).values({
          name: 'Itinerary Planning',
          isDefault: true,
          sortOrder: 0,
        }).returning();
        categoryId = newCategory.id;
      }

      // Defensive: if we still don't have a category, skip seeding (FK will fail)
      if (!categoryId) {
        console.warn("[Seed] No expert_service_categories row available; skipping expert_service_offerings seed.");
        return;
      }

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

  // Phase 5.2: upsell engine surfaces (cart + discover-location + discover-date).
  // Calls into server/services/upsell-engine.service.ts which enforces the
  // relevance-dominance contract (revenue can never override fit across bands).
  app.use(upsellRoutes);

  // Phase 1.3+: fee-bands + booking-fee-config resolver endpoints.
  // Contains GET /api/booking-fee-config (itinerary fee display) and
  // GET /api/fee-bands/:bandKey (live band rates for pricing surfaces).
  app.use(paymentsRoutes);

  // Content routes — extracted in the defrag, unmounted by the fb77adb merge
  // resolution (same regression class 91ffcab fixed for paymentsRoutes).
  // Contains GET /api/offering-types/services + /experts (powers /earn),
  // /api/health, /api/status, /api/contact, and other content surfaces.
  app.use(contentRoutes);

  // DMO Expert Workspace routes — DMO content ingestion, curation, and publishing
  // All DMO content routes to experts first. Nothing reaches Discover without expert review.
  // See: research/traveloure_dmo_implementation_map.md
  app.use("/api/expert-workspace", expertWorkspaceRoutes);

  // Identity verification routes (Stripe Identity + Persona KYB)
  app.use("/api/identity", identityRoutes);
  // Webhook handlers for Stripe Identity and Persona — mounted at /api/webhooks
  app.use("/api/webhooks", webhooksRoutes);
  // Admin routes — role-guarded endpoints for platform administration
  app.use(adminRoutes);

  // Executive-Assistant (EA) console — /api/ea/* namespace, guarded by isEA (RBAC)
  app.use(eaRoutes);

  // Provider supply tools — /api/provider/settings (Kyoto-supply activation); provider-role gated
  app.use(providerRoutes);

  // Saved items / dashboard Wishlist — GET/POST/DELETE /api/saved-items (session-scoped, owner-gated).
  // Was imported-but-unmounted, so the dashboard Wishlist hit the Vite catch-all and never loaded;
  // mounting restores it (caught by the unmounted-router guard). Routes carry full /api paths.
  app.use(savedItemsRoutes);

  // Trips Routes
  // GET /api/trips — list trips (auth only, since guests access via shareToken)
  app.get(api.trips.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const status = req.query.status as string | undefined;
    const trips = await storage.getTrips(userId, status);
    res.json(trips);
  });

  // GET /api/trips/:id — get trip (auth: owner/expert/EA, or guest via shareToken)
  app.get(api.trips.get.path, requireAuthOrShareToken, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // Check access: owner, assigned expert, managing EA, or guest with shareToken
    const userId = (req.user as any)?.claims?.sub ?? null;
    const shareToken = req.query.token as string | undefined;
    const isOwner = trip.userId && trip.userId === userId;
    const isExpert = userId != null && (trip as any).expertId === userId;
    const isManagingEa = userId != null && (trip as any).managedByEaId === userId;
    const isGuestWithToken = shareToken && trip.shareToken === shareToken;

    if (!isOwner && !isExpert && !isManagingEa && !isGuestWithToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(trip);
  });

  // POST /api/trips — create a trip (guest or authenticated)
  // Guests get null userId; authenticated users get their userId.
  // Guests receive a shareToken to access the trip until sign-up.
  app.post(api.trips.create.path, async (req, res) => {
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

      // Fire-and-forget: T2 funnel event
      trackFunnelEvent({
        userId: userId || undefined,
        tripId: trip.id,
        eventType: "trip_created",
        funnelStage: "T2",
      }).catch(() => {});

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
  app.patch(api.trips.update.path, requireAuthOrShareToken, async (req, res) => {
    try {
      const input = api.trips.update.input.parse(req.body);
      // Sanitize string inputs to prevent XSS
      const sanitizedInput = sanitizeObject(input);
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const userId = (req.user as any)?.claims?.sub ?? null;
      const shareToken = req.query.token as string | undefined;
      const isOwner = trip.userId && trip.userId === userId;
      const isManagingEa = userId != null && (trip as any).managedByEaId === userId;
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

  app.delete(api.trips.delete.path, isAuthenticated, async (req, res) => {
    const trip = await storage.getTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    if (trip.userId !== userId) return res.status(401).json({ message: "Unauthorized" });

    await storage.deleteTrip(req.params.id);
    res.status(204).send();
  });

  // POST /api/trips/:id/claim — link a guest trip to an authenticated user
  // Called after a guest signs up, to claim their draft trips.
  app.post("/api/trips/:id/claim", isAuthenticated, async (req, res) => {
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

      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  app.post("/api/trips/generate-itinerary", aiRateLimit, isAuthenticated, async (req, res) => {
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
    // Fire-and-forget: T3 funnel event
    trackFunnelEvent({
      userId: (req.user as any)?.claims?.sub,
      tripId: tripId,
      eventType: "itinerary_generated",
      funnelStage: "T3",
    }).catch(() => {});
    res.status(201).json(itinerary);
  });

  app.post(api.trips.generateItinerary.path, isAuthenticated, async (req, res) => {
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

      // Dedup key covers all parameters that affect the AI output.
      // Generic (non-personalised) — preferences string is included so
      // trips with different prefs get independent AI calls.
      const dedupKey = `itinerary:claude:${destination}:${duration}:${travelers}:${preferences}`;

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

        // One AI call shared across all concurrent requests with the same key.
        // callWithCircuitBreaker prevents further calls when AI is failing repeatedly.
        itineraryData = await dedupedRequest(dedupKey, () =>
          callWithCircuitBreaker(async () => {
            const completion = await anthropic.messages.create({
              model: "claude-sonnet-4-5",
              max_tokens: 4000,
              messages: [{ role: "user", content: prompt }],
            });

            const text = (completion.content[0] as any).text;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return JSON.parse(jsonMatch ? jsonMatch[0] : text);
          })
        );
      } catch (aiErr: any) {
        // Circuit open → surface to outer handler as 503 (do NOT fall back).
        if (aiErr?.code === "AI_SERVICE_TEMPORARILY_UNAVAILABLE") throw aiErr;
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

      // Fire-and-forget: T3 funnel event (AI itinerary generated)
      trackFunnelEvent({
        userId: (req.user as any)?.claims?.sub ?? (req.user as any)?.id,
        tripId: trip.id,
        eventType: "itinerary_generated",
        funnelStage: "T3",
      }).catch(() => {});

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
    } catch (err: any) {
      if (err?.code === "AI_SERVICE_TEMPORARILY_UNAVAILABLE") {
        return res.status(503).json({
          message: "Our AI is experiencing high demand. Please try again in a moment.",
          retryAfterSeconds: err.retryAfterSeconds,
        });
      }
      console.error("Error generating itinerary:", err);
      res.status(500).json({ message: "Failed to generate itinerary" });
    }
  });

  // Request expert booking assistance
  const expertBookingRequestSchema = z.object({
    tripId: z.string().optional(),
    notes: z.string().optional().default(""),
    serviceId: z.string().optional(),
    bookingMetadata: z.record(z.any()).optional(),
  });

  app.post("/api/expert-booking-requests", isAuthenticated, async (req, res) => {
    try {
      const validation = expertBookingRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: validation.error.errors[0]?.message || "Invalid request body" 
        });
      }
      
      const { tripId, notes, serviceId, bookingMetadata } = validation.data;
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      // Only validate trip ownership when a tripId is provided
      if (tripId) {
        const trip = await storage.getTrip(tripId);
        if (trip && trip.userId !== userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }
      }

      let bookingId: string | undefined;

      // If a specific service is requested, create a service_bookings row.
      // All financial and attribution values are derived server-side from the service record.
      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          return res.status(404).json({ message: "Service not found" });
        }

        // Derive provider and pricing server-side — never trust client input.
        const providerId = service.userId;
        const totalAmount = Number(service.price ?? 0);

        // Determine booking type from the service owner's role so each surface
        // gets the correct commission split (expert 75/25, provider tier-based).
        let platformFeeAmt: string;
        let providerEarningsAmt: string;
        let bookingType: BookingType;

        if (providerId) {
          const [ownerRow] = await db
            .select({ role: users.role, createdAt: users.createdAt })
            .from(users)
            .where(eq(users.id, providerId))
            .limit(1);
          const ownerRole = ownerRow?.role ?? null;

          // isNewExpert: registered within the last 90 days
          const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
          const isNewExpert = ownerRow?.createdAt
            ? Date.now() - new Date(ownerRow.createdAt).getTime() < NINETY_DAYS_MS
            : false;

          const commission =
            ownerRole === "provider"
              ? calculateCommission(totalAmount, BookingType.PROVIDER_BOOKING, { providerTier: 1 })
              : calculateCommission(totalAmount, BookingType.EXPERT_SESSION, { isNewExpert });

          bookingType =
            ownerRole === "provider" ? BookingType.PROVIDER_BOOKING : BookingType.EXPERT_SESSION;

          // Per-service revenueShareRate is the final override when explicitly set
          // (consistent with checkout logic in payments.routes.ts).
          const hasPerServiceRate =
            service.revenueShareRate !== null && service.revenueShareRate !== undefined;

          if (hasPerServiceRate) {
            const shareRate = Number(service.revenueShareRate);
            platformFeeAmt = (totalAmount * (1 - shareRate)).toFixed(2);
            providerEarningsAmt = (totalAmount * shareRate).toFixed(2);
          } else {
            platformFeeAmt = commission.platformFee.toFixed(2);
            providerEarningsAmt = (
              ownerRole === "provider"
                ? (commission.providerPayout ?? 0)
                : (commission.expertPayout ?? 0)
            ).toFixed(2);
          }
        } else {
          // No owner on record — fall back to expert standard split
          const commission = calculateCommission(totalAmount, BookingType.EXPERT_SESSION);
          platformFeeAmt = commission.platformFee.toFixed(2);
          providerEarningsAmt = (commission.expertPayout ?? 0).toFixed(2);
          bookingType = BookingType.EXPERT_SESSION;
        }

        const booking = await storage.createServiceBooking({
          serviceId,
          travelerId: userId,
          providerId,
          tripId: tripId || null,
          bookingDetails: { notes },
          status: "pending",
          totalAmount: String(totalAmount),
          platformFee: platformFeeAmt,
          providerEarnings: providerEarningsAmt,
          ...(bookingMetadata ? { bookingMetadata } : {}),
        } as any);
        bookingId = booking.id;

        // Fire-and-forget: T6 funnel event
        trackFunnelEvent({
          userId,
          tripId: tripId || undefined,
          bookingId,
          eventType: "revenue",
          funnelStage: "T6",
          eventData: { amount: totalAmount },
        }).catch(() => {});

        // Notify the expert/provider that a new booking request has arrived
        try {
          const traveler = await storage.getUser(userId);
          const travelerName = traveler
            ? [traveler.firstName, traveler.lastName].filter(Boolean).join(" ") || traveler.email || "A traveler"
            : "A traveler";
          await storage.createNotification({
            userId: providerId,
            type: "booking_request",
            title: "New Booking Request",
            message: `${travelerName} requested "${service.serviceName}" ($${totalAmount.toFixed(2)})`,
            relatedId: booking.id,
            relatedType: "booking",
            data: {
              bookingId: booking.id,
              serviceName: service.serviceName,
              travelerName,
              amount: totalAmount.toFixed(2),
            },
          });

          // Send email alert to the provider
          const provider = await storage.getUser(providerId);
          if (provider?.email) {
            const { sendBookingAlertEmail } = await import("./services/email.service");
            const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ") || provider.email;
            await sendBookingAlertEmail({
              providerEmail: provider.email,
              providerName,
              bookingId: booking.id,
              serviceName: service.serviceName,
              travelerName,
              amount: totalAmount.toFixed(2),
            });
          }
        } catch (notifErr) {
          // Non-fatal: log but don't fail the booking creation
          console.error("Failed to create booking notification:", notifErr);
        }

        // Expose commission breakdown on the booking confirmation response.
        // Stored as local vars so the res.json() below can include them.
        (req as any).__bookingCommission = {
          subtotal: totalAmount,
          platformFee: Number(platformFeeAmt),
          ...(bookingType === BookingType.EXPERT_SESSION
            ? { expertPayout: Number(providerEarningsAmt) }
            : { providerPayout: Number(providerEarningsAmt) }),
          bookingType,
          commissionRate:
            totalAmount > 0 ? Number(platformFeeAmt) / totalAmount : 0,
        };
      } else if (tripId) {
        // No specific service — route inquiry to relevant experts for the trip destination
        try {
          const trip = await storage.getTrip(tripId);
          if (trip) {
            const destination = trip.destination?.toLowerCase() || '';
            const traveler = await storage.getUser(userId);
            const travelerName = traveler
              ? [traveler.firstName, traveler.lastName].filter(Boolean).join(" ") || traveler.email || "A traveler"
              : "A traveler";

            // Find experts specializing in this destination
            const expertsResult = await db.execute(sql`
              SELECT DISTINCT u.id, u.first_name, u.last_name
              FROM users u
              JOIN local_expert_forms lef ON u.id = lef.user_id
              WHERE u.role = 'expert' AND u.status = 'verified'
                AND (LOWER(lef.destinations) LIKE LOWER(${'%' + destination + '%'})
                  OR LOWER(u.display_name) LIKE LOWER(${'%' + destination + '%'}))
              LIMIT 15
            `);

            for (const expert of (expertsResult.rows || []) as any[]) {
              try {
                await storage.createNotification({
                  userId: expert.id,
                  type: 'expert_inquiry',
                  title: 'New Expert Inquiry',
                  message: `${travelerName} is looking for expert help planning a trip to ${trip.destination}.`,
                  relatedId: tripId,
                  relatedType: 'trip',
                  data: {
                    tripId,
                    destination: trip.destination,
                    notes,
                    travelerName,
                  },
                });
              } catch (err) {
                console.error(`Failed to notify expert ${expert.id} of inquiry:`, err);
              }
            }
          }
        } catch (routeErr) {
          // Non-fatal: log but don't fail the inquiry submission
          console.error("Failed to route inquiry to experts:", routeErr);
        }
      }

      res.status(201).json({
        success: true,
        message: bookingId
          ? "Booking request submitted successfully"
          : "Inquiry submitted — no service selected so no booking record was created",
        tripId,
        bookingId: bookingId || null,
        bookingCreated: !!bookingId,
        requestedAt: new Date().toISOString(),
        // Commission breakdown — present only when a booking record was created
        ...((req as any).__bookingCommission ?? {}),
      });
    } catch (err) {
      console.error("Error creating expert booking request:", err);
      res.status(500).json({ message: "Failed to submit expert booking request" });
    }
  });

  // Tourist Places Routes
  app.get(api.touristPlaces.search.path, async (req, res) => {
    const query = req.query.query as string;
    if (!query) return res.json([]);
    const results = await storage.searchTouristPlaces(query);
    res.json(results);
  });

  // Chats Routes
  // SECURITY: User data is sanitized and contact info in messages is redacted
  app.get(api.chats.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  app.post(api.chats.create.path, isAuthenticated, async (req, res) => {
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
  app.get(api.helpGuideTrips.list.path, async (req, res) => {
    const trips = await storage.getHelpGuideTrips();
    res.json(trips);
  });

  app.get(api.helpGuideTrips.get.path, async (req, res) => {
    const trip = await storage.getHelpGuideTrip(req.params.id);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    res.json(trip);
  });

  // Vendors Routes
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

  // === Expert Application Routes ===
  
  // Get current user's expert application
  app.get("/api/expert-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const form = await storage.getLocalExpertForm(userId);
    res.json(form || null);
  });

  // Submit expert application
  app.post("/api/expert-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      const existing = await storage.getLocalExpertForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }

      const input = insertLocalExpertFormSchema.parse(req.body);
      const form = await storage.createLocalExpertForm({ ...input, userId });
      // Kyoto Knowledge-Bar (advisory): score the knowledge-proof answers in the background and store
      // the result for the admin queue. Fire-and-forget — best-effort, never blocks the submission.
      void scoreKnowledgeProof(
        (form.knowledgeProofAnswers as string[]) ?? [],
        KNOWLEDGE_PROOF_QUESTIONS,
        form.localityProof ?? null,
        form.city ?? "",
      )
        .then((s) => storage.updateLocalExpertFormKnowledgeScore(form.id, s))
        .catch((e: any) => console.error("[expertise-scoring] persist failed:", e?.message));
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating expert application:", err);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Alias: /api/expert-forms -> /api/expert-application (for API compatibility)
  app.post("/api/expert-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await storage.getLocalExpertForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }
      const input = insertLocalExpertFormSchema.parse(req.body);
      const form = await storage.createLocalExpertForm({ ...input, userId });
      // Kyoto Knowledge-Bar (advisory): score the knowledge-proof answers in the background and store
      // the result for the admin queue. Fire-and-forget — best-effort, never blocks the submission.
      void scoreKnowledgeProof(
        (form.knowledgeProofAnswers as string[]) ?? [],
        KNOWLEDGE_PROOF_QUESTIONS,
        form.localityProof ?? null,
        form.city ?? "",
      )
        .then((s) => storage.updateLocalExpertFormKnowledgeScore(form.id, s))
        .catch((e: any) => console.error("[expertise-scoring] persist failed:", e?.message));
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Admin: Payout-gap report — approved experts who haven't completed Stripe Connect
  app.get("/api/admin/expert-payout-gap", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, (req.user as any)?.claims?.sub ?? (req.user as any)?.id)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const rows = await db.execute(sql`
        SELECT
          lef.user_id               AS expert_id,
          u.first_name              AS first_name,
          u.last_name               AS last_name,
          u.email                   AS email,
          lef.city                  AS destination,
          lef.created_at            AS approval_date,
          lef.stripe_connect_status AS stripe_connect_status
        FROM local_expert_forms lef
        JOIN users u ON u.id = lef.user_id
        WHERE lef.status = 'approved'
          AND (lef.stripe_connect_status IS NULL OR lef.stripe_connect_status != 'complete')
        ORDER BY lef.created_at DESC
      `);
      const experts = (rows.rows || []).map((r: any) => ({
        expertId: r.expert_id,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.expert_id,
        email: r.email,
        destination: r.destination,
        approvalDate: r.approval_date,
        stripeConnectStatus: r.stripe_connect_status ?? "not_started",
      }));
      res.json({ count: experts.length, experts });
    } catch (err) {
      console.error("[payout-gap] error:", err);
      res.status(500).json({ message: "Failed to fetch payout gap report" });
    }
  });

  // === Provider Application Routes ===
  
  // Get current user's provider application
  app.get("/api/provider-application", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const form = await storage.getServiceProviderForm(userId);
    res.json(form || null);
  });

  // Submit provider application
  app.post("/api/provider-application", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      const existing = await storage.getServiceProviderForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }

      const input = insertServiceProviderFormSchema.parse(req.body);
      const form = await storage.createServiceProviderForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating provider application:", err);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Alias: /api/provider-forms -> /api/provider-application (for API compatibility)
  app.post("/api/provider-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await storage.getServiceProviderForm(userId);
      if (existing) {
        return res.status(400).json({ message: "You already have an application submitted" });
      }
      const input = insertServiceProviderFormSchema.parse(req.body);
      const form = await storage.createServiceProviderForm({ ...input, userId });
      res.status(201).json(form);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // GET /api/expert/application-status — user-facing live step status for expert applicants
  app.get("/api/expert/application-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const [form] = await db.select().from(localExpertForms).where(eq(localExpertForms.userId, userId)).limit(1);
      const identityStatus = (form as any)?.identityVerificationStatus ?? "pending";

      const steps = [
        {
          id: 1,
          title: "Basic Information",
          description: "Personal details and contact information",
          status: form ? "completed" : "pending",
          completedAt: form ? new Date((form as any).createdAt).toLocaleDateString() : undefined,
        },
        {
          id: 2,
          title: "Expertise & Destinations",
          description: "Your specialties and destination knowledge",
          status: form && ((form.destinations as any[])?.length > 0 || (form.specialties as any[])?.length > 0) ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 3,
          title: "Experience & Portfolio",
          description: "Professional background and work samples",
          status: form && (form.bio || (form as any).portfolio) ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 4,
          title: "Identity Verification",
          description: "Government ID and liveness check via Stripe Identity",
          status: identityStatus === "verified" ? "completed" : identityStatus === "processing" ? "in_progress" : identityStatus === "failed" ? "failed" : form ? "in_progress" : "pending",
          note: identityStatus === "pending" && form ? "Click 'Verify My Identity' above to begin" : undefined,
        },
        {
          id: 5,
          title: "Admin Review",
          description: "Our team reviews your application — typically 2-3 business days",
          status: form?.status === "approved" || form?.status === "rejected" ? "completed" : identityStatus === "verified" && form ? "in_progress" : "pending",
        },
        {
          id: 6,
          title: "Account Activation",
          description: "Your expert account is activated and ready",
          status: form?.status === "approved" ? "completed" : "pending",
        },
      ];

      res.json({
        steps,
        overallStatus: form?.status ?? "pending",
        identityVerificationStatus: identityStatus,
        identityVerifiedAt: (form as any)?.identityVerifiedAt,
        form: form ? { id: form.id, status: form.status, firstName: (form as any).firstName, createdAt: (form as any).createdAt } : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/provider/application-status — user-facing live step status for provider applicants
  app.get("/api/provider/application-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const [form] = await db.select().from(serviceProviderForms).where(eq(serviceProviderForms.userId, userId)).limit(1);
      const identityStatus = (form as any)?.identityVerificationStatus ?? "pending";
      const bizStatus = (form as any)?.businessVerificationStatus ?? "pending";

      const steps = [
        {
          id: 1,
          title: "Business Information",
          description: "Business name, type, and contact details",
          status: form ? "completed" : "pending",
          completedAt: form ? new Date((form as any).createdAt).toLocaleDateString() : undefined,
        },
        {
          id: 2,
          title: "Service Categories",
          description: "Types of services you offer",
          status: form && form.serviceType ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 3,
          title: "Location & Documentation",
          description: "Location, compliance, and supporting documents",
          status: form && (form.country || form.province) ? "completed" : form ? "in_progress" : "pending",
        },
        {
          id: 4,
          title: "Owner Identity Verification",
          description: "Government ID verification for the business owner",
          status: identityStatus === "verified" ? "completed" : identityStatus === "processing" ? "in_progress" : identityStatus === "failed" ? "failed" : form ? "in_progress" : "pending",
          note: identityStatus === "pending" && form ? "Click 'Verify Owner ID' above to begin" : undefined,
        },
        {
          id: 5,
          title: "Business Verification",
          description: "Registry check against national business databases",
          status: bizStatus === "verified" ? "completed" : bizStatus === "submitted" ? "in_progress" : bizStatus === "failed" ? "failed" : form ? "in_progress" : "pending",
          note: bizStatus === "pending" && form ? "Enter your business details above to begin" : undefined,
        },
        {
          id: 6,
          title: "Admin Review",
          description: "Our team reviews your application — typically 3-5 business days",
          status: form?.status === "approved" || form?.status === "rejected" ? "completed" : (bizStatus === "verified" && identityStatus === "verified") ? "in_progress" : "pending",
        },
        {
          id: 7,
          title: "Account Activation",
          description: "Your provider account is activated and ready",
          status: form?.status === "approved" ? "completed" : "pending",
        },
      ];

      res.json({
        steps,
        overallStatus: form?.status ?? "pending",
        identityVerificationStatus: identityStatus,
        identityVerifiedAt: (form as any)?.identityVerifiedAt,
        businessVerificationStatus: bizStatus,
        businessCountry: (form as any)?.businessCountry,
        form: form ? {
          id: form.id,
          status: form.status,
          businessName: form.businessName,
          country: form.country,
          createdAt: (form as any).createdAt,
        } : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // === Provider Services Routes ===
  
  // Get all active provider services (public - for experience browsing)
  app.get("/api/provider-services", async (req, res) => {
    // F2 public read-gate: this route is unauthenticated (public). getAllProviderServices is shared with
    // admin (which must see all), so gate here at the call site — return approved listings only.
    const services = await storage.getAllProviderServices();
    res.json(services.filter((s) => s.approvalStatus === "approved"));
  });
  
  // Get provider's services
  app.get("/api/provider/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { destination, category, activeOnly } = req.query as Record<string, string>;
    const services = await storage.getProviderServices(userId, {
      destination: destination || undefined,
      category: category || undefined,
      activeOnly: activeOnly === "true",
    });
    res.json(services);
  });

  // Get a single provider service by ID (ownership required)
  app.get("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      // Attach current coverage neighborhood slugs so the form can pre-populate the multi-select
      let neighborhoods: string[] = [];
      if (service.categoryId) {
        const [cat] = await db.select({ categoryKey: serviceCategories.categoryKey })
          .from(serviceCategories).where(eq(serviceCategories.id, service.categoryId));
        const catKey = cat?.categoryKey;
        if (catKey) {
          const rows = await db
            .select({ slug: cityNeighborhoods.slug })
            .from(providerNeighborhoodCoverage)
            .innerJoin(cityNeighborhoods, eq(providerNeighborhoodCoverage.neighborhoodId, cityNeighborhoods.id))
            .where(and(
              eq(providerNeighborhoodCoverage.providerId, userId),
              eq(providerNeighborhoodCoverage.categoryKey, catKey)
            ))
            .orderBy(providerNeighborhoodCoverage.sortOrder);
          neighborhoods = rows.map(r => r.slug);
        }
      }
      res.json({ ...service, neighborhoods });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch service" });
    }
  });

  // Create a new service
  app.post("/api/provider/services", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      // Extract neighborhoods before schema parse (not a DB column)
      const { neighborhoods: neighborhoodSlugs, ...bodyWithoutNeighborhoods } = req.body;
      const input = insertProviderServiceSchema.parse(bodyWithoutNeighborhoods);

      // Verification publish-gate: block status:"active" on gated categories
      if (input.status === "active") {
        const categoryId = (input as any).categoryId as string | undefined;
        if (categoryId) {
          const [cat] = await db.select({
            requiresBackgroundCheck: serviceCategories.requiresBackgroundCheck,
            insuranceBand: serviceCategories.insuranceBand,
          }).from(serviceCategories).where(eq(serviceCategories.id, categoryId));
          const needsGate = cat?.requiresBackgroundCheck || ((cat?.insuranceBand ?? 0) >= 2);
          if (needsGate) {
            const [userRow] = await db.select({
              providerVerificationStatus: users.providerVerificationStatus,
              backgroundCheckConfirmed: users.backgroundCheckConfirmed,
            }).from(users).where(eq(users.id, userId));
            const verified = userRow?.providerVerificationStatus === "verified";
            const bgOk = !cat?.requiresBackgroundCheck || userRow?.backgroundCheckConfirmed;
            if (!verified || !bgOk) {
              return res.status(422).json({
                message: "This category requires background verification before publishing. Save as draft and complete your provider verification first.",
                code: "VERIFICATION_REQUIRED",
              });
            }
          }
        }
      }

      // Compute price scalar from lowest tier when package_tiers pricing is used
      const pricingTiersInput = (input as any).pricingTiers;
      if ((input as any).priceType === "package_tiers" && Array.isArray(pricingTiersInput) && pricingTiersInput.length > 0) {
        const prices = pricingTiersInput.map((t: any) => Number(t.price)).filter((p: number) => p > 0);
        if (prices.length > 0) {
          (input as any).price = String(Math.min(...prices));
        }
      }

      const service = await storage.createProviderService({ ...input, userId });

      // Write (or clear) neighborhood coverage rows whenever the neighborhoods
      // field is present in the payload — including empty arrays, which must
      // delete any existing stale rows for this provider+category.
      if (Array.isArray(neighborhoodSlugs) && service.categoryId) {
        const [cat] = await db.select({ categoryKey: serviceCategories.categoryKey })
          .from(serviceCategories).where(eq(serviceCategories.id, service.categoryId));
        if (cat?.categoryKey) {
          await storage.upsertProviderNeighborhoodCoverage(userId, cat.categoryKey, neighborhoodSlugs);
        }
      }

      res.status(201).json(service);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating provider service:", err);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  // Verification status for the current authenticated provider/expert
  app.get("/api/provider/verification-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const [userRow] = await db.select({
        providerVerificationStatus: users.providerVerificationStatus,
        backgroundCheckConfirmed: users.backgroundCheckConfirmed,
      }).from(users).where(eq(users.id, userId));
      res.json({
        providerVerificationStatus: userRow?.providerVerificationStatus ?? "pending",
        backgroundCheckConfirmed: userRow?.backgroundCheckConfirmed ?? false,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch verification status" });
    }
  });

  // Update a service
  app.patch("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const services = await storage.getProviderServices(userId);
      const ownedService = services.find(s => s.id === req.params.id);
      if (!ownedService) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      // Extract neighborhoods before schema parse (not a DB column)
      const { neighborhoods: neighborhoodSlugs, ...bodyWithoutNeighborhoods } = req.body;
      const input = insertProviderServiceSchema.partial().parse(bodyWithoutNeighborhoods);

      // Verification publish-gate: block activating on gated categories
      if (input.status === "active") {
        const categoryId = ((input as any).categoryId ?? ownedService.categoryId) as string | undefined;
        if (categoryId) {
          const [cat] = await db.select({
            requiresBackgroundCheck: serviceCategories.requiresBackgroundCheck,
            insuranceBand: serviceCategories.insuranceBand,
          }).from(serviceCategories).where(eq(serviceCategories.id, categoryId));
          const needsGate = cat?.requiresBackgroundCheck || ((cat?.insuranceBand ?? 0) >= 2);
          if (needsGate) {
            const [userRow] = await db.select({
              providerVerificationStatus: users.providerVerificationStatus,
              backgroundCheckConfirmed: users.backgroundCheckConfirmed,
            }).from(users).where(eq(users.id, userId));
            const verified = userRow?.providerVerificationStatus === "verified";
            const bgOk = !cat?.requiresBackgroundCheck || userRow?.backgroundCheckConfirmed;
            if (!verified || !bgOk) {
              return res.status(422).json({
                message: "This category requires background verification before publishing. Save as draft and complete your provider verification first.",
                code: "VERIFICATION_REQUIRED",
              });
            }
          }
        }
      }

      // Compute price scalar from lowest tier when package_tiers pricing is used
      const pricingTiersUpd = (input as any).pricingTiers;
      if ((input as any).priceType === "package_tiers" && Array.isArray(pricingTiersUpd) && pricingTiersUpd.length > 0) {
        const prices = pricingTiersUpd.map((t: any) => Number(t.price)).filter((p: number) => p > 0);
        if (prices.length > 0) {
          (input as any).price = String(Math.min(...prices));
        }
      }

      // Remove userId from input to prevent ownership transfer
      const { userId: _, ...safeInput } = input as any;
      // A neighborhoods-only PATCH leaves no listing columns to update —
      // drizzle's .set({}) throws, which 500'd the pure "edit coverage areas"
      // save before the coverage writer below could run. Skip the row update
      // and let the coverage writer operate against the existing row.
      const updated = Object.keys(safeInput).length > 0
        ? await storage.updateProviderService(req.params.id, safeInput)
        : ownedService;

      // Write (or clear) neighborhood coverage rows whenever the neighborhoods
      // field is present in the payload — including empty arrays, which must
      // delete any existing stale rows for this provider+category.
      // Additionally, if the category changed, purge coverage for the OLD
      // category key so stale rows can't produce wrong engine matches.
      if (updated) {
        const prevCategoryId = ownedService.categoryId as string | undefined;
        const newCategoryId = (updated.categoryId ?? prevCategoryId) as string | undefined;
        const categoryChanged = prevCategoryId && newCategoryId && prevCategoryId !== newCategoryId;

        if (categoryChanged) {
          // Clear all coverage rows for the old category key first
          const [oldCat] = await db.select({ categoryKey: serviceCategories.categoryKey })
            .from(serviceCategories).where(eq(serviceCategories.id, prevCategoryId!));
          if (oldCat?.categoryKey) {
            await storage.upsertProviderNeighborhoodCoverage(userId, oldCat.categoryKey, []);
          }
        }

        if (Array.isArray(neighborhoodSlugs) && newCategoryId) {
          const [newCat] = await db.select({ categoryKey: serviceCategories.categoryKey })
            .from(serviceCategories).where(eq(serviceCategories.id, newCategoryId));
          if (newCat?.categoryKey) {
            await storage.upsertProviderNeighborhoodCoverage(userId, newCat.categoryKey, neighborhoodSlugs);
          }
        }
      }

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  // Delete a service
  app.delete("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const services = await storage.getProviderServices(userId);
    const ownedService = services.find(s => s.id === req.params.id);
    if (!ownedService) {
      return res.status(404).json({ message: "Service not found or not owned by you" });
    }
    await storage.deleteProviderService(req.params.id);
    res.status(204).send();
  });

  // City lookup endpoint for planning modals
  app.get("/api/cities/lookup", async (req, res) => {
    try {
      const q = (req.query.q as string)?.trim();
      if (!q) return res.json({ cityId: null });
      const rows = await db
        .select({
          id: travelPulseCities.id,
          cityName: travelPulseCities.cityName,
          country: travelPulseCities.country,
          countryCode: travelPulseCities.countryCode,
        })
        .from(travelPulseCities)
        .where(ilike(travelPulseCities.cityName, `%${q}%`))
        .limit(1);
      if (rows.length === 0) return res.json({ cityId: null });
      return res.json({
        cityId: rows[0].id,
        cityName: rows[0].cityName,
        country: rows[0].country,
        countryCode: rows[0].countryCode,
      });
    } catch (err: any) {
      console.error("Error in city lookup:", err);
      res.status(500).json({ message: "Lookup failed", error: err.message });
    }
  });

  // Neighborhoods for a specific city (filtered, for planning modal dropdown)
  app.get("/api/cities/neighborhoods", async (req, res) => {
    try {
      const city = (req.query.city as string)?.trim();
      if (!city) return res.json([]);
      const rows = await db
        .select({
          id: cityNeighborhoods.id,
          name: cityNeighborhoods.name,
          slug: cityNeighborhoods.slug,
          description: cityNeighborhoods.description,
        })
        .from(cityNeighborhoods)
        .where(ilike(cityNeighborhoods.city, city))
        .orderBy(cityNeighborhoods.name);
      return res.json(rows);
    } catch (err: any) {
      console.error("Error fetching city neighborhoods:", err);
      res.status(500).json({ message: "Failed to fetch neighborhoods" });
    }
  });

  // Hidden gems for a city (for planning modal chips)
  app.get("/api/cities/gems", async (req, res) => {
    try {
      const city = (req.query.city as string)?.trim();
      if (!city) return res.json([]);
      const limit = parseInt(req.query.limit as string) || 5;
      const rows = await db
        .select({
          id: travelPulseHiddenGems.id,
          placeName: travelPulseHiddenGems.placeName,
          placeType: travelPulseHiddenGems.placeType,
          description: travelPulseHiddenGems.description,
          gemScore: travelPulseHiddenGems.gemScore,
        })
        .from(travelPulseHiddenGems)
        .where(ilike(travelPulseHiddenGems.city, city))
        .orderBy(desc(travelPulseHiddenGems.gemScore))
        .limit(limit);
      return res.json(rows);
    } catch (err: any) {
      console.error("Error fetching city gems:", err);
      res.status(500).json({ message: "Failed to fetch gems" });
    }
  });

  // Lightweight place-photo proxy — resolution order: Google Places → Unsplash
  // Used by the useGemPhoto hook (source=google first, then source=unsplash fallback).
  app.get("/api/media/place-photo", async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const city = typeof req.query.city === "string" ? req.query.city : "";
      const source = typeof req.query.source === "string" ? req.query.source : "google";
      if (!q) return res.json({ photoUrl: null });

      if (source === "unsplash") {
        // Unsplash → Pexels fallback chain via media aggregator services
        const { unsplashService } = await import("./services/unsplash.service");
        const { pexelsService } = await import("./services/pexels.service");
        // Try Unsplash first
        try {
          const unsplashPhotos = await unsplashService.getCityPhotos(`${q} ${city}`, "", 1);
          if (unsplashPhotos[0]?.url) {
            return res.json({ photoUrl: unsplashPhotos[0].url });
          }
        } catch {
          // fall through to Pexels
        }
        // Pexels fallback
        try {
          const pexelsPhotos = await pexelsService.searchPhotos(`${q} ${city}`, { perPage: 1, orientation: "landscape" });
          const photoUrl = pexelsPhotos[0]?.url ?? null;
          return res.json({ photoUrl });
        } catch {
          return res.json({ photoUrl: null });
        }
      }

      // Google Places (default)
      const { googlePlacesPhotosService } = await import("./services/google-places-photos.service");
      const photos = await googlePlacesPhotosService.getAttractionPhotos(q, city, 1);
      const photoUrl = photos[0]?.url ?? null;
      res.json({ photoUrl });
    } catch (err: any) {
      console.error("Error fetching place photo:", err);
      res.json({ photoUrl: null });
    }
  });

  // === Service Categories Routes ===

  // GET /api/service-categories/:categoryKey/fields — per-category dynamic field schema
  app.get("/api/service-categories/:categoryKey/fields", async (req, res) => {
    try {
      const fields = await storage.getCategoryFieldSchema(req.params.categoryKey);
      res.json(fields);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch category fields" });
    }
  });

  // === Custom Venues Routes ===
  
  // === Experience Types Routes ===
  
  // Slug aliasing for backward compatibility
  const slugAliases: Record<string, string> = {
    "romance": "date-night",
    "corporate": "corporate-events",
  };
  
  function resolveSlug(slug: string): string {
    return slugAliases[slug] || slug;
  }
  
  // === Experience Catalog API ===

  // === Travelpayouts Provider Routes ===

  // === Deals Aggregation Endpoint ===
  // --- /api/deals caching state (module-scoped, survives across requests) ---
  type DealItem = {
    id: string;
    type: string;
    title: string;
    destination: string;
    price: number | null;
    currency: string;
    rating: number | null;
    reviewCount: number | null;
    imageUrl: string | null;
    affiliateUrl: string | null;
    provider: string;
    providerLabel: string;
    featured: boolean;
  };
  type DealsPayload = { deals: DealItem[]; total: number };
  const DEALS_CACHE_NS = "deals";
  const DEALS_TTL_MS = 60 * 60 * 1000; // 1 hour
  const DEALS_STALE_MAX = 50; // max in-memory stale entries (FIFO eviction)
  const dealsStaleCache = new Map<string, DealsPayload>();
  const dealsRevalidating = new Set<string>();

  function setDealsStale(key: string, payload: DealsPayload): void {
    if (dealsStaleCache.size >= DEALS_STALE_MAX) {
      const oldest = dealsStaleCache.keys().next().value;
      if (oldest !== undefined) dealsStaleCache.delete(oldest);
    }
    dealsStaleCache.set(key, payload);
  }

  async function fetchDealsFromProviders(
    type: string,
    destination: string,
    origin: string
  ): Promise<DealsPayload> {
    const { searchAviasalesFlights } = await import("./services/travelpayouts/aviasales.service");
    const { searchHotellook } = await import("./services/travelpayouts/hotellook.service");
    const { searchAgoda } = await import("./services/travelpayouts/agoda.service");
    const { searchGetYourGuide } = await import("./services/travelpayouts/getyourguide.service");
    const { searchKlook } = await import("./services/travelpayouts/klook.service");
    const { searchTiqetsProducts } = await import("./services/travelpayouts/tiqets.service");
    const { searchDiscoverCars } = await import("./services/travelpayouts/discovercars.service");

    const popularHotelDests = destination ? [destination] : ["Tokyo", "Paris", "Bali"];
    const popularCarDests = destination ? [destination] : ["Bali", "Barcelona", "Lisbon"];
    const pickupDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dropoffDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

    const providerLabel: Record<string, string> = {
      aviasales: "via Aviasales",
      hotellook: "via Hotellook",
      agoda: "via Agoda",
      getyourguide: "via GetYourGuide",
      klook: "via Klook",
      tiqets: "via Tiqets",
      discovercars: "via DiscoverCars",
    };

    const normalize = (items: any[], featured = false): DealItem[] =>
      items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        destination: item.destination || "",
        price: item.price,
        currency: item.currency || "USD",
        rating: item.rating,
        reviewCount: item.reviewCount,
        imageUrl: item.imageUrl,
        affiliateUrl: item.affiliateUrl || item.bookingUrl,
        provider: item.provider,
        providerLabel: providerLabel[item.provider] || `via ${item.provider}`,
        featured: featured || (item.rating !== null && item.rating >= 4.7),
      }));

    const tasks: Promise<DealItem[]>[] = [];

    if (type === "all" || type === "flights") {
      tasks.push(
        searchAviasalesFlights({ origin, destination: destination || undefined, limit: 8 })
          .then((r) => normalize(r, false))
          .catch(() => [])
      );
    }

    if (type === "all" || type === "hotels") {
      for (const dest of popularHotelDests.slice(0, 2)) {
        tasks.push(
          searchHotellook({ destination: dest, limit: 4 })
            .then((r) => normalize(r, false))
            .catch(() => [])
        );
        tasks.push(
          searchAgoda({ destination: dest, checkIn: pickupDate, checkOut: dropoffDate, limit: 2 })
            .then((r) => normalize(r, false))
            .catch(() => [])
        );
      }
    }

    if (type === "all" || type === "experiences") {
      const expDests = destination ? [destination] : ["Tokyo", "Paris", "Bali"];
      for (const dest of expDests.slice(0, 2)) {
        tasks.push(
          searchGetYourGuide({ destination: dest, limit: 3 })
            .then((r) => normalize(r, false))
            .catch(() => [])
        );
        tasks.push(
          searchKlook({ destination: dest, limit: 2 })
            .then((r) => normalize(r, false))
            .catch(() => [])
        );
        tasks.push(
          searchTiqetsProducts({ city: dest, limit: 2 })
            .then((r) => normalize(r, true))
            .catch(() => [])
        );
      }
    }

    if (type === "all" || type === "cars") {
      for (const dest of popularCarDests.slice(0, 2)) {
        tasks.push(
          searchDiscoverCars({ pickupLocation: dest, pickupDate, dropoffDate, limit: 3 })
            .then((r) => normalize(r, false))
            .catch(() => [])
        );
      }
    }

    const results = await Promise.all(tasks);
    let deals: DealItem[] = results.flat();

    if (destination) {
      const q = destination.toLowerCase();
      deals = deals.filter(
        (d) =>
          d.destination.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q)
      );
    }

    const seen = new Set<string>();
    deals = deals.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    return { deals, total: deals.length };
  }

  app.get("/api/deals", async (req, res) => {
    try {
      const type = (req.query.type as string) || "all";
      const destination = (req.query.destination as string) || "";
      const origin = (req.query.origin as string) || "NYC";
      const cacheKey = `${type}:${destination || "all"}:${origin}`;

      // 1. Fresh DB cache hit → return immediately
      const cached = await sharedCache.get<DealsPayload>(DEALS_CACHE_NS, cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // 2. Stale-while-revalidate: serve last known result while refreshing in background.
      //    Always return stale immediately; only *start* a new refresh if none is running.
      const stale = dealsStaleCache.get(cacheKey);
      if (stale) {
        if (!dealsRevalidating.has(cacheKey)) {
          dealsRevalidating.add(cacheKey);
          fetchDealsFromProviders(type, destination, origin)
            .then(async (fresh) => {
              await sharedCache.set(DEALS_CACHE_NS, cacheKey, fresh, DEALS_TTL_MS);
              setDealsStale(cacheKey, fresh);
            })
            .catch((err) => console.error("[Deals] Background revalidation error:", err))
            .finally(() => dealsRevalidating.delete(cacheKey));
        }
        return res.json({ ...stale, stale: true });
      }

      // 3. Cold fetch: no cache at all → fetch synchronously, then cache
      const fresh = await fetchDealsFromProviders(type, destination, origin);
      await sharedCache.set(DEALS_CACHE_NS, cacheKey, fresh, DEALS_TTL_MS);
      setDealsStale(cacheKey, fresh);
      return res.json(fresh);
    } catch (error) {
      console.error("Deals aggregation error:", error);
      res.status(500).json({ message: "Failed to fetch deals" });
    }
  });

  // === Enhanced Expert Services Routes ===

  // Get all expert service categories with offerings (public)
  app.get("/api/expert-service-categories", async (_req, res) => {
    const categories = await storage.getExpertServiceCategories();
    const categoriesWithOfferings = await Promise.all(categories.map(async (cat) => {
      const offerings = await storage.getExpertServiceOfferings(cat.id);
      return { ...cat, offerings };
    }));
    res.json(categoriesWithOfferings);
  });

  // Get expert service offerings for a specific category
  app.get("/api/expert-service-categories/:categoryId/offerings", async (req, res) => {
    const offerings = await storage.getExpertServiceOfferings(req.params.categoryId);
    res.json(offerings);
  });

  // Get expert counts grouped by role (public) — used for role tab badges
  app.get("/api/experts/counts", async (req, res) => {
    const experienceTypeId = req.query.experienceTypeId as string | undefined;
    const location = req.query.location as string | undefined;
    const neighbourhood = req.query.neighbourhood as string | undefined;

    const experts = await storage.getExpertsWithProfiles(experienceTypeId);
    let filtered = experts as any[];

    if (location) {
      const loc = location.toLowerCase();
      filtered = filtered.filter((expert: any) => {
        const form = expert.expertForm;
        if (!form) return false;
        const destinations = (form.destinations || []).map((d: string) => d.toLowerCase());
        const city = (form.city || "").toLowerCase();
        const country = (form.country || "").toLowerCase();
        return destinations.some((d: string) => d.includes(loc) || loc.includes(d)) ||
          city.includes(loc) || loc.includes(city) ||
          country.includes(loc) || loc.includes(country);
      });
    }

    if (neighbourhood) {
      const nbh = neighbourhood.toLowerCase().trim();
      filtered = filtered.filter((expert: any) => {
        // A too-short term used to `return false` for EVERY expert — silently nuking
        // all results (the §13 "2-char neighbourhood empty-result trap"). Now a 1-char
        // term is a no-op filter (include), and 2-char+ terms match normally.
        if (nbh.length < 2) return true;
        const neighborhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
        return neighborhoods.some((n: string) => n.toLowerCase().includes(nbh));
      });
    }

    const counts: Record<string, number> = { local_expert: 0, travel_expert: 0, event_planner: 0 };
    for (const expert of filtered) {
      const r = expert.role as string;
      if (r in counts) counts[r]++;
    }
    res.json(counts);
  });

  // Get all experts with their full profiles (public)
  app.get("/api/experts", async (req, res) => {
    const experienceTypeId = req.query.experienceTypeId as string | undefined;
    const location = req.query.location as string | undefined;
    const experienceType = req.query.experienceType as string | undefined;
    const neighbourhood = req.query.neighbourhood as string | undefined;
    const role = req.query.role as string | undefined;
    const experts = await storage.getExpertsWithProfiles(experienceTypeId);

    let filtered = experts;

    // Filter by role (travel_expert, local_expert, event_planner)
    if (role) {
      filtered = filtered.filter((expert: any) => expert.role === role);
    }

    // Filter by location (match against expert form destinations, city, or country)
    if (location) {
      const loc = location.toLowerCase();
      filtered = filtered.filter((expert: any) => {
        const form = expert.expertForm;
        if (!form) return false;
        const destinations = (form.destinations || []).map((d: string) => d.toLowerCase());
        const city = (form.city || "").toLowerCase();
        const country = (form.country || "").toLowerCase();
        return destinations.some((d: string) => d.includes(loc) || loc.includes(d)) ||
          city.includes(loc) || loc.includes(city) ||
          country.includes(loc) || loc.includes(country);
      });
    }

    // Filter by neighbourhood name (case-insensitive substring match, minimum 3 chars to avoid noise)
    if (neighbourhood) {
      const nbh = neighbourhood.toLowerCase().trim();
      filtered = filtered.filter((expert: any) => {
        // A too-short term used to `return false` for EVERY expert — silently nuking
        // all results (the §13 "2-char neighbourhood empty-result trap"). Now a 1-char
        // term is a no-op filter (include), and 2-char+ terms match normally.
        if (nbh.length < 2) return true;
        const neighborhoods: string[] = Array.isArray(expert.expertForm?.neighborhoods) ? expert.expertForm.neighborhoods : [];
        return neighborhoods.some((n: string) => n.toLowerCase().includes(nbh));
      });
    }

    // Filter by experience type name (not ID)
    if (experienceType) {
      const et = experienceType.toLowerCase();
      filtered = filtered.filter((expert: any) =>
        expert.experienceTypes?.some((t: any) =>
          t.experienceType?.name?.toLowerCase().includes(et) ||
          t.experienceType?.slug?.toLowerCase().includes(et)
        )
      );
    }

    // Storefront metrics for expert cards — all REAL aggregates, never fabricated (§13):
    //   packagesCount / packagesSold : approved+published expert_templates (same §10 gate
    //     as the public /api/expert-templates feed) — count + SUM(salesCount). salesCount
    //     is only server-incremented on a completed purchase, so it is honest sales volume.
    //   servicesCount / serviceBookings : approved+active provider_services for this expert
    //     (owner console gate) — count + SUM(bookingsCount), the real booking volume.
    // Two grouped queries, applied to every role (local_expert / travel_expert /
    // event_planner) so trip advisors + event planners carry sales numbers too.
    try {
      const expertIds = Array.from(new Set(filtered.map((e: any) => String(e.id)).filter(Boolean)));
      if (expertIds.length > 0) {
        const [templateRows, serviceRows, ratingRows] = await Promise.all([
          db
            .select({
              expertId: expertTemplates.expertId,
              count: sql<number>`cast(count(*) as int)`,
              sold: sql<number>`cast(coalesce(sum(${expertTemplates.salesCount}), 0) as int)`,
            })
            .from(expertTemplates)
            .where(
              and(
                inArray(expertTemplates.expertId, expertIds),
                eq(expertTemplates.approvalStatus, "approved"),
                eq(expertTemplates.isPublished, true),
              ),
            )
            .groupBy(expertTemplates.expertId),
          db
            .select({
              userId: providerServices.userId,
              count: sql<number>`cast(count(*) as int)`,
              bookings: sql<number>`cast(coalesce(sum(${providerServices.bookingsCount}), 0) as int)`,
            })
            .from(providerServices)
            .where(
              and(
                inArray(providerServices.userId, expertIds),
                eq(providerServices.approvalStatus, "approved"),
                eq(providerServices.status, "active"),
              ),
            )
            .groupBy(providerServices.userId),
          // Roadmap 3.5: expert-level rating aggregate. Experts had NO rating source
          // (service reviews are service-scoped), so cards honestly showed "New".
          // service_reviews.provider_id IS the expert's user id for their own
          // services, so an expert's rating = AVG/COUNT over their APPROVED reviews
          // (the same moderation gate the service-level aggregate uses — pending/
          // flagged/removed never count). Real aggregate, never fabricated (§13).
          db
            .select({
              providerId: serviceReviews.providerId,
              avg: sql<number>`cast(avg(${serviceReviews.rating}) as float)`,
              count: sql<number>`cast(count(*) as int)`,
            })
            .from(serviceReviews)
            .where(
              and(
                inArray(serviceReviews.providerId, expertIds),
                eq(serviceReviews.status, "approved"),
              ),
            )
            .groupBy(serviceReviews.providerId),
        ]);
        const tplMap = new Map(templateRows.map((r) => [r.expertId, r]));
        const svcMap = new Map(serviceRows.map((r) => [r.userId, r]));
        const ratingMap = new Map(ratingRows.map((r) => [r.providerId, r]));
        filtered = filtered.map((e: any) => {
          const tpl = tplMap.get(String(e.id));
          const svc = svcMap.get(String(e.id));
          const rat = ratingMap.get(String(e.id));
          return {
            ...e,
            packagesCount: tpl?.count ?? 0,
            packagesSold: tpl?.sold ?? 0,
            servicesCount: svc?.count ?? 0,
            serviceBookings: svc?.bookings ?? 0,
            // null (not 0) when there are no reviews → the card shows "New", never a fake score.
            expertRating: rat && rat.count > 0 ? Number(rat.avg.toFixed(2)) : null,
            expertReviewCount: rat?.count ?? 0,
          };
        });
      }
    } catch (err) {
      console.error("Error attaching expert storefront metrics:", err);
      // Non-fatal: experts list still returns without counts.
    }

    res.json(filtered);
  });

  // Get a single expert with profile by ID (public)
  app.get("/api/experts/:id", async (req, res) => {
    const experts = await storage.getExpertsWithProfiles();
    const expert = experts.find(e => e.id === req.params.id);
    if (!expert) {
      return res.status(404).json({ message: "Expert not found" });
    }
    // Roadmap 3.5: attach the same real expert-level rating aggregate the list
    // uses (APPROVED service reviews for this expert; null when none → "New").
    try {
      const [rat] = await db
        .select({
          avg: sql<number>`cast(avg(${serviceReviews.rating}) as float)`,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(serviceReviews)
        .where(
          and(
            eq(serviceReviews.providerId, req.params.id),
            eq(serviceReviews.status, "approved"),
          ),
        );
      (expert as any).expertRating = rat && rat.count > 0 ? Number(rat.avg.toFixed(2)) : null;
      (expert as any).expertReviewCount = rat?.count ?? 0;
    } catch (err) {
      console.error("Error attaching expert rating:", err);
    }
    res.json(expert);
  });

  // Get services offered by a specific expert (public)
  app.get("/api/experts/:id/services", async (req, res) => {
    try {
      const expertId = req.params.id;
      // F2 public read-gate: this is a public expert-profile surface — approved+active listings only.
      const services = await storage.getApprovedServicesForExpert(expertId);
      res.json(services);
    } catch (err) {
      console.error("Error fetching expert services:", err);
      res.json([]);
    }
  });

  // Get reviews for a specific expert (public) — roadmap 3.5.
  // Was a stub returning []. Now returns the expert's REAL approved service
  // reviews (service_reviews.provider_id = expert id), newest first, with a
  // sanitized reviewer display name (never the full account). Only 'approved'
  // reviews surface — the same moderation gate the rating aggregate uses.
  app.get("/api/experts/:id/reviews", async (req, res) => {
    try {
      const expertId = req.params.id;
      const rows = await db
        .select({
          id: serviceReviews.id,
          rating: serviceReviews.rating,
          reviewText: serviceReviews.reviewText,
          responseText: serviceReviews.responseText,
          createdAt: serviceReviews.createdAt,
          serviceName: providerServices.serviceName,
          reviewerFirst: users.firstName,
          reviewerLast: users.lastName,
        })
        .from(serviceReviews)
        .leftJoin(providerServices, eq(serviceReviews.serviceId, providerServices.id))
        .leftJoin(users, eq(serviceReviews.travelerId, users.id))
        .where(
          and(
            eq(serviceReviews.providerId, expertId),
            eq(serviceReviews.status, "approved"),
          ),
        )
        .orderBy(desc(serviceReviews.createdAt))
        .limit(50);

      const reviews = rows.map((r) => {
        const first = (r.reviewerFirst || "").trim();
        const lastInitial = (r.reviewerLast || "").trim().charAt(0);
        const reviewerName = first
          ? (lastInitial ? `${first} ${lastInitial}.` : first)
          : "Traveler";
        return {
          id: r.id,
          rating: r.rating,
          reviewText: r.reviewText,
          responseText: r.responseText,
          createdAt: r.createdAt,
          serviceName: r.serviceName,
          reviewerName,
        };
      });
      res.json(reviews);
    } catch (err) {
      console.error("Error fetching expert reviews:", err);
      res.json([]);
    }
  });

  // GET /api/expert/neighborhoods — Return current expert's neighborhoods + locality proof
  app.get("/api/expert/neighborhoods", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const form = await storage.getLocalExpertForm(userId);
      res.json({
        neighborhoods: (form?.neighborhoods as string[]) || [],
        localityProof: form?.localityProof || "",
      });
    } catch (err) {
      console.error("Error fetching expert neighborhoods:", err);
      res.status(500).json({ message: "Failed to fetch" });
    }
  });

  // PATCH /api/expert/neighborhoods — Save expert's neighbourhood coverage
  app.patch("/api/expert/neighborhoods", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { neighborhoods, localityProof } = req.body;
      if (!Array.isArray(neighborhoods)) {
        return res.status(400).json({ message: "neighborhoods must be an array" });
      }
      if (localityProof !== undefined && typeof localityProof !== "string") {
        return res.status(400).json({ message: "localityProof must be a string" });
      }

      // Normalise: trim whitespace, drop empty strings, deduplicate case-insensitively
      // (first occurrence wins — preserves the casing the user typed first)
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const raw of neighborhoods) {
        if (typeof raw !== "string") continue;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          cleaned.push(trimmed);
        }
      }

      const MAX_NEIGHBORHOODS = 20;
      if (cleaned.length > MAX_NEIGHBORHOODS) {
        return res.status(400).json({
          message: `You can add at most ${MAX_NEIGHBORHOODS} neighbourhoods. Please remove some before saving.`,
        });
      }

      await storage.updateLocalExpertFormNeighborhoods(userId, cleaned, localityProof ?? "");
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert neighborhoods:", err);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  // PATCH /api/expert/profile-notes — Save expert's notes style description
  app.patch("/api/expert/profile-notes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { notesStyle } = req.body;
      if (typeof notesStyle !== "string") {
        return res.status(400).json({ message: "notesStyle must be a string" });
      }
      await storage.updateLocalExpertFormNotesStyle(userId, notesStyle.trim());
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert notes style:", err);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  // Get current expert's selected services (authenticated)
  app.get("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const services = await storage.getExpertSelectedServices(userId);
    res.json(services);
  });

  // Add service offering to expert's profile (authenticated)
  app.post("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { serviceOfferingId, customPrice } = req.body;
    const service = await storage.addExpertSelectedService(userId, serviceOfferingId, customPrice);
    res.json(service);
  });

  // Remove service offering from expert's profile (authenticated)
  app.delete("/api/expert/selected-services/:serviceOfferingId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    await storage.removeExpertSelectedService(userId, req.params.serviceOfferingId);
    res.json({ success: true });
  });

  // Get current expert's specializations (authenticated)
  app.get("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const specializations = await storage.getExpertSpecializations(userId);
    res.json(specializations);
  });

  // Add specialization to expert's profile (authenticated)
  app.post("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { specialization } = req.body;
    const spec = await storage.addExpertSpecialization(userId, specialization);
    res.json(spec);
  });

  // Remove specialization from expert's profile (authenticated)
  app.delete("/api/expert/specializations/:specialization", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    await storage.removeExpertSpecialization(userId, req.params.specialization);
    res.json({ success: true });
  });

  // === Expert Custom Services (User-submitted offerings) ===
  
  // Get current expert's custom services (authenticated)
  app.get("/api/expert/service-listings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const services = await storage.getProviderServiceListings(userId);
    res.json(services);
  });

  // Get single custom service by ID (authenticated - owner only)
  app.get("/api/expert/service-listings/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const service = await storage.getProviderServiceListingById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: "Custom service not found" });
    }
    if (service.expertId !== userId) {
      return res.status(403).json({ message: "Not authorized to view this service" });
    }
    res.json(service);
  });

  // Create new custom service (authenticated - experts only)
  app.post("/api/expert/service-listings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      
      if (!user || (user.role !== "expert" && user.role !== "admin")) {
        return res.status(403).json({ message: "Expert access required" });
      }

      const { title, description, categoryName, existingCategoryId, price, duration, deliverables, cancellationPolicy, leadTime, imageUrl, galleryImages, experienceTypes, isActive } = req.body;
      
      if (!title || !price) {
        return res.status(400).json({ message: "Title and price are required" });
      }

      const service = await storage.createProviderServiceListing(userId, {
        title,
        description,
        categoryName,
        existingCategoryId,
        price: price.toString(),
        duration,
        deliverables,
        cancellationPolicy,
        leadTime,
        imageUrl,
        galleryImages,
        experienceTypes,
        isActive: isActive !== false,
      });
      res.status(201).json(service);
    } catch (err) {
      console.error("Error creating custom service:", err);
      res.status(500).json({ message: "Failed to create custom service" });
    }
  });

  // Update custom service (authenticated - owner only, draft status only)
  app.patch("/api/expert/service-listings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const service = await storage.getProviderServiceListingById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this service" });
      }
      if (service.status !== "draft" && service.status !== "rejected") {
        return res.status(400).json({ message: "Can only update draft or rejected services" });
      }

      const updated = await storage.updateProviderServiceListing(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating custom service:", err);
      res.status(500).json({ message: "Failed to update custom service" });
    }
  });

  // Submit custom service for approval (authenticated - owner only)
  app.post("/api/expert/service-listings/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const service = await storage.getProviderServiceListingById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to submit this service" });
      }
      if (service.status !== "draft" && service.status !== "rejected") {
        return res.status(400).json({ message: "Can only submit draft or rejected services" });
      }

      const submitted = await storage.submitProviderServiceListing(req.params.id);
      res.json(submitted);
    } catch (err) {
      console.error("Error submitting custom service:", err);
      res.status(500).json({ message: "Failed to submit custom service" });
    }
  });

  // Delete custom service (authenticated - owner only, draft/rejected status only)
  app.delete("/api/expert/service-listings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const service = await storage.getProviderServiceListingById(req.params.id);
      
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }
      if (service.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this service" });
      }
      if (service.status === "approved") {
        return res.status(400).json({ message: "Cannot delete approved services. Deactivate instead." });
      }

      await storage.deleteProviderServiceListing(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting custom service:", err);
      res.status(500).json({ message: "Failed to delete custom service" });
    }
  });

  // === Expert Templates (Income Streams) ===

  // Gap 2 field whitelist (marketplace activation, Phase A/A1): the expert create/update
  // endpoints must write ONLY these expert-editable content fields — never raw req.body.
  // Deliberately excluded: isPublished / isFeatured (approval- and admin-gated, not
  // self-settable — see the shared approval queue), expertId (ownership), and every derived
  // counter (salesCount, viewCount, averageRating, reviewCount) + timestamps. Guarding these
  // closes the mass-assignment hole where an expert could self-publish or overwrite any column.
  // (Currency VALUE validation against a supported set lands with A3/price-integrity.)
  const EXPERT_TEMPLATE_EDITABLE_FIELDS = [
    "title", "description", "shortDescription", "destination", "duration",
    "price", "currency", "category", "coverImage", "images", "itineraryData",
    "tags", "highlights",
  ] as const;
  const pickExpertTemplateFields = (body: any): any => {
    const out: Record<string, any> = {};
    if (body && typeof body === "object") {
      for (const k of EXPERT_TEMPLATE_EDITABLE_FIELDS) {
        if (body[k] !== undefined) out[k] = body[k];
      }
    }
    return out;
  };

  // Get all published templates (public)
  // Content-gate (§10 Phase B): shared helper — see server/utils/template-content-gate.ts.
  // Public template reads return a teaser only; full itineraryData is purchaser/owner/admin-only.

  app.get("/api/expert-templates", async (req, res) => {
    try {
      const { category, destination, expertId } = req.query;
      // PUBLIC marketplace feed — read-gate on approved (D1a / §10 "safety before surfacing").
      // Only admin-approved AND expert-published templates surface. Matches the purchase gate
      // (routes.ts purchase: approvalStatus==='approved' && isPublished) so nothing appears in the
      // feed that couldn't be bought, and no unapproved listing leaks publicly. The expert's own
      // pipeline is the ungated owner console at GET /api/expert/templates.
      const templates = await storage.getExpertTemplates({
        isPublished: true,
        approvalStatus: "approved",
        category: category as string | undefined,
        destination: destination as string | undefined,
        expertId: expertId as string | undefined,
      });
      // Feed never needs the paid content — always redacted.
      res.json(templates.map(redactTemplateContent));
    } catch (err) {
      console.error("Error fetching templates:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Get single template (public - also tracks views)
  app.get("/api/expert-templates/:id", async (req, res) => {
    try {
      const template = await storage.getExpertTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      // Read-gate (D1a / §10): the PUBLIC detail read only exposes an approved + published
      // template — the same bar the feed and the purchase gate use — so an unapproved listing's
      // detail page can't be loaded by a would-be buyer. The OWNER (previewing their own pipeline)
      // and an ADMIN (reviewing the queue) are exempt. Route is unauthenticated, so req.user is
      // read opportunistically (session middleware populates it when a cookie is present).
      const isPublic = template.approvalStatus === "approved" && template.isPublished;
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const isOwner = !!userId && template.expertId === userId;
      let isAdmin = false;
      if (userId && !isOwner) {
        const actor = await storage.getUser(userId);
        isAdmin = actor?.role === "admin";
      }
      if (!isPublic && !isOwner && !isAdmin) {
        return res.status(404).json({ message: "Template not found" });
      }
      // Increment view count (only for genuinely public views — don't inflate on owner/admin preview)
      if (isPublic && !isOwner && !isAdmin) {
        await storage.incrementTemplateView(req.params.id);
      }
      // Content-gate: full itineraryData only for purchaser / owner / admin; everyone else
      // gets the teaser (see redactTemplateContent above).
      const isPurchaser = !!userId && !isOwner && !isAdmin
        ? await storage.hasUserPurchasedTemplate(userId, req.params.id)
        : false;
      const fullAccess = isOwner || isAdmin || isPurchaser;
      res.json(fullAccess ? { ...template, hasPurchased: isPurchaser } : redactTemplateContent(template));
    } catch (err) {
      console.error("Error fetching template:", err);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  // Get expert's own templates (authenticated)
  app.get("/api/expert/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const templates = await storage.getExpertTemplates({ expertId: userId });
      res.json(templates);
    } catch (err) {
      console.error("Error fetching expert templates:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Create new template (authenticated)
  app.post("/api/expert/templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      // Field whitelist (Gap 2): only expert-editable content fields; ownership is server-set;
      // never born-published — publishing is approval-gated via the shared queue.
      const template = await storage.createExpertTemplate({
        ...pickExpertTemplateFields(req.body),
        expertId: userId,
        isPublished: false,
      });
      res.json(template);
    } catch (err) {
      console.error("Error creating template:", err);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Update template (authenticated - owner only)
  app.patch("/api/expert/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const template = await storage.getExpertTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this template" });
      }

      // Field whitelist (Gap 2): only expert-editable content fields persist; isPublished /
      // approval / ownership / earning columns are ignored if present in the body.
      const fields = pickExpertTemplateFields(req.body);

      // A3 material-change re-review: what admin approved INCLUDES the price. Changing price
      // or currency on an ALREADY-approved template drops it back to 'submitted' (re-enters the
      // queue) so it can't silently go live at a new, unreviewed price. Content-only edits keep
      // their status. approvalStatus is never in `fields` (it's not whitelisted), so this is the
      // only path that can move an approved template's approval state via a PATCH.
      const changesPrice =
        (fields.price !== undefined && String(fields.price) !== String(template.price)) ||
        (fields.currency !== undefined && fields.currency !== template.currency);
      if (template.approvalStatus === "approved" && changesPrice) {
        (fields as any).approvalStatus = "submitted";
        (fields as any).submittedAt = new Date();
        (fields as any).reviewedAt = null;
        (fields as any).reviewedBy = null;
      }

      const updated = await storage.updateExpertTemplate(req.params.id, fields);
      res.json(updated);
    } catch (err) {
      console.error("Error updating template:", err);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Delete template (authenticated - owner only)
  app.delete("/api/expert/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const template = await storage.getExpertTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this template" });
      }

      await storage.deleteExpertTemplate(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting template:", err);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Submit a template for admin review (owner only, draft/rejected → submitted).
  // Experts can submit; only an admin can approve (see the /api/admin queue below).
  app.post("/api/expert/templates/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const template = await storage.getExpertTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.expertId !== userId) {
        return res.status(403).json({ message: "Not authorized to submit this template" });
      }
      if (template.approvalStatus === "approved") {
        return res.status(400).json({ message: "Template is already approved" });
      }
      const submitted = await storage.submitExpertTemplate(req.params.id);
      res.json(submitted);
    } catch (err) {
      console.error("Error submitting template:", err);
      res.status(500).json({ message: "Failed to submit template" });
    }
  });

  // ── Admin approval queue for expert templates (shared queue = Phase 4's queue) ──
  // All /api/admin/* routes sit behind the blanket adminApiGuard (default-deny, §2) —
  // no per-endpoint role opt-in. adminId is read for the reviewedBy stamp only.
  app.get("/api/admin/expert-templates/pending", async (req, res) => {
    try {
      const pending = await storage.getSubmittedExpertTemplates();
      res.json(pending);
    } catch (err) {
      console.error("Error listing pending templates:", err);
      res.status(500).json({ message: "Failed to list pending templates" });
    }
  });

  app.post("/api/admin/expert-templates/:id/approve", async (req, res) => {
    try {
      const adminId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const template = await storage.getExpertTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.approvalStatus !== "submitted") {
        return res.status(400).json({ message: "Can only approve submitted templates" });
      }
      const approved = await storage.approveExpertTemplate(req.params.id, adminId);
      res.json(approved);
    } catch (err) {
      console.error("Error approving template:", err);
      res.status(500).json({ message: "Failed to approve template" });
    }
  });

  app.post("/api/admin/expert-templates/:id/reject", async (req, res) => {
    try {
      const adminId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const reason = (req.body?.reason ?? "").toString().trim();
      if (!reason) {
        return res.status(400).json({ message: "A rejection reason is required" });
      }
      const template = await storage.getExpertTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.approvalStatus !== "submitted") {
        return res.status(400).json({ message: "Can only reject submitted templates" });
      }
      const rejected = await storage.rejectExpertTemplate(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting template:", err);
      res.status(500).json({ message: "Failed to reject template" });
    }
  });

  // Purchase template (authenticated)
  // ── Step 1: create a pending purchase + return a Stripe PaymentIntent ────
  // The client must confirm payment via Stripe.js and then call /confirm below.
  // Earning records are NOT created here — only after confirmed payment.
  app.post("/api/expert-templates/:id/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const template = await storage.getExpertTemplate(req.params.id);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      // Purchase gate (marketplace activation, A2): admin-approval is the gate the expert
      // CANNOT self-satisfy; isPublished stays the expert's own visibility toggle. BOTH must
      // hold — an approved-but-unpublished template respects the expert's choice to hide it,
      // and a published-but-unapproved template is not purchasable (approval wins).
      if (template.approvalStatus !== "approved" || !template.isPublished) {
        return res.status(400).json({ message: "Template is not available for purchase" });
      }
      if (template.expertId === userId) {
        return res.status(400).json({ message: "You cannot purchase your own template" });
      }

      // Already paid — return the existing completed purchase (idempotent)
      const alreadyPurchased = await storage.hasUserPurchasedTemplate(userId, req.params.id);
      if (alreadyPurchased) {
        return res.status(400).json({ message: "You have already purchased this template" });
      }

      // Resolve commission rates from booking_fee_configs (fallback: PLATFORM_FEE_RATE)
      const templateRates = await resolveCommissionRates(template.category ?? null);
      const price = parseFloat(template.price as string);
      const platformFee = price * templateRates.platformFeeRate;
      const expertEarnings = price * templateRates.expertShareRate;

      // Create a PENDING purchase — no earning created until Stripe confirms
      const purchase = await storage.createTemplatePurchase({
        templateId: req.params.id,
        buyerId: userId,
        expertId: template.expertId,
        price: template.price,
        currency: template.currency || 'USD',
        platformFee: platformFee.toFixed(2),
        expertEarnings: expertEarnings.toFixed(2),
        status: 'pending_payment',
      });

      // Create Stripe PaymentIntent; embed purchaseId in metadata so /confirm
      // can verify it without an extra DB column.
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });
      const currency = (template.currency || 'USD').toLowerCase();
      const isZeroDecimal = currency === 'jpy';
      const stripeAmount = isZeroDecimal ? Math.round(price) : Math.round(price * 100);

      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: stripeAmount,
        currency,
        metadata: {
          purchaseId: purchase.id,
          templateId: req.params.id,
          buyerId: userId,
          expertId: template.expertId,
        },
        description: `Traveloure template: ${template.title}`,
        automatic_payment_methods: { enabled: true },
      });

      // 202 Accepted — payment not yet captured; client must call /confirm.
      // Template is content-REDACTED here: payment hasn't succeeded yet, so the buyer
      // doesn't get the paid itinerary until /confirm verifies the intent.
      return res.status(202).json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        purchaseId: purchase.id,
        template: redactTemplateContent(template),
        subtotal: price,
        platformFee,
        expertPayout: expertEarnings,
        commissionRate: templateRates.platformFeeRate,
      });
    } catch (err) {
      console.error("Error initiating template purchase:", err);
      res.status(500).json({ message: "Failed to initiate template purchase" });
    }
  });

  // ── Step 2: confirm payment and unlock the purchase ───────────────────────
  // Called by the client after Stripe.js confirms the PaymentIntent.
  // Verifies payment succeeded server-side, then marks the purchase complete
  // and records the expert earning. Fully idempotent.
  app.post("/api/expert-templates/:id/purchase/confirm", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { paymentIntentId, purchaseId } = req.body;

      if (!paymentIntentId || !purchaseId) {
        return res.status(400).json({ message: "paymentIntentId and purchaseId are required" });
      }

      // Retrieve intent from Stripe — never trust client-reported status
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });
      const intent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

      if (intent.status !== 'succeeded') {
        return res.status(402).json({
          message: `Payment not completed (status: ${intent.status}). Complete payment before confirming.`,
          stripeStatus: intent.status,
        });
      }

      // IDOR guard — the intent must reference this exact purchase
      if (intent.metadata?.purchaseId !== purchaseId) {
        return res.status(400).json({ message: "PaymentIntent does not match the specified purchase" });
      }

      // Load the purchase and verify ownership
      const purchase = await storage.getTemplatePurchase(purchaseId);
      if (!purchase) {
        return res.status(404).json({ message: "Purchase not found" });
      }
      if (purchase.buyerId !== userId) {
        return res.status(403).json({ message: "Not authorised to confirm this purchase" });
      }

      // Idempotent — already completed by a prior confirm call
      if (purchase.status === 'completed') {
        const template = await storage.getExpertTemplate(purchase.templateId);
        return res.json({ purchase, template });
      }

      if (purchase.status !== 'pending_payment') {
        return res.status(409).json({
          message: `Purchase is in status '${purchase.status}' and cannot be confirmed`,
        });
      }

      // Idempotency guard (atomic transition, not check-then-update): the status flip IS the
      // concurrency guard. Only the confirm that actually transitions pending_payment→completed
      // records the earning. A concurrent/duplicate confirm updates zero rows and must NOT
      // double-credit (the `!== pending_payment` check above is a fast-path, not the guard — two
      // confirms can both pass it before either writes; the WHERE status='pending_payment' closes it).
      const [completed] = await db
        .update(templatePurchases)
        .set({ status: 'completed' })
        .where(and(eq(templatePurchases.id, purchaseId), eq(templatePurchases.status, 'pending_payment')))
        .returning();

      if (!completed) {
        // Lost the race — another confirm already completed this purchase. Idempotent success,
        // no second earning credited.
        const template = await storage.getExpertTemplate(purchase.templateId);
        return res.json({ purchase, template, alreadyCompleted: true });
      }

      await storage.createExpertEarning({
        expertId: purchase.expertId,
        type: 'template_sale',
        amount: purchase.expertEarnings,
        currency: purchase.currency || 'USD',
        referenceId: purchase.id,
        referenceType: 'template_purchase',
        description: `Sale of template (confirmed payment ${paymentIntentId})`,
        status: 'held', // escrow: born held (migration 112)
        availableAt: availableAtFor('template_sale'), // P2: template clearance window (was immediate; ratified per-surface window)
      });

      const template = await storage.getExpertTemplate(purchase.templateId);
      return res.json({ purchase: completed, template });
    } catch (err) {
      console.error("Error confirming template purchase:", err);
      res.status(500).json({ message: "Failed to confirm template purchase" });
    }
  });

  // Get user's purchased templates
  app.get("/api/my-purchased-templates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  // Get template reviews
  app.get("/api/expert-templates/:id/reviews", async (req, res) => {
    try {
      const reviews = await storage.getTemplateReviews(req.params.id);
      res.json(reviews);
    } catch (err) {
      console.error("Error fetching reviews:", err);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Create template review (authenticated - must have purchased)
  app.post("/api/expert-templates/:id/reviews", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      // Get user's purchase of this template
      const purchases = await storage.getTemplatePurchases({ buyerId: userId });
      const purchase = purchases.find(p => p.templateId === req.params.id);
      
      if (!purchase) {
        return res.status(403).json({ message: "You must purchase this template before reviewing" });
      }

      const review = await storage.createTemplateReview({
        templateId: req.params.id,
        purchaseId: purchase.id,
        reviewerId: userId,
        rating: req.body.rating,
        review: req.body.review,
      });

      res.json(review);
    } catch (err) {
      console.error("Error creating review:", err);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // Get expert earnings (authenticated)
  app.get("/api/expert/earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      // Fetch bookings (for transactions list), payout history, and authoritative ledger summary
      const [bookings, payouts, ledgerSummary] = await Promise.all([
        storage.getServiceBookings({ providerId: userId }),
        storage.getExpertPayouts(userId),
        storage.getExpertEarningsSummary(userId),
      ]);

      // Compute gross/fee totals and monthly figure from bookings for display context
      const now = new Date();
      let grossBookingTotal = 0;
      let platformFeeTotal = 0;
      let monthlyEarnings = 0;

      for (const b of bookings) {
        const gross = Number(b.totalAmount ?? 0);
        const fee = Number(b.platformFee ?? 0);
        const earned = Number(b.providerEarnings ?? 0);

        grossBookingTotal += gross;
        platformFeeTotal += fee;

        if (b.status === "completed") {
          const completedAt = b.completedAt ? new Date(b.completedAt) : null;
          if (completedAt && completedAt.getMonth() === now.getMonth() && completedAt.getFullYear() === now.getFullYear()) {
            monthlyEarnings += earned;
          }
        }
      }

      const effectiveRate = grossBookingTotal > 0
        ? Number(((ledgerSummary.total) / grossBookingTotal).toFixed(4))
        : EXPERT_SHARE_RATE;

      const lastPayout = payouts[0];

      // Summary figures sourced from the expert_earnings ledger — same source used by payout request validation
      const summary = {
        totalEarnings: ledgerSummary.total,
        monthlyEarnings,
        pendingPayout: ledgerSummary.pending,
        availableForPayout: ledgerSummary.available,
        lastPayout: lastPayout ? parseFloat(lastPayout.amount || '0') : 0,
        lastPayoutDate: lastPayout?.processedAt
          ? new Date(lastPayout.processedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : undefined,
        platformFeeTotal: Number(platformFeeTotal.toFixed(2)),
        grossBookingTotal: Number(grossBookingTotal.toFixed(2)),
        revenueShareRate: effectiveRate,
      };

      // Build transactions from service_bookings for the activity feed
      const bookingTransactions = [...bookings]
        .sort((a, b) => new Date(b.createdAt as any || 0).getTime() - new Date(a.createdAt as any || 0).getTime())
        .slice(0, 20)
        .map(b => ({
          id: b.id,
          amount: b.providerEarnings || "0",
          type: "service_booking",
          status: b.status || "pending",
          createdAt: b.createdAt || new Date().toISOString(),
          description: `Booking #${b.trackingNumber || b.id.slice(0, 8)}`,
        }));

      res.json({ earnings: bookingTransactions, summary });
    } catch (err) {
      console.error("Error fetching earnings:", err);
      res.status(500).json({ message: "Failed to fetch earnings" });
    }
  });

  // Get expert template sales (authenticated)
  app.get("/api/expert/template-sales", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const sales = await storage.getTemplatePurchases({ expertId: userId });
      
      // Get template details for each sale
      const salesWithTemplates = await Promise.all(
        sales.map(async (sale) => {
          const template = await storage.getExpertTemplate(sale.templateId);
          return { ...sale, template };
        })
      );
      
      res.json(salesWithTemplates);
    } catch (err) {
      console.error("Error fetching sales:", err);
      res.status(500).json({ message: "Failed to fetch sales" });
    }
  });

  // === Income Streams & Revenue Splits ===
  
  // Expert Tips - Create a tip for an expert
  app.post("/api/expert/:expertId/tip", isAuthenticated, async (req, res) => {
    try {
      const travelerId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { expertId } = req.params;
      
      // Validate request body
      const tipSchema = z.object({
        amount: z.number().positive("Amount must be positive"),
        message: z.string().max(500).optional(),
        bookingId: z.string().optional(),
        isAnonymous: z.boolean().optional().default(false),
      });

      const parsed = tipSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid tip data", errors: parsed.error.errors });
      }

      const { amount, message, bookingId, isAnonymous } = parsed.data;

      // Note: createExpertTip in storage applies revenue split and creates expert earnings ledger entry
      const tip = await storage.createExpertTip({
        expertId,
        travelerId,
        amount: String(amount),
        message,
        bookingId,
        isAnonymous,
      });

      res.json(tip);
    } catch (err) {
      console.error("Error creating tip:", err);
      res.status(500).json({ message: "Failed to create tip" });
    }
  });

  // Get tips received by expert
  app.get("/api/expert/tips", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const result = await storage.getTipsForExpert(userId);
      res.json(result);
    } catch (err) {
      console.error("Error fetching tips:", err);
      res.status(500).json({ message: "Failed to fetch tips" });
    }
  });

  // Expert Referrals - Get referral code and stats
  app.get("/api/expert/referrals", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const referrals = await storage.getExpertReferrals(userId);
      
      // Get the expert's referral code from their profile
      const expertProfile = await storage.getLocalExpertForm(userId);
      const referralCode = expertProfile?.referralCode || `REF-${userId.substring(0, 8).toUpperCase()}`;
      
      const stats = {
        totalReferrals: referrals.length,
        pendingReferrals: referrals.filter(r => r.status === 'pending').length,
        qualifiedReferrals: referrals.filter(r => r.status === 'qualified' || r.status === 'paid').length,
        totalEarned: referrals.filter(r => r.status === 'paid').reduce((sum, r) => sum + parseFloat(r.bonusAmount || '0'), 0),
      };

      res.json({ referralCode, referrals, stats });
    } catch (err) {
      console.error("Error fetching referrals:", err);
      res.status(500).json({ message: "Failed to fetch referrals" });
    }
  });

  // Affiliate earnings for expert
  app.get("/api/expert/affiliate-earnings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const earnings = await storage.getAffiliateEarnings(userId);
      const summary = await storage.getAffiliateEarningsSummary(userId);
      res.json({ earnings, summary });
    } catch (err) {
      console.error("Error fetching affiliate earnings:", err);
      res.status(500).json({ message: "Failed to fetch affiliate earnings" });
    }
  });

  // Comprehensive Revenue Optimization endpoint
  app.get("/api/expert/revenue-optimization", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      // Get all earnings data
      const [
        earningsData,
        templateSales,
        templates,
        tips,
        affiliateEarnings,
        referrals,
        services,
        bookings,
        revenueSplits
      ] = await Promise.all([
        storage.getExpertEarningsSummary(userId),
        storage.getTemplatePurchases({ expertId: userId }),
        storage.getExpertTemplates({ expertId: userId }),
        storage.getTipsForExpert(userId),
        storage.getAffiliateEarningsSummary(userId),
        storage.getExpertReferrals(userId),
        storage.getProviderServices(userId),
        storage.getServiceBookings(userId),
        storage.getRevenueSplits()
      ]);

      // Get revenue split configurations
      const affiliateSplit = revenueSplits.find((s) => s.type === 'affiliate_commission');
      const tipSplit = revenueSplits.find((s) => s.type === 'tip');
      const serviceSplit = revenueSplits.find((s) => s.type === 'service_booking');
      const templateSplit = revenueSplits.find((s) => s.type === 'template_sale');

      // Calculate expert's share percentages — policy: service/template 75%, affiliate 30%
      const serviceExpertPct = parseFloat(serviceSplit?.expertPercentage || '75') / 100;
      const templateExpertPct = parseFloat(templateSplit?.expertPercentage || '75') / 100;
      
      // Calculate real earnings breakdown - using expert's share after platform fees
      const publishedTemplates = templates.filter((t) => t.isPublished);
      const templateGrossRevenue = templateSales.reduce((sum: number, s) => sum + parseFloat(s.price || '0'), 0);
      const templateExpertRevenue = templateSales.reduce((sum: number, s) => sum + parseFloat(s.expertEarnings || '0'), 0);
      
      // Calculate service booking revenue - apply expert's share
      const completedBookings = bookings.filter((b: any) => b.status === 'completed');
      const serviceGrossRevenue = completedBookings.reduce((sum: number, b: any) => sum + parseFloat(b.amount || '0'), 0);
      const serviceExpertRevenue = serviceGrossRevenue * serviceExpertPct; // Expert's share after platform fee

      // Calculate income streams with real data - using expert's share
      const incomeStreams = {
        serviceBookings: {
          name: "Service Bookings",
          description: "Direct consulting, planning, and concierge services",
          revenue: serviceExpertRevenue, // Expert's share after platform fee
          grossRevenue: serviceGrossRevenue,
          bookings: completedBookings.length,
          split: {
            expert: parseFloat(serviceSplit?.expertPercentage || '85'),
            platform: parseFloat(serviceSplit?.platformPercentage || '15'),
            provider: 0
          },
          status: services.length > 0 ? "active" : "setup"
        },
        templateSales: {
          name: "Itinerary Templates",
          description: "Pre-built itineraries sold on the marketplace",
          revenue: templateExpertRevenue, // Expert's share after platform fee
          grossRevenue: templateGrossRevenue,
          sales: templateSales.length,
          publishedCount: publishedTemplates.length,
          split: {
            expert: parseFloat(templateSplit?.expertPercentage || '80'),
            platform: parseFloat(templateSplit?.platformPercentage || '20'),
            provider: 0
          },
          status: publishedTemplates.length > 0 ? "active" : "setup"
        },
        affiliateCommissions: {
          name: "Affiliate Commissions",
          description: "Earnings from client bookings via your links",
          revenue: affiliateEarnings.total,
          pending: affiliateEarnings.pending,
          confirmed: affiliateEarnings.confirmed,
          split: {
            expert: parseFloat(affiliateSplit?.expertPercentage || '60'),
            platform: parseFloat(affiliateSplit?.platformPercentage || '20'),
            provider: parseFloat(affiliateSplit?.providerPercentage || '20')
          },
          status: affiliateEarnings.total > 0 ? "active" : "available"
        },
        tips: {
          name: "Tips",
          description: "Gratuity from satisfied travelers",
          revenue: tips.totalAmount,
          count: tips.tips.length,
          split: {
            expert: parseFloat(tipSplit?.expertPercentage || '95'),
            platform: parseFloat(tipSplit?.platformPercentage || '5'),
            provider: 0
          },
          status: tips.tips.length > 0 ? "active" : "available"
        },
        referralBonuses: {
          name: "Referral Bonuses",
          description: "Earn $50 for each qualified expert referral",
          revenue: referrals.filter((r) => r.status === 'paid').reduce((sum: number, r) => sum + parseFloat(r.bonusAmount || '0'), 0),
          referrals: referrals.length,
          qualified: referrals.filter((r) => r.status === 'qualified' || r.status === 'paid').length,
          split: {
            expert: 100,
            platform: 0,
            provider: 0
          },
          status: referrals.length > 0 ? "active" : "available"
        }
      };

      // Total earnings
      const totalRevenue = 
        incomeStreams.serviceBookings.revenue +
        incomeStreams.templateSales.revenue +
        incomeStreams.affiliateCommissions.revenue +
        incomeStreams.tips.revenue +
        incomeStreams.referralBonuses.revenue;

      // Calculate earnings projection based on actual trends (using expert's share)
      const monthlyBookings = completedBookings.length;
      const avgBookingValue = monthlyBookings > 0 ? serviceExpertRevenue / monthlyBookings : 0;
      
      const projections = {
        currentMonthly: totalRevenue,
        projectedGrowth: Math.round(totalRevenue * 1.15), // 15% growth target
        potentialMax: Math.round(totalRevenue * 1.5), // With all optimizations
        avgBookingValue,
        monthlyBookings
      };

      // Generate AI-powered insights based on actual data
      const insights = [];
      
      if (incomeStreams.templateSales.status === 'setup') {
        insights.push({
          type: 'opportunity',
          title: 'Create Your First Template',
          description: 'Publish itinerary templates to earn passive income while you sleep.',
          impact: 'Avg template earns $50-200/month',
          priority: 'high'
        });
      }
      
      if (incomeStreams.affiliateCommissions.status === 'available') {
        insights.push({
          type: 'opportunity',
          title: 'Enable Affiliate Links',
          description: 'Earn commissions when your clients book hotels and activities.',
          impact: `You keep ${affiliateSplit?.expertPercentage || 60}% of each commission`,
          priority: 'high'
        });
      }
      
      if (services.length === 0) {
        insights.push({
          type: 'urgent',
          title: 'Create Your First Service',
          description: 'Set up your consulting or planning services to start earning.',
          impact: 'Unlock your primary income stream',
          priority: 'high'
        });
      }

      res.json({
        summary: {
          totalRevenue,
          availableBalance: earningsData.available,
          pendingBalance: earningsData.pending,
          paidOut: earningsData.paidOut
        },
        incomeStreams,
        projections,
        revenueSplits: {
          serviceBooking: serviceSplit,
          templateSale: templateSplit,
          affiliateCommission: affiliateSplit,
          tip: tipSplit
        },
        insights
      });
    } catch (err) {
      console.error("Error fetching revenue optimization data:", err);
      res.status(500).json({ message: "Failed to fetch revenue optimization data" });
    }
  });

  // === Destination Calendar (Public travel guide) ===
  
  // Public provider verification status (for service detail page badge)
  app.get("/api/providers/:userId/public-verification", async (req, res) => {
    try {
      const [form] = await db.select({
        identityVerificationStatus: serviceProviderForms.identityVerificationStatus,
        businessVerificationStatus: serviceProviderForms.businessVerificationStatus,
      }).from(serviceProviderForms)
        .where(eq(serviceProviderForms.userId, req.params.userId))
        .limit(1);
      if (!form) return res.json({ identityVerified: false, businessVerified: false });
      res.json({
        identityVerified: form.identityVerificationStatus === "verified",
        businessVerified: form.businessVerificationStatus === "verified",
      });
    } catch {
      res.json({ identityVerified: false, businessVerified: false });
    }
  });

  // === Tourism Analytics Event Tracking (Fire-and-forget) ===
  
  // Track destination search events
  const searchEventSchema = z.object({
    destination: z.string(),
    origin: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    travelers: z.number().optional(),
    experienceType: z.string().optional(),
    searchContext: z.string().optional(), // "discover" | "experience-template" | "quick-start"
  });

  // Track itinerary generation events
  const itineraryGeneratedSchema = z.object({
    tripId: z.string().optional(),
    destination: z.string(),
    activities: z.array(z.string()).optional(),
    duration: z.number().optional(), // days
    travelers: z.number().optional(),
    budget: z.number().optional(),
    variationType: z.string().optional(), // "user_plan" | "weather_optimized" | "best_value"
    experienceType: z.string().optional(),
  });

  // Track booking events
  const bookingEventSchema = z.object({
    type: z.string(), // "hotel" | "activity" | "flight" | "service" | "transport"
    destination: z.string().optional(),
    price: z.number().optional(),
    travelers: z.number().optional(),
    tripId: z.string().optional(),
    itemId: z.string().optional(),
    provider: z.string().optional(), // "amadeus" | "viator" | "platform" | "external"
    bookingStatus: z.string().optional(), // "initiated" | "confirmed" | "pending"
  });

  // GET /api/expert/offering-types — returns active expert offering type rows (5-tier catalog)
  // Public (no auth required) so the /earn page and unauthenticated service form can load it.
  app.get("/api/expert/offering-types", async (req, res) => {
    try {
      const rows = await storage.getActiveExpertOfferingTypes();
      res.json(rows);
    } catch (err) {
      console.error("Failed to fetch expert offering types:", err);
      res.status(500).json({ message: "Failed to fetch offering types" });
    }
  });

  // Get expert's services by status
  app.get("/api/expert/services", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const status = req.query.status as string | undefined;
    const services = await storage.getProviderServicesByStatus(userId, status);
    res.json(services);
  });

  // Toggle service status (pause/activate)
  app.patch("/api/expert/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const { status } = req.body;
      if (!["active", "paused", "draft"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.toggleServiceStatus(req.params.id, status);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Duplicate a service
  app.post("/api/expert/services/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const duplicated = await storage.duplicateService(req.params.id, userId);
      res.status(201).json(duplicated);
    } catch (err) {
      res.status(500).json({ message: "Failed to duplicate service" });
    }
  });

  // Create service from template
  app.post("/api/expert/services/from-template/:templateId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const templateId = req.params.templateId;

      // expert_service_offerings is the primary catalog; service_templates is legacy fallback
      let serviceName: string;
      let description: string | undefined;
      let price: string;
      let serviceType: string | undefined;
      let deliveryMethod: string | undefined;
      let deliveryTimeframe: string | undefined;
      let requirements: string | undefined;
      let whatIncluded: string | undefined;

      const esoRow = await db.select().from(expertServiceOfferings)
        .where(eq(expertServiceOfferings.id, templateId)).then(r => r[0]);

      if (esoRow) {
        // Primary: expert_service_offerings
        serviceName     = esoRow.name;
        description     = esoRow.description ?? undefined;
        price           = esoRow.price;
      } else {
        // Fallback: service_templates (legacy / admin-created)
        const stRow = await storage.getServiceTemplate(templateId);
        if (!stRow) {
          return res.status(404).json({ message: "Template not found" });
        }
        serviceName     = stRow.title;
        description     = stRow.description ?? undefined;
        price           = stRow.suggestedPrice ?? "0";
        serviceType     = stRow.serviceType ?? undefined;
        deliveryMethod  = stRow.deliveryMethod ?? undefined;
        deliveryTimeframe = stRow.deliveryTimeframe ?? undefined;
        requirements    = stRow.requirements as string | undefined;
        whatIncluded    = stRow.whatIncluded as string | undefined;
      }

      const serviceData = {
        userId,
        serviceName,
        description,
        categoryId: null,
        price: price || "0",
        serviceType,
        deliveryMethod,
        deliveryTimeframe,
        requirements,
        whatIncluded,
        status: "draft",
      };

      const service = await storage.createProviderService(serviceData as any);
      res.status(201).json(service);
    } catch (err) {
      console.error("Error creating service from template:", err);
      res.status(500).json({ message: "Failed to create service from template" });
    }
  });

  // === Service Bookings Routes ===
  
  // Get bookings for provider (their services)
  // NOTE: User data is sanitized - experts cannot see full traveler info (email, phone, etc.)
  app.get("/api/expert/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const userRole = (req.user as any).claims.role || 'expert';
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ providerId: userId, status });
    
    // Enrich with traveler info (sanitized for privacy)
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const traveler = await storage.getUser(booking.travelerId);
      const sanitizedTraveler = traveler ? sanitizeUserForRole(traveler, userRole, false) : null;
      return {
        ...sanitizeBookingForExpert(booking, userRole, userId),
        traveler: sanitizedTraveler ? {
          ...sanitizedTraveler,
          displayName: getDisplayName(traveler.firstName, traveler.lastName)
        } : null
      };
    }));
    
    res.json(enrichedBookings);
  });

  // Get bookings for traveler (services they booked)
  // Provider bookings (for calendar)
  // NOTE: User data is sanitized - providers cannot see full traveler info
  app.get("/api/provider/bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const userRole = (req.user as any).claims.role || 'provider';
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ providerId: userId, status });
    
    // Enrich with service details and sanitized traveler info
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const service = await storage.getProviderServiceById(booking.serviceId);
      const traveler = await storage.getUser(booking.travelerId);
      const sanitizedTraveler = traveler ? sanitizeUserForRole(traveler, userRole, false) : null;
      return {
        ...sanitizeBookingForExpert(booking, userRole, userId),
        service,
        traveler: sanitizedTraveler ? {
          ...sanitizedTraveler,
          displayName: getDisplayName(traveler.firstName, traveler.lastName)
        } : null
      };
    }));
    
    res.json(enrichedBookings);
  });

  app.get("/api/my-bookings", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const status = req.query.status as string | undefined;
    const bookings = await storage.getServiceBookings({ travelerId: userId, status });
    
    // Enrich bookings with hasReview flag
    const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
      const reviews = await storage.getReviewsByBookingId(booking.id);
      return { ...booking, hasReview: reviews.length > 0 };
    }));
    
    res.json(enrichedBookings);
  });

  app.get("/api/service-bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const status = req.query.status as string | undefined;
      const bookings = await storage.getServiceBookings({ travelerId: userId, status });
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const service = await storage.getProviderServiceById(booking.serviceId);
        const provider = await storage.getUser(booking.providerId);
        return {
          ...booking,
          service,
          provider: provider ? { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, profileImage: provider.profileImage } : null,
        };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("Service bookings error:", err);
      res.status(500).json({ message: "Failed to fetch service bookings" });
    }
  });

  app.get("/api/bookings/user", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const status = req.query.status as string | undefined;
      const bookings = await storage.getServiceBookings({ travelerId: userId, status });
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const reviews = await storage.getReviewsByBookingId(booking.id);
        return { ...booking, hasReview: reviews.length > 0 };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("User bookings error:", err);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/cart/items", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { serviceId, customVenueId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug } = req.body;
      if (!serviceId && !customVenueId) {
        return res.status(400).json({ message: "Service ID or Custom Venue ID is required" });
      }
      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          return res.status(404).json({ message: "Service not found" });
        }
      }
      if (customVenueId) {
        const venue = await storage.getCustomVenue(customVenueId);
        if (!venue) {
          return res.status(404).json({ message: "Custom venue not found" });
        }
        if (venue.userId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      }
      const experienceSlug = rawSlug ? resolveSlug(rawSlug) : "general";
      const item = await storage.addToCart(userId, {
        serviceId: serviceId || undefined,
        customVenueId: customVenueId || undefined,
        quantity: quantity || 1,
        tripId,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
        experienceSlug,
      });
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Failed to add to cart:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Get single booking
  // NOTE: If requester is provider, traveler info is sanitized
  app.get("/api/bookings/:id", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const userRole = (req.user as any).claims.role || 'user';
    const booking = await storage.getServiceBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    // Check if user is traveler or provider
    if (booking.travelerId !== userId && booking.providerId !== userId) {
      return res.status(403).json({ message: "Not authorized to view this booking" });
    }
    
    // If the user is the traveler, they see full booking
    // If the user is the provider, sanitize the traveler info
    if (booking.travelerId === userId) {
      res.json(booking);
    } else {
      // Provider viewing - sanitize traveler info
      const traveler = await storage.getUser(booking.travelerId);
      const sanitizedBooking = sanitizeBookingForExpert(booking, userRole, userId);
      res.json({
        ...sanitizedBooking,
        traveler: traveler ? {
          ...sanitizeUserForRole(traveler, userRole, false),
          displayName: getDisplayName(traveler.firstName, traveler.lastName)
        } : null
      });
    }
  });

  // Get client profile (for experts/providers) - sanitized view
  // SECURITY: Experts can only see limited client information for their bookings
  app.get("/api/client/:clientId", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const userRole = (req.user as any).claims.role || 'user';
    const { clientId } = req.params;
    
    // Check if requester has a legitimate relationship with this client
    // (i.e., they have bookings with this client)
    const bookings = await storage.getServiceBookings({ providerId: userId });
    const hasRelationship = bookings.some(b => b.travelerId === clientId);
    
    // Admins can see any client
    const isAdmin = canSeeFullUserData(userRole);
    
    if (!hasRelationship && !isAdmin) {
      // Log unauthorized access attempt
      storage.logAccess({
        actorId: userId,
        actorRole: userRole,
        action: 'view_profile_denied',
        resourceType: 'user',
        resourceId: clientId,
        targetUserId: clientId,
        metadata: { reason: 'no_relationship' },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return res.status(403).json({ message: "Not authorized to view this client" });
    }
    
    const client = await storage.getUser(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    
    // Log successful profile access
    storage.logAccess({
      actorId: userId,
      actorRole: userRole,
      action: 'view_profile',
      resourceType: 'user',
      resourceId: clientId,
      targetUserId: clientId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    // Return sanitized profile based on role
    const sanitizedClient = sanitizeUserForRole(client, userRole, false);
    res.json({
      ...sanitizedClient,
      displayName: getDisplayName(client.firstName, client.lastName),
      // Include booking stats for this relationship
      bookingCount: bookings.filter(b => b.travelerId === clientId).length
    });
  });

  // Create a booking
  app.post("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const input = insertServiceBookingSchema.parse(req.body);
      
      // Verify service exists and is active
      const service = await storage.getProviderServiceById(input.serviceId);
      if (!service || service.status !== "active") {
        return res.status(404).json({ message: "Service not found or not available" });
      }
      
      const booking = await storage.createServiceBooking({
        ...input,
        travelerId: userId,
        providerId: service.userId,
      });
      
      // Increment service bookings count
      await storage.incrementServiceBookings(service.id, Number(service.price) || 0);
      
      res.status(201).json(booking);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating booking:", err);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  // Update booking status (provider actions)
  app.patch("/api/expert/bookings/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.providerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const { status, reason } = req.body;
      const updated = await storage.updateServiceBookingStatus(req.params.id, status, reason);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  // Update visa application status on a service booking (expert/provider action)
  app.patch("/api/service-bookings/:id/visa-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.providerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const VALID_VISA_STATUSES = ["pending", "submitted", "in_review", "approved", "rejected"];
      const { visaApplicationStatus, notes, documentChecklist } = req.body;
      if (!VALID_VISA_STATUSES.includes(visaApplicationStatus)) {
        return res.status(400).json({ message: "Invalid visa application status" });
      }
      const metadata: Record<string, any> = { visaApplicationStatus };
      if (notes !== undefined) metadata.visaStatusNotes = notes;
      if (documentChecklist !== undefined) {
        if (!Array.isArray(documentChecklist)) {
          return res.status(400).json({ message: "documentChecklist must be an array" });
        }
        metadata.documentChecklist = documentChecklist.map((item: any) => ({
          label: String(item.label || ""),
          checked: Boolean(item.checked),
        }));
      }
      metadata.visaStatusUpdatedAt = new Date().toISOString();
      const updated = await storage.updateServiceBookingMetadata(req.params.id, metadata);

      // Send notification to the traveler about the visa status change
      try {
        const service = await storage.getProviderServiceById(booking.serviceId);
        const serviceName = service?.title || "your visa application";
        const statusMessages: Record<string, string> = {
          pending: `Your visa application for ${serviceName} is being prepared.`,
          submitted: `Your visa application for ${serviceName} has been submitted to the embassy.`,
          in_review: `Your visa application for ${serviceName} is currently under review.`,
          approved: `Great news! Your visa application for ${serviceName} has been approved.`,
          rejected: `Your visa application for ${serviceName} has been rejected. Please contact your expert for next steps.`,
        };
        const statusTitles: Record<string, string> = {
          pending: "Visa Application: Pending",
          submitted: "Visa Application: Submitted",
          in_review: "Visa Application: Under Review",
          approved: "Visa Application: Approved",
          rejected: "Visa Application: Rejected",
        };
        await storage.createNotification({
          userId: booking.travelerId,
          type: "visa_status_update",
          title: statusTitles[visaApplicationStatus] || "Visa Application Update",
          message: statusMessages[visaApplicationStatus] || `Your visa application status has been updated to: ${visaApplicationStatus}.`,
          relatedId: booking.id,
          relatedType: "booking",
          data: { bookingId: booking.id, visaApplicationStatus, serviceName: service?.title },
        });
      } catch (notifErr) {
        console.error("Failed to create visa status notification:", notifErr);
      }

      res.json(updated);
    } catch (err) {
      console.error("Visa status update error:", err);
      res.status(500).json({ message: "Failed to update visa status" });
    }
  });

  // Update traveler's document checklist checked state
  app.patch("/api/service-bookings/:id/document-checklist", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const { documentChecklist } = req.body;
      if (!Array.isArray(documentChecklist)) {
        return res.status(400).json({ message: "documentChecklist must be an array" });
      }
      const sanitized = documentChecklist.map((item: any) => ({
        label: String(item.label || ""),
        checked: Boolean(item.checked),
      }));
      const updated = await storage.updateServiceBookingMetadata(req.params.id, { documentChecklist: sanitized });
      res.json(updated);
    } catch (err) {
      console.error("Document checklist update error:", err);
      res.status(500).json({ message: "Failed to update document checklist" });
    }
  });

  // Cancel booking (traveler action)
  app.post("/api/bookings/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      if (booking.status !== "pending" && booking.status !== "confirmed") {
        return res.status(400).json({ message: "Cannot cancel this booking" });
      }
      const { reason } = req.body;
      const updated = await storage.updateServiceBookingStatus(req.params.id, "cancelled", reason);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  // === Notifications Routes ===

  // === Service Reviews Routes ===
  
  // Provider responds to a review
  app.post("/api/expert/reviews/:id/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const review = await storage.getServiceReview(req.params.id);
      if (!review || review.providerId !== userId) {
        return res.status(404).json({ message: "Review not found or not for your service" });
      }
      const { responseText } = req.body;
      if (!responseText) {
        return res.status(400).json({ message: "Response text required" });
      }
      const updated = await storage.addReviewResponse(req.params.id, responseText);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to respond to review" });
    }
  });

  // Get expert's analytics/stats
  app.get("/api/expert/analytics", isAuthenticated, async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const services = await storage.getProviderServicesByStatus(userId);
    const bookings = await storage.getServiceBookings({ providerId: userId });
    
    const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
    const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
    const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
      sum + Number(s.averageRating) / arr.length, 0
    );
    
    const pendingBookings = bookings.filter(b => b.status === "pending").length;
    const completedBookings = bookings.filter(b => b.status === "completed").length;
    
    res.json({
      totalServices: services.length,
      activeServices: services.filter(s => s.status === "active").length,
      draftServices: services.filter(s => s.status === "draft").length,
      pausedServices: services.filter(s => s.status === "paused").length,
      totalRevenue,
      totalBookings,
      averageRating: avgRating || null,
      pendingBookings,
      completedBookings,
    });
  });

  app.get("/api/expert/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      const earnings = await storage.getExpertEarnings(userId);
      const form = await storage.getLocalExpertForm(userId);
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      // Routing/payout eligibility flags — consumed by expert/dashboard.tsx (PayoutBanner) and the
      // admin QA-checklist L3 assertion. Ported from the (now-removed) dark experts.routes.ts twin.
      const approvalStatus = form?.status ?? null;
      const stripeConnectStatus = (form as any)?.stripeConnectStatus ?? "not_started";
      res.json({
        summary: { totalRevenue, totalBookings, completedBookings: completedBookings.length, pendingBookings: pendingBookings.length },
        services: services.map(s => ({ id: s.id, serviceName: s.serviceName, status: s.status, bookingsCount: s.bookingsCount, totalRevenue: s.totalRevenue })),
        recentEarnings: earnings.slice(0, 10),
        approvalStatus,
        stripeConnectStatus,
        isRoutingEligible: approvalStatus === "approved",
        isPayable: stripeConnectStatus === "complete",
      });
    } catch (err) {
      console.error("Expert dashboard error:", err);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  app.get("/api/provider/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      res.json({
        summary: { totalRevenue, totalBookings, completedBookings: completedBookings.length, pendingBookings: pendingBookings.length },
        services: services.map(s => ({ id: s.id, serviceName: s.serviceName, status: s.status, bookingsCount: s.bookingsCount, totalRevenue: s.totalRevenue })),
      });
    } catch (err) {
      console.error("Provider dashboard error:", err);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  // Get comprehensive expert analytics dashboard data
  app.get("/api/expert/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      const earnings = await storage.getExpertEarnings(userId);
      const templates = await storage.getExpertTemplates({ expertId: userId });
      
      // Get expert's profile for selected services and specializations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const selectedServicesAtSignup = (expertProfile?.selectedServices as string[]) || [];
      const expertSpecializations = (expertProfile?.specializations as string[]) || [];
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      
      // Calculate key metrics
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
        sum + Number(s.averageRating) / arr.length, 0
      ) || 0;
      
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      const confirmedBookings = bookings.filter(b => b.status === "confirmed");
      
      // Template analytics
      const publishedTemplates = templates.filter(t => t.isPublished);
      const templateRevenue = earnings
        .filter(e => e.type === "template_sale")
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      
      // Calculate conversion metrics
      const inquiryCount = bookings.length;
      const conversionRate = inquiryCount > 0 ? (completedBookings.length / inquiryCount) * 100 : 0;
      
      // Revenue by service type
      const revenueByService = services.reduce((acc: any[], s) => {
        const revenue = Number(s.totalRevenue || 0);
        if (revenue > 0) {
          acc.push({
            service: s.serviceName || "Unnamed Service",
            revenue,
            bookings: s.bookingsCount || 0,
            percentage: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0
          });
        }
        return acc;
      }, []).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      
      // Conversion funnel
      const profileViews = Math.floor(totalBookings * 3.5); // Estimated
      const inquiriesStarted = totalBookings;
      const quoteSent = Math.floor(totalBookings * 0.85);
      const bookingsMade = completedBookings.length + confirmedBookings.length;
      
      const conversionFunnel = [
        { stage: "Profile Views", count: profileViews, percent: 100 },
        { stage: "Inquiries Started", count: inquiriesStarted, percent: profileViews > 0 ? (inquiriesStarted / profileViews) * 100 : 0 },
        { stage: "Quote Sent", count: quoteSent, percent: inquiriesStarted > 0 ? (quoteSent / inquiriesStarted) * 100 : 0 },
        { stage: "Booking Made", count: bookingsMade, percent: quoteSent > 0 ? (bookingsMade / quoteSent) * 100 : 0 },
        { stage: "Completed", count: completedBookings.length, percent: bookingsMade > 0 ? (completedBookings.length / bookingsMade) * 100 : 0 },
      ];
      
      // Calculate benchmarks
      const benchmarks = {
        responseTime: { value: "2 hrs", benchmark: "1 hr", status: "good" },
        conversionRate: { 
          value: `${conversionRate.toFixed(0)}%`, 
          benchmark: "55%", 
          status: conversionRate >= 55 ? "excellent" : conversionRate >= 40 ? "good" : "needs_improvement"
        },
        avgRating: {
          value: avgRating.toFixed(1),
          benchmark: "4.5",
          status: avgRating >= 4.5 ? "excellent" : avgRating >= 4.0 ? "good" : "needs_improvement"
        },
        avgBookingValue: {
          value: `$${totalBookings > 0 ? (totalRevenue / totalBookings).toFixed(0) : 0}`,
          benchmark: "$350",
          status: totalRevenue / (totalBookings || 1) >= 350 ? "excellent" : "good"
        }
      };
      
      // Client lifetime value
      const clientLifetimeValue = {
        average: totalBookings > 0 ? Math.round(totalRevenue / totalBookings * 1.8) : 0,
        repeatRate: 35, // Estimated
        avgBookingsPerClient: 1.8
      };
      
      // Track which selected services have been created vs pending
      const createdServiceNames = services.map(s => (s.serviceName || "").toLowerCase());
      const serviceAlignment = selectedServicesAtSignup.map(serviceName => ({
        name: serviceName,
        status: createdServiceNames.some(cs => cs.includes(serviceName.toLowerCase()) || serviceName.toLowerCase().includes(cs)) 
          ? "created" 
          : "pending"
      }));
      
      res.json({
        expertProfile: {
          selectedServices: selectedServicesAtSignup,
          specializations: expertSpecializations,
          destinations: expertDestinations,
          city: expertProfile?.city,
          country: expertProfile?.country
        },
        serviceAlignment,
        summary: {
          totalRevenue,
          totalBookings,
          avgRating,
          activeServices: services.filter(s => s.status === "active").length,
          publishedTemplates: publishedTemplates.length,
          templateRevenue,
          pendingBookings: pendingBookings.length,
          completedBookings: completedBookings.length,
        },
        keyMetrics: benchmarks,
        conversionFunnel,
        revenueByService,
        clientLifetimeValue,
        earnings: earnings.slice(0, 10)
      });
    } catch (err) {
      console.error("Error fetching expert analytics dashboard:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Get market intelligence for experts - filtered by their markets
  app.get("/api/expert/market-intelligence", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      // Get expert's profile to find their markets/destinations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      const expertCity = expertProfile?.city;
      const expertCountry = expertProfile?.country;
      
      // Fetch all trending destinations from TravelPulse
      const allTrending = await db.select().from(travelPulseTrending).limit(50);
      const allCities = await db.select().from(travelPulseCities).limit(20);
      const allHappeningNow = await db.select().from(travelPulseHappeningNow).limit(20);
      
      // Filter trending to match expert's markets
      let filteredTrending = allTrending;
      if (expertDestinations.length > 0 || expertCity || expertCountry) {
        const marketKeywords = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
        filteredTrending = allTrending.filter(t => {
          const destLower = (t.destinationName || "").toLowerCase();
          const cityLower = (t.city || "").toLowerCase();
          const countryLower = (t.country || "").toLowerCase();
          return marketKeywords.some(keyword => 
            destLower.includes(keyword!) || cityLower.includes(keyword!) || countryLower.includes(keyword!)
          );
        });
        // If no matches, show global trending as fallback
        if (filteredTrending.length === 0) {
          filteredTrending = allTrending.slice(0, 10);
        }
      }
      
      // Filter cities to match expert's markets
      let filteredCities = allCities;
      if (expertDestinations.length > 0 || expertCity || expertCountry) {
        const marketKeywords = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
        filteredCities = allCities.filter(c => {
          const cityLower = (c.cityName || "").toLowerCase();
          const countryLower = (c.country || "").toLowerCase();
          return marketKeywords.some(keyword => 
            cityLower.includes(keyword!) || countryLower.includes(keyword!)
          );
        });
        if (filteredCities.length === 0) {
          filteredCities = allCities.slice(0, 5);
        }
      }
      
      // Filter happening now to match expert's markets
      let filteredHappeningNow = allHappeningNow;
      if (expertDestinations.length > 0 || expertCity || expertCountry) {
        const marketKeywords = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
        filteredHappeningNow = allHappeningNow.filter(h => {
          const cityLower = (h.city || "").toLowerCase();
          return marketKeywords.some(keyword => cityLower.includes(keyword!));
        });
        if (filteredHappeningNow.length === 0) {
          filteredHappeningNow = allHappeningNow.slice(0, 5);
        }
      }
      
      // Generate seasonal demand based on expert's markets
      const seasonalDemandByMarket: Record<string, any[]> = {
        "japan": [{ season: "Cherry Blossom Season", location: "Japan", timing: "Mar-Apr", demandIncrease: 85, suggestedRateIncrease: 25, status: "upcoming", daysAway: 45 }],
        "europe": [{ season: "Summer Peak", location: "Europe", timing: "Jun-Aug", demandIncrease: 120, suggestedRateIncrease: 35, status: "upcoming", daysAway: 120 }],
        "usa": [{ season: "Fall Foliage", location: "New England", timing: "Sep-Oct", demandIncrease: 65, suggestedRateIncrease: 20, status: "future", daysAway: 200 }],
        "caribbean": [{ season: "Winter Holidays", location: "Caribbean", timing: "Dec-Jan", demandIncrease: 95, suggestedRateIncrease: 30, status: "future", daysAway: 280 }],
        "asia": [{ season: "Lunar New Year", location: "Asia", timing: "Jan-Feb", demandIncrease: 90, suggestedRateIncrease: 30, status: "upcoming", daysAway: 30 }],
        "australia": [{ season: "Summer Season", location: "Australia", timing: "Dec-Feb", demandIncrease: 80, suggestedRateIncrease: 25, status: "upcoming", daysAway: 60 }],
      };
      
      // Match seasonal demand to expert's markets
      let seasonalDemand: any[] = [];
      const allMarkets = [...expertDestinations, expertCity, expertCountry].filter(Boolean).map(s => s?.toLowerCase());
      for (const market of allMarkets) {
        for (const [key, demand] of Object.entries(seasonalDemandByMarket)) {
          if (market?.includes(key) || key.includes(market || "")) {
            seasonalDemand.push(...demand);
          }
        }
      }
      // Remove duplicates and provide fallback
      seasonalDemand = Array.from(new Map(seasonalDemand.map(d => [d.season, d])).values());
      if (seasonalDemand.length === 0) {
        seasonalDemand = Object.values(seasonalDemandByMarket).flat().slice(0, 4);
      }
      
      res.json({
        expertMarkets: {
          destinations: expertDestinations,
          city: expertCity,
          country: expertCountry
        },
        trending: filteredTrending.slice(0, 10).map(t => ({
          destination: t.destinationName,
          score: t.trendScore || 0,
          reason: t.triggerEvent || "Trending destination",
          category: t.destinationType || "destination"
        })),
        cities: filteredCities.slice(0, 5).map(c => ({
          name: c.cityName,
          country: c.country,
          bestTimeToVisit: c.aiBestTimeToVisit || "Year-round",
          summary: c.aiTravelTips || "Explore this destination"
        })),
        happeningNow: filteredHappeningNow.slice(0, 5).map(h => ({
          title: h.title,
          type: h.eventType,
          location: h.city,
          urgency: h.crowdLevel || "moderate"
        })),
        seasonalDemand
      });
    } catch (err) {
      console.error("Error fetching market intelligence:", err);
      res.status(500).json({ message: "Failed to fetch market intelligence" });
    }
  });

  // === Service Recommendation Engine API Endpoints ===

  // Get service recommendations for experts based on TravelPulse trends
  app.get("/api/recommendations/expert", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const limit = parseInt(req.query.limit as string) || 10;
      
      // Get expert's profile to find their markets/destinations
      const expertProfile = await storage.getLocalExpertForm(userId);
      const expertDestinations = (expertProfile?.destinations as string[]) || [];
      const expertCity = expertProfile?.city;
      
      // Build cities list from expert's markets
      const cities = expertDestinations.length > 0 
        ? expertDestinations 
        : expertCity ? [expertCity] : [];
      
      if (cities.length === 0) {
        return res.json({ 
          recommendations: [],
          message: "Set your destination markets in your expert profile to receive recommendations" 
        });
      }

      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      const recommendations = await serviceRecommendationEngine.getExpertRecommendations(userId, cities, limit);
      
      res.json({ recommendations });
    } catch (err) {
      console.error("Error fetching expert recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Get service recommendations for providers
  app.get("/api/recommendations/provider", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const limit = parseInt(req.query.limit as string) || 10;
      
      // Get provider's service locations
      const services = await storage.getProviderServicesByStatus(userId);
      const locations = Array.from(new Set(services.map(s => s.location).filter((l): l is string => Boolean(l))));
      const location = locations[0] || (req.query.city as string);
      
      if (!location) {
        return res.json({ 
          recommendations: [],
          message: "Create a service or specify a city to receive recommendations" 
        });
      }

      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      const recommendations = await serviceRecommendationEngine.getProviderRecommendations(userId, location, limit);
      
      res.json({ recommendations, location });
    } catch (err) {
      console.error("Error fetching provider recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Get service recommendations for users (trip planning)
  app.get("/api/recommendations/user", async (req, res) => {
    try {
      const city = req.query.city as string | undefined;
      const experienceType = req.query.experienceType as string | undefined;
      const preferences = req.query.preferences ? (req.query.preferences as string).split(",") : undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const userId = (req.user as any)?.claims?.sub || "anonymous";
      
      // If no city provided, return trending destinations as recommendations
      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      
      if (!city) {
        // Return general trending recommendations without city filter
        const recommendations = await serviceRecommendationEngine.getTrendingRecommendations(experienceType, limit);
        return res.json({ recommendations, message: "Showing trending destinations" });
      }

      const prefs = preferences || (experienceType ? [experienceType] : undefined);
      const [recommendations, packages] = await Promise.all([
        serviceRecommendationEngine.getUserRecommendations(userId, city, prefs, limit),
        // Destination-aware, quality-ranked package recs — additive field; existing
        // consumers read `.recommendations` and are unaffected.
        serviceRecommendationEngine.getRecommendedPackagesForUser(city, prefs, 6),
      ]);

      res.json({ recommendations, packages, city });
    } catch (err) {
      console.error("Error fetching user recommendations:", err);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Get market intelligence for a city
  app.get("/api/recommendations/market-intelligence/:city", async (req, res) => {
    try {
      const { city } = req.params;
      
      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      const intelligence = await serviceRecommendationEngine.getMarketIntelligence(city);
      
      res.json(intelligence);
    } catch (err) {
      console.error("Error fetching market intelligence:", err);
      res.status(500).json({ message: "Failed to fetch market intelligence" });
    }
  });

  // Get seasonal opportunities
  app.get("/api/recommendations/seasonal/:city", async (req, res) => {
    try {
      const { city } = req.params;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      
      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      const opportunities = await serviceRecommendationEngine.getSeasonalOpportunities(city, month);
      
      res.json({ opportunities, city, month: month || new Date().getMonth() + 1 });
    } catch (err) {
      console.error("Error fetching seasonal opportunities:", err);
      res.status(500).json({ message: "Failed to fetch seasonal opportunities" });
    }
  });

  // Refresh demand signals for a city (authenticated users only for now)
  app.post("/api/recommendations/refresh/:city", isAuthenticated, async (req, res) => {
    try {
      const { city } = req.params;
      const country = req.query.country as string;
      
      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      const count = await serviceRecommendationEngine.refreshDemandSignalsForCity(city);
      
      res.json({ message: `Generated ${count} demand signals for ${city}`, count });
    } catch (err) {
      console.error("Error refreshing demand signals:", err);
      res.status(500).json({ message: "Failed to refresh demand signals" });
    }
  });

  // Record recommendation conversion (when user acts on a recommendation)
  app.post("/api/recommendations/:id/convert", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      // Validate request body
      const conversionSchema = z.object({
        conversionType: z.string().min(1, "Conversion type is required"),
        resultId: z.string().optional(),
        revenueGenerated: z.number().optional(),
      });
      
      const validatedBody = conversionSchema.safeParse(req.body);
      if (!validatedBody.success) {
        return res.status(400).json({ message: "Invalid request body", errors: validatedBody.error.errors });
      }
      
      const { conversionType, resultId, revenueGenerated } = validatedBody.data;
      
      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      await serviceRecommendationEngine.recordConversion(id, userId, conversionType, resultId, revenueGenerated);
      
      res.json({ message: "Conversion recorded" });
    } catch (err) {
      console.error("Error recording conversion:", err);
      res.status(500).json({ message: "Failed to record conversion" });
    }
  });

  // Dismiss a recommendation
  app.post("/api/recommendations/:id/dismiss", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      const { serviceRecommendationEngine } = await import("./services/recommendation.service");
      await serviceRecommendationEngine.dismissRecommendation(id);
      
      res.json({ message: "Recommendation dismissed" });
    } catch (err) {
      console.error("Error dismissing recommendation:", err);
      res.status(500).json({ message: "Failed to dismiss recommendation" });
    }
  });

  // Get provider analytics dashboard
  app.get("/api/provider/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
        sum + Number(s.averageRating) / arr.length, 0
      ) || 0;
      
      const completedBookings = bookings.filter(b => b.status === "completed");
      const pendingBookings = bookings.filter(b => b.status === "pending");
      
      // Monthly breakdown from real booking data
      const now = new Date();
      const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const nextDate = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
        const month = date.toLocaleString('en-US', { month: 'short' });
        const monthBookings = bookings.filter(b => {
          if (!b.createdAt) return false;
          const d = new Date(b.createdAt);
          return d >= date && d < nextDate && b.status === 'completed';
        });
        return {
          month,
          revenue: monthBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0),
          bookings: monthBookings.length,
        };
      });
      
      // Service performance
      const servicePerformance = services.map(s => ({
        id: s.id,
        title: s.serviceName || "Unnamed Service",
        revenue: Number(s.totalRevenue || 0),
        bookings: s.bookingsCount || 0,
        rating: Number(s.averageRating || 0),
        status: s.status
      })).sort((a, b) => b.revenue - a.revenue);
      
      res.json({
        summary: {
          totalRevenue,
          totalBookings,
          avgRating,
          activeServices: services.filter(s => s.status === "active").length,
          pendingBookings: pendingBookings.length,
          completedBookings: completedBookings.length,
        },
        monthlyRevenue,
        servicePerformance,
        benchmarks: {
          avgBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
          categoryAvg: 280,
          topPerformerAvg: 450
        }
      });
    } catch (err) {
      console.error("Error fetching provider analytics:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // === Cart Routes ===

  // Get cart items
  app.get("/api/cart", isAuthenticated, async (req, res) => {
    try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const rawSlug = req.query.experience as string | undefined;
    const experienceSlug = rawSlug ? resolveSlug(rawSlug) : undefined;
    const items = await storage.getCartItems(userId, experienceSlug);

    // Per-item commission lookup — matches the logic in /api/checkout so the
    // quoted fee never diverges from the charged fee.
    const distinctIds = Array.from(new Set(
      items.filter(i => i.service?.categoryId).map(i => i.service!.categoryId as string)
    ));
    const cartCatMap = new Map<string, string>(); // categoryId → fee-config slug
    if (distinctIds.length > 0) {
      const catRows = await db.select({ id: serviceCategories.id, slug: serviceCategories.slug })
        .from(serviceCategories)
        .where(inArray(serviceCategories.id, distinctIds));
      for (const row of catRows) {
        cartCatMap.set(row.id, serviceCategorySlugToFeeCategory(row.slug));
      }
    }

    const safeRate = (v: any, fb: number) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fb; };

    let subtotal = 0;
    let platformFeeTotal = 0;
    for (const item of items) {
      const price = parseFloat(item.service?.price || "0") * (item.quantity || 1);
      const feeCategory = item.service?.categoryId
        ? (cartCatMap.get(item.service.categoryId) ?? "default")
        : "default";
      const rates = await resolveCommissionRates(feeCategory);
      const expertShare = safeRate(item.service?.revenueShareRate, rates.expertShareRate);
      subtotal += price;
      platformFeeTotal += price * (1 - expertShare);
    }

    res.json({
      items,
      subtotal: subtotal.toFixed(2),
      platformFee: platformFeeTotal.toFixed(2),
      total: (subtotal + platformFeeTotal).toFixed(2),
      itemCount: items.length,
    });
    } catch (err) {
      console.error("[Cart] GET /api/cart failed:", err);
      res.status(500).json({ message: "Failed to load cart" });
    }
  });

  // Resolve cart items into a trip (creates draft trip + backfills tripId on cart items)
  app.post("/api/cart/resolve-trip", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { experienceSlug, userExperienceId } = req.body;

      // 1. Get all cart items for this user (optionally filtered by experience slug)
      const items: any[] = experienceSlug
        ? await storage.getCartItems(userId, experienceSlug)
        : await storage.getCartItems(userId);

      // Guard: empty cart cannot generate a meaningful trip
      if (!items || items.length === 0) {
        return res.status(400).json({ message: "Cannot resolve trip: cart is empty" });
      }

      // 2. Reuse an existing tripId if any cart item already has one
      const existingTripId = items.find((i) => i.tripId)?.tripId;
      if (existingTripId) {
        const trip = await storage.getTrip(existingTripId);
        if (trip && trip.userId === userId) {
          return res.json({ tripId: existingTripId, created: false, trip });
        }
      }

      // 3. Infer destination: most common city across cart items
      const cityCounts: Record<string, number> = {};
      for (const item of items) {
        const city =
          (item.contentMeta as any)?.city ||
          item.service?.location ||
          null;
        if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
      }
      const destination =
        Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        "Your Destination";

      // 4. Infer start date: earliest scheduledDate, or today + 30 days
      const scheduledDates = items
        .map((i) => (i.scheduledDate ? new Date(i.scheduledDate) : null))
        .filter(Boolean) as Date[];
      const defaultStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const inferredStart =
        scheduledDates.length > 0
          ? scheduledDates.reduce((min, d) => (d < min ? d : min), scheduledDates[0])
          : defaultStart;
      const inferredEnd = new Date(inferredStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const startDate = inferredStart.toISOString().split("T")[0];
      const endDate = inferredEnd.toISOString().split("T")[0];

      // 5. Resolve user_experience via slug (server-side) to get guestCount for party size
      let resolvedUserExperienceId: string | null = userExperienceId || null;
      let inferredTravelers = 2; // default fallback

      if (experienceSlug) {
        // Resolve experienceType by slug, then find the user's experience row
        const [expType] = await db
          .select({ id: experienceTypesTable.id })
          .from(experienceTypesTable)
          .where(eq(experienceTypesTable.slug, experienceSlug))
          .limit(1);

        if (expType) {
          const [userExp] = await db
            .select({ id: userExperiences.id, guestCount: userExperiences.guestCount })
            .from(userExperiences)
            .where(
              and(
                eq(userExperiences.userId, userId),
                eq(userExperiences.experienceTypeId, expType.id)
              )
            )
            .limit(1);

          if (userExp) {
            resolvedUserExperienceId = resolvedUserExperienceId || userExp.id;
            if (userExp.guestCount && userExp.guestCount > 0) {
              inferredTravelers = userExp.guestCount;
            }
          }
        }
      }

      // Also check cart item contentMeta for any travelers hint
      const metaTravelers = items
        .map((i) => (i.contentMeta as any)?.travelers || (i.contentMeta as any)?.numberOfTravelers)
        .filter((v) => typeof v === "number" && v > 0);
      if (metaTravelers.length > 0 && inferredTravelers === 2) {
        inferredTravelers = Math.max(...metaTravelers);
      }

      // 6. Create the trip with inferred metadata
      const title = `Your ${destination} trip`;
      const trip = await storage.createTrip({
        userId,
        title,
        destination,
        startDate,
        endDate,
        numberOfTravelers: inferredTravelers,
        adults: inferredTravelers,
        kids: 0,
        status: "draft",
      });

      // 7. Backfill tripId on all matching cart items
      const whereClause = experienceSlug
        ? and(eq(cartItems.userId, userId), eq(cartItems.experienceSlug, experienceSlug))
        : eq(cartItems.userId, userId);
      await db.update(cartItems).set({ tripId: trip.id }).where(whereClause);

      // 8. Link to user_experience idempotently (via client-supplied id or slug-resolved id)
      if (resolvedUserExperienceId) {
        await db
          .update(userExperiences)
          .set({ tripId: trip.id })
          .where(
            and(
              eq(userExperiences.id, resolvedUserExperienceId),
              eq(userExperiences.userId, userId)
            )
          );
      }

      res.json({ tripId: trip.id, created: true, trip });
    } catch (err) {
      console.error("Error resolving cart trip:", err);
      res.status(500).json({ message: "Failed to resolve trip" });
    }
  });

  // Add to cart
  app.post("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { serviceId, customVenueId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug, contentType, contentId, contentMeta } = req.body;

      console.log("[Cart] Add to cart request:", { serviceId, customVenueId, contentType, contentId, experienceSlug: rawSlug });

      // Funnel consistency: Discover-feed CONTENT items (gems/hotels/activities/
      // events) add straight to the cart like services — the trip/experience
      // question is asked once, in the cart's Trip-details step, not at add-time.
      // Storage + cart UI already supported content rows; this is the missing
      // write path. contentMeta is DISPLAY-ONLY and whitelisted to string fields —
      // no price is accepted (§14: a client-supplied price must never reach a charge).
      const CART_CONTENT_TYPES = new Set(["gem", "hotel", "activity", "event", "neighborhood"]);
      const isContentAdd =
        typeof contentType === "string" && CART_CONTENT_TYPES.has(contentType) &&
        typeof contentId === "string" && contentId.length > 0 && contentId.length <= 200;

      if (!serviceId && !customVenueId && !isContentAdd) {
        return res.status(400).json({ message: "Service ID, Custom Venue ID, or content item is required" });
      }
      
      // Verify service or custom venue exists
      if (serviceId) {
        const service = await storage.getProviderServiceById(serviceId);
        if (!service) {
          console.log("[Cart] Service not found for ID:", serviceId);
          return res.status(404).json({ message: "Service not found" });
        }
      }
      
      if (customVenueId) {
        const venue = await storage.getCustomVenue(customVenueId);
        if (!venue) {
          return res.status(404).json({ message: "Custom venue not found" });
        }
        // Verify user owns the custom venue
        if (venue.userId !== userId) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      }
      
      // Resolve slug aliases
      const experienceSlug = rawSlug ? resolveSlug(rawSlug) : "general";

      // Whitelist display metadata for content items (strings only, capped).
      let safeContentMeta: Record<string, string> | undefined;
      if (isContentAdd && contentMeta && typeof contentMeta === "object") {
        safeContentMeta = {};
        for (const key of ["name", "description", "city", "imageUrl"]) {
          const v = (contentMeta as Record<string, unknown>)[key];
          if (typeof v === "string" && v.length > 0) safeContentMeta[key] = v.slice(0, 500);
        }
      }

      const item = await storage.addToCart(userId, {
        serviceId: serviceId || undefined,
        customVenueId: customVenueId || undefined,
        ...(isContentAdd ? { contentType, contentId, contentMeta: safeContentMeta } : {}),
        quantity: quantity || 1,
        tripId,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
        experienceSlug,
      });
      
      res.status(201).json(item);
    } catch (err) {
      console.error("Add to cart error:", err);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Update cart item
  app.patch("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await storage.getCartItemById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { quantity, scheduledDate, notes } = req.body;
      const updated = await storage.updateCartItem(req.params.id, {
        quantity,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove from cart
  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await storage.getCartItemById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.removeFromCart(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Clear cart
  app.delete("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const experienceSlug = req.query.experience as string | undefined;
      await storage.clearCart(userId, experienceSlug);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // Migrate guest cart after login/signup
  app.post("/api/cart/migrate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { guestSessionId } = req.body;
      if (!guestSessionId || typeof guestSessionId !== "string") {
        return res.status(400).json({ message: "guestSessionId is required" });
      }
      const result = await storage.migrateGuestCart(guestSessionId, userId);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("Cart migration error:", err);
      res.status(500).json({ message: "Failed to migrate cart" });
    }
  });

  // Convert content cart items into itinerary items
  app.post("/api/cart/convert-to-itinerary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { tripId, newTripName, destination, cartItemIds } = req.body;

      if (!cartItemIds || !Array.isArray(cartItemIds) || cartItemIds.length === 0) {
        return res.status(400).json({ message: "cartItemIds is required and must be a non-empty array" });
      }

      let targetTripId: string = tripId;

      if (!targetTripId) {
        if (!newTripName || typeof newTripName !== "string") {
          return res.status(400).json({ message: "Either tripId or newTripName is required" });
        }
        const today = new Date();
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const newTrip = await storage.createTrip({
          title: newTripName.trim(),
          destination: (destination || "To be determined").trim(),
          startDate: today.toISOString().split("T")[0],
          endDate: nextWeek.toISOString().split("T")[0],
          status: "draft",
          userId,
          adults: 2,
          kids: 0,
          numberOfTravelers: 1,
        } as any);
        targetTripId = newTrip.id;
      } else {
        const trip = await storage.getTrip(targetTripId);
        if (!trip) return res.status(404).json({ message: "Trip not found" });
        if (trip.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      }

      let convertedCount = 0;
      for (const cartItemId of cartItemIds) {
        const cartItem = await storage.getCartItemById(cartItemId);
        if (!cartItem) continue;
        if (cartItem.userId !== userId) continue;
        if (!cartItem.contentId || !cartItem.contentType) continue;

        const meta: Record<string, any> = cartItem.contentMeta || {};
        const rawPrice = meta.price ? String(meta.price).replace(/[^0-9.]/g, "") : null;
        const estimatedCost = rawPrice && parseFloat(rawPrice) > 0 ? rawPrice : null;

        await storage.createItineraryItem({
          tripId: targetTripId,
          title: meta.name || cartItem.contentId || "Discovered item",
          description: meta.description || null,
          itemType: cartItem.contentType === "hotel" ? "accommodation" : "activity",
          dayNumber: 1,
          locationName: meta.city || meta.location || null,
          notes: cartItem.notes || null,
          suggestedBy: "user",
          status: "planned",
          isFlexible: true,
          estimatedCost,
        } as any);

        await storage.removeFromCart(cartItemId);
        convertedCount++;
      }

      res.json({ tripId: targetTripId, convertedCount });
    } catch (err) {
      console.error("Convert to itinerary error:", err);
      res.status(500).json({ message: "Failed to convert items to itinerary" });
    }
  });

  // === Checkout & Auto-Contract Generation ===

  // Get contract details
  app.get("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const contract = await storage.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    res.json(contract);
  });

  // === Itinerary Comparison & Optimization Routes ===

  app.post("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { userExperienceId, tripId, title, destination, startDate, endDate, budget, travelers, baselineItems: inlineBaselineItems, experienceTypeSlug } = req.body;

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
          budget: budget != null && !isNaN(Number(budget)) ? String(budget) : null,
          travelers: travelers || 1,
          experienceTypeSlug: experienceTypeSlug || null,
          status: "generating",
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

      // Trigger AI optimization in background if we have items
      if (baselineItems.length > 0) {
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

        generateOptimizedItineraries(
          comparison.id,
          userId,
          baselineItems,
          availableServices,
          destination || "Unknown",
          formatDate(startDate),
          formatDate(endDate),
          budget ? parseFloat(budget) : undefined,
          travelers || 1
        ).catch((err) => console.error("Background optimization error:", err));
      }

      res.status(201).json(comparison);
    } catch (error) {
      console.error("Error creating comparison:", error);
      res.status(500).json({ message: "Failed to create comparison" });
    }
  });

  app.get("/api/dashboard/trip-scores", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;

      const allComps = await db
        .select({
          tripId: itineraryComparisons.tripId,
          selectedVariantId: itineraryComparisons.selectedVariantId,
          createdAt: itineraryComparisons.createdAt,
        })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.userId, userId))
        .orderBy(desc(itineraryComparisons.createdAt));

      const seenTripIds = new Set<string>();
      const comps = allComps.filter(c => {
        if (!c.tripId || seenTripIds.has(c.tripId)) return false;
        seenTripIds.add(c.tripId);
        return true;
      });

      const variantIds = comps
        .map(c => c.selectedVariantId)
        .filter((v): v is string => !!v);

      const [variants, shares] = await Promise.all([
        variantIds.length
          ? db
              .select({ id: itineraryVariants.id, optimizationScore: itineraryVariants.optimizationScore })
              .from(itineraryVariants)
              .where(inArray(itineraryVariants.id, variantIds))
          : Promise.resolve([]),
        variantIds.length
          ? db
              .select({ variantId: sharedItineraries.variantId, shareToken: sharedItineraries.shareToken })
              .from(sharedItineraries)
              .where(inArray(sharedItineraries.variantId, variantIds))
          : Promise.resolve([]),
      ]);

      const scoreMap = new Map(variants.map(v => [v.id, v.optimizationScore]));
      const tokenMap = new Map(shares.map(s => [s.variantId, s.shareToken]));

      const result = comps
        .filter(c => !!c.tripId)
        .map(c => ({
          tripId: c.tripId!,
          optimizationScore: c.selectedVariantId ? (scoreMap.get(c.selectedVariantId) ?? null) : null,
          shareToken: c.selectedVariantId ? (tokenMap.get(c.selectedVariantId) ?? null) : null,
        }));

      res.json(result);
    } catch (error) {
      console.error("Error fetching trip scores:", error);
      res.status(500).json({ message: "Failed to fetch trip scores" });
    }
  });

  app.get("/api/itinerary-comparisons", heavyReadRateLimit, isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  app.get("/api/itinerary-comparisons/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  app.post("/api/itinerary-comparisons/:id/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const comparisonId = req.params.id;
      const { baselineItems: inlineBaselineItems, feedback: rawFeedback } = req.body;

      // Sprint-1 dislike loop (harvested from the UNMOUNTED trips.routes.ts copy —
      // the router is imported but never app.use()d, so this inline registration
      // is the live one; §9 route-shadow class): whitelisted "what to fix" chips
      // from a re-run flow into TripPreferences.feedback, where
      // selectVariantStrategy gives them top priority over inferred preferences.
      const FEEDBACK_CHIPS = new Set(["too_expensive", "too_packed", "wrong_areas", "wrong_vibe"]);
      const dislikeFeedback: string[] = Array.isArray(rawFeedback)
        ? rawFeedback.filter((f: unknown): f is string => typeof f === "string" && FEEDBACK_CHIPS.has(f)).slice(0, 4)
        : [];

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
          // §13: user-experience items have no rating source — omit, don't invent.
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

      const availableServices = await db
        .select()
        .from(providerServices)
        .where(eq(providerServices.status, "active"))
        .limit(100);

      res.json({ message: "Optimization started", status: "generating" });

      // Build trip preferences for the adaptive variant strategy. Dislike
      // feedback applies even without a trip row (it's an explicit instruction,
      // not an inferred preference).
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

  app.post("/api/itinerary-comparisons/:id/select", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  app.post("/api/itinerary-comparisons/:id/apply-to-cart", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

      // Fire-and-forget: T4 funnel event
      trackFunnelEvent({
        userId,
        eventType: "cart_populated",
        funnelStage: "T4",
      }).catch(() => {});

      res.json({ message: "Cart updated with selected itinerary", itemsAdded: variantItems.length });
    } catch (error) {
      console.error("Error applying to cart:", error);
      res.status(500).json({ message: "Failed to apply itinerary to cart" });
    }
  });

  // === COORDINATION HUB API ROUTES ===

  // Vendor Availability Slots
  app.get("/api/vendor-availability/:serviceId", async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { date } = req.query;
      const slots = await storage.getVendorAvailabilitySlots(serviceId, date as string | undefined);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching availability slots:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.get("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const slots = await storage.getProviderAvailabilitySlots(userId);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching provider availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  app.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const availabilityInput = z.object({
        serviceId: z.string().min(1),
        dayOfWeek: z.number().min(0).max(6).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        date: z.string().min(1),
        isAvailable: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      }).parse(req.body);
      const slot = await storage.createVendorAvailabilitySlot({ ...availabilityInput, providerId: userId });
      res.status(201).json(slot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating availability slot:", error);
      res.status(500).json({ message: "Failed to create availability slot" });
    }
  });

  app.patch("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const updateInput = z.object({
        dayOfWeek: z.number().min(0).max(6).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        date: z.string().optional(),
        isAvailable: z.boolean().optional(),
        notes: z.string().max(500).optional(),
      }).parse(req.body);
      const existingSlot = await storage.getVendorAvailabilitySlot(req.params.id);
      if (!existingSlot) return res.status(404).json({ message: "Slot not found" });
      if (existingSlot.providerId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const slot = await storage.updateVendorAvailabilitySlot(req.params.id, updateInput);
      res.json(slot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating availability slot:", error);
      res.status(500).json({ message: "Failed to update availability slot" });
    }
  });

  app.delete("/api/provider/availability/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existingSlot = await storage.getVendorAvailabilitySlot(req.params.id);
      if (!existingSlot) return res.status(404).json({ message: "Slot not found" });
      if (existingSlot.providerId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteVendorAvailabilitySlot(req.params.id);
      res.json({ message: "Slot deleted" });
    } catch (error) {
      console.error("Error deleting availability slot:", error);
      res.status(500).json({ message: "Failed to delete availability slot" });
    }
  });

  app.post("/api/vendor-availability/:id/book", isAuthenticated, async (req, res) => {
    try {
      const slot = await storage.bookSlot(req.params.id);
      if (!slot) return res.status(404).json({ message: "Slot not found" });
      res.json(slot);
    } catch (error) {
      console.error("Error booking slot:", error);
      res.status(500).json({ message: "Failed to book slot" });
    }
  });

  // Coordination States
  app.get("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const states = await storage.getCoordinationStates(userId);
      res.json(states);
    } catch (error) {
      console.error("Error fetching coordination states:", error);
      res.status(500).json({ message: "Failed to fetch coordination states" });
    }
  });

  app.get("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      res.json(state);
    } catch (error) {
      console.error("Error fetching coordination state:", error);
      res.status(500).json({ message: "Failed to fetch coordination state" });
    }
  });

  app.get("/api/coordination-states/active/:experienceType", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const state = await storage.getActiveCoordinationState(userId, req.params.experienceType);
      res.json(state || null);
    } catch (error) {
      console.error("Error fetching active coordination state:", error);
      res.status(500).json({ message: "Failed to fetch active coordination state" });
    }
  });

  app.post("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const coordInput = z.object({
        experienceType: z.string().min(1).max(100),
        title: z.string().min(1).max(255).optional(),
        status: z.string().max(50).optional(),
        metadata: z.record(z.any()).optional(),
      }).parse(req.body);
      // D-BUDGET(interim): persist the event budget into the existing `budget` jsonb column
      // ({ amount: dollars, currency }). The request carries it as metadata.budget (dollars); the
      // fee reads budget.amount ×100 (GET /fee). NOTE: title/metadata are accepted but map to no
      // columns and are silently dropped by Drizzle — filed known-issue, not fixed here.
      const budgetAmount = Number((coordInput.metadata as any)?.budget);
      const budget = Number.isFinite(budgetAmount) && budgetAmount > 0
        ? { amount: budgetAmount, currency: "USD" }
        : undefined;
      const state = await storage.createCoordinationState({
        ...coordInput,
        userId,
        ...(budget ? { budget } : {}),
      });
      res.status(201).json(state);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating coordination state:", error);
      res.status(500).json({ message: "Failed to create coordination state" });
    }
  });

  app.patch("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const coordUpdateInput = z.object({
        title: z.string().min(1).max(255).optional(),
        status: z.string().max(50).optional(),
        metadata: z.record(z.any()).optional(),
      }).parse(req.body);
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      // D-BUDGET(interim): if the patch carries metadata.budget, persist it to the `budget` column
      // (same { amount: dollars, currency } contract as create).
      const patchBudgetAmount = Number((coordUpdateInput.metadata as any)?.budget);
      const budgetPatch = Number.isFinite(patchBudgetAmount) && patchBudgetAmount > 0
        ? { budget: { amount: patchBudgetAmount, currency: "USD" } }
        : {};
      const updated = await storage.updateCoordinationState(req.params.id, { ...coordUpdateInput, ...budgetPatch });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating coordination state:", error);
      res.status(500).json({ message: "Failed to update coordination state" });
    }
  });

  app.patch("/api/coordination-states/:id/status", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const { status, ...historyEntry } = req.body;
      const updated = await storage.updateCoordinationStatus(req.params.id, status, historyEntry);
      res.json(updated);
    } catch (error) {
      console.error("Error updating coordination status:", error);
      res.status(500).json({ message: "Failed to update coordination status" });
    }
  });

  app.delete("/api/coordination-states/:id", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteCoordinationState(req.params.id);
      res.json({ message: "Coordination state deleted" });
    } catch (error) {
      console.error("Error deleting coordination state:", error);
      res.status(500).json({ message: "Failed to delete coordination state" });
    }
  });

  // Coordination Bookings
  app.get("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const bookings = await storage.getCoordinationBookings(req.params.coordinationId);
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching coordination bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/coordination-states/:coordinationId/bookings", isAuthenticated, async (req, res) => {
    try {
      const bookingInput = z.object({
        itemType: z.string().min(1),
        itemId: z.string().min(1),
        itemName: z.string().min(1).max(255),
        vendorName: z.string().min(1).max(255).optional(),
        serviceType: z.string().max(100).optional(),
        status: z.string().max(50).optional(),
        amount: z.string().optional(),
        scheduledDate: z.string().optional(),
        notes: z.string().max(1000).optional(),
      }).parse(req.body);
      const state = await storage.getCoordinationState(req.params.coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const booking = await storage.createCoordinationBooking({ 
        ...bookingInput, 
        coordinationId: req.params.coordinationId 
      });
      res.status(201).json(booking);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error creating coordination booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.patch("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const bookingUpdateInput = z.object({
        vendorName: z.string().min(1).max(255).optional(),
        serviceType: z.string().max(100).optional(),
        status: z.string().max(50).optional(),
        amount: z.string().optional(),
        scheduledDate: z.string().optional(),
        notes: z.string().max(1000).optional(),
      }).parse(req.body);
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const updated = await storage.updateCoordinationBooking(req.params.id, bookingUpdateInput);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating coordination booking:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  app.post("/api/coordination-bookings/:id/confirm", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      const { bookingReference, confirmationDetails } = req.body;
      const updated = await storage.confirmCoordinationBooking(req.params.id, bookingReference, confirmationDetails);
      res.json(updated);
    } catch (error) {
      console.error("Error confirming booking:", error);
      res.status(500).json({ message: "Failed to confirm booking" });
    }
  });

  app.delete("/api/coordination-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const booking = await storage.getCoordinationBooking(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const state = await storage.getCoordinationState(booking.coordinationId);
      if (!state || state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      await storage.deleteCoordinationBooking(req.params.id);
      res.json({ message: "Booking deleted" });
    } catch (error) {
      console.error("Error deleting booking:", error);
      res.status(500).json({ message: "Failed to delete booking" });
    }
  });

  // ── Event Coordination Extensions (CON-A.P4 / Stage 2) ─────────────────
  // Wire resolveCoordinationFee + buildEventTimeline into the coordination state
  // surface so the frontend can display fee previews and event timelines.

  app.get("/api/coordination-states/:id/fee", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      const eventType = state.experienceType;
      // D-BUDGET(interim): read the event budget from the `budget` jsonb column
      // ({ amount: dollars, currency }), NOT total_estimated_cost (which means *cost*, not budget).
      // Absent/{}/non-positive → 0 → intentional floor-only (max(floor, 8%×0) = floor).
      const budgetDollars = Number((state.budget as any)?.amount);
      const budgetCents = Number.isFinite(budgetDollars) && budgetDollars > 0
        ? Math.round(budgetDollars * 100)
        : 0;

      const fee = await resolveCoordinationFee(eventType, budgetCents);
      res.json(fee);
    } catch (error) {
      console.error("Error resolving coordination fee:", error);
      res.status(500).json({ message: "Failed to resolve coordination fee" });
    }
  });

  app.get("/api/coordination-states/:id/timeline", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      const tripId = state.tripId;
      const eventType = state.experienceType;
      if (!tripId) {
        return res.status(400).json({ message: "No trip linked to this coordination state" });
      }

      const timeline = await buildEventTimeline(tripId, eventType);
      res.json(timeline);
    } catch (error) {
      console.error("Error building event timeline:", error);
      res.status(500).json({ message: "Failed to build event timeline" });
    }
  });

  app.get("/api/coordination-states/:id/vendor-gaps", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      const tripId = state.tripId;
      const eventType = state.experienceType;
      if (!tripId) {
        return res.status(400).json({ message: "No trip linked to this coordination state" });
      }

      const gaps = await getEventVendorGaps(tripId, eventType);
      res.json(gaps);
    } catch (error) {
      console.error("Error getting vendor gaps:", error);
      res.status(500).json({ message: "Failed to get vendor gaps" });
    }
  });

  // ── Expert Coordination State (CON-A.P4 / Stage 2) ───────────────────
  // Experts can read the coordination state for trips they are assigned to.

  app.get("/api/expert/coordination-states/:tripId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      // Verify the expert is assigned to this trip
      const isAssigned = await storage.isExpertAssignedToTrip(req.params.tripId, userId);
      if (!isAssigned) {
        return res.status(403).json({ message: "Not assigned to this trip" });
      }
      // Find the active coordination state for this trip
      const states = await storage.getCoordinationStatesByTripId(req.params.tripId);
      if (!states || states.length === 0) {
        return res.status(404).json({ message: "No coordination state found for this trip" });
      }
      res.json(states[0]);
    } catch (error) {
      console.error("Error fetching expert coordination state:", error);
      res.status(500).json({ message: "Failed to fetch coordination state" });
    }
  });

  // Call seed database
  seedDatabase().catch(err => console.error("Error seeding database:", err));

  // Amadeus Travel API Routes
  
  // Search airport transfers
  const transferSearchSchema = z.object({
    startLocationCode: z.string().min(3).max(4),
    endAddressLine: z.string().optional(),
    endCityName: z.string().optional(),
    endGeoCode: z.object({
      latitude: z.number(),
      longitude: z.number()
    }).optional(),
    transferType: z.string(),
    startDateTime: z.string(),
    passengers: z.union([z.string(), z.number()]).transform((val) => 
      typeof val === 'string' ? parseInt(val, 10) : val
    ),
  });

  // ============ VIATOR API ROUTES ============

  // ============ CACHED DATA WITH LOCATIONS API ============

  // Verify availability before purchase
  const verifyItemSchema = z.object({
    type: z.enum(['hotel', 'activity', 'flight']),
    id: z.string(),
    checkInDate: z.string().optional(),
    checkOutDate: z.string().optional(),
    travelDate: z.string().optional(),
    adults: z.number().optional(),
    rooms: z.number().optional(),
    currency: z.string().optional(),
  });

  const verifyAvailabilitySchema = z.object({
    items: z.array(verifyItemSchema).min(1).max(50),
  });

  // ============ FILTERING AND SORTING API ============

  // Zod schemas for filter validation
  const hotelFilterSchema = z.object({
    cityCode: z.string().max(10).optional(),
    searchQuery: z.string().max(200).optional(),
    priceMin: z.coerce.number().min(0).max(100000).optional(),
    priceMax: z.coerce.number().min(0).max(100000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    preferenceTags: z.string().max(500).optional(),
    county: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    countryCode: z.string().max(5).optional(),
    sortBy: z.enum(['price_low', 'price_high', 'rating', 'popularity', 'newest']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  });

  const activityFilterSchema = z.object({
    destination: z.string().max(200).optional(),
    searchQuery: z.string().max(200).optional(),
    priceMin: z.coerce.number().min(0).max(100000).optional(),
    priceMax: z.coerce.number().min(0).max(100000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    preferenceTags: z.string().max(500).optional(),
    category: z.string().max(100).optional(),
    county: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    countryCode: z.string().max(5).optional(),
    sortBy: z.enum(['price_low', 'price_high', 'rating', 'popularity', 'newest']).optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    offset: z.coerce.number().min(0).default(0),
  });

  // ============ CACHE SCHEDULER ROUTES ============

  // Pre-checkout verification endpoint
  const checkoutVerifySchema = z.object({
    items: z.array(z.object({
      type: z.enum(['hotel', 'activity', 'flight']),
      id: z.string().max(100),
      params: z.object({
        checkInDate: z.string().optional(),
        checkOutDate: z.string().optional(),
        travelDate: z.string().optional(),
        adults: z.number().optional(),
        rooms: z.number().optional(),
        currency: z.string().optional(),
      }).optional(),
    })).max(20),
  });

  // ============ CLAUDE AI ROUTES ============

  // Zod schemas for Claude API validation
  const claudeCartItemSchema = z.object({
    id: z.string().max(100),
    type: z.string().max(50),
    name: z.string().max(500),
    price: z.number().min(0).max(1000000),
    details: z.string().max(1000).optional(),
    metadata: z.object({
      cabin: z.string().max(50).optional(),
      baggage: z.string().max(100).optional(),
      stops: z.number().min(0).max(10).optional(),
      duration: z.string().max(50).optional(),
      airline: z.string().max(100).optional(),
      departureTime: z.string().max(50).optional(),
      arrivalTime: z.string().max(50).optional(),
      refundable: z.boolean().optional(),
      cancellationDeadline: z.string().max(100).optional(),
      boardType: z.string().max(50).optional(),
      nights: z.number().min(0).max(365).optional(),
      checkInDate: z.string().max(20).optional(),
      checkOutDate: z.string().max(20).optional(),
      meetingPoint: z.string().max(500).optional(),
      meetingPointCoordinates: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }).optional(),
      travelers: z.number().min(1).max(100).optional(),
    }).passthrough().optional(),
  });

  const claudeOptimizeSchema = z.object({
    destination: z.string().min(1).max(200),
    startDate: z.string().max(20),
    endDate: z.string().max(20),
    travelers: z.number().min(1).max(100).optional(),
    budget: z.number().min(0).max(10000000).optional(),
    cartItems: z.array(claudeCartItemSchema).max(50),
    preferences: z.object({
      pacePreference: z.enum(['relaxed', 'moderate', 'packed']).optional(),
      prioritizeProximity: z.boolean().optional(),
      prioritizeBudget: z.boolean().optional(),
      prioritizeRatings: z.boolean().optional(),
    }).optional(),
  });

  const claudeTransportSchema = z.object({
    hotelLocation: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().max(500),
    }),
    activityLocations: z.array(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      address: z.string().max(500),
      name: z.string().max(300),
    })).max(20),
  });

  const claudeRecommendationsSchema = z.object({
    destination: z.string().min(1).max(200),
    dates: z.object({
      start: z.string().max(20),
      end: z.string().max(20),
    }),
    interests: z.array(z.string().max(50)).max(20),
  });

  // Generate transport packages for trip segments
  const transportPackageSegmentSchema = z.object({
    id: z.string(),
    type: z.string(),
    from: z.object({ name: z.string(), type: z.string() }),
    to: z.object({ name: z.string(), type: z.string() }),
    date: z.string().optional(),
  });

  const transportPackageRequestSchema = z.object({
    segments: z.array(transportPackageSegmentSchema).min(1),
    destination: z.string().min(1),
    travelers: z.number().int().min(1).default(1),
    tripDays: z.number().int().min(1).default(1),
  });

  // Google Routes API - Multiple transit routes from one origin to many destinations
  const multiTransitSchema = z.object({
    origin: z.object({
      lat: z.number(),
      lng: z.number(),
      name: z.string().optional(),
    }),
    destinations: z.array(z.object({
      id: z.string(),
      lat: z.number(),
      lng: z.number(),
      name: z.string(),
    })),
  });

  // Google Maps Geocoding API - Convert place name to coordinates
  const geocodeSchema = z.object({
    address: z.string().min(1),
  });

  const FALLBACK_COORDINATES: Record<string, { lat: number; lng: number; formattedAddress: string }> = {
    "rome": { lat: 41.9028, lng: 12.4964, formattedAddress: "Rome, Italy" },
    "paris": { lat: 48.8566, lng: 2.3522, formattedAddress: "Paris, France" },
    "london": { lat: 51.5074, lng: -0.1278, formattedAddress: "London, United Kingdom" },
    "tokyo": { lat: 35.6762, lng: 139.6503, formattedAddress: "Tokyo, Japan" },
    "new york": { lat: 40.7128, lng: -74.0060, formattedAddress: "New York, NY, USA" },
    "barcelona": { lat: 41.3874, lng: 2.1686, formattedAddress: "Barcelona, Spain" },
    "bangkok": { lat: 13.7563, lng: 100.5018, formattedAddress: "Bangkok, Thailand" },
    "sydney": { lat: -33.8688, lng: 151.2093, formattedAddress: "Sydney, Australia" },
    "dubai": { lat: 25.2048, lng: 55.2708, formattedAddress: "Dubai, UAE" },
    "marrakech": { lat: 31.6295, lng: -7.9811, formattedAddress: "Marrakech, Morocco" },
    "bali": { lat: -8.3405, lng: 115.0920, formattedAddress: "Bali, Indonesia" },
    "istanbul": { lat: 41.0082, lng: 28.9784, formattedAddress: "Istanbul, Turkey" },
    "lisbon": { lat: 38.7223, lng: -9.1393, formattedAddress: "Lisbon, Portugal" },
    "singapore": { lat: 1.3521, lng: 103.8198, formattedAddress: "Singapore" },
    "los angeles": { lat: 34.0522, lng: -118.2437, formattedAddress: "Los Angeles, CA, USA" },
    "miami": { lat: 25.7617, lng: -80.1918, formattedAddress: "Miami, FL, USA" },
    "amsterdam": { lat: 52.3676, lng: 4.9041, formattedAddress: "Amsterdam, Netherlands" },
    "berlin": { lat: 52.5200, lng: 13.4050, formattedAddress: "Berlin, Germany" },
    "hong kong": { lat: 22.3193, lng: 114.1694, formattedAddress: "Hong Kong" },
    "goa": { lat: 15.2993, lng: 74.1240, formattedAddress: "Goa, India" },
  };

  // === GROK AI INTEGRATION ROUTES ===

  // Expert Matching - Match experts to traveler needs
  const expertMatchSchema = z.object({
    travelerProfile: z.object({
      destination: z.string(),
      tripDates: z.object({
        start: z.string(),
        end: z.string(),
      }),
      eventType: z.string().optional(),
      budget: z.number().optional(),
      travelers: z.number(),
      interests: z.array(z.string()).optional(),
      preferences: z.record(z.any()).optional(),
    }),
    expertIds: z.array(z.string()).optional(),
    limit: z.number().optional().default(5),
  });

  // Content Generation - Generate bio, descriptions, responses
  const contentGenerationSchema = z.object({
    type: z.enum(["bio", "service_description", "inquiry_response", "welcome_message"]),
    context: z.record(z.any()),
    tone: z.enum(["professional", "friendly", "casual"]).optional(),
    length: z.enum(["short", "medium", "long"]).optional(),
  });

  // Real-Time Intelligence - Get current events, weather, trends for destination
  const intelligenceSchema = z.object({
    destination: z.string(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
    topics: z.array(z.enum(["events", "weather", "safety", "trending", "deals"])).optional(),
  });

  // Autonomous Itinerary Generation - Full AI trip planning
  const autonomousItinerarySchema = z.object({
    destination: z.string(),
    dates: z.object({
      start: z.string(),
      end: z.string(),
    }),
    travelers: z.number(),
    budget: z.number().optional(),
    eventType: z.string().optional(),
    interests: z.array(z.string()),
    pacePreference: z.enum(["relaxed", "moderate", "packed"]).optional(),
    mustSeeAttractions: z.array(z.string()).optional(),
    dietaryRestrictions: z.array(z.string()).optional(),
    mobilityConsiderations: z.array(z.string()).optional(),
    tripId: z.string().optional(),
  });

  // AI Quick Start Itinerary - Fetches city intelligence and generates itinerary
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

  app.post("/api/quick-start-itinerary", isAuthenticated, async (req, res) => {
    try {
      const parsed = quickStartItinerarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  // === EXPERT AI TASKS ROUTES ===
  
  // Get expert's AI tasks
  app.get("/api/expert/ai-tasks", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const status = req.query.status as string | undefined;
      
      const tasks = await db.select()
        .from(expertAiTasks)
        .where(status 
          ? and(eq(expertAiTasks.expertId, userId), eq(expertAiTasks.status, status))
          : eq(expertAiTasks.expertId, userId)
        )
        .orderBy(sql`${expertAiTasks.createdAt} DESC`)
        .limit(50);
      
      res.json(tasks);
    } catch (error: any) {
      console.error("Error fetching expert AI tasks:", error);
      res.status(500).json({ message: error.message || "Failed to fetch tasks" });
    }
  });

  // Delegate a task to AI
  const delegateTaskSchema = z.object({
    taskType: z.enum(["client_message", "vendor_research", "itinerary_update", "content_draft", "response_draft"]),
    taskDescription: z.string().min(10, "Task description must be at least 10 characters"),
    clientName: z.string().optional(),
    context: z.record(z.any()).optional(),
  });

  app.post("/api/expert/ai-tasks/delegate", isAuthenticated, async (req, res) => {
    try {
      const parsed = delegateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskType, taskDescription, clientName, context } = parsed.data;

      // Create task in pending status
      const [task] = await db.insert(expertAiTasks).values({
        expertId: userId,
        taskType,
        taskDescription,
        clientName,
        context: context || {},
        status: "in_progress",
      }).returning();

      // Generate AI content based on task type
      const startTime = Date.now();
      try {
        const contentType = taskType === "client_message" ? "inquiry_response" 
          : taskType === "vendor_research" ? "service_description"
          : taskType === "content_draft" ? "bio"
          : "welcome_message";

        const { result, usage } = await grokService.generateContent({
          type: contentType,
          context: {
            taskType,
            clientName,
            description: taskDescription,
            ...context,
          },
          tone: "professional",
          length: "medium",
        });

        const durationMs = Date.now() - startTime;
        const confidence = Math.floor(85 + Math.random() * 10);
        const qualityScore = (8.5 + Math.random() * 1.0).toFixed(1);

        // Update task with result
        const [updatedTask] = await db.update(expertAiTasks)
          .set({
            status: "pending",
            aiResult: result,
            confidence,
            qualityScore,
            tokensUsed: usage.totalTokens,
            costEstimate: usage.estimatedCost.toFixed(6),
            updatedAt: new Date(),
          })
          .where(eq(expertAiTasks.id, task.id))
          .returning();

        // Log AI interaction
        await db.insert(aiInteractions).values({
          taskType: "content_generation",
          provider: "grok",
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCost: usage.estimatedCost.toFixed(6),
          durationMs,
          success: true,
          userId,
          metadata: { expertTaskId: task.id, taskType },
        });

        res.json(updatedTask);
      } catch (aiError: any) {
        // Update task with error
        await db.update(expertAiTasks)
          .set({
            status: "pending",
            aiResult: { error: aiError.message, fallbackContent: "Unable to generate content. Please try again or write manually." },
            confidence: 0,
            updatedAt: new Date(),
          })
          .where(eq(expertAiTasks.id, task.id));

        throw aiError;
      }
    } catch (error: any) {
      console.error("Error delegating task:", error);
      res.status(500).json({ message: error.message || "Failed to delegate task" });
    }
  });

  // Approve/Send a task
  app.post("/api/expert/ai-tasks/:taskId/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskId } = req.params;
      const { editedContent } = req.body;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "completed",
          editedContent: editedContent || null,
          wasEdited: !!editedContent,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error approving task:", error);
      res.status(500).json({ message: error.message || "Failed to approve task" });
    }
  });

  // Reject a task
  app.post("/api/expert/ai-tasks/:taskId/reject", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskId } = req.params;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "rejected",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error rejecting task:", error);
      res.status(500).json({ message: error.message || "Failed to reject task" });
    }
  });

  // Regenerate a task
  app.post("/api/expert/ai-tasks/:taskId/regenerate", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { taskId } = req.params;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Mark as regenerating
      await db.update(expertAiTasks)
        .set({ status: "regenerating", updatedAt: new Date() })
        .where(eq(expertAiTasks.id, taskId));

      // Generate new content
      const startTime = Date.now();
      const contentType = task.taskType === "client_message" ? "inquiry_response" 
        : task.taskType === "vendor_research" ? "service_description"
        : task.taskType === "content_draft" ? "bio"
        : "welcome_message";

      const { result, usage } = await grokService.generateContent({
        type: contentType,
        context: {
          taskType: task.taskType,
          clientName: task.clientName,
          description: task.taskDescription,
          previousAttempt: true,
          ...(task.context as object || {}),
        },
        tone: "professional",
        length: "medium",
      });

      const durationMs = Date.now() - startTime;
      const confidence = Math.floor(85 + Math.random() * 10);
      const qualityScore = (8.5 + Math.random() * 1.0).toFixed(1);

      const [updatedTask] = await db.update(expertAiTasks)
        .set({
          status: "pending",
          aiResult: result,
          confidence,
          qualityScore,
          tokensUsed: (task.tokensUsed || 0) + usage.totalTokens,
          costEstimate: (parseFloat(task.costEstimate?.toString() || "0") + usage.estimatedCost).toFixed(6),
          updatedAt: new Date(),
        })
        .where(eq(expertAiTasks.id, taskId))
        .returning();

      // Log AI interaction
      await db.insert(aiInteractions).values({
        taskType: "content_generation",
        provider: "grok",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedCost: usage.estimatedCost.toFixed(6),
        durationMs,
        success: true,
        userId,
        metadata: { expertTaskId: task.id, taskType: task.taskType, regeneration: true },
      });

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error regenerating task:", error);
      res.status(500).json({ message: error.message || "Failed to regenerate task" });
    }
  });

  // Get expert AI stats
  app.get("/api/expert/ai-stats", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const tasks = await db.select()
        .from(expertAiTasks)
        .where(and(
          eq(expertAiTasks.expertId, userId),
          sql`${expertAiTasks.createdAt} >= ${thirtyDaysAgo.toISOString()}`
        ));

      const totalDelegated = tasks.length;
      const completed = tasks.filter(t => t.status === "completed").length;
      const edited = tasks.filter(t => t.wasEdited).length;
      const totalTokens = tasks.reduce((sum, t) => sum + (t.tokensUsed || 0), 0);
      const avgQuality = tasks.filter(t => t.qualityScore).reduce((sum, t, _, arr) => 
        sum + parseFloat(t.qualityScore?.toString() || "0") / arr.length, 0
      );

      // Estimate time saved (assume 10 min per task)
      const timeSavedMinutes = completed * 10;

      res.json({
        tasksDelegated: totalDelegated,
        tasksCompleted: completed,
        completionRate: totalDelegated > 0 ? Math.round((completed / totalDelegated) * 100) : 0,
        timeSaved: Math.round(timeSavedMinutes / 60),
        avgQualityScore: avgQuality.toFixed(1),
        editRate: completed > 0 ? Math.round((edited / completed) * 100) : 0,
        tokensUsed: totalTokens,
      });
    } catch (error: any) {
      console.error("Error fetching AI stats:", error);
      res.status(500).json({ message: error.message || "Failed to fetch stats" });
    }
  });

  // =================================================================
  // PHASE 4: Real-Time Destination Intelligence API
  // =================================================================
  
  // ============================================
  // TRAVELPULSE API - Real-Time Travel Intelligence
  // ============================================
  
  const { travelPulseService } = await import("./services/travelpulse.service");

  // ============================================
  // TRAVELPULSE CITY-LEVEL ENDPOINTS
  // ============================================

  // ============================================
  // TRAVELPULSE AI INTELLIGENCE ROUTES (Admin-only)
  // ============================================

  const { travelPulseScheduler } = await import("./services/travelpulse-scheduler.service");

  // Middleware to check admin role for AI endpoints
  const requireAdmin = async (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const user = await db.select().from(users).where(eq(users.id, req.user?.claims?.sub)).then(r => r[0]);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Global rate limiter for AI endpoints (max 10 refreshes per hour)
  let aiRefreshCount = 0;
  let aiRefreshResetTime = Date.now() + 60 * 60 * 1000;
  
  const checkAIRateLimit = (req: any, res: any, next: any) => {
    if (Date.now() > aiRefreshResetTime) {
      aiRefreshCount = 0;
      aiRefreshResetTime = Date.now() + 60 * 60 * 1000;
    }
    if (aiRefreshCount >= 10) {
      return res.status(429).json({ 
        message: "AI refresh rate limit exceeded. Maximum 10 manual refreshes per hour.",
        resetAt: new Date(aiRefreshResetTime),
      });
    }
    aiRefreshCount++;
    next();
  };

  // FRONTEND TODO: Add a small widget on the admin dashboard that calls GET
  // /api/admin/slow-queries every 60 seconds and shows count + last 5 slow
  // queries in a collapsible panel.

  // GET slow queries — admin only
  app.get("/api/admin/slow-queries", requireAdmin, (req, res) => {
    res.json({
      count: getSlowQueryLog().length,
      threshold: process.env.SLOW_QUERY_THRESHOLD_MS || 500,
      queries: getSlowQueryLog(),
    });
  });

  // DELETE to clear log — admin only
  app.delete("/api/admin/slow-queries", requireAdmin, (req, res) => {
    clearSlowQueryLog();
    res.json({ message: "Slow query log cleared" });
  });

  // GET /api/admin/funnel-stats — event counts per stage for the last 30 days
  app.get("/api/admin/funnel-stats", requireAdmin, async (req, res) => {
    try {
      const result = await db.execute(
        sql`SELECT stage, COUNT(*)::int AS count FROM funnel_events WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY stage ORDER BY stage`
      );
      res.json({ windowDays: 30, stages: result.rows });
    } catch (err) {
      console.error("Funnel stats error:", err);
      res.status(500).json({ message: "Failed to fetch funnel stats" });
    }
  });

  // ============================================
  // GEOCODE HELPER (for map centering)
  // ============================================

  // ============================================
  // LIVE EXPERIENCE SEARCH (Google Places + Platform)
  // Used by the Expert Workspace Browse tab
  // ============================================

  // ============================================
  // VENUE SEARCH API ROUTES
  // Google Places API integration for venues/vendors
  // ============================================

  // ============================================
  // FEVER PARTNER API ROUTES
  // Events and experiences from Fever (feverup.com)
  // ============================================

  // ============ FEVER CACHE ENDPOINTS ============

  // Start the scheduler when routes are registered
  travelPulseScheduler.start();

  // === Logistics Intelligence Layer Routes ===

  // --- Coordination / Participants Routes (using asyncHandler for consistent error handling) ---
  app.get("/api/trips/:tripId/participants", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const participants = await coordinationService.getParticipants(req.params.tripId);
    res.json(participants);
  }));

  app.get("/api/trips/:tripId/participants/stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getParticipantStats(req.params.tripId);
    res.json(stats);
  }));

  app.get("/api/trips/:tripId/participants/payment-stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getPaymentStats(req.params.tripId);
    res.json(stats);
  }));

  app.get("/api/trips/:tripId/participants/dietary", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const dietary = await coordinationService.getDietaryRequirements(req.params.tripId);
    res.json(dietary);
  }));

  app.post("/api/trips/:tripId/participants", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  app.post("/api/trips/:tripId/participants/bulk-invite", isAuthenticated, async (req, res) => {
    try {
      const { emails } = req.body;
      const participants = await coordinationService.bulkInvite(req.params.tripId, emails);
      res.status(201).json(participants);
    } catch (error) {
      res.status(500).json({ message: "Failed to send invites" });
    }
  });

  // --- Vendor Contracts Routes ---
  app.get("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
    try {
      const contracts = await vendorManagementService.getContracts(req.params.tripId);
      res.json(contracts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  app.get("/api/trips/:tripId/contracts/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await vendorManagementService.getContractStats(req.params.tripId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contract stats" });
    }
  });

  app.get("/api/trips/:tripId/contracts/upcoming-payments", isAuthenticated, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const payments = await vendorManagementService.getUpcomingPayments(req.params.tripId, days);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming payments" });
    }
  });

  app.get("/api/trips/:tripId/contracts/overdue", isAuthenticated, async (req, res) => {
    try {
      const overdue = await vendorManagementService.getOverduePayments(req.params.tripId);
      res.json(overdue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch overdue payments" });
    }
  });

  app.post("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
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

  app.patch("/api/contracts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const contract = await vendorManagementService.updateContract(req.params.id, req.body);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to update contract" });
    }
  });

  app.post("/api/contracts/:id/payment", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { amount, milestoneName } = req.body;
      const contract = await vendorManagementService.recordPayment(req.params.id, amount, milestoneName);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  app.post("/api/contracts/:id/milestone", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const contract = await vendorManagementService.addPaymentMilestone(req.params.id, req.body);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to add milestone" });
    }
  });

  app.post("/api/contracts/:id/communication", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const contract = await vendorManagementService.logCommunication(req.params.id, req.body);
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: "Failed to log communication" });
    }
  });

  app.delete("/api/contracts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await vendorManagementService.getContract(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Contract not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await vendorManagementService.deleteContract(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete contract" });
    }
  });

  // --- Budget / Transactions Routes ---
  app.get("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
    try {
      const transactions = await budgetService.getTransactions(req.params.tripId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/trips/:tripId/budget/summary", isAuthenticated, async (req, res) => {
    try {
      const budget = parseFloat(req.query.budget as string) || 0;
      const summary = await budgetService.getBudgetSummary(req.params.tripId, budget);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch budget summary" });
    }
  });

  app.get("/api/trips/:tripId/budget/categories", isAuthenticated, async (req, res) => {
    try {
      const breakdown = await budgetService.getCategoryBreakdown(req.params.tripId);
      res.json(breakdown);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category breakdown" });
    }
  });

  app.get("/api/trips/:tripId/budget/settle-up", isAuthenticated, async (req, res) => {
    try {
      const settleUp = await budgetService.getSettleUpSummary(req.params.tripId);
      res.json(settleUp);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate settle up" });
    }
  });

  app.post("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
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

  app.post("/api/trips/:tripId/transactions/split", isAuthenticated, async (req, res) => {
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

  app.post("/api/trips/:tripId/budget/calculate-split", isAuthenticated, async (req, res) => {
    try {
      const { totalAmount, method, customSplits } = req.body;
      const splits = await budgetService.calculateSplit(req.params.tripId, totalAmount, method, customSplits);
      res.json(splits);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate split" });
    }
  });

  // --- Itinerary Intelligence Routes ---
  // Authoritative GET: requires trip ownership or expert assignment; returns items grouped by day
  app.get("/api/trips/:tripId/itinerary-items", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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

  app.get("/api/trips/:tripId/itinerary/schedules", isAuthenticated, async (req, res) => {
    try {
      const schedules = await itineraryIntelligenceService.getDaySchedules(req.params.tripId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch day schedules" });
    }
  });

  app.get("/api/trips/:tripId/itinerary/analyze", isAuthenticated, async (req, res) => {
    try {
      const analysis = await itineraryIntelligenceService.analyzeItinerary(req.params.tripId);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze itinerary" });
    }
  });

  app.get("/api/trips/:tripId/itinerary/recommendations", isAuthenticated, async (req, res) => {
    try {
      const destination = req.query.destination as string || "destination";
      const recommendations = await itineraryIntelligenceService.getAIRecommendations(req.params.tripId, destination);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });

  // Authoritative POST: requires trip ownership or expert assignment; validates via Zod schema
  app.post("/api/trips/:tripId/itinerary-items", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const userName = (req.user as any).claims.name || "User";
      const { tripId } = req.params;
      const owned = await verifyTripOwnership(tripId, userId);
      const assigned = owned ? true : await storage.isExpertAssignedToTrip(tripId, userId);
      if (!owned && !assigned) return res.status(403).json({ message: "Access denied" });
      const parsed = insertItineraryItemSchema.safeParse({ ...req.body, tripId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const item = await storage.createItineraryItem(parsed.data as any);
      logItineraryChange(tripId, userName, `Added "${item.title}"`, "add", owned ? "owner" : "expert", item.id);

      // If traveler added item and expert is assigned, notify the expert
      if (owned) {
        try {
          const advisors = await db.select().from(tripExpertAdvisors)
            .where(and(
              eq(tripExpertAdvisors.tripId, tripId),
              eq(tripExpertAdvisors.status, "assigned")
            ));

          for (const advisor of advisors) {
            try {
              await storage.createNotification({
                userId: advisor.localExpertId,
                type: 'itinerary_item_added',
                title: 'Trip Item Added',
                message: `"${item.title}" was added to the itinerary.`,
                relatedId: tripId,
                relatedType: 'trip',
                data: {
                  tripId,
                  itemId: item.id,
                  itemTitle: item.title,
                  itemType: item.itemType,
                },
              });
            } catch (err) {
              console.error(`Failed to notify expert ${advisor.localExpertId}:`, err);
            }
          }
        } catch (notifErr) {
          console.error("Failed to notify experts of added item:", notifErr);
        }
      }

      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create itinerary item" });
    }
  });

  app.patch("/api/itinerary-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const userName = (req.user as any).claims.name || "User";
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const item = await itineraryIntelligenceService.updateItem(req.params.id, req.body);
      const changedFields = Object.keys(req.body).filter(k => k !== 'id').join(', ');
      logItineraryChange(existing.tripId, userName, `Updated "${existing.title}" (${changedFields})`, "edit", "owner", req.params.id);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to update itinerary item" });
    }
  });

  app.post("/api/itinerary-items/:id/backup", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { backupItemId } = req.body;
      const item = await itineraryIntelligenceService.setBackupPlan(req.params.id, backupItemId);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to set backup plan" });
    }
  });

  app.post("/api/trips/:tripId/itinerary/reorder", isAuthenticated, async (req, res) => {
    try {
      const userName = (req.user as any).claims.name || "User";
      const { dayNumber, itemIds } = req.body;
      const items = await itineraryIntelligenceService.reorderItems(req.params.tripId, dayNumber, itemIds);
      logItineraryChange(req.params.tripId, userName, `Reordered Day ${dayNumber} activities`, "reorder", "owner");
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder items" });
    }
  });

  app.post("/api/trips/:tripId/itinerary/optimize-order", isAuthenticated, async (req, res) => {
    try {
      const { dayNumber } = req.body;
      const optimizedOrder = await itineraryIntelligenceService.optimizeOrder(req.params.tripId, dayNumber);
      res.json({ optimizedOrder });
    } catch (error) {
      res.status(500).json({ message: "Failed to optimize order" });
    }
  });

  app.post("/api/itinerary/estimate-travel", isAuthenticated, async (req, res) => {
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
  app.post("/api/trips/:tripId/activate-transport", isAuthenticated, async (req, res) => {
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

      const activities: import("./services/transport-leg-calculator").ActivityLocation[] = [];
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

  app.delete("/api/itinerary-items/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const userName = (req.user as any).claims.name || "User";
      const existing = await itineraryIntelligenceService.getItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Itinerary item not found" });
      }
      if (!await verifyTripOwnership(existing.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await itineraryIntelligenceService.deleteItem(req.params.id);
      logItineraryChange(existing.tripId, userName, `Removed "${existing.title}"`, "remove", "owner", req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete itinerary item" });
    }
  });

  // --- Emergency Routes ---
  app.get("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
    try {
      const contacts = await emergencyService.getContacts(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });

  app.get("/api/trips/:tripId/emergency-contacts/by-type", isAuthenticated, async (req, res) => {
    try {
      const contacts = await emergencyService.getContactsByType(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });

  app.post("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
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

  app.post("/api/trips/:tripId/emergency/initialize", isAuthenticated, async (req, res) => {
    try {
      const { countryCode } = req.body;
      const result = await emergencyService.initializeTripEmergencyInfo(req.params.tripId, countryCode);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize emergency info" });
    }
  });

  app.get("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
      const alerts = await emergencyService.getActiveAlerts(req.params.tripId);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get("/api/trips/:tripId/alerts/summary", isAuthenticated, async (req, res) => {
    try {
      const summary = await emergencyService.getAlertSummary(req.params.tripId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alert summary" });
    }
  });

  app.post("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
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

  // ============ SPONTANEOUS ACTIVITIES & LIVE INTEL ENGINE ============
  
  // PATCH /api/admin/notifications/:id/read — mark a single lead alert as resolved
  app.patch("/api/admin/notifications/:id/read", requireAdmin, async (req, res) => {
    try {
      const notifId = parseInt(req.params.id, 10);
      if (isNaN(notifId)) {
        return res.status(400).json({ message: "Invalid notification id" });
      }
      const [updated] = await db
        .update(adminNotifications)
        .set({ isRead: true })
        .where(eq(adminNotifications.id, notifId))
        .returning();
      if (!updated) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ ok: true, id: updated.id });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to mark notification as read", error: err.message });
    }
  });

  // PATCH /api/admin/notifications/read-all — mark all unread lead alerts as resolved
  app.patch("/api/admin/notifications/read-all", requireAdmin, async (req, res) => {
    try {
      const result = await db
        .update(adminNotifications)
        .set({ isRead: true })
        .where(eq(adminNotifications.isRead, false))
        .returning();
      res.json({ success: true, updated: result.length });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to mark all notifications as read", error: err.message });
    }
  });

  // GET /api/trips/:tripId/expert-request-status — traveler polls this to show
  // fallback message when their lead could not be auto-assigned
  app.get("/api/trips/:tripId/expert-request-status", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const { tripId } = req.params;
      const rows = await db
        .select({
          id: expertRequests.id,
          status: expertRequests.status,
          assignedExpertId: expertRequests.assignedExpertId,
          fallbackMessage: expertRequests.fallbackMessage,
          createdAt: expertRequests.createdAt,
          assignedAt: expertRequests.assignedAt,
        })
        .from(expertRequests)
        .where(eq(expertRequests.tripId, tripId))
        .orderBy(desc(expertRequests.createdAt))
        .limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ message: "No expert request found for this trip" });
      }
      res.json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch expert request status", error: error.message });
    }
  });

  // Register AI Discovery routes
  await registerDiscoveryRoutes(app);

  return httpServer;
}
