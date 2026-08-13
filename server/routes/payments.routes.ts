import { verifyTripOwnership } from '../utils/trip-ownership';
import { getUserId } from "../utils/auth";
import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
// W2 (Trip-Canon Lane 1 Phase 1b): `cart_items` has exactly ONE writer — the projection module.
// The post-booking cart clear below goes through it. Passthrough; behavior identical.
import * as cartProjection from "../services/cart-projection.service";
import { markItemPurchased } from "../services/item-routing.service";
// Ruling 38 (checkout atomicity): the claim → authorize → promote spine + the TTL reclaim.
import {
  findPriorClaim,
  markStripeAttempt,
  stampAuthorization,
  assertServiceOwnerNotAway,
  ProviderAwayError,
} from "../services/checkout-claim.service";
// D6 rails attribution (docs/DECISIONS.md ruling 61): the chain from a shared link to the single
// fee resolver. §14/§18 — the ref SELECTS a band lane and can carry no rate, amount or identity;
// every rate still comes from `fee_bands` through `resolveProviderRate`, one call, inside the
// service below. A ref that fails server-side validation degrades to the incumbent full rate.
import {
  validateRailsRef,
  resolveRailsForItem,
  railsSnapshot,
  logRailsRefusal,
  type RailsItemResolution,
} from "../services/rails-attribution.service";
// 1C direct-lane repoint (docs/DECISIONS.md ruling 69 disposition 6): a DIRECT provider booking
// prices through the same D1 resolver the rails lane uses, so `fee_bands` is the single authority
// on every provider charge path — not just the attributed one (ruling 68 §5's owed item).
import {
  resolveDirectProviderRate,
  pickOwnerShareRate,
  directRateSnapshot,
  type DirectRateResolution,
} from "../services/direct-charge-rate.service";
// Lane 7 (docs/DECISIONS.md ruling 72): deposits / partial payments. Deposit amounts are derived
// server-side from the listing's OWN opt-in config × the server-side line total (§14/§18) — never
// from req.body — and the balance is a SECOND checkout the traveler completes before a cutoff.
import { resolveDepositPlan, resolveBalanceDueAt } from "../services/deposit.service";
import { resolveTravelSurcharge, type TravelSurchargeResult } from "../services/travel-surcharge.service";
// T2 (ruling 62/64 D7 capture; ruling 83 wiring): the D7 booking-eligibility gates — party size,
// start window, lead time — validated against the listing's own constraints BEFORE any slot claim or
// Stripe call (the B1 pickup_out_of_range placement). §13: NULL field ⇒ no constraint; §14: pure
// validation, no amount/rate off req.body.
import { resolveBookingEligibility } from "../services/booking-eligibility.service";
import {
  stampBalanceAuthorization,
  promoteBalancePayment,
} from "../services/checkout-claim.service";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { isExpertRole, isProviderRole, isEarnerRole } from "@shared/roles";
import { MIN_PAYOUT_CENTS, MIN_PAYOUT_DOLLARS, effectivePayoutMinimumCents } from "../config/payout.config";
import { eq, and, or, like, ilike, sql, desc, count, ne, isNotNull, asc, inArray } from "drizzle-orm";
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
  serviceBookings, serviceReviews, notifications, serviceProviderForms,
  shortLinks,
  bundleComponents,
  vendorAvailabilitySlots,
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
import { viatorService } from "../services/viator.service";
import { cacheService } from "../services/cache.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { claudeService } from "../services/claude.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "../services/routes.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService } from "../services/grok.service";
import { feverService } from "../services/fever.service";
import { partnerEventsCacheService } from "../services/partner-events-cache.service";
import { expertMatchScores, aiGeneratedItineraries, destinationIntelligence, localExpertForms, expertAiTasks, aiInteractions, destinationEvents, travelPulseTrending, travelPulseCities, travelPulseHappeningNow, visaRequirementsCache, expertServiceOfferings, expertServiceCategories, cityNeighborhoods, travelPulseHiddenGems } from "@shared/schema";
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
  feeConfigFromRates,
  calcInsuranceFee,
  getConciergeBookingRate,
  requireConciergeBookingRate,
  type CommissionRates,
} from "../services/commission";
import { calculateCommission, BookingType } from "../utils/commissionCalculator";

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


// FP-3 (credits retirement, decision-maker ratified): the credits/wallet system is RETIRED.
// The per-use fee funnel (§ pricing) + saved-card one-click checkout is the AI monetization
// model; credits had ZERO real consumers (deductCredits has no callers) and
// POST /api/wallet/add-credits was a free-credits hole (any admin session could mint balance
// with no payment behind it). All four endpoints below now return 410 Gone. The `wallets` /
// `creditTransactions` tables and their storage methods (getWallet, getOrCreateWallet,
// addCredits, deductCredits, getCreditTransactions) stay DORMANT per the roadmap — no drops,
// no migration. Do not resurrect these routes without a real payment/fulfillment path.

router.get("/api/wallet", isAuthenticated, (req, res) => {
    res.status(410).json({ message: "Credits have been retired — AI features are billed per use." });
  });

router.get("/api/wallet/transactions", isAuthenticated, (req, res) => {
    res.status(410).json({ message: "Credits have been retired — AI features are billed per use." });
  });

router.post("/api/wallet/add-credits", isAuthenticated, (req, res) => {
    // Closes the free-credits hole: this endpoint used to grant balance from a client-sent
    // amount with no payment behind it (admin-gated, but still a hole — see FP-3).
    res.status(410).json({ message: "Credits have been retired — AI features are billed per use." });
  });

router.post("/api/credits/purchase", isAuthenticated, (req, res) => {
    res.status(410).json({ message: "Credits have been retired — AI features are billed per use." });
  });

  // === Service Templates Routes (Admin manages, Experts browse) ===
  
  // Get all active service templates
  // expert_service_offerings is the canonical template catalog.
  // Returns the 6 named templates seeded at startup, mapped to ServiceTemplate shape.

router.get("/api/revenue-splits", async (req, res) => {
    try {
      const splits = await storage.getRevenueSplits();
      res.json(splits);
    } catch (err) {
      console.error("Error fetching revenue splits:", err);
      res.status(500).json({ message: "Failed to fetch revenue splits" });
    }
  });

// ─── §17 Product Builder — PROPERTY rung (migration 153) ──────────────────────────────────
//
// A property IS a provider_services row (product_shape='property'); each room type is a
// child row (product_shape='property_room', parentServiceId → property, pricing_unit=
// 'per_night'). Ratified contract (CLAUDE.md §17, "PROPERTY rung RATIFIED"): availability
// rides the EXISTING date-only vendor_availability_slots rail (no new table); charge =
// nights × the stored nightly rate, §14 fully server-derived; a multi-night stay claims
// every night atomically, all-or-nothing (§15); the night range is snapshotted into
// bookingDetails and the first night's slot_id stamped on the booking.
//
// Date-range carrier: cart_items has no column for a range (slotId holds exactly one slot,
// scheduledDate exactly one timestamp) — a new column would be its own migration for a
// single feature. contentMeta (jsonb, already on every cart row, otherwise unused for a
// serviceId-based add) carries {checkIn, checkOut} instead — the smallest existing carrier,
// written by POST /api/cart (server/routes.ts) and read here unchanged.

// Reads + validates the stay a room's cart row is carrying. Returns null for every non-room
// item AND for a room item whose dates are missing/malformed/out-of-range (>30 nights) — the
// caller decides what null means (checkout 400s; the fee preview simply prices it as 0).
// Exported so other totals surfaces (GET /api/cart in routes.ts) can reuse the exact same
// math instead of re-deriving/duplicating it — the residual "price × quantity" bug this
// closed was precisely two independent, silently-diverging implementations of this math.
export function getRoomNights(item: any): { checkIn: string; checkOut: string; nights: number } | null {
  if (item?.service?.pricingUnit !== "per_night") return null;
  const meta = (item?.contentMeta ?? {}) as Record<string, unknown>;
  const checkIn = typeof meta.checkIn === "string" ? meta.checkIn : null;
  const checkOut = typeof meta.checkOut === "string" ? meta.checkOut : null;
  if (!checkIn || !checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  if (checkOut <= checkIn) return null;
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
  if (!Number.isFinite(nights) || nights < 1 || nights > 30) return null;
  return { checkIn, checkOut, nights };
}

// §14: a room's charge is ALWAYS nights × the stored nightly rate — never quantity × price (a
// room's cart "quantity" is meaningless; the client pins it to 1). Every other item keeps the
// existing price × quantity math untouched, so this can replace that line everywhere it
// appears (checkout totals, checkout booking-creation, the cart fee-preview) with no behavior
// change for the rest of the catalog.
export function resolveItemBaseAmount(item: any): number {
  const stay = getRoomNights(item);
  const rate = parseFloat(item?.service?.price || "0");
  if (stay) return rate * stay.nights;
  return rate * (item?.quantity || 1);
}

// ── B1 travel surcharge (ruling 81): ONE preload+resolve pass, shared by every quote/charge surface
// (POST /api/checkout, GET /api/cart, GET /api/cart/fee-preview) so the amount quoted and the amount
// charged can never disagree. Returns a Map keyed by cart-item id. Zones-mode tiers are loaded once
// (a single query for all zones-mode services in the cart), then the pure resolver decides each line
// from the listing config + the traveler's confirmed pickup (§14 — no client amount reaches it). A
// service with mode 'none'/null resolves to amount 0 with zero DB work.
export async function resolveCartSurcharges(cartData: any[]): Promise<Map<string, TravelSurchargeResult>> {
  const out = new Map<string, TravelSurchargeResult>();
  const zonesServiceIds = Array.from(new Set(
    cartData
      .filter((i) => i.service && i.service.surchargeMode === "zones")
      .map((i) => i.service.id as string)
      .filter(Boolean),
  ));
  const tiersByService = new Map<string, Array<{ radiusKm: string; fee: string }>>();
  for (const sid of zonesServiceIds) {
    const tiers = await storage.getServiceSurchargeTiers(sid);
    tiersByService.set(sid, tiers.map((t) => ({ radiusKm: t.radiusKm, fee: t.fee })));
  }
  for (const item of cartData) {
    if (!item.service) continue;
    const tiers = item.service.surchargeMode === "zones"
      ? (tiersByService.get(item.service.id) ?? [])
      : [];
    out.set(item.id, resolveTravelSurcharge(item.service, item.pickupLocation ?? null, tiers));
  }
  return out;
}

// Postgres unique-violation (SQLSTATE 23505). Drizzle re-wraps driver errors, so the pg code
// can sit on the error itself or on its `cause` — check both rather than string-matching.
function isUniqueViolation(err: any): boolean {
  return err?.code === "23505" || (err as any)?.cause?.code === "23505";
}

// The calendar-date sequence [checkIn, checkOut) — one entry per night stayed, checkout day
// itself excluded (standard hotel semantics: a checkOut-day slot is not consumed).
function nightDatesBetween(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  let d = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  while (d < end) {
    dates.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return dates;
}

/**
 * STEPS 2+3 of the checkout spine (ruling 38): AUTHORIZE at Stripe, then — and only then —
 * PROMOTE the provisional claim into committed state.
 *
 * Shared by the first attempt and by the same-key re-drive, so "authorized" can only ever mean
 * one thing. Everything it needs about the claim is read from the DB, so the re-drive needs no
 * in-memory context and cannot price differently from the original attempt (§14: the charge is
 * derived from the persisted catalog-sourced rows, never from the client).
 *
 * ORDER IS THE WHOLE POINT:
 *   markStripeAttempt (Layer-1 marker) → paymentIntents.create → stampAuthorization (atomic,
 *   all-or-nothing) → item flips + counters + cart clear + notifications.
 * A failure at any point before the stamp leaves ONLY provisional rows, which the TTL sweep
 * reclaims. Nothing the traveler or the provider can see has changed, and the cart is intact.
 */
async function authorizeAndPromote(
  res: any,
  args: {
    userId: string;
    checkoutKey: string;
    bookings: Array<{ booking: any; contract?: any }>;
    subtotal: number;
    platformFee: number;
    conciergeFee: number;
    redriven?: boolean;
    /**
     * B2 one-click: attempt an OFF-SESSION confirm against the traveler's saved card instead of
     * handing back a clientSecret. An opt-in preference, not a money input — the amount is still
     * derived entirely from the claimed rows (§14), and the server independently verifies a saved
     * card actually exists. Absent or false ⇒ byte-identical to the previous behaviour.
     *
     * Named `useSavedCard` on the wire to match the vocabulary the optimize-fee one-click already
     * established (`/api/optimization-payments`: `useSavedCard` in; `oneClick` / `status` /
     * `requiresAction` out). Two one-click flows in one product should not speak two dialects.
     */
    useSavedCard?: boolean;
    /**
     * Lane 7 (ruling 72): the amount to charge NOW when this checkout collects DEPOSITS. Server-
     * derived (§14) as the sum of per-line deposit amounts + full non-deposit lines; each booking
     * row already carries its own deposit_amount/balance_amount. Absent ⇒ charge the full total,
     * byte-identical to the pre-deposit behaviour (§13).
     */
    chargeAmount?: number;
    /**
     * B1 (ruling 81): the sum of per-line travel surcharges, server-derived from each listing's mode
     * + config × the traveler's confirmed pickup (§14 — never off req.body). Added to the charged
     * total AND disclosed as its own "travelSurcharge" response line (the F1 disclosure posture).
     * Absent/0 ⇒ byte-identical to the pre-surcharge behaviour (§13). On a re-drive it is omitted
     * because each claimed row's surcharge is already folded into its stored total_amount, so the
     * re-drive's subtotal (Σ total_amount) already carries it — passing it again would double it.
     */
    surchargeTotal?: number;
  },
) {
  const { userId, checkoutKey, bookings, subtotal, platformFee, conciergeFee } = args;
  const surchargeTotal = args.surchargeTotal ?? 0;
  const fullTotal = subtotal + platformFee + conciergeFee + surchargeTotal;
  // Charge the deposit sum when this is a deposit checkout, else the full total (unchanged).
  const total = args.chargeAmount != null ? args.chargeAmount : fullTotal;
  const isDepositCheckout = args.chargeAmount != null && args.chargeAmount < fullTotal - 0.001;
  const bookingIds = bookings.map((b: any) => b.booking.id as string);

  // LAYER 1 of the paid-PI protection (see checkout-claim.service.ts): stamp the pre-flight
  // marker on EVERY row before Stripe is called. An unmarked row provably never reached Stripe,
  // which is what lets the sweep void it with no network call and zero risk of voiding a paid
  // booking. This must not be reordered below the Stripe call.
  await markStripeAttempt(bookingIds, `pi-${checkoutKey}`);

  const { stripePaymentService } = await import("../services/stripe-payment.service");
  let paymentIntent: any;
  try {
    paymentIntent = await stripePaymentService.createPaymentIntent(
      userId,
      bookings.map((b: any) => b.booking),
      total,
      isDepositCheckout,
      'usd',
      // §15 layer (a): the deterministic Stripe idempotency key. Uses the SAME normalised
      // key the DB claim used (`checkoutKey`, not the raw body value) so the two layers can
      // never disagree about what "this request" is — and so a re-drive of the same claim
      // returns Stripe's ORIGINAL PaymentIntent rather than creating a second one.
      checkoutKey,
      { offSession: args.useSavedCard === true },
    );
  } catch (stripeErr: any) {
    // THE FAILURE THIS LANE EXISTS FOR. Nothing irreversible has happened: no cart clear, no
    // purchased flip, no diary row, no provider email. The claim rows stay provisional and the
    // TTL sweep reclaims them (including their slot capacity) if the traveler walks away.
    // Answered as 503 with a machine-readable code — NOT the old bare 500 "Checkout failed",
    // which told the traveler nothing and told the client nothing it could act on.
    console.error(`[checkout] authorization failed for idempotencyKey=${checkoutKey}:`, stripeErr?.message ?? stripeErr);
    return res.status(503).json({
      success: false,
      error: "payment_unavailable",
      message:
        "We couldn't reach our payment provider, so nothing was charged and nothing was booked. " +
        "Your cart is exactly as you left it — please try again.",
      retryable: true,
    });
  }

  if (!paymentIntent?.paymentIntentId) {
    console.error(`[checkout] authorization returned no PaymentIntent id for idempotencyKey=${checkoutKey}`);
    return res.status(503).json({
      success: false,
      error: "payment_unavailable",
      message:
        "We couldn't reach our payment provider, so nothing was charged and nothing was booked. " +
        "Your cart is exactly as you left it — please try again.",
      retryable: true,
    });
  }

  // The AUTHORIZE→PROMOTE gate: an atomic, all-or-nothing conditional stamp on the provisional
  // predicate. If the TTL sweep voided these rows first this returns false and we refuse to
  // promote — handing back a clientSecret for a voided booking is precisely the outcome the
  // race-safety requirement forbids.
  const claimed = await stampAuthorization(bookingIds, paymentIntent.paymentIntentId);
  if (!claimed) {
    return res.status(409).json({
      success: false,
      error: "checkout_claim_expired",
      message: "This checkout expired before payment could start. Your cart is intact — please try again.",
      retryable: true,
    });
  }

  // ── D6 (ruling 61): the fee EVENT for a rails-attributed booking ────────────────────────────
  // Written HERE, at the authorization stamp — migration 179's own stated strategy (b): the
  // PaymentIntent is in scope, and a provisional claim the TTL sweep may still void never gets a
  // row in an append-only table with no DELETE path. Rows are derived from the snapshot the claim
  // already carries, never re-resolved (a band re-priced in the last few seconds must not rewrite
  // what was charged), and the write is idempotent by a per-booking key + UNIQUE index, so the
  // re-drive and the webhook's own retry land EXACTLY ONE row.
  //
  // Best-effort in precisely the sense every post-authorization effect here is: Stripe has the
  // money and the booking row is the money truth, so a recording failure is logged loudly and the
  // promotion path retries the same idempotent write — it never fails a paid checkout.
  try {
    const { recordRailsFeeLedger } = await import("../services/fee-ledger.service");
    await recordRailsFeeLedger({
      bookingIds,
      stripePaymentRef: paymentIntent.paymentIntentId,
      actor: "checkout",
    });
  } catch (ledgerErr: any) {
    console.error(
      `[checkout] rails fee-ledger write failed for idempotencyKey=${checkoutKey} ` +
        `(payment AUTHORIZED; the promotion path retries the same idempotent write):`,
      ledgerErr?.message ?? ledgerErr,
    );
  }

  await promoteAuthorizedCheckout(userId, bookingIds);

  // ── B2: the off-session confirm already SUCCEEDED, so payment is a fact, not a promise ──────
  // Drive the SAME shared promotion the webhook and the client fallback drive (§15c: one
  // promotion implementation, N callers — never a second implementation). Doing it inline is
  // what makes one-click actually one click: without it the booking would sit `payment_pending`
  // until the webhook arrived, and the traveler would be shown a pending purchase they have
  // already paid for.
  //
  // Safe against a double signal BY CONSTRUCTION: promotePaidCheckout's flip is an atomic
  // conditional on (status='payment_pending' AND stripe_payment_intent_id=<pi>), so the webhook
  // arriving moments later matches zero rows and is a no-op — exactly one flip, one diary row.
  // Actor "checkout" is deliberately NOT server-verified: this path passes bookingIds explicitly
  // and has already stamped them, so it never needs the ordering-1 stamping capability.
  //
  // Best-effort by the same logic as promoteAuthorizedCheckout: Stripe has taken the money, so a
  // failure here must not fail the response. The webhook and the drift job both still converge.
  let paidPromotion = false;
  if (paymentIntent?.status === "succeeded") {
    try {
      const { promotePaidCheckout } = await import("../services/checkout-claim.service");
      const promo = await promotePaidCheckout({
        paymentIntentId: paymentIntent.paymentIntentId,
        actor: "checkout",
        actorId: userId,
        bookingIds,
      });
      paidPromotion = promo.promoted.length > 0 || promo.alreadyConfirmed.length > 0;
    } catch (err: any) {
      console.error(
        `[checkout] one-click paid-promotion failed for ${paymentIntent.paymentIntentId} ` +
        `(payment SUCCEEDED; webhook/reconciliation will converge):`, err?.message ?? err,
      );
    }
  }

  // R3/F6: commissionRate is the REAL charged ratio (platformFee/subtotal), not the
  // calculateCommission display literal (0.30) that matched no actual rate. Display-only field.
  const effectiveCommissionRate = subtotal > 0 ? Number((platformFee / subtotal).toFixed(4)) : 0;

  return res.status(201).json({
    success: true,
    bookings,
    subtotal: subtotal.toFixed(2),
    platformFee: platformFee.toFixed(2),
    conciergeFee: conciergeFee.toFixed(2),
    // B1 (ruling 81): the travel surcharge disclosed as its OWN line, so the traveler sees it before
    // completing payment (the F1 fee-disclosure posture, ruling 80). Server-derived (§14).
    travelSurcharge: surchargeTotal.toFixed(2),
    total: total.toFixed(2),
    paymentIntent,
    bookingType: BookingType.EXPERIENCE_CART,
    commissionRate: effectiveCommissionRate,
    // Lane 7 (ruling 72): when this checkout collected deposits, `total` is the amount charged NOW
    // (the deposit sum); `fullAmount` is the full cart value, and the outstanding balance is
    // collected later per booking via POST /api/bookings/:id/pay-balance.
    ...(isDepositCheckout ? { depositCheckout: true, amountChargedNow: total.toFixed(2), fullAmount: fullTotal.toFixed(2) } : {}),
    ...(args.redriven ? { redriven: true } : {}),
    // B2 — same three fields the optimize-fee one-click already returns, so the client can reuse
    // its existing branch shape. `oneClick && status === "succeeded"` ⇒ paid, nothing left to do,
    // and the client must NOT call stripe.confirmPayment with the clientSecret. `requiresAction`
    // ⇒ the saved card was declined or the bank demanded 3DS, so finish it interactively with the
    // clientSecret already in `paymentIntent`. Neither field appears unless one-click was asked
    // for, so existing callers see the response byte-identically.
    ...(args.useSavedCard
      ? {
          oneClick: true,
          status: paymentIntent?.status,
          requiresAction: paymentIntent?.status !== "succeeded",
          confirmed: paidPromotion,
        }
      : {}),
    message:
      paymentIntent?.status === "succeeded"
        ? "Payment complete. Your booking is confirmed."
        : "Booking created successfully. Complete payment.",
  });
}

/**
 * STEP 3 — everything that may only happen once a PaymentIntent exists.
 *
 * Reads its context from the booking rows so the first attempt and the re-drive execute the
 * identical promotion. Every effect here is best-effort in the same sense it always was: the
 * booking is the money truth, and a plan flag / counter / notification must never fail a
 * checkout that Stripe has already authorized.
 */
async function promoteAuthorizedCheckout(userId: string, bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;

  const rows = await db.execute(sql`
    SELECT sb.id,
           sb.service_id,
           sb.provider_id,
           sb.total_amount,
           sb.booking_details->>'itineraryItemId' AS itinerary_item_id,
           ps.service_name
    FROM service_bookings sb
    LEFT JOIN provider_services ps ON ps.id = sb.service_id
    WHERE sb.id IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})
  `);

  const traveler = await storage.getUser(userId).catch(() => null);
  const travelerName = traveler
    ? [traveler.firstName, traveler.lastName].filter(Boolean).join(" ") || traveler.email || "A traveler"
    : "A traveler";

  for (const raw of rows.rows as any[]) {
    const bookingId = String(raw.id);
    const price = parseFloat(raw.total_amount || "0");

    // ── W4 (H2): the purchase reaches the plan ────────────────────────────────────────
    // ROUTING_STATE_CONTRACT §2 — checkout is the SOLE writer of the forward
    // `ready_for_checkout → purchased` edge. It now writes it AFTER authorization (ruling 38):
    // the plan may only claim a purchase once a PaymentIntent exists to back it.
    //
    // Only a PROJECTED cart row has a plan item to flip — `itinerary_item_id` (migration 160)
    // is NULL on every legacy/guest/direct-add row, and those are skipped. The flip itself is
    // an atomic conditional UPDATE paired with its diary row inside the helper's own
    // transaction (ruling 18); 0 rows matched is LOGGED AND IGNORED, never fatal.
    if (raw.itinerary_item_id) {
      await markItemPurchased(String(raw.itinerary_item_id), bookingId);
    }

    if (raw.service_id) {
      await storage
        .incrementServiceBookings(String(raw.service_id), 1)
        .catch((e: any) => console.error(`[checkout] bookings-count increment failed for ${raw.service_id}:`, e));
    }

    // Provider notification + email. Post-authorization by design: the old ordering emailed a
    // provider "New Booking Request" for checkouts that never obtained a PaymentIntent, and an
    // email is the one effect no rollback or TTL can take back.
    try {
      if (raw.provider_id) {
        await storage.createNotification({
          userId: String(raw.provider_id),
          type: "booking_request",
          title: "New Booking Request",
          message: `${travelerName} booked "${raw.service_name ?? "a service"}" ($${price.toFixed(2)})`,
          relatedId: bookingId,
          relatedType: "booking",
          data: {
            bookingId,
            serviceName: raw.service_name ?? null,
            travelerName,
            amount: price.toFixed(2),
          },
        });

        const provider = await storage.getUser(String(raw.provider_id));
        if (provider?.email) {
          const { sendBookingAlertEmail } = await import("../services/email.service");
          const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ") || provider.email;
          await sendBookingAlertEmail({
            providerEmail: provider.email,
            providerName,
            bookingId,
            serviceName: raw.service_name ?? "a service",
            travelerName,
            amount: price.toFixed(2),
          });
        }
      }
    } catch (notifErr) {
      console.error("Failed to create checkout booking notification:", notifErr);
    }
  }

  // Cart clear LAST, and only now: while a claim is unauthorized the traveler must still have a
  // cart to retry from. This single line moving below the Stripe call is what turns "fresh key ⇒
  // Cart is empty" into a working retry.
  await cartProjection.clearCart(userId);
}

router.post("/api/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId, notes, idempotencyKey } = req.body;

      // ── Idempotency guard (DB level) ────────────────────────────────────────
      // §15: the key is REQUIRED. Previously the dedup only ran `if (idempotencyKey)`,
      // so a client that omitted it bypassed dedup entirely — a retry/double-click could
      // create duplicate bookings + Stripe charges. The real client always sends a UUID
      // (cart.tsx, generated once per mount so it is stable across retries), so requiring
      // it only blocks the replay-bypass path. Trimmed + length-capped: a whitespace-only
      // key is as good as no key, and an unbounded string would be stamped onto every row.
      const checkoutKey =
        typeof idempotencyKey === "string" ? idempotencyKey.trim() : "";
      if (!checkoutKey || checkoutKey.length > 200) {
        return res.status(400).json({
          success: false,
          error: "idempotencyKey is required",
        });
      }
      // ── Prior-claim resolution (ruling 38) ──────────────────────────────────────────────
      // §15 requires that a retry produce "the SAME single effect". The old code answered every
      // prior key with a bare `{duplicate:true}` carrying no clientSecret — which the cart page
      // rendered as "Booking created!" and redirected to /bookings, telling the traveler a
      // checkout with NO PaymentIntent behind it had succeeded. A prior claim has three states
      // and they are NOT the same answer:
      //
      //   • AUTHORIZED (stripe_payment_intent_id set) — the earlier attempt got a PaymentIntent.
      //     Hand the SAME one back: one claim, one PI, one charge.
      //   • PROVISIONAL (payment_pending + PI id NULL) — the earlier attempt claimed the key but
      //     never reached an authorization. RE-DRIVE it below against the SAME rows and the SAME
      //     Stripe key. Nothing irreversible was committed, so the cart is still intact and this
      //     is a genuine continuation, not a second checkout.
      //   • SPENT (confirmed / failed / expired by the TTL sweep) — report it honestly.
      //
      // Still only a fast path, never the concurrency guard: two simultaneous requests both read
      // "not found". The guard remains the atomic claim at the first booking insert, protected by
      // the unique partial index on service_bookings.idempotency_key (migration 096, re-asserted
      // by 155, DECLARED in shared/schema.ts so the deploy push maintains it).
      const priorClaim = await findPriorClaim(userId, checkoutKey);
      if (priorClaim.length > 0) {
        const authorized = priorClaim.find((r) => r.stripePaymentIntentId);
        if (authorized) {
          const { stripePaymentService } = await import("../services/stripe-payment.service");
          const pi = await stripePaymentService
            .getPaymentIntentClientSecret(authorized.stripePaymentIntentId!)
            .catch(() => null);
          console.info(`[checkout] idempotencyKey=${checkoutKey} already authorized — returning the same PaymentIntent`);
          return res.status(200).json({
            success: true,
            duplicate: true,
            bookings: priorClaim.map((r) => ({ booking: { id: r.id } })),
            ...(pi ? { paymentIntent: pi } : {}),
            note: "This checkout was already authorized — completing the existing payment.",
          });
        }
        const provisional = priorClaim.filter(
          (r) => r.status === "payment_pending" && !r.stripePaymentIntentId,
        );
        if (provisional.length === priorClaim.length) {
          // Re-drive. The charge total is recomputed from the CLAIMED ROWS, not from the client
          // and not from a re-priced cart (§14): every row's totalAmount/platformFee was derived
          // from the catalog + fee_bands when the claim was written, so this cannot drift.
          console.info(`[checkout] idempotencyKey=${checkoutKey} has an unauthorized claim — re-driving authorization`);
          // Lane 7 (ruling 72): a re-drive charges the SAME amount the first attempt would have —
          // the per-row deposit for a deposit line, the full line otherwise — read from the claimed
          // rows, never recomputed from a re-priced cart (§14). No deposit rows ⇒ chargeAmount
          // equals the full total, so this is byte-identical to the pre-deposit re-drive (§13).
          const redriveAnyDeposit = provisional.some((r) => r.depositAmount != null);
          const redriveChargeNow = provisional.reduce(
            (s, r) =>
              s +
              (r.depositAmount != null
                ? parseFloat(r.depositAmount)
                : parseFloat(r.totalAmount || "0") + parseFloat(r.platformFee || "0")),
            0,
          );
          return await authorizeAndPromote(res, {
            userId,
            checkoutKey,
            bookings: provisional.map((r) => ({ booking: { id: r.id } })),
            subtotal: provisional.reduce((s, r) => s + parseFloat(r.totalAmount || "0"), 0),
            platformFee: provisional.reduce((s, r) => s + parseFloat(r.platformFee || "0"), 0),
            conciergeFee: 0, // already folded into each row's stored platformFee
            ...(redriveAnyDeposit ? { chargeAmount: Math.round(redriveChargeNow * 100) / 100 } : {}),
            redriven: true,
            useSavedCard: req.body?.useSavedCard === true,
          });
        }
        // Mixed or terminal — the key is spent. Never a false success.
        console.info(`[checkout] idempotencyKey=${checkoutKey} is spent (statuses: ${priorClaim.map((r) => r.status).join(",")})`);
        return res.status(409).json({
          success: false,
          error: "checkout_key_spent",
          message:
            "This checkout has already been completed or has expired. Please start a new checkout.",
        });
      }

      // ── S4 acquisition attribution — vocabulary direct | link | cross_sell, DERIVED
      // SERVER-SIDE. 'link' is granted only when the client-captured ?ref= resolves to a real
      // short_links.code (migration 139) — a client cannot claim 'link' by assertion. Analytics
      // dimension only: never read into any fee/amount/payout decision.
      let acquisitionSource: "direct" | "link" | "cross_sell" = "direct";
      let acquisitionRef: string | null = null;
      const refCandidate =
        typeof req.body.ref === "string" ? req.body.ref.trim().toLowerCase() : "";
      if (refCandidate && refCandidate.length <= 12) {
        const [link] = await db
          .select({ code: shortLinks.code })
          .from(shortLinks)
          .where(eq(shortLinks.code, refCandidate))
          .limit(1);
        if (link) {
          acquisitionSource = "link";
          acquisitionRef = link.code;
        }
      }
      if (acquisitionSource === "direct" && req.body.source === "cross_sell") {
        acquisitionSource = "cross_sell";
      }

      // Get cart items
      const cartData = await storage.getCartItems(userId);

      if (cartData.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }

      // ── §17 bundles (migration 151): re-verify + snapshot BEFORE any write ──────────
      // For each bundle in the cart, every component must STILL be approved+active
      // (F2: no unapproved service hides inside a sellable bundle) — 409 before any
      // slot claim / booking row / Stripe call otherwise. The component list is
      // snapshot into bookingDetails below (contents locked at purchase — the
      // ready-made snapshot posture). No-op for non-bundle services.
      const bundleSnapshots = new Map<string, Array<{ id: string; serviceName: string }>>();
      for (const item of cartData) {
        if (item.service?.productShape !== "bundle" || bundleSnapshots.has(item.service.id)) continue;
        const components = await db
          .select({
            id: providerServices.id,
            serviceName: providerServices.serviceName,
            approvalStatus: providerServices.approvalStatus,
            status: providerServices.status,
          })
          .from(bundleComponents)
          .innerJoin(providerServices, eq(bundleComponents.componentServiceId, providerServices.id))
          .where(eq(bundleComponents.bundleServiceId, item.service.id))
          .orderBy(asc(bundleComponents.position));
        if (
          components.length === 0 ||
          components.some((c) => c.approvalStatus !== "approved" || c.status !== "active")
        ) {
          return res.status(409).json({ message: "bundle_component_unavailable" });
        }
        bundleSnapshots.set(item.service.id, components.map((c) => ({ id: c.id, serviceName: c.serviceName })));
      }

      // ── §17 property rooms: re-verify room + parent property BEFORE any claim/write ────
      // Same F2 posture as the bundle snapshot above — approval can change between add-to-cart
      // and checkout, so both the room AND its parent property must STILL be approved+active
      // here (409 otherwise). Keyed by cart item id (not serviceId — a service can appear in
      // exactly one cart row per the addToCart dedup, but item.id is the unambiguous key used
      // by every downstream loop below).
      const roomStays = new Map<
        string,
        { checkIn: string; checkOut: string; nights: number; propertyId: string; propertyName: string; roomName: string; nightlyRate: number; firstNightSlotId?: string }
      >();
      for (const item of cartData) {
        if (item.service?.pricingUnit !== "per_night") continue;
        const stay = getRoomNights(item);
        if (!stay) {
          return res.status(400).json({
            message: `Missing or invalid check-in/check-out dates for "${item.service?.serviceName ?? "a room"}"`,
          });
        }
        const room = item.service;
        if (room.approvalStatus !== "approved" || room.status !== "active") {
          return res.status(409).json({ message: "property_unavailable", detail: `"${room.serviceName}" is no longer available.` });
        }
        if (!room.parentServiceId) {
          return res.status(409).json({ message: "property_unavailable", detail: `"${room.serviceName}" is not attached to a property.` });
        }
        const [property] = await db.select().from(providerServices).where(eq(providerServices.id, room.parentServiceId));
        if (!property || property.approvalStatus !== "approved" || property.status !== "active") {
          return res.status(409).json({ message: "property_unavailable", detail: `The property for "${room.serviceName}" is no longer available.` });
        }
        roomStays.set(item.id, {
          ...stay,
          propertyId: property.id,
          propertyName: property.serviceName,
          roomName: room.serviceName,
          nightlyRate: parseFloat(room.price || "0"),
        });
      }

      // ── B1 (ruling 81): resolve travel surcharges ONCE, and refuse an out-of-range pickup BEFORE
      // any slot claim or Stripe call ─────────────────────────────────────────────────────────────
      // The surcharge for each line is SERVER-DERIVED (§14) from the listing's mode + config × the
      // traveler's CONFIRMED pickup (cart_items.pickup_location) — never off req.body. This one map
      // is read by both the quote loop and the charge loop below, so the amount quoted and the amount
      // charged cannot disagree (the one-resolver discipline). A confirmed pickup beyond the listing's
      // outer bound (surcharge_max_km, or — for zones — the largest ring) makes the booking
      // INELIGIBLE: refuse here, before any capacity is claimed or anything is charged.
      const surchargeByItemId = await resolveCartSurcharges(cartData);
      for (const item of cartData) {
        const sc = surchargeByItemId.get(item.id);
        if (sc && !sc.eligible) {
          return res.status(400).json({
            success: false,
            error: "pickup_out_of_range",
            serviceId: item.serviceId,
            serviceName: item.service?.serviceName,
            message: `"${item.service?.serviceName ?? "This service"}" doesn't travel that far — your pickup location is outside its coverage. Choose a closer pickup or a different service.`,
          });
        }
      }

      // ── T2 (ruling 62/64/83): D7 booking-ELIGIBILITY gates — refuse an ineligible request BEFORE
      // any slot claim or Stripe call (the B1 pickup_out_of_range placement above). ─────────────────
      // Each gate reads the LISTING's own D7 config (migration 195) + this booking line's own inputs
      // (cart_items.party_size, cart_items.scheduled_date — the latter server-derived from the slot at
      // add-to-cart) — SERVER-SIDE, never off req.body (§14: no amount/rate here, this is pure
      // validation). §13: an UNSET listing field is NO constraint (the provider never specified), so
      // that gate does not apply; an ABSENT booking input skips the gate that needs it — we never
      // fabricate a bound or a party count. No capacity is claimed and nothing is charged on refusal.
      // Room stays (per_night) are date-RANGE bookings, not point-in-time starts — the start-window /
      // lead-time gates key on a single scheduled instant, so their scheduled_date drives these the
      // same as any other line (a room carries none ⇒ time gates skip; party size still applies).
      const refuseMessages: Record<string, string> = {
        party_size_out_of_range: "party size out of range",
        outside_start_window: "requested start is outside this service's booking window",
        insufficient_lead_time: "requested start does not meet this service's lead-time notice",
      };
      for (const item of cartData) {
        if (!item.service) continue;
        const elig = resolveBookingEligibility(item.service as any, {
          partySize: (item as any).partySize ?? null,
          scheduledDate: (item as any).scheduledDate ?? null,
        });
        if (!elig.eligible) {
          return res.status(400).json({
            success: false,
            error: elig.reason,
            serviceId: item.serviceId,
            serviceName: item.service?.serviceName,
            message: elig.detail ?? refuseMessages[elig.reason!] ?? "This booking request is not eligible for this service.",
          });
        }
      }

      // ── C3 (§15): ATOMIC slot claims BEFORE any booking row or Stripe call ─────────────
      // Each slot-bound item claims capacity via storage.bookSlot (conditional UPDATE ...
      // WHERE booked_count < capacity RETURNING — the DB row transition IS the concurrency
      // guard). If ANY item's slot just filled, release the slots already claimed in this
      // request (compensation) and abort with 409 slot_unavailable — no bookings created,
      // nothing charged. Claims that succeed stay claimed while the booking completes; if
      // payment later fails the booking sits payment_pending and the slot stays held.
      //
      // STALE COMMENT CLOSED (QA-2 lane, ledger 96, Finding C — INVESTIGATED, not re-filed):
      // this used to say "release on abandoned/refunded bookings is a filed follow-up". Both
      // halves are landed and covered elsewhere, so nothing here needed building:
      //   • ABANDONED (payment never authorized/paid) — the §15b TTL sweep's voidClaim
      //     (checkout-claim.service.ts) already releases the slot atomically with the void.
      //   • REFUNDED (a paid, slot-bound booking) — stripe-payment.service.ts's
      //     refundServiceBooking already calls storage.releaseSlot after the refund succeeds.
      // The GAP the audit actually found was a THIRD case neither of those covers: a paid,
      // slot-bound booking cancelled with NO refund due (a non-refundable cancellation policy, or
      // an owner decline whose Stripe lookup could not confirm payment) — that path calls
      // storage.updateServiceBookingStatus directly and never touched the slot. FIXED there: the
      // canonical writer now releases the slot atomically on the booking's FIRST transition into
      // cancelled/refunded (see its docblock) — one fix, in the one writer, not a second reclaim
      // rail beside this claim machine (§18c).
      //
      // §17 room stays claim MULTIPLE nights (one slot per date) instead of a single itemSlotId
      // — all-or-nothing for the stay itself, released into the SAME claimedSlotIds compensation
      // list so a later item's failure also unwinds every night already claimed by this one.
      // Vacation-mode pre-flight (§06b ruling): a blocked item never reaches the DB claim.
      // Demand valve, not a money invariant — a race that slips past books normally (documented
      // in checkout-claim.service.ts beside the guard).
      try {
        const checkedOwners = new Set<string>();
        for (const item of cartData) {
          const sid = item.service?.id ?? item.serviceId;
          if (sid && !checkedOwners.has(sid)) {
            checkedOwners.add(sid);
            await assertServiceOwnerNotAway(sid);
          }
        }
      } catch (err) {
        if (err instanceof ProviderAwayError) {
          return res.status(409).json({ message: "provider_away", detail: err.message });
        }
        throw err;
      }

      const claimedSlotIds: string[] = [];
      const releaseClaimed = async (ids: string[]) => {
        for (const id of ids) {
          await storage.releaseSlot(id).catch((e: any) =>
            console.error(`[checkout] slot compensation release failed for ${id}:`, e));
        }
      };
      for (const item of cartData) {
        const stay = roomStays.get(item.id);
        if (stay) {
          const nightDates = nightDatesBetween(stay.checkIn, stay.checkOut);
          const nightSlots = await db
            .select({ id: vendorAvailabilitySlots.id, date: vendorAvailabilitySlots.date })
            .from(vendorAvailabilitySlots)
            .where(and(eq(vendorAvailabilitySlots.serviceId, item.serviceId!), inArray(vendorAvailabilitySlots.date, nightDates)));
          const slotIdByDate = new Map(nightSlots.map((s) => [String(s.date), s.id]));
          const unpublished = nightDates.filter((d) => !slotIdByDate.has(d));
          if (unpublished.length > 0) {
            await releaseClaimed(claimedSlotIds);
            return res.status(409).json({
              success: false,
              error: "nights_unavailable",
              message: `"${stay.roomName}" isn't available for ${unpublished.join(", ")}. Please pick different dates.`,
            });
          }
          const claimedThisStay: string[] = [];
          let nightFailed = false;
          for (const d of nightDates) {
            const claimed = await storage.bookSlot(slotIdByDate.get(d)!);
            if (!claimed) { nightFailed = true; break; }
            claimedThisStay.push(claimed.id);
          }
          if (nightFailed) {
            await releaseClaimed([...claimedThisStay, ...claimedSlotIds]);
            return res.status(409).json({
              success: false,
              error: "nights_unavailable",
              message: `"${stay.roomName}" was just booked for one of ${stay.checkIn}–${stay.checkOut}. Please pick different dates.`,
            });
          }
          claimedSlotIds.push(...claimedThisStay);
          roomStays.set(item.id, { ...stay, firstNightSlotId: claimedThisStay[0] });
          continue;
        }

        const itemSlotId = (item as any).slotId as string | null | undefined;
        if (!itemSlotId || !item.service) continue;
        const claimed = await storage.bookSlot(itemSlotId);
        if (!claimed) {
          await releaseClaimed(claimedSlotIds);
          return res.status(409).json({
            success: false,
            error: "slot_unavailable",
            serviceId: item.serviceId,
            serviceName: item.service?.serviceName,
            message: `The time slot for "${item.service?.serviceName ?? "an item"}" was just booked. Please pick another time.`,
          });
        }
        claimedSlotIds.push(itemSlotId);
      }

      // safeParseRate: returns fallback when value is missing, non-numeric, or outside [0,1]
      const safeParseRate = (value: any, fallback: number): number => {
        const n = parseFloat(value);
        return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
      };

      // Preload category slugs once to avoid N+1 queries in the item loops below.
      // Maps serviceCategories.id (UUID) → booking_fee_configs category key.
      const distinctCatIds = Array.from(new Set(
        cartData.filter(i => i.service?.categoryId).map(i => i.service!.categoryId as string)
      ));
      const catSlugMap = new Map<string, string>(); // categoryId → fee-config slug
      if (distinctCatIds.length > 0) {
        const catRows = await storage.getServiceCategorySlugsByIds(distinctCatIds);
        for (const row of catRows) {
          catSlugMap.set(row.id, serviceCategorySlugToFeeCategory(row.slug));
        }
      }

      // Phase 3.4: Preload expert offering type keys to detect booking_concierge services.
      // Maps expertOfferingTypeId (UUID) → offeringTypeKey string.
      const distinctOfferingTypeIds = Array.from(new Set(
        cartData.filter(i => i.service?.expertOfferingTypeId).map(i => i.service!.expertOfferingTypeId as string)
      ));
      const offeringTypeKeyMap = new Map<string, string>();
      if (distinctOfferingTypeIds.length > 0) {
        const typeRows = await storage.getExpertOfferingTypeKeysByIds(distinctOfferingTypeIds);
        for (const row of typeRows) {
          offeringTypeKeyMap.set(row.id, row.key);
        }
      }
      // Phase 3.4: Load the Booking Concierge flat facilitation fee amount once.
      // expert_concierge_booking is rate_type='flat' (dollar amount, NOT a split fraction).
      // This fee is added ON TOP of the normal 75/25 expert_standard split.
      // Money gate: if any cart item is booking_concierge, use the strict loader
      // which throws "Booking Concierge fee band not configured" if the band is
      // missing or zero — preventing a $0 charge on a misconfigured prod DB.
      const hasAnyBookingConciergeItem = cartData.some(i =>
        i.service?.expertOfferingTypeId
          ? offeringTypeKeyMap.get(i.service.expertOfferingTypeId) === "booking_concierge"
          : false,
      );
      const conciergeBookingFlatFee = hasAnyBookingConciergeItem
        ? await requireConciergeBookingRate()
        : await getConciergeBookingRate();

      // ── D6 RAILS ATTRIBUTION (docs/DECISIONS.md ruling 61) ───────────────────────────────────
      // ONE pre-pass, consumed by BOTH loops below, so the amount QUOTED and the amount CLAIMED can
      // never disagree about attribution: the two loops already resolve rates twice, and this lane
      // deliberately does not add a third place where the decision could drift.
      //
      // §14/§18 — `req.body.ref` is an OPAQUE SELECTOR. It names a `short_links` row that the server
      // re-reads and re-authorizes against THIS traveler and THIS listing's owner; it can express
      // neither a rate nor an amount, and a forged one buys nothing. Every refusal (fabricated /
      // expired / wrong-provider / self-referral / non-provider lane) degrades to the incumbent full
      // rate, is recorded on the booking row, and can never fail the purchase.
      //
      // The rate itself is ONE call into the single resolver (`resolveProviderRate`, rulings 47/48)
      // made inside `resolveRailsForItem` — min(category band, rails) and the traveler-fee waiver
      // both stay in there. Nothing here computes a rate.
      //
      // The whole pre-pass is wrapped: rails is an OPTIONAL discount lane, so an attribution
      // failure of any kind leaves an empty map, every line prices at the incumbent full rate, and
      // the traveler still buys. It can never be the reason a checkout 500s.
      const railsByItemId = new Map<string, RailsItemResolution>();
      // Owner role, resolved ONCE per distinct owner and shared by the rails pre-pass, the 1C
      // direct pre-pass and both charge loops below — the loops used to re-query it per item per
      // loop, which is three chances for the same question to be answered differently.
      const ownerRoleById = new Map<string, string | null>();
      const ownerRoleOf = async (ownerId: string | null | undefined): Promise<string | null> => {
        if (!ownerId) return null;
        if (!ownerRoleById.has(ownerId)) {
          const [ownerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, ownerId))
            .limit(1);
          ownerRoleById.set(ownerId, ownerRow?.role ?? null);
        }
        return ownerRoleById.get(ownerId) ?? null;
      };
      try {
        const railsValidation = await validateRailsRef({ ref: refCandidate, travelerUserId: userId });
        for (const item of cartData) {
          if (!item.service) continue;
          const ownerId = item.service.userId ?? null;
          await ownerRoleOf(ownerId);
          const railsResolution = await resolveRailsForItem({
            ref: refCandidate,
            travelerUserId: userId,
            serviceOwnerUserId: ownerId,
            ownerRole: ownerRoleById.get(ownerId ?? "") ?? null,
            categoryId: item.service.categoryId ?? null,
            itemSubtotal: resolveItemBaseAmount(item),
            preValidated: railsValidation,
          });
          railsByItemId.set(item.id, railsResolution);
          if (!railsResolution.attributed && railsResolution.reason) {
            logRailsRefusal({
              reason: railsResolution.reason,
              ref: railsResolution.ref,
              serviceId: item.service.id ?? item.serviceId,
              travelerUserId: userId,
            });
          }
        }
      } catch (railsErr: any) {
        railsByItemId.clear();
        console.error(
          `[checkout] rails attribution pre-pass failed — every line prices at the FULL rate:`,
          railsErr?.message ?? railsErr,
        );
      }

      // ── 1C DIRECT-LANE RATE (docs/DECISIONS.md ruling 69 disposition 6) ─────────────────────
      // The SECOND pre-pass, on the SAME shape and for the same reason as the rails one: the two
      // charge loops below resolve rates twice and two more surfaces quote the same cart, so the
      // attribution AND the band decision are each made ONCE here and read everywhere. The amount
      // quoted and the amount claimed cannot disagree because they are not two decisions.
      //
      // §18 rule 1 — nothing here computes a rate: `resolveDirectProviderRate` makes ONE call into
      // `resolveProviderRate`, the same single resolver the rails lane calls. A refusal (expert
      // lane, no category, breached band guard) leaves the incumbent legacy resolution standing
      // for that line; it never throws and never fails a purchase.
      const directRateByItemId = new Map<string, DirectRateResolution>();
      for (const item of cartData) {
        if (!item.service) continue;
        // A rails-attributed line is already priced by the resolver; asking twice would only
        // create a second answer to the same question.
        if (railsByItemId.get(item.id)?.rate) continue;
        directRateByItemId.set(
          item.id,
          await resolveDirectProviderRate({
            serviceOwnerUserId: item.service.userId ?? null,
            ownerRole: ownerRoleById.get(item.service.userId ?? "") ?? null,
            categoryId: item.service.categoryId ?? null,
            serviceId: item.service.id ?? item.serviceId,
          }),
        );
      }

      // Calculate totals — resolve per-item rates from booking_fee_configs then sum
      let checkoutSubtotal = 0;
      let checkoutBasePlatformFeeTotal = 0;
      let checkoutConciergeFeeTotal = 0;
      // B1 (ruling 81): the travel-surcharge sum, kept SEPARATE from subtotal/platformFee — it is
      // neither the service price nor a platform fee. Disclosed as its own line; added to the total.
      let checkoutSurchargeTotal = 0;
      for (const item of cartData) {
        if (!item.service) continue;
        // §17: nights × nightly rate for a room, else the existing price × quantity (§14).
        const itemPrice = resolveItemBaseAmount(item);
        // Map service category UUID → booking_fee_configs slug → commission rates
        let feeCategory = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        // Canonical vocabulary (shared/roles.ts): stored role is "service_provider" — the old
        // `=== "provider"` was always false, misrouting provider items to the expert band. The
        // role itself comes from the ONE pre-pass map above, so this loop, the booking loop and
        // both rate pre-passes cannot disagree about whose lane a line is on.
        const isProviderService = isProviderRole(ownerRoleById.get(item.service.userId ?? "") ?? null);
        // Provider-role items: route through source:"provider" + providerId so the
        // early-adopter gate in resolveCommissionRates picks the correct band
        // (beta_flat vs expert_standard) from platform_settings — no literal strings.
        const itemCategoryRates = await resolveCommissionRates(
          isProviderService
            ? { source: "provider", providerId: item.service.userId ?? null }
            : { category: feeCategory, expertId: item.service.userId ?? null } // EXP-OVR.P2
        );
        // ONE precedence, shared by every quote and charge surface (`pickOwnerShareRate`):
        //   rails (ruling 61) → direct D1 band (ruling 69 disposition 6) → the legacy path.
        // Both resolver lanes deliberately outrank the per-service `revenueShareRate` snapshot,
        // which ruling 47 dethroned as a first operand; letting a stale snapshot survive here
        // would defeat an admin band edit exactly as audit C2/Q9 described. A line neither lane
        // can price (expert-owned, or a refusal) is byte-identical to pre-1C.
        const itemRails = railsByItemId.get(item.id);
        const { shareRate: itemExpertShare } = pickOwnerShareRate({
          railsShareRate: itemRails?.rate?.providerShareRate ?? null,
          direct: directRateByItemId.get(item.id) ?? null,
          legacyShareRate: safeParseRate(item.service.revenueShareRate, itemCategoryRates.expertShareRate),
        });
        checkoutSubtotal += itemPrice;
        // FEE-2: insurance is part of the platform take; include it in the Stripe charge total
        const itemInsuranceFee = calcInsuranceFee(itemPrice, itemCategoryRates, feeCategory);
        // Phase 3.4: Booking Concierge facilitation fee — 5 % of booking value (migration 066).
        // conciergeBookingFlatFee is a RATE (0.05 = 5 %), not a dollar amount; multiply by price.
        const isBookingConcierge = item.service.expertOfferingTypeId
          ? offeringTypeKeyMap.get(item.service.expertOfferingTypeId) === "booking_concierge"
          : false;
        checkoutBasePlatformFeeTotal += itemPrice * (1 - itemExpertShare) + itemInsuranceFee;
        if (isBookingConcierge) {
          checkoutConciergeFeeTotal += itemPrice * conciergeBookingFlatFee;
        }
        // B1: the travel surcharge for this line — server-derived from the SAME map the charge loop
        // reads, so quote and charge cannot diverge (§14).
        checkoutSurchargeTotal += surchargeByItemId.get(item.id)?.amount ?? 0;
      }
      const subtotal = checkoutSubtotal;
      const platformFee = checkoutBasePlatformFeeTotal;
      const conciergeFee = checkoutConciergeFeeTotal;
      const surchargeTotal = Math.round(checkoutSurchargeTotal * 100) / 100;
      // The Stripe total (subtotal + base platform fee + concierge facilitation fee) is composed
      // by `authorizeAndPromote` from these three server-derived parts — one place, so the first
      // attempt and the same-key re-drive can never charge different amounts.

      // Create bookings for each cart item
      const bookings = [];
      // Lane 7 (ruling 72): the sum charged NOW. For a non-deposit cart this equals the full total,
      // so the Stripe charge and everything downstream is byte-identical (§13). For a deposit cart
      // it is Σ(per-line deposit) + Σ(full non-deposit line).
      let checkoutAmountDueNow = 0;
      let anyDepositLine = false;
      for (const item of cartData) {
        if (!item.service) continue;

        // §17: nights × nightly rate for a room, else the existing price × quantity (§14).
        const price = resolveItemBaseAmount(item);
        const stay = roomStays.get(item.id);
        // Map service category UUID → booking_fee_configs slug → commission rates
        let feeCategory2 = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        // Canonical vocabulary (shared/roles.ts) — from the SAME pre-pass map the quote loop read.
        const isProviderService2 = isProviderRole(ownerRoleById.get(item.service.userId ?? "") ?? null);
        const itemCategoryRates2 = await resolveCommissionRates(
          isProviderService2
            ? { source: "provider", providerId: item.service.userId ?? null }
            : { category: feeCategory2, expertId: item.service.userId ?? null } // EXP-OVR.P2
        );
        // expertShareRate: fraction expert earns; platform gets (1 - expertShareRate)
        // The SAME precedence and the SAME pre-pass decisions the quote loop above read — rails
        // (ruling 61) then the direct D1 band (ruling 69 disposition 6), both through the single
        // resolver, both outranking the dethroned per-service snapshot.
        const itemRails2 = railsByItemId.get(item.id);
        const itemDirect2 = directRateByItemId.get(item.id) ?? null;
        const { shareRate: expertShareRate, lane: rateLane } = pickOwnerShareRate({
          railsShareRate: itemRails2?.rate?.providerShareRate ?? null,
          direct: itemDirect2,
          legacyShareRate: safeParseRate(item.service.revenueShareRate, itemCategoryRates2.expertShareRate),
        });
        const baseExpertEarningsAmt = price * expertShareRate;
        const basePlatformFeeAmt = price - baseExpertEarningsAmt;
        // Insurance tier (FEE-2 Phase 2): use feeCategory2 slug as bookingType so appliesTo filter works
        const insuranceFeeAmt = calcInsuranceFee(price, itemCategoryRates2, feeCategory2);
        // Phase 3.4: Booking Concierge facilitation fee — 5 % of booking value (migration 066).
        // conciergeBookingFlatFee is a RATE (fraction), so multiply by item price.
        const isBookingConcierge2 = item.service.expertOfferingTypeId
          ? offeringTypeKeyMap.get(item.service.expertOfferingTypeId) === "booking_concierge"
          : false;
        const conciergeFeaAmt = isBookingConcierge2 ? price * conciergeBookingFlatFee : 0;
        const totalPlatformFeeAmt = basePlatformFeeAmt + insuranceFeeAmt + conciergeFeaAmt;
        // ── B1 (ruling 81): the travel surcharge for THIS line, server-derived (§14) from the SAME
        // map the quote loop read. The surcharge is a pure provider pass-through — it is NOT the
        // service price and NOT a platform fee, so the platform takes NO commission on it: the
        // provider keeps 100%. It is FOLDED INTO the row's total_amount (so §17 reconciliation's
        // SUM(total_amount + platform_fee) and the §15 re-drive — which recompute from the claimed
        // rows — both stay correct with NO change to those systems) and ADDED to the provider's net
        // earnings. `platform_fee` is computed on the base `price` only, untouched by the surcharge.
        const surchargeResult = surchargeByItemId.get(item.id);
        const surchargeAmt = surchargeResult?.amount ?? 0;
        const rowTotalAmount = price + surchargeAmt;
        const netExpertEarningsAmt = baseExpertEarningsAmt - insuranceFeeAmt + surchargeAmt;

        // ── Lane 7 (ruling 72): deposit split for THIS line, server-derived (§14) ──────────────
        // The line's full charge = price + travel surcharge + all platform fees. `resolveDepositPlan`
        // reads the listing's OWN deposit config (provider opt-in) — no client value reaches it — and
        // returns null when this listing takes no deposit, in which case the full line is charged now
        // and the deposit/balance columns stay NULL (byte-identical to pre-deposit, §13).
        const lineFullCharge = price + surchargeAmt + totalPlatformFeeAmt;
        const depositPlan = resolveDepositPlan(
          {
            depositEnabled: (item.service as any).depositEnabled,
            depositType: (item.service as any).depositType,
            depositPercentage: (item.service as any).depositPercentage,
            depositFlatAmount: (item.service as any).depositFlatAmount,
          },
          lineFullCharge,
        );
        let lineBalanceDueAt: Date | null = null;
        if (depositPlan) {
          anyDepositLine = true;
          checkoutAmountDueNow += depositPlan.depositAmount;
          // Cutoff derived from EXISTING listing/booking facts only (§13): the service date (room
          // check-in, else the cart line's scheduled date) minus the change window.
          const serviceDateStr = stay?.checkIn
            ?? (typeof item.scheduledDate === "string"
              ? item.scheduledDate.slice(0, 10)
              : item.scheduledDate instanceof Date
                ? item.scheduledDate.toISOString().slice(0, 10)
                : null);
          lineBalanceDueAt = resolveBalanceDueAt({
            serviceDate: serviceDateStr,
            changeCutoffHours: (item.service as any).changeCutoffHours,
            leadTimeHours: (item.service as any).leadTimeHours,
          });
        } else {
          checkoutAmountDueNow += lineFullCharge;
        }

        // Create contract for this booking
        // Migration 157: stamp both principals. Both were already in scope here — the contract
        // row simply never recorded them, which is what left the two contract readers ungatable.
        // Same values the booking row below gets, so the two stay consistent by construction.
        const contract = await storage.createContract({
          title: `Booking: ${item.service.serviceName}`,
          tripTo: item.service.location || "N/A",
          description: `Service booking for ${item.service.serviceName}. ${notes || ""}`,
          amount: price.toFixed(2),
          travelerId: userId,
          earnerId: item.service.userId ?? null,
        });
        
        // ── Step A: Create booking as payment_pending BEFORE charging Stripe ──
        // If the server crashes after the Stripe charge but before this line,
        // the PaymentIntent webhook will recover it via stripe_payment_intent_id.
        //
        // §15 ATOMIC CLAIM + per-row key uniqueness. `service_bookings.idempotency_key`
        // carries a UNIQUE partial index (migration 096, re-asserted by 155), so:
        //  (a) the FIRST item's insert — which carries the BARE request key — IS the atomic
        //      claim for this whole checkout. Two concurrent same-key requests both pass the
        //      SELECT fast-path above, but only one can land this row; the loser gets a 23505
        //      and is handled as a duplicate BELOW, before any Stripe call. So a double-click
        //      can never produce two booking sets or two charges.
        //  (b) every SUBSEQUENT item is suffixed `#<n>`. This was a live P0: the bare key was
        //      stamped on EVERY row of a multi-item cart, so item 2 collided with item 1 on
        //      that same unique index and the whole checkout 500'd (leaving item 1 as an
        //      orphan payment_pending booking + leaked slot claims). Suffixing keeps each row
        //      unique while the bare key on item 1 keeps the equality dedup above working.
        const isClaimRow = bookings.length === 0;
        const rowIdempotencyKey = isClaimRow
          ? checkoutKey
          : `${checkoutKey}#${bookings.length}`;
        let booking: any;
        try {
          booking = await storage.createServiceBooking({
            serviceId: item.serviceId,
            travelerId: userId,
            providerId: item.service.userId,
            contractId: contract.id,
            tripId: tripId || item.tripId,
            bookingDetails: {
              scheduledDate: item.scheduledDate,
              notes: item.notes || notes,
              quantity: item.quantity || 1,
              // Lane S ruling 18 (reconciliation key): the plan item this booking intends to flip
              // to `purchased`. If the flip+log pair below ever rolls back, the
              // `bookings-have-purchased-items` invariant joins on this to find the booking whose
              // item was never flipped — making the swallowed failure detectable, not just logged.
              ...((item as any).itineraryItemId
                ? { itineraryItemId: (item as any).itineraryItemId }
                : {}),
              // §17: component snapshot verified above — bundle contents locked at purchase.
              ...(bundleSnapshots.has(item.serviceId)
                ? { bundleComponents: bundleSnapshots.get(item.serviceId) }
                : {}),
              // D6 (ruling 61): the rails decision, SNAPSHOT onto the row it priced — including
              // every REFUSAL with its reason, so "this ref bought nothing and here is why" is a DB
              // fact per booking and not only a log line (the ruling-66 precedent for a record that
              // must survive on a tripless booking). Server-derived in full; no client value reaches
              // it. The fee-ledger row is written from this snapshot at the authorization stamp, so
              // an admin re-pricing a band mid-checkout cannot rewrite what was charged.
              ...(itemRails2 ? { railsAttribution: railsSnapshot(itemRails2) } : {}),
              // 1C (ruling 69 disposition 6): the DIRECT-lane decision, on the same snapshot
              // posture and for the same reason — a line that fell back to the legacy lane must
              // SAY so on the row, or a later reader would infer a D1 charge that never happened
              // (§13). Present only for lines the direct pre-pass considered (a rails-priced line
              // records its provenance in `railsAttribution` instead).
              ...(itemDirect2 ? { directRateResolution: directRateSnapshot(itemDirect2, rateLane) } : {}),
              // §17 property rooms: the night range + rate SNAPSHOT into the booking (locked at
              // purchase — the same ready-made snapshot posture as bundle contents above).
              ...(stay
                ? {
                    propertyId: stay.propertyId,
                    propertyName: stay.propertyName,
                    roomName: stay.roomName,
                    checkIn: stay.checkIn,
                    checkOut: stay.checkOut,
                    nights: stay.nights,
                    nightlyRate: stay.nightlyRate,
                  }
                : {}),
              // B1 (ruling 81): SNAPSHOT the travel surcharge and the pickup that triggered it onto
              // the row (locked at purchase — the same snapshot posture as the rails/deposit facts).
              // Present ONLY when a surcharge actually applied, so a non-surcharge booking is
              // byte-identical (§13). `travelSurcharge` is the amount already folded into total_amount
              // above; the row therefore SELF-DOCUMENTS how much of its total_amount is travel, and
              // the confirmed pickup is preserved for the provider (who must go there).
              ...(surchargeAmt > 0
                ? {
                    travelSurcharge: surchargeAmt.toFixed(2),
                    travelSurchargeMode: surchargeResult?.mode ?? null,
                    travelSurchargeBasis: surchargeResult?.basis ?? null,
                    pickupLocation: item.pickupLocation ?? null,
                  }
                : {}),
            },
            totalAmount: rowTotalAmount.toFixed(2),
            platformFee: totalPlatformFeeAmt.toFixed(2),
            insuranceFee: insuranceFeeAmt.toFixed(2),
            providerEarnings: netExpertEarningsAmt.toFixed(2),
            // Lane 7 (ruling 72): a deposit line is BORN with its split recorded (server-derived).
            // `deposit_paid`/`balance_paid` stay false until each payment promotes. The PROMOTION —
            // not the claim — lands the row in status='deposit_paid' once the deposit PI succeeds
            // (promoteOneBooking is deposit-aware); the claim itself is an ordinary payment_pending
            // row so the §15 spine (sweep/authorize/promote) is unchanged.
            ...(depositPlan
              ? {
                  depositAmount: depositPlan.depositAmount.toFixed(2),
                  balanceAmount: depositPlan.balanceAmount.toFixed(2),
                  ...(lineBalanceDueAt ? { balanceDueAt: lineBalanceDueAt } : {}),
                }
              : {}),
            status: "payment_pending",
            // S4: first real writer of the attribution columns (source existed unwritten).
            source: acquisitionSource,
            ...(acquisitionRef ? { acquisitionRef } : {}),
            // C3: stamped only because the atomic bookSlot claim above already succeeded for
            // this item — the booking row records WHICH slot's capacity it holds. A room stamps
            // its FIRST night's slot id (the stay claimed all of them; one representative id).
            ...(stay?.firstNightSlotId
              ? { slotId: stay.firstNightSlotId }
              : (item as any).slotId
                ? { slotId: (item as any).slotId }
                : {}),
            idempotencyKey: rowIdempotencyKey,
          } as any);
        } catch (insertErr: any) {
          // Lost the atomic claim (a concurrent request with the same key already inserted
          // the claim row). NO booking row of THIS request exists yet — bookings.length is 0 —
          // so the slot capacity claimed above is ours alone to give back, and nothing has been
          // charged. Return the same shape as the SELECT fast-path.
          if (isClaimRow && isUniqueViolation(insertErr)) {
            await releaseClaimed(claimedSlotIds);
            console.info(`[checkout] lost idempotency claim race, idempotencyKey=${checkoutKey} — returning duplicate`);
            return res.status(200).json({
              success: true,
              duplicate: true,
              note: "Booking already exists for this request",
            });
          }
          // Any other failure (or a failure after item 1 already has a booking row) bubbles to
          // the handler's 500. Slots are deliberately NOT released here: a booking row already
          // holds them, so releasing would desynchronise capacity from a live booking.
          throw insertErr;
        }

        // ── STEP 1 ends here: the CLAIM is PROVISIONAL ────────────────────────────────────
        // Ruling 38: everything irreversible that used to run inside this loop — the
        // `ready_for_checkout → purchased` flip + its diary row, the bookings counter, the
        // provider notification and its EMAIL — has moved to `promoteAuthorizedCheckout`, which
        // runs only AFTER a PaymentIntent exists. Those writes are not undoable (an email least
        // of all), so committing them ahead of the one operation that can fail was the defect.
        // What stays here is exactly the atomic claim §15 requires to precede the external call.
        bookings.push({ booking, contract });
      }

      // ── STEPS 2+3: AUTHORIZE, then PROMOTE ────────────────────────────────────────────────
      // The cart is deliberately still intact at this point and stays intact unless Stripe
      // answers. Same helper the re-drive path above uses — one implementation, so the two can
      // never diverge on what "authorized" means.
      return await authorizeAndPromote(res, {
        userId,
        checkoutKey,
        bookings,
        subtotal,
        platformFee,
        conciergeFee,
        // B1 (ruling 81): the travel-surcharge sum, added to the full total and disclosed as its own
        // line. On a re-drive this is NOT passed — each claimed row already carries the surcharge in
        // its total_amount, so the re-drive's subtotal (Σ total_amount) covers it (see the arg doc).
        surchargeTotal,
        // Lane 7: charge the deposit sum now when any line takes a deposit; else undefined ⇒ the
        // full total is charged, unchanged (§13).
        ...(anyDepositLine ? { chargeAmount: Math.round(checkoutAmountDueNow * 100) / 100 } : {}),
        useSavedCard: req.body?.useSavedCard === true,
      });
    } catch (err: any) {
      console.error("Checkout error:", err);
      // Surface known configuration errors with a clear message so ops can act immediately
      // (e.g. "Booking Concierge fee band not configured" from requireConciergeBookingRate)
      if (err?.message?.includes("fee band not configured") || err?.message?.includes("not configured")) {
        return res.status(500).json({ message: err.message });
      }
      res.status(500).json({ message: "Checkout failed" });
    }
  });

  // ══ LANE 7 — BALANCE CHECKOUT (deposits / partial payments, DECISIONS.md ruling 72) ═══════════
  // The SECOND, separate checkout that settles the outstanding balance of a deposit-paid booking.
  // Its own authorized PaymentIntent on the SAME booking row (carried on stripe_balance_intent_id),
  // its own atomic promotion deposit_paid → confirmed (promoteBalancePayment). Owner-gated to the
  // TRAVELER who owns the booking. Idempotent: the Stripe idempotency key is deterministic per
  // booking so a retry/double-click returns the SAME PaymentIntent and the SAME single charge (§15),
  // and the balance-authorization stamp is an atomic conditional so only one caller stamps.
  //
  // §14/§18 — the amount is SERVER-DERIVED from the booking row (`balance_amount`); the acting user
  // is the session; NOTHING is read from req.body. There is no `money-derive-ok` here because there
  // is no client-trusted read to exempt.
  router.post("/api/bookings/:id/pay-balance", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const bookingId = req.params.id;
      const booking = await storage.getServiceBooking(bookingId);
      // Ownership gate: the TRAVELER owns this booking. Undifferentiated 404 (§13 posture).
      if (!booking || booking.travelerId !== userId) {
        return res.status(404).json({ message: "Booking not found or not yours" });
      }
      // Only a deposit-paid booking with an outstanding balance is payable here. A payment_pending
      // claim (§15b) and a fully-paid `confirmed` booking are both refused, by construction.
      if (booking.status !== "deposit_paid" || (booking as any).balancePaid === true) {
        return res.status(409).json({
          error: "balance_not_payable",
          message: "This booking has no outstanding balance to pay.",
        });
      }
      // SERVER-DERIVED (§14) — the balance comes from the booking row, never from the request body.
      const balanceDue = parseFloat(String((booking as any).balanceAmount ?? "0"));
      if (!Number.isFinite(balanceDue) || balanceDue <= 0) {
        return res.status(409).json({
          error: "balance_not_payable",
          message: "This booking has no outstanding balance to pay.",
        });
      }

      const { stripePaymentService } = await import("../services/stripe-payment.service");

      // Already-authorized balance: a prior call stamped the balance PI — return the SAME
      // clientSecret, never a second PaymentIntent (idempotent).
      if ((booking as any).stripeBalanceIntentId) {
        const existingPi = await stripePaymentService
          .getPaymentIntentClientSecret((booking as any).stripeBalanceIntentId)
          .catch(() => null);
        return res.status(200).json({
          success: true,
          duplicate: true,
          bookingId,
          balanceAmount: balanceDue.toFixed(2),
          ...(existingPi ? { paymentIntent: existingPi } : {}),
          note: "Balance payment already started — completing the existing payment.",
        });
      }

      // Deterministic idempotency key per booking: Stripe returns the SAME PaymentIntent for a
      // retry/double-click, so the external call cannot double-charge (§15 layer a).
      const balanceKey = `bal-${bookingId}`;
      let paymentIntent: any;
      try {
        paymentIntent = await stripePaymentService.createPaymentIntent(
          userId,
          [{ id: bookingId }],
          balanceDue,
          false,
          "usd",
          balanceKey,
          { isBalance: true, offSession: req.body?.useSavedCard === true },
        );
      } catch (stripeErr: any) {
        console.error(`[balance] authorization failed for booking=${bookingId}:`, stripeErr?.message ?? stripeErr);
        return res.status(503).json({
          success: false,
          error: "payment_unavailable",
          message:
            "We couldn't reach our payment provider, so nothing was charged. Please try again.",
          retryable: true,
        });
      }
      if (!paymentIntent?.paymentIntentId) {
        return res.status(503).json({ success: false, error: "payment_unavailable", retryable: true });
      }

      // AUTHORIZE stamp — atomic conditional on the balance column (§15). Loses the race (another
      // concurrent call stamped first) ⇒ return that call's clientSecret, never a second charge.
      const stamped = await stampBalanceAuthorization(bookingId, paymentIntent.paymentIntentId);
      if (!stamped) {
        const refreshed = await storage.getServiceBooking(bookingId);
        const existingPi = (refreshed as any)?.stripeBalanceIntentId
          ? await stripePaymentService.getPaymentIntentClientSecret((refreshed as any).stripeBalanceIntentId).catch(() => null)
          : null;
        return res.status(200).json({
          success: true,
          duplicate: true,
          bookingId,
          ...(existingPi ? { paymentIntent: existingPi } : {}),
          note: "Balance payment already started — completing the existing payment.",
        });
      }

      // Inline promotion when the PaymentIntent already SUCCEEDED (saved-card / off-session). The
      // interactive path relies on the webhook (isBalance → promoteBalancePayment). Both drive the
      // SAME atomic conditional, so a double signal is exactly one flip (§15).
      let confirmed = false;
      if (paymentIntent?.status === "succeeded") {
        const promo = await promoteBalancePayment({
          bookingId,
          paymentIntentId: paymentIntent.paymentIntentId,
          actor: "checkout",
          actorId: userId,
        });
        confirmed = promo.promoted || promo.alreadyConfirmed;
      }

      return res.status(201).json({
        success: true,
        bookingId,
        balanceAmount: balanceDue.toFixed(2),
        paymentIntent,
        status: paymentIntent?.status,
        confirmed,
        message:
          paymentIntent?.status === "succeeded"
            ? "Balance paid. Your booking is fully confirmed."
            : "Balance checkout started. Complete payment.",
      });
    } catch (err: any) {
      console.error("Pay-balance error:", err);
      res.status(500).json({ message: "Balance checkout failed" });
    }
  });

  // Read-only fee preview: mirrors checkout per-item resolution without creating bookings.
  // Returns { subtotal, platformFeeTotal, total, itemCount } for the current user's cart.

router.get("/api/cart/fee-preview", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const cartData = await storage.getCartItems(userId);

      if (cartData.length === 0) {
        return res.json({ subtotal: 0, platformFeeTotal: 0, conciergeFeeTotal: 0, total: 0, itemCount: 0 });
      }

      const safeParseRate = (value: any, fallback: number): number => {
        const n = parseFloat(value);
        return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
      };

      // Preload category slugs once to avoid N+1 queries.
      const distinctCatIds = Array.from(new Set(
        cartData.filter(i => i.service?.categoryId).map(i => i.service!.categoryId as string)
      ));
      const catSlugMap = new Map<string, string>();
      if (distinctCatIds.length > 0) {
        const catRows = await storage.getServiceCategorySlugsByIds(distinctCatIds);
        for (const row of catRows) {
          catSlugMap.set(row.id, serviceCategorySlugToFeeCategory(row.slug));
        }
      }

      // Preload offering type keys to detect booking_concierge items (mirrors checkout logic).
      const distinctPreviewOfferingTypeIds = Array.from(new Set(
        cartData.filter(i => i.service?.expertOfferingTypeId).map(i => i.service!.expertOfferingTypeId as string)
      ));
      const previewOfferingTypeKeyMap = new Map<string, string>();
      if (distinctPreviewOfferingTypeIds.length > 0) {
        const typeRows = await storage.getExpertOfferingTypeKeysByIds(distinctPreviewOfferingTypeIds);
        for (const row of typeRows) {
          previewOfferingTypeKeyMap.set(row.id, row.key);
        }
      }

      // Load the concierge rate once. Task 1108: if the cart actually CONTAINS a
      // booking_concierge item, use the SAME strict loader checkout uses — a misconfigured
      // band must surface here as a machine-readable 503, not as a misleading $0 fee that
      // 500s later at POST /api/checkout. Carts without concierge items keep the lenient
      // loader (a zero rate is never applied to them anyway).
      const previewHasConciergeItem = cartData.some(i =>
        i.service?.expertOfferingTypeId
          ? previewOfferingTypeKeyMap.get(i.service.expertOfferingTypeId) === "booking_concierge"
          : false,
      );
      let previewConciergeRate: number;
      if (previewHasConciergeItem) {
        try {
          previewConciergeRate = await requireConciergeBookingRate();
        } catch (bandErr: any) {
          // Same misconfiguration checkout would 500 on — surface it BEFORE the traveler
          // hits "Pay", with a code the cart UI can act on.
          console.error("Fee preview: concierge band misconfigured:", bandErr?.message ?? bandErr);
          return res.status(503).json({
            error: "concierge_fee_unconfigured",
            message:
              "The Booking Concierge fee isn't configured right now, so we can't show an accurate total. " +
              "Please try again shortly or contact support — checkout is paused for concierge items until this is fixed.",
            retryable: true,
          });
        }
      } else {
        previewConciergeRate = await getConciergeBookingRate();
      }

      let previewSubtotal = 0;
      let previewPlatformFeeTotal = 0;
      let previewConciergeFeeTotal = 0;
      let previewSurchargeTotal = 0;
      // B1 (ruling 81): the SAME server-derived surcharge the checkout will charge, so the traveler
      // sees the travel line in the cart BEFORE Pay — the F1 disclosure posture. Pure preview: an
      // out-of-range pickup is NOT refused here (that is the checkout's 400), it simply shows 0.
      const previewSurcharges = await resolveCartSurcharges(cartData);

      for (const item of cartData) {
        if (!item.service) continue;
        // §17: nights × nightly rate for a room, else the existing price × quantity (§14).
        const itemPrice = resolveItemBaseAmount(item);
        let feeCategory = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        let ownerRolePreview: string | null = null;
        if (item.service.userId) {
          const [providerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, item.service.userId))
            .limit(1);
          ownerRolePreview = providerRow?.role ?? null;
        }
        // Canonical vocabulary (shared/roles.ts) — mirrors the checkout loops.
        const isProviderServicePreview = isProviderRole(ownerRolePreview);
        const itemRates = await resolveCommissionRates(
          isProviderServicePreview
            ? { source: "provider", providerId: item.service.userId ?? null }
            : { category: feeCategory, expertId: item.service.userId ?? null }
        );
        // 1C (ruling 69 disposition 6): the PREVIEW must price a direct provider line the same way
        // the charge does, through the SAME `pickOwnerShareRate` precedence — a preview that keeps
        // the pre-1C lane would quote a number the checkout no longer charges. Rails is absent here
        // by construction: this surface has no ref, so it quotes the un-attributed (full) lane, as
        // it always has.
        const { shareRate: itemExpertShare } = pickOwnerShareRate({
          railsShareRate: null,
          direct: await resolveDirectProviderRate({
            serviceOwnerUserId: item.service.userId ?? null,
            ownerRole: ownerRolePreview,
            categoryId: item.service.categoryId ?? null,
            serviceId: item.service.id ?? item.serviceId,
          }),
          legacyShareRate: safeParseRate(item.service.revenueShareRate, itemRates.expertShareRate),
        });
        previewSubtotal += itemPrice;
        const itemInsuranceFee = calcInsuranceFee(itemPrice, itemRates, feeCategory);
        previewPlatformFeeTotal += itemPrice * (1 - itemExpertShare) + itemInsuranceFee;
        // Concierge facilitation fee: charged ON TOP of the normal split (mirrors checkout).
        const isBookingConciergePreview = item.service.expertOfferingTypeId
          ? previewOfferingTypeKeyMap.get(item.service.expertOfferingTypeId) === "booking_concierge"
          : false;
        if (isBookingConciergePreview) {
          previewConciergeFeeTotal += itemPrice * previewConciergeRate;
        }
        // B1: only an ELIGIBLE surcharge is previewed as a charge (an out-of-range pickup shows 0
        // here; the checkout is where it becomes a hard 400).
        const psc = previewSurcharges.get(item.id);
        if (psc?.eligible) previewSurchargeTotal += psc.amount;
      }

      const previewSurcharge = Math.round(previewSurchargeTotal * 100) / 100;
      res.json({
        subtotal: Math.round(previewSubtotal * 100) / 100,
        platformFeeTotal: Math.round(previewPlatformFeeTotal * 100) / 100,
        conciergeFeeTotal: Math.round(previewConciergeFeeTotal * 100) / 100,
        travelSurcharge: previewSurcharge,
        total: Math.round((previewSubtotal + previewPlatformFeeTotal + previewConciergeFeeTotal + previewSurcharge) * 100) / 100,
        itemCount: cartData.filter(i => i.service).length,
      });
    } catch (err) {
      console.error("Fee preview error:", err);
      res.status(500).json({ message: "Fee preview failed" });
    }
  });

  // Get contract details

router.get("/api/invoices/my", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const invoices = await storage.getInvoicesByCustomer(getUserId(req)!);
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoices", error: error.message });
    }
  });

  // =============================================
  // AI Usage & Cost Tracking Endpoints (Admin)
  // =============================================

  // Get AI usage summary with cost breakdown

router.post("/api/stripe/connect/onboard", isAuthenticated, async (req, res) => {
    try {
      // Honest degrade (§13): without a live Stripe key every call below throws a raw
      // Stripe SDK auth error, which the catch below would otherwise surface as a
      // generic 500. Never fake a connected/ready status — tell the earner plainly.
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: "stripe_unavailable", message: "Payouts onboarding is not yet available. Please check back soon." });
      }
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      // Full earner set (shared/roles.ts): the previous ['expert','service_provider'] pair
      // locked local_expert / travel_expert / event_planner out of payout onboarding entirely.
      if (!isEarnerRole(user.role)) {
        return res.status(403).json({ error: "Only experts and providers can onboard for payouts" });
      }

      const existing = await storage.getUserStripeAccount(userId);
      if (existing.stripeAccountId && existing.stripeAccountStatus === 'active') {
        return res.status(400).json({ error: "Stripe account already active" });
      }

      const { stripeConnectService } = await import('../services/stripe-connect.service');
      let accountId = existing.stripeAccountId;
      if (!accountId) {
        const result = await stripeConnectService.createConnectedAccount(
          // Connect account type follows the role FAMILY (any expert-family role → 'expert'),
          // not the bare string — local_expert/travel_expert/event_planner are experts here.
          userId, user.email!, isExpertRole(user.role) ? 'expert' : 'provider', (user as any).name || undefined
        );
        accountId = result.accountId;
        await storage.updateUserStripeAccount(userId, accountId!, 'onboarding_incomplete');
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const link = await stripeConnectService.createOnboardingLink(
        accountId!,
        `${baseUrl}/stripe/connect/return`,
        `${baseUrl}/stripe/connect/refresh`
      );
      res.json({ url: link.url, accountId });
    } catch (error: any) {
      console.error('Stripe Connect onboard error:', error);
      res.status(500).json({ message: "Failed to start Stripe onboarding", error: error.message });
    }
  });


router.get("/api/stripe/connect/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const account = await storage.getUserStripeAccount(userId);
      if (!account.stripeAccountId) {
        return res.json({ connected: false, status: 'not_connected' });
      }
      // Honest degrade (§13): an account was previously connected but the key is now
      // absent (e.g. this environment) — report the last-known DB status rather than
      // calling Stripe and surfacing a raw SDK error, or worse, faking "active".
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.json({ connected: true, accountId: account.stripeAccountId, status: account.stripeAccountStatus ?? 'unknown', degraded: true });
      }

      const { stripeConnectService } = await import('../services/stripe-connect.service');
      const status = await stripeConnectService.getAccountStatus(account.stripeAccountId);

      if (status.status !== account.stripeAccountStatus) {
        await storage.updateUserStripeAccount(userId, account.stripeAccountId, status.status);
      }

      res.json({
        connected: true,
        accountId: account.stripeAccountId,
        ...status,
      });
    } catch (error: any) {
      console.error('Stripe Connect status error:', error);
      res.status(500).json({ message: "Failed to check Stripe status", error: error.message });
    }
  });


router.get("/api/stripe/connect/dashboard", isAuthenticated, async (req, res) => {
    try {
      // Honest degrade (§13): same reasoning as onboard/status above.
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: "stripe_unavailable", message: "Payouts onboarding is not yet available. Please check back soon." });
      }
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const account = await storage.getUserStripeAccount(userId);
      if (!account.stripeAccountId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }

      const { stripeConnectService } = await import('../services/stripe-connect.service');
      const link = await stripeConnectService.createLoginLink(account.stripeAccountId);
      res.json({ url: link.url });
    } catch (error: any) {
      console.error('Stripe dashboard link error:', error);
      res.status(500).json({ message: "Failed to create dashboard link", error: error.message });
    }
  });


router.get("/stripe/connect/return", (req, res) => {
    // Email-auth sessions store role at req.user.claims.role; Replit-auth at req.user.role.
    const role = (req.user as any)?.role ?? (req.user as any)?.claims?.role;
    if (isProviderRole(role)) return res.redirect("/provider/settings?stripe=connected");
    if (isExpertRole(role)) return res.redirect("/expert/settings?stripe=connected");
    res.redirect("/dashboard?stripe=connected");
  });


router.get("/stripe/connect/refresh", (req, res) => {
    // Email-auth sessions store role at req.user.claims.role; Replit-auth at req.user.role.
    const role = (req.user as any)?.role ?? (req.user as any)?.claims?.role;
    if (isProviderRole(role)) return res.redirect("/provider/settings?stripe=refresh");
    if (isExpertRole(role)) return res.redirect("/expert/settings?stripe=refresh");
    res.redirect("/dashboard?stripe=refresh");
  });

  // === Admin Payouts Management ===


router.get("/api/booking-fee-config", async (req, res) => {
    try {
      const category = (req.query.category as string) || "default";
      // Forward the SAME context the checkout charge resolves with (category +
      // per-expert override id + early-adopter/provider id) — not a generic default —
      // so display == charge for the SAME booking context, not merely same-source.
      // The charge loop above calls resolveCommissionRates({ category: feeCategory,
      // expertId: service.userId }); this mirrors those inputs.
      const expertId = (req.query.expertId as string) || null;
      const providerId = (req.query.providerId as string) || null;
      // Canonical source: fee_bands via the commission resolver. Previously read
      // booking_fee_configs directly, which diverged from the charge once Phase 1.3
      // made fee_bands canonical (12% fallback on prod, where the table was absent).
      // feeConfigFromRates is the single shared mapper, so source + conversion can't
      // drift. Insurance still loads from booking_fee_configs inside the resolver.
      const rates = await resolveCommissionRates({ category, expertId, providerId });
      res.json(feeConfigFromRates(rates));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Phase 1.4: GET /api/fee-bands/:bandKey (public; read-only) ──────────────
  // Returns the live default_rate for a fee_bands row. Used by client-side
  // pricing surfaces (optimize.tsx, etc.) so admin edits propagate without redeploy.
  // Percent bands return rate as a fraction (0.25 = 25 %); flat bands return rate
  // as USD dollars (49.99 = $49.99). The rateType field disambiguates. // fee-literal-ok: comment example, fee resolves from config
router.get("/api/fee-bands/:bandKey", async (req, res) => {
    try {
      const bandKey = String(req.params.bandKey || "").trim();
      if (!bandKey || bandKey.length > 100) {
        return res.status(400).json({ error: "Invalid bandKey" });
      }
      const band = await storage.getFeeBandByKey(bandKey);
      if (band) {
        // Cache for 60 s — same TTL as the server-side resolver cache.
        res.setHeader("Cache-Control", "public, max-age=60");
        return res.json(band);
      }
      return res.status(404).json({ error: "Band not found", bandKey });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Self-service payout request (provider/expert) ───────────────────────────
  // The payout MODEL OF RECORD stays admin-initiated processing (Payout rail note). This
  // only lets an earner REQUEST a payout of their own cleared balance; the request lands as
  // a `pending` payout in the admin queue, which an admin processes via the already-audited,
  // idempotency-safe Stripe transfer (PATCH /api/admin/payouts/:id, §15 FIX 1). No new
  // payout mechanics. Buildable now that the escrow spine defines a real "available" balance
  // (releasable earnings) — the reason self-service was deferred is resolved.
  // Minimum floor mirrors the admin path threshold — single-sourced (MONEY_MAP F-7).

  router.post("/api/payouts/request", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Not authenticated" });

      const isProvider = isProviderRole(user.role);
      const isExpert = isExpertRole(user.role);
      if (!isProvider && !isExpert) {
        return res.status(403).json({ error: "Only providers and experts can request payouts" });
      }

      // §13: the admin processing step (PATCH /api/admin/payouts/:id) already refuses to
      // transfer to a recipient without an active Stripe Connect account — but only AFTER
      // the earner has already been told "Payout requested" and the request sits in the
      // admin queue with no way back to explain why it stalled. Surface the same honest,
      // actionable block up front so a not-ready earner learns why immediately instead of
      // a request that can never be fulfilled. §14: read is session-scoped (own account).
      const payoutAccount = await storage.getUserStripeAccount(userId);
      if (!payoutAccount.stripeAccountId || !payoutAccount.canReceivePayments) {
        return res.status(400).json({
          error: "stripe_not_connected",
          message: "Connect your Stripe account before requesting a payout. Finish setup in Settings to get started.",
        });
      }

      // §15: one open request at a time — a pending/processing payout blocks a duplicate.
      const existing = isProvider
        ? await storage.getProviderPayouts(userId)
        : await storage.getExpertPayouts(userId);
      const open = existing.find((p: any) => p.status === "pending" || p.status === "processing");
      if (open) {
        return res.status(409).json({
          error: "payout_request_pending",
          message: "You already have a payout request awaiting review.",
          payout: open,
        });
      }

      // §14: amount is SERVER-DERIVED from the earner's releasable balance, never from the
      // body (a self-service withdrawal of the user's OWN cleared balance — money-derive-ok).
      const summary = isProvider
        ? await storage.getProviderEarningsSummary(userId)
        : await storage.getExpertEarningsSummary(userId);
      const amountCents = Math.round((summary.available ?? 0) * 100); // money-derive-ok: own cleared balance
      if (amountCents <= 0) {
        return res.status(400).json({ error: "no_balance", message: "You have no available balance to withdraw." });
      }
      // Ledger 90 (FP-5, S2): the threshold is max(platform floor, this earner's own configured
      // minimum). The floor is never lowered; a stricter preference is respected. §14: the
      // preference is READ SERVER-SIDE from the earner's own settings row — it is never taken from
      // req.body, and it can only ever RAISE the bar on the caller's own withdrawal, never lower a
      // floor or move an amount. Experts have no settings row today, so they get the bare floor.
      const settingsRow = isProvider
        ? await storage.getProviderSettings(userId) // money-derive-ok: own settings row, session-scoped
        : null;
      const minimumCents = effectivePayoutMinimumCents(settingsRow?.minimumPayoutAmount);
      if (amountCents < minimumCents) {
        const isOwnPreference = minimumCents > MIN_PAYOUT_CENTS;
        return res.status(400).json({
          error: "below_minimum",
          minimumCents,
          platformFloorCents: MIN_PAYOUT_CENTS,
          source: isOwnPreference ? "provider_setting" : "platform_floor",
          message: isOwnPreference
            ? `Your payout minimum is set to $${(minimumCents / 100).toFixed(2)} in Settings (the platform floor is $${MIN_PAYOUT_DOLLARS.toFixed(2)}). Your available balance is $${(amountCents / 100).toFixed(2)}.`
            : `The minimum payout is $${(minimumCents / 100).toFixed(2)}. Your available balance is $${(amountCents / 100).toFixed(2)}.`,
        });
      }

      const amount = (amountCents / 100).toFixed(2);
      // requestedAt is DB-defaulted (defaultNow) — not in the insert type, so it's omitted here.
      const payout = isProvider
        ? await storage.createProviderPayout({ providerId: userId, amount, status: "pending", notes: "Requested by provider" })
        : await storage.createExpertPayout({ expertId: userId, amount, status: "pending", metadata: { source: "self_request" } });

      res.status(201).json({ ...payout, requesterType: isProvider ? "provider" : "expert" });
    } catch (error: any) {
      console.error("Error creating payout request:", error);
      res.status(500).json({ error: "Failed to submit payout request" });
    }
  });

  // ─── Payout history (task #142) ───────────────────────────────────────────────
  // §14: earner + role are derived from the session, never from a query/body param — this returns
  // ONLY the caller's own payouts (role-aware provider/expert), reusing the existing storage reads
  // that already back the admin queue. No admin data leakage — there is no id/userId input at all.
  router.get("/api/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ error: "Not authenticated" });

      const isProvider = isProviderRole(user.role);
      const isExpert = isExpertRole(user.role);
      if (!isProvider && !isExpert) {
        return res.status(403).json({ error: "Only providers and experts have payout history" });
      }

      const payouts = isProvider
        ? await storage.getProviderPayouts(userId)
        : await storage.getExpertPayouts(userId);

      res.json(payouts.map((p: any) => ({ ...p, requesterType: isProvider ? "provider" : "expert" })));
    } catch (error: any) {
      console.error("Error fetching payout history:", error);
      res.status(500).json({ error: "Failed to fetch payout history" });
    }
  });

  // ─── Smart Lead Routing ──────────────────────────────────────────────────────
  // POST /api/leads/route  — score experts and auto-assign

export default router;
