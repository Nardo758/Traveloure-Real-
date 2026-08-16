import type { Express, RequestHandler } from "express";
import express from "express";
import { randomBytes } from "node:crypto";
import { getUserId } from "./utils/auth";
import * as messagingService from "./services/messages.service";
import { checkMessageRateLimit } from "./infrastructure/message-rate-limiter";
import { broadcastToUser } from "./websocket";
import { validateImageDataUrl } from "./utils/imageValidation";
import type { Server } from "http";
import { adminRateLimit, aiRateLimit, leadRoutingRateLimit, heavyReadRateLimit } from "./middleware/rateLimiter";
import { getSlowQueryLog, clearSlowQueryLog } from "./utils/queryTimer";
import { redactTemplateContent } from "./utils/template-content-gate";
import { extractServiceLocation, ServiceLocationError } from "./utils/service-location";
import { deriveCityPatch } from "./utils/service-city";
import { trackFunnelEvent } from "./utils/funnelTracker";
import fs from "fs";
import path from "path";
import { storage, type BookingStatusNotification } from "./storage";
import {
  materializeServiceAvailability,
  materializeDateRangeAvailability,
  repriceDateRangeAvailability,
  DATE_RANGE_MAX_NIGHTS,
  nightDatesInclusive,
} from "./services/availability-materializer.service";
import { api } from "@shared/routes";
// Ledger 90 (FP-5, X1): the ONE booking-visibility predicate shared by every console surface —
// see shared/booking-visibility.ts for why three tabs disagreed about one row.
import { isActionableBooking, isProvisionalBooking } from "@shared/booking-visibility";
import { IDENTITY_EDIT_FIELDS } from "@shared/edit-split";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated, setupFacebookAuth, setupEmailAuth } from "./replit_integrations/auth";
import { isExpert, isProvider, isEarner } from "./middleware/role-rbac";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { 
  users, helpGuideTrips, touristPlaceResults, touristPlacesSearches, 
  aiBlueprints, vendors, insertVendorSchema,
  insertLocalExpertFormSchema, insertServiceProviderFormSchema,
  insertProviderServiceSchema, insertServiceCategorySchema,
  insertServiceSubcategorySchema, insertFaqSchema,
  insertServiceTemplateSchema, insertServiceBookingSchema, createBookingRequestSchema, insertServiceReviewSchema,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  userExperienceItems, userExperiences, providerServices, cartItems, trips,
  serviceBookings, serviceReviews, notifications, serviceProviderForms,
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
  bundleComponents,
  deliverableDownloads,
  resolveBookingMode,
} from "@shared/schema";
import {
  TAB_CONTENT_TYPE_MAP,
  TAB_AFFILIATE_CATEGORIES,
  SURFACE_DEFAULT_CONTENT_TYPES,
  SURFACE_DEFAULT_AFFILIATE_CATEGORIES,
  SURFACE_SLUGS,
} from "@shared/content-surface-map";
import { db } from "./db";
import { getPlatformFlag, FLAG_MAINTENANCE_MODE } from "./services/platform-flags";
import { applyPropertyLocationPrivacy } from "./services/property-location-privacy.service";
import { filterOutAwayOwners } from "./services/content-query.service";
import { resolveMissingItemCoordinates } from "./services/trip-plan.service";
import { eq, and, or, ilike, sql, desc, count, ne, inArray, asc, isNull } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { scoreKnowledgeProof, KNOWLEDGE_PROOF_QUESTIONS, type KnowledgeProofAnswerInput } from "./services/expertise-scoring.service";
// W2 (Trip-Canon Lane 1 Phase 1b): `cart_items` has exactly ONE writer — the projection module.
// Every cart write below goes through `cartProjection.*`; the functions are thin passthroughs to
// the storage layer, so behavior is identical to the pre-funnel code. Do not call
// storage.addToCart / updateCartItem / removeFromCart / clearCart / migrateGuestCart /
// replaceUserCartWithVariantItems directly from a route again, and never `db.insert(cartItems)`.
import * as cartProjection from "./services/cart-projection.service";
import { generateOptimizedItineraries, getComparisonWithVariants, selectVariant, type FixedCommitment, type TripPreferences } from "./itinerary-optimizer";
// Lane 5b: the Trip is the optimizer's baseline. Single expression of the ratified read-set.
import { loadTripOptimizerInputs } from "./services/optimizer-baseline.service";
import messagesRouter from "./routes/messages";
import { availableAtFor } from "./config/earnings-hold.config";
import { aiOrchestrator } from "./services/ai-orchestrator";
import { grokService } from "./services/grok.service";
import { draftServiceTranslation, isContentLocale, effectiveSourceLocale, CONTENT_LOCALES } from "./services/service-translation.service";
import { resolveCoverageGaps, resolveDemandBuckets, MIN_DEMAND_SIGNAL } from "./services/market-insights.service";
import { aiGeneratedItineraries, localExpertForms, expertAiTasks, aiInteractions, travelPulseTrending, travelPulseCities, travelPulseHappeningNow, serviceCategories, visaRequirementsCache, expertServiceOfferings, expertServiceCategories, cityNeighborhoods, travelPulseHiddenGems, providerNeighborhoodCoverage, expertTemplates } from "@shared/schema";
import { coordinationService } from "./services/coordination.service";
import { vendorManagementService } from "./services/vendor-management.service";
import { budgetService, BudgetValidationError } from "./services/budget.service";
import { itineraryIntelligenceService } from "./services/itinerary-intelligence.service";
import { emergencyService } from "./services/emergency.service";
import { aiUsageService } from "./services/ai-usage.service";
import { complexityTier, buildAnchorPromptBlock, validateAnchorConflicts } from "./services/smart-sequencing.service";
import { getFee, resolveCoordinationFee, getAvailableCoordinationCreditCents, claimCoordinationCredit, releaseCoordinationCredit } from "./services/optimization-fee.service";
import { buildEventTimeline, getEventVendorGaps } from "./services/event-coordination.service";
import { trackAnthropicResponse } from "./services/ai-cost-tracker";
import { sanitizeAiContentFailure } from "./utils/ai-error-sanitizer";
import { revenueTrackingService } from "./services/revenue-tracking.service";
import { experienceTypes as experienceTypesTable, coordinationStates, coordinationFeeCredits, platformRevenue } from "@shared/schema";
import { isExpertRole, isProviderRole } from "@shared/roles";
import { isArtifactDelivery, SESSION_END_METHODS } from "@shared/service-fundamentals";
import { resolvePublishVerification } from "./services/publish-verification.service";
import Stripe from "stripe";
import { getStripeSecretKey } from "./utils/stripe-key";
import { sharedCache } from "./services/shared-cache.service";
import { vaultAndStripItems } from "./services/affiliate-url-vault.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo, pickPublicFields, EXPERT_APPLICATION_PUBLIC_FIELDS, omitFields } from "./utils/data-sanitizer";
import { sanitizeDeep } from "./utils/text-sanitizer";
import { normalizeDeclineReason } from "./utils/normalize-decline-reason";
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
import transportLegsRoutes from "./routes/transport-legs.routes";
import plancardRoutes from "./routes/plancard.routes";
import optimizationRoutes from "./routes/optimization.routes";
import conciergeRoutes from "./routes/concierge.routes";
import upsellRoutes from "./routes/upsell.routes";
import tripsRoutes from "./routes/trips.routes";
import advisorRoutes from "./routes/advisor.routes";
import demandRoutes from "./routes/demand.routes";
import providerListingHealthRoutes from "./routes/provider-listing-health.routes";
import serviceAttestationsRoutes from "./routes/service-attestations.routes";
import marketsRoutes from "./routes/markets.routes";
import adminMarketsRoutes from "./routes/admin-markets.routes";
import { dedupedRequest, callWithCircuitBreaker } from "./utils/requestDeduplication";
import adminRoutes from "./routes/admin.routes";
import { insertAccessAuditLog } from "./services/admin-query.service";
import expertsRoutes from "./routes/experts.routes";
import eaRoutes from "./routes/ea.routes";
import providerRoutes from "./routes/provider.routes";
import storefrontRoutes from "./routes/storefront.routes";
import travelerProfileRoutes from "./routes/traveler-profile.routes";
import vacationRoutes from "./routes/vacation.routes";
import offeringRequestRoutes from "./routes/offering-requests.routes";
import reviewRepliesRoutes from "./routes/review-replies.routes";
// Sibling's statements router (mockup §06e) — landed on disk during this session; mounted here
// per the file-ownership split (sibling owns statements.routes.ts + provider/earnings.tsx only).
import statementsRoutes from "./routes/statements.routes";
import shortLinksRoutes from "./routes/short-links.routes";
import readyMadeRoutes from "./routes/ready-made.routes";
import expertConsoleRoutes from "./routes/expert-console.routes";
import calendarRoutes from "./routes/calendar.routes";
import customersRoutes from "./routes/customers.routes";
import contentRoutes, { seedDatabase, registerDiscoveryRoutes } from "./routes/content.routes";
import paymentsRoutes, { resolveItemBaseAmount, resolveCartSurcharges, resolveStayNightlyRates } from "./routes/payments.routes";
import crossSellRoutes from "./routes/cross-sell.routes";
import expertWorkspaceRoutes from "./routes/expert-workspace.routes";
import { createDMOCrawler } from "./content/scrapers/DMOCrawler";
import { ALL_DMO_SOURCES, getMarketGapSummary } from "./content/providers/DMOSourceRegistry";
import savedItemsRoutes from "./routes/saved-items.routes";
import serviceRequestsRoutes from "./routes/service-requests.routes";
import tripContextRoutes from "./routes/trip-context.routes";
import planActivityRoutes from "./routes/plan-activity.routes";
import routingRoutes from "./routes/routing.routes";
import guestInvitesRoutes from "./routes/guest-invites";
import shareImagesRoutes from "./routes/share-images.routes";
import promoTextRoutes from "./routes/promo-text.routes";
import paymentMethodsRoutes from "./routes/payment-methods.routes";
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
import { sanitizeText } from "./utils/text-sanitizer";
import { sanitizeStringFields } from "./utils/text-sanitizer";

// ─── Commission constants & resolver (canonical source: server/services/commission.ts) ─
import {
  resolveExpertSharePct,
  PROCESSING_FEE_RATE,
  resolveCommissionRates,
  calcInsuranceFee,
  getConciergeBookingRate,
  resolveServiceOwnerShareRate,
  type CommissionRates,
} from "./services/commission";
// 1C direct-lane repoint (docs/DECISIONS.md ruling 69 disposition 6) — the cart quote must price a
// direct provider line through the same D1 resolver /api/checkout charges it through.
import {
  resolveDirectProviderRate,
  pickOwnerShareRate,
} from "./services/direct-charge-rate.service";
// SS-5a attestation publish gate (docs/DECISIONS.md ruling 69 disposition 3) — beside the F2
// verification gate at the same three choke points; grandfathering is the transition condition.
import {
  resolveAttestationShape,
  readAffirmAttestationsField,
  validateAffirmKeys,
  checkAttestationPublishGate,
} from "./services/attestation-publish-gate.service";
// SS-5c protected-title soft warning (ruling 69 disposition 5) — advisory only, never a block.
import { detectProtectedTitleClaims } from "@shared/service-attestations";
import { calculateCommission, BookingType } from "./utils/commissionCalculator";
import { ensureDefaultBookingFeeConfig } from "./services/booking-fee-bootstrap";
// Ready-made authoring mode (brief §2): explicit present-value author check. Never getTripRole.
import { isTripAuthor } from "./utils/trip-authorship";
import { verifyTripOwnership } from "./utils/trip-ownership";
// Canonical per-trip mutation authorization: owner ‖ trip-assigned expert ‖ trip author ‖
// audit-logged admin. Returns null when authorized, else the {status, message} to send.
import { authorizeTripLogistics } from "./utils/trip-logistics-auth";
// Plan-approval mode-flip (migration 164, QA_PUNCH_LIST W2-A item 13): once the customer
// approves a delivered plan, the assigned expert's DIRECT item writes on that trip are refused —
// checked ONLY on the advisor/assigned-expert path, never for the owner or an authored-build author.
import { isPlanApprovedForExpert, PLAN_APPROVED_SUGGEST_INSTEAD_ERROR } from "./utils/plan-approval";

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

// verifyTripOwnership now comes from ./utils/trip-ownership — the shared single source of
// truth (it additionally handles raw-SQL snake_case rows and never throws). The local copy
// this file used to carry was the "duplicate implementation" the role-config map flagged.

/**
 * OWNER-tier gate for per-trip data an assigned expert must NEVER see or write
 * (L20 ratified tier table): money-between-people (transactions / budget / settle-up /
 * split), participant PII (bulk-invite), vendor-contract CREATION, and emergency-contact
 * WRITES. Same principal set as the canonical `authorizeTripLogistics` **minus the
 * assigned-expert branch** — it is deliberately composed from the same three branches the
 * neighbouring owner-gated handlers in this file use, not a new bespoke check:
 *
 *   owner (`verifyTripOwnership`) ‖ trip author (`isTripAuthor`) ‖ admin (audit-logged)
 *
 * A "friend"/participant principal is intentionally absent: no code path mints a
 * `trip_collaborators` friend row and `trip_participants.userId` is left NULL by the only
 * automated writer, so a participant is not an expressible principal today (L20 Part C).
 *
 * Returns `null` when authorized; otherwise the `{status, message}` the route should send.
 */
async function authorizeTripOwnerTier(
  tripId: string,
  userId: string | undefined | null,
  route: string,
): Promise<{ status: number; message: string } | null> {
  if (!userId) return { status: 401, message: "Not authenticated" };

  if (await verifyTripOwnership(tripId, userId)) return null;

  // Authoring mode (ready-made brief §2): the expert who AUTHORS this trip. Explicit named
  // check — deliberately NOT routed through getTripRole (known pre-launch bypass).
  if (await isTripAuthor(tripId, userId)) return null;

  // Admin: allowed, but audit-logged (interim, mirroring authorizeTripLogistics).
  const user = await storage.getUser(userId);
  if (user?.role === "admin") {
    console.log(
      `[audit] admin cross-trip owner-tier access actor=${userId} route=${route} tripId=${tripId}`,
    );
    return null;
  }

  return { status: 403, message: "Not authorized to access this trip" };
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

// F2 publish-verification gate (role-aware; ratified Aug 10 2026 — see QA_PUNCH_LIST.md P0).
// Shared by POST /api/provider/services, PATCH /api/provider/services/:id, PATCH
// /api/expert/services/:id/status (target "active"), and admin approval (server/routes/
// admin.routes.ts) — every publish-adjacent enforcement point resolves through the SAME
// predicate so the two call sites this gate originally had cannot drift the way they did
// before this fix (be78a9c introduced two hand-copied, provider-only checks that also
// blocked every expert), and so the P0 class (gate correct but unreachable through the
// paths that actually go live) cannot recur.
//
// The branch logic itself lives in ONE place: resolvePublishVerification
// (server/services/publish-verification.service.ts). This function only shapes that
// result into the 403 body/message pair, keeping the existing wire format (and the 11
// f2-verification-gate.http proofs) unchanged.
//
// Role is resolved with a DB lookup on the session user id inside the resolver — the same
// pattern `requireAdmin` uses (server/routes.ts ~:8861) — never `req.user.role`/
// `req.user.claims.role`, which is a stale session snapshot (CLAUDE.md §2).
// Returns null when the caller may proceed; otherwise the exact { status, body } to send.
async function checkPublishVerificationGate(
  userId: string
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const verification = await resolvePublishVerification(userId);
  if (verification.ok) return null;

  if (isProviderRole(verification.role)) {
    return {
      status: 403,
      body: {
        message: "Identity and business verification must be complete before publishing an offering. Complete verification in your provider status page.",
        code: "VERIFICATION_GATE",
        identityVerified: verification.identityVerified,
        businessVerified: verification.businessVerified,
      },
    };
  }

  if (isExpertRole(verification.role)) {
    return {
      status: 403,
      body: {
        message: "Identity verification must be complete before publishing an offering. Complete verification in your expert status page.",
        code: "VERIFICATION_GATE",
        identityVerified: verification.identityVerified,
        businessVerified: null, // not applicable — experts have no business-verification check
      },
    };
  }

  // Role in neither family (executive_assistant, plain user, unknown) — default-deny.
  return {
    status: 403,
    body: {
      message: "Identity verification must be complete before publishing an offering.",
      code: "VERIFICATION_GATE",
      identityVerified: false,
      businessVerified: null,
    },
  };
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

// Sanitize all string fields in a plain object, including every nested array and object.
// Delegates to the exported, tested sanitizeDeep (server/utils/text-sanitizer.ts) so that
// the recursion is exercised by unit tests independently of this route module.
function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  return sanitizeDeep(obj) as T;
}

// Note: knowledgeProofAnswers[].answer is sanitized by sanitizeObject (via sanitizeDeep),
// which recurses into JSONB arrays and objects and applies sanitizeText to every nested string.
// The unit tests in server/utils/__tests__/text-sanitizer.test.ts verify this path explicitly.

// Migration 151 (§17 Product Builder): bundle_components.component_service_id is
// ON DELETE RESTRICT — a service that sits inside a bundle cannot be deleted until it is
// removed from the bundle. Postgres surfaces that as FK violation 23503; translate it into
// an honest 409 naming the containing bundle(s) instead of an opaque 500. Returns true
// when the response was sent (the error was this case), false to fall through.
async function respondIfServiceInBundle(err: any, serviceId: string, res: any): Promise<boolean> {
  const code = err?.code ?? err?.cause?.code;
  if (code !== "23503") return false;
  const rows = await db
    .select({ serviceName: providerServices.serviceName })
    .from(bundleComponents)
    .innerJoin(providerServices, eq(bundleComponents.bundleServiceId, providerServices.id))
    .where(eq(bundleComponents.componentServiceId, serviceId));
  // A 23503 from some other referencing table (not bundle membership) falls through.
  if (rows.length === 0) return false;
  res.status(409).json({
    message: "This service is part of a bundle — remove it from the bundle(s) before deleting it.",
    bundles: rows.map((r) => r.serviceName),
  });
  return true;
}

// ── Lane 5b: the honest dead-end when a signed-in caller's TRIP has nothing to optimize ─────
// The optimizer reads the Trip now (docs/briefs/L5-optimizer-repoint-brief.md, ratified
// Jul 31 2026). A user who built a cart signed-out, signed up, and hit Optimize has a full cart
// and an empty trip. Silently reading their cart instead would rebuild exactly the dual-source
// ambiguity the reconcile dissolved, so the server says so specifically and points at the real
// fix — `POST /api/cart/convert-to-itinerary` (W3-fixed) materialises the cart onto the trip.
//
// The `cart_items` touch here is an EXISTENCE PROBE, not a baseline read: it selects one id, joins
// nothing, and its result can only ever choose between two error/no-op paths — it never reaches
// the optimizer. The cart⋈provider_services baseline read is guest-only (see the create handler).
// Convention mirrors `respondIfServiceInBundle` above: returns true when the response was sent.
async function respondIfCartAwaitsConversion(userId: string, res: any): Promise<boolean> {
  const [pending] = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(eq(cartItems.userId, userId))
    .limit(1);
  if (!pending) return false;
  res.status(409).json({
    error: "trip_empty_convert_cart",
    message:
      "There's nothing on this trip to optimize yet, but your cart isn't empty. Add your cart to the trip first, then run the optimization.",
  });
  return true;
}

// ── Lane 5a Defect 1: the paid-optimization gate ────────────────────────────────────────────
// HARVESTED per §9 from the mount-order-dead twin that lived in `server/routes/trips.routes.ts`
// (that copy carried the gate; this inline copy wins the path race and did NOT, so the costly
// `generateOptimizedItineraries` LLM run was free to anyone authenticated). The twin's colliding
// `POST /api/itinerary-comparisons` handler is deleted in the same change — no born-dead duplicate.
//
// §14: every input to the decision is server-derived — the event type comes from the trip/experience
// row, the required amount from `getFee` (config), and the acting user from the session. The client
// supplies only the PaymentIntent id, which is then verified against Stripe.
const stripeForOptimization = new Stripe(getStripeSecretKey() || "", {
  apiVersion: "2024-12-18.acacia" as any,
});

/** The documented free-re-run window (`/api/optimization-payments` returns `freeRerun` on the same clock). */
const OPTIMIZATION_FREE_RERUN_MS = 24 * 60 * 60 * 1000;

type OptimizationPaymentCheck =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Verify a client-supplied optimization PaymentIntent before the optimizer is allowed to run.
 * Ported verbatim-in-spirit from the dead twin: reuse rejection, concrete target, Stripe
 * `status === 'succeeded'`, PI→user binding, PI type, PI→target binding, and a re-derived
 * fee-vs-PI-amount check (anti-tampering by server-side recompute — never an allow-list of amounts).
 */
async function verifyOptimizationPayment(params: {
  userId: string;
  optimizationPaymentId: string;
  tripId?: string;
  userExperienceId?: string;
}): Promise<OptimizationPaymentCheck> {
  const { userId, optimizationPaymentId, tripId, userExperienceId } = params;

  // Reject reuse: this PI must not already be tied to another comparison.
  const alreadyUsed = await storage.getComparisonByOptimizationPaymentId(optimizationPaymentId);
  if (alreadyUsed) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "payment_already_used",
        message: "This optimization payment has already been used. Please start a new optimization.",
      },
    };
  }

  // Require a concrete target when using a payment.
  if (!tripId && !userExperienceId) {
    return {
      ok: false,
      status: 400,
      body: { error: "target_required", message: "Provide tripId or userExperienceId for paid optimization." },
    };
  }

  try {
    const pi = await stripeForOptimization.paymentIntents.retrieve(optimizationPaymentId);
    if (pi.status !== "succeeded") {
      return { ok: false, status: 402, body: { error: "payment_not_confirmed", message: "Optimization payment has not been confirmed." } };
    }
    if (pi.metadata?.userId && pi.metadata.userId !== userId) {
      return { ok: false, status: 403, body: { error: "payment_belongs_to_another_user" } };
    }
    if (pi.metadata?.type !== "optimization_fee") {
      return { ok: false, status: 402, body: { error: "invalid_payment_type" } };
    }
    // Strict PI-to-target binding: PI metadata target must match the request target.
    const piTargetTrip = pi.metadata?.targetTripId || undefined;
    const piTargetExp = pi.metadata?.targetExperienceId || undefined;
    if (piTargetTrip && piTargetTrip !== tripId) {
      return { ok: false, status: 402, body: { error: "payment_target_mismatch", message: "Payment was issued for a different trip." } };
    }
    if (piTargetExp && piTargetExp !== userExperienceId) {
      return { ok: false, status: 402, body: { error: "payment_target_mismatch", message: "Payment was issued for a different experience." } };
    }
    // Re-derive the expected fee from the actual resource (not PI metadata), through the single
    // fee resolver so admin event-type overrides pass validation (§8 — no rate/amount literals here).
    const actualEventType = tripId
      ? ((await storage.getTripEventType(tripId)) ?? undefined)
      : ((await storage.getExperienceTypeSlugByExperienceId(userExperienceId!)) ?? undefined);
    const actualTier = complexityTier(actualEventType);
    const { priceCents: requiredCents, isDisabled: feeDisabled } = await getFee(actualEventType, actualTier);
    if (feeDisabled) {
      return {
        ok: false,
        status: 402,
        body: { error: "ai_concierge_disabled", message: "AI Concierge is currently disabled for this experience type." },
      };
    }
    if (pi.amount !== requiredCents) {
      return {
        ok: false,
        status: 402,
        body: { error: "payment_amount_mismatch", message: "Payment amount does not match the required fee for this resource." },
      };
    }
    return { ok: true };
  } catch (stripeErr: any) {
    if (stripeErr?.statusCode || stripeErr?.type === "StripeInvalidRequestError") {
      return { ok: false, status: 402, body: { error: "payment_verification_failed", message: stripeErr.message } };
    }
    throw stripeErr;
  }
}

// hint: Logic changed on both sides. Requires understanding intent of each change.
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
      const uid = getUserId(req)!;
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

  // ─── Maintenance mode gate ──────────────────────────────────────────────────
  // When the admin flips the "Maintenance Mode" switch on /admin/system
  // (platform_settings.maintenance_mode = 'true'), block non-admin API access
  // with a 503. Exemptions so the platform stays administrable:
  //   - /api/auth/* and /api/login|logout|callback — admins must be able to sign in
  //   - /api/admin/* — the admin panel itself (adminApiGuard above already
  //     enforces the admin role for this prefix)
  //   - authenticated admins on any route
  // Flag reads are cached (see platform-flags.ts); the role lookup only runs
  // while maintenance mode is active.
  app.use(async (req: any, res: any, next: any) => {
    const p: string = req.path;
    if (!p.startsWith("/api")) return next();
    if (
      p.startsWith("/api/auth") ||
      p.startsWith("/api/login") ||
      p.startsWith("/api/logout") ||
      p.startsWith("/api/callback") ||
      p.startsWith("/api/admin")
    ) {
      return next();
    }
    try {
      const enabled = await getPlatformFlag(FLAG_MAINTENANCE_MODE, false);
      if (!enabled) return next();
      const userId = getUserId(req)!;
      if (userId) {
        const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
        if (user?.role === "admin") return next();
      }
      return res.status(503).json({
        maintenance: true,
        message: "The platform is temporarily down for maintenance. Please try again shortly.",
      });
    } catch (err) {
      // Fail open — a flag/DB read error must not take the whole API down.
      console.error("[maintenance] gate check failed, allowing request:", err);
      return next();
    }
  });

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
    "/api/expert/profile",
    "/api/expert/photo",
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
    "/api/expert/analytics",
    "/api/expert/knowledge-nuggets",
    "/api/expert/assigned-trips",
  ];
  const PROVIDER_SELF_SERVICE_PREFIXES = [
    "/api/provider/verification-status",
    "/api/provider/request-verification-review",
    "/api/provider/dashboard",
    "/api/provider/analytics",
    "/api/provider/earnings",
  ];
  // GAP 1 fix (expert-loop object-flow audit, Jul 30 2026): `/api/provider/services` is CLAUDE.md
  // §5's single shared offering-creation endpoint for BOTH roles (ServiceForm posts here for
  // role="expert" and role="provider" alike) — it does NOT belong under the provider-only
  // PROVIDER_SELF_SERVICE_PREFIXES gate. Kept as its own prefix, gated by `isEarner`
  // (expert-family OR provider OR admin — shared/roles.ts `isEarnerRole`), so the backstop still
  // blocks a plain "user" role but no longer blocks legitimate expert-role writers.
  const EARNER_SELF_SERVICE_PREFIXES = [
    "/api/provider/services",
  ];
  app.use((req: any, res: any, next: any) => {
    if (req.method === "OPTIONS") return next();
    const p: string = req.path;
    const matchesPrefix = (prefixes: string[]) =>
      prefixes.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
    if (matchesPrefix(EARNER_SELF_SERVICE_PREFIXES)) return isEarner(req, res, next);
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

  // ─── Bootstrap booking_fee_configs 'default' row (create-only, never updates) ──
  // Task #1036 / ruling 32: the bootstrap that CREATES the source of truth lives in
  // server/services/booking-fee-bootstrap.ts (surface declaration + clobber-safety
  // documented there; DB-backed test proves it never overwrites admin edits). The
  // one-time legacy 70/30 → 75/25 backfill moved to migration 175.
  (async () => {
    try {
      await ensureDefaultBookingFeeConfig();
    } catch (err) {
      console.warn("[Seed] Could not bootstrap booking_fee_configs:", err);
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

  // Trip-scoped transport legs (§18 L4 "BOTH", migration 154): the engine PROPOSES legs for an
  // expert-built trip, the expert CONFIRMS/EDITS, and only confirmed legs reach traveler surfaces.
  // POST …/generate + PATCH/DELETE …/:legId only — the GET on the same base path is served by the
  // pre-existing live handler in trips.routes.ts (extended in place; §9 no-shadow rule).
  app.use(transportLegsRoutes);

  // PlanCard routes - change tracking, comments, structured day data
  app.use(plancardRoutes);

  // Advisor Phases 2-4: route-efficiency (straight-line optimize-order comparison),
  // stay-anchor (platform-first lodging near the trip's located-item centroid), and on-demand
  // narration (cached per tripId, planHash staleness key). Full paths declared in the router.
  app.use(advisorRoutes);

  // Demand tab / Trending rail / Business Advisor (ratified §10/§11/§12 build, migration 189's
  // append-only demand_signal_events): GET /api/me/demand-signals + POST/GET
  // /api/me/business-advisor. `logDemandSignal` (its named export) is the one writer used by
  // advisor.routes.ts and content.routes.ts.
  app.use(demandRoutes);

  // Market geography (CLAUDE.md §20b): public DB-first read for the client geography layer,
  // and the admin "Add market" flow (paths under /api/admin/markets — §2 blanket requireAdmin
  // on the /api/admin prefix is the auth).
  app.use(marketsRoutes);
  app.use(adminMarketsRoutes);

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
  // NOTE (V.2 ground-truth pass, Jul 26 2026): contentRoutes (mounted above, line 564) ALSO
  // internally mounts identityRoutes/webhooksRoutes at these same paths — so at runtime the
  // contentRoutes copy wins (registration order) and these two lines are the shadowed copy.
  // Left in place deliberately: the unmounted-router guard (scripts/check-unmounted-routers.cjs,
  // CLAUDE.md §9) only recognizes a router as "live" via a direct `import`+`app.use` pair inside
  // server/routes.ts itself — an import from a sibling file under server/routes/ (content.routes.ts
  // importing identity.routes.ts) does NOT satisfy it (by design — that's the guest-invites.ts
  // lesson: a routes file importing a sibling doesn't prove it's actually reachable). Removing this
  // pair trips the guard even though the handlers are genuinely live via contentRoutes. Since both
  // sides mount the exact same router instance, there is no behavioral divergence — just a proof-of-
  // liveness formality the guard requires. Do not remove without also updating the guard.
  app.use("/api/identity", identityRoutes);
  // Webhook handlers for Stripe Identity and Persona — mounted at /api/webhooks
  app.use("/api/webhooks", webhooksRoutes);
  // Admin routes — role-guarded endpoints for platform administration
  app.use(adminRoutes);

  // Executive-Assistant (EA) console — /api/ea/* namespace, guarded by isEA (RBAC)
  app.use(eaRoutes);

  // Provider supply tools — /api/provider/settings (Kyoto-supply activation); provider-role gated
  app.use(providerRoutes);

  // Listing Health (Catalog card meter, §13-deterministic checks). MUST mount before the inline
  // GET /api/provider/services/:id below (~line 2075) — that route greedily matches /health as
  // id="health" and 404s (live-verified), so order is load-bearing here.
  app.use(providerListingHealthRoutes);

  // D9 onboarding attestations (docs/DECISIONS.md ruling 62's D9 clause, executed by ruling 67;
  // migration 197) — GET/POST /api/provider/services/:id/attestations. Mounted in the same slot
  // rule as the health router above: ahead of the inline GET /api/provider/services/:id. The
  // applicable SET is server-derived from the live row on every read AND every write
  // (shared/service-attestations.ts); the body is a §19 allowlist of one field.
  app.use(serviceAttestationsRoutes);

  // Public earner storefront (backoffice Phase 1a/1b) — /p/:handle OG shell + /api/storefront/:handle
  // + PATCH /api/me/handle. Mounted per §9; /p/:handle must register before the Vite catch-all.
  app.use(storefrontRoutes);

  // Traveler profile (WP-A, docs/briefs/OPTIMIZER_SOURCING_BUILD_SPEC.md) — GET/PATCH
  // /api/me/traveler-profile, the `travelerProfile` namespace on the same users.preferences
  // jsonb column /api/me/preferences already uses. Mounted per §9 (unmounted-router guard).
  app.use(travelerProfileRoutes);

  // Vacation mode (provider back-office wave, migration 189, decision-maker ratified Aug 9
  // 2026) — GET/PATCH /api/me/vacation. Business-level flag only; never touches
  // provider_services. Mounted per §9.
  app.use(vacationRoutes);

  // "Don't see your offering?" request flow (mockup §06c, migration 189) — POST
  // /api/me/offering-requests + GET /api/admin/offering-requests (under the §2 blanket
  // adminApiGuard). Mounted per §9.
  app.use(offeringRequestRoutes);

  // Reviews — provider public replies (mockup §06d, migration 190, decision-maker ratified
  // Aug 9 2026) — GET /api/me/reviews + PATCH /api/me/reviews/:id/reply. Mounted per §9.
  app.use(reviewRepliesRoutes);
  // Sibling's statements router (mockup §06e) — mounted per §9; owned/authored by the sibling.
  app.use(statementsRoutes);

  // Short-link + click store (backoffice S3) — POST /api/short-links + GET /r/:code. Mounted per §9.
  app.use(shortLinksRoutes);

  // Ready-Made Trips authoring (Phase 1) — POST /api/expert/ready-made + workspace-context mode
  // resolution. Author auth = explicit authorId check (never getTripRole). Mounted per §9.
  app.use(readyMadeRoutes);
  // Sidebar-audit repair: formerly-dark expert console endpoints (role, ESO service-template
  // catalog, knowledge-nuggets) — ported verbatim out of the unmounted experts.routes.ts (§9).
  app.use(expertConsoleRoutes);
  // Channel Calendar (Console IA PR-Ca C3, §17): GET /api/me/calendar — read-only, session-scoped
  // aggregate over existing tables (slots, bookings, agent requests, store purchases/lifecycle,
  // assigned-trip deliveries). Zero writes. Mounted per §9.
  app.use(calendarRoutes);
  // Customers (Console IA PR-Ca C4, §17 module 6): GET /api/me/customers — read-only,
  // session-scoped honest aggregation over this earner's real bookings / store purchases /
  // assigned trips. No invented CRM fields, zero writes. Mounted per §9.
  app.use(customersRoutes);

  // Saved items / dashboard Wishlist — GET/POST/DELETE /api/saved-items (session-scoped, owner-gated).
  // Was imported-but-unmounted, so the dashboard Wishlist hit the Vite catch-all and never loaded;
  // mounting restores it (caught by the unmounted-router guard). Routes carry full /api paths.
  app.use(savedItemsRoutes);

  // Traveler service requests ("request a service that doesn't exist yet"):
  // POST/GET /api/service-requests (session-scoped) + /api/admin/service-requests
  // (inherits the blanket adminApiGuard registered above). New table, migration 123.
  app.use(serviceRequestsRoutes);
  app.use(tripContextRoutes);
  // "While you were away" digest (Console Realign R-H, Lane E7): GET /api/me/plan-activity —
  // read-only, session-scoped, cross-trip read of item_transition_log for non-traveler actors
  // (expert/agent/checkout). Zero writes. Mounted per §9.
  app.use(planActivityRoutes);

  // Per-item routing transitions (Trip-Canon Lane 1 W1, Phase 1b):
  // POST /api/trips/:tripId/items/:itemId/route — the four traveler/expert edges of the
  // ROUTING_STATE_CONTRACT §1 machine. `purchased` is refused (checkout-only) and the
  // reversal off it is refund-only. Role enforcement is IN CODE per contract §4:
  // →ready_for_checkout is trip-owner-only (purchase intent is traveler-only), →with_expert
  // is owner-only, →in_planning is owner OR the assigned expert when the item currently sits
  // in with_expert (the single expert-WRITES cell). Owner resolution deliberately avoids
  // getTripRole (scope §4). A successful flip reconciles the W2 cart projection.
  // NO PATH COLLISION: no other router or inline handler registers /api/trips/:tripId/items/*
  // (the itinerary family lives at /api/trips/:tripId/itinerary-items) — §9 no-shadow rule.
  app.use(routingRoutes);

  // Guest-invite system (destination weddings/events): organizer invite management
  // (session-authenticated + experience-ownership-gated, §14) and public token-based
  // guest RSVP/origin/travel-plan endpoints (rate-limited; scoped to the token's own
  // invite row; parent experience redacted to guest-safe fields). Was a never-imported
  // dark file (the class the never-imported-router guard now catches) — A0 activation.
  app.use(guestInvitesRoutes);

  // SH1 share-image render pipeline: public GET /api/share-image/service/:id.png?format=feed|story
  // + GET /api/share-image/review/:id.png (satori -> SVG -> @resvg/resvg-js PNG). Data is loaded +
  // F2/REV-MOD-gated in the router; the render itself is pure in share-image.service.ts. Mounted
  // per §9.
  app.use(shareImagesRoutes);

  // Phase A3: GET /api/promo-text — shared server-side caption generation (AI best-effort,
  // deterministic fallback) for the service/ready_made/storefront distribution lanes. Session-
  // authenticated + owner-verified (§14). Mounted per §9.
  app.use(promoTextRoutes);

  // FP-1 frictionless payments: saved-card management (GET/POST/DELETE /api/me/payment-methods*).
  // Session-scoped; cards live only in Stripe's vault. Mounted per §9.
  app.use(paymentMethodsRoutes);

  // Trips + Itinerary-Comparison Routes — was imported at line 95 but never mounted
  // NOTE (§9 shadow fix): tripsRoutes is mounted LAST (just before `return httpServer`),
  // NOT here. 57 of its handlers duplicate inline registrations below that are the
  // documented-canonical, battle-tested copies (they carry divergent auth models +
  // side-effects like expert-notify-on-add that the router copies lack). Mounting the
  // router HERE (before the inline routes) silently made the stale router copies win for
  // core trip CRUD / generate-itinerary / itinerary-comparisons / budget+transactions.
  // Mounting it AFTER the inline routes lets the canonical inline copies win those 57
  // paths, while the router still serves its 32 UNIQUE (consumer-backed) endpoints
  // (anchors, transport-legs, itinerary-share, expert-review, logistics, …). The full
  // delete-the-57-duplicates sweep is filed (needs per-handler auth-model reconciliation).

  // Expert routes — role management, service templates, vendor coordination, constraints,
  // provider blackout dates, assigned trips, knowledge nuggets, visa info, and more.
  // Imported at line 98 but previously unmounted; mounting restores all /api/expert/* and
  // /api/provider/blackout-dates endpoints for live consumers.
  app.use(expertsRoutes);

  // Cross-sell event tracking — POST /api/cross-sell-events (anonymous/auth),
  // GET /api/cross-sell-events/provider-stats (auth), GET /api/admin/cross-sell/funnel (admin).
  // Imported at line 103 but previously unmounted; mounting restores provider analytics
  // and admin cross-sell funnel pages.
  app.use(crossSellRoutes);

  // Trips Routes (inline — superseded by tripsRoutes mount above; kept as-is per task scope)
  // GET /api/trips — list trips (auth only, since guests access via shareToken)
  app.get(api.trips.list.path, isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const status = req.query.status as string | undefined;
    const trips = await storage.getTrips(userId, status);
    res.json(trips);
  });

  // GET /api/trips/:id — handled by tripsRoutes (trips.routes.ts), which owns the canonical
  // handler with IDOR logging, 403 for non-owners, and expertWorkspaceStatus enrichment.
  // The previous inline duplicate here shadowed that handler and suppressed security logging;
  // it has been removed so the tripsRoutes registration (mounted above) wins. See task fix.

  // POST /api/trips — create a trip (guest or authenticated)
  // Guests get null userId; authenticated users get their userId.
  // Guests receive a shareToken to access the trip until sign-up.
  app.post(api.trips.create.path, async (req, res) => {
    try {
      // Trip-defaults consistency fix: insertTripSchema defaults numberOfTravelers to 1 and
      // adults to 2 independently, so an omitted numberOfTravelers produced an incoherent
      // freshly-created trip (1 traveler, 2 adults). When the caller didn't explicitly send
      // numberOfTravelers, derive it from adults+kids instead of taking the schema's static
      // default, mirroring the numberOfTravelers===adults convention already used at the other
      // trip-creation call sites (cart-to-itinerary conversion, quick-start itinerary).
      const numberOfTravelersProvided =
        req.body?.numberOfTravelers !== undefined && req.body?.numberOfTravelers !== null && req.body?.numberOfTravelers !== "";
      const input = api.trips.create.input.parse(req.body);
      // Sanitize string inputs to prevent XSS
      const sanitizedInput = sanitizeObject(input);
      if (!numberOfTravelersProvided) {
        sanitizedInput.numberOfTravelers = sanitizedInput.adults + (sanitizedInput.kids ?? 0);
      }

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

      // Fire-and-forget: T2 funnel event
      trackFunnelEvent({
        userId: userId || undefined,
        tripId: trip.id,
        eventType: "trip_created",
        funnelStage: "T2",
      }).catch(() => {}); // fire-and-forget funnel event — never blocks trip creation

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

      const userId = getUserId(req)!;
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
    
    const userId = getUserId(req)!;
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

      const userId = getUserId(req)!;
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

  // REMOVED (Lane 2a): the hardcoded 2-day "Visit City Center" stub that served
  // POST /api/trips/generate-itinerary. It had zero client producers (whole-repo grep),
  // and returned fake fixed content. Real generation lives at the two AI paths:
  //   • POST /api/trips/:id/generate-itinerary  (Claude, below)
  //   • POST /api/ai/generate-itinerary          (Grok, content.routes.ts)
  // A duplicate copy in trips.routes.ts was deleted in the same change.

  app.post(api.trips.generateItinerary.path, isAuthenticated, async (req, res) => {
    try {
      const trip = await storage.getTrip(req.params.id);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      // SECURITY (P0-b, Jul 30 2026): this endpoint carried `isAuthenticated` ONLY — no trip
      // authorization at all — while it wipes and rebuilds the trip's itinerary
      // (`db.delete(itineraryItems)` below) and burns AI spend. Any authenticated user could
      // destroy any other user's plan by guessing a trip UUID: the same wipe-and-overwrite
      // primitive as the apply-to-trip IDOR closed in 4d26971b.
      //
      // SCOPED STOPGAP, deliberately conservative: the mutation is authorized against the SAME
      // access set that can already READ the page hosting the Generate/Regenerate button, i.e.
      // `GET /api/trips/:id` above (`isOwner || isExpert || isManagingEa || isGuestWithToken`,
      // where `isExpert` is the `trips.expertId` COLUMN and `isManagingEa` is
      // `trips.managedByEaId`). So: allow when the canonical `authorizeTripLogistics` passes
      // (owner ‖ trip-assigned expert via trip_expert_advisors ‖ trip author ‖ audit-logged
      // admin) OR when the caller matches one of those two trip columns, which that helper does
      // not read. Because the endpoint is open to EVERYONE today, narrowing it to its host
      // page's existing read-access set is a strict improvement that regresses nobody
      // (EA-managed and expertId-linked trips keep working) while closing it to strangers.
      // The read gate's fourth branch (guest with `shareToken`) is deliberately NOT mirrored:
      // `isAuthenticated` already excludes unauthenticated guests here and the client hook
      // (`useGenerateItinerary`) sends no token, so mirroring it would WIDEN today's reachable
      // set rather than preserve it.
      //
      // This is explicitly NOT a new platform policy. Whether `authorizeTripLogistics` itself
      // should admit `trips.expertId` + `trips.managedByEaId` (and the owner/status-blind
      // divergences around it) is the trip-role lane's call — see CLAUDE.md §13 "Trip-access
      // model divergence + owner under-grant (L10)". Do not generalise from this local predicate.
      //
      // Placed after the trip fetch (it needs the two columns) but BEFORE the AI call and BEFORE
      // the destructive delete, so a denied caller costs zero AI tokens and destroys nothing.
      const callerUserId = getUserId(req)!;
      const isTripColumnExpert = callerUserId != null && (trip as any).expertId === callerUserId;
      const isManagingEa = callerUserId != null && (trip as any).managedByEaId === callerUserId;
      if (!isTripColumnExpert && !isManagingEa) {
        const denied = await authorizeTripLogistics(
          req.params.id,
          callerUserId,
          "POST /api/trips/:id/generate-itinerary",
        );
        if (denied) return res.status(denied.status).json({ message: denied.message });
      }

      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      const duration = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const destination = trip.destination || "the destination";
      const travelers = trip.numberOfTravelers || 1;
      const preferences = trip.preferences || "";

      let itineraryData: any;

      // Anchor-aware generation (Lane 2a): fetch the trip's immovable temporal
      // commitments and steer the generator around them. Empty for the vast
      // majority of trips → anchorBlock is "" and the prompt is unchanged.
      const [tripAnchors, tripBoundaries] = await Promise.all([
        storage.getTemporalAnchors(trip.id),
        storage.getDayBoundaries(trip.id),
      ]);
      const anchorBlock = buildAnchorPromptBlock(tripAnchors, tripBoundaries, trip.startDate);

      // Dedup key covers all parameters that affect the AI output.
      // Generic (non-personalised) — preferences string is included so
      // trips with different prefs get independent AI calls. The anchor block
      // is folded in verbatim so two same-destination trips with different
      // anchors don't share a cached generation (in-memory map key; length is fine).
      const dedupKey = `itinerary:claude:${destination}:${duration}:${travelers}:${preferences}${anchorBlock ? `:${anchorBlock}` : ""}`;

      try {
        const prompt = `Create a detailed ${duration}-day travel itinerary for ${destination} for ${travelers} traveler(s).${preferences ? ` Preferences: ${preferences}.` : ""}${anchorBlock}

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

            // T6-5: this is the one Anthropic call site outside claude.service.ts — without
            // this the primary generate-itinerary surface never writes ai_cost_tracking.
            trackAnthropicResponse(completion, { sourceType: "ai_itinerary" });

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

      // Post-generation anchor validation (Lane 2a): warn, never block. Attaches
      // conflict notes onto the plan so the data exists (Lane 4 renders it). Skips
      // to a no-op { hasConstraints:false } when the trip has no anchors/boundaries.
      try {
        itineraryData.anchorValidation = validateAnchorConflicts(
          itineraryData.days || [],
          tripAnchors,
          tripBoundaries,
          trip.startDate,
          new Date().toISOString(),
        );
      } catch (vErr) {
        console.error("anchor validation failed (non-blocking):", vErr);
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
        userId: getUserId(req)!,
        tripId: trip.id,
        eventType: "itinerary_generated",
        funnelStage: "T3",
      }).catch(() => {}); // fire-and-forget funnel event — never blocks itinerary response

      // Rebuild itinerary_items — delete old, insert new.
      // T1-1 (P1, data loss): this used to unconditionally wipe EVERY item for the trip,
      // silently destroying expert-added items (stamped `suggestedBy = 'expert'` by CC-1)
      // alongside the stale AI set. Now the delete PRESERVES expert-attributed rows — their
      // dayNumber/sortOrder are untouched, so they simply keep occupying their existing day/slot
      // while the freshly-generated set is inserted alongside them.
      // D2 (origin provenance, ratified Aug 7 2026): the PROVENANCE LIMITATION noted here
      // previously — traveler-manually-added items were NOT distinguishable from AI-generated
      // ones, both carrying `suggestedBy = null` — is now closed by `itinerary_items.origin`.
      // New rows are stamped 'ai' (this insert loop) or 'traveler' (every user-facing create
      // site) going forward, so the delete now ALSO spares `origin = 'traveler'` rows. Legacy
      // rows with `origin IS NULL` are ambiguous by construction (born before this column
      // existed) and keep the pre-existing replaced behavior — the same
      // `suggestedBy <> 'expert'` fallback as before, now reached only when `origin` itself
      // gives no answer.
      await db.delete(itineraryItems).where(
        and(
          eq(itineraryItems.tripId, trip.id),
          or(
            eq(itineraryItems.origin, "ai"),
            and(
              isNull(itineraryItems.origin),
              or(isNull(itineraryItems.suggestedBy), ne(itineraryItems.suggestedBy, "expert")),
            ),
          ),
        ),
      );

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
            origin: "ai",
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
      const userId = getUserId(req)!;
      
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

          // Role-vocabulary audit (Jul 27, 2026): users.role stores "service_provider",
          // NEVER bare "provider" — the previous `ownerRole === "provider"` was always
          // false, silently routing every provider-owned booking through the expert split.
          const ownerIsProvider = isProviderRole(ownerRole);
          const commission =
            ownerIsProvider
              ? calculateCommission(totalAmount, BookingType.PROVIDER_BOOKING, { providerTier: 1 })
              : calculateCommission(totalAmount, BookingType.EXPERT_SESSION, { isNewExpert });

          bookingType =
            ownerIsProvider ? BookingType.PROVIDER_BOOKING : BookingType.EXPERT_SESSION;

          // ── 1C charge-path repoint (docs/DECISIONS.md ruling 71; completes ruling 69 D6) ──────
          // The RATE this booking records resolves through the SAME D1 seam cart checkout uses:
          // `resolveDirectProviderRate` makes ONE call into `resolveProviderRate` (§18 rule 1 —
          // delegate, never re-implement), and `pickOwnerShareRate` applies the ONE precedence
          // (rails → direct D1 band → legacy). The direct band deliberately OUTRANKS the per-service
          // `revenueShareRate` snapshot, which ruling 47 dethroned as a first operand — pricing a
          // booking off the stale snapshot here would defeat an admin band edit exactly as the cart
          // path already prevents. §14/§18: the rate is server-resolved from `fee_bands`, never from
          // `req.body` and never from the snapshot as an override.
          //
          // A refusal (expert lane / no category / breached band guard) never throws — the seam
          // leaves the INCUMBENT legacy rate standing for that line, so a booking-create is never the
          // casualty of a misconfigured band (the ruling-70 disposition-6 fallback posture, reused —
          // not a second handler). The legacy operand is this path's own pre-1C incumbent share (the
          // `calculateCommission` payout share, byte-identical to what it charged before 1C), with the
          // snapshot demoted to that fallback's fallback.
          const parseSnapshotRate = (v: unknown, fallback: number): number => {
            const n = parseFloat(String(v));
            return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
          };
          const directRate = await resolveDirectProviderRate({
            serviceOwnerUserId: providerId,
            ownerRole,
            categoryId: service.categoryId ?? null,
            serviceId,
          });
          const incumbentShare = 1 - commission.commissionRate;
          const { shareRate: ownerShareRate } = pickOwnerShareRate({
            railsShareRate: null,
            direct: directRate,
            legacyShareRate: parseSnapshotRate(service.revenueShareRate, incumbentShare),
          });
          platformFeeAmt = (totalAmount * (1 - ownerShareRate)).toFixed(2);
          providerEarningsAmt = (totalAmount * ownerShareRate).toFixed(2);
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
        }).catch(() => {}); // fire-and-forget funnel event — never blocks booking confirmation

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

          // Send email alert to the provider (skipped when they have opted out)
          const provider = await storage.getUser(providerId);
          if (provider?.email && provider.emailBookingAlerts !== false) {
            const { sendBookingAlertEmail } = await import("./services/email.service");
            const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ") || provider.email;
            await sendBookingAlertEmail({
              providerEmail: provider.notificationEmail || provider.email,
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

  app.post(api.chats.create.path, isAuthenticated, async (req, res) => {
     try {
      const input = api.chats.create.input.parse(req.body);
      // Sender is always the session user — a body-sent senderId would let any
      // authenticated user write messages as someone else (§14's identity rule,
      // applied to chat integrity).
      const sessionUserId = getUserId(req)!;
      const recipientId = (input as any).receiverId as string | undefined;
      if (recipientId) {
        const isNewConversation = !(await messagingService.hasExistingConversation(sessionUserId, recipientId));
        const rate = checkMessageRateLimit({ senderId: sessionUserId, recipientId, isNewConversation, peerIp: req.ip });
        if (!rate.allowed) {
          res.setHeader("Retry-After", String(rate.retryAfterSec ?? 60));
          return res.status(429).json({ message: rate.message, scope: rate.scope, retryAfter: rate.retryAfterSec });
        }
      }
      const chat = await storage.createChat({ ...input, senderId: sessionUserId });

      // Live-push to the recipient's open chat client (same frame shape as the /ws relay).
      broadcastToUser(String(chat.receiverId), {
        type: "chat",
        id: chat.id,
        senderId: sessionUserId,
        recipientId: chat.receiverId,
        content: chat.message,
        timestamp: chat.createdAt?.toISOString?.() || new Date().toISOString(),
      });

      res.status(201).json(chat);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      // Block enforcement: storage.createChat throws a sentinel when a block exists in
      // either direction. Return a deterministic 403 so the client can surface a clear
      // message rather than leaving the request hanging or treating it as a server error.
      if ((err as any)?.code === "BLOCKED_USER") {
        return res.status(403).json({ message: "You cannot send messages to this user." });
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
  // CC-8: verified no client surface calls this route at all (the expert console's status
  // pages read /api/expert/application-status instead — see EXPERT_APPLICATION_PUBLIC_FIELDS'
  // comment); projected anyway rather than left as a directly-reachable full-row internals leak.
  app.get("/api/expert-application", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const form = await storage.getLocalExpertForm(userId);
    res.json(form ? pickPublicFields(form, EXPERT_APPLICATION_PUBLIC_FIELDS) : null);
  });

  // Submit expert application
  app.post("/api/expert-application", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      
      const existing = await storage.getLocalExpertForm(userId);
      if (existing) {
        if (existing.status === "rejected") {
          // Resubmission after rejection: upsert the existing row and reset to pending
          // sanitizeObject (via sanitizeDeep) recurses into knowledgeProofAnswers[].answer.
          const input = sanitizeObject(insertLocalExpertFormSchema.parse(req.body));
          const imgErr = validateImageDataUrl(input.govId, "govId") ?? validateImageDataUrl(input.travelLicence, "travelLicence");
          if (imgErr) return res.status(400).json({ message: imgErr });
          const form = await storage.updateLocalExpertForm(existing.id, {
            ...input,
            status: "pending",
            rejectionMessage: null,
          });
          void scoreKnowledgeProof(
            (form!.knowledgeProofAnswers as KnowledgeProofAnswerInput[]) ?? [],
            KNOWLEDGE_PROOF_QUESTIONS,
            form!.localityProof ?? null,
            form!.city ?? "",
          )
            .then((s) => storage.updateLocalExpertFormKnowledgeScore(form!.id, s))
            .catch((e: any) => console.error("[expertise-scoring] persist failed:", e?.message));
          // CC-8: project the response — see EXPERT_APPLICATION_PUBLIC_FIELDS for why.
          return res.status(200).json(pickPublicFields(form!, EXPERT_APPLICATION_PUBLIC_FIELDS));
        }
        return res.status(400).json({ message: "You already have an application submitted" });
      }

      // sanitizeObject (via sanitizeDeep) recurses into knowledgeProofAnswers[].answer.
      const input = sanitizeObject(insertLocalExpertFormSchema.parse(req.body));
      const imgErr = validateImageDataUrl(input.govId, "govId") ?? validateImageDataUrl(input.travelLicence, "travelLicence");
      if (imgErr) return res.status(400).json({ message: imgErr });
      const form = await storage.createLocalExpertForm({ ...input, userId });
      // Kyoto Knowledge-Bar (advisory): score the knowledge-proof answers in the background and store
      // the result for the admin queue. Fire-and-forget — best-effort, never blocks the submission.
      void scoreKnowledgeProof(
        (form.knowledgeProofAnswers as KnowledgeProofAnswerInput[]) ?? [],
        KNOWLEDGE_PROOF_QUESTIONS,
        form.localityProof ?? null,
        form.city ?? "",
      )
        .then((s) => storage.updateLocalExpertFormKnowledgeScore(form.id, s))
        .catch((e: any) => console.error("[expertise-scoring] persist failed:", e?.message));
      // CC-8: project the response — see EXPERT_APPLICATION_PUBLIC_FIELDS for why.
      res.status(201).json(pickPublicFields(form, EXPERT_APPLICATION_PUBLIC_FIELDS));
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
      const userId = getUserId(req)!;
      const existing = await storage.getLocalExpertForm(userId);
      if (existing) {
        if (existing.status === "rejected") {
          // Resubmission after rejection: upsert the existing row and reset to pending
          // sanitizeObject (via sanitizeDeep) recurses into knowledgeProofAnswers[].answer.
          const input = sanitizeObject(insertLocalExpertFormSchema.parse(req.body));
          const imgErr = validateImageDataUrl(input.govId, "govId") ?? validateImageDataUrl(input.travelLicence, "travelLicence");
          if (imgErr) return res.status(400).json({ message: imgErr });
          const form = await storage.updateLocalExpertForm(existing.id, {
            ...input,
            status: "pending",
            rejectionMessage: null,
          });
          void scoreKnowledgeProof(
            (form!.knowledgeProofAnswers as KnowledgeProofAnswerInput[]) ?? [],
            KNOWLEDGE_PROOF_QUESTIONS,
            form!.localityProof ?? null,
            form!.city ?? "",
          )
            .then((s) => storage.updateLocalExpertFormKnowledgeScore(form!.id, s))
            .catch((e: any) => console.error("[expertise-scoring] persist failed:", e?.message));
          // CC-8: project the response — see EXPERT_APPLICATION_PUBLIC_FIELDS for why.
          return res.status(200).json(pickPublicFields(form!, EXPERT_APPLICATION_PUBLIC_FIELDS));
        }
        return res.status(400).json({ message: "You already have an application submitted" });
      }
      // sanitizeObject (via sanitizeDeep) recurses into knowledgeProofAnswers[].answer.
      const input = sanitizeObject(insertLocalExpertFormSchema.parse(req.body));
      const imgErr = validateImageDataUrl(input.govId, "govId") ?? validateImageDataUrl(input.travelLicence, "travelLicence");
      if (imgErr) return res.status(400).json({ message: imgErr });
      const form = await storage.createLocalExpertForm({ ...input, userId });
      // Kyoto Knowledge-Bar (advisory): score the knowledge-proof answers in the background and store
      // the result for the admin queue. Fire-and-forget — best-effort, never blocks the submission.
      void scoreKnowledgeProof(
        (form.knowledgeProofAnswers as KnowledgeProofAnswerInput[]) ?? [],
        KNOWLEDGE_PROOF_QUESTIONS,
        form.localityProof ?? null,
        form.city ?? "",
      )
        .then((s) => storage.updateLocalExpertFormKnowledgeScore(form.id, s))
        .catch((e: any) => console.error("[expertise-scoring] persist failed:", e?.message));
      // CC-8: project the response — see EXPERT_APPLICATION_PUBLIC_FIELDS for why.
      res.status(201).json(pickPublicFields(form, EXPERT_APPLICATION_PUBLIC_FIELDS));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Admin: Payout-gap report — approved experts who haven't completed Stripe Connect
  app.get("/api/admin/expert-payout-gap", isAuthenticated, async (req, res) => {
    const user = await db.select().from(users).where(eq(users.id, getUserId(req)!)).then(r => r[0]);
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
    const userId = getUserId(req)!;
    const form = await storage.getServiceProviderForm(userId);
    res.json(form || null);
  });

  // Submit provider application
  app.post("/api/provider-application", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      
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

  // Ruling 85: SET / UPDATE / CLEAR the provider's account-level office / place-of-business
  // location AFTER onboarding. Owner-gated — the row is resolved by the SESSION userId, never a
  // body id, so a provider can only ever touch their OWN service_provider_forms row. The body is an
  // ALLOWLIST (a hand-written zod pick of just `officeLocation`) — NOT the denylist create schema —
  // so no unrelated column can ride in, and the #PS18 omit-ratchet is untouched (no new
  // createInsertSchema). `officeLocation` is provider CONFIG, not a money/identity/rate field: the
  // §14/§18/§19 strips do not apply (nothing derives a charge from it), but the coordinate is still
  // validated to a finite in-range {address?,lat,lng} (or null-to-clear) — the §13 honesty gate is
  // the client Confirm + NULL-stays-NULL, never a fabricated coordinate. The client geocodes the
  // typed address through the EXISTING POST /api/geocode and emits a point ONLY on explicit Confirm
  // (the meeting-pin posture).
  app.patch("/api/provider-application", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const existing = await storage.getServiceProviderForm(userId);
      if (!existing) {
        return res.status(404).json({ message: "No provider application found for this account" });
      }
      if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, "officeLocation")) {
        return res.status(400).json({ message: "officeLocation is required (object with lat/lng, or null to clear)" });
      }
      const raw = req.body.officeLocation;
      let officeLocation: { address: string | null; lat: number; lng: number } | null;
      if (raw === null) {
        officeLocation = null; // explicit clear — NULL is the honest "not set" state (§13)
      } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const lat = typeof raw.lat === "number" ? raw.lat : parseFloat(String(raw.lat));
        const lng = typeof raw.lng === "number" ? raw.lng : parseFloat(String(raw.lng));
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return res.status(400).json({ message: "officeLocation must carry numeric lat/lng within range, or be null to clear" });
        }
        const address = typeof raw.address === "string" ? raw.address.slice(0, 500) : null;
        officeLocation = { address, lat, lng };
      } else {
        return res.status(400).json({ message: "officeLocation must be an object with lat/lng, or null" });
      }
      const updated = await storage.updateServiceProviderFormOfficeLocation(userId, officeLocation);
      res.json(updated ?? null);
    } catch (err) {
      console.error("Error updating provider office location:", err);
      res.status(500).json({ message: "Failed to update office location" });
    }
  });

  // Alias: /api/provider-forms -> /api/provider-application (for API compatibility)
  app.post("/api/provider-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
        rejectionMessage: form?.status === "rejected" ? (form.rejectionMessage ?? null) : null,
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
      const userId = getUserId(req)!;
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
        rejectionMessage: form?.status === "rejected" ? (form.rejectionMessage ?? null) : null,
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
    const approved = services.filter((s) => s.approvalStatus === "approved");
    // §16 vacation-mode enforcement (deferred arm, ratified Aug 9 2026 — see
    // filterOutAwayOwners doc in content-query.service.ts): a currently-away owner's
    // listings drop out of this public surfacing rail; they reappear automatically once
    // the flag clears. Read-only — no provider_services row is touched.
    const live = await filterOutAwayOwners(approved, (s) => s.userId);
    // D3 leak-prevention: this route is UNAUTHENTICATED public browse — serviceFile is the
    // product itself for a pdf-delivery listing and must never surface pre-purchase.
    // getAllProviderServices() is shared with admin (which legitimately needs the full row),
    // so the strip happens here at the public call site, not in the storage function.
    // S9 (ledger row 102): joinLink joins the strip for the same reason — no confirmed booking
    // exists on this pre-purchase browse.
    res.json(live.map((s) => omitFields(s, ["serviceFile", "joinLink"] as const)));
  });
  
  // Get provider's services
  app.get("/api/provider/services", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const { destination, category, activeOnly } = req.query as Record<string, string>;
    const services = await storage.getProviderServices(userId, {
      destination: destination || undefined,
      category: category || undefined,
      activeOnly: activeOnly === "true",
    });
    // C3 (ruling 74/75): resolve each listing's card booking mode server-side with the SAME
    // derivation the public storefront read uses (resolveBookingMode), so the Catalog Preview card
    // is concrete AND identical to what travelers see ("what you see = what users see"). The
    // account instant-booking flag is read ONCE (never duplicated per row); showPrice is already
    // concrete via its column DEFAULT. The RAW column value is preserved for any consumer that
    // needs it — resolution only fills the unset case.
    const [ownerForm] = await db
      .select({ instantBooking: serviceProviderForms.instantBooking })
      .from(serviceProviderForms)
      .where(eq(serviceProviderForms.userId, userId))
      .limit(1);
    const ownerInstantBooking = ownerForm?.instantBooking ?? false;
    const withDisplayOptions = services.map((s) => ({
      ...s,
      showPrice: (s as any).showPrice ?? true,
      bookingMode: resolveBookingMode((s as any).bookingMode, ownerInstantBooking),
    }));
    res.json(withDisplayOptions);
  });

  // ── Market insights (lane B2, ruling 84; CLAUDE.md §13/§20) ────────────────────────────────────
  //    Owner-gated (session identity, never req.body — §14 posture) READ-ONLY, non-money overlay for
  //    the Catalog map. Two REAL layers, both server-aggregated (counts per bucket — a traveler's row
  //    or coords NEVER leaves the server, so no address leak by construction):
  //      • gaps   — per (neighborhood, categoryKey) admin target vs REAL located supply; a gap only
  //                 where target > have. No target row ⇒ no claim (§13).
  //      • demand — REAL search intent bucketed by destination STRING to neighborhood/market
  //                 centroids, thresholded at MIN_DEMAND_SIGNAL. Below threshold ⇒ hasSignal=false
  //                 ("not enough signal yet"). NEVER a per-lat/lng heat cell; booking pickup coords
  //                 are NOT a demand source (this endpoint reads no bookings at all).
  //    Estimated / TravelPulse aggregates are excluded. ODbL attribution rides the response.
  const DEMAND_WINDOW_DAYS = 90; // recent window for the search-intent rollup.
  app.get("/api/provider/market-insights", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const attribution = "© OpenStreetMap contributors";
      const emptyDemand = {
        byNeighborhood: [] as any[],
        cityLevel: [] as any[],
        unplaceableCount: 0,
        threshold: MIN_DEMAND_SIGNAL,
        hasSignal: false,
      };

      const cities = await storage.getProviderMarketCities(userId);
      if (cities.length === 0) {
        // No market footprint yet — honest empty surface, nothing invented (§13).
        return res.json({
          asOf: new Date().toISOString(),
          cities,
          demand: emptyDemand,
          gaps: [],
          attribution,
        });
      }

      const neighborhoods = await storage.getMarketNeighborhoods(cities);
      const [targets, supply] = await Promise.all([
        storage.getCoverageTargetsForNeighborhoods(neighborhoods.map((n) => n.id)),
        storage.getLocatedSupplyForCities(cities),
      ]);
      const gaps = resolveCoverageGaps(supply, targets, neighborhoods);

      const neighborhoodTokens = neighborhoods.flatMap((n) => [n.name, n.slug]);
      const demandRows = await storage.getMarketDemandRows(cities, neighborhoodTokens, DEMAND_WINDOW_DAYS);
      const demand = resolveDemandBuckets(demandRows, neighborhoods, cities, MIN_DEMAND_SIGNAL);

      res.json({ asOf: new Date().toISOString(), cities, demand, gaps, attribution });
    } catch (err) {
      console.error("[market-insights] failed:", (err as any)?.message);
      res.status(500).json({ message: "Failed to load market insights" });
    }
  });

  // Get a single provider service by ID (ownership required)
  app.get("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      // Ruling 22: route stops ride the same owner read the edit surfaces already use
      const routePoints = await storage.getServiceRoutePoints(service.id);
      res.json({ ...service, neighborhoods, routePoints });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch service" });
    }
  });

  // ── D1 (ruling 74/76): per-listing publish-readiness summary for the Distribute
  //    Marketplace channel. Owner-gated (service.userId === session user, §14 identity from
  //    the session never the body) and read-only. It COMPOSES the three existing gate
  //    authorities — it re-derives none of them:
  //      • approval + active status  ← the provider_services row (the owner console read)
  //      • verification gate         ← resolvePublishVerification(ownerId)  (F2, account-level)
  //      • attestation gate          ← resolveAttestationShape + checkAttestationPublishGate
  //                                     (SS-5a, per-listing, applicable set server-derived)
  //    §13: a listing that CANNOT go live returns the TRUE blocker(s) with a fix deep-link,
  //    never an optimistic "ready". "Live" is asserted only when approval='approved' AND
  //    status='active' AND both gates pass — the same predicate the storefront read enforces.
  //    The attestation gate is resolved against the LIVE row shape (no overrides — this is a
  //    read of what-is, not a would-be write). Justification for a new endpoint over composing
  //    client-side: the attestation APPLICABLE set is server-derived only (a client deciding
  //    its own applicable set is exactly the walk-past the gate service forbids), so the honest
  //    state cannot be assembled on the client without duplicating that logic.
  app.get("/api/provider/services/:id/publish-readiness", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }

      const approvalStatus = service.approvalStatus ?? "draft";
      const status = service.status ?? "draft";

      // Verification gate — the SAME resolver the publish choke points use; owner id, not actor.
      const verification = await resolvePublishVerification(userId);

      // Attestation gate — resolve the live shape, then ask the shared gate whether it blocks.
      const attestShape = await resolveAttestationShape({ serviceId: service.id });
      const attestGate = await checkAttestationPublishGate({ serviceId: service.id, shape: attestShape });
      const attestationOk = attestGate === null;
      const unaffirmed = attestGate
        ? ((attestGate.body.attestations as { key: string; label: unknown }[] | undefined) ?? [])
        : [];

      const isApproved = approvalStatus === "approved";
      const isActive = status === "active";
      // "Live" = the SAME predicate the public storefront read (loadStorefront) actually serves:
      // approved AND active. The verification/attestation gates are PUBLISH gates — they block a
      // TRANSITION to active, not continuous serving — so a grandfathered approved+active listing
      // on an as-yet-unverified account is genuinely live to travelers, and the Storefront header
      // on THIS page reports it live too. Folding the publish gates into `isLive` would contradict
      // both. Instead they surface below as the reasons a NON-active listing can't be activated.
      const isLive = isApproved && isActive;

      // Honest, ordered blocker list for a listing that is NOT live — each carries a fix
      // deep-link (§13: the real reason, never a fake "ready"). Order = the sequence the owner
      // resolves them in. Empty when the listing is live.
      const blockers: { code: string; message: string; fixHref: string }[] = [];
      if (!isLive) {
        if (!verification.ok) {
          blockers.push({
            code: "VERIFICATION_GATE",
            message: isProviderRole(verification.role)
              ? "Finish identity and business verification before this listing can go live."
              : "Finish identity verification before this listing can go live.",
            fixHref: isExpertRole(verification.role) ? "/expert-status" : "/provider-status",
          });
        }
        if (!attestationOk) {
          blockers.push({
            code: "ATTESTATION_GATE",
            message: "Affirm the statements on this listing before publishing it.",
            fixHref: `/provider/services/${service.id}/edit`,
          });
        }
        if (!isApproved) {
          blockers.push({
            code: approvalStatus === "rejected" ? "APPROVAL_REJECTED" : "APPROVAL_PENDING",
            message:
              approvalStatus === "rejected"
                ? "This listing was rejected in review — edit and resubmit it."
                : "This listing is in review. It goes live once approved.",
            fixHref: `/provider/services/${service.id}/edit`,
          });
        } else if (!isActive) {
          blockers.push({
            code: "NOT_ACTIVE",
            message:
              status === "paused"
                ? "This listing is paused. Reactivate it in Catalog to sell it."
                : "This listing is approved but not active yet. Activate it in Catalog.",
            fixHref: `/provider/services`,
          });
        }
      }

      res.json({
        serviceId: service.id,
        name: (service as any).serviceName ?? (service as any).name ?? "",
        approvalStatus,
        status,
        isLive,
        publicHref: `/services/${service.id}`,
        verification: {
          ok: verification.ok,
          role: verification.role,
          identityVerified: verification.identityVerified,
          businessVerified: verification.businessVerified,
        },
        attestation: {
          ok: attestationOk,
          unaffirmed,
        },
        blockers,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to resolve publish readiness" });
    }
  });

  // Ruling 22: replace-list write for a service's ordered route stops. Owner-gated like the
  // sibling PATCH; ALLOWLIST body (§19 posture — nothing but name + coordinates can reach a
  // row, and positions are derived server-side from array order, never client-numbered).
  const routeStopsBodySchema = z.object({
    stops: z.array(z.object({
      name: z.string().trim().min(1).max(255),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
    })).max(40),
  });
  app.put("/api/provider/services/:id/route-points", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      const parsed = routeStopsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid route stops", errors: parsed.error.flatten() });
      }
      const stops: Array<{ name: string; latitude: number | null; longitude: number | null }> = [];
      for (const s of parsed.data.stops) {
        const hasLat = typeof s.latitude === "number";
        const hasLng = typeof s.longitude === "number";
        if (hasLat !== hasLng) {
          // A half-coordinate is a guess waiting to happen (§13): both or neither.
          return res.status(400).json({ message: "A stop must carry both latitude and longitude, or neither" });
        }
        stops.push({ name: s.name, latitude: hasLat ? s.latitude! : null, longitude: hasLng ? s.longitude! : null });
      }
      // Ruling 112 Q8 (CLAUDE.md §23): ADDING A ROUTE WHERE THERE WAS NONE is an identity edit —
      // it changes what the approved listing IS (a point service became a route). The staged
      // stops wait in pending_changes under the reserved __routePoints key; editing an EXISTING
      // route (reorder, rename, locate, remove) stays a safe edit and applies immediately.
      if (service.approvalStatus === "approved" && stops.length > 0) {
        const existingStops = await storage.getServiceRoutePoints(service.id);
        if (existingStops.length === 0) {
          const staged = await storage.stagePendingChanges(service.id, { __routePoints: stops });
          return res.json({
            routePoints: [],
            editReview: { status: "pending", stagedKeys: ["routePoints"] },
            message: "Adding a route to an approved listing goes through review — your live listing is unchanged meanwhile.",
            editReviewStatus: (staged as any)?.editReviewStatus ?? "pending",
          });
        }
      }
      const routePoints = await storage.replaceServiceRoutePoints(service.id, stops);
      res.json({ routePoints });
    } catch (err: any) {
      // The FOR UPDATE lock in replaceServiceRoutePoints serializes concurrent saves; a 23505
      // here is the residual race backstop — the route changed under this caller, and a fresh
      // read + retry succeeds. Never a silent 500 either way.
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode === "23505") {
        return res.status(409).json({ message: "Route changed elsewhere — reload and try again" });
      }
      console.error("[route-points] save failed:", err);
      res.status(500).json({ message: "Failed to save route stops" });
    }
  });

  // ══ B1 (ruling 81): replace-list write for a service's ZONE surcharge tiers ═══════════════════
  // Owner-gated like the sibling route-points PUT; ALLOWLIST body (§19 posture — nothing but
  // radiusKm + fee reaches a row, positions derived server-side from array order, never
  // client-numbered). These are owner LISTING config (radius rings + fee), NOT §18 rates — the
  // CHARGE is derived server-side at checkout (travel-surcharge.service.ts), never off this body.
  const surchargeTiersBodySchema = z.object({
    tiers: z.array(z.object({
      radiusKm: z.coerce.number().gt(0).max(100000),
      fee: z.coerce.number().min(0).max(1000000),
    })).max(20),
  });
  app.put("/api/provider/services/:id/surcharge-tiers", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      const parsed = surchargeTiersBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid surcharge tiers", errors: parsed.error.flatten() });
      }
      // Positions follow array order; the resolver sorts by radius regardless, so the owner may send
      // the rings in any order and get honest smallest-ring-contains behaviour.
      const tiers = parsed.data.tiers.map((t) => ({ radiusKm: t.radiusKm, fee: t.fee }));
      const surchargeTiers = await storage.replaceServiceSurchargeTiers(service.id, tiers);
      res.json({ surchargeTiers });
    } catch (err: any) {
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode === "23505") {
        return res.status(409).json({ message: "Tiers changed elsewhere — reload and try again" });
      }
      console.error("[surcharge-tiers] save failed:", err);
      res.status(500).json({ message: "Failed to save surcharge tiers" });
    }
  });

  // Read: a service's surcharge config + tiers (owner OR any reader — display-only, no secrets).
  app.get("/api/provider/services/:id/surcharge-tiers", isAuthenticated, async (req, res) => {
    try {
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service) return res.status(404).json({ message: "Service not found" });
      const surchargeTiers = await storage.getServiceSurchargeTiers(service.id);
      res.json({ surchargeTiers });
    } catch (err) {
      console.error("[surcharge-tiers] read failed:", err);
      res.status(500).json({ message: "Failed to read surcharge tiers" });
    }
  });

  // ══ S7 availability model (DECISIONS.md ledger 102) — three owner-gated replace-list rails ═══
  // Modeled byte-for-byte on the route-points/surcharge-tiers PUTs above: ALLOWLIST body (§19 — no
  // createInsertSchema), owner resolved by id + session userId (404, never 403, so a non-owner
  // can't distinguish "not yours" from "doesn't exist"), ids/timestamps server-derived.

  const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ── availability-patterns (weekly repeat rule) ─────────────────────────────────────────────
  const availabilityPatternsBodySchema = z.object({
    patterns: z.array(z.object({
      dayOfWeek: z.number().int().min(0).max(6), // 0=Sun..6=Sat, app-enforced (no DB CHECK)
      startTime: z.string().regex(HHMM_RE, "startTime must be HH:MM"),
      endTime: z.string().regex(HHMM_RE, "endTime must be HH:MM"),
      capacity: z.coerce.number().int().min(1).max(1000).optional(),
    })).max(200), // 7 days × generous slots/day headroom
  });
  app.put("/api/provider/services/:id/availability-patterns", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      const parsed = availabilityPatternsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid availability patterns", errors: parsed.error.flatten() });
      }
      for (const p of parsed.data.patterns) {
        if (p.endTime <= p.startTime) {
          return res.status(400).json({ message: "Each pattern's endTime must be after its startTime" });
        }
      }
      // Ruling 112 Q5 (R4b): a payload carrying two identical windows used to trip the UNIQUE
      // constraint and get misreported as a concurrency 409 ("changed elsewhere") on a first-ever
      // save. Duplicates inside ONE payload are a validation error, not a race — say so.
      const windowKeys = new Set<string>();
      for (const p of parsed.data.patterns) {
        const key = `${p.dayOfWeek}|${p.startTime}|${p.endTime}`;
        if (windowKeys.has(key)) {
          return res.status(400).json({
            message: "Two repeating windows are identical (same day, start and end) — merge them or change one.",
          });
        }
        windowKeys.add(key);
      }
      const patterns = parsed.data.patterns.map((p) => ({
        dayOfWeek: p.dayOfWeek,
        startTime: p.startTime,
        endTime: p.endTime,
        capacity: p.capacity ?? 1,
      }));
      const saved = await storage.replaceServiceAvailabilityPatterns(service.id, patterns);
      // Trigger 1/2 (materializer service header): expand the rolling window immediately so a
      // saved pattern is bookable without waiting for the daily horizon-extension sweep.
      const materialized = await materializeServiceAvailability(service.id);
      res.json({ patterns: saved, materialized });
    } catch (err: any) {
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode === "23505") {
        return res.status(409).json({ message: "Patterns changed elsewhere — reload and try again" });
      }
      console.error("[availability-patterns] save failed:", err);
      res.status(500).json({ message: "Failed to save availability patterns" });
    }
  });

  app.get("/api/provider/services/:id/availability-patterns", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      const patterns = await storage.getServiceAvailabilityPatterns(service.id);
      res.json({ patterns });
    } catch (err) {
      console.error("[availability-patterns] read failed:", err);
      res.status(500).json({ message: "Failed to read availability patterns" });
    }
  });

  // ── date-ranges (property/property_room date-range authoring; S11 owns the range-claim
  //    machinery — this wave is authoring only) ──────────────────────────────────────────────
  const dateRangesBodySchema = z.object({
    ranges: z.array(z.object({
      startDate: z.string().regex(DATE_RE, "startDate must be YYYY-MM-DD"),
      endDate: z.string().regex(DATE_RE, "endDate must be YYYY-MM-DD"),
      nightlyPrice: z.coerce.number().min(0).max(1000000).nullable().optional(), // S7-Q4: provider-authored config like `price`; §14 — S11 must derive the charge server-side from THIS row, never req.body
      capacity: z.coerce.number().int().min(1).max(1000).optional(),
    })).max(200),
  });
  app.put("/api/provider/services/:id/date-ranges", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      // Ballot requirement: date-ranges are property/room-shaped authoring only.
      if (service.productShape !== "property" && service.productShape !== "property_room") {
        return res.status(400).json({ message: "Date-range availability applies only to property or property_room listings" });
      }
      const parsed = dateRangesBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid date ranges", errors: parsed.error.flatten() });
      }
      for (const r of parsed.data.ranges) {
        if (r.endDate < r.startDate) {
          return res.status(400).json({ message: "Each range's endDate must be on or after its startDate" });
        }
        // S11-Q1 (DECISIONS.md ledger row 107): a range is bounded by its own dates — no rolling
        // window — but a mistaken/malicious multi-decade range is REJECTED here (400), never
        // silently truncated (§13). Inclusive both ends, matching nightDatesInclusive below.
        if (nightDatesInclusive(r.startDate, r.endDate).length > DATE_RANGE_MAX_NIGHTS) {
          return res.status(400).json({
            message: `Each date range may span at most ${DATE_RANGE_MAX_NIGHTS} nights`,
          });
        }
      }
      const ranges = parsed.data.ranges.map((r) => ({
        startDate: r.startDate,
        endDate: r.endDate,
        nightlyPrice: r.nightlyPrice ?? null,
        capacity: r.capacity ?? 1,
      }));
      const saved = await storage.replaceServiceDateRanges(service.id, ranges);
      // S11 (ledger row 107): materialize each range's nights into claimable
      // vendor_availability_slots rows (mirrors the pattern/blackout triggers above), then
      // re-price any already-materialized, STILL-UNBOOKED night in the (possibly edited) range —
      // a booked/claimed night is never touched (§18b posture).
      const materialized = await materializeDateRangeAvailability(service.id);
      const repriced = await repriceDateRangeAvailability(service.id);
      res.json({ dateRanges: saved, materialized, repriced });
    } catch (err: any) {
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode === "23505") {
        return res.status(409).json({ message: "Date ranges changed elsewhere — reload and try again" });
      }
      console.error("[date-ranges] save failed:", err);
      res.status(500).json({ message: "Failed to save date ranges" });
    }
  });

  app.get("/api/provider/services/:id/date-ranges", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      const dateRanges = await storage.getServiceDateRanges(service.id);
      res.json({ dateRanges });
    } catch (err) {
      console.error("[date-ranges] read failed:", err);
      res.status(500).json({ message: "Failed to read date ranges" });
    }
  });

  // ── blackouts (applies to either shape — scheduled-slot services or property date-ranges) ───
  const blackoutsBodySchema = z.object({
    blackouts: z.array(z.object({
      startDate: z.string().regex(DATE_RE, "startDate must be YYYY-MM-DD"),
      endDate: z.string().regex(DATE_RE, "endDate must be YYYY-MM-DD"),
      reason: z.string().trim().max(255).nullable().optional(),
    })).max(200),
  });
  app.put("/api/provider/services/:id/blackouts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      const parsed = blackoutsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid blackouts", errors: parsed.error.flatten() });
      }
      for (const b of parsed.data.blackouts) {
        if (b.endDate < b.startDate) {
          return res.status(400).json({ message: "Each blackout's endDate must be on or after its startDate" });
        }
      }
      const blackouts = parsed.data.blackouts.map((b) => ({
        startDate: b.startDate,
        endDate: b.endDate,
        reason: b.reason ?? null,
      }));
      const saved = await storage.replaceServiceAvailabilityBlackouts(service.id, blackouts);
      // Trigger 2/2 (materializer service header): S7-Q3 — a blackout blocks FUTURE
      // materialization only. This re-run never touches an already-materialized slot (ADD-ONLY,
      // ON CONFLICT DO NOTHING) — it only prevents newly-blacked-out dates from being generated
      // going forward, while any date that already has a row (booked or not) survives untouched.
      // Blackouts apply to EITHER shape (scheduled-slot services or property date-ranges), so
      // both materializers run — each is a no-op for a service with nothing of that shape to
      // expand (a scheduled service has no date-ranges; a property has no weekly patterns).
      const materialized = await materializeServiceAvailability(service.id);
      const materializedDateRanges = await materializeDateRangeAvailability(service.id);
      res.json({ blackouts: saved, materialized, materializedDateRanges });
    } catch (err: any) {
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode === "23505") {
        return res.status(409).json({ message: "Blackouts changed elsewhere — reload and try again" });
      }
      console.error("[blackouts] save failed:", err);
      res.status(500).json({ message: "Failed to save blackouts" });
    }
  });

  app.get("/api/provider/services/:id/blackouts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found" });
      }
      const blackouts = await storage.getServiceAvailabilityBlackouts(service.id);
      res.json({ blackouts });
    } catch (err) {
      console.error("[blackouts] read failed:", err);
      res.status(500).json({ message: "Failed to read blackouts" });
    }
  });

  // ══ Ruling 60 Phase B — provider CONTENT translation (service_translations) ══════════════════
  // System B (the provider's OWN traveler-facing content), NOT system A (chrome). §13's honesty
  // rule binds here: a draft is never shown to a traveler, an AI draft is labeled by construction,
  // and a missing translation is served as the honest ORIGINAL with a "shown in English" label
  // (that last part lives on the traveler read in content.routes.ts).
  //
  // Owner-gated: the service is resolved by id + `service.userId === session user`. The write body
  // is a hand-written zod ALLOWLIST of exactly the four translatable content fields (§19 — no
  // client-settable status/source/updatedBy/timestamp; status/source are set server-side by the
  // path, updatedBy from the session per §14). A PUT is replace-for-that-locale.
  const translationContentBodySchema = z.object({
    serviceName: z.string().trim().max(255).nullish(),
    shortDescription: z.string().trim().max(150).nullish(),
    description: z.string().trim().max(20000).nullish(),
    meetingPoint: z.string().trim().max(20000).nullish(),
  });
  const normalizeContent = (b: z.infer<typeof translationContentBodySchema>) => ({
    serviceName: b.serviceName ?? null,
    shortDescription: b.shortDescription ?? null,
    description: b.description ?? null,
    meetingPoint: b.meetingPoint ?? null,
  });
  async function resolveOwnedService(req: any, res: any) {
    const userId = getUserId(req)!;
    const service = await storage.getProviderServiceById(req.params.id);
    if (!service || service.userId !== userId) {
      res.status(404).json({ message: "Service not found" });
      return null;
    }
    return { userId, service };
  }
  function parseTargetLocale(raw: string, res: any, service: any): string | null {
    // Ruling 115: a translation TARGET must be a shipped content locale other than the LISTING'S
    // OWN source language (source_locale, NULL = en — ruling 60's assumption made explicit).
    const src = effectiveSourceLocale(service?.sourceLocale);
    if (!isContentLocale(raw) || raw === src) {
      res.status(400).json({
        message: `Unsupported translation locale '${raw}' (source is '${src}'; targets: ${CONTENT_LOCALES.filter((l) => l !== src).join(", ")})`,
      });
      return null;
    }
    return raw;
  }

  // Owner read: the translation row for one locale (null when never authored). Includes status +
  // source so the console can label a draft / an AI draft and gate the "Approve" action.
  app.get("/api/provider/services/:id/translations/:locale", isAuthenticated, async (req, res) => {
    try {
      const owned = await resolveOwnedService(req, res);
      if (!owned) return;
      const locale = parseTargetLocale(req.params.locale, res, owned.service);
      if (!locale) return;
      const translation = await storage.getServiceTranslation(owned.service.id, locale);
      res.json({ locale, translation: translation ?? null });
    } catch (err) {
      console.error("[service-translation] owner read failed:", err);
      res.status(500).json({ message: "Failed to fetch translation" });
    }
  });

  // Owner replace-for-locale write: a provider supplying/editing their OWN translation. Sets
  // status='approved', source='human' — the provider authored and owns this text. updatedBy is
  // the session user (§14); status/source/timestamps are NEVER read from the body (§19).
  app.put("/api/provider/services/:id/translations/:locale", isAuthenticated, async (req, res) => {
    try {
      const owned = await resolveOwnedService(req, res);
      if (!owned) return;
      const locale = parseTargetLocale(req.params.locale, res, owned.service);
      if (!locale) return;
      const parsed = translationContentBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid translation content", errors: parsed.error.flatten() });
      }
      const translation = await storage.upsertServiceTranslation({
        serviceId: owned.service.id,
        locale,
        // Sanitize translated free-text before storing (task 1135 / task 1138).
        content: sanitizeStringFields(normalizeContent(parsed.data)) as ReturnType<typeof normalizeContent>,
        status: "approved",
        source: "human",
        updatedBy: owned.userId,
      });
      res.json({ locale, translation });
    } catch (err) {
      console.error("[service-translation] owner write failed:", err);
      res.status(500).json({ message: "Failed to save translation" });
    }
  });

  // Owner approve: flip an existing (typically ai_draft) row to approved/human. Review gate, not a
  // rewrite — the reviewed content is kept verbatim. 404 when nothing exists to approve.
  app.post("/api/provider/services/:id/translations/:locale/approve", isAuthenticated, async (req, res) => {
    try {
      const owned = await resolveOwnedService(req, res);
      if (!owned) return;
      const locale = parseTargetLocale(req.params.locale, res, owned.service);
      if (!locale) return;
      const translation = await storage.approveServiceTranslation(owned.service.id, locale, owned.userId);
      if (!translation) return res.status(404).json({ message: "No translation to approve for this locale" });
      res.json({ locale, translation });
    } catch (err) {
      console.error("[service-translation] approve failed:", err);
      res.status(500).json({ message: "Failed to approve translation" });
    }
  });

  // Owner opt-in AI first draft: generate a machine translation and store it labeled
  // source='ai_draft', status='draft' — NEVER shown to a traveler until the provider approves it
  // (§13). Degrades HONESTLY with no translation provider configured: 503 + a clear state, never a
  // fabricated/echoed translation. Uses the existing AI infra + ai_cost_tracking (no new client).
  app.post("/api/provider/services/:id/translations/:locale/draft", isAuthenticated, async (req, res) => {
    try {
      const owned = await resolveOwnedService(req, res);
      if (!owned) return;
      const locale = parseTargetLocale(req.params.locale, res, owned.service);
      if (!locale) return;
      const s = owned.service as any;
      const outcome = await draftServiceTranslation(
        {
          serviceName: s.serviceName ?? null,
          shortDescription: s.shortDescription ?? null,
          description: s.description ?? null,
          meetingPoint: s.meetingPoint ?? null,
        },
        locale,
        owned.userId,
        // Ruling 115: translate FROM the listing's own source language, not an assumed English.
        effectiveSourceLocale(s.sourceLocale),
      );
      if (outcome.status === "no_api_key") {
        return res.status(503).json({
          message: "AI draft unavailable — no translation provider configured.",
          code: "AI_DRAFT_UNAVAILABLE",
        });
      }
      if (outcome.status === "unsupported_locale") {
        return res.status(400).json({ message: `Unsupported translation locale '${locale}'` });
      }
      if (outcome.status === "ai_error") {
        return res.status(502).json({ message: "AI draft failed — please try again.", code: "AI_DRAFT_ERROR" });
      }
      const translation = await storage.upsertServiceTranslation({
        serviceId: owned.service.id,
        locale,
        content: outcome.content,
        status: "draft",
        source: "ai_draft",
        updatedBy: owned.userId,
      });
      res.json({ locale, translation });
    } catch (err) {
      console.error("[service-translation] AI draft endpoint failed:", err);
      res.status(500).json({ message: "Failed to generate draft" });
    }
  });

  // Create a new service
  app.post("/api/provider/services", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      // Extract neighborhoods before schema parse (not a DB column)
      const { neighborhoods: neighborhoodSlugs, ...bodyWithoutNeighborhoods } = req.body;
      // L27-P3: pull the confirmed map point out and STRIP any client-sent
      // latitude/longitude/locationPrecision — precision is derived server-side and
      // is 'exact' only for a point the earner actually confirmed (§13; see
      // utils/service-location.ts for the full rule set).
      const { body: bodyWithoutLocation, patch: locationPatch } = extractServiceLocation(bodyWithoutNeighborhoods);
      // Sanitize provider-authored free-text fields to strip HTML injection vectors before
      // they reach the database, emails, or AI prompts (task 1135 / task 1138).
      const input = sanitizeStringFields(insertProviderServiceSchema.parse(bodyWithoutLocation) as Record<string, unknown>);

      // Meeting-point completeness gate: an in-person/hybrid service can't go live (status:"active")
      // without telling the traveler where to meet. Draft saves are exempt. Grandfathers existing
      // listings (only enforced on this publish write).
      if (input.status === "active" && ["in_person", "hybrid"].includes((input as any).deliveryMethod)
          && !((input as any).meetingPoint ?? "").toString().trim()) {
        return res.status(400).json({
          message: "In-person services need a meeting point before publishing. Save as draft to finish later.",
          code: "MEETING_POINT_REQUIRED",
        });
      }

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

      // EX-2 publish gate: a listing cannot go LIVE without a positive price. Runs AFTER the
      // package_tiers recompute above (so a tiers listing is judged on its derived scalar) and
      // only on status:"active" — a draft with price "0" (ServiceForm's price-not-set default)
      // still saves. Negative prices never get this far (schema-level floor). Same
      // draft-exempt shape as the meeting-point gate above.
      if (input.status === "active") {
        const effPrice = Number((input as any).price);
        if (!Number.isFinite(effPrice) || effPrice <= 0) {
          return res.status(400).json({
            message: "Set a price greater than zero before publishing. Save as draft to finish later.",
            code: "PRICE_REQUIRED",
          });
        }
      }

      // FP-1 / B7 DELIVERABLE PUBLISH GATE (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1) —
      // placed beside the price gate, on the same draft-exempt rule (ruling 56's placement
      // discipline). The wizard labels the field "Deliverable File URL *" and warns in amber, but
      // nothing enforced it: an $18 pdf guide published, went live and was sellable with the
      // column empty, so a buyer could pay and receive nothing. Artifact-delivery only, via the
      // SHARED predicate (isArtifactDelivery — pdf; shared/service-fundamentals.ts), so no other
      // shape is newly blocked. Drafts still save incomplete.
      if (input.status === "active" &&
          isArtifactDelivery({
            deliveryMethod: (input as any).deliveryMethod ?? null,
            productShape: (input as any).productShape ?? null,
          }) &&
          !((input as any).serviceFile ?? "").toString().trim()) {
        return res.status(400).json({
          message: "A downloadable listing needs its deliverable file before publishing — upload the PDF or paste a link. Save as draft to finish later.",
          code: "DELIVERABLE_FILE_REQUIRED",
        });
      }

      // F2 identity (+ business, provider-only) verification publish gate (Phase 0.5 —
      // docs/backoffice/EARN_PIPELINE_EVAL.md). Role-aware — see checkPublishVerificationGate
      // for the full rule (providers: service_provider_forms, both statuses; experts:
      // local_expert_forms, identity only; admin bypass via DB role lookup; default-deny
      // otherwise). Ratified Aug 10 2026 — QA_PUNCH_LIST.md P0.
      if (input.status === "active") {
        const gateResult = await checkPublishVerificationGate(userId);
        if (gateResult) {
          return res.status(gateResult.status).json(gateResult.body);
        }
      }

      // SS-5a ATTESTATION PUBLISH GATE (ruling 69 disposition 3) — beside the F2 gate, at the same
      // choke point, on the same draft-exempt rule. A CREATE is always a transition to active when
      // `status:'active'`, so grandfathering has nothing to say here. The affirmations travel with
      // the write (see the service header for why a child row cannot pre-exist a create), are
      // re-validated against the SERVER-resolved applicable set, and are recorded after the row
      // exists.
      const attestShapeCreate = await resolveAttestationShape({
        overrides: {
          deliveryMethod: (input as any).deliveryMethod ?? null,
          productShape: (input as any).productShape ?? null,
          categoryId: (input as any).categoryId ?? null,
        },
      });
      const affirmRequestedCreate = readAffirmAttestationsField(req.body) ?? [];
      const affirmCheckCreate = validateAffirmKeys(affirmRequestedCreate, attestShapeCreate);
      if (!affirmCheckCreate.ok) {
        return res.status(affirmCheckCreate.refusal.status).json(affirmCheckCreate.refusal.body);
      }
      if (input.status === "active") {
        const attestGate = await checkAttestationPublishGate({
          shape: attestShapeCreate,
          affirmingNow: affirmCheckCreate.keys,
        });
        if (attestGate) {
          return res.status(attestGate.status).json(attestGate.body);
        }
      }

      // D7 (docs/DECISIONS.md ruling 62): the service-logistics capture fields ride this same
      // deliberate write, exactly like `serviceRadius`/`meetingPoint` beside them — they are
      // ordinary owner-authored listing facts, NOT privileged §14/§18/§19 fields (no amount, no
      // identity, no rate), so they need no allowlist/strip. Their vocabularies are enforced by
      // insertProviderServiceSchema above (no DB CHECK — migration-195 posture).
      // FP-1 / B4 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1): `city` is SERVER-DERIVED from the
      // neighborhood slug this write stores — the one structured location signal a listing carries
      // — and only when that slug resolves to exactly one city. Never read from the body, never
      // parsed out of the free-text `location`, NULL when unresolvable (§13; see
      // utils/service-city.ts for the full rule set). Any client-sent `city` is dropped here.
      const { city: _clientCity, ...inputWithoutCity } = input as any;
      const cityPatch = await deriveCityPatch((input as any).neighborhood, {
        neighborhoodPresent: (input as any).neighborhood !== undefined,
      });
      const service = await storage.createProviderService({ ...inputWithoutCity, ...locationPatch, ...cityPatch, userId });

      // The affirmations validated above, now that the child row has a parent. Append-only and
      // idempotent (UNIQUE + ON CONFLICT DO NOTHING); `affirmedBy` is stamped from the session.
      if (affirmCheckCreate.keys.length > 0) {
        await storage.affirmServiceAttestations(service.id, affirmCheckCreate.keys, userId);
      }

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

      // CC-8: revenueShareRate is a commission split (§18) — never client-settable AND never
      // client-visible. ServiceForm.tsx's create mutation only reads service.id/status/
      // approvalStatus from this response (verified); omit just this one verified field
      // rather than a full allowlist — provider_services is large and read by several
      // other unaudited surfaces this endpoint's response itself does not feed.
      // SS-5c SOFT WARNING (ruling 69 disposition 5) — advisory, non-blocking, never auto-editing.
      // Attached to a SUCCESSFUL response: the listing genuinely saved, and the warning is a nudge
      // toward the `title_claim_honesty` statement, not a verdict. Absence proves nothing (§13).
      const titleWarning = detectProtectedTitleClaims({
        serviceName: (input as any).serviceName,
        description: (input as any).description,
      });
      res.status(201).json({
        ...omitFields(service, ["revenueShareRate"] as const),
        ...(titleWarning ? { warnings: { protectedTitleClaim: titleWarning } } : {}),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof ServiceLocationError) {
        return res.status(400).json({ message: err.message, code: "INVALID_LOCATION_POINT" });
      }
      console.error("Error creating provider service:", err);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  // Verification status for the current authenticated provider/expert
  app.get("/api/provider/verification-status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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

  // Provider self-service: request a background/category verification review.
  // Sets providerVerificationStatus → "requested" (a non-verified state, so the
  // publish gate still blocks) and drops a row into the existing admin_notifications
  // queue so admins see it where they already look. Idempotent: an already-"requested"
  // (or "verified") provider does not re-notify. Admin flips to "verified" in
  // admin/providers.tsx after manual review.
  app.post("/api/provider/request-verification-review", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const [userRow] = await db.select({
        providerVerificationStatus: users.providerVerificationStatus,
        email: users.email,
      }).from(users).where(eq(users.id, userId));

      const current = userRow?.providerVerificationStatus ?? "pending";
      if (current === "verified") {
        return res.json({ providerVerificationStatus: "verified", alreadyRequested: false });
      }
      if (current === "requested") {
        // Already in the queue — no duplicate notification.
        return res.json({ providerVerificationStatus: "requested", alreadyRequested: true });
      }

      await storage.updateProviderVerification(userId, { providerVerificationStatus: "requested" });

      // Non-fatal: the state change is the important part; the notification is a surfacing aid.
      try {
        await db.insert(adminNotifications).values({
          type: "provider_verification_request",
          message: `Provider ${userRow?.email ?? userId} requested a background/category verification review.`,
          isRead: false,
          metadata: { userId, kind: "provider_verification_request" },
        });
      } catch (notifErr: any) {
        console.warn("[Verification] admin_notifications insert failed (non-fatal):", notifErr?.message);
      }

      res.json({ providerVerificationStatus: "requested", alreadyRequested: false });
    } catch (err) {
      console.error("Error requesting verification review:", err);
      res.status(500).json({ message: "Failed to request verification review" });
    }
  });

  // Update a service
  app.patch("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const services = await storage.getProviderServices(userId);
      const ownedService = services.find(s => s.id === req.params.id);
      if (!ownedService) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      // Extract neighborhoods before schema parse (not a DB column).
      // Also capture approvalStatus before schema parse — the generic updater strips it
      // for security (prevents self-approval), but "submitted" is a legitimate provider
      // action handled via the dedicated submitProviderServiceListing path below.
      const requestedApprovalStatus: string | undefined = req.body.approvalStatus;
      const { neighborhoods: neighborhoodSlugs, ...bodyWithoutNeighborhoods } = req.body;
      // L27-P3: same server-derived location handling as create. A PATCH that carries
      // no `locationPoint` leaves latitude/longitude/location_precision untouched — so a
      // migration-129 'neighborhood_centroid' row is never upgraded to 'exact' by an
      // unrelated edit (§13). `locationPoint: null` is an explicit pin removal.
      const { body: bodyWithoutLocation, patch: locationPatch } = extractServiceLocation(bodyWithoutNeighborhoods);
      // Sanitize provider-authored free-text fields on update (task 1135 / task 1138).
      const input = sanitizeStringFields(insertProviderServiceSchema.partial().parse(bodyWithoutLocation) as Record<string, unknown>);

      // Meeting-point completeness gate on publish — resolve from the patch or the existing row.
      if (input.status === "active") {
        const effMethod = (input as any).deliveryMethod ?? ownedService.deliveryMethod;
        const effMeeting = ((input as any).meetingPoint ?? ownedService.meetingPoint ?? "").toString().trim();
        if (["in_person", "hybrid"].includes(effMethod) && !effMeeting) {
          return res.status(400).json({
            message: "In-person services need a meeting point before publishing. Save as draft to finish later.",
            code: "MEETING_POINT_REQUIRED",
          });
        }
      }

      // EX-2 publish gate (docs/testing/EXPERT_UX_WALKTHROUGH.md): activating a listing requires a
      // positive price — resolved from the patch or the existing row, same shape as the
      // meeting-point gate above. Negative prices never reach here (schema-level floor survives
      // .partial()); this closes the remaining hole where a stored "0" (price-not-set draft) is
      // flipped straight to active.
      if (input.status === "active") {
        const effPrice = Number((input as any).price ?? ownedService.price);
        if (!Number.isFinite(effPrice) || effPrice <= 0) {
          return res.status(400).json({
            message: "Set a price greater than zero before publishing. Save as draft to finish later.",
            code: "PRICE_REQUIRED",
          });
        }
      }

      // FP-1 / B7 DELIVERABLE PUBLISH GATE — same rule as CREATE above, resolved from the patch or
      // the existing row (the meeting-point/price gate shape). This is the arm that also catches a
      // stored draft with an empty deliverable being flipped straight to active, and — because the
      // effective value falls back to the stored one — a row whose file arrived through the
      // owner-gated upload rail (POST .../deliverable-file writes serviceFile directly) publishes
      // with no field in the body at all.
      if (input.status === "active") {
        const effMethodFile = (input as any).deliveryMethod ?? ownedService.deliveryMethod;
        const effProductShape = (input as any).productShape ?? (ownedService as any).productShape ?? null;
        // KEY-PRESENCE, not `??`: an explicit `serviceFile: null` in the body is a CLEAR, and the
        // write below performs it — falling back to the stored value there would pass the gate on
        // a file this very request is about to delete.
        const fileFromBody = Object.prototype.hasOwnProperty.call(input, "serviceFile");
        const effFile = ((fileFromBody ? (input as any).serviceFile : ownedService.serviceFile) ?? "")
          .toString()
          .trim();
        if (isArtifactDelivery({ deliveryMethod: effMethodFile, productShape: effProductShape }) && !effFile) {
          return res.status(400).json({
            message: "A downloadable listing needs its deliverable file before publishing — upload the PDF or paste a link. Save as draft to finish later.",
            code: "DELIVERABLE_FILE_REQUIRED",
          });
        }
      }

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

      // F2 identity (+ business, provider-only) verification publish gate (Phase 0.5 — same
      // rule as CREATE above; see checkPublishVerificationGate). Ratified Aug 10 2026 —
      // QA_PUNCH_LIST.md P0.
      if (input.status === "active") {
        const gateResult = await checkPublishVerificationGate(userId);
        if (gateResult) {
          return res.status(gateResult.status).json(gateResult.body);
        }
      }

      // SS-5a ATTESTATION PUBLISH GATE (ruling 69 disposition 3). GRANDFATHERING lives in the
      // condition: it fires only on a TRANSITION to active, so a listing that is already `active`
      // is never evaluated on an edit and can never be knocked off by this. The shape is the one
      // the listing will HAVE after this save (live row overlaid with the write's own fields), so
      // the gate cannot be walked past by omitting a field from the body.
      const attestShapeUpd = await resolveAttestationShape({
        serviceId: req.params.id,
        overrides: {
          ...((input as any).deliveryMethod !== undefined ? { deliveryMethod: (input as any).deliveryMethod } : {}),
          ...((input as any).productShape !== undefined ? { productShape: (input as any).productShape } : {}),
          ...((input as any).categoryId !== undefined ? { categoryId: (input as any).categoryId } : {}),
        },
      });
      const affirmRequestedUpd = readAffirmAttestationsField(req.body) ?? [];
      const affirmCheckUpd = validateAffirmKeys(affirmRequestedUpd, attestShapeUpd);
      if (!affirmCheckUpd.ok) {
        return res.status(affirmCheckUpd.refusal.status).json(affirmCheckUpd.refusal.body);
      }
      if (affirmCheckUpd.keys.length > 0) {
        // Recorded BEFORE the gate is judged: an affirmation is a statement the provider made, and
        // it is a fact whether or not the publish that carried it succeeds (append-only, ruling 67).
        await storage.affirmServiceAttestations(req.params.id, affirmCheckUpd.keys, userId);
      }
      if (input.status === "active" && ownedService.status !== "active") {
        const attestGate = await checkAttestationPublishGate({
          serviceId: req.params.id,
          shape: attestShapeUpd,
          affirmingNow: affirmCheckUpd.keys,
        });
        if (attestGate) {
          return res.status(attestGate.status).json(attestGate.body);
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

      // D7 NEVER-CLOBBER RULE (docs/DECISIONS.md ruling 62's amendment, §13): declaring a
      // `pickupCoverageMode` switches only what is RENDERED. It must never delete, null or
      // overwrite the other mode's data — so this handler writes the mode column and NOTHING
      // else: it does not touch `serviceRadius`, and it does not touch `service_route_points`
      // (whose one write path is the owner-gated replace-list PUT .../route-points, ruling 22).
      // A provider who picks `radius` keeps every saved route stop, and one who picks `route`
      // keeps their saved radius; the authoring UI says so out loud rather than silently
      // discarding work. Do not "tidy up" by clearing the unused side here.
      //
      // Remove userId from input to prevent ownership transfer
      // FP-1 / B4: `city` is server-derived (utils/service-city.ts), never client-settable — the
      // body's value is dropped and the column is re-derived ONLY when this PATCH carries a
      // neighborhood. A patch that does not mention the neighborhood leaves the stored city
      // exactly as it is (the extractServiceLocation rule-3 never-clobber posture); one that
      // clears it clears the city with it, rather than keeping a city derived from a claim the
      // listing no longer makes.
      const { userId: _, city: _clientCityUpd, ...safeInputWithoutLocation } = input as any;
      const cityPatchUpd = await deriveCityPatch((input as any).neighborhood, {
        neighborhoodPresent: Object.prototype.hasOwnProperty.call(input, "neighborhood"),
      });
      let safeInput = { ...safeInputWithoutLocation, ...locationPatch, ...cityPatchUpd };

      // ── Ruling 112 Q8 (CLAUDE.md §23) — the EDIT SPLIT, decided ONLY here ─────────────────
      // An APPROVED listing is never taken down for an edit. Identity-changing fields are
      // diverted into pending_changes (the approved version stays live and bookable, the admin
      // queue applies them); everything else applies immediately. The split compares against
      // the STORED row — the wizard PATCHes full payloads, so an unchanged serviceName must
      // pass through as a no-op, not trigger a review.
      // S-1 (ledger 2026-08-16-console-sweep): the field list lives in @shared/edit-split so
      // the listing home's "Editing a live listing" panel reads THIS handler's own predicate
      // rather than restating it (§18 rule 1). The split is still decided only here.
      let stagedEditKeys: string[] = [];
      if (ownedService.approvalStatus === "approved") {
        const identityPatch: Record<string, unknown> = {};
        for (const key of IDENTITY_EDIT_FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(safeInput, key)) continue;
          const next = (safeInput as any)[key];
          const stored = (ownedService as any)[key];
          const norm = (v: unknown) => (v === undefined || v === null ? "" : String(v));
          if (norm(next) !== norm(stored)) identityPatch[key] = next;
          delete (safeInput as any)[key]; // unchanged identity keys are no-ops, changed ones are staged — neither touches the live row
        }
        if (Object.keys(identityPatch).length > 0) {
          await storage.stagePendingChanges(req.params.id, identityPatch);
          stagedEditKeys = Object.keys(identityPatch);
        }
      }
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

      // ── Submit-for-review transition ────────────────────────────────────────────────────────
      // The client sends { approvalStatus: "submitted" } from the listing-home "Submit for
      // review" button. The generic updateProviderService call above strips this field (D1a
      // security barrier prevents self-approval). Handle it here via the dedicated storage
      // method, which is the same writer the admin queue uses on the submit side.
      // Only allow the transition from draft/rejected → submitted; ignore it for listings that
      // are already submitted, in_review, or approved (idempotency / no regression).
      // Re-fetch via getProviderServiceById so the response is the raw ProviderService shape
      // the client's ServiceDetail interface expects (serviceName, approvalStatus, etc.), not
      // the mapped ProviderServiceListing shape (title, status/isActive) submitProviderServiceListing returns.
      let finalRow: typeof updated = updated;
      if (
        requestedApprovalStatus === "submitted" &&
        ownedService.approvalStatus !== "submitted" &&
        ownedService.approvalStatus !== "in_review" &&
        ownedService.approvalStatus !== "approved"
      ) {
        await storage.submitProviderServiceListing(req.params.id);
        finalRow = (await storage.getProviderServiceById(req.params.id)) ?? updated;
      }

      // CC-8/T3-4: same omission as POST /api/provider/services — revenueShareRate is a
      // commission split (§18) and must never round-trip to the client, on create OR update.
      // SS-5c SOFT WARNING (ruling 69 disposition 5) — same posture as CREATE. Scanned against
      // the text this write actually produces: the field from the body when it was edited, else
      // the stored value, so an untouched offending description keeps warning on every save.
      const titleWarningUpd = detectProtectedTitleClaims({
        serviceName: (input as any).serviceName ?? finalRow?.serviceName ?? ownedService.serviceName,
        description: (input as any).description ?? finalRow?.description ?? ownedService.description,
      });
      res.json(
        finalRow
          ? {
              ...omitFields(finalRow, ["revenueShareRate"] as const),
              ...(titleWarningUpd ? { warnings: { protectedTitleClaim: titleWarningUpd } } : {}),
              // Ruling 112 Q8: tell the owner which fields went to re-review — the live listing
              // is unchanged for those, and nothing was taken down.
              ...(stagedEditKeys.length > 0
                ? { editReview: { status: "pending", stagedKeys: stagedEditKeys } }
                : {}),
            }
          : finalRow,
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof ServiceLocationError) {
        return res.status(400).json({ message: err.message, code: "INVALID_LOCATION_POINT" });
      }
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  // Submit a draft service for review (provider-owned path)
  app.post("/api/provider/services/:id/submit", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      // Eligibility is based on the review lifecycle (approvalStatus), not the
      // availability toggle (status). A provider may submit from approvalStatus
      // "draft" (never submitted) or "rejected" (resubmitting after admin rejection).
      const currentApproval = service.approvalStatus ?? "draft";
      if (currentApproval !== "draft" && currentApproval !== "rejected") {
        return res.status(400).json({ message: "Only draft or rejected services can be submitted for review" });
      }
      const submitted = await storage.submitProviderServiceListing(req.params.id);
      res.json(submitted ? omitFields(submitted as any, ["revenueShareRate"] as const) : submitted);
    } catch (err) {
      console.error("Error submitting provider service:", err);
      res.status(500).json({ message: "Failed to submit service for review" });
    }
  });

  // Delete a service
  app.delete("/api/provider/services/:id", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const services = await storage.getProviderServices(userId);
    const ownedService = services.find(s => s.id === req.params.id);
    if (!ownedService) {
      return res.status(404).json({ message: "Service not found or not owned by you" });
    }
    try {
      await storage.deleteProviderService(req.params.id);
    } catch (err: any) {
      // Migration 151 RESTRICT: honest 409 when the service sits inside a bundle.
      if (await respondIfServiceInBundle(err, req.params.id, res)) return;
      console.error("Error deleting provider service:", err);
      return res.status(500).json({ message: "Failed to delete service" });
    }
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
          // Both photo providers failed — return a valid empty result rather than a 500.
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
    // Hotellook retired 2026-08 — Travelpayouts shut down the public data API (see hotellook.service.ts).
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
          searchAgoda({ destination: dest, checkIn: pickupDate, checkOut: dropoffDate, limit: 6 })
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
        // §16: deals ship an opaque bookingToken, never the affiliate URL (vaulted server-side).
        return res.json({ ...cached, deals: await vaultAndStripItems(cached.deals) });
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
        return res.json({ ...stale, deals: await vaultAndStripItems(stale.deals), stale: true });
      }

      // 3. Cold fetch: no cache at all → fetch synchronously, then cache
      const fresh = await fetchDealsFromProviders(type, destination, origin);
      await sharedCache.set(DEALS_CACHE_NS, cacheKey, fresh, DEALS_TTL_MS);
      setDealsStale(cacheKey, fresh);
      return res.json({ ...fresh, deals: await vaultAndStripItems(fresh.deals) });
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
        // Sanitize server-side: strip HTML tags / escape dangerous characters (stored-XSS defense)
        const trimmed = sanitizeInput(raw);
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

      await storage.updateLocalExpertFormNeighborhoods(
        userId,
        cleaned,
        sanitizeInput(localityProof ?? ""),
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert neighborhoods:", err);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  // PATCH /api/expert/profile-notes — Save expert's notes style description
  app.patch("/api/expert/profile-notes", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { notesStyle } = req.body;
      if (typeof notesStyle !== "string") {
        return res.status(400).json({ message: "notesStyle must be a string" });
      }
      // Sanitize server-side (stored-XSS defense) and reject empty/whitespace-only input
      const cleanedNotesStyle = sanitizeInput(notesStyle);
      if (!cleanedNotesStyle) {
        return res.status(400).json({ message: "notesStyle cannot be empty" });
      }
      await storage.updateLocalExpertFormNotesStyle(userId, cleanedNotesStyle);
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert notes style:", err);
      res.status(500).json({ message: "Failed to save" });
    }
  });

  // PATCH /api/expert/profile — Save the expert's public profile fields
  // (bio / headline / displayName / first+last name / city / country / languages).
  // Writes name+bio to the users row (the auth identity + public listing source)
  // and the display fields to local_expert_forms (the public detail-page source).
  app.patch("/api/expert/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const body = req.body ?? {};

      const strField = (key: string, max: number): string | undefined => {
        const v = body[key];
        if (v === undefined) return undefined;
        if (typeof v !== "string") throw new Error(`${key} must be a string`);
        // Sanitize server-side: strip HTML tags / escape dangerous characters (stored-XSS defense)
        const trimmed = sanitizeInput(v.trim());
        if (trimmed.length > max) throw new Error(`${key} must be at most ${max} characters`);
        return trimmed;
      };

      let firstName: string | undefined,
        lastName: string | undefined,
        displayName: string | undefined,
        headline: string | undefined,
        bio: string | undefined,
        city: string | undefined,
        country: string | undefined;
      let languages: string[] | undefined;
      try {
        firstName = strField("firstName", 100);
        lastName = strField("lastName", 100);
        displayName = strField("displayName", 100);
        headline = strField("headline", 150);
        bio = strField("bio", 500);
        city = strField("city", 100);
        country = strField("country", 100);
        if (body.languages !== undefined) {
          if (!Array.isArray(body.languages)) throw new Error("languages must be an array");
          const seen = new Set<string>();
          languages = [];
          for (const raw of body.languages) {
            if (typeof raw !== "string") continue;
            // Sanitize server-side (stored-XSS defense)
            const trimmed = sanitizeInput(raw.trim());
            if (!trimmed || trimmed.length > 50) continue;
            const key = trimmed.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              languages.push(trimmed);
            }
          }
          if (languages.length > 20) throw new Error("You can list at most 20 languages");
        }
      } catch (e: any) {
        return res.status(400).json({ message: e.message });
      }

      // users row: identity + the bio the public /api/experts listing reads.
      const userUpdates: Record<string, any> = {};
      if (firstName !== undefined) userUpdates.firstName = firstName;
      if (lastName !== undefined) userUpdates.lastName = lastName;
      if (bio !== undefined) userUpdates.bio = bio;
      if (Object.keys(userUpdates).length > 0) {
        await db.update(users).set(userUpdates).where(eq(users.id, userId));
      }

      // local_expert_forms row: public detail-page display fields.
      const formUpdates: Record<string, any> = {};
      if (firstName !== undefined) formUpdates.firstName = firstName;
      if (lastName !== undefined) formUpdates.lastName = lastName;
      if (displayName !== undefined) formUpdates.displayName = displayName;
      if (headline !== undefined) formUpdates.headline = headline;
      if (bio !== undefined) formUpdates.bio = bio;
      if (city !== undefined) formUpdates.city = city;
      if (country !== undefined) formUpdates.country = country;
      if (languages !== undefined) formUpdates.languages = languages;
      if (Object.keys(formUpdates).length > 0) {
        await storage.updateLocalExpertFormProfileFields(userId, formUpdates);
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert profile:", err);
      res.status(500).json({ message: "Failed to save profile" });
    }
  });

  // PATCH /api/expert/photo — Save the expert's profile photo.
  // Accepts a base64 data URL; server-side validation of type + decoded size.
  app.patch("/api/expert/photo", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { imageData } = req.body ?? {};
      if (typeof imageData !== "string") {
        return res.status(400).json({ message: "imageData must be a base64 data URL string" });
      }
      const match = imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        return res.status(400).json({ message: "Photo must be a PNG, JPEG, or WebP image" });
      }
      const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB decoded
      // base64 → bytes: 4 chars encode 3 bytes.
      const approxBytes = Math.floor((match[2].length * 3) / 4);
      if (approxBytes > MAX_PHOTO_BYTES) {
        return res.status(400).json({ message: "Photo must be smaller than 2 MB" });
      }
      await db.update(users).set({ profileImageUrl: imageData }).where(eq(users.id, userId));
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving expert photo:", err);
      res.status(500).json({ message: "Failed to save photo" });
    }
  });

  // Get current expert's selected services (authenticated)
  app.get("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const services = await storage.getExpertSelectedServices(userId);
    res.json(services);
  });

  // Add service offering to expert's profile (authenticated)
  app.post("/api/expert/selected-services", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const { serviceOfferingId, customPrice } = req.body;
    const service = await storage.addExpertSelectedService(userId, serviceOfferingId, customPrice);
    res.json(service);
  });

  // Remove service offering from expert's profile (authenticated)
  app.delete("/api/expert/selected-services/:serviceOfferingId", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    await storage.removeExpertSelectedService(userId, req.params.serviceOfferingId);
    res.json({ success: true });
  });

  // Get current expert's specializations (authenticated)
  app.get("/api/expert/specializations", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const specializations = await storage.getExpertSpecializations(userId);
    res.json(specializations);
  });

  // Add specialization to expert's profile (authenticated)
  app.post("/api/expert/specializations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { specialization } = req.body;
      if (typeof specialization !== "string") {
        return res.status(400).json({ message: "specialization must be a string" });
      }
      // Sanitize server-side (stored-XSS defense) and reject empty/whitespace-only input
      const cleaned = sanitizeInput(specialization);
      if (!cleaned) {
        return res.status(400).json({ message: "specialization cannot be empty" });
      }
      if (cleaned.length > 100) {
        return res.status(400).json({ message: "specialization must be 100 characters or fewer" });
      }
      const spec = await storage.addExpertSpecialization(userId, cleaned);
      res.json(spec);
    } catch (err) {
      console.error("Error adding expert specialization:", err);
      res.status(500).json({ message: "Failed to add specialization" });
    }
  });

  // Remove specialization from expert's profile (authenticated)
  app.delete("/api/expert/specializations/:specialization", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    await storage.removeExpertSpecialization(userId, req.params.specialization);
    res.json({ success: true });
  });

  // === Expert Custom Services (User-submitted offerings) ===
  
  // Get current expert's custom services (authenticated)
  app.get("/api/expert/service-listings", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const services = await storage.getProviderServiceListings(userId);
    res.json(services);
  });

  // Get single custom service by ID (authenticated - owner only)
  app.get("/api/expert/service-listings/:id", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      const user = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      
      // Full expert family (shared/roles.ts): the previous bare `role !== "expert"` check
      // 403'd local_expert / travel_expert / event_planner off their own listings endpoint.
      if (!user || (!isExpertRole(user.role) && user.role !== "admin")) {
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      // Migration 151 RESTRICT: honest 409 when the service sits inside a bundle
      // (a since-rejected component still occupies its bundle_components row).
      if (await respondIfServiceInBundle(err, req.params.id, res)) return;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      const templates = await storage.getExpertTemplates({ expertId: userId });
      res.json(templates);
    } catch (err) {
      console.error("Error fetching expert templates:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Create new template — RETIRED (seller-surface sunset, §10/§17). Gone tombstone, not a
  // deletion: the route shape stays stable; GET/PATCH/submit/purchase/confirm remain intact.
  app.post("/api/expert/templates", isAuthenticated, async (_req, res) => {
    res.status(410).json({ message: "New itinerary-template listings are retired — build store trips in the Workstation instead." });
  });

  // Update template (authenticated - owner only)
  app.patch("/api/expert/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const adminId = getUserId(req)!;
      const template = await storage.getExpertTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      if (template.approvalStatus !== "submitted") {
        return res.status(400).json({ message: "Can only approve submitted templates" });
      }
      const approved = await storage.approveExpertTemplate(req.params.id, adminId);

      // Rides the blanket /api/admin adminApiGuard (§2) — adminId is already confirmed admin.
      insertAccessAuditLog({
        actorId: adminId,
        actorRole: "admin",
        action: "expert_template_approve",
        resourceType: "expert_template",
        resourceId: req.params.id,
        targetUserId: template.expertId ?? null,
        metadata: {},
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch((err: any) => console.error("[admin/expert-templates] audit log failed (non-fatal):", err));

      res.json(approved);
    } catch (err) {
      console.error("Error approving template:", err);
      res.status(500).json({ message: "Failed to approve template" });
    }
  });

  app.post("/api/admin/expert-templates/:id/reject", async (req, res) => {
    try {
      const adminId = getUserId(req)!;
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

      // Rides the blanket /api/admin adminApiGuard (§2) — adminId is already confirmed admin.
      insertAccessAuditLog({
        actorId: adminId,
        actorRole: "admin",
        action: "expert_template_reject",
        resourceType: "expert_template",
        resourceId: req.params.id,
        targetUserId: template.expertId ?? null,
        metadata: { reason },
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch((err: any) => console.error("[admin/expert-templates] audit log failed (non-fatal):", err));

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
      const userId = getUserId(req)!;
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

      // Resolve commission rates from booking_fee_configs (fallback: fee_bands expert_standard)
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
      const stripeClient = new Stripe(getStripeSecretKey() || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });
      const currency = (template.currency || 'USD').toLowerCase();
      const isZeroDecimal = currency === 'jpy';
      const stripeAmount = isZeroDecimal ? Math.round(price) : Math.round(price * 100);

      const paymentIntent = await stripeClient.paymentIntents.create(
        {
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
        },
        // §15 (MONEY_MAP F-3): deterministic key — a retried purchase click can't mint a second
        // uncaptured PI for the same template+buyer.
        { idempotencyKey: `tpl-buy-${req.params.id}-${userId}` },
      );

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
      const userId = getUserId(req)!;
      const { paymentIntentId, purchaseId } = req.body;

      if (!paymentIntentId || !purchaseId) {
        return res.status(400).json({ message: "paymentIntentId and purchaseId are required" });
      }

      // Retrieve intent from Stripe — never trust client-reported status
      const stripeClient = new Stripe(getStripeSecretKey() || '', {
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

      // Record platform revenue for this sale — mirrors the booking_commission pattern
      // (server/services/booking.service.ts:721-729). §15: guarded by hasPlatformRevenueForSource
      // so a retry/duplicate confirm never double-records; non-fatal so a bookkeeping failure never
      // blocks the buyer's unlocked purchase. storage.createTemplatePurchase's own status-gated write
      // stays dead for this path — this route-level write is authoritative.
      try {
        if (!(await storage.hasPlatformRevenueForSource(completed.id))) {
          const grossAmount = Number(completed.price);
          const platformFeeAmt = Number(completed.platformFee);
          const expertEarningsAmt = Number(completed.expertEarnings);
          const processingFees = platformFeeAmt * PROCESSING_FEE_RATE;
          const netAmount = platformFeeAmt - processingFees;
          await storage.recordPlatformRevenue({
            sourceType: 'template_commission',
            sourceId: completed.id,
            grossAmount: String(grossAmount),
            platformFee: String(platformFeeAmt),
            netAmount: String(netAmount),
            processingFees: String(processingFees),
            currency: completed.currency || 'USD',
            expertId: completed.expertId,
            expertEarnings: String(expertEarningsAmt),
            description: `Template sale commission: ${template?.title ?? completed.templateId}`,
            status: 'recorded',
            transactionDate: new Date(),
          } as any);
        }
      } catch (err) {
        console.error(`Failed to record platform revenue for template purchase ${completed.id}:`, err);
      }

      return res.json({ purchase: completed, template });
    } catch (err) {
      console.error("Error confirming template purchase:", err);
      res.status(500).json({ message: "Failed to confirm template purchase" });
    }
  });

  // Get user's purchased templates
  app.get("/api/my-purchased-templates", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      
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
        review: sanitizeText(req.body.review),
      });

      res.json(review);
    } catch (err) {
      console.error("Error creating review:", err);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // NOTE (task retirement, Aug 2026): the legacy GET /api/expert/earnings endpoint was removed.
  // It built pseudo-transactions from service_bookings (refunded bookings still appeared as earned,
  // grossBookingTotal included refunds, revenueShareRate was a meaningless derived ratio, and
  // lastPayout reported pending payout requests as paid). The live UI and tests use the
  // ledger-backed GET /api/expert/earnings/details (server/routes/experts.routes.ts).

  // Get expert template sales (authenticated)
  app.get("/api/expert/template-sales", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
  // GATED 501 (W0.4): the tip PAYMENT leg does not exist. This handler used to call
  // storage.createExpertTip directly, which writes a real expert_earnings ledger row
  // (held → releasable → payable via the payout rail) plus platform_revenue — from a
  // client-sent amount, with NO Stripe charge anywhere. Any authenticated session could
  // mint payable earnings for free. Re-enable ONLY behind a real two-step payment flow
  // (PaymentIntent create → server-verified confirm → THEN createExpertTip), mirroring
  // the coordination-fee /pay + /pay/confirm pattern (§7/§14/§15). createExpertTip
  // itself is kept in storage — it is the correct post-payment leg.
  app.post("/api/expert/:expertId/tip", isAuthenticated, async (_req, res) => {
    res.status(501).json({
      message: "Tipping is not available yet — tip payment processing has not launched.",
    });
  });

  // Get tips received by expert
  app.get("/api/expert/tips", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      
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
        // Fixed (was Task #1037): pass the proper filter object — the old call passed a
        // bare userId string where {providerId?,travelerId?,status?} is expected, which
        // matched nothing and zeroed the service-revenue figures on this page.
        storage.getServiceBookings({ providerId: userId }),
        storage.getRevenueSplits()
      ]);

      // Get revenue split configurations
      const affiliateSplit = revenueSplits.find((s) => s.type === 'affiliate_commission');
      const tipSplit = revenueSplits.find((s) => s.type === 'tip');
      const serviceSplit = revenueSplits.find((s) => s.type === 'service_booking');
      const templateSplit = revenueSplits.find((s) => s.type === 'template_sale');

      // Expert share fractions for this DISPLAY breakdown: the revenue_splits row wins
      // when present; a missing row band-backs to fee_bands `expert_standard` via
      // resolveExpertSharePct (Task #1036 / ruling 32 — no hardcoded '75' fallback).
      const [serviceExpertPct, templateExpertPct] = await Promise.all([
        resolveExpertSharePct(serviceSplit),
        resolveExpertSharePct(templateSplit),
      ]);
      
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
  // A6: also surfaces the owner's storefront handle (migration 136, users.handle) so the
  // service-detail page can breadcrumb into /p/:handle — additive select, null when unclaimed.
  app.get("/api/providers/:userId/public-verification", async (req, res) => {
    try {
      const [form] = await db.select({
        identityVerificationStatus: serviceProviderForms.identityVerificationStatus,
        businessVerificationStatus: serviceProviderForms.businessVerificationStatus,
      }).from(serviceProviderForms)
        .where(eq(serviceProviderForms.userId, req.params.userId))
        .limit(1);
      // Ledger 90 (FP-5, I3): `displayName` is additive here. The service-detail page's
      // "Contact Provider" CTA needs the owner's display name to open a working chat thread —
      // `/api/experts/:id` resolves EXPERT-FAMILY roles only, so a `service_provider` owner 404s
      // there and chat.tsx's documented `?name=` fallback is the only way through (the same shape
      // the storefront's Message CTA already uses). Derived exactly as storefront.routes.ts
      // derives `earner.name`, so the two surfaces name the same person the same way. Nothing
      // private is added: this name is already public on the storefront and every listing card.
      const [userRow] = await db.select({
        handle: users.handle,
        firstName: users.firstName,
        lastName: users.lastName,
      })
        .from(users)
        .where(eq(users.id, req.params.userId))
        .limit(1);
      const handle = userRow?.handle ?? null;
      const displayName = userRow
        ? ([userRow.firstName, userRow.lastName].filter(Boolean).join(" ") || null)
        : null;
      if (!form) return res.json({ identityVerified: false, businessVerified: false, handle, displayName });
      res.json({
        identityVerified: form.identityVerificationStatus === "verified",
        businessVerified: form.businessVerificationStatus === "verified",
        handle,
        displayName,
      });
    } catch {
      // Fail closed: if the verification profile cannot be read, report as unverified.
      res.json({ identityVerified: false, businessVerified: false, handle: null, displayName: null });
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
    const userId = getUserId(req)!;
    const status = req.query.status as string | undefined;
    const services = await storage.getProviderServicesByStatus(userId, status);
    res.json(services);
  });

  // Toggle service status (pause/activate)
  app.patch("/api/expert/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const { status } = req.body;
      if (!["active", "paused", "draft"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      // F2 publish-verification gate (QA_PUNCH_LIST.md P0 — this was the owner's-own-toggle
      // door the original gate placement missed): re-lives an already-approved listing, so
      // it must pass the same predicate as first publish before landing 'active'. userId
      // here is the owner (already ownership-checked above), same actor the gate expects.
      if (status === "active") {
        const gateResult = await checkPublishVerificationGate(userId);
        if (gateResult) {
          return res.status(gateResult.status).json(gateResult.body);
        }
      }
      // SS-5a ATTESTATION PUBLISH GATE (ruling 69 disposition 3) — the third choke point, same
      // transition rule. This toggle carries no listing fields at all, so the shape is read
      // wholly from the live row, and this door has no inline-affirm path: the provider confirms
      // in the wizard (where the card is) and toggles afterwards.
      if (status === "active" && service.status !== "active") {
        const attestGate = await checkAttestationPublishGate({
          serviceId: req.params.id,
          shape: await resolveAttestationShape({ serviceId: req.params.id }),
        });
        if (attestGate) {
          return res.status(attestGate.status).json(attestGate.body);
        }
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
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const duplicated = await storage.duplicateService(req.params.id, userId);
      // NEW-2 (V3): the raw .returning() row leaks revenueShareRate (§18 read-side) — same
      // projection as the POST/PATCH create paths.
      res.status(201).json(duplicated ? omitFields(duplicated, ["revenueShareRate"] as const) : duplicated);
    } catch (err) {
      // T3-1: this catch previously swallowed the error with no log at all.
      console.error("Error duplicating service (expert route):", err);
      res.status(500).json({ message: "Failed to duplicate service" });
    }
  });

  // Provider-namespaced duplicate (same logic + ownership gate as the expert path). Both roles'
  // services live in provider_services; duplicateService resets the copy to approval 'submitted'
  // and status 'draft' (F2 — a copy of an approved listing is never born-approved).
  app.post("/api/provider/services/:id/duplicate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const service = await storage.getProviderServiceById(req.params.id);
      if (!service || service.userId !== userId) {
        return res.status(404).json({ message: "Service not found or not owned by you" });
      }
      const duplicated = await storage.duplicateService(req.params.id, userId);
      // NEW-2 (V3): same §18 read-side projection as the expert duplicate above.
      res.status(201).json(duplicated ? omitFields(duplicated, ["revenueShareRate"] as const) : duplicated);
    } catch (err) {
      // T3-1: this catch previously swallowed the error with no log at all — the always-500
      // trackingNumber collision was invisible in server logs. Log it now.
      console.error("Error duplicating service (provider route):", err);
      res.status(500).json({ message: "Failed to duplicate service" });
    }
  });

  app.post("/api/expert/services/from-template/:templateId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      const status = req.query.status as string | undefined;
      const bookings = await storage.getServiceBookings({ travelerId: userId, status });
      const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
        const rawService = await storage.getProviderServiceById(booking.serviceId);
        const provider = await storage.getUser(booking.providerId);
        // D3 leak-prevention: this is the traveler's OWN booking, but the booking can exist
        // in a pre-payment claim state (§15b) before it is ever confirmed — serviceFile is
        // the product itself and must never ride a general read. The one sanctioned reveal
        // is GET /api/service-bookings/:id/deliverable, gated on a CONFIRMED booking.
        //
        // S9 (ledger row 102): joinLink is the same shape of sensitive field, but handled here
        // as a CONDITIONAL INCLUDE rather than a blanket strip — this IS the traveler's own
        // confirmed-booking read (riding an existing read, per the ballot's REC, rather than a
        // new endpoint), so each row carries its own reveal decision. The gate mirrors
        // GET /api/service-bookings/:id/deliverable EXACTLY: booking.travelerId === session
        // user (this whole list is already scoped to travelerId=userId above), booking.status
        // === 'confirmed' (never 'payment_pending', §15b), and the service's deliveryMethod is
        // a scheduled remote session (SESSION_END_METHODS — call/video). A PENDING advisor has
        // no read path onto this endpoint at all (it is travelerId-scoped, not advisor-scoped),
        // so no separate advisor exclusion is needed here.
        const revealJoinLink =
          !!rawService &&
          booking.status === "confirmed" &&
          SESSION_END_METHODS.has(rawService.deliveryMethod ?? "");
        let service = rawService ? omitFields(rawService, ["serviceFile", "joinLink"] as const) : rawService;
        // S8/G2 (docs/briefs/WAVE3_SCHEMA_PROPOSALS.md, ledger row 102): the property/room exact
        // pin is a §15b-gated reveal too — a payment_pending (or any non-confirmed) claim on a
        // property must NOT expose the exact coordinates just because it's the traveler's own
        // booking. Mirrors the /deliverable gate's status check. Once confirmed, the row is left
        // exactly as-is (the exact pin, honestly).
        if (service && booking.status !== "confirmed") {
          service = applyPropertyLocationPrivacy(service as any) as typeof service;
        }
        return {
          ...booking,
          service: service && revealJoinLink ? { ...service, joinLink: rawService!.joinLink ?? null } : service,
          provider: provider ? { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, profileImage: provider.profileImage } : null,
        };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("Service bookings error:", err);
      res.status(500).json({ message: "Failed to fetch service bookings" });
    }
  });

  // R4 (docs/DECISIONS.md ruling 58; QA_PUNCH_LIST.md P1): `objstore:<key>` is the by-construction
  // discriminator (the ruling-56/§15b pattern) between a platform-managed upload — proxied,
  // revocable — and a legacy pasted URL — link delivery, unrevokable — sharing the SAME
  // provider_services.serviceFile column. No new column, no enum change (publish-trap avoidance).
  const DELIVERABLE_OBJSTORE_PREFIX = "objstore:";
  const DELIVERABLE_MAX_BYTES = 20 * 1024 * 1024; // 20MB
  const PDF_MAGIC = Buffer.from("%PDF-");

  // R4 upload intake — owner-gated (same session/ownership check as the rest of
  // POST/PATCH /api/provider/services; serviceFile is not a privileged §14/§18/§19 field, so no
  // allowlist/omit is needed here either). No multipart plumbing exists anywhere in this codebase
  // (no multer/busboy/formidable) — `express.raw()` reads the whole PDF into one Buffer, scoped to
  // THIS route only so the global express.json() body parser (server/index.ts) is untouched for
  // every other route.
  app.post(
    "/api/provider/services/:id/deliverable-file",
    isAuthenticated,
    express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "20mb" }) as RequestHandler,
    async (req, res) => {
      try {
        const userId = getUserId(req)!;
        const service = await storage.getProviderServiceById(req.params.id);
        if (!service || service.userId !== userId) {
          return res.status(404).json({ message: "Service not found or not owned by you" });
        }
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({
            message: "Send the file as a raw request body with Content-Type: application/pdf",
            code: "DELIVERABLE_FILE_REQUIRED",
          });
        }
        const buffer: Buffer = req.body;
        if (buffer.length > DELIVERABLE_MAX_BYTES) {
          return res.status(400).json({
            message: "File exceeds the 20MB deliverable size limit",
            code: "DELIVERABLE_TOO_LARGE",
          });
        }
        // Content-Type is client-declared and not trusted on its own; the magic-byte check is
        // the real gate for this pdf-only rail (D3 scope — shared/service-fundamentals.ts
        // ARTIFACT_DELIVERY_METHODS = {"pdf"}).
        if (!buffer.subarray(0, 5).equals(PDF_MAGIC)) {
          return res.status(400).json({ message: "Only PDF files are accepted", code: "DELIVERABLE_NOT_PDF" });
        }

        // Unguessable key regardless of the bucket's actual public/private posture (see the
        // privacy finding in server/infrastructure/object-storage.ts) — never serviceId/filename
        // alone.
        const key = `deliverables/${service.id}/${randomBytes(16).toString("hex")}.pdf`;
        const { uploadBuffer, deleteObject } = await import("./infrastructure/object-storage");
        try {
          await uploadBuffer(key, buffer);
        } catch (storageErr) {
          // Honest degradation when REPLIT_OBJECT_STORAGE_BUCKET is absent (this container, any
          // cold Replit start before a bucket is attached) — a clear error, never a crash, never
          // a fabricated success.
          console.error("Deliverable upload failed:", storageErr);
          return res.status(503).json({
            message: "Object storage is not available right now. Try again shortly.",
            code: "OBJECT_STORAGE_UNAVAILABLE",
          });
        }

        // Best-effort cleanup of the PREVIOUS managed object, if any — never blocks the response.
        const previous = (service.serviceFile ?? "").trim();
        if (previous.startsWith(DELIVERABLE_OBJSTORE_PREFIX)) {
          deleteObject(previous.slice(DELIVERABLE_OBJSTORE_PREFIX.length)).catch(() => {});
        }

        await storage.updateProviderService(service.id, { serviceFile: `${DELIVERABLE_OBJSTORE_PREFIX}${key}` });

        // Never echo the key/URL back, even to the owner — the point of the rail is that no
        // location is ever disclosed outside the server.
        res.json({ message: "Deliverable file uploaded", protected: true });
      } catch (err) {
        console.error("Deliverable upload error:", err);
        res.status(500).json({ message: "Failed to upload deliverable file" });
      }
    },
  );

  // D3 (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md): the post-purchase delivery surface for
  // artifact-delivery (pdf) services. Server-derives EVERY condition — never trusts client
  // state (§14 posture, extended to this non-money reveal because the asset itself is the
  // thing of value): (1) the booking exists and belongs to the SESSION user (travelerId, never
  // req.body), (2) its status is 'confirmed' (a payment_pending claim — §15b — never unlocks
  // the file), (3) its service's deliveryMethod is an artifact-delivery method
  // (isArtifactDelivery — pdf only), (4) the service actually carries a serviceFile. Any one
  // condition failing is an honest, undifferentiated 404 (§13 — never leaks WHICH condition
  // failed to a caller probing booking ids that aren't theirs).
  //
  // R4 (ruling 58): once entitlement is granted, branch on the STORED VALUE. A
  // `DELIVERABLE_OBJSTORE_PREFIX`-prefixed key is a platform-managed upload — the bytes are
  // downloaded server-side and STREAMED; the storage location is never returned, redirected to,
  // or otherwise disclosed. A legacy plain URL keeps the pre-R4 JSON-reveal shape for backward
  // compatibility, now carrying an explicit `protected: false` honesty marker.
  //
  // R5: every SUCCESSFUL fetch (either shape) writes one deliverable_downloads row — the download
  // signal a future D8 auto-complete pass would need (this endpoint implements no completion
  // logic itself; D8 is unruled).
  app.get("/api/service-bookings/:id/deliverable", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Deliverable not found" });
      }
      if (booking.status !== "confirmed") {
        return res.status(404).json({ message: "Deliverable not found" });
      }
      if (!booking.serviceId) {
        return res.status(404).json({ message: "Deliverable not found" });
      }
      const service = await storage.getProviderServiceById(booking.serviceId);
      if (!service || !isArtifactDelivery({ deliveryMethod: service.deliveryMethod, productShape: service.productShape })) {
        return res.status(404).json({ message: "Deliverable not found" });
      }
      const fileValue = (service.serviceFile ?? "").trim();
      if (!fileValue) {
        // §13: honest absence — the booking and service are real and qualify, but the
        // provider hasn't uploaded anything yet. Distinguishable from "not found" so the
        // client can render "not uploaded yet" instead of a generic error.
        return res.status(404).json({ message: "The provider hasn't uploaded a deliverable yet", code: "NO_DELIVERABLE_UPLOADED" });
      }

      const logDownload = (isProtected: boolean) =>
        db.insert(deliverableDownloads).values({
          bookingId: booking.id,
          serviceId: service.id,
          userId,
          protected: isProtected,
        }).catch((logErr) => console.error("Deliverable download log failed:", logErr));

      if (fileValue.startsWith(DELIVERABLE_OBJSTORE_PREFIX)) {
        const key = fileValue.slice(DELIVERABLE_OBJSTORE_PREFIX.length);
        let bytes: Buffer;
        try {
          const { downloadBytes } = await import("./infrastructure/object-storage");
          bytes = await downloadBytes(key);
        } catch (storageErr) {
          console.error("Deliverable download failed:", storageErr);
          return res.status(500).json({ message: "Failed to fetch deliverable" });
        }
        await logDownload(true);
        const filename = `${(service.serviceName || "deliverable").replace(/[^a-z0-9.-]/gi, "_").slice(0, 100)}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", String(bytes.length));
        return res.end(bytes);
      }

      await logDownload(false);
      res.json({ fileUrl: fileValue, deliveryMethod: service.deliveryMethod, protected: false });
    } catch (err) {
      console.error("Deliverable fetch error:", err);
      res.status(500).json({ message: "Failed to fetch deliverable" });
    }
  });

  app.get("/api/bookings/user", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const item = await cartProjection.addToCart(userId, {
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

  // Get client profile (for experts/providers) - sanitized view
  // SECURITY: Experts can only see limited client information for their bookings
  app.get("/api/client/:clientId", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
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

  // Create a booking. Body allowlist: `createBookingRequestSchema` (module scope, PS15/ruling 46).
  app.post("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const input = createBookingRequestSchema.parse(req.body);

      // Verify service exists and is active
      const service = await storage.getProviderServiceById(input.serviceId);
      if (!service || service.status !== "active") {
        return res.status(404).json({ message: "Service not found or not available" });
      }

      // §14: the amount comes from the server-side catalog record, never from req.body.
      const totalAmount = Number(service.price) || 0;
      // §8/ruling 42: the split comes from fee_bands through the one existing resolver. A null
      // resolution leaves the derived columns at their DB defaults rather than inventing a rate.
      const ownerShareRate = await resolveServiceOwnerShareRate({
        ownerUserId: service.userId ?? null,
        ownerIsProvider: isProviderRole(
          (await storage.getUser(service.userId ?? ""))?.role,
        ),
        feeCategory: service.categoryId
          ? (await storage.getServiceCategorySlugsByIds([service.categoryId]))[0]?.slug ?? null
          : null,
      });

      const booking = await storage.createServiceBooking({
        ...input,
        travelerId: userId,
        providerId: service.userId,
        totalAmount: totalAmount.toFixed(2),
        ...(ownerShareRate !== null
          ? {
              platformFee: (totalAmount * (1 - ownerShareRate)).toFixed(2),
              providerEarnings: (totalAmount * ownerShareRate).toFixed(2),
            }
          : {}),
      });

      // Increment service bookings count
      await storage.incrementServiceBookings(service.id, totalAmount);

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
  // Booking-owner status control. The owner (provider/expert who owns the
  // service, gated by booking.providerId) may only ACCEPT (confirmed) or DECLINE
  // (cancelled) a booking. "completed" is deliberately NOT allowed here: marking a
  // booking completed fires the escrow earnings side-effect (createProviderEarning),
  // so allowing the owner to set it would let them self-credit. Completion stays
  // traveler/escrow-driven (POST /api/bookings/:id/confirm-completion + the release
  // job). Applied to BOTH the expert and provider status endpoints.
  const OWNER_SETTABLE_BOOKING_STATUSES = ["confirmed", "cancelled"];
  // ── SD-1 (provider money-hardening lane, ruling 42): the FROM-state allow-list ────────────────
  // The handler previously checked only the TARGET status, never the CURRENT one. `service_bookings`
  // rows in `payment_pending` with no `stripe_payment_intent_id` are UNAUTHORIZED PROVISIONAL CLAIMS
  // by construction (§15b / ruling 38) — written before the Stripe call, and visible to the provider
  // (GET /api/provider/bookings applies no status filter; the calendar renders them "Booked"). A
  // provider clicking Accept on one promoted a purchase nobody had paid for, and — because both
  // recovery predicates key on `status='payment_pending'` — permanently stranded the availability
  // slot the claim had consumed: `voidClaim` and `promotePaidCheckout` both matched 0 rows
  // afterwards, and nothing in the codebase gives `vendor_availability_slots.booked_count` back.
  //
  // A provisional claim is UNACCEPTABLE INPUT — rejected, never promoted. The owner rail does not
  // participate in the claim state machine at all; `checkout-claim.service.ts` remains its sole
  // author. `expired` (a swept claim) and the terminal states are likewise not owner-movable.
  const OWNER_BOOKING_TRANSITIONS: Record<string, readonly string[]> = {
    // Accept: only a request-rail booking awaiting the owner's answer.
    confirmed: ["pending"],
    // Decline / cancel: an unanswered request, or an already-accepted booking. NOTE this keeps the
    // pre-existing cancel-a-confirmed-booking behaviour verbatim — the missing-refund question on
    // that edge is a SEPARATE, still-unruled finding (audit SD-2 / Q2) and is deliberately not
    // changed here rather than silently altered under cover of this fix.
    cancelled: ["pending", "confirmed"],
  };
  const handleOwnerBookingStatus = async (req: any, res: any) => {
    try {
      const userId = getUserId(req)!;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.providerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const { status } = req.body;
      // Normalize and validate the optional decline reason via the shared utility so the
      // server-side check and the unit-tested production code are the same code path.
      const reasonResult = normalizeDeclineReason(req.body.reason);
      if (!reasonResult.ok) {
        return res.status(reasonResult.status).json({ message: reasonResult.message });
      }
      const reason = reasonResult.reason;
      if (!OWNER_SETTABLE_BOOKING_STATUSES.includes(status)) {
        return res.status(400).json({
          message: "You can only accept (confirmed) or decline (cancelled) a booking. Completion is confirmed by the traveler.",
        });
      }
      const allowedFrom = OWNER_BOOKING_TRANSITIONS[status];
      // Fast, legible rejection. This is NOT the guard — it is the good error message. The GUARD is
      // the atomic conditional below (§15: a check-then-update is the TOCTOU bug, not a guard), so a
      // concurrent caller that also passes this check still loses at the UPDATE.
      if (!allowedFrom.includes(booking.status ?? "")) {
        return res.status(409).json({
          message: `This booking is "${booking.status}" and cannot be moved to "${status}". A checkout still awaiting payment is not yours to accept — it resolves itself when the traveler pays, or is released automatically if they do not.`,
          currentStatus: booking.status,
        });
      }
      // Owner cancels a PAID booking → the traveler gets a FULL refund (service price + platform
      // fee + insurance fee — never policy-scaled: a provider-initiated cancellation is the
      // provider's doing, so the traveler is made whole; platform-owner ruling 2026-08-10) and an
      // in-app notification. Refund BEFORE any terminal status write (retry-safe: on Stripe
      // failure refundServiceBooking restores the prior status and throws, so the booking stays
      // cancellable). refundServiceBooking's atomic claim (pending/confirmed → refunded) is the
      // concurrency guard — a simultaneous traveler cancel and owner cancel issue at most ONE refund.
      if (status === "cancelled" && booking.stripePaymentIntentId) {
        // A stamped PI is NOT proof of payment (a pending request-rail booking can carry a
        // never-charged intent). Only a Stripe-verified `succeeded` PI enters the refund branch;
        // anything else is an unpaid cancellation and falls through to the plain status flip.
        let piSucceeded = false;
        try {
          const { stripe } = await import("./services/stripe-payment.service");
          const pi = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          piSucceeded = pi.status === "succeeded";
        } catch (piErr) {
          console.error("Provider cancel: PI lookup failed, treating as unpaid:", piErr);
        }
        if (piSucceeded) {
          const amountPaid =
            parseFloat(booking.totalAmount || "0") +
            parseFloat((booking as any).platformFee || "0") +
            parseFloat((booking as any).insuranceFee || "0");
          try {
            const { stripePaymentService } = await import("./services/stripe-payment.service");
            const refundResult = await stripePaymentService.refundServiceBooking(
              req.params.id,
              reason || "cancelled_by_provider",
              { amountOverride: amountPaid },
            );
            if (refundResult?.alreadyRefunded) {
              // Another path (e.g. a concurrent traveler cancel) won the atomic refund claim and
              // owns the ledger reversal + notification — report factually, fire no side-effects.
              const refreshed = await storage.getServiceBooking(req.params.id);
              return res.json({ ...refreshed, refund: { issued: false, alreadyRefunded: true } });
            }
            // This caller WON the refund claim — apply the matching full-fraction ledger
            // compensation (idempotent flips; a crash here is repaired by the admin refund
            // rail re-running them, never by a second Stripe refund).
            await storage.reverseEarningsForBooking(req.params.id);
            await storage.reversePlatformRevenueForBooking(req.params.id, new Date(), 1);
            await db.execute(sql`
              UPDATE service_bookings
              SET cancelled_at = NOW(), cancellation_reason = ${reason ?? "Cancelled by the provider"}, updated_at = NOW()
              WHERE id = ${req.params.id}
            `);
            const { revertPurchasedItemsForBooking } = await import("./services/item-routing.service");
            await revertPurchasedItemsForBooking(req.params.id);
            if (booking.travelerId) {
              try {
                await storage.createNotification({
                  userId: booking.travelerId,
                  type: "booking_cancelled",
                  title: "Booking cancelled by provider — full refund issued",
                  message: reason
                    ? `Your booking ${booking.trackingNumber ?? ""} was cancelled by the provider. A full refund of $${amountPaid.toFixed(2)} has been issued to your original payment method. Reason: ${reason}`
                    : `Your booking ${booking.trackingNumber ?? ""} was cancelled by the provider. A full refund of $${amountPaid.toFixed(2)} has been issued to your original payment method.`,
                  relatedId: req.params.id,
                  relatedType: "booking",
                  data: { bookingId: req.params.id, refundAmount: amountPaid, cancelledBy: "provider", ...(reason ? { reason } : {}) },
                });
              } catch (notifyErr) {
                console.error("Failed to notify traveler of provider cancellation:", notifyErr);
              }
              // Send a cancellation + refund email so the traveler sees both the reason and
              // confirmation that their money is being returned.
              try {
                const traveler = await storage.getUser(booking.travelerId);
                if (traveler?.email) {
                  const { sendBookingCancellationWithRefundEmail } = await import("./services/email.service");
                  await sendBookingCancellationWithRefundEmail({
                    toEmail: traveler.email,
                    travelerName: traveler.firstName ?? null,
                    bookingTrackingNumber: booking.trackingNumber ?? null,
                    serviceName: (booking as any).serviceName ?? null,
                    refundAmount: amountPaid,
                    cancellationReason: reason ?? null,
                  });
                }
              } catch (emailErr) {
                console.error("Failed to send cancellation+refund email to traveler:", emailErr);
              }
            }
            const refreshed = await storage.getServiceBooking(req.params.id);
            return res.json({ ...refreshed, refund: { issued: true, amount: refundResult?.amount ?? amountPaid } });
          } catch (refundErr: any) {
            console.error("Provider cancellation refund error:", refundErr);
            return res.status(502).json({
              message: "The refund could not be issued, so the booking was NOT cancelled. Please try again.",
              error: refundErr?.message,
            });
          }
        }
      }

      // QA-2 (ledger 96, Finding A/B): the traveler notification for BOTH the accept and the
      // unpaid-decline branches now travels IN the same transaction as the status flip (see
      // storage.updateServiceBookingStatus) instead of a separate best-effort call after commit —
      // a crash between the flip and the old separate write left a status change with no
      // notification, and the atomic-conditional guard turned a client retry into a 409 that could
      // never repair it. dedupeKey = `booking:<id>:<event>` makes a concurrent duplicate/retry of
      // this SAME transition a no-op (ON CONFLICT DO NOTHING on notifications.dedupe_key).
      const notify: BookingStatusNotification | undefined = booking.travelerId
        ? status === "confirmed"
          ? {
              userId: booking.travelerId,
              type: "booking_confirmed",
              title: "Booking accepted",
              message: `Your booking ${booking.trackingNumber ?? ""} was accepted by the provider.`,
              data: { bookingId: req.params.id, acceptedBy: "provider" },
              dedupeKey: `booking:${req.params.id}:accepted`,
            }
          : {
              // Reached only for an UNPAID cancellation (a stamped-but-not-succeeded PI falls
              // through to this same branch — see the piSucceeded check above) — the paid-refund
              // branch above returns earlier with its own notification.
              userId: booking.travelerId,
              type: "booking_cancelled",
              title: "Booking declined by provider",
              message: reason
                ? `Your booking ${booking.trackingNumber ?? ""} was declined by the provider. Reason: ${reason}`
                : `Your booking ${booking.trackingNumber ?? ""} was declined by the provider.`,
              data: { bookingId: req.params.id, cancelledBy: "provider", ...(reason ? { reason } : {}) },
              dedupeKey: `booking:${req.params.id}:cancelled`,
            }
        : undefined;

      const updated = await storage.updateServiceBookingStatus(req.params.id, status, reason, allowedFrom, notify);
      if (!updated) {
        // Lost the atomic race (or the row vanished): another actor moved it first. Exactly one
        // caller wins; the loser changes nothing and fires no side-effects — including no
        // notification (the notify insert lives inside the same transaction the lost race rolled
        // back).
        return res.status(409).json({ message: "This booking changed before your update was applied. Reload and try again." });
      }

      // Send a decline email so the traveler sees the reason even if they don't check the app.
      // Non-fatal: a delivery failure must never roll back the already-committed status flip.
      if (status === "cancelled" && booking.travelerId) {
        try {
          const traveler = await storage.getUser(booking.travelerId);
          if (traveler?.email) {
            const { sendBookingDeclineEmail } = await import("./services/email.service");
            await sendBookingDeclineEmail({
              toEmail: traveler.email,
              travelerName: traveler.firstName ?? null,
              bookingTrackingNumber: booking.trackingNumber ?? null,
              serviceName: (booking as any).serviceName ?? null,
              declineReason: reason ?? null,
            });
          }
        } catch (emailErr) {
          console.error("Failed to send decline email to traveler:", emailErr);
        }
      }

      // E1: trip-share bridge. When an EXPERT accepts a booking that carries a
      // tripId (routes.ts /api/expert-booking-requests stores it on the
      // service_bookings.tripId column), create-or-reuse the trip_expert_advisors
      // row linking that trip to the accepting expert so the shared trip appears
      // in their Workstation. Session-verified acting expert (booking.providerId
      // === userId, checked above) — never from body (§14). Idempotent (§15): the
      // table has a UNIQUE(tripId, localExpertId) index, so an existing row (any
      // status) is reused rather than re-inserted; a pending row is atomically
      // flipped to accepted. Accept-only — decline/other statuses never reach here.
      if (status === "confirmed" && booking.tripId) {
        try {
          const [ownerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (isExpertRole(ownerRow?.role)) {
            const existing = await storage.getTripExpertAdvisoryAssignment(booking.tripId, userId);
            if (!existing) {
              await storage.createTripExpertAdvisor({
                tripId: booking.tripId,
                localExpertId: userId,
                status: "accepted",
              });
            } else if (existing.status === "pending") {
              await storage.acceptTripAssignment(existing.id, userId);
            }
            // Any other existing status (already accepted, rejected) is left as-is.
          }
        } catch (bridgeErr) {
          // Non-fatal: the booking accept itself must still succeed.
          console.error("Failed to bridge booking accept to trip_expert_advisors:", bridgeErr);
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update booking status" });
    }
  };
  app.patch("/api/expert/bookings/:id/status", isAuthenticated, handleOwnerBookingStatus);
  // Provider-named alias — the provider bookings page had NO accept/fulfill surface
  // (only experts had one), so provider bookings dead-ended at "pending". Same
  // ownership gate + transition allow-list.
  app.patch("/api/provider/bookings/:id/status", isAuthenticated, handleOwnerBookingStatus);

  // ── D8 OWNER-DECLARED COMPLETION (docs/DECISIONS.md ruling 63, executed by ruling 66) ────────
  //
  // Ruling 63 makes three of the six completion rules the OWNER's to declare: `session_end`
  // (call/video/voice_notes — "session end per booked slot, provider-confirmed"),
  // `provider_declared` (async_messaging — "SLA satisfied + scope delivered, provider-declared,
  // disputable window") and `bundle_components` ("all components complete").
  //
  // HOW THIS RECONCILES WITH THE `status` RAIL ABOVE, which deliberately refuses `completed`
  // ("marking a booking completed fires the escrow earnings side-effect, so allowing the owner to
  // set it would let them self-credit"). That objection is answered here, not waived:
  //   (1) it is not a free-text status write — the rule is resolved SERVER-SIDE from the service
  //       row via the shared `completionRuleFor`, and an owner may only declare the rules ruling
  //       63 assigns them. in_person/hybrid stay traveler-driven and pdf/property stay
  //       timer-driven; both are REFUSED here with a stated reason;
  //   (2) `session_end` is EVIDENCE-GATED against the booked slot's own end time — a provider
  //       cannot declare a session complete before it has happened, and a booking with no slot or
  //       no slot end time is refused rather than guessed (§13);
  //   (3) completion is not payout. The flip mints a HELD earning whose clearance window IS the
  //       traveler's dispute window (`holdWindowDays('service_booking')` — the same constant
  //       `POST /api/bookings/:id/dispute` enforces), so a wrongly-declared completion is
  //       disputable and reversible for the whole window before any money moves.
  //
  // BODY IS AN EXPLICIT ALLOWLIST (§19): the ONLY field read is `componentServiceId`, and only
  // for a bundle. The acting user comes from the session, the booking from the path, and every
  // amount/rate from the server-side record (§14/§18) — this handler reads none of them.
  const handleOwnerBookingComplete = async (req: any, res: any) => {
    try {
      const userId = getUserId(req)!;
      const booking = await storage.getServiceBooking(req.params.id);
      // Ownership gate: the booking's service belongs to the session user. Undifferentiated 404
      // so a caller probing ids that are not theirs learns nothing (§13 posture).
      if (!booking || booking.providerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }

      const {
        completeBooking,
        ownerActorFor,
        recordBundleComponentCompletion,
        resolveCompletionEligibility,
      } = await import("./services/booking-completion.service");

      const eligibility = await resolveCompletionEligibility(req.params.id);
      if (!eligibility.rule) {
        return res.status(409).json({
          message: "This booking's completion rule cannot be determined from its service, so it cannot be completed here.",
          reason: eligibility.reason,
        });
      }
      // Ruling 69 disposition 1's NARROW arm. in_person/hybrid is a TIMER rule now, so the owner
      // rail refuses it exactly like pdf/property — EXCEPT for a booking the platform holds no
      // service date for, where the timer can never fire and the owner is the only actor left.
      // The service, not this route, decides that (`ownerDeclarableFallback`), and the flip still
      // mints a HELD earning inside the traveler's dispute window, so the self-credit objection is
      // answered the same way the other owner-declared rules answer it.
      const noDateFallback = eligibility.rule === "service_date_timer" && !!eligibility.ownerDeclarableFallback;
      const actor = noDateFallback ? "provider_declared" : ownerActorFor(eligibility.rule);
      if (!actor) {
        return res.status(409).json({
          message:
            eligibility.rule === "service_date_timer"
              ? "This in-person booking completes automatically after its booked date — you do not need to mark it complete."
              : "This booking completes automatically — you do not need to mark it complete.",
          rule: eligibility.rule,
          reason: "rule_not_owner_declared",
          ...(eligibility.eligibleAt ? { eligibleAt: eligibility.eligibleAt } : {}),
        });
      }

      if (eligibility.rule === "bundle_components") {
        // ALLOWLIST: one field, string, nothing else off the body.
        const componentServiceId =
          typeof req.body?.componentServiceId === "string" ? req.body.componentServiceId.trim() : "";
        if (!componentServiceId) {
          return res.status(400).json({
            message: "Name the bundle component you delivered (componentServiceId).",
            rule: eligibility.rule,
            evidence: eligibility.evidence,
          });
        }
        const outcome = await recordBundleComponentCompletion({
          bookingId: req.params.id,
          componentServiceId,
          actor,
        });
        if (!outcome.recorded) {
          return res.status(400).json({
            message: outcome.unknownComponent
              ? "That service is not one of this bundle's components."
              : "This bundle component could not be recorded.",
            rule: outcome.rule,
            reason: outcome.reason,
            evidence: outcome.evidence,
          });
        }
        // Partial is a SUCCESSFUL record and an explicitly UNCOMPLETED booking — no partial
        // payout exists, and none is implied here (ruling 63: partial routes to the refund lane).
        return res.json({
          recorded: true,
          completed: outcome.completed,
          rule: outcome.rule,
          reason: outcome.reason,
          evidence: outcome.evidence,
        });
      }

      const outcome = await completeBooking({
        bookingId: req.params.id,
        actor,
        reason: noDateFallback ? "d8_owner:service_date_timer_no_date" : `d8_owner:${eligibility.rule}`,
        ...(noDateFallback ? { allowOwnerDeclaredFallback: true } : {}),
      });
      if (!outcome.completed) {
        return res.status(409).json({
          message:
            outcome.reason === "session_not_ended"
              ? "This session has not ended yet."
              : outcome.reason === "no_booked_slot" || outcome.reason === "slot_has_no_end_time"
                ? "This booking has no booked slot with an end time, so its session end cannot be confirmed."
                : "This booking cannot be completed right now.",
          rule: outcome.rule,
          reason: outcome.reason,
          evidence: outcome.evidence,
        });
      }
      return res.json({ completed: true, rule: outcome.rule, evidence: outcome.evidence });
    } catch (err) {
      console.error("Owner booking completion error:", err);
      res.status(500).json({ message: "Failed to complete booking" });
    }
  };
  app.post("/api/provider/bookings/:id/complete", isAuthenticated, handleOwnerBookingComplete);
  app.post("/api/expert/bookings/:id/complete", isAuthenticated, handleOwnerBookingComplete);

  // Update visa application status on a service booking (expert/provider action)
  app.patch("/api/service-bookings/:id/visa-status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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

  // Cancellation refund preview (traveler action) — what the traveler gets back if they cancel
  // NOW, computed from the service's cancellation_policy_type + time-to-scheduled-start
  // (cancellation-policy.service.ts). The confirmation dialog in my-bookings.tsx shows this
  // before the traveler confirms, so there are no surprise deductions.
  app.get("/api/bookings/:id/cancel-preview", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { quoteCancellationForBooking } = await import("./services/cancellation-policy.service");
      const quote = await quoteCancellationForBooking(req.params.id);
      if (!quote || quote.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      const cancellable = quote.bookingStatus === "pending" || quote.bookingStatus === "confirmed";
      const { travelerId, bookingStatus, ...publicQuote } = quote;
      res.json({ ...publicQuote, cancellable, bookingStatus });
    } catch (err) {
      console.error("Cancel preview error:", err);
      res.status(500).json({ message: "Failed to compute cancellation preview" });
    }
  });

  // Cancel booking (traveler action). Enforces the service's cancellation policy: the refund
  // amount is server-derived from policy type + time-to-start — the same computation the
  // preview endpoint above shows the traveler. Non-refundable (and lapsed-window) cancellations
  // set status only; refundable ones also issue the policy-scaled Stripe refund.
  app.post("/api/bookings/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const booking = await storage.getServiceBooking(req.params.id);
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      if (booking.status !== "pending" && booking.status !== "confirmed") {
        return res.status(400).json({ message: "Cannot cancel this booking" });
      }
      const { reason } = req.body;

      const { quoteCancellationForBooking } = await import("./services/cancellation-policy.service");
      const quote = await quoteCancellationForBooking(req.params.id);
      if (!quote) return res.status(404).json({ message: "Booking not found or not yours" });

      const refundDue = quote.automaticRefundAllowed && quote.refundAmount > 0 && !!booking.stripePaymentIntentId;

      let refundResult: any = null;
      let updated: any;
      if (refundDue) {
        // RETRY-SAFE ORDER: refund BEFORE any terminal status write. refundServiceBooking's
        // atomic claim flips pending/confirmed → refunded; if Stripe fails it restores the
        // prior status and throws, so the booking stays cancellable and the traveler can
        // simply retry — no cancelled-but-unrefunded dead end.
        //
        // Ledger: same ledger-first order as POST /api/bookings/refund, but PROPORTIONAL —
        // a partial (e.g. 50%) refund reverses only the refunded fraction of platform
        // revenue, keeping the retained share recognised. Both reversals are idempotent
        // flips, so a Stripe failure + retry re-confirms them as no-ops. Earnings for a
        // pending/confirmed booking don't exist yet (they are created at completion), so a
        // full-fraction earnings reversal is only run for 100% refunds as a safety net —
        // never on a partial refund, where it would wrongly zero any retained share.
        const refundFraction = quote.refundPercent / 100;
        if (quote.refundPercent === 100) {
          await storage.reverseEarningsForBooking(req.params.id);
        }
        await storage.reversePlatformRevenueForBooking(req.params.id, new Date(), refundFraction);

        const { stripePaymentService } = await import("./services/stripe-payment.service");
        refundResult = await stripePaymentService.refundServiceBooking(
          req.params.id,
          reason || "requested_by_customer",
          { amountOverride: quote.refundAmount },
        );

        // Refund succeeded (status now 'refunded') — stamp the cancellation audit fields
        // without touching the terminal status.
        const { db } = await import("./db");
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`
          UPDATE service_bookings
          SET cancelled_at = NOW(), cancellation_reason = ${reason ?? null}, updated_at = NOW()
          WHERE id = ${req.params.id}
        `);
        updated = await storage.getServiceBooking(req.params.id);

        const { revertPurchasedItemsForBooking } = await import("./services/item-routing.service");
        await revertPurchasedItemsForBooking(req.params.id);
      } else {
        // No automatic refund (non-refundable policy, lapsed window, or nothing charged) —
        // a plain status cancellation, exactly what the preview told the traveler.
        updated = await storage.updateServiceBookingStatus(req.params.id, "cancelled", reason);
      }

      // In-app receipt — no silent state changes, even for traveler-initiated actions.
      try {
        await storage.createNotification({
          userId,
          type: "booking_cancelled",
          title: refundResult
            ? `Booking cancelled — $${quote.refundAmount.toFixed(2)} refund issued`
            : "Booking cancelled",
          message: refundResult
            ? `Your booking ${updated?.trackingNumber ?? ""} was cancelled. A ${quote.refundPercent}% refund of $${quote.refundAmount.toFixed(2)} has been issued to your original payment method.`
            : `Your booking ${updated?.trackingNumber ?? ""} was cancelled. ${quote.message}`,
          relatedId: req.params.id,
          relatedType: "booking",
          data: { bookingId: req.params.id, refundAmount: refundResult ? quote.refundAmount : 0, cancelledBy: "traveler" },
        });
      } catch (notifyErr) {
        console.error("Failed to write traveler cancellation notification:", notifyErr);
      }

      res.json({
        ...updated,
        refund: {
          policyType: quote.policyType,
          refundPercent: quote.refundPercent,
          refundAmount: refundResult ? quote.refundAmount : 0,
          message: quote.message,
          issued: !!refundResult,
        },
      });
    } catch (err) {
      console.error("Cancel booking error:", err);
      res.status(500).json({ message: "Failed to cancel booking" });
    }
  });

  // === Notifications Routes ===

  // === Service Reviews Routes ===
  
  // Provider responds to a review
  app.post("/api/expert/reviews/:id/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
    const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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

  // GET /api/provider/dashboard REMOVED (Punchlist Phase 3): orphaned handler, zero client
  // callers (grepped client/src for both the API path and any queryKey referencing it — none).
  // The real provider dashboard page (client/src/pages/provider/dashboard.tsx) reads
  // /api/provider/analytics/dashboard instead. Left in the PROVIDER_SELF_SERVICE_PREFIXES
  // role-gate list above (line ~600) since that list is a harmless prefix guard, not a route
  // registration — an absent path never reaches it.

  // Get comprehensive expert analytics dashboard data
  app.get("/api/expert/analytics/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      
      // Calculate benchmarks. D5 (UX audit Jul 29): a zero-data account (no bookings, no
      // ratings) was falling through to "needs_improvement" / "good" — a judgment against
      // an empty account, not a real comparison. "no_data" is a distinct, honest status
      // the client renders as "No data yet" (§13 pattern — never a fabricated verdict).
      const benchmarks = {
        responseTime: { value: "2 hrs", benchmark: "1 hr", status: "good" },
        conversionRate: {
          value: `${conversionRate.toFixed(0)}%`,
          benchmark: "55%",
          status: inquiryCount === 0 ? "no_data" : conversionRate >= 55 ? "excellent" : conversionRate >= 40 ? "good" : "needs_improvement"
        },
        avgRating: {
          value: avgRating.toFixed(1),
          benchmark: "4.5",
          status: avgRating === 0 ? "no_data" : avgRating >= 4.5 ? "excellent" : avgRating >= 4.0 ? "good" : "needs_improvement"
        },
        avgBookingValue: {
          value: `$${totalBookings > 0 ? (totalRevenue / totalBookings).toFixed(0) : 0}`,
          benchmark: "$350",
          status: totalBookings === 0 ? "no_data" : totalRevenue / totalBookings >= 350 ? "excellent" : "good"
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
      const userId = getUserId(req)!;
      
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)! || "anonymous";
      
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
      const userId = getUserId(req)!;
      
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
      const userId = getUserId(req)!;
      const services = await storage.getProviderServicesByStatus(userId);
      const bookings = await storage.getServiceBookings({ providerId: userId });
      
      const totalRevenue = services.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0);
      const totalBookings = services.reduce((sum, s) => sum + (s.bookingsCount || 0), 0);
      const avgRating = services.filter(s => s.averageRating).reduce((sum, s, _, arr) => 
        sum + Number(s.averageRating) / arr.length, 0
      ) || 0;
      
      const completedBookings = bookings.filter(b => b.status === "completed");
      // Ledger 90 (FP-5, X1): the ONE shared predicate (shared/booking-visibility.ts), so this
      // tile, Today's Action Items and the Inbox queue count the same rows. `payment_pending` is
      // excluded BY RULE — an unauthorized §15b claim is not provider-actionable (§18b) — and is
      // reported separately, additively, so the surface can disclose it without banking it.
      const pendingBookings = bookings.filter(b => isActionableBooking(b.status));
      const awaitingPaymentBookings = bookings.filter(b => isProvisionalBooking(b.status));

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

      // Benchmarks (§13 fix — the previous `categoryAvg: 280, topPerformerAvg: 450` were
      // fabricated literals). "Primary category" = the categoryId most common among the
      // provider's OWN listings (mode, ties broken by first-seen); a provider with no
      // categorized listings has no category to benchmark against, hence no_data.
      // Comparison pool: OTHER providers' approved+active, priced listings in that same
      // category (this provider's own rows are excluded — comparing yourself to yourself
      // isn't a benchmark). categoryAvg = plain mean price. topPerformerAvg = the average
      // price of listings at/above the 75th percentile ("top quartile average" — a top
      // performer's typical price, not just the boundary value). Below a 5-listing sample
      // the numbers are too noisy to be honest, so we return a `no_data` status with NO
      // numbers rather than a fabricated fallback (§13).
      const categoryCounts = new Map<string, number>();
      for (const s of services) {
        if (s.categoryId) categoryCounts.set(s.categoryId, (categoryCounts.get(s.categoryId) || 0) + 1);
      }
      let primaryCategoryId: string | null = null;
      let primaryCategoryCount = 0;
      for (const [catId, cnt] of Array.from(categoryCounts.entries())) {
        if (cnt > primaryCategoryCount) {
          primaryCategoryId = catId;
          primaryCategoryCount = cnt;
        }
      }

      let benchmarkSampleSize = 0;
      let benchmarkCategoryAvg: number | null = null;
      let benchmarkTopPerformerAvg: number | null = null;
      if (primaryCategoryId) {
        const statsResult = await db.execute(sql`
          WITH priced AS (
            SELECT price::numeric AS price
            FROM provider_services
            WHERE category_id = ${primaryCategoryId}
              AND approval_status = 'approved'
              AND status = 'active'
              AND user_id != ${userId}
              AND price IS NOT NULL
          ),
          stats AS (
            SELECT
              COUNT(*)::int AS sample_size,
              AVG(price) AS category_avg,
              percentile_cont(0.75) WITHIN GROUP (ORDER BY price) AS p75
            FROM priced
          )
          SELECT
            s.sample_size,
            s.category_avg,
            (SELECT AVG(price) FROM priced WHERE price >= s.p75) AS top_quartile_avg
          FROM stats s
        `);
        const row = statsResult.rows?.[0] as any;
        benchmarkSampleSize = row ? Number(row.sample_size) || 0 : 0;
        if (benchmarkSampleSize >= 5) {
          benchmarkCategoryAvg = row.category_avg !== null ? Math.round(Number(row.category_avg)) : null;
          benchmarkTopPerformerAvg = row.top_quartile_avg !== null ? Math.round(Number(row.top_quartile_avg)) : null;
        }
      }
      const benchmarkStatus = benchmarkSampleSize >= 5 ? "ok" : "no_data";

      res.json({
        summary: {
          totalRevenue,
          totalBookings,
          avgRating,
          activeServices: services.filter(s => s.status === "active").length,
          pendingBookings: pendingBookings.length,
          // Ledger 90 (FP-5, X1): additive — provisional §15b claims, counted separately so the
          // console can DISCLOSE them without any surface treating them as actionable or as money.
          awaitingPaymentBookings: awaitingPaymentBookings.length,
          completedBookings: completedBookings.length,
        },
        monthlyRevenue,
        servicePerformance,
        benchmarks: {
          avgBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
          // status/sampleSize are additive; categoryAvg/topPerformerAvg keep their names but
          // are null (never a fabricated number) when status is "no_data".
          status: benchmarkStatus,
          sampleSize: benchmarkSampleSize,
          categoryAvg: benchmarkCategoryAvg,
          topPerformerAvg: benchmarkTopPerformerAvg,
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
    const userId = getUserId(req)!;
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

    // FP-4 filed follow-up (parity): the quote previously omitted the provider-source rate
    // branch, the insurance leg, and the booking_concierge facilitation fee that /api/checkout
    // charges — so a cart with those items quoted LOWER than the eventual charge. Mirror all
    // three legs so the quoted fee never diverges from the charged fee (R3 disclosure posture).
    const cartOfferingTypeIds = Array.from(new Set(
      items.filter(i => i.service?.expertOfferingTypeId).map(i => i.service!.expertOfferingTypeId as string)
    ));
    const cartOfferingKeyMap = new Map<string, string>();
    if (cartOfferingTypeIds.length > 0) {
      const typeRows = await storage.getExpertOfferingTypeKeysByIds(cartOfferingTypeIds);
      for (const row of typeRows) cartOfferingKeyMap.set(row.id, row.key);
    }
    const cartHasConcierge = items.some(i =>
      i.service?.expertOfferingTypeId
        ? cartOfferingKeyMap.get(i.service.expertOfferingTypeId) === "booking_concierge"
        : false,
    );
    const cartConciergeRate = cartHasConcierge ? await getConciergeBookingRate() : 0;

    let subtotal = 0;
    let platformFeeTotal = 0;
    let conciergeFeeTotal = 0;
    let surchargeTotal = 0;
    // B1 (ruling 81): the SAME server-derived travel surcharge the checkout will charge, so the live
    // cart total already includes it and the traveler is never surprised at Pay (§13/§14, F1
    // disclosure). Out-of-range pickups show 0 here; the hard refusal is the checkout's 400.
    const cartSurcharges = await resolveCartSurcharges(items);
    // S11 (§14, ledger row 107): the SAME per-night rate resolver /api/checkout and
    // /api/cart/fee-preview call — a room's live cart total cannot diverge from the charge.
    const cartStayRates = await resolveStayNightlyRates(items);
    for (const item of items) {
      // §17/§S11 property rooms: nights × each night's own materialized rate (never quantity ×
      // price — a room's cart "quantity" is meaningless, the client pins it to 1). Reuses the
      // exact same helper /api/checkout and /api/cart/fee-preview already use (payments.routes.ts)
      // so this quote can never silently diverge from the charged total again.
      const price = resolveItemBaseAmount(item, cartStayRates);
      const feeCategory = item.service?.categoryId
        ? (cartCatMap.get(item.service.categoryId) ?? "default")
        : "default";
      let ownerRole: string | null = null;
      if (item.service?.userId) {
        const [providerRow] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, item.service.userId))
          .limit(1);
        ownerRole = providerRow?.role ?? null;
      }
      // Canonical vocabulary (shared/roles.ts): stored role is "service_provider", never "provider".
      const isProviderService = isProviderRole(ownerRole);
      const rates = await resolveCommissionRates(
        isProviderService
          ? { source: "provider", providerId: item.service?.userId ?? null }
          : { category: feeCategory, expertId: item.service?.userId ?? null }
      );
      // 1C (ruling 69 disposition 6): the cart quote prices a direct provider line through the SAME
      // `pickOwnerShareRate` precedence /api/checkout charges through, so this quote cannot silently
      // diverge from the charged total (the same reason the §17 base-amount helper is shared).
      // No rails here: this surface carries no ref, so it quotes the un-attributed (full) lane.
      const { shareRate: expertShare } = pickOwnerShareRate({
        railsShareRate: null,
        direct: await resolveDirectProviderRate({
          serviceOwnerUserId: item.service?.userId ?? null,
          ownerRole,
          categoryId: item.service?.categoryId ?? null,
          serviceId: item.service?.id ?? item.serviceId,
        }),
        legacyShareRate: safeRate(item.service?.revenueShareRate, rates.expertShareRate),
      });
      subtotal += price;
      platformFeeTotal += price * (1 - expertShare) + calcInsuranceFee(price, rates, feeCategory);
      const isConciergeItem = item.service?.expertOfferingTypeId
        ? cartOfferingKeyMap.get(item.service.expertOfferingTypeId) === "booking_concierge"
        : false;
      if (isConciergeItem) conciergeFeeTotal += price * cartConciergeRate;
      const sc = cartSurcharges.get(item.id);
      if (sc?.eligible) surchargeTotal += sc.amount;
    }
    surchargeTotal = Math.round(surchargeTotal * 100) / 100;

    res.json({
      items,
      subtotal: subtotal.toFixed(2),
      platformFee: platformFeeTotal.toFixed(2),
      conciergeFee: conciergeFeeTotal.toFixed(2),
      travelSurcharge: surchargeTotal.toFixed(2),
      total: (subtotal + platformFeeTotal + conciergeFeeTotal + surchargeTotal).toFixed(2),
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
      const userId = getUserId(req)!;
      const { experienceSlug, userExperienceId } = req.body;

      // External (affiliate/AI) cart items live only in the client's sessionStorage —
      // they have no cart_items rows. The client sends a minimal descriptor list so an
      // external-only cart can still resolve a trip. Prices are deliberately ignored
      // (no money decision here; the trip is a draft container).
      const externalItems: Array<{ name?: string; date?: string; city?: string }> =
        (Array.isArray(req.body.externalItems) ? req.body.externalItems.slice(0, 50) : [])
          .filter((e: any) => e && typeof e === "object")
          .map((e: any) => ({
            name: typeof e.name === "string" ? e.name.slice(0, 200) : undefined,
            date: typeof e.date === "string" ? e.date.slice(0, 30) : undefined,
            city: typeof e.city === "string" ? e.city.slice(0, 120) : undefined,
          }));
      const isYmd = (s: any): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const bodyStart = isYmd(req.body.startDate) ? req.body.startDate : null;
      const bodyEnd = isYmd(req.body.endDate) ? req.body.endDate : null;
      const destinationHint =
        typeof req.body.destination === "string" ? req.body.destination.trim().slice(0, 120) : "";

      // 1. Get all cart items for this user (optionally filtered by experience slug)
      const items: any[] = experienceSlug
        ? await storage.getCartItems(userId, experienceSlug)
        : await storage.getCartItems(userId);

      // Guard: a cart with neither platform nor external items cannot generate a meaningful trip
      if ((!items || items.length === 0) && externalItems.length === 0) {
        return res.status(400).json({ message: "Cannot resolve trip: cart is empty" });
      }

      // 2. Reuse an existing trip: a cart item's tripId, or the client's remembered tripId
      // (external-only carts have no cart_items rows to remember it on) — ownership-checked.
      const existingTripId = items.find((i) => i.tripId)?.tripId
        ?? (typeof req.body.tripId === "string" ? req.body.tripId : undefined);
      if (existingTripId) {
        const trip = await storage.getTrip(existingTripId);
        if (trip && trip.userId === userId) {
          return res.json({ tripId: existingTripId, created: false, trip });
        }
      }

      // 3. Infer destination: most common city across cart items, then external items,
      // then the client's experience-context hint
      const cityCounts: Record<string, number> = {};
      for (const item of items) {
        const city =
          (item.contentMeta as any)?.city ||
          item.service?.location ||
          null;
        if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;
      }
      for (const ext of externalItems) {
        if (ext.city) cityCounts[ext.city] = (cityCounts[ext.city] || 0) + 1;
      }
      const destination =
        Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        destinationHint ||
        "Your Destination";

      // 4. Start date: the traveler's explicit header dates win; else earliest
      // scheduledDate across platform + external items; else today + 30 days
      const scheduledDates = [
        ...items.map((i) => (i.scheduledDate ? new Date(i.scheduledDate) : null)),
        ...externalItems.map((e) => (e.date ? new Date(e.date) : null)),
      ].filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));
      const defaultStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const inferredStart = bodyStart
        ? new Date(`${bodyStart}T00:00:00Z`)
        : scheduledDates.length > 0
          ? scheduledDates.reduce((min, d) => (d < min ? d : min), scheduledDates[0])
          : defaultStart;
      const inferredEnd = bodyEnd && (!bodyStart || bodyEnd >= bodyStart)
        ? new Date(`${bodyEnd}T00:00:00Z`)
        : new Date(inferredStart.getTime() + 7 * 24 * 60 * 60 * 1000);

      const startDate = inferredStart.toISOString().split("T")[0];
      const endDate = inferredEnd.toISOString().split("T")[0];

      // 5. Party size: the client's trip context wins (validated), then the
      // user_experience guestCount resolved via slug, then contentMeta, then 2.
      const bodyTravelers = Number.isInteger(req.body.travelers) && req.body.travelers >= 1 && req.body.travelers <= 500
        ? (req.body.travelers as number)
        : null;
      let resolvedUserExperienceId: string | null = userExperienceId || null;
      let inferredTravelers = bodyTravelers ?? 2; // default fallback

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
            if (!bodyTravelers && userExp.guestCount && userExp.guestCount > 0) {
              inferredTravelers = userExp.guestCount;
            }
          }
        }
      }

      // Also check cart item contentMeta for any travelers hint
      const metaTravelers = items
        .map((i) => (i.contentMeta as any)?.travelers || (i.contentMeta as any)?.numberOfTravelers)
        .filter((v) => typeof v === "number" && v > 0);
      if (!bodyTravelers && metaTravelers.length > 0 && inferredTravelers === 2) {
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

      // 7. Backfill tripId on all matching cart items.
      // W2: routed through the projection module (the single cart writer). The WHERE/SET moved
      // verbatim — same rows, same column, same result as the raw db.update this replaced.
      await cartProjection.attachTripToCartItems(userId, trip.id, experienceSlug);

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
      const userId = getUserId(req)!;
      const { serviceId, customVenueId, quantity, tripId, scheduledDate, notes, experienceSlug: rawSlug, contentType, contentId, contentMeta, slotId } = req.body;

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

      // Verify service or custom venue exists. Hoisted out of the block below (was
      // block-scoped) — the §17 room-stay branch further down needs the resolved row too.
      let service: any = null;
      if (serviceId) {
        service = await storage.getProviderServiceById(serviceId);
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
      
      // C3: optional availability-slot pick. Soft validation only at add-time (the slot must
      // exist, belong to THIS service, and currently look bookable) — the hard atomic capacity
      // CLAIM happens at checkout (storage.bookSlot), so an abandoned cart never holds a slot.
      // The item's scheduledDate is SERVER-DERIVED from the slot (slot wins over any client date).
      let slotScheduledDate: Date | undefined;
      let validatedSlotId: string | undefined;
      if (slotId) {
        if (typeof slotId !== "string" || !serviceId) {
          return res.status(400).json({ message: "Invalid slot selection" });
        }
        const slot = await storage.getVendorAvailabilitySlot(slotId);
        if (!slot || slot.serviceId !== serviceId) {
          return res.status(400).json({ message: "That slot does not belong to this service" });
        }
        const remaining = (slot.capacity ?? 1) - (slot.bookedCount ?? 0);
        if (slot.status === "blocked" || remaining <= 0 || String(slot.date) < new Date().toISOString().slice(0, 10)) {
          return res.status(409).json({ error: "slot_unavailable", message: "That time slot is no longer available. Please pick another." });
        }
        validatedSlotId = slot.id;
        slotScheduledDate = new Date(`${slot.date}T${(slot.startTime || "09:00").slice(0, 5)}:00`);
      }

      // §17 Product Builder — property rooms: a stay is a DATE RANGE, which cart_items has no
      // column for (slotId holds exactly one slot; scheduledDate holds exactly one timestamp).
      // contentMeta (jsonb, already on every cart row) is the smallest honest carrier — it's
      // untouched for a serviceId-based add otherwise (the branch above only reads it for
      // content-type adds). §14: nights/amount are NEVER computed here — checkout derives the
      // charge itself from the stored room row + these dates; this is an input, not money.
      let roomStayMeta: Record<string, string> | undefined;
      if (service?.pricingUnit === "per_night") {
        const { checkIn, checkOut } = req.body;
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        const todayStr = new Date().toISOString().slice(0, 10);
        if (typeof checkIn !== "string" || typeof checkOut !== "string" || !dateRe.test(checkIn) || !dateRe.test(checkOut)) {
          return res.status(400).json({ message: "checkIn and checkOut (YYYY-MM-DD) are required for this room" });
        }
        if (checkIn < todayStr) {
          return res.status(400).json({ message: "checkIn must be today or later" });
        }
        if (checkOut <= checkIn) {
          return res.status(400).json({ message: "checkOut must be after checkIn" });
        }
        const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
        if (nights > 30) {
          return res.status(400).json({ message: "Stays longer than 30 nights aren't supported yet" });
        }
        roomStayMeta = { checkIn, checkOut };
      }

      // Resolve slug aliases. A caller with no explicit slug (Discover, service-detail,
      // trip-details, the guest-cart migration, the upsell add) leaves this undefined —
      // NOT the literal string "general". storage.getCartItems()'s experience-scoped read
      // deliberately unions in `experienceSlug IS NULL` rows as "belongs in every experience
      // cart view until scoped to one" (see its comment); writing the literal "general" here
      // defeated that NULL-fallback (it's neither NULL nor equal to any real slug), so an
      // item added via any of those generic paths would silently vanish from GET /api/cart
      // whenever TripContext.experienceSlug pointed at a different (or unrelated, stale)
      // experience — exactly the state-divergence between the trip-strip cart chip (reads
      // the unfiltered /api/cart) and the /cart page's own historical slug-scoped fetch.
      const experienceSlug = rawSlug ? resolveSlug(rawSlug) : undefined;

      // Whitelist display metadata for content items (strings only, capped).
      let safeContentMeta: Record<string, string> | undefined;
      if (isContentAdd && contentMeta && typeof contentMeta === "object") {
        safeContentMeta = {};
        for (const key of ["name", "description", "city", "imageUrl"]) {
          const v = (contentMeta as Record<string, unknown>)[key];
          if (typeof v === "string" && v.length > 0) safeContentMeta[key] = v.slice(0, 500);
        }
      }

      const item = await cartProjection.addToCart(userId, {
        serviceId: serviceId || undefined,
        customVenueId: customVenueId || undefined,
        ...(isContentAdd ? { contentType, contentId, contentMeta: safeContentMeta } : {}),
        ...(roomStayMeta ? { contentMeta: roomStayMeta } : {}),
        quantity: quantity || 1,
        tripId,
        scheduledDate: slotScheduledDate ?? (scheduledDate ? new Date(scheduledDate) : undefined),
        ...(validatedSlotId ? { slotId: validatedSlotId } : {}),
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
      const userId = getUserId(req)!;
      const existing = await storage.getCartItemById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { quantity, scheduledDate, notes } = req.body;
      // B1 (ruling 81): the traveler's CONFIRMED pickup location — the travel-surcharge trigger.
      // Validated here to a {address?, lat, lng} shape (or null to clear); the surcharge AMOUNT is
      // NEVER read off this body (§14) — it is derived server-side at checkout from these coords +
      // the listing config. Only touched when the key is present, so an ordinary quantity/notes PATCH
      // never disturbs a saved pickup (§13, never-clobber).
      let pickupLocationUpdate: { pickupLocation?: unknown } = {};
      if (Object.prototype.hasOwnProperty.call(req.body, "pickupLocation")) {
        const raw = req.body.pickupLocation;
        if (raw === null) {
          pickupLocationUpdate = { pickupLocation: null };
        } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          const lat = typeof raw.lat === "number" ? raw.lat : parseFloat(String(raw.lat));
          const lng = typeof raw.lng === "number" ? raw.lng : parseFloat(String(raw.lng));
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ message: "pickupLocation must carry numeric lat/lng within range, or be null to clear" });
          }
          const address = typeof raw.address === "string" ? raw.address.slice(0, 500) : null;
          pickupLocationUpdate = { pickupLocation: { address, lat, lng } };
        } else {
          return res.status(400).json({ message: "pickupLocation must be an object with lat/lng, or null" });
        }
      }
      // T2 (ruling 83): the traveler's CONFIRMED party count — the D7 party-size eligibility gate's
      // trigger-input. Validated to a positive integer (or null to clear); the gate DERIVES nothing
      // from a body amount/rate (§14) — this is a booking input like quantity. Only touched when the
      // key is present, so an ordinary quantity/notes/pickup PATCH never disturbs a saved party size.
      let partySizeUpdate: { partySize?: number | null } = {};
      if (Object.prototype.hasOwnProperty.call(req.body, "partySize")) {
        const raw = req.body.partySize;
        if (raw === null) {
          partySizeUpdate = { partySize: null };
        } else {
          const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
          if (!Number.isInteger(n) || n < 1 || n > 100000) {
            return res.status(400).json({ message: "partySize must be a positive integer, or null to clear" });
          }
          partySizeUpdate = { partySize: n };
        }
      }
      const updated = await cartProjection.updateCartItem(req.params.id, {
        quantity,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        notes,
        ...pickupLocationUpdate,
        ...partySizeUpdate,
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove from cart
  app.delete("/api/cart/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const existing = await storage.getCartItemById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await cartProjection.removeFromCart(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  // Clear cart
  app.delete("/api/cart", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const experienceSlug = req.query.experience as string | undefined;
      await cartProjection.clearCart(userId, experienceSlug);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // Migrate guest cart after login/signup
  app.post("/api/cart/migrate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { guestSessionId } = req.body;
      if (!guestSessionId || typeof guestSessionId !== "string") {
        return res.status(400).json({ message: "guestSessionId is required" });
      }
      const result = await cartProjection.migrateGuestCart(guestSessionId, userId);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("Cart migration error:", err);
      res.status(500).json({ message: "Failed to migrate cart" });
    }
  });

  // Convert content cart items into itinerary items
  app.post("/api/cart/convert-to-itinerary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
          numberOfTravelers: 2, // consistent with adults (kids=0) — see trip-defaults fix
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
        // W3 (H1, first half): a row is convertible when it carries EITHER discover content
        // (contentId + contentType) OR a real platform service. The old gate demanded content, so
        // a SERVICE cart row — the only kind that has a link worth preserving — was silently
        // skipped and never converted at all. Rows with neither are still skipped (nothing to make
        // an item out of).
        if (!cartItem.serviceId && (!cartItem.contentId || !cartItem.contentType)) continue;

        const meta: Record<string, any> = cartItem.contentMeta || {};
        const rawPrice = meta.price ? String(meta.price).replace(/[^0-9.]/g, "") : null;
        // W3 (H1, second half): the linkage the audit found destroyed. `cart_items.serviceId` IS a
        // `provider_services.id`, and the itinerary item has had a column for it all along — the
        // conversion just never wrote it, so a converted service became permanently unbuyable text
        // (docs/E2E_ITEM_LIFECYCLE.md §3). Preserving it makes the round trip real: the item can be
        // routed back to `ready_for_checkout`, projected into the cart, and bought.
        //
        // The service row is read ONLY for honest display values (name / location / catalog price)
        // for a service row that carries no contentMeta. Nothing here reads or decides an amount for
        // a charge — checkout re-derives every price server-side from the catalog (§14).
        const service = cartItem.serviceId
          ? await storage.getProviderServiceById(cartItem.serviceId)
          : null;
        const servicePrice =
          service?.price && parseFloat(String(service.price)) > 0 ? String(service.price) : null;
        const estimatedCost =
          rawPrice && parseFloat(rawPrice) > 0 ? rawPrice : servicePrice;
        // §13: `provider_services.location` defaults to the literal "Unknown" — that is the absence
        // of a location, not a place name, so it must never be copied onto the plan item.
        const serviceLocation =
          service?.location && service.location !== "Unknown" ? service.location : null;

        // Born `in_planning` — the migration-159 column default, deliberately NOT set here: a
        // converted item is a plan item, not purchase intent (ROUTING_STATE_CONTRACT §2).
        await storage.createItineraryItem({
          tripId: targetTripId,
          providerServiceId: cartItem.serviceId ?? null,
          title: meta.name || service?.serviceName || cartItem.contentId || "Discovered item",
          description: meta.description || service?.shortDescription || null,
          itemType: cartItem.contentType === "hotel" ? "accommodation" : "activity",
          dayNumber: 1,
          locationName: meta.city || meta.location || serviceLocation,
          notes: cartItem.notes || null,
          suggestedBy: "user",
          origin: "traveler",
          status: "planned",
          isFlexible: true,
          estimatedCost,
        } as any);

        await cartProjection.removeFromCart(cartItemId);
        convertedCount++;
      }

      res.json({ tripId: targetTripId, convertedCount });
    } catch (err) {
      console.error("Convert to itinerary error:", err);
      res.status(500).json({ message: "Failed to convert items to itinerary" });
    }
  });

  // === Checkout & Auto-Contract Generation ===

  // Get contract details.
  //
  // SECURITY (migration 157): this had NO ownership check — any authenticated caller who had a
  // contract id got the whole row (service name, trip destination, the traveler's free-text
  // notes, the amount, the payment URL). Until 157 there was no principal on the table to check
  // against, which is why the gate could not be written before now.
  //
  // Access = the traveler who bought ‖ the earner who sold ‖ admin. A row whose attribution
  // is NULL (157 could not link it to a booking) is ADMIN-ONLY by construction: an
  // unattributable financial artifact should not be shown to a caller who merely guessed an id.
  // 404, not 403, so the endpoint does not confirm that an id exists to someone probing.
  app.get("/api/contracts/:id", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const contract = await storage.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    const isParty =
      (contract.travelerId && contract.travelerId === userId) ||
      (contract.earnerId && contract.earnerId === userId);
    if (!isParty) {
      const actor = await storage.getUser(userId);
      if (actor?.role !== "admin") {
        return res.status(404).json({ message: "Contract not found" });
      }
    }
    res.json(contract);
  });

  // === Itinerary Comparison & Optimization Routes ===

  app.post("/api/itinerary-comparisons", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { userExperienceId, tripId, title, destination, startDate, endDate, budget, travelers, baselineItems: inlineBaselineItems, experienceTypeSlug, optimizationPaymentId } = req.body;

      // SECURITY: `tripId` is caller-supplied and is persisted onto the comparison row, which
      // downstream handlers (notably POST /api/itinerary-comparisons/:id/apply-to-trip, which
      // DELETES the trip's itinerary items) treat as the trip to mutate. Without a check here an
      // attacker could point their own comparison at someone else's trip and then apply it.
      // A comparison with NO trip is legitimate (cart / experience-template flows create one before
      // any trip exists), so only authorize when a tripId is actually supplied.
      if (tripId) {
        const denied = await authorizeTripLogistics(tripId, userId, "POST /api/itinerary-comparisons");
        if (denied) return res.status(denied.status).json({ message: denied.message });
      }

      // ── Lane 5b: resolve the baseline BEFORE anything is created or verified ────────────────
      // Deliberately ahead of the pay gate and the insert: a request that has nothing to optimize
      // must not create a comparison row, and must not send the payer through Stripe verification
      // for a run that cannot happen.
      let baselineItems: any[] = [];
      let fixedCommitments: FixedCommitment[] = [];

      if (tripId) {
        // THE RE-POINT. The trip was authorized immediately above; `loadTripOptimizerInputs`
        // applies the ratified read-set (in_planning + ready_for_checkout optimizable, purchased
        // as constraints, with_expert never read). Trip-first is deliberate — when a trip exists
        // it IS the plan, so a client-supplied `baselineItems` snapshot must not shadow it (that
        // is the dual-source ambiguity again, and it would let a stale snapshot hide a booking).
        const tripInputs = await loadTripOptimizerInputs(tripId);
        baselineItems = tripInputs.baselineItems;
        fixedCommitments = tripInputs.fixedCommitments;

        if (baselineItems.length === 0 && (await respondIfCartAwaitsConversion(userId, res))) return;
      } else if (inlineBaselineItems && inlineBaselineItems.length > 0) {
        baselineItems = inlineBaselineItems.map((item: any, index: number) => ({
          id: `inline-${index}`,
          name: item.name,
          description: item.description || "",
          serviceType: item.category || "service",
          price: parseFloat(item.price || "0"),
          // §13: honest-or-absent — no fabricated stand-in rating for an item that has none.
          // itinerary-optimizer.ts already averages/compares only over items that HAVE a real
          // rating (baselineAvgRating), so an undefined value here correctly excludes it rather
          // than polluting that average with an invented 4.5.
          rating: typeof item.rating === "number" ? item.rating : undefined,
          location: item.location || "",
          duration: item.duration || 120,
          dayNumber: item.dayNumber || Math.floor(index / 3) + 1,
          timeSlot: item.timeSlot || ["morning", "afternoon", "evening"][index % 3],
          category: item.category || "service",
          provider: item.provider || "Provider"
        }));
      } else if (!userId) {
        // ── GUEST-ONLY cart fallback — deliberate debt, ratified Jul 31 2026 ────────────────────
        // Guests have carts but no trips (guest trips are deferred to G2), so the cart read stays
        // as their transition path. RETIREMENT CONDITION, written down so this dies by plan rather
        // than by archaeology: it retires when G2 lands guest trips
        // (docs/planning/TRIP_CANON_MASTER_BRIEF.md §3, deferred inventory row).
        //
        // UNREACHABLE TODAY BY CONSTRUCTION, and that is the point: this route is `isAuthenticated`,
        // so `userId` is always set. NO logged-in user may ever touch the cart-read path — a
        // signed-in caller reading the cart is precisely the dual-source ambiguity the reconcile
        // fixed. The branch is kept, labelled and gated rather than written fresh later.
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
          // Lane 5a Defect 3: `id` above is the CART ITEM id; the catalog link is the joined
          // service's own id. Carrying it means the baseline variant keeps its buyable link.
          providerServiceId: item.service?.id ?? undefined,
          name: item.service?.serviceName || "Unknown Service",
          description: item.service?.shortDescription,
          serviceType: item.service?.serviceType,
          price: parseFloat(item.service?.price || "0"),
          // §13: same honest-or-absent rule as the inline-baseline mapping above — an unrated
          // service carries no rating, never a fabricated 4.5 stand-in.
          rating: item.service?.averageRating ? parseFloat(item.service.averageRating) : undefined,
          location: item.service?.location,
          duration: 120,
          dayNumber: Math.floor(index / 3) + 1,
          timeSlot: ["morning", "afternoon", "evening"][index % 3],
          category: item.service?.serviceType || "service",
          provider: "Provider"
        }));
      } else if (await respondIfCartAwaitsConversion(userId, res)) {
        // Signed in, no trip, no inline items — the cart read above is not theirs to use.
        return;
      }

      // ── Optimization authorization gate (Lane 5a Defect 1, harvested from the §9 dead twin) ──
      // The comparison record is ALWAYS created (never blocked) — only the paid LLM run is gated.
      // canRunOptimizer=false → born "pending_payment", no AI call; true → "generating" + optimizer.
      let canRunOptimizer = false;

      // Free 24h re-run eligibility first (no Stripe call needed).
      const cutoff = new Date(Date.now() - OPTIMIZATION_FREE_RERUN_MS);
      const recentRun = await storage.getRecentOptimizationRun(userId, cutoff);

      if (recentRun) {
        canRunOptimizer = true;
      } else if (optimizationPaymentId) {
        const check = await verifyOptimizationPayment({ userId, optimizationPaymentId, tripId, userExperienceId });
        if (!check.ok) return res.status(check.status).json(check.body);
        canRunOptimizer = true;
      }
      // ── End authorization gate ────────────────────────────────────────────────────────────

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
          status: canRunOptimizer ? "generating" : "pending_payment",
          ...(optimizationPaymentId ? { optimizationPaymentId } : {}),
        })
        .returning();

      // Trigger AI optimization in background only when authorized (payment verified or free re-run)
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
          // tripId / userTransportPrefs / tripPreferences stay UNPASSED here, exactly as before
          // Lane 5b. Passing `tripId` would newly activate this handler's temporal-anchor and
          // day-boundary reads — a real behaviour change that belongs to whoever owns that gap,
          // not to the re-point. `fixedCommitments` is passed directly so the purchased-item
          // constraint works on both entry points without touching the anchor plumbing.
          undefined,
          undefined,
          undefined,
          fixedCommitments
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
      const userId = getUserId(req)!;

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
      const userId = getUserId(req)!;
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

  app.post("/api/itinerary-comparisons/:id/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const comparisonId = req.params.id;
      const { baselineItems: inlineBaselineItems, feedback: rawFeedback, optimizationPaymentId } = req.body;

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

      // ── Lane 5b: resolve the baseline BEFORE the pay gate ───────────────────────────────────
      // Order matters and is deliberate: the gate's third branch RECORDS a PaymentIntent on this
      // row via an atomic conditional claim (§15) — a PI can only ever be spent once. Resolving
      // the baseline first means a caller with nothing to optimize is never charged for a run that
      // cannot happen. (Pre-5b the gate ran first, so a 400 could follow a consumed PI.)
      let baselineItems: any[] = [];
      let fixedCommitments: FixedCommitment[] = [];

      if (comparison.tripId) {
        // THE RE-POINT (see the create handler for the full rationale). The stored `tripId` is
        // re-authorized here rather than trusted from the create-time check: access can be revoked
        // between the two calls, and this handler triggers a paid run over that trip's contents.
        const denied = await authorizeTripLogistics(
          comparison.tripId,
          userId,
          "POST /api/itinerary-comparisons/:id/generate",
        );
        if (denied) return res.status(denied.status).json({ message: denied.message });

        const tripInputs = await loadTripOptimizerInputs(comparison.tripId);
        baselineItems = tripInputs.baselineItems;
        fixedCommitments = tripInputs.fixedCommitments;

        // A trip-linked comparison never falls through to the client's `baselineItems` snapshot —
        // on the regenerate path that snapshot is sessionStorage from the original run and can be
        // arbitrarily stale (it predates any purchase the traveler has since made).
        if (baselineItems.length === 0 && (await respondIfCartAwaitsConversion(userId, res))) return;
      } else if (inlineBaselineItems && inlineBaselineItems.length > 0) {
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
          // Lane 5a Defect 3: user-experience items already carry the catalog link — pass it on
          // instead of only using it to decide a label.
          providerServiceId: item.providerServiceId ?? undefined,
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
      } else if (!userId) {
        // GUEST-ONLY cart fallback — see the create handler's block for the full rationale and the
        // written-down retirement condition (G2 guest trips). Unreachable today: `isAuthenticated`.
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
          // Lane 5a Defect 3: carry the joined service's catalog id (the `id` above is the cart row).
          providerServiceId: item.service?.id ?? undefined,
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
      } else if (await respondIfCartAwaitsConversion(userId, res)) {
        return;
      }

      if (baselineItems.length === 0) {
        return res.status(400).json({
          message: comparison.tripId
            ? "No items to optimize. Add items to your trip first."
            : "No items to optimize. Add services to your cart or experience first.",
        });
      }

      // ── Optimization authorization gate on REGENERATE (Lane 5a Defect 1) ────────────────────
      // Same defect as create: this handler fired the paid LLM run with zero payment verification.
      // The dead twin carried no gate here either, so the rule below is derived from the fee
      // contract in `optimization.routes.ts` (24h free re-run) + the twin's create gate:
      //   (a) the caller has ANY completed optimization run in the last 24h  → the DOCUMENTED free
      //       re-run (identical clock/query to `POST /api/optimization-payments`, which answers
      //       `freeRerun:true, feeCents:0` in exactly this case); fee-literal-ok: comment
      //   (b) THIS comparison's own run was paid inside that same window (its
      //       `optimizationPaymentId` was Stripe-verified at create) — covers the re-run fired
      //       before the first run has stamped `optimizedAt`, so a just-paid user is never charged twice;
      //   (c) the request carries a fresh PaymentIntent that passes the SAME verification as create.
      //       Accepted only for a comparison that carries no payment yet (the `pending_payment` rows
      //       created by the unpaid surfaces), and the PI is recorded on the row by an ATOMIC
      //       conditional update so the reuse guard in (c) can see it — a PI can never be spent twice.
      // Otherwise 402: the comparison is untouched and no AI call is made.
      {
        const cutoff = new Date(Date.now() - OPTIMIZATION_FREE_RERUN_MS);
        let canRunOptimizer = !!(await storage.getRecentOptimizationRun(userId, cutoff));

        if (!canRunOptimizer && comparison.optimizationPaymentId && comparison.createdAt && comparison.createdAt >= cutoff) {
          canRunOptimizer = true;
        }

        if (!canRunOptimizer && optimizationPaymentId) {
          const check = await verifyOptimizationPayment({
            userId,
            optimizationPaymentId,
            // §14: the target is read from the stored comparison, never from the body.
            tripId: comparison.tripId ?? undefined,
            userExperienceId: comparison.userExperienceId ?? undefined,
          });
          if (!check.ok) return res.status(check.status).json(check.body);

          const claimed = await db
            .update(itineraryComparisons)
            .set({ optimizationPaymentId })
            .where(and(eq(itineraryComparisons.id, comparisonId), isNull(itineraryComparisons.optimizationPaymentId)))
            .returning({ id: itineraryComparisons.id });
          if (claimed.length === 0) {
            return res.status(409).json({
              error: "payment_already_recorded",
              message: "This comparison already has an optimization payment. Please start a new optimization.",
            });
          }
          canRunOptimizer = true;
        }

        if (!canRunOptimizer) {
          return res.status(402).json({
            error: "payment_required",
            message: "This optimization requires payment. Complete the optimization fee to re-run.",
          });
        }
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
        tripPreferencesForGen,
        fixedCommitments
      ).catch((err) => console.error("Background optimization error:", err));

    } catch (error) {
      console.error("Error starting optimization:", error);
      res.status(500).json({ message: "Failed to start optimization" });
    }
  });

  app.post("/api/itinerary-comparisons/:id/select", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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

      // W2: routed through the projection module (the single cart writer). The storage
      // implementation performs the IDENTICAL delete-all-then-insert-per-variant-item this
      // replaced (same rows, same notes string, same providerServiceId filter).
      const itemsAdded = await cartProjection.replaceUserCartWithVariantItems(userId, variantItems);

      // W5 companion (H6): the writer has ALWAYS skipped variant items with no
      // `providerServiceId` (an AI-invented activity has no catalog row, so there is nothing to
      // put in a cart) — but the response reported `variantItems.length`, so the traveler was told
      // "9 items added" when 4 landed. The BEHAVIOR is deliberately unchanged (scope §1 W5: "do
      // not change its behavior, just stop it being silent"); only the reporting becomes honest —
      // the real inserted count plus an explicit skip count and message (§13).
      const skippedExternalItems = variantItems.length - itemsAdded;

      // Fire-and-forget: T4 funnel event
      trackFunnelEvent({
        userId,
        eventType: "cart_populated",
        funnelStage: "T4",
      }).catch(() => {}); // fire-and-forget funnel event — never blocks cart response

      res.json({
        message:
          skippedExternalItems > 0
            ? `Cart updated with ${itemsAdded} bookable item${itemsAdded === 1 ? "" : "s"}. ` +
              `${skippedExternalItems} item${skippedExternalItems === 1 ? " is" : "s are"} not bookable ` +
              `on Traveloure and stayed on your itinerary only.`
            : "Cart updated with selected itinerary",
        itemsAdded,
        skippedExternalItems,
      });
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
      const userId = getUserId(req)!;
      const slots = await storage.getProviderAvailabilitySlots(userId);
      res.json(slots);
    } catch (error) {
      console.error("Error fetching provider availability:", error);
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  // C2 repair: the client (provider-availability-manager.tsx) previously POSTed a
  // {dayOfWeek, startTime, endTime, isAvailable, pricingModifier} weekly-schedule shape
  // that this handler's zod never accepted (it required serviceId + date) — every real
  // submit 400d, so no slots ever existed. Aligned the zod to the actual
  // vendor_availability_slots columns (C0-canonical: date + startTime/endTime + capacity,
  // no dayOfWeek/isAvailable/notes — those columns don't exist on this table) and added
  // the missing §14 ownership check: serviceId must belong to the session's own
  // provider_services row, or a provider could create slots on another provider's service.
  app.post("/api/provider/availability", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const availabilityInput = z.object({
        serviceId: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
        startTime: z.string().min(1).max(10),
        endTime: z.string().min(1).max(10),
        capacity: z.number().int().min(1).max(1000).optional(),
      }).parse(req.body);

      // §14 ownership check: a provider must not create slots on another provider's service.
      const ownedService = await storage.getProviderServiceById(availabilityInput.serviceId);
      if (!ownedService || ownedService.userId !== userId) {
        return res.status(403).json({ message: "You do not own this service" });
      }

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
      const userId = getUserId(req)!;
      const updateInput = z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
        startTime: z.string().min(1).max(10).optional(),
        endTime: z.string().min(1).max(10).optional(),
        capacity: z.number().int().min(1).max(1000).optional(),
        status: z.enum(["available", "blocked"]).optional(),
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
      const userId = getUserId(req)!;
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

  // ── AC-1 (provider money-hardening lane, ruling 42): `POST /api/vendor-availability/:id/book`
  //    is DELETED, not hardened. ────────────────────────────────────────────────────────────────
  // The whole handler was `storage.bookSlot(req.params.id)` behind `isAuthenticated` and nothing
  // else: no ownership check, no purchase, no booking row — so any authenticated account could
  // increment any provider's `booked_count` and flip their slots to `fully_booked`, exhausting a
  // competitor's sellable inventory. It was IRREVERSIBLE by design: the TTL sweep reclaims capacity
  // by iterating provisional `service_bookings` rows and releasing `row.slotId`, and this endpoint
  // created no row, so there was nothing to sweep and `storage.releaseSlot` had no reachable caller.
  // It had ZERO consumers — `vendor-availability` appears nowhere under `client/src`.
  // An endpoint with no consumer and an irreversible effect is deleted rather than gated: gating it
  // would have preserved a second, unaudited way to consume inventory alongside the checkout spine.
  // The legitimate claim path is unchanged and untouched: `storage.bookSlot` is still the atomic
  // conditional the checkout calls (`payments.routes.ts`), paired with `releaseSlot` and the sweep.

  // Coordination States
  app.get("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      res.json(state);
    } catch (error) {
      console.error("Error fetching coordination state:", error);
      res.status(500).json({ message: "Failed to fetch coordination state" });
    }
  });

  app.get("/api/coordination-states/active/:experienceType", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const state = await storage.getActiveCoordinationState(userId, req.params.experienceType);
      res.json(state || null);
    } catch (error) {
      console.error("Error fetching active coordination state:", error);
      res.status(500).json({ message: "Failed to fetch active coordination state" });
    }
  });

  app.post("/api/coordination-states", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const coordInput = z.object({
        experienceType: z.string().min(1).max(100),
        title: z.string().min(1).max(255).optional(),
        status: z.string().max(50).optional(),
        metadata: z.record(z.any()).optional(),
        tripId: z.string().min(1).max(255).optional(),
      }).parse(req.body);
      // D-BUDGET(interim): persist the event budget into the existing `budget` jsonb column
      // ({ amount: dollars, currency }). The request carries it as metadata.budget (dollars); the
      // fee reads budget.amount ×100 (GET /fee). NOTE: title/metadata are accepted but map to no
      // columns and are silently dropped by Drizzle — filed known-issue, not fixed here.
      const budgetAmount = Number((coordInput.metadata as any)?.budget);
      const budget = Number.isFinite(budgetAmount) && budgetAmount > 0
        ? { amount: budgetAmount, currency: "USD" }
        : undefined;
      // Trip-Canon Lane 2: coordination_states.tripId is a reader-without-writer
      // (GET /api/trips/:tripId/coordination-states reads it, but nothing wrote it).
      // §14 posture: never trust a body-supplied tripId/ownership linkage without
      // server verification — load the trip and require the session user own it.
      // 404 on missing trip, 403 on mismatch. Absent/invalid tripId → create without
      // one, exactly as before (honest null, not a fabricated link).
      let tripId: string | undefined;
      if (coordInput.tripId) {
        const trip = await storage.getTrip(coordInput.tripId);
        if (!trip) {
          return res.status(404).json({ message: "Trip not found" });
        }
        if (trip.userId !== userId) {
          return res.status(403).json({ message: "You do not own this trip" });
        }
        tripId = coordInput.tripId;
      }
      const { tripId: _omitTripId, ...coordInputRest } = coordInput;
      const state = await storage.createCoordinationState({
        ...coordInputRest,
        userId,
        ...(budget ? { budget } : {}),
        ...(tripId ? { tripId } : {}),
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;

      const isTraveler = state.userId === userId;
      const isCoordinator = state.assignedExpertId === userId;

      if (!isTraveler && !isCoordinator) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const { status, ...historyEntry } = req.body;

      // Coordinators can only advance status forward — never regress or cancel.
      if (isCoordinator && !isTraveler) {
        const FORWARD_ORDER = [
          "intake", "expert_matching", "vendor_discovery", "itinerary_generation",
          "optimization", "booking_coordination", "confirmed", "in_progress", "completed",
        ];
        const currentIdx = FORWARD_ORDER.indexOf(state.status ?? "intake");
        const nextIdx = FORWARD_ORDER.indexOf(status);
        if (nextIdx === -1 || nextIdx <= currentIdx) {
          return res.status(403).json({ message: "Coordinators can only advance status forward" });
        }
      }

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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      const eventType = state.experienceType;
      // D-BUDGET(interim): read the event budget from the `budget` jsonb column
      // ({ amount: dollars, currency }), NOT total_estimated_cost (which means *cost*, not budget).
      // Absent/{}/non-positive → 0 → intentional floor-only (max(floor, 8%×0) = floor).
      const budgetDollars = Number((state.budget as any)?.amount);
      const budgetCents = Number.isFinite(budgetDollars) && budgetDollars > 0
        ? Math.round(budgetDollars * 100)
        : 0;

      // Paid-signal credit (§7, scoped by migration 126): surface the traveler's total available
      // paid-optimize credit in the QUOTE, filtered to the same event type so cross-event bleeding
      // is impossible (legacy null-event credits are still eligible). Read-only — not consumed here;
      // consumption happens under the atomic claim in /pay.
      const availableCreditCents = await getAvailableCoordinationCreditCents(userId, eventType);
      const fee = await resolveCoordinationFee(eventType, budgetCents, availableCreditCents);
      res.json({ ...fee, feePaymentStatus: state.feePaymentStatus });
    } catch (error) {
      console.error("Error resolving coordination fee:", error);
      res.status(500).json({ message: "Failed to resolve coordination fee" });
    }
  });

  // ── Coordination fee CAPTURE (§7 "Quote-only → CAPTURED", ratified Jul 22, 2026) ──────
  // Charges the server-derived coordination fee for real, mirroring optimization-payments.
  //   POST /api/coordination-states/:id/pay          → atomic-claim + Stripe PaymentIntent (net of credit)
  //   POST /api/coordination-states/:id/pay/confirm   → verify intent, mark paid, record platform_revenue
  // §14: amount derived server-side from the state's own experienceType + budget (never req.body).
  // §15: atomic conditional UPDATE + deterministic Stripe idempotencyKey, both directions.
  app.post("/api/coordination-states/:id/pay", isAuthenticated, async (req, res) => {
    const coordinationId = req.params.id;
    const userId = getUserId(req)!;
    let claimedCreditCents = 0;
    try {
      const state = await storage.getCoordinationState(coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });
      if (state.feePaymentStatus === "paid") {
        return res.json({ alreadyPaid: true, feePaymentStatus: "paid" });
      }
      if (state.feePaymentStatus === "refunded") {
        return res.json({ alreadyRefunded: true, feePaymentStatus: "refunded" });
      }

      // §15 step 1 — claim the state atomically (unpaid → pending). The `WHERE ... IN (unpaid)` guard
      // is the concurrency lock: only one caller wins. A loser returns the in-flight PI (or 409 if the
      // winner hasn't stored it yet), never a second charge.
      const claimed = await db
        .update(coordinationStates)
        .set({ feePaymentStatus: "pending" })
        .where(and(
          eq(coordinationStates.id, coordinationId),
          eq(coordinationStates.feePaymentStatus, "unpaid"),
        ))
        .returning({ id: coordinationStates.id });
      if (claimed.length === 0) {
        const fresh = await storage.getCoordinationState(coordinationId);
        if (fresh?.feePaymentStatus === "paid") return res.json({ alreadyPaid: true, feePaymentStatus: "paid" });
        if (fresh?.feePaymentStatus === "refunded") return res.json({ alreadyRefunded: true, feePaymentStatus: "refunded" });
        if (fresh?.feePaymentIntentId) {
          const stripeR = new Stripe(getStripeSecretKey() || "", { apiVersion: "2024-12-18.acacia" as any });
          const existingPi = await stripeR.paymentIntents.retrieve(fresh.feePaymentIntentId);
          return res.json({
            clientSecret: existingPi.client_secret,
            paymentIntentId: existingPi.id,
            feeCents: fresh.feeAmountCents ?? existingPi.amount,
            creditCents: fresh.feeCreditCents ?? 0,
            currency: (existingPi.currency ?? "usd").toUpperCase(),
            reused: true,
          });
        }
        return res.status(409).json({ error: "payment_in_progress", message: "A payment for this engagement is already being created — retry shortly." });
      }

      try {
        // §14 — derive the fee from the state's own experienceType + budget. Never trust the client.
        const eventType = state.experienceType;
        const budgetDollars = Number((state.budget as any)?.amount);
        const budgetCents = Number.isFinite(budgetDollars) && budgetDollars > 0 ? Math.round(budgetDollars * 100) : 0;

        // §7 / migration 126: Consume ALL eligible credits for this event type (atomic — §15).
        //
        // Step 1: compute the gross fee (0 credits) so we know the ceiling for credit consumption.
        //   Passing 0 credits means resolveCoordinationFee returns feeCents = rawFeeCents (the floor
        //   or percent, whichever is larger). We need this number to cap the claim so credits beyond
        //   the ceiling are preserved for a future engagement rather than wasted.
        const { feeCents: grossFeeCents } = await resolveCoordinationFee(eventType, budgetCents, 0);
        //
        // Step 2: atomically claim all eligible credits up to the gross fee ceiling, scoped to the
        //   same event type as this coordination. Credits with event_type IS NULL (legacy) are also
        //   eligible. Oldest credits are consumed first. The `consumed IS NULL` guard on the UPDATE
        //   is the concurrency lock — two coordinations racing for the same credits, only one wins
        //   each row.
        claimedCreditCents = await claimCoordinationCredit(userId, coordinationId, eventType, grossFeeCents);
        //
        // Step 3: recompute the net fee with the actually-consumed credit total.
        const { feeCents: netFeeCents, breakdown, rule } = await resolveCoordinationFee(eventType, budgetCents, claimedCreditCents);

        // Fully-credited edge (only reachable if an admin sets a $0 floor AND 0% while a credit exists):
        // no Stripe charge, mark paid immediately, record nothing.
        if (netFeeCents <= 0) {
          await db
            .update(coordinationStates)
            .set({ feePaymentStatus: "paid", feeAmountCents: 0, feeCreditCents: claimedCreditCents, feePaidAt: new Date() })
            .where(eq(coordinationStates.id, coordinationId));
          return res.json({ paid: true, feeCents: 0, creditCents: claimedCreditCents, feePaymentStatus: "paid" });
        }

        // FP-1 one-click: charge the saved default card off-session when the client asks —
        // same server-derived netFeeCents (§14 unchanged; useSavedCard is only a consent flag),
        // same deterministic idempotency key (§15). On success the client calls the normal
        // /pay/confirm with this PI id (confirm contract unchanged); requires_action falls back
        // to the payment sheet; no saved method falls through to the sheet flow below.
        if (req.body?.useSavedCard === true) {
          const { stripePaymentService } = await import("./services/stripe-payment.service");
          const oneClick = await stripePaymentService.chargeSavedMethod(userId, {
            amountCents: netFeeCents,
            currency: "usd",
            metadata: {
              type: "coordination_fee",
              coordinationId,
              userId,
              eventType: eventType ?? "",
              creditCents: String(claimedCreditCents),
            },
            description: `Traveloure event coordination fee (${eventType})`,
            idempotencyKey: `coord-fee-${coordinationId}`,
          });
          if (oneClick.status !== "no_saved_method") {
            await db
              .update(coordinationStates)
              .set({ feePaymentIntentId: oneClick.paymentIntentId, feeAmountCents: netFeeCents, feeCreditCents: claimedCreditCents })
              .where(eq(coordinationStates.id, coordinationId));
            if (oneClick.status === "succeeded") {
              return res.json({
                oneClick: true,
                status: "succeeded",
                paymentIntentId: oneClick.paymentIntentId,
                feeCents: netFeeCents,
                creditCents: claimedCreditCents,
                currency: "USD",
                rule,
                breakdown,
              });
            }
            return res.json({
              oneClick: false,
              requiresAction: true,
              clientSecret: oneClick.clientSecret,
              paymentIntentId: oneClick.paymentIntentId,
              feeCents: netFeeCents,
              creditCents: claimedCreditCents,
              currency: "USD",
              rule,
              breakdown,
            });
          }
        }

        const stripe = new Stripe(getStripeSecretKey() || "", { apiVersion: "2024-12-18.acacia" as any });
        // FP-1/FP-2 parity: attach the durable customer so this sheet ALSO offers saved cards
        // and can vault a new one (the optimize + cart sheets already do) — the asymmetry FP-2's
        // ground-truth flagged.
        const { stripePaymentService: fpService } = await import("./services/stripe-payment.service");
        const coordCustomerId = await fpService.getOrCreateCustomer(userId).catch(() => null);
        // #973: attaching the customer is OPTIONAL (falls back to a customer-less PI), but if
        // the stored id has gone stale, recover once via the shared #973 helper rather than
        // 500ing (which previously left the atomic claim rolled back to "unpaid" every retry).
        // Stripe rejects reusing an idempotencyKey with different params (`customer` differs on
        // the recovery retry) — vary the key on attempt 2 so the retry can actually land.
        const buildCoordinationPaymentIntent = (customerId: string | undefined, idempotencyKey: string) =>
          stripe.paymentIntents.create(
            {
              amount: netFeeCents,
              currency: "usd",
              ...(customerId ? { customer: customerId, setup_future_usage: "off_session" as const } : {}),
              metadata: {
                type: "coordination_fee",
                coordinationId,
                userId,
                eventType: eventType ?? "",
                creditCents: String(claimedCreditCents),
              },
              description: `Traveloure event coordination fee (${eventType})`,
            },
            { idempotencyKey },
          );
        const paymentIntent = coordCustomerId
          ? await fpService.runWithCustomerRecovery(userId, coordCustomerId, (cid, attempt) =>
              buildCoordinationPaymentIntent(
                cid,
                attempt === 1 ? `coord-fee-${coordinationId}` : `coord-fee-${coordinationId}-recover`,
              ),
            )
          : await buildCoordinationPaymentIntent(undefined, `coord-fee-${coordinationId}`);

        await db
          .update(coordinationStates)
          .set({ feePaymentIntentId: paymentIntent.id, feeAmountCents: netFeeCents, feeCreditCents: claimedCreditCents })
          .where(eq(coordinationStates.id, coordinationId));

        return res.json({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          feeCents: netFeeCents,
          creditCents: claimedCreditCents,
          currency: "USD",
          rule,
          breakdown,
        });
      } catch (inner) {
        // Roll back so a retry starts clean: release the claimed credit and return the state to unpaid.
        // Best-effort rollback — if either step fails, log but still re-throw the original error
        // so the outer handler can surface it; a partial rollback is better than a silent hang.
        if (claimedCreditCents > 0) await releaseCoordinationCredit(coordinationId).catch((rollbackErr) => {
          console.warn("[coordination/payment] Could not release claimed credit during rollback:", rollbackErr);
        });
        await db
          .update(coordinationStates)
          .set({ feePaymentStatus: "unpaid" })
          .where(and(eq(coordinationStates.id, coordinationId), eq(coordinationStates.feePaymentStatus, "pending")))
          .catch((rollbackErr) => {
            console.warn("[coordination/payment] Could not reset feePaymentStatus to 'unpaid' during rollback:", rollbackErr);
          });
        throw inner;
      }
    } catch (error: any) {
      console.error("Error creating coordination payment:", error);
      res.status(500).json({ message: "Failed to create coordination payment", error: error?.message });
    }
  });

  app.post("/api/coordination-states/:id/pay/confirm", isAuthenticated, async (req, res) => {
    try {
      const coordinationId = req.params.id;
      const userId = getUserId(req)!;
      const state = await storage.getCoordinationState(coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      if (state.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      // #874 fix: a refunded state must stay refunded — Stripe's PaymentIntent.status stays
      // "succeeded" after a refund (refunds live on the Charge/Refund objects, not the PI status),
      // and refund never clears feePaymentIntentId, so without this early return the atomic
      // transition below (which used to guard only `<> 'paid'`) would happily flip a refunded
      // engagement back to "paid" on a stray/replayed confirm call. Mirrors the /pay endpoint's
      // existing refunded early-return.
      if (state.feePaymentStatus === "refunded") {
        return res.json({ alreadyRefunded: true, feePaymentStatus: "refunded" });
      }

      // §14 — take the PI from the SERVER record, not the client body.
      const paymentIntentId = state.feePaymentIntentId;
      if (!paymentIntentId) return res.status(400).json({ error: "no_payment", message: "No coordination payment has been started." });

      const stripe = new Stripe(getStripeSecretKey() || "", { apiVersion: "2024-12-18.acacia" as any });
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== "succeeded") return res.status(400).json({ error: "payment_not_confirmed", message: "Payment not yet confirmed." });
      if (pi.metadata?.type !== "coordination_fee") return res.status(400).json({ error: "invalid_payment_type" });
      if (pi.metadata?.coordinationId !== coordinationId) return res.status(400).json({ error: "payment_coordination_mismatch" });
      if (pi.metadata?.userId && pi.metadata.userId !== userId) return res.status(403).json({ error: "payment_belongs_to_another_user" });

      // §15 — atomic transition, restricted to `pending → paid` (the ONLY legitimate pre-confirm
      // state — set by the /pay claim). #874 fix: this used to be `<> 'paid'`, which admitted BOTH
      // "unpaid" (no real claim in flight) and "refunded" (terminal — must never move again) into
      // the flip. Record revenue ONLY if a row flipped, so a duplicate confirm is a no-op (no
      // double revenue); a call against any non-"pending" state (already paid, or the refunded
      // case already returned above) is reported as alreadyPaid, matching prior behavior for the
      // legitimate duplicate-confirm case.
      const flipped = await db
        .update(coordinationStates)
        .set({ feePaymentStatus: "paid", feePaidAt: new Date() })
        .where(and(eq(coordinationStates.id, coordinationId), eq(coordinationStates.feePaymentStatus, "pending")))
        .returning({ id: coordinationStates.id });
      if (flipped.length === 0) return res.json({ alreadyPaid: true, feePaymentStatus: "paid" });

      // Idempotent revenue (defence-in-depth): skip if this PI was already recorded.
      const [existingRev] = await db
        .select({ id: platformRevenue.id })
        .from(platformRevenue)
        .where(eq(platformRevenue.sourceId, paymentIntentId))
        .limit(1);
      if (!existingRev) {
        try {
          await revenueTrackingService.recordRevenueEvent({
            sourceType: "coordination_fee",
            sourceId: paymentIntentId,
            grossAmount: pi.amount / 100, // amount from Stripe, never the client
            description: `Event coordination fee (${state.experienceType})`,
            metadata: { type: "coordination_fee", coordinationId, userId, creditCents: pi.metadata?.creditCents ?? "0" },
          });
        } catch (revErr) {
          console.warn("[coordination pay/confirm] revenue record failed (non-critical):", revErr);
        }
      }

      return res.json({ success: true, feePaymentStatus: "paid", feeCents: pi.amount });
    } catch (error: any) {
      console.error("Error confirming coordination payment:", error);
      res.status(500).json({ message: "Failed to confirm coordination payment", error: error?.message });
    }
  });

  // ── Coordination fee REFUND (admin-only) ─────────────────────────────────────────────────
  // POST /api/coordination-states/:id/refund
  // Reverses a paid coordination fee: issues a Stripe refund, releases the consumed credit row,
  // flips the linked platform_revenue to 'reversed', and sets fee_payment_status = 'refunded'.
  // Atomic guarantee: Stripe is called first; the DB transaction only runs on Stripe success,
  // so a Stripe failure leaves the ledger untouched.
  app.post("/api/coordination-states/:id/refund", isAuthenticated, async (req, res) => {
    try {
      const coordinationId = req.params.id;
      const callerId = getUserId(req)!;

      // Admin-only gate (inline, consistent with other admin checks in this file)
      const [callerRow] = await db.select({ role: users.role }).from(users).where(eq(users.id, callerId));
      if (!callerRow || callerRow.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const state = await storage.getCoordinationState(coordinationId);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });

      // Idempotency: already refunded → treat as success
      if (state.feePaymentStatus === "refunded") {
        return res.json({ alreadyRefunded: true, feePaymentStatus: "refunded" });
      }

      if (state.feePaymentStatus !== "paid") {
        return res.status(400).json({
          error: "not_paid",
          message: `Coordination fee is in '${state.feePaymentStatus}' status — only 'paid' fees can be refunded.`,
        });
      }

      const paymentIntentId = state.feePaymentIntentId;
      if (!paymentIntentId) {
        return res.status(400).json({ error: "no_payment_intent", message: "No payment intent on record for this coordination fee." });
      }

      const feeCents = state.feeAmountCents ?? 0;

      // Step 1 — Stripe refund. Idempotency-keyed so retries are safe.
      // A Stripe failure leaves the DB untouched (satisfies the atomicity contract).
      const stripe = new Stripe(getStripeSecretKey() || "", { apiVersion: "2024-12-18.acacia" as any });
      let stripeRefundId: string | null = null;
      if (feeCents > 0) {
        const stripeRefund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            amount: feeCents,
            reason: "requested_by_customer",
            metadata: { coordinationId, source: "coordination_fee_refund" },
          },
          { idempotencyKey: `coord-refund-${coordinationId}` },
        );
        stripeRefundId = stripeRefund.id;
      }

      // Step 2 — Atomic DB mutations: all three ledger/state writes in one transaction.
      // Stripe call (step 1) already succeeded; a transaction failure here propagates as a 500
      // so the admin can retry — the Stripe idempotency key prevents a duplicate charge on retry.
      let reversedRevenueRows = 0;
      const compensatingRows: Array<{ grossAmount: string; platformFee: string; netAmount: string; transactionDate: Date }> = [];
      await db.transaction(async (tx) => {
        // 2a. Release the consumed credit row (null out consumed_by / consumed_at).
        await tx
          .update(coordinationFeeCredits)
          .set({ consumedByCoordinationId: null, consumedAt: null })
          .where(eq(coordinationFeeCredits.consumedByCoordinationId, coordinationId));

        // 2b. Reverse platform revenue (sourceId = paymentIntentId as recorded at pay/confirm).
        //     Flip original row(s) to 'reversed' and insert a compensating negative entry per row
        //     (double-entry: same pattern as reversePlatformRevenueForBooking in storage.ts).
        const originals = await tx
          .update(platformRevenue)
          .set({ status: "reversed" })
          .where(and(eq(platformRevenue.sourceId, paymentIntentId), ne(platformRevenue.status, "reversed")))
          .returning();

        reversedRevenueRows = originals.length;
        const now = new Date();
        for (const o of originals) {
          const neg = (v: string | null) => String(-parseFloat(v || "0"));
          const negGross = neg(o.grossAmount);
          const negFee = neg(o.platformFee);
          const negNet = neg(o.netAmount);
          await tx.insert(platformRevenue).values({
            sourceType: o.sourceType,
            sourceId: o.sourceId,
            trackingNumber: o.trackingNumber,
            grossAmount: negGross,
            platformFee: negFee,
            netAmount: negNet,
            processingFees: neg(o.processingFees),
            currency: o.currency,
            expertId: o.expertId,
            expertEarnings: neg(o.expertEarnings),
            providerId: o.providerId,
            providerEarnings: neg(o.providerEarnings),
            description: `Reversal of platform revenue ${o.id} (coordination ${coordinationId})`,
            metadata: { reversalOf: o.id, reason: "coordination_fee_refund" },
            status: "reversed",
            transactionDate: now,
          } as any);
          compensatingRows.push({ grossAmount: negGross, platformFee: negFee, netAmount: negNet, transactionDate: now });
        }

        // 2c. Mark the coordination state as refunded (terminal state).
        // If no revenue rows were reversed AND a real fee was charged, flag the ledger gap
        // so admins can see and investigate it in the concierge panel.
        await tx
          .update(coordinationStates)
          .set({
            feePaymentStatus: "refunded",
            revenueReversalMissing: originals.length === 0 && feeCents > 0,
          })
          .where(eq(coordinationStates.id, coordinationId));
      });

      // Step 3 — Update daily revenue summary for each compensating entry (analytics cache;
      // runs outside the transaction like recordPlatformRevenue does in storage.ts). Fire-and-forget:
      // a summary staleness is tolerable; a duplicate charge is not.
      for (const row of compensatingRows) {
        const date = row.transactionDate.toISOString().split("T")[0];
        storage.updateDailyRevenueSummary(date, {
          totalGross: row.grossAmount,
          totalPlatformFee: row.platformFee,
          totalNet: row.netAmount,
        } as any).catch((e: any) =>
          console.warn("[coordination refund] daily summary update failed (non-critical):", e)
        );
      }

      const revenueReversalMissing = reversedRevenueRows === 0 && feeCents > 0;
      return res.json({
        success: true,
        feePaymentStatus: "refunded",
        stripeRefundId,
        reversedRevenueRows,
        revenueReversalMissing,
      });
    } catch (error: any) {
      console.error("Error processing coordination fee refund:", error);
      res.status(500).json({ message: "Failed to refund coordination fee", error: error?.message });
    }
  });

  app.get("/api/coordination-states/:id/timeline", isAuthenticated, async (req, res) => {
    try {
      const state = await storage.getCoordinationState(req.params.id);
      if (!state) return res.status(404).json({ message: "Coordination state not found" });
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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

  // NOTE: the hardcoded FALLBACK_COORDINATES map that used to live here (and its unused
  // geocodeSchema twin) is gone — city-coordinate fallbacks are now admin-curated rows in
  // the geocode_fallbacks table (migration 217), consulted by POST /api/geocode in
  // server/routes/content.routes.ts via storage.getGeocodeFallback().

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

      // Create a backing trip so itinerary_items can FK-reference it.
      const quickTrip = await storage.createTrip({
        userId,
        title: result.title || `${itineraryRequest.destination} Trip`,
        destination: itineraryRequest.destination,
        startDate: itineraryRequest.dates.start,
        endDate: itineraryRequest.dates.end,
        numberOfTravelers: travelers,
        status: "draft",
        eventType: "vacation",
      });

      // Insert itinerary_items rows so the booking service can resolve prices by DB ID.
      const qsDailyItinerary = Array.isArray(result.dailyItinerary) ? result.dailyItinerary : [];
      const qsInsertedItems: any[] = [];
      for (const day of qsDailyItinerary) {
        const activities = Array.isArray(day?.activities) ? day.activities : [];
        for (const activity of activities) {
          const [inserted] = await db.insert(itineraryItems).values({
            tripId: quickTrip.id,
            title: activity.name || activity.title || "Activity",
            description: activity.description || "",
            itemType: activity.type || "activity",
            status: "planned",
            dayNumber: day.day || 1,
            startTime: activity.time || "",
            durationMinutes: typeof activity.duration === "number" ? activity.duration : 60,
            locationName: activity.location || itineraryRequest.destination,
            estimatedCost: activity.estimatedCost != null ? String(activity.estimatedCost) : null,
            currency: "USD",
            suggestedBy: "ai",
            origin: "ai",
          }).returning();
          qsInsertedItems.push({ ...activity, id: inserted.id });
        }
      }

      res.json({
        ...result,
        id: saved.id,
        tripId: quickTrip.id,
        itinerary: { items: qsInsertedItems },
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
      const userId = getUserId(req)!;
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

      const userId = getUserId(req)!;
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
        // T6-4: never persist the raw provider error (it can carry infra text
        // like "403 Host not in allowlist: api.x.ai. Add this host to your
        // network egress settings...") — it round-trips back to the expert's
        // own dashboard on the next GET /api/expert/ai-tasks. Log the real
        // cause server-side only; store/return the sanitized copy.
        console.error("AI content generation failed (delegate):", aiError);
        const sanitized = sanitizeAiContentFailure();
        await db.update(expertAiTasks)
          .set({
            status: "pending",
            aiResult: { error: sanitized.message, fallbackContent: "Unable to generate content. Please try again or write manually." },
            confidence: 0,
            updatedAt: new Date(),
          })
          .where(eq(expertAiTasks.id, task.id));

        return res.status(502).json(sanitized);
      }
    } catch (error: any) {
      console.error("Error delegating task:", error);
      res.status(500).json({ message: "Failed to delegate task. Please try again." });
    }
  });

  // Approve/Send a task
  app.post("/api/expert/ai-tasks/:taskId/approve", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      const { taskId } = req.params;

      const [task] = await db.select()
        .from(expertAiTasks)
        .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, userId)));

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // T6-4b: capture the pre-regenerate status so a failed regeneration can
      // revert to it rather than leaving the row stuck at 'regenerating'
      // forever (no sweep exists for this table). Falls back to 'failed' in
      // the (unexpected) case the row was already 'regenerating'.
      const priorStatus = task.status && task.status !== "regenerating" ? task.status : "failed";

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

      let result: Awaited<ReturnType<typeof grokService.generateContent>>["result"];
      let usage: Awaited<ReturnType<typeof grokService.generateContent>>["usage"];
      try {
        ({ result, usage } = await grokService.generateContent({
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
        }));
      } catch (aiError: any) {
        // Real cause (e.g. "403 Host not in allowlist: api.x.ai...") logged
        // server-side only; the row is reverted in the SAME handler (no sweep
        // job) so it never sits at 'regenerating' forever.
        console.error("AI content generation failed (regenerate):", aiError);
        await db.update(expertAiTasks)
          .set({ status: priorStatus, updatedAt: new Date() })
          .where(eq(expertAiTasks.id, taskId));
        return res.status(502).json(sanitizeAiContentFailure());
      }

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
      res.status(500).json({ message: "Failed to regenerate task. Please try again." });
    }
  });

  // Get expert AI stats
  app.get("/api/expert/ai-stats", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      
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
    const user = await db.select().from(users).where(eq(users.id, getUserId(req)!)).then(r => r[0]);
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
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const participants = await coordinationService.getParticipants(req.params.tripId);
    res.json(participants);
  }));

  app.get("/api/trips/:tripId/participants/stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getParticipantStats(req.params.tripId);
    res.json(stats);
  }));

  app.get("/api/trips/:tripId/participants/payment-stats", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const stats = await coordinationService.getPaymentStats(req.params.tripId);
    res.json(stats);
  }));

  app.get("/api/trips/:tripId/participants/dietary", isAuthenticated, asyncHandler(async (req, res) => {
    const userId = getUserId(req)!;
    if (!await verifyTripOwnership(req.params.tripId, userId)) {
      throw new ForbiddenError("Access denied to this trip");
    }
    const dietary = await coordinationService.getDietaryRequirements(req.params.tripId);
    res.json(dietary);
  }));

  app.post("/api/trips/:tripId/participants", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!await verifyTripOwnership(req.params.tripId, userId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      // L20 hardening: `userId` is STRIPPED from the accepted input. A caller must never be
      // able to assert which user ACCOUNT a participant row points at — that becomes a
      // self-service authorization grant the moment any gate reads `trip_participants.userId`.
      // The column is populated only by a real invite→accept flow (L20 Part C), never from body.
      const validatedData = insertTripParticipantSchema.omit({ userId: true }).parse({
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

  // L20 tier 4 — participant PII is OWNER-only, never an assigned expert: the participant
  // record carries dietary/accessibility/phone/amount-owed/per-person emergency contacts, a
  // materially larger disclosure than anything an expert surface has ever shown.
  app.post("/api/trips/:tripId/participants/bulk-invite", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "POST /api/trips/:tripId/participants/bulk-invite",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });

      // L20 hardening: a non-array body used to reach `for (const email of emails)` and throw
      // (→ 500). Validate shape, cap the batch, and drop non-string/blank entries.
      const { emails } = req.body ?? {};
      if (!Array.isArray(emails)) {
        return res.status(400).json({ message: "`emails` must be an array of email addresses" });
      }
      const MAX_BULK_INVITES = 50;
      if (emails.length > MAX_BULK_INVITES) {
        return res.status(400).json({
          message: `Too many invites in one request (max ${MAX_BULK_INVITES})`,
        });
      }
      const cleaned = emails
        .filter((e: unknown): e is string => typeof e === "string" && e.trim().length > 0)
        .map((e: string) => e.trim());

      // Dedup within the request too (the service already dedups against existing rows).
      const participants = await coordinationService.bulkInvite(
        req.params.tripId, Array.from(new Set(cleaned)),
      );
      res.status(201).json(participants);
    } catch (error) {
      res.status(500).json({ message: "Failed to send invites" });
    }
  });

  // --- Vendor Contracts Routes ---
  // L20 tier 2 — vendor coordination is the assigned expert's real job, so the READS are
  // owner ‖ assigned expert ‖ author ‖ admin (`authorizeTripLogistics`); but CREATING a
  // financial/legal artifact on the traveler's trip is owner-only.
  app.get("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/contracts",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const contracts = await vendorManagementService.getContracts(req.params.tripId);
      res.json(contracts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  app.get("/api/trips/:tripId/contracts/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/contracts/stats",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const stats = await vendorManagementService.getContractStats(req.params.tripId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contract stats" });
    }
  });

  app.get("/api/trips/:tripId/contracts/upcoming-payments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/contracts/upcoming-payments",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const days = parseInt(req.query.days as string) || 30;
      const payments = await vendorManagementService.getUpcomingPayments(req.params.tripId, days);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming payments" });
    }
  });

  app.get("/api/trips/:tripId/contracts/overdue", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/contracts/overdue",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const overdue = await vendorManagementService.getOverduePayments(req.params.tripId);
      res.json(overdue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch overdue payments" });
    }
  });

  app.post("/api/trips/:tripId/contracts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "POST /api/trips/:tripId/contracts",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
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
  // L20 tier 1 — money-between-people is OWNER-only (+ author/admin). The settle-up graph
  // decides who owes whom inside the traveler's own party; an assigned expert has their own
  // commission view and never needs it, so `authorizeTripOwnerTier` (no expert branch) is used
  // throughout this block, NOT `authorizeTripLogistics`.
  app.get("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "GET /api/trips/:tripId/transactions",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const transactions = await budgetService.getTransactions(req.params.tripId);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/trips/:tripId/budget/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "GET /api/trips/:tripId/budget/summary",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const budget = parseFloat(req.query.budget as string) || 0;
      const summary = await budgetService.getBudgetSummary(req.params.tripId, budget);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch budget summary" });
    }
  });

  app.get("/api/trips/:tripId/budget/categories", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "GET /api/trips/:tripId/budget/categories",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const breakdown = await budgetService.getCategoryBreakdown(req.params.tripId);
      res.json(breakdown);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category breakdown" });
    }
  });

  app.get("/api/trips/:tripId/budget/settle-up", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "GET /api/trips/:tripId/budget/settle-up",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const settleUp = await budgetService.getSettleUpSummary(req.params.tripId);
      res.json(settleUp);
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate settle up" });
    }
  });

  app.post("/api/trips/:tripId/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "POST /api/trips/:tripId/transactions",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
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
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "POST /api/trips/:tripId/transactions/split",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const { totalAmount, category, description, paidByParticipantId, splits } = req.body ?? {};
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
      // Caller-input failures (foreign participant id, non-array splits) are 400, not 500.
      if (error instanceof BudgetValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create split transaction" });
    }
  });

  app.post("/api/trips/:tripId/budget/calculate-split", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "POST /api/trips/:tripId/budget/calculate-split",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const { totalAmount, method, customSplits } = req.body ?? {};
      const splits = await budgetService.calculateSplit(req.params.tripId, totalAmount, method, customSplits);
      res.json(splits);
    } catch (error) {
      // Zero-participant equal split → honest 400 instead of NaN money numbers.
      if (error instanceof BudgetValidationError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to calculate split" });
    }
  });

  // --- Itinerary Intelligence Routes ---
  // Authoritative GET: requires trip ownership or expert assignment; returns items grouped by day
  app.get("/api/trips/:tripId/itinerary-items", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId } = req.params;
      const owned = await verifyTripOwnership(tripId, userId);
      const assigned = owned ? true : await storage.isExpertAssignedToTrip(tripId, userId);
      // Authoring mode (ready-made brief §2): the trip's author may read its own build.
      const authored = (owned || assigned) ? false : await isTripAuthor(tripId, userId);
      if (!owned && !assigned && !authored) return res.status(403).json({ message: "Access denied" });
      const items = await storage.getItineraryItems(tripId);
      // WORKSTATION_LOCATION_MAP_SPEC Part A item 2/5: the SAME resolve-on-write backfill the
      // traveler-facing PlanCard already runs (trip-plan.service.ts) — reused here, not
      // reimplemented, so an item added without coordinates (e.g. a DMO pick whose source row
      // carries none) gets pinned on the expert's own Workstation canvas map too, not only once
      // the traveler opens the PlanCard. Bounded + best-effort; never fabricates a pin (§13).
      const trip = await storage.getTrip(tripId);
      await resolveMissingItemCoordinates(items as any, trip?.destination);
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

  // L20 tier 5 — the three itinerary-intelligence reads are owner ‖ assigned expert ‖ author ‖
  // admin (`authorizeTripLogistics`): reasoning over the plan is squarely the expert's job.
  app.get("/api/trips/:tripId/itinerary/schedules", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/itinerary/schedules",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const schedules = await itineraryIntelligenceService.getDaySchedules(req.params.tripId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch day schedules" });
    }
  });

  app.get("/api/trips/:tripId/itinerary/analyze", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/itinerary/analyze",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const analysis = await itineraryIntelligenceService.analyzeItinerary(req.params.tripId);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze itinerary" });
    }
  });

  // `aiRateLimit` (the existing shared AI limiter, applied limiter-before-auth exactly as
  // `heavyReadRateLimit` is on /api/itinerary-comparisons): this handler is the only one of the
  // three that makes a REAL outbound LLM call (itinerary-intelligence.service.ts
  // getAIRecommendations), and it was behind no limiter at all — an authorized caller could
  // burn tokens in a loop. `schedules`/`analyze` are pure DB reads and are deliberately NOT
  // added to the shared `ai:<ip>` bucket, so they cannot starve it.
  app.get("/api/trips/:tripId/itinerary/recommendations", aiRateLimit, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/itinerary/recommendations",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
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
      const userId = getUserId(req)!;
      const userName = (req.user as any).claims.name || "User";
      const { tripId } = req.params;
      const owned = await verifyTripOwnership(tripId, userId);
      // Split out from the OR'd `assigned` boolean below so the mode-flip gate can target the
      // advisor-only path — never the owner (owned ? true : ...) short-circuits, so `isAdvisor`
      // is deliberately NOT that combined flag.
      // D1 (ruling, Aug 7 2026 — "a PENDING advisor may not write"): this is a trip-item
      // MUTATION path, so it is gated on WRITE access (accepted/assigned) — NOT
      // `storage.isExpertAssignedToTrip` (read access, includes pending). A pending advisor no
      // longer reaches `assigned` here and falls through to the 403 below (or the author branch).
      const isAdvisor = owned ? false : await storage.isExpertAssignedToTripForWrite(tripId, userId);
      const assigned = owned || isAdvisor;
      // Authoring mode (ready-made brief §2): the trip's author may build it.
      const authored = (owned || assigned) ? false : await isTripAuthor(tripId, userId);
      if (!owned && !assigned && !authored) return res.status(403).json({ message: "Access denied" });
      // FABLE-REVIEW: the mode-flip gate. Advisor-only (never owner, never author) — see
      // server/utils/plan-approval.ts. Pre-approval (NULL/changes_requested) is byte-identical
      // to today; suggestions (POST /trips/:id/suggestions) are unaffected by this gate.
      if (isAdvisor && await isPlanApprovedForExpert(tripId, userId)) {
        return res.status(409).json(PLAN_APPROVED_SUGGEST_INSTEAD_ERROR);
      }
      const parsed = insertItineraryItemSchema.safeParse({ ...req.body, tripId });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const itemData = parsed.data as any;
      // CC-1 / §14 server-derivation: expert-attribution provenance is never client-trusted.
      // Strip whatever the client sent for suggestedBy and re-derive it from the SESSION user
      // (via the isAdvisor check already computed above from trip_expert_advisors, not from
      // req.body) so a traveler/template item can no longer be forged as "expert" and a real
      // expert-authored item can no longer be forged as anonymous. Owner-authored items are
      // untouched — isAdvisor is false for the owner by construction (see `owned ? false : …`).
      delete itemData.suggestedBy;
      if (isAdvisor) {
        itemData.suggestedBy = "expert";
      }
      // D2 (origin provenance, ratified Aug 7 2026): server-derived, never client-trusted — the
      // schema already omits `origin` (shared/schema.ts), this is the explicit re-derivation
      // mirroring `suggestedBy` immediately above. `isAdvisor` here is the WRITE-gated flag, so
      // an item can only be stamped 'expert' by a caller who actually has write access.
      delete itemData.origin;
      itemData.origin = isAdvisor ? "expert" : "traveler";
      const item = await storage.createItineraryItem(itemData);
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

  // RETIRED (V4 rail-unification, Aug 7 2026): PATCH /api/itinerary-items/:id used to live here,
  // gated ONLY by `verifyTripOwnership` — owner-only, no advisor branch, no plan-approval mode-flip.
  // That diverged from the canonical trip-scoped rail (`PATCH /api/trips/:tripId/itinerary-items/:itemId`,
  // server/routes/trips.routes.ts) which is advisor-aware (`getTripWriteRole`/`canMutateTrip`/
  // `isTripAuthor`) and applies the `isPlanApprovedForExpert` mode-flip. Caller trace (client/src,
  // server, playwright, scripts/journeys) found ZERO live callers of the bare path — every caller
  // already uses the trip-scoped route (see client/src/pages/expert/workspace.tsx's own comment
  // explaining why it deliberately avoids this bare path). Per CLAUDE.md §18c ("no consumer ⇒
  // delete, don't gate"), the handler is retired rather than re-gated — a second, unaudited
  // authorization implementation of the same operation is exactly the class this closes. Use
  // PATCH /api/trips/:tripId/itinerary-items/:itemId instead. Proof:
  // server/__tests__/itinerary-item-rail-unification.db.test.ts.

  app.post("/api/itinerary-items/:id/backup", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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
      const userId = getUserId(req)!;
      const userName = (req.user as any).claims.name || "User";
      // SECURITY: this mutates another user's itinerary ordering; `isAuthenticated` alone was the
      // only gate. Canonical authorization, matching the sibling itinerary-item handlers above.
      // D1 (ruling, Aug 7 2026): a trip-item MUTATION path — `requireWriteAccess: true` narrows
      // the advisor branch to accepted/assigned (no pending).
      const denied = await authorizeTripLogistics(req.params.tripId, userId, "POST /api/trips/:tripId/itinerary/reorder", { requireWriteAccess: true });
      if (denied) return res.status(denied.status).json({ message: denied.message });
      // FABLE-REVIEW: the mode-flip gate (QA_PUNCH_LIST item 18), same derivation as the
      // item-create handler's `isAdvisor` above — never the owner, never the author. Computed
      // AFTER authorizeTripLogistics has already passed, so it narrows nothing that handler
      // grants; it only refuses the advisor branch once the assignment's plan is approved.
      const owned = await verifyTripOwnership(req.params.tripId, userId);
      const isAdvisor = owned ? false : await storage.isExpertAssignedToTripForWrite(req.params.tripId, userId);
      if (isAdvisor && await isPlanApprovedForExpert(req.params.tripId, userId)) {
        return res.status(409).json(PLAN_APPROVED_SUGGEST_INSTEAD_ERROR);
      }
      const { dayNumber, itemIds } = req.body;
      const items = await itineraryIntelligenceService.reorderItems(req.params.tripId, dayNumber, itemIds);
      // Change-log role, derived honestly (§13 applies to logs): this used to hardcode "owner",
      // which was a lie for every non-owner caller. `authorizeTripLogistics` returns null for EVERY
      // passing branch (owner ‖ assigned expert ‖ author ‖ admin) and does not report which one, so
      // ownership is the only branch we can state as fact; every other authorized party gets the
      // neutral "editor" label rather than a guess (the `logLegChange` precedent in
      // transport-legs.routes.ts). Reuses the `owned` flag computed above for the mode-flip gate.
      const role = owned ? "owner" : "editor";
      logItineraryChange(req.params.tripId, userName, `Reordered Day ${dayNumber} activities`, "reorder", role);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder items" });
    }
  });

  app.post("/api/trips/:tripId/itinerary/optimize-order", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      // SECURITY: same omission as the reorder handler above — `isAuthenticated` only, no trip
      // authorization, so any authenticated user could compute an optimized order for any trip.
      // D1 (ruling, Aug 7 2026): treated as a trip-item MUTATION path (see comment below) —
      // `requireWriteAccess: true` narrows the advisor branch to accepted/assigned.
      const denied = await authorizeTripLogistics(req.params.tripId, userId, "POST /api/trips/:tripId/itinerary/optimize-order", { requireWriteAccess: true });
      if (denied) return res.status(denied.status).json({ message: denied.message });
      // FABLE-REVIEW: the mode-flip gate (QA_PUNCH_LIST item 18) — same derivation as the
      // reorder handler above (itself mirroring the item-create handler's `isAdvisor`). This
      // endpoint only COMPUTES a suggested order (no write), but gating it too means an
      // advisor on an approved plan can't even fish for a machine order to hand-apply via
      // the reorder endpoint under a different guise.
      const owned = await verifyTripOwnership(req.params.tripId, userId);
      const isAdvisor = owned ? false : await storage.isExpertAssignedToTripForWrite(req.params.tripId, userId);
      if (isAdvisor && await isPlanApprovedForExpert(req.params.tripId, userId)) {
        return res.status(409).json(PLAN_APPROVED_SUGGEST_INSTEAD_ERROR);
      }
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
      // Email/password sessions carry the id at claims.sub, not .id — a bare .id read
      // made this endpoint 404 for every standard account (plancard audit F2 class).
      const userId = getUserId(req)!;

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

  // RETIRED (V4 rail-unification, Aug 7 2026): DELETE /api/itinerary-items/:id used to live here,
  // same owner-only gate divergence as the PATCH handler above (see that comment for the full
  // rationale + zero-caller trace). It also carried the L22 orphan-leg cascade gap (deleted via
  // `itineraryIntelligenceService.deleteItem`, not the cascade-safe `storage.deleteItineraryItem`
  // the canonical rail uses) — retiring this path closes that gap as a side effect, not a
  // rewrite. Use DELETE /api/trips/:tripId/itinerary-items/:itemId instead.

  // --- Emergency Routes ---
  // L20 tier 3 — READS are owner ‖ assigned expert ‖ author ‖ admin (the local fixer needs to
  // reach your people in a crisis); WRITES that redefine WHO those people are stay owner-only;
  // RAISING an alert is the one write the assigned expert may perform (see POST /alerts below).
  app.get("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/emergency-contacts",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const contacts = await emergencyService.getContacts(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });

  app.get("/api/trips/:tripId/emergency-contacts/by-type", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/emergency-contacts/by-type",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const contacts = await emergencyService.getContactsByType(req.params.tripId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency contacts" });
    }
  });

  app.post("/api/trips/:tripId/emergency-contacts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "POST /api/trips/:tripId/emergency-contacts",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
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
      const userId = getUserId(req)!;
      const denied = await authorizeTripOwnerTier(
        req.params.tripId, userId, "POST /api/trips/:tripId/emergency/initialize",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const { countryCode } = req.body ?? {};
      // Idempotent (L20 hardening): repeat calls reuse the already-seeded police/ambulance/
      // embassy contacts and welcome alert instead of appending duplicates.
      const result = await emergencyService.initializeTripEmergencyInfo(req.params.tripId, countryCode);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to initialize emergency info" });
    }
  });

  app.get("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/alerts",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const alerts = await emergencyService.getActiveAlerts(req.params.tripId);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.get("/api/trips/:tripId/alerts/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "GET /api/trips/:tripId/alerts/summary",
      );
      if (denied) return res.status(denied.status).json({ message: denied.message });
      const summary = await emergencyService.getAlertSummary(req.params.tripId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alert summary" });
    }
  });

  // The ONE tier-3 write the assigned expert may perform: raising a safety alert. The local
  // fixer on the ground is often the first to know, so `authorizeTripLogistics` (owner ‖
  // assigned expert ‖ author ‖ admin) — NOT the owner-only tier.
  app.post("/api/trips/:tripId/alerts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const denied = await authorizeTripLogistics(
        req.params.tripId, userId, "POST /api/trips/:tripId/alerts",
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

  // ============ SPONTANEOUS ACTIVITIES & LIVE INTEL ENGINE ============
  
  // PATCH /api/admin/notifications/:id/read — mark a single lead alert as resolved
  app.patch("/api/admin/notifications/:id/read", requireAdmin, async (req, res) => {
    try {
      const rawId = String(req.params.id);
      // Ids come in two flavors: "alert-<int>" rows from admin_notifications
      // (platform alerts) and UUID rows from the user notifications table.
      const alertMatch = rawId.match(/^alert-(\d+)$/) || (/^\d+$/.test(rawId) ? [rawId, rawId] : null);
      if (alertMatch) {
        const notifId = parseInt(alertMatch[1], 10);
        const [updated] = await db
          .update(adminNotifications)
          .set({ isRead: true })
          .where(eq(adminNotifications.id, notifId))
          .returning();
        if (!updated) {
          return res.status(404).json({ message: "Notification not found" });
        }
        return res.json({ ok: true, id: `alert-${updated.id}` });
      }
      const userId = getUserId(req)!;
      const [updated] = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, rawId), eq(notifications.userId, userId)))
        .returning();
      if (!updated) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ ok: true, id: updated.id });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to mark notification as read", error: err.message });
    }
  });

  // DELETE /api/admin/notifications/:id — remove a notification (either table)
  app.delete("/api/admin/notifications/:id", requireAdmin, async (req, res) => {
    try {
      const rawId = String(req.params.id);
      const alertMatch = rawId.match(/^alert-(\d+)$/) || (/^\d+$/.test(rawId) ? [rawId, rawId] : null);
      if (alertMatch) {
        const notifId = parseInt(alertMatch[1], 10);
        const [deleted] = await db
          .delete(adminNotifications)
          .where(eq(adminNotifications.id, notifId))
          .returning();
        if (!deleted) return res.status(404).json({ message: "Notification not found" });
        return res.json({ ok: true });
      }
      const userId = getUserId(req)!;
      const [deleted] = await db
        .delete(notifications)
        .where(and(eq(notifications.id, rawId), eq(notifications.userId, userId)))
        .returning();
      if (!deleted) return res.status(404).json({ message: "Notification not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete notification", error: err.message });
    }
  });

  // PATCH /api/admin/notifications/read-all — mark all unread lead alerts as resolved
  app.patch("/api/admin/notifications/read-all", requireAdmin, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const [alertRows, userRows] = await Promise.all([
        db.update(adminNotifications)
          .set({ isRead: true })
          .where(eq(adminNotifications.isRead, false))
          .returning(),
        db.update(notifications)
          .set({ isRead: true })
          .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
          .returning(),
      ]);
      res.json({ success: true, updated: alertRows.length + userRows.length });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to mark all notifications as read", error: err.message });
    }
  });

  // GET /api/trips/:tripId/expert-request-status — traveler polls this to show
  // fallback message when their lead could not be auto-assigned
  app.get("/api/trips/:tripId/expert-request-status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
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

  // §9 shadow fix: mount tripsRoutes LAST so the canonical inline trip/itinerary handlers
  // above win the 57 duplicated paths, while tripsRoutes still serves its 32 UNIQUE,
  // consumer-backed endpoints (anchors, day-boundaries, transport-legs, itinerary-share,
  // expert-review, logistics presets, itinerary-variants, vendor contact-sheet/bulk-email,
  // /api/trips/:tripId/itinerary-items/:itemId). Express matches in registration order, so
  // an inline route registered earlier claims a shared path before this router sees it.
  app.use(tripsRoutes);

  return httpServer;
}
