import { verifyTripOwnership } from '../utils/trip-ownership';
import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { CREDIT_PACKAGES } from "@shared/credit-packages";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
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


router.get("/api/wallet", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getOrCreateWallet(userId);
    res.json(wallet);
  });

  // Get wallet transactions

router.get("/api/wallet/transactions", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const wallet = await storage.getWallet(userId);
    if (!wallet) {
      return res.json([]);
    }
    const transactions = await storage.getCreditTransactions(wallet.id);
    res.json(transactions);
  });

  // Add credits (admin only - for production, integrate with payment provider)

router.post("/api/wallet/add-credits", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await storage.getUser((req.user as any).claims.sub);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { userId, amount, description } = req.body;
      if (!userId || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid userId or amount" });
      }
      const transaction = await storage.addCredits(userId, amount, description || "Credit purchase");
      res.status(201).json(transaction);
    } catch (err) {
      console.error("Error adding credits:", err);
      res.status(500).json({ message: "Failed to add credits" });
    }
  });

  // Purchase credits via Stripe Checkout. LB-P5a: packages come from the
  // single canonical source in shared/credit-packages.ts.


router.post("/api/credits/purchase", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { packageId, currency: clientCurrency } = req.body;
      const chargeCurrency = clientCurrency || 'usd';

      const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
      if (!pkg) {
        return res.status(400).json({ message: "Invalid package" });
      }

      const { credits, price } = pkg;

      const userRecord = await storage.getUser(userId);
      const userEmail = userRecord?.email || undefined;

      const { getBaseUrl } = await import("../services/stripe.service");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });

      const baseUrl = getBaseUrl();
      const isZeroDecimal = chargeCurrency.toLowerCase() === 'jpy';
      const unitAmount = isZeroDecimal ? Math.round(price) : Math.round(price * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: chargeCurrency.toLowerCase(),
              product_data: {
                name: `${credits} Credits`,
                description: `Traveloure credit package - ${credits} credits`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'credit_purchase',
          userId,
          credits: credits.toString(),
          packageId: packageId?.toString() || '',
          currency: chargeCurrency.toLowerCase(),
        },
        success_url: `${baseUrl}/credits-billing?purchase=success&credits=${credits}`,
        cancel_url: `${baseUrl}/credits-billing?purchase=cancelled`,
      });

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (err: any) {
      console.error("Credit purchase error:", err);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
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

  // Expert Tips - Create a tip for an expert

router.post("/api/checkout", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { tripId, notes } = req.body;
      
      // Get cart items
      const cartData = await storage.getCartItems(userId);
      
      if (cartData.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
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
        // FEE-2: providers get flat 10% commission; query role to apply provider_commission_percent
        let feeCategory = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        if (item.service.userId) {
          const [providerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, item.service.userId))
            .limit(1);
          if (providerRow?.role === "provider") {
            feeCategory = "provider_commission_percent";
          }
        }
        const itemCategoryRates = await resolveCommissionRates({
          category: feeCategory,
          expertId: item.service.userId ?? null, // EXP-OVR.P2: honor per-expert override for experts
        });
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
        // FEE-2: providers get flat 10% commission; query role to apply provider_commission_percent
        let feeCategory2 = item.service.categoryId
          ? (catSlugMap.get(item.service.categoryId) ?? "default")
          : "default";
        if (item.service.userId) {
          const [providerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, item.service.userId))
            .limit(1);
          if (providerRow?.role === "provider") {
            feeCategory2 = "provider_commission_percent";
          }
        }
        const itemCategoryRates2 = await resolveCommissionRates({
          category: feeCategory2,
          expertId: item.service.userId ?? null, // EXP-OVR.P2: honor per-expert override for experts
        });
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
        
        // Create booking
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
          status: "pending",
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
      
      // Clear cart after successful checkout
      await storage.clearCart(userId);

      // Create Stripe payment intent for the total
      const { stripePaymentService } = await import("../services/stripe-payment.service");
      const paymentIntent = await stripePaymentService.createPaymentIntent(
        userId,
        bookings.map((b: any) => b.booking),
        total,
        false
      );
      
      // Canonical commission summary for the cart surface
      const cartCommission = calculateCommission(subtotal, BookingType.EXPERIENCE_CART);

      res.status(201).json({
        success: true,
        bookings,
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        conciergeFee: conciergeFee.toFixed(2),
        total: total.toFixed(2),
        paymentIntent,
        bookingType: BookingType.EXPERIENCE_CART,
        commissionRate: cartCommission.commissionRate,
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
        if (item.service.userId) {
          const [providerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, item.service.userId))
            .limit(1);
          if (providerRow?.role === "provider") {
            feeCategory = "provider_commission_percent";
          }
        }
        const itemRates = await resolveCommissionRates({
          category: feeCategory,
          expertId: item.service.userId ?? null,
        });
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
      const invoices = await storage.getInvoicesByCustomer(user.claims.sub);
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
      const userId = (req.user as any).claims?.sub;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!['expert', 'service_provider'].includes(user.role || '')) {
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
          userId, user.email!, user.role === 'expert' ? 'expert' : 'provider', (user as any).name || undefined
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

  // ─── Smart Lead Routing ──────────────────────────────────────────────────────
  // POST /api/leads/route  — score experts and auto-assign

export default router;
