import { verifyTripOwnership } from '../utils/trip-ownership';
import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { isExpertRole, isProviderRole, isEarnerRole } from "@shared/roles";
import { eq, and, or, like, ilike, sql, desc, count, ne, isNotNull, asc } from "drizzle-orm";
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
  EXPERT_SHARE_RATE,
  PLATFORM_FEE_RATE,
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

router.post("/api/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
      const { tripId, notes, idempotencyKey } = req.body;

      // ── Idempotency guard (DB level) ────────────────────────────────────────
      // §15: the key is now REQUIRED. Previously the dedup only ran `if (idempotencyKey)`,
      // so a client that omitted it bypassed dedup entirely — a retry/double-click could
      // create duplicate bookings + Stripe charges. The real client always sends a UUID
      // (cart.tsx), so requiring it only blocks the replay-bypass path.
      if (!idempotencyKey || typeof idempotencyKey !== "string") {
        return res.status(400).json({
          success: false,
          error: "idempotencyKey is required",
        });
      }
      // If this exact checkout request was already processed, return the original
      // result without creating duplicate bookings or Stripe charges.
      {
        const existing = await db.execute(sql`
          SELECT id FROM service_bookings
          WHERE idempotency_key = ${idempotencyKey}
          LIMIT 1
        `);
        if (existing.rows.length > 0) {
          console.info(`[checkout] duplicate request detected, idempotencyKey=${idempotencyKey} — returning early`);
          return res.status(200).json({
            success: true,
            duplicate: true,
            note: "Booking already exists for this request",
          });
        }
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

      // ── C3 (§15): ATOMIC slot claims BEFORE any booking row or Stripe call ─────────────
      // Each slot-bound item claims capacity via storage.bookSlot (conditional UPDATE ...
      // WHERE booked_count < capacity RETURNING — the DB row transition IS the concurrency
      // guard). If ANY item's slot just filled, release the slots already claimed in this
      // request (compensation) and abort with 409 slot_unavailable — no bookings created,
      // nothing charged. Claims that succeed stay claimed while the booking completes; if
      // payment later fails the booking sits payment_pending and the slot stays held — the
      // release on abandoned/refunded bookings is a filed follow-up alongside the existing
      // payment_pending recovery design (webhook completes; admin refund path can release).
      const claimedSlotIds: string[] = [];
      for (const item of cartData) {
        const itemSlotId = (item as any).slotId as string | null | undefined;
        if (!itemSlotId || !item.service) continue;
        const claimed = await storage.bookSlot(itemSlotId);
        if (!claimed) {
          for (const releaseId of claimedSlotIds) {
            await storage.releaseSlot(releaseId).catch((e: any) =>
              console.error(`[checkout] slot compensation release failed for ${releaseId}:`, e));
          }
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

      // Calculate totals — resolve per-item rates from booking_fee_configs then sum
      let checkoutSubtotal = 0;
      let checkoutBasePlatformFeeTotal = 0;
      let checkoutConciergeFeeTotal = 0;
      for (const item of cartData) {
        if (!item.service) continue;
        const itemPrice = parseFloat(item.service.price || "0") * (item.quantity || 1);
        // Map service category UUID → booking_fee_configs slug → commission rates
        let feeCategory = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        let isProviderService = false;
        if (item.service.userId) {
          const [providerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, item.service.userId))
            .limit(1);
          // Canonical vocabulary (shared/roles.ts): stored role is "service_provider" —
          // the old `=== "provider"` was always false, misrouting provider items to the expert band.
          if (isProviderRole(providerRow?.role)) {
            isProviderService = true;
          }
        }
        // Provider-role items: route through source:"provider" + providerId so the
        // early-adopter gate in resolveCommissionRates picks the correct band
        // (beta_flat vs expert_standard) from platform_settings — no literal strings.
        const itemCategoryRates = await resolveCommissionRates(
          isProviderService
            ? { source: "provider", providerId: item.service.userId ?? null }
            : { category: feeCategory, expertId: item.service.userId ?? null } // EXP-OVR.P2
        );
        // Per-service revenueShareRate is the final override (takes priority over config)
        const itemExpertShare = safeParseRate(item.service.revenueShareRate, itemCategoryRates.expertShareRate);
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
      }
      const subtotal = checkoutSubtotal;
      const platformFee = checkoutBasePlatformFeeTotal;
      const conciergeFee = checkoutConciergeFeeTotal;
      // For Stripe total, charge subtotal + base platform fee + concierge facilitation fee
      const total = subtotal + platformFee + conciergeFee;
      
      // Create bookings for each cart item
      const bookings = [];
      for (const item of cartData) {
        if (!item.service) continue;
        
        const price = parseFloat(item.service.price || "0") * (item.quantity || 1);
        // Map service category UUID → booking_fee_configs slug → commission rates
        let feeCategory2 = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        let isProviderService2 = false;
        if (item.service.userId) {
          const [providerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, item.service.userId))
            .limit(1);
          // Canonical vocabulary (shared/roles.ts) — see the quote loop above.
          if (isProviderRole(providerRow?.role)) {
            isProviderService2 = true;
          }
        }
        const itemCategoryRates2 = await resolveCommissionRates(
          isProviderService2
            ? { source: "provider", providerId: item.service.userId ?? null }
            : { category: feeCategory2, expertId: item.service.userId ?? null } // EXP-OVR.P2
        );
        // expertShareRate: fraction expert earns; platform gets (1 - expertShareRate)
        const expertShareRate = safeParseRate(item.service.revenueShareRate, itemCategoryRates2.expertShareRate);
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
        const netExpertEarningsAmt = baseExpertEarningsAmt - insuranceFeeAmt;
        
        // Create contract for this booking
        const contract = await storage.createContract({
          title: `Booking: ${item.service.serviceName}`,
          tripTo: item.service.location || "N/A",
          description: `Service booking for ${item.service.serviceName}. ${notes || ""}`,
          amount: price.toFixed(2),
        });
        
        // ── Step A: Create booking as payment_pending BEFORE charging Stripe ──
        // If the server crashes after the Stripe charge but before this line,
        // the PaymentIntent webhook will recover it via stripe_payment_intent_id.
        const booking = await storage.createServiceBooking({
          serviceId: item.serviceId,
          travelerId: userId,
          providerId: item.service.userId,
          contractId: contract.id,
          tripId: tripId || item.tripId,
          bookingDetails: {
            scheduledDate: item.scheduledDate,
            notes: item.notes || notes,
            quantity: item.quantity || 1,
          },
          totalAmount: price.toFixed(2),
          platformFee: totalPlatformFeeAmt.toFixed(2),
          insuranceFee: insuranceFeeAmt.toFixed(2),
          providerEarnings: netExpertEarningsAmt.toFixed(2),
          status: "payment_pending",
          // S4: first real writer of the attribution columns (source existed unwritten).
          source: acquisitionSource,
          ...(acquisitionRef ? { acquisitionRef } : {}),
          // C3: stamped only because the atomic bookSlot claim above already succeeded for
          // this item — the booking row records WHICH slot's capacity it holds.
          ...((item as any).slotId ? { slotId: (item as any).slotId } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        } as any);
        
        // Increment bookings count for the service
        await storage.incrementServiceBookings(item.serviceId, 1);
        
        // Create notification for provider
        try {
          const traveler = await storage.getUser(userId);
          const travelerName = traveler
            ? [traveler.firstName, traveler.lastName].filter(Boolean).join(" ") || traveler.email || "A traveler"
            : "A traveler";
          await storage.createNotification({
            userId: item.service.userId,
            type: "booking_request",
            title: "New Booking Request",
            message: `${travelerName} booked "${item.service.serviceName}" ($${price.toFixed(2)})`,
            relatedId: booking.id,
            relatedType: "booking",
            data: {
              bookingId: booking.id,
              serviceName: item.service.serviceName,
              travelerName,
              amount: price.toFixed(2),
            },
          });

          // Send email alert to the provider
          const provider = await storage.getUser(item.service.userId);
          if (provider?.email) {
            const { sendBookingAlertEmail } = await import("../services/email.service");
            const providerName = [provider.firstName, provider.lastName].filter(Boolean).join(" ") || provider.email;
            await sendBookingAlertEmail({
              providerEmail: provider.email,
              providerName,
              bookingId: booking.id,
              serviceName: item.service.serviceName,
              travelerName,
              amount: price.toFixed(2),
            });
          }
        } catch (notifErr) {
          console.error("Failed to create checkout booking notification:", notifErr);
        }
        
        bookings.push({ booking, contract });
      }
      
      // Clear cart after creating bookings (before Stripe — recoverable if crash)
      await storage.clearCart(userId);

      // ── Step B: Charge Stripe AFTER booking rows exist ──────────────────────
      // Bookings are already at payment_pending; even if the server crashes here
      // the webhook (payment_intent.succeeded) will flip them to confirmed.
      const { stripePaymentService } = await import("../services/stripe-payment.service");
      const paymentIntent = await stripePaymentService.createPaymentIntent(
        userId,
        bookings.map((b: any) => b.booking),
        total,
        false,
        'usd',
        idempotencyKey
      );

      // ── Step C: Stamp the PI ID on every service_booking so the webhook can ──
      // find and confirm them even after a mid-flight crash.
      if (paymentIntent?.paymentIntentId) {
        for (const { booking: b } of bookings as any[]) {
          await db.execute(sql`
            UPDATE service_bookings
            SET stripe_payment_intent_id = ${paymentIntent.paymentIntentId}
            WHERE id = ${b.id}
          `);
        }
      }
      
      // R3/F6: commissionRate is now the REAL charged ratio (platformFee/subtotal), not the
      // calculateCommission display literal (0.30) that matched no actual rate. Display-only field.
      const effectiveCommissionRate = subtotal > 0 ? Number((platformFee / subtotal).toFixed(4)) : 0;

      res.status(201).json({
        success: true,
        bookings,
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        conciergeFee: conciergeFee.toFixed(2),
        total: total.toFixed(2),
        paymentIntent,
        bookingType: BookingType.EXPERIENCE_CART,
        commissionRate: effectiveCommissionRate,
        message: "Booking created successfully. Complete payment.",
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

  // Read-only fee preview: mirrors checkout per-item resolution without creating bookings.
  // Returns { subtotal, platformFeeTotal, total, itemCount } for the current user's cart.

router.get("/api/cart/fee-preview", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const cartData = await storage.getCartItems(userId);

      if (cartData.length === 0) {
        return res.json({ subtotal: 0, platformFeeTotal: 0, total: 0, itemCount: 0 });
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

      let previewSubtotal = 0;
      let previewPlatformFeeTotal = 0;

      for (const item of cartData) {
        if (!item.service) continue;
        const itemPrice = parseFloat(item.service.price || "0") * (item.quantity || 1);
        let feeCategory = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        let isProviderServicePreview = false;
        if (item.service.userId) {
          const [providerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, item.service.userId))
            .limit(1);
          // Canonical vocabulary (shared/roles.ts) — mirrors the checkout loops.
          if (isProviderRole(providerRow?.role)) {
            isProviderServicePreview = true;
          }
        }
        const itemRates = await resolveCommissionRates(
          isProviderServicePreview
            ? { source: "provider", providerId: item.service.userId ?? null }
            : { category: feeCategory, expertId: item.service.userId ?? null }
        );
        const itemExpertShare = safeParseRate(item.service.revenueShareRate, itemRates.expertShareRate);
        previewSubtotal += itemPrice;
        const itemInsuranceFee = calcInsuranceFee(itemPrice, itemRates, feeCategory);
        previewPlatformFeeTotal += itemPrice * (1 - itemExpertShare) + itemInsuranceFee;
      }

      res.json({
        subtotal: Math.round(previewSubtotal * 100) / 100,
        platformFeeTotal: Math.round(previewPlatformFeeTotal * 100) / 100,
        total: Math.round((previewSubtotal + previewPlatformFeeTotal) * 100) / 100,
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
      const invoices = await storage.getInvoicesByCustomer(user?.claims?.sub ?? user?.id);
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
      const userId = (req.user as any).claims?.sub;
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
      const userId = (req.user as any).claims?.sub;
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
      const userId = (req.user as any).claims?.sub;
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


router.get("/stripe/connect/return", (_req, res) => {
    res.redirect("/dashboard?stripe=connected");
  });


router.get("/stripe/connect/refresh", (_req, res) => {
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
  const MIN_PAYOUT_REQUEST_CENTS = 1000; // $10 — mirrors the admin path threshold

  router.post("/api/payouts/request", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
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
      if (amountCents < MIN_PAYOUT_REQUEST_CENTS) {
        return res.status(400).json({
          error: "below_minimum",
          message: `The minimum payout is $${(MIN_PAYOUT_REQUEST_CENTS / 100).toFixed(2)}. Your available balance is $${(amountCents / 100).toFixed(2)}.`,
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

  // ─── Smart Lead Routing ──────────────────────────────────────────────────────
  // POST /api/leads/route  — score experts and auto-assign

export default router;
