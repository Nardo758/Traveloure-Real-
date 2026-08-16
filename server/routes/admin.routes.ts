import { verifyTripOwnership } from '../utils/trip-ownership';
import { getUserId } from "../utils/auth";
import { sanitizeText, sanitizeStringFields } from "../utils/text-sanitizer";
import { withQueryTimer } from '../utils/queryTimer';
import { parsePagination } from '../utils/pagination';
import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { isAuthenticated } from "../replit_integrations/auth";
import { db } from "../db";
import { bookingExpiryScheduler } from "../services/booking-expiry-scheduler.service";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { MIN_PAYOUT_CENTS, MIN_PAYOUT_DOLLARS, isPayoutStale } from "../config/payout.config";
import { stripePaymentService } from "../services/stripe-payment.service";
import { eq, and, or, like, ilike, sql, desc, count, ne, inArray, isNotNull, isNull, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { 
  users, contactSubmissions, helpGuideTrips, touristPlaceResults, touristPlacesSearches, 
  aiBlueprints, vendors, insertVendorSchema,
  insertLocalExpertFormSchema, insertServiceProviderFormSchema,
  insertProviderServiceSchema, insertServiceCategorySchema,
  insertServiceSubcategorySchema, insertFaqSchema,
  insertServiceTemplateSchema, insertServiceBookingSchema, insertServiceReviewSchema,
  itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryVariantMetrics,
  userExperienceItems, userExperiences, providerServices, cartItems, trips,
  serviceBookings, serviceReviews, reviewModerationLogs, notifications, adminNotifications as adminNotificationsTable, wallets, creditTransactions, serviceProviderForms,
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
  accessAuditLogs,
  serviceOfferingTypes, insertServiceOfferingTypeSchema,
  expertOfferingTypes, insertExpertOfferingTypeSchema,
  localExpertForms, expertRequests,
  coordinationStates,
  readyMadeTrips,
  expertTypeEnum,
  bundleComponents,
  serviceCategories,
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
import { affiliateScraperService } from "../services/affiliate-scraper.service";
import { cacheService } from "../services/cache.service";
import { cacheSchedulerService } from "../services/cache-scheduler.service";
import { claudeService } from "../services/claude.service";
import { getTransitRoute, getMultipleTransitRoutes, TransitRequestSchema } from "../services/routes.service";
import { aiOrchestrator } from "../services/ai-orchestrator";
import { grokService } from "../services/grok.service";
import { feverService } from "../services/fever.service";
import { partnerEventsCacheService } from "../services/partner-events-cache.service";
import { ingestKyotoHeritage, ingestKyotoContentGaps, isDmoIngestReady } from "../services/dmo-ingestion.service";
import { ingestYoutubeGuides, isYoutubeIngestReady } from "../services/youtube-ingestion.service";
import { analyzeKyotoContentGaps, listOpenKyotoGaps } from "../services/content-gap.service";
import { getGapFillSummary, getGapFillSourceTotals } from "../services/optimizer-gap-ledger.service";
import { getProviderHealth } from "../services/provider-health.service";
import { classifyDmoShape } from "../services/dmo-place-extraction.service";
import { getExtractedPlacesCounts, isConcludedEmptyMarker } from "../services/dmo-extracted-places.service";
import { getLatestDmoExtractionRun } from "../services/dmo-extraction-runs.service";
import { cityNeighborhoods, expertNeighborhoods, dmoRawContent, dmoSources, dmoExtractedPlaces } from "@shared/schema";
import { messageReports, userBlocks } from "@shared/schema";
import { isExpertRole, isProviderRole, EXPERT_ROLES, PROVIDER_ROLES } from "@shared/roles";
import { isReadyMadeBadge, READY_MADE_BADGE_VALUES } from "@shared/ready-made-badges";
import { coordinationService } from "../services/coordination.service";
import { resolvePublishVerification } from "../services/publish-verification.service";
import { vendorManagementService } from "../services/vendor-management.service";
import { budgetService } from "../services/budget.service";
import { itineraryIntelligenceService } from "../services/itinerary-intelligence.service";
import { emergencyService } from "../services/emergency.service";
import { experienceCatalogService } from "../services/experience-catalog.service";
import { opportunityEngineService } from "../services/opportunity-engine.service";
import { aiUsageService } from "../services/ai-usage.service";
import { sanitizeUserForRole, sanitizeBookingForExpert, canSeeFullUserData, createPublicProfile, getDisplayName, redactContactInfo } from "../utils/data-sanitizer";
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
import { travelpayoutsCache } from "@shared/schema";
import {
  resolveCommissionRates,
  type CommissionRates,
} from "../services/commission";
import { calculateCommission, BookingType } from "../utils/commissionCalculator";
import { revertPurchasedItemsForBooking } from "../services/item-routing.service";
import {
  getAdminRole, getFullAdminUser, insertAccessAuditLog, getContactSubmissions,
  updateContactSubmission, getAllUsersBasic, getUserCommissionOverrides,
  updateUserRole, getUserVerificationStatus, getUserCommissionOverride,
  setUserCommissionOverride, insertNotification, getAdminNotifications,
  getApprovedProviderForms, getProviderUserInfo, getProviderServicesForUser,
  getProviderUsersBulk, updateProviderServiceStatus, updateProviderServiceFeatured,
  updateProviderServiceAffinityTags, checkAndDeleteProviderService,
  resolveOrCreateItineraryPlanningCategory, createExpertServiceOfferingRow,
  getAllExpertServiceOfferings, updateExpertServiceOfferingRoles,
  validateDefaultCommissionBandInheritance, validateCommissionBand,
  getPayoutRecipientId, getPayoutAmount, getAdminUsersPaginated, getAdminUsersPage,
  getUserTripCount, getUserBookingSpend, getUserServiceBookings, getAdminTripsList, getAdminTrips, getAdminTripsPage,
  getAllServiceReviewsForAnalytics, getAllTripsForAnalytics, getAllTrips, getAllServiceReviews,
  getExpertsByCountryAnalytics, getProvidersByCountryAnalytics, getTripsByDestinationAnalytics,
  getExpertsByCountryDetailed, getExpertsByCity, getExpertStatusSummary, getExpertsByExperience,
  getProvidersByBusinessType, getProvidersByCountryDetailed, getProviderStatusSummary,
  getActiveServicesCount, getTopProvidersByBookings,
  getTourismDestinationDemand, getTourismBookingTrends, getTourismSourceMarkets,
  getUsersByMonth, getTourismSpendingPatterns, getTourismPartyComposition,
  getTourismSeasonality, getTourismEventTypes, getTourismSummaryMetrics,
  dbHealthPing, pingDb, adminSearchUsers, adminSearchTrips, adminSearchServices, getAdminGlobalCounts,
  getAnalyticsByCountry, getExpertAnalytics, getProviderAnalytics, getTourismAnalytics,
  adminGlobalSearch, getAdminSearchCounts,
  getServiceReviewsList, getAdminReviews, getReviewModerationLogs, getServiceReviewById, getReviewById,
  updateServiceReviewStatus, moderateReview, insertReviewModerationLog,
  getServiceReviewsForServiceRating, updateProviderServiceRating, recalcServiceRating,
  getFeeBands, getFeeBand, updateFeeBand, checkActiveBand,
  getPlatformSettings, getPlatformSettingValue, upsertPlatformSetting,
  getServiceOfferingTypesList, getAllServiceOfferingTypes,
  createServiceOfferingTypeRow, updateServiceOfferingTypeRow, deleteServiceOfferingTypeRow,
  getExpertOfferingTypesList, createExpertOfferingTypeRow, updateExpertOfferingTypeRow, deleteExpertOfferingTypeRow,
  getLeadRoutingLogs, overrideLeadRouting, getRoutingQueueItems, getExpertRequest,
  confirmLeadAssignmentTx, reassignExpertRequest, getExpertNameById, getExpertRequestRow,
  getLocalKnowledgeNuggetCounts,
  getTravelPulseCitiesForAutoIndex, getTravelPulseCitiesList,
  getAffiliateProductsForAutoIndex, getActiveAffiliateProducts,
  getContentRegistryForAutoIndex, getPublishedContentRegistry,
  getOptimizationFees, findOptimizationFee, updateOptimizationFee, createOptimizationFee,
  getEventPackages, createEventPackage, patchEventPackage, archiveEventPackage,
  getNeighborhoodsWithSummary, getNeighborhoodById, getNeighborhoodExperts,
  getNeighborhoodCoverageTargets, validateCategoryKey, getServiceCategoryByKey,
  upsertNeighborhoodCoverageTarget, deleteNeighborhoodCoverageTargetRow, deleteNeighborhoodCoverageTarget,
  getNeighborhoodCurrentLead, getExpertFormForNeighborhoodCheck, getExpertFormCityInfo,
  clearNeighborhoodLeadTx, swapNeighborhoodLeadTx,
  validateAdjacencyTargets, updateNeighborhoodAdjacencyTx,
  getUntaggedProviderServices, backfillProviderServiceNeighborhoods,
  getItineraryForTrip, getGeneratedItinerary, upsertTripAnalyticsEnhanced,
  getLocationSummary, getLocationSummaryData, getDestinationDemandReport, getProviderMarketReport,
  getGeographicInsightsReport, getConversionFunnelReport,
  getActivityDemandReport, getActivityTrendsReport, getDestinationBenchmarkReport,
  getUsersBasicByIds, getProviderServiceById, deleteProviderService,
  getRoleChangeAuditLogs,
} from "../services/admin-query.service";

const router = Router();

/**
 * Test seam — populated only by unit tests to intercept the Resend call without
 * hitting the real API. Empty object in production; no behaviour change when unset.
 */
export const _adminTestEmailHooks: {
  resendSend?: (payload: Record<string, unknown>) => Promise<{
    data: { id?: string } | null;
    error: { message?: string } | null;
  }>;
  /** Override the Resend call timeout (ms). Defaults to 12 000 in production; set low in tests. */
  resendTimeoutMs?: number;
} = {};

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


const requireAdminLocal = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
  // Use getFullAdminUser (SELECT *) so we can also check isSuspended — getAdminRole
  // only fetches { role } and would allow a suspended admin session through.
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  // Replicate the same suspension gate that isAuthenticated enforces.  Routes that
  // skip isAuthenticated and use only requireAdminLocal would otherwise let a
  // suspended admin's stale session reach handler logic.
  if (user.isSuspended) {
    req.logout(() => {});
    return res.status(403).json({
      message: "Your account has been suspended. Please contact support.",
      reason: (user as any).suspensionReason ?? undefined,
    });
  }
  next();
};

router.post("/api/admin/gems/backfill-photos", isAuthenticated, requireAdminLocal, async (req, res) => {
  try {
    const { grokDiscoveryService } = await import("../services/grok-discovery.service");
    const result = await grokDiscoveryService.backfillGemPhotos();
    res.json({
      message: `Backfill complete: ${result.processed} gem(s) processed, ${result.updated} updated, ${result.failed} failed.`,
      ...result,
    });
  } catch (err: any) {
    console.error("Gem photo backfill failed:", err);
    res.status(500).json({ message: err?.message ?? "Gem photo backfill failed" });
  }
});

router.get("/api/admin/commission-test", isAuthenticated, async (req, res) => {
  const userId = getUserId(req)!;
  const user = await getFullAdminUser(userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    // Ruling 25 / migration 174: EXPERIENCE_CART rate resolves from fee_bands.
    const { requireExperienceCartRate } = await import("../services/commission");
    const experienceCartRate = await requireExperienceCartRate();
    res.json({
      expertNew:          calculateCommission(100, BookingType.EXPERT_SESSION,   { isNewExpert: true }),
      expertEstablished:  calculateCommission(100, BookingType.EXPERT_SESSION,   { isNewExpert: false }),
      providerTier1:      calculateCommission(100, BookingType.PROVIDER_BOOKING, { providerTier: 1 }),
      providerTier4:      calculateCommission(100, BookingType.PROVIDER_BOOKING, { providerTier: 4 }),
      experienceCart:     calculateCommission(100, BookingType.EXPERIENCE_CART,  { experienceCartRate }),
      creditPurchase:     calculateCommission(100, BookingType.CREDIT_PURCHASE),
    });
  } catch (err: any) {
    // Fail loud with the configuration message (e.g. missing experience_cart_checkout band).
    res.status(500).json({ message: err?.message || "Commission test failed" });
  }
});

router.get("/api/admin/stats", isAuthenticated, async (req, res) => {
    const userId = getUserId(req)!;
    const user = await getFullAdminUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    try {
      // Get counts from database
      const allUsers = await getAllUsersBasic();
      const allBookings = await storage.getServiceBookings({});
      const pendingExperts = await storage.getLocalExpertForms("pending");
      const pendingProviders = await storage.getServiceProviderForms("pending");
      
      const totalUsers = allUsers.length;
      const totalBookings = allBookings.length;
      
      // Calculate revenue from completed bookings
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // This month's revenue
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const monthlyRevenue = completedBookings
        .filter(b => {
          const date = b.createdAt ? new Date(b.createdAt) : null;
          return date && date.getMonth() === thisMonth && date.getFullYear() === thisYear;
        })
        .reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      
      // New users today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newUsersToday = allUsers.filter(u => {
        const created = u.createdAt ? new Date(u.createdAt) : null;
        return created && created >= today;
      }).length;
      
      res.json({
        totalUsers,
        totalBookings,
        totalRevenue,
        monthlyRevenue,
        newUsersToday,
        pendingExpertApplications: pendingExperts.length,
        pendingProviderApplications: pendingProviders.length,
      });
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });


router.get("/api/admin/bookings", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const status = req.query.status as string | undefined;
      const allBookings = await storage.getServiceBookings(status ? { status } : {});
      const enrichedBookings = await Promise.all(allBookings.map(async (booking) => {
        const traveler = booking.travelerId ? await storage.getUser(booking.travelerId) : null;
        const provider = booking.providerId ? await storage.getUser(booking.providerId) : null;
        const service = booking.serviceId ? await storage.getProviderServiceById(booking.serviceId) : null;
        return {
          ...booking,
          traveler: traveler ? { id: traveler.id, firstName: traveler.firstName, lastName: traveler.lastName, email: traveler.email } : null,
          provider: provider ? { id: provider.id, firstName: provider.firstName, lastName: provider.lastName, email: provider.email } : null,
          service: service ? { id: service.id, serviceName: service.serviceName } : null,
        };
      }));
      res.json(enrichedBookings);
    } catch (err) {
      console.error("Admin bookings error:", err);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });


/**
 * GET /api/admin/bookings/stale-pending
 * Returns bookings stuck in pending_payment status for more than 24 hours.
 * These are bookings where the client never called confirm-payment AND no
 * Stripe webhook arrived (e.g. browser closed mid-payment).
 */
router.get("/api/admin/bookings/stale-pending", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        b.id,
        b.user_id,
        b.trip_id,
        b.title,
        b.status,
        b.total_amount,
        b.created_at,
        b.booking_date,
        u.email AS user_email,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name
      FROM bookings b
      LEFT JOIN users u ON u.id = b.user_id
      WHERE b.status = 'pending_payment'
        AND b.created_at < NOW() - INTERVAL '24 hours'
      ORDER BY b.created_at ASC
      LIMIT 100
    `);
    res.json({ bookings: result.rows, count: result.rows.length });
  } catch (err) {
    console.error("Stale pending bookings error:", err);
    res.status(500).json({ message: "Failed to fetch stale pending bookings" });
  }
});

/**
 * GET /api/admin/bookings/balance-overdue  (Lane 7, DECISIONS.md ruling 72)
 *
 * DETECTION for the deposit-partial-payment overdue case. A deposit-paid booking whose
 * `balance_due_at` cutoff has passed while `balance_paid` is still false. The v1 ruling builds
 * DETECTION only — no automatic cancel/refund sweep yet (deferred to v2, to run per the listing's
 * EXISTING cancellationPolicyType). By construction such a booking reads as `deposit_paid`, NEVER
 * `confirmed`, so it never looks fully paid and releases no earning (§13 — the gap is visible, not
 * silent). Rows with a NULL cutoff are honestly excluded (no date the platform can key on).
 */
router.get("/api/admin/bookings/balance-overdue", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        sb.id,
        sb.traveler_id,
        sb.service_id,
        sb.trip_id,
        sb.status,
        sb.total_amount,
        sb.deposit_amount,
        sb.balance_amount,
        sb.balance_due_at,
        sb.stripe_deposit_intent_id,
        sb.created_at,
        u.email AS traveler_email
      FROM service_bookings sb
      LEFT JOIN users u ON u.id = sb.traveler_id
      WHERE sb.status = 'deposit_paid'
        AND sb.balance_paid IS NOT TRUE
        AND sb.balance_due_at IS NOT NULL
        AND sb.balance_due_at < NOW()
      ORDER BY sb.balance_due_at ASC
      LIMIT 200
    `);
    res.json({ bookings: result.rows, count: result.rows.length });
  } catch (err) {
    console.error("Balance-overdue bookings error:", err);
    res.status(500).json({ message: "Failed to fetch balance-overdue bookings" });
  }
});

/**
 * GET /api/admin/bookings/stuck-pending
 * Returns service_bookings stuck in payment_pending status for more than 10 minutes.
 * These are bookings where Stripe was (or may have been) charged but the server
 * crashed before the PI ID was stamped or before the webhook arrived.
 * Ops should cross-check each against Stripe dashboard before manually reconciling.
 */
router.get("/api/admin/bookings/stuck-pending", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        sb.id,
        sb.traveler_id,
        sb.provider_id,
        sb.service_id,
        sb.status,
        sb.total_amount,
        sb.stripe_payment_intent_id,
        sb.idempotency_key,
        sb.created_at,
        u.email   AS traveler_email,
        u.first_name AS traveler_first_name,
        u.last_name  AS traveler_last_name,
        ps.service_name
      FROM service_bookings sb
      LEFT JOIN users  u  ON u.id  = sb.traveler_id
      LEFT JOIN provider_services ps ON ps.id = sb.service_id
      WHERE sb.status = 'payment_pending'
        AND sb.created_at < NOW() - INTERVAL '10 minutes'
      ORDER BY sb.created_at ASC
      LIMIT 200
    `);
    res.json({
      bookings: result.rows,
      count: result.rows.length,
      note: "These bookings may have been charged. Cross-check each stripe_payment_intent_id in the Stripe dashboard before manually reconciling.",
    });
  } catch (err) {
    console.error("Stuck pending bookings error:", err);
    res.status(500).json({ message: "Failed to fetch stuck pending bookings" });
  }
});

/**
 * GET /api/admin/bookings/reconciliation-exceptions
 *
 * The OPS SURFACE for the reconciliation-exception state (legacy-reconciliation lane,
 * tasks #212/#213). A payment signal — the Stripe webhook, or the client's confirm-payment
 * fallback — arrived for a booking that could NOT be promoted, canonically a LATE webhook for a
 * claim the TTL sweep already voided. Ruling 38 §15b: the void wins, the row is never
 * resurrected. But if that PaymentIntent genuinely succeeded, real money moved with no booking
 * behind it, so the exception is recorded on the row (`booking_details.reconciliationException`)
 * and surfaced here — ops-visible, never silent.
 *
 * EVERY ROW HERE NEEDS A HUMAN: check the paymentIntentId in the Stripe dashboard. Succeeded ⇒
 * refund it or re-create the booking manually. Not succeeded ⇒ nothing moved; the row can be
 * dismissed.
 */
router.get("/api/admin/bookings/reconciliation-exceptions", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        sb.id,
        sb.traveler_id,
        sb.status,
        sb.total_amount,
        sb.stripe_payment_intent_id,
        sb.booking_details->'reconciliationException' AS exception,
        sb.created_at,
        sb.updated_at,
        u.email      AS traveler_email,
        u.first_name AS traveler_first_name,
        u.last_name  AS traveler_last_name,
        ps.service_name
      FROM service_bookings sb
      LEFT JOIN users u ON u.id = sb.traveler_id
      LEFT JOIN provider_services ps ON ps.id = sb.service_id
      WHERE sb.booking_details ? 'reconciliationException'
      ORDER BY sb.updated_at DESC
      LIMIT 200
    `);
    res.json({
      bookings: result.rows,
      count: result.rows.length,
      note:
        "A payment signal arrived for a booking that could not be promoted (the row was NOT resurrected). " +
        "Check each paymentIntentId in Stripe: succeeded ⇒ refund or re-book manually; not succeeded ⇒ dismiss.",
    });
  } catch (err) {
    console.error("Reconciliation exceptions error:", err);
    res.status(500).json({ message: "Failed to fetch reconciliation exceptions" });
  }
});

/**
 * GET /api/admin/webhooks/unprocessed
 * Returns webhook_events rows where processed=false.
 * Covers two cases: events that never arrived (gap vs Stripe API)
 * and events that arrived but failed during processing (error column set).
 * Each row includes the raw_payload so ops can replay manually if needed.
 */
router.get("/api/admin/webhooks/unprocessed", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        id,
        stripe_event_id,
        event_type,
        processed,
        processed_at,
        error,
        created_at
      FROM webhook_events
      WHERE processed = FALSE
      ORDER BY created_at ASC
      LIMIT 200
    `);
    res.json({
      events: result.rows,
      count: result.rows.length,
      note: "Events with error set failed during processing and need manual review. Events without error may be stuck mid-flight.",
    });
  } catch (err) {
    console.error("Unprocessed webhooks error:", err);
    res.status(500).json({ message: "Failed to fetch unprocessed webhook events" });
  }
});

/**
 * GET /api/admin/disputes
 * Returns all SERVICE bookings with status="disputed", most recent first — the queue the
 * POST /api/admin/disputes/:bookingId/reject action operates on.
 *
 * Reads `service_bookings` (NOT the legacy `bookings` table): the escrow dispute flow
 * (POST /api/bookings/:id/dispute) marks service_bookings.status='disputed' and links the disputed
 * earnings via provider_earnings.source_id / expert_earnings.reference_id. The old query read the
 * legacy `bookings` table, so escrow disputes never appeared here and admins had no way to see the
 * queue they were meant to resolve. The dispute reason is surfaced from booking_metadata (where the
 * dispute endpoint persists it, since service_bookings has no dispute_reason column).
 */
router.get("/api/admin/disputes", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        sb.id,
        sb.status,
        sb.booking_metadata->>'disputeReason' AS dispute_reason,
        sb.stripe_payment_intent_id,
        sb.total_amount,
        sb.traveler_id AS user_id,
        sb.provider_id,
        sb.service_id,
        ps.service_name AS title,
        sb.created_at,
        sb.updated_at
      FROM service_bookings sb
      LEFT JOIN provider_services ps ON ps.id = sb.service_id
      WHERE sb.status = 'disputed'
      ORDER BY sb.updated_at DESC NULLS LAST
      LIMIT 200
    `);
    res.json({
      disputes: result.rows,
      count: result.rows.length,
      note: "Do NOT refund or claw back expert payouts without manual Stripe dashboard confirmation.",
    });
  } catch (err: any) {
    console.error("Admin disputes error:", err);
    res.status(500).json({ message: "Failed to fetch disputed bookings" });
  }
});

// Concierge request queue — the follow-up surface for the concierge Full/Expert tiers.
// The concierge entry (client/src/pages/concierge) captures a durable concierge_requests
// row when a traveler picks a tier; the Full ("done-for-you") tier tells the traveler
// "we'll follow up with a personalized quote". This read-only queue is what makes that
// promise real — an admin can see incoming human-fulfillment requests (chosen_tier in
// expert/full) and act on them. Read-only over the existing table; no schema change.
// (Full white-glove fulfillment/messaging is filed as a separate build.)
router.get("/api/admin/concierge-requests", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    // Join the coordination engagement a Full-tier request spun up (Phase 1a wires it via
    // user_request->>'conciergeRequestId'), plus the currently-assigned coordinator, so the admin
    // queue can assign/see the coordinator + fee status inline (Phase 1c).
    const result = await db.execute(sql`
      SELECT
        cr.id,
        cr.intent,
        cr.event_type,
        cr.chosen_tier,
        cr.status,
        cr.created_at,
        u.email       AS user_email,
        u.first_name  AS user_first_name,
        u.last_name   AS user_last_name,
        cs.id                          AS coordination_id,
        cs.status                      AS coordination_status,
        cs.fee_payment_status          AS fee_payment_status,
        cs.revenue_reversal_missing    AS revenue_reversal_missing,
        cs.revenue_reversal_reviewed_at AS revenue_reversal_reviewed_at,
        cs.assigned_expert_id          AS assigned_expert_id,
        ce.first_name          AS coordinator_first_name,
        ce.last_name           AS coordinator_last_name,
        ce.email               AS coordinator_email
      FROM concierge_requests cr
      LEFT JOIN users u ON u.id = cr.user_id
      LEFT JOIN coordination_states cs ON cs.user_request->>'conciergeRequestId' = cr.id::text
      LEFT JOIN users ce ON ce.id = cs.assigned_expert_id
      WHERE cr.chosen_tier IN ('expert', 'full')
      ORDER BY cr.created_at DESC NULLS LAST
      LIMIT 200
    `);
    res.json({ requests: result.rows, count: result.rows.length });
  } catch (err: any) {
    console.error("Admin concierge-requests error:", err);
    res.status(500).json({ message: "Failed to fetch concierge requests" });
  }
});

// GET /api/admin/business-funnel — Build 1 (activation) funnel report. Every count is a pure
// read aggregation over EXISTING tables (§13: nothing tracked separately, nothing to drift):
// applications → approved → earner accounts → handle claimed → first offering → approved
// offering → payouts connected → first booking. Role lists mirror shared/roles.ts.
router.get("/api/admin/business-funnel", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM local_expert_forms)                                   AS expert_applications,
        (SELECT count(*)::int FROM local_expert_forms WHERE status = 'approved')         AS expert_approved,
        (SELECT count(*)::int FROM service_provider_forms)                               AS provider_applications,
        (SELECT count(*)::int FROM service_provider_forms WHERE status = 'approved')     AS provider_approved,
        (SELECT count(*)::int FROM users
           WHERE role IN ('expert','local_expert','travel_expert','event_planner','service_provider')
             AND (is_deleted IS NULL OR is_deleted = false))                             AS earners,
        (SELECT count(*)::int FROM users
           WHERE role IN ('expert','local_expert','travel_expert','event_planner','service_provider')
             AND (is_deleted IS NULL OR is_deleted = false)
             AND handle IS NOT NULL)                                                     AS with_handle,
        (SELECT count(*)::int FROM users
           WHERE role IN ('expert','local_expert','travel_expert','event_planner','service_provider')
             AND (is_deleted IS NULL OR is_deleted = false)
             AND stripe_account_status = 'active')                                       AS payouts_connected,
        (SELECT count(DISTINCT owner)::int FROM (
             SELECT user_id AS owner FROM provider_services
             UNION SELECT expert_id FROM expert_templates
             UNION SELECT author_id FROM ready_made_trips) o)                            AS with_offering,
        (SELECT count(DISTINCT owner)::int FROM (
             SELECT user_id AS owner FROM provider_services WHERE approval_status = 'approved'
             UNION SELECT expert_id FROM expert_templates WHERE approval_status = 'approved'
             UNION SELECT author_id FROM ready_made_trips WHERE status = 'approved') o)  AS with_approved_offering,
        (SELECT count(DISTINCT provider_id)::int FROM service_bookings
           WHERE provider_id IS NOT NULL)                                                AS with_booking
    `);
    res.json(result.rows[0] ?? {});
  } catch (err: any) {
    console.error("Admin business-funnel error:", err);
    res.status(500).json({ message: "Failed to compute business funnel" });
  }
});

// GET /api/admin/coordinators — eligible expert coordinators for the assign-coordinator picker.
// Any expert-family role (shared/roles.ts), excluding deleted/suspended. The original list
// omitted event_planner — the single most relevant coordinator role for event coordination.
router.get("/api/admin/coordinators", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT id, first_name, last_name, email, role
      FROM users
      WHERE role IN ('expert', 'local_expert', 'travel_expert', 'event_planner')
        AND (is_suspended IS NULL OR is_suspended = false)
        AND (is_deleted IS NULL OR is_deleted = false)
      ORDER BY first_name NULLS LAST, last_name NULLS LAST
      LIMIT 500
    `);
    res.json({ coordinators: result.rows });
  } catch (err: any) {
    console.error("Admin coordinators error:", err);
    res.status(500).json({ message: "Failed to fetch coordinators" });
  }
});

// POST /api/admin/coordination-states/:id/assign-coordinator — assign (or reassign) an expert
// coordinator to a coordination engagement. Sets assigned_expert_id; the expert coordinator
// workspace reads engagements by that field. Validates the target is a real expert-type user.
router.post("/api/admin/coordination-states/:id/assign-coordinator", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const { expertId } = z.object({ expertId: z.string().min(1) }).parse(req.body);

    const [expert] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, expertId))
      .limit(1);
    if (!expert || !["expert", "local_expert", "travel_expert"].includes(expert.role as string)) {
      return res.status(400).json({ message: "Target user is not an eligible expert coordinator" });
    }

    const [updated] = await db
      .update(coordinationStates)
      .set({ assignedExpertId: expertId, updatedAt: new Date() })
      .where(eq(coordinationStates.id, req.params.id))
      .returning({
        id: coordinationStates.id,
        assignedExpertId: coordinationStates.assignedExpertId,
        tripId: coordinationStates.tripId,
        experienceType: coordinationStates.experienceType,
        destination: coordinationStates.destination,
      });
    if (!updated) {
      return res.status(404).json({ message: "Coordination engagement not found" });
    }

    // F5 (workstation-flows audit): the assignment previously happened in silence — the expert
    // found out only if they visited Assigned Trips. Best-effort notification, never fails the assign.
    try {
      await db.insert(notifications).values({
        userId: expertId,
        type: "booking_request",
        title: "New event coordination assignment",
        message: `You've been assigned to coordinate a ${updated.experienceType} in ${updated.destination ?? "TBC"}. Find it under Coordination engagements in your Inbox.`,
        relatedId: updated.id,
        relatedType: "coordination_state",
        data: {
          ...(updated.tripId ? { tripId: updated.tripId } : {}),
          // C5: /expert/assigned-trips retired — coordination engagements live on Inbox's Queue.
          workspacePath: updated.tripId ? `/expert/workspace/${updated.tripId}` : "/expert/inbox",
        },
      } as any);
    } catch (notifyErr) {
      console.error("Admin assign-coordinator notify failed (non-fatal):", notifyErr);
    }

    res.json({ success: true, coordinationId: updated.id, assignedExpertId: updated.assignedExpertId });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: err.errors });
    }
    console.error("Admin assign-coordinator error:", err);
    res.status(500).json({ message: "Failed to assign coordinator" });
  }
});

// POST /api/admin/coordination-states/:id/review-ledger-gap — #877: acknowledge a coordination
// "revenue_reversal_missing" ledger-gap warning (migration 128) so it stops rendering as an open
// warning in the admin concierge panel forever. Additive-only (migration 169): stamps
// revenue_reversal_reviewed_at/_by; NEVER touches revenue_reversal_missing itself or any other
// ledger data — the underlying gap flag and its history are never deleted, only annotated as
// reviewed. Idempotent: re-marking an already-reviewed gap just re-stamps the timestamp/reviewer,
// no error, no duplicate side effect (there is nothing else to duplicate).
router.post("/api/admin/coordination-states/:id/review-ledger-gap", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const [updated] = await db
      .update(coordinationStates)
      .set({ revenueReversalReviewedAt: new Date(), revenueReversalReviewedBy: user.id })
      .where(eq(coordinationStates.id, req.params.id))
      .returning({
        id: coordinationStates.id,
        revenueReversalMissing: coordinationStates.revenueReversalMissing,
        revenueReversalReviewedAt: coordinationStates.revenueReversalReviewedAt,
      });
    if (!updated) {
      return res.status(404).json({ message: "Coordination engagement not found" });
    }
    res.json({ success: true, ...updated });
  } catch (err: any) {
    console.error("Admin review-ledger-gap error:", err);
    res.status(500).json({ message: "Failed to mark ledger gap reviewed" });
  }
});

// ─── Ready-Made store-listing approvals (task #158; the §10 shared-queue pattern, NOT a fork) ───
// Same lifecycle vocabulary as expert_templates/provider_services: submitted → approved|rejected,
// reject-reason required, §15 atomic conditional transitions. Approval is the gate the author
// cannot self-satisfy (D1a) — the submit endpoint can only ever reach 'submitted'.

// GET /api/admin/ready-made/pending — submitted listings + author identity + build coverage.
router.get("/api/admin/ready-made/pending", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT
        rmt.id, rmt.title, rmt.plan_type, rmt.market, rmt.duration_days, rmt.best_season,
        rmt.pricing_mode, rmt.price_cents, rmt.hero_image_url, rmt.submitted_at,
        rmt.source_trip_id,
        u.first_name AS author_first_name, u.last_name AS author_last_name, u.role AS author_role,
        (SELECT COUNT(*) FROM itinerary_items ii WHERE ii.trip_id = rmt.source_trip_id)::int AS item_count,
        (SELECT COUNT(DISTINCT ii.day_number) FROM itinerary_items ii WHERE ii.trip_id = rmt.source_trip_id)::int AS days_with_items
      FROM ready_made_trips rmt
      JOIN users u ON u.id = rmt.author_id
      WHERE rmt.status = 'submitted' AND rmt.active = true
      ORDER BY rmt.submitted_at ASC NULLS LAST
    `);
    res.json({ pending: result.rows ?? [] });
  } catch (err: any) {
    console.error("Admin ready-made pending error:", err);
    res.status(500).json({ message: "Failed to fetch pending store listings" });
  }
});

// POST /api/admin/ready-made/:id/approve — approve + SNAPSHOT insideCounts at this transition.
// The snapshot is taken here (not at read time) so the public card never recomputes from a trip
// the author keeps editing — what was approved is what the shelf describes.
router.post("/api/admin/ready-made/:id/approve", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const [listing] = await db
      .select({ id: readyMadeTrips.id, sourceTripId: readyMadeTrips.sourceTripId })
      .from(readyMadeTrips)
      .where(eq(readyMadeTrips.id, req.params.id))
      .limit(1);
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    // insideCounts from the REAL build (never fabricated, §13): distinct days, total items,
    // and the per-type breakdown the store card renders as "what's inside".
    const typeRows = await db
      .select({ itemType: itineraryItems.itemType, count: sql<number>`count(*)::int` })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, listing.sourceTripId))
      .groupBy(itineraryItems.itemType);
    const dayRows = await db
      .select({ dayNumber: itineraryItems.dayNumber })
      .from(itineraryItems)
      .where(eq(itineraryItems.tripId, listing.sourceTripId))
      .groupBy(itineraryItems.dayNumber);
    const insideCounts = {
      days: dayRows.length,
      items: typeRows.reduce((sum, r) => sum + r.count, 0),
      byType: Object.fromEntries(typeRows.map((r) => [r.itemType ?? "activity", r.count])),
      snapshotAt: new Date().toISOString(),
    };

    // §15: the transition is the concurrency guard — a double-approve (or an approve racing a
    // reject) matches 0 rows and returns 409 with no second snapshot.
    const [updated] = await db
      .update(readyMadeTrips)
      .set({
        status: "approved",
        insideCounts,
        reviewedAt: new Date(),
        reviewedBy: user.id,
        rejectionReason: null,
        updatedAt: new Date(),
      } as any)
      .where(and(eq(readyMadeTrips.id, req.params.id), eq(readyMadeTrips.status, "submitted")))
      .returning();
    if (!updated) {
      return res.status(409).json({ message: "Listing is not awaiting review" });
    }
    await insertAccessAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "ready_made_approve",
      resourceType: "ready_made_trip",
      resourceId: req.params.id,
      metadata: { insideCounts },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[admin/ready-made] audit log failed (non-fatal):", err));
    res.json({ success: true, listing: updated });
  } catch (err: any) {
    console.error("Admin ready-made approve error:", err);
    res.status(500).json({ message: "Failed to approve listing" });
  }
});

// PATCH /api/admin/ready-made/:id/badge — set or clear the store's editorial badge (MP-3).
//
// Why this endpoint exists: `ready_made_trips.badge` was READ on all four public DTOs and
// RENDERED on the store card + detail page, but NOTHING in the repo ever wrote it — a
// decorative column that could only ever be empty, so the store had no curation lever at all.
//
// The value is validated against the CLOSED shared vocabulary (shared/ready-made-badges.ts),
// never free text: the string is rendered verbatim to travelers, so an open field would let an
// unbacked trust claim ("Most popular") reach a buyer — the §13 class. `null` clears the badge.
// Admin-only, and it rides the blanket /api/admin adminApiGuard (§2) as well as this explicit
// role check, matching the sibling ready-made handlers.
router.patch("/api/admin/ready-made/:id/badge", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const raw = (req.body ?? {}).badge;
    const badge = raw === null || raw === undefined || raw === "" ? null : raw;
    if (badge !== null && !isReadyMadeBadge(badge)) {
      return res.status(400).json({
        message: "Unknown badge",
        allowed: READY_MADE_BADGE_VALUES,
      });
    }
    // Only an APPROVED listing can carry a badge — badging a draft/submitted build would
    // put an editorial claim on something the store has not accepted yet (D1a in spirit).
    const [updated] = await db
      .update(readyMadeTrips)
      .set({ badge, updatedAt: new Date() } as any)
      .where(and(eq(readyMadeTrips.id, req.params.id), eq(readyMadeTrips.status, "approved")))
      .returning();
    if (!updated) {
      return res.status(409).json({ message: "Listing is not approved" });
    }
    res.json({ success: true, listing: updated });
  } catch (err: any) {
    console.error("Admin ready-made badge error:", err);
    res.status(500).json({ message: "Failed to update badge" });
  }
});

// POST /api/admin/ready-made/:id/reject — reason required (the author sees it verbatim).
router.post("/api/admin/ready-made/:id/reject", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) return res.status(400).json({ message: "A rejection reason is required" });

    const [updated] = await db
      .update(readyMadeTrips)
      .set({
        status: "rejected",
        rejectionReason: reason.slice(0, 2000),
        reviewedAt: new Date(),
        reviewedBy: user.id,
        updatedAt: new Date(),
      } as any)
      .where(and(eq(readyMadeTrips.id, req.params.id), eq(readyMadeTrips.status, "submitted")))
      .returning();
    if (!updated) {
      return res.status(409).json({ message: "Listing is not awaiting review" });
    }
    await insertAccessAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "ready_made_reject",
      resourceType: "ready_made_trip",
      resourceId: req.params.id,
      metadata: { reason: reason.slice(0, 2000) },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[admin/ready-made] audit log failed (non-fatal):", err));
    res.json({ success: true, listing: updated });
  } catch (err: any) {
    console.error("Admin ready-made reject error:", err);
    res.status(500).json({ message: "Failed to reject listing" });
  }
});

// Escrow Phase 3 (docs/design/escrow-spine.md): admin REJECTS a service-booking dispute (the
// traveler's claim is not upheld) — clear the dispute flag so the earnings resume normal release,
// and restore the booking to completed. Upholding a dispute (reversing the earning + refunding the
// traveler) is the Phase-4 /uphold endpoint below. Operates on service_bookings + the linked
// earnings — the GET /api/admin/disputes list above now reads service_bookings too, so the queue
// and both actions operate on the same rows.
router.post("/api/admin/disputes/:bookingId/reject", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const { bookingId } = req.params;
    const cleared = await storage.setBookingEarningsDispute(bookingId, false);
    await storage.updateServiceBookingStatus(bookingId, "completed");
    let auditWarning: string | undefined;
    await insertAccessAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "dispute_rejected",
      resourceType: "dispute",
      resourceId: bookingId,
      metadata: { reason: String(req.body?.reason ?? "").slice(0, 2000) || null, clearedEarnings: cleared },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => {
      console.error("[admin/disputes] audit log failed (non-fatal):", err);
      auditWarning = `Audit log write failed for dispute_rejected on booking ${bookingId}: ${err?.message ?? "unknown error"}. Status change was applied but this action has no audit trail.`;
    });
    res.json({
      success: true,
      cleared,
      note: "Dispute rejected; earnings resume release.",
      ...(auditWarning ? { auditWarning } : {}),
    });
  } catch (err: any) {
    console.error("Admin dispute reject error:", err);
    res.status(500).json({ message: "Failed to reject dispute" });
  }
});

// Escrow Phase 4 (docs/design/escrow-spine.md): admin UPHOLDS a service-booking dispute (the
// traveler's claim IS valid). This is the reversal terminal: (1) reverse the in-escrow earnings
// (held/releasable → 'reversed'; paid_out is NOT auto-clawed-back — surfaced as skippedPaidOut for
// manual handling), (2) reverse the recognised platform revenue (compensating negative entry), and
// (3) refund the traveler via Stripe against the service booking's own payment intent. Ledger
// reversal runs FIRST (internal, idempotent) then the Stripe refund (idempotency-keyed) — so a
// retry after a Stripe failure re-runs cleanly without double-reversing or double-refunding. Amount
// is server-derived from the booking; the acting user is the admin session (§14/§15).
router.post("/api/admin/disputes/:bookingId/uphold", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const { bookingId } = req.params;
    const { reason } = req.body ?? {};

    // 1+2: reverse the ledger (idempotent atomic flips). Runs before the external refund so a
    // Stripe failure leaves a fully-reversed ledger that a retry simply re-confirms (no-ops).
    const earnings = await storage.reverseEarningsForBooking(bookingId);
    const revenueRows = await storage.reversePlatformRevenueForBooking(bookingId);

    // 3: refund the traveler (idempotency-keyed; also sets service_bookings.status='refunded').
    // `reason` here is an INTERNAL/free-text reason (it originates as the traveler's own dispute
    // text) and is stored verbatim in the `refunds.reason` audit column. refundServiceBooking maps
    // it to Stripe's 3-value refund-reason enum before the API call — it used to forward it
    // unmapped, which 400'd at Stripe AFTER the ledger reversal above had already run.
    const refund = await stripePaymentService.refundServiceBooking(bookingId, reason || "dispute_upheld");

    // 4: Lane 1 W4 — the ROUTING reversal edge (ROUTING_STATE_CONTRACT §1: the refund path is its
    // SOLE writer; this is the second of its two callers, sharing ONE helper rather than a second
    // copy). Returns the refunded item to `in_planning` so the Trip Card stops showing it as
    // bought. After the refund, atomic, idempotent, never throws.
    const routingReversal = await revertPurchasedItemsForBooking(bookingId);

    let auditWarning: string | undefined;
    await insertAccessAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "dispute_refunded",
      resourceType: "dispute",
      resourceId: bookingId,
      metadata: {
        reason: String(reason ?? "").slice(0, 2000) || "dispute_upheld",
        reversedEarnings: earnings.reversed,
        skippedPaidOut: earnings.skippedPaidOut,
        reversedRevenueRows: revenueRows,
        revertedPlanItems: routingReversal.reverted,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => {
      console.error("[admin/disputes] audit log failed (non-fatal):", err);
      auditWarning = `Audit log write failed for dispute_refunded on booking ${bookingId}: ${err?.message ?? "unknown error"}. Ledger reversal and Stripe refund were applied but this action has no audit trail.`;
    });

    res.json({
      success: true,
      revertedPlanItems: routingReversal.reverted,
      reversedEarnings: earnings.reversed,
      skippedPaidOut: earnings.skippedPaidOut,
      reversedRevenueRows: revenueRows,
      refund,
      note: earnings.skippedPaidOut > 0
        ? `${earnings.skippedPaidOut} earning(s) were already paid out and were NOT auto-reversed — a post-payout clawback must be handled manually.`
        : "Dispute upheld: earnings reversed, platform revenue reversed, traveler refunded.",
      ...(auditWarning ? { auditWarning } : {}),
    });
  } catch (err: any) {
    console.error("Admin dispute uphold error:", err);
    res.status(500).json({ message: `Failed to uphold dispute: ${err.message}` });
  }
});

/**
 * GET /api/admin/reconciliation/run-now
 * Triggers Stripe reconciliation immediately and returns the result.
 * Useful for on-demand checks without waiting for the daily schedule.
 */
router.get("/api/admin/reconciliation/run-now", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const { runStripeReconciliation } = await import("../jobs/stripeReconciliation");
    const result = await runStripeReconciliation({ triggeredBy: "manual" });
    res.json({
      ...result,
      note: result.status === "skipped"
        ? "Skipped — STRIPE_SECRET_KEY is not set, so nothing was compared. The run is recorded as skipped."
        : result.exceptions.length > 0
          ? `${result.exceptions.length} drift exception(s) detected (${result.newExceptions} newly recorded). ` +
            "They are persisted — see the Drift exceptions panel below. Cross-check each in the Stripe dashboard."
          : "Clean — every Stripe charge, PaymentIntent and refund in the window aligns with the database.",
    });
  } catch (err: any) {
    console.error("Reconciliation run-now error:", err);
    res.status(500).json({ message: "Failed to run reconciliation", error: err.message });
  }
});

/**
 * GET /api/admin/reconciliation/exceptions
 *
 * THE PERSISTED DRIFT SURFACE (reconciliation-detection lane, ruling 40). The daily job scans
 * BOTH rails — cart checkout (`service_bookings`) and the still-live legacy `bookings` — and
 * writes one APPEND-ONLY row per distinct drift fact. Log lines are not a surface: a drift found
 * at 03:00 has to still be readable at 09:00 without grepping a container.
 *
 * SIBLING, NOT REPLACEMENT, of GET /api/admin/bookings/reconciliation-exceptions (ruling 39):
 * that one shows exceptions a PAYMENT SIGNAL recorded on a booking row it could not promote — it
 * can only ever describe a row that exists. This one is the SCAN's output and can describe money
 * with no row behind it at all. Both are listed on /admin/reconciliation.
 *
 * EVERY ROW HERE NEEDS A HUMAN. This job never repairs (its one narrow exception, a
 * PI-succeeded/still-provisional claim, goes through the existing shared promotion and therefore
 * does not appear here unless that promotion failed).
 *
 * Query: ?limit= (default 100, max 500) · ?kind= · ?rail=cart|legacy · ?since=<ISO>
 */
router.get("/api/admin/reconciliation/exceptions", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1), 500);
    const kind = typeof req.query.kind === "string" && req.query.kind ? req.query.kind : null;
    const rail = req.query.rail === "cart" || req.query.rail === "legacy" ? req.query.rail : null;
    const since = typeof req.query.since === "string" && req.query.since ? new Date(req.query.since) : null;

    const result = await db.execute(sql`
      SELECT id, run_id, detected_at, rail, kind, severity, booking_id, payment_intent_id,
             charge_id, expected_amount, actual_amount, currency, details
      FROM reconciliation_exceptions
      WHERE TRUE
        ${kind ? sql`AND kind = ${kind}` : sql``}
        ${rail ? sql`AND rail = ${rail}` : sql``}
        ${since && !isNaN(since.getTime()) ? sql`AND detected_at >= ${since.toISOString()}` : sql``}
      ORDER BY detected_at DESC
      LIMIT ${limit}
    `);

    // The LAST RUN is part of the answer, not a separate question: an empty list means "clean"
    // only if a run actually happened. Without this, a dead scheduler renders identically to a
    // healthy platform — the exact failure this lane exists to close.
    const lastRun = await db.execute(sql`
      SELECT id, started_at, finished_at, triggered_by, status, window_start,
             scanned_payment_intents, scanned_charges, scanned_refunds,
             scanned_cart_bookings, scanned_legacy_bookings,
             exceptions_detected, exceptions_new, promoted, note
      FROM reconciliation_runs
      ORDER BY started_at DESC
      LIMIT 1
    `);

    res.json({
      exceptions: result.rows,
      count: result.rows.length,
      lastRun: lastRun.rows[0] ?? null,
      note:
        "Drift between Stripe and the database, detected by the daily scan across BOTH booking rails. " +
        "Append-only: a drift that persists is ONE row stamped with the run that first saw it. " +
        "Nothing here has been auto-repaired — check each paymentIntentId in Stripe before acting.",
    });
  } catch (err: any) {
    console.error("Reconciliation exceptions list error:", err);
    res.status(500).json({ message: "Failed to fetch reconciliation exceptions", error: err.message });
  }
});

/**
 * GET /api/admin/reconciliation/runs
 *
 * The run log. A clean pass is RECORDED, so "no exceptions" and "the job has not run since the
 * deploy three weeks ago" are distinguishable — which they were not before this lane.
 */
router.get("/api/admin/reconciliation/runs", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "30"), 10) || 30, 1), 200);
    const result = await db.execute(sql`
      SELECT id, started_at, finished_at, triggered_by, status, window_start,
             scanned_payment_intents, scanned_charges, scanned_refunds,
             scanned_cart_bookings, scanned_legacy_bookings,
             exceptions_detected, exceptions_new, promoted, note
      FROM reconciliation_runs
      ORDER BY started_at DESC
      LIMIT ${limit}
    `);
    res.json({ runs: result.rows, count: result.rows.length });
  } catch (err: any) {
    console.error("Reconciliation runs list error:", err);
    res.status(500).json({ message: "Failed to fetch reconciliation runs", error: err.message });
  }
});

/**
 * GET /api/admin/bookings/auto-cancel/config
 * Returns the current auto-cancel scheduler configuration.
 */
router.get("/api/admin/bookings/auto-cancel/config", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  res.json({
    config: bookingExpiryScheduler.getConfig(),
    lastRun: bookingExpiryScheduler.getLastStats(),
    isRunning: bookingExpiryScheduler.isCurrentlyRunning(),
  });
});

/**
 * PATCH /api/admin/bookings/auto-cancel/config
 * Updates the staleness threshold (hours) used by the auto-cancel scheduler.
 */
router.patch("/api/admin/bookings/auto-cancel/config", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  const schema = z.object({ staleThresholdHours: z.number().min(1).max(720) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid config", errors: parsed.error.flatten() });
  }
  try {
    const updated = bookingExpiryScheduler.updateConfig(parsed.data);
    res.json({ config: updated });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * POST /api/admin/bookings/auto-cancel/run
 * Manually triggers the auto-cancel sweep immediately.
 */
router.post("/api/admin/bookings/auto-cancel/run", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  if (bookingExpiryScheduler.isCurrentlyRunning()) {
    return res.status(409).json({ message: "Auto-cancel sweep is already in progress" });
  }
  try {
    const stats = await bookingExpiryScheduler.triggerManualRun();
    res.json({ message: "Auto-cancel sweep completed", stats });
  } catch (err: any) {
    console.error("Manual auto-cancel sweep error:", err);
    res.status(500).json({ message: "Auto-cancel sweep failed", error: err.message });
  }
});

// ── DMO ingestion (D3, Kyoto-first, Tavily-only) ─────────────────────────────
// Readiness probe for the admin UI — tells the button whether a Tavily key is configured.
router.get("/api/admin/dmo/ingest-kyoto/status", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  res.json({
    ready: isDmoIngestReady(),
    reason: isDmoIngestReady() ? undefined : "TAVILY_API_KEY not set on this environment.",
  });
});

// Runs one Kyoto DMO enrichment pass on demand (Tavily search + extract). Enriched rows stay
// born-hidden (D1a); if no Tavily key, writes nothing and reports ready:false (§13, no fabrication).
router.post("/api/admin/dmo/ingest-kyoto", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const force = req.body?.force === true;
    const stats = await ingestKyotoHeritage({ force });
    if (!stats.ready) {
      return res.status(200).json({ message: stats.reason || "DMO ingestion not ready", stats });
    }
    res.json({ message: "Kyoto DMO ingestion complete", stats });
  } catch (err: any) {
    console.error("Kyoto DMO ingestion error:", err);
    res.status(500).json({ message: "DMO ingestion failed", error: err.message });
  }
});

// ── Content-gap tracker (#2) ─────────────────────────────────────────────────
// Tracks how much DMO content we hold per type vs. an editorial target, and drives the scraper's
// priorities. Read-only list, an analyze action, and a gap-fill ingestion action (all admin-gated).

// List the current Kyoto coverage picture (met + unmet) plus the open gap queue.
router.get("/api/admin/dmo/gaps", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const [analysis, openAlerts] = await Promise.all([
      analyzeKyotoContentGaps(),
      listOpenKyotoGaps(),
    ]);
    res.json({ ready: isDmoIngestReady(), analysis, openAlerts });
  } catch (err: any) {
    console.error("DMO gap list error:", err);
    res.status(500).json({ message: "Failed to load content gaps", error: err.message });
  }
});

// Recompute coverage and reconcile the gap alerts (idempotent).
router.post("/api/admin/dmo/analyze-gaps", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const analysis = await analyzeKyotoContentGaps();
    res.json({ message: "Content-gap analysis complete", analysis });
  } catch (err: any) {
    console.error("DMO gap analysis error:", err);
    res.status(500).json({ message: "Content-gap analysis failed", error: err.message });
  }
});

// Fill the thinnest categories from their gap alerts via Tavily discovery. New rows are born-hidden
// (D1a); no Tavily key ⇒ zero writes (§13, ready:false).
router.post("/api/admin/dmo/ingest-gaps", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const maxGaps = Number(req.body?.maxGaps) || undefined;
    const maxPerGap = Number(req.body?.maxPerGap) || undefined;
    const stats = await ingestKyotoContentGaps({ maxGaps, maxPerGap });
    if (!stats.ready) {
      return res.status(200).json({ message: stats.reason || "Gap-fill ingestion not ready", stats });
    }
    res.json({ message: "Kyoto gap-fill ingestion complete", stats });
  } catch (err: any) {
    console.error("DMO gap-fill error:", err);
    res.status(500).json({ message: "Gap-fill ingestion failed", error: err.message });
  }
});

// ── YouTube guide-video ingestion (social-source build, decision-maker ratified Aug 9 2026) ──────
// "Top 10 <city>" guide videos are the same content shape the Research Reader already extracts
// places from; see server/services/youtube-ingestion.service.ts for the full posture writeup.
// Rows land born-hidden (D1a) — the existing DMO intake queue/approve endpoints above admit them
// into the expert library exactly like any other dmo_raw_content row. Auth: this path is under
// /api/admin, so the blanket adminApiGuard (server/routes.ts, §2) is the real gate; the inline
// getFullAdminUser check below is belt-and-suspenders, matching every neighboring dmo endpoint's
// style — no extra middleware is added here.
const youtubeIngestBodySchema = z.object({
  market: z.string().trim().min(1).max(100),
  city: z.string().trim().min(1).max(100),
  query: z.string().trim().min(1).max(300).optional(),
  maxResults: z.number().int().min(1).max(15).optional(),
});

router.post("/api/admin/dmo/ingest-youtube", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  // Keyless check first and separate from body validation, so an unconfigured environment always
  // reports 503 regardless of what else is (or isn't) in the request body (§13 — honest keyless).
  if (!isYoutubeIngestReady()) {
    return res.status(503).json({ message: "YouTube ingestion not configured (YOUTUBE_API_KEY)" });
  }
  const parsed = youtubeIngestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
  }
  try {
    const stats = await ingestYoutubeGuides(parsed.data);
    if (!stats.ready) {
      // Not the keyless case (already handled above) — e.g. the youtube.com dmo_sources row isn't
      // registered yet. Mirrors the neighboring ingest-kyoto/ingest-gaps endpoints' 200-with-reason
      // shape for this class of "ready:false but not a config error" outcome.
      return res.status(200).json({ message: stats.reason || "YouTube ingestion not ready", stats });
    }
    res.json({ message: "YouTube guide ingestion complete", stats });
  } catch (err: any) {
    console.error("YouTube DMO ingestion error:", err);
    res.status(500).json({ message: "YouTube ingestion failed", error: err.message });
  }
});

// Read-model for the admin "Content Ops" page's YouTube ingestion card (mockup §09, decision-maker
// ratified Aug 10 2026): configuration readiness + the most recent dmo_extraction_runs row (kind
// "youtube_ingest"). Absent = "no runs yet", never fabricated (§13).
router.get("/api/admin/dmo/ingest-youtube/last-run", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const lastRun = await getLatestDmoExtractionRun("youtube_ingest");
    res.json({ ready: isYoutubeIngestReady(), lastRun });
  } catch (err: any) {
    console.error("GET /api/admin/dmo/ingest-youtube/last-run error:", err);
    res.status(500).json({ message: "Failed to load last run", error: err.message });
  }
});

// ── Content Ops: extraction & enrichment status (mockup §09, decision-maker ratified Aug 10
// 2026) ──────────────────────────────────────────────────────────────────────────────────────
// Per-guide place-extraction + enrichment counts, for every expert-workspace-visible guide-shaped
// dmo_raw_content row (classifyDmoShape — same rule the warmup sweep and admin-approve hook use),
// plus the latest warmup-sweep run row. Every count is a real query result; a guide with zero
// extracted places is reported honestly as "not yet extracted" or, when the pipeline itself ran a
// live fetch and concluded there was nothing to find, "concluded empty" (isConcludedEmptyMarker)
// — never guessed at, never labeled "failed" without a persisted signal that says so (§13).
router.get("/api/admin/dmo/extraction-status", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const rows = await db
      .select({
        id: dmoRawContent.id,
        name: dmoRawContent.name,
        city: dmoRawContent.city,
        latitude: dmoRawContent.latitude,
        longitude: dmoRawContent.longitude,
        address: dmoRawContent.address,
        description: dmoRawContent.description,
        extractedData: dmoRawContent.extractedData,
        sourceId: dmoRawContent.sourceId,
      })
      .from(dmoRawContent)
      .where(and(eq(dmoRawContent.expertWorkspaceVisible, true), ne(dmoRawContent.status, "rejected")))
      .orderBy(desc(dmoRawContent.createdAt))
      .limit(100);

    const guideRows = rows.filter((r) => classifyDmoShape(r) === "guide");
    const guideIds = guideRows.map((r) => r.id);

    const placeCounts = await getExtractedPlacesCounts(guideIds);

    // Enriched-place counts per content id (enrichment IS NOT NULL) — mirrors
    // getExtractedPlacesCounts' shape but with the enrichment predicate added.
    const enrichedRows = guideIds.length > 0
      ? await db
          .select({ dmoContentId: dmoExtractedPlaces.dmoContentId, cnt: count() })
          .from(dmoExtractedPlaces)
          .where(and(inArray(dmoExtractedPlaces.dmoContentId, guideIds), isNotNull(dmoExtractedPlaces.enrichment)))
          .groupBy(dmoExtractedPlaces.dmoContentId)
      : [];
    const enrichedCounts = new Map(enrichedRows.map((r) => [r.dmoContentId, Number(r.cnt)]));

    // Source domain lookup — one query for every distinct sourceId referenced.
    const sourceIds = Array.from(new Set(guideRows.map((r) => r.sourceId)));
    const sourceRows = sourceIds.length > 0
      ? await db.select({ id: dmoSources.id, domain: dmoSources.domain }).from(dmoSources).where(inArray(dmoSources.id, sourceIds))
      : [];
    const domainById = new Map(sourceRows.map((r) => [r.id, r.domain]));

    const guides = guideRows.map((r) => {
      const placeCount = placeCounts.get(r.id) ?? 0;
      const enrichedCount = enrichedCounts.get(r.id) ?? 0;
      const state: "extracted" | "concluded_empty" | "not_extracted" =
        placeCount > 0 ? "extracted" : isConcludedEmptyMarker(r.extractedData) ? "concluded_empty" : "not_extracted";
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        sourceDomain: domainById.get(r.sourceId) ?? null,
        placeCount,
        enrichedCount,
        state,
      };
    });

    const latestWarmupRun = await getLatestDmoExtractionRun("warmup_sweep");

    res.json({ guides, latestWarmupRun });
  } catch (err: any) {
    console.error("GET /api/admin/dmo/extraction-status error:", err);
    res.status(500).json({ message: "Failed to load extraction status", error: err.message });
  }
});

// ── Optimizer gap-fill ledger (OPTIMIZER_SOURCING_BUILD_SPEC WP-B) ──────────────
// Real-time, market-agnostic sibling of the Kyoto-only content-gap tracker above: every time the
// optimizer/Apply flow could not place a platform (provider_services) match, one row lands in
// `optimizer_gap_fills` (append-only). This is a read-only summary so the decision-maker sees
// exactly what supply to recruit (city × category, counts + a 7-day trend). Admin-gated.

router.get("/api/admin/optimizer/gap-fills", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const [rows, sourceTotals] = await Promise.all([
      getGapFillSummary(),
      getGapFillSourceTotals(),
    ]);
    res.json({ rows, sourceTotals });
  } catch (err: any) {
    console.error("Optimizer gap-fill summary error:", err);
    res.status(500).json({ message: "Failed to load optimizer gap fills", error: err.message });
  }
});

// ── Provider health registry ──────────────────────────────────────────────────
// In-memory, process-lifetime-only view of every /api/catalog/* source's last outcome — closes the
// "silent 0 results" theme from the Aug 2026 live probe (Kiwi 401, Tiqets 404, Amadeus/GetTransfer DNS
// failures, SerpAPI 429, Google Places REQUEST_DENIED, etc. all degraded to an indistinguishable empty
// array before this). See server/services/provider-health.service.ts.

router.get("/api/admin/provider-health", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    res.json({ providers: getProviderHealth() });
  } catch (err: any) {
    console.error("Provider health error:", err);
    res.status(500).json({ message: "Failed to load provider health", error: err.message });
  }
});

// ── Integration configuration status ─────────────────────────────────────────
// Real "is this integration configured" checks for the Platform Providers admin page — secret
// PRESENCE only (never values). Previously the page inferred "Connected" from usage/revenue data
// provenance, which showed Fever as connected regardless of credentials and omitted Resend entirely.
// Each check mirrors the exact env gate the corresponding service performs (cited inline).
router.get("/api/admin/integration-status", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const env = process.env;
    const providers: Record<string, { configured: boolean }> = {
      // server/services/ai/* — Anthropic client gate
      anthropic: { configured: !!env.ANTHROPIC_API_KEY },
      // Grok client gate
      xai: { configured: !!env.XAI_API_KEY },
      // server/services/viator.service.ts: `!!VIATOR_API_KEY`
      viator: { configured: !!env.VIATOR_API_KEY },
      // server/services/booking-com.service.ts: `!!AFFILIATE_ID`
      booking: { configured: !!env.BOOKING_COM_AFFILIATE_ID },
      // 12Go rides via the Travelpayouts network token
      "12go": { configured: !!env.TRAVELPAYOUTS_TOKEN },
      // server/services/google-places-photos.service.ts + client maps
      googlemaps: { configured: !!env.GOOGLE_MAPS_API_KEY },
      // server/services/serp.service.ts
      serpapi: { configured: !!env.SERP_API_KEY },
      // server/services/fever.service.ts: `!!(accountSid && authToken)`
      fever: { configured: !!(env.IMPACT_ACCOUNT_SID && env.IMPACT_AUTH_TOKEN) },
      // server/services/email.service.ts: requires the Resend key plus a from-address
      resend: { configured: !!(env.RESEND_API_KEY && (env.EMAIL_FROM_NOREPLY || env.EMAIL_FROM)) },
      // Decommissioned (DECISIONS.md ruling 34, 2026-08-05) — never configured regardless of env.
      amadeus: { configured: false },
    };
    res.json({ providers });
  } catch (err: any) {
    console.error("Integration status error:", err);
    res.status(500).json({ message: "Failed to load integration status", error: err.message });
  }
});

// ── DMO intake approval queue ("B") ──────────────────────────────────────────
// Scraped/DMO content is born hidden from experts (expert_workspace_visible=false). An admin must
// approve raw content INTO the expert library before an expert can curate it or build trips from it.
// This is the intake gate: admin pre-filters what enters the library, distinct from the §10 template
// approval that gates the finished product. Kyoto-scoped (§12).

// List content awaiting admin intake — not yet expert-visible, not rejected/quarantined.
router.get("/api/admin/dmo/intake", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const city = typeof req.query.city === "string" && req.query.city ? req.query.city : "Kyoto";
    const items = await db
      .select()
      .from(dmoRawContent)
      .where(
        and(
          ilike(dmoRawContent.city, city),
          eq(dmoRawContent.expertWorkspaceVisible, false),
          sql`${dmoRawContent.status} NOT IN ('rejected', 'quarantined')`,
        ),
      )
      .orderBy(dmoRawContent.contentType, dmoRawContent.name)
      .limit(200);
    res.json({ city, count: items.length, items });
  } catch (err: any) {
    console.error("DMO intake list error:", err);
    res.status(500).json({ message: "Failed to load DMO intake queue", error: err.message });
  }
});

// Approve raw content INTO the expert library (flip expert_workspace_visible true). Idempotent:
// only transitions rows that are still hidden and not rejected.
router.post("/api/admin/dmo/intake/:id/approve", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const [updated] = await db
      .update(dmoRawContent)
      .set({ expertWorkspaceVisible: true, updatedAt: new Date() })
      .where(
        and(
          eq(dmoRawContent.id, req.params.id),
          eq(dmoRawContent.expertWorkspaceVisible, false),
          sql`${dmoRawContent.status} NOT IN ('rejected', 'quarantined')`,
        ),
      )
      .returning();
    if (!updated) return res.status(409).json({ message: "Not pending intake (already approved or rejected)" });
    // Register the approved DMO row into the central content_registry as 'sourced' origin (approach A).
    // Best-effort — never blocks the intake approval. sourced content is expert-only (resolver-gated).
    try {
      const { registerDmoContentById } = await import("../services/dmo-registry-sync.service");
      await registerDmoContentById(updated.id);
    } catch { /* non-blocking */ }
    // Pre-extraction hook (decision-maker ratified, Aug 9 2026, part 1 of 3 — see
    // dmo-place-extraction.service.ts header): fire the place-extraction pipeline the moment a
    // guide-shaped row enters the expert library, so it's already pre-extracted before an expert
    // opens the Research Reader. FIRE-AND-FORGET — the approve response must never wait on an AI
    // call, and a failure here must never fail the approve. The service's own shape gate no-ops
    // for `place`-shaped rows at zero cost, so no classifyDmoShape check is duplicated here.
    void (async () => {
      const { runPlaceExtraction } = await import("../services/dmo-place-extraction.service");
      const outcome = await runPlaceExtraction(updated.id, { source: "admin_approve", actorId: user.id });
      console.log(`[dmo-intake-approve] pre-extraction hook finished for ${updated.id}: ${outcome.status}`);
    })().catch((err) =>
      console.error(`[dmo-intake-approve] pre-extraction hook failed for ${updated.id}:`, err),
    );
    res.json({ message: "Approved into the expert library", item: updated });
  } catch (err: any) {
    console.error("DMO intake approve error:", err);
    res.status(500).json({ message: "Approve failed", error: err.message });
  }
});

// Backfill: register ALL existing dmo_raw_content into the central registry as 'sourced' (idempotent).
router.post("/api/admin/dmo/sync-registry", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const { syncDmoContentToRegistry } = await import("../services/dmo-registry-sync.service");
    const result = await syncDmoContentToRegistry();
    res.json({ message: `Synced DMO content into the central registry`, ...result });
  } catch (err: any) {
    console.error("DMO registry sync error:", err);
    res.status(500).json({ message: "Sync failed", error: err.message });
  }
});

// §16 catalog unification (P7): ingest Travelpayouts network inventory into the central
// affiliate_products + content_registry. Key-gated (§13 — no token ⇒ ready:false, zero writes).
// Body: { city (required), network? } — one network or all. Kyoto-first (§12).
router.post("/api/admin/catalog/ingest", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  const city = typeof req.body?.city === "string" ? req.body.city.trim() : "";
  if (!city) return res.status(400).json({ message: "city is required" });
  const network = typeof req.body?.network === "string" ? req.body.network.trim() : "";
  try {
    const svc = await import("../services/catalog-ingest.service");
    const result = network
      ? [await svc.ingestNetwork(network, city)]
      : await svc.ingestAllNetworks(city);
    const ready = result.some(r => r.ready);
    res.json({
      message: ready ? `Ingested catalog inventory for ${city}` : "No Travelpayouts token — nothing ingested (§13 key-gate)",
      ready,
      city,
      results: result,
    });
  } catch (err: any) {
    console.error("Catalog ingest error:", err);
    res.status(500).json({ message: "Ingest failed", error: err.message });
  }
});

// Reject raw content at intake — it never enters the expert library. Stays hidden.
router.post("/api/admin/dmo/intake/:id/reject", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const [updated] = await db
      .update(dmoRawContent)
      .set({
        status: "rejected",
        expertWorkspaceVisible: false,
        discoverPageVisible: false,
        expertNotes: reason || null,
        updatedAt: new Date(),
      })
      .where(and(eq(dmoRawContent.id, req.params.id), eq(dmoRawContent.expertWorkspaceVisible, false)))
      .returning();
    if (!updated) return res.status(409).json({ message: "Not pending intake (already approved or rejected)" });
    res.json({ message: "Rejected at intake", item: updated });
  } catch (err: any) {
    console.error("DMO intake reject error:", err);
    res.status(500).json({ message: "Reject failed", error: err.message });
  }
});

router.get("/api/admin/revenue", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const allBookings = await storage.getServiceBookings({});
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.platformFee || "0"), 0);
      const totalGross = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
      res.json({
        totalRevenue,
        totalGross,
        totalBookings: allBookings.length,
        completedBookings: completedBookings.length,
      });
    } catch (err) {
      console.error("Admin revenue error:", err);
      res.status(500).json({ message: "Failed to fetch revenue" });
    }
  });

  // Admin: list contact submissions
router.get("/api/admin/contact-submissions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const adminUser = await getFullAdminUser(userId);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      const submissions = await getContactSubmissions(status, limit);

      res.json(submissions);
    } catch (err) {
      console.error("List contact submissions error:", err);
      res.status(500).json({ message: "Failed to load contact submissions" });
    }
  });

  // Admin: update contact submission status
router.patch("/api/admin/contact-submissions/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const adminUser = await getFullAdminUser(userId);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { status, responseNotes, assignedAdminId } = req.body;
      const updates: any = {};
      if (status) updates.status = status;
      if (status === "resolved") updates.resolvedAt = new Date();
      if (responseNotes !== undefined) updates.responseNotes = responseNotes;
      if (assignedAdminId !== undefined) updates.assignedAdminId = assignedAdminId;

      const updated = await updateContactSubmission(req.params.id, updates);

      if (!updated) return res.status(404).json({ message: "Submission not found" });
      res.json(updated);
    } catch (err) {
      console.error("Update contact submission error:", err);
      res.status(500).json({ message: "Failed to update contact submission" });
    }
  });

  // Admin: Get all expert applications

// GET /api/admin/experts/stripe-restricted
// Returns all experts whose Stripe Connect account is currently in 'restricted' status.
// Restricted experts are automatically excluded from lead routing but may still hold
// active assignments made before the restriction — admin must review and reassign.

router.get("/api/admin/experts/stripe-restricted", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const restricted = await db
        .select({
          expertFormId: localExpertForms.id,
          userId: localExpertForms.userId,
          firstName: localExpertForms.firstName,
          lastName: localExpertForms.lastName,
          email: localExpertForms.email,
          city: localExpertForms.city,
          stripeAccountId: localExpertForms.stripeAccountId,
          stripeConnectStatus: localExpertForms.stripeConnectStatus,
          status: localExpertForms.status,
          createdAt: localExpertForms.createdAt,
        })
        .from(localExpertForms)
        .where(eq(localExpertForms.stripeConnectStatus, "restricted"))
        .orderBy(desc(localExpertForms.createdAt));

      res.json({
        count: restricted.length,
        experts: restricted,
      });
    } catch (err) {
      console.error("Admin stripe-restricted experts error:", err);
      res.status(500).json({ message: "Failed to fetch restricted experts" });
    }
  });

router.get("/api/admin/expert-applications", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getLocalExpertForms(status);
    // EXP-OVR.P3: enrich each application with the expert's current commission
    // override so the admin UI can pre-populate the editor.
    const userIds = Array.from(new Set(forms.map(f => f.userId).filter(Boolean)));
    let overrideByUser = new Map<string, string | null>();
    if (userIds.length > 0) {
      const overrideRows = await getUserCommissionOverrides(userIds);
      overrideByUser = new Map(overrideRows.map(r => [r.id, r.override ?? null]));
    }
    const enriched = forms.map(f => ({
      ...f,
      commissionOverrideExpertSharePercent: overrideByUser.get(f.userId) ?? null,
    }));
    res.json(enriched);
  });

  // Admin: Update expert application status

router.patch("/api/admin/expert-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const [existing] = await db
      .select({ status: localExpertForms.status })
      .from(localExpertForms)
      .where(eq(localExpertForms.id, req.params.id));
    const priorStatus = existing?.status;
    const updated = await storage.updateLocalExpertFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // If approved, update user role based on expert type
    if (status === "approved") {
      // Use the expertType from the form, default to "expert" for backwards compatibility.
      // CLAMP to the known expert-type vocabulary (role-vocabulary audit): users.role must
      // never receive an arbitrary form string — legacy rows carry unvalidated values
      // (e.g. "service_provider"), and copying a crafted value like "admin" verbatim
      // would be privilege escalation. Unknown values fall back to "expert".
      const formExpertType = (updated as any).expertType;
      const role = (expertTypeEnum as readonly string[]).includes(formExpertType)
        ? formExpertType
        : "expert";
      await updateUserRole(updated.userId, role, {
        actorId: user.id,
        actorRole: user.role,
        reason: "admin_expert_application_approved",
      });

      // Notify the user to complete Stripe Connect setup
      await insertNotification({
        userId: updated.userId,
        type: "application_approved",
        title: "Application Approved! 🎉",
        message: "Congratulations! Your expert application has been approved. Complete your Stripe Connect setup to start receiving payouts.",
        data: { link: "/expert/money" }, // C8: Earnings module renamed Money (§17); old route redirects
      });

      // Send the applicant a congratulations email with a link to /expert/money
      const [approvedApplicant] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, updated.userId));
      if (approvedApplicant?.email) {
        try {
          const { sendExpertApplicationApprovalEmail } = await import("../services/email.service");
          sendExpertApplicationApprovalEmail({
            toEmail: approvedApplicant.email,
            firstName: approvedApplicant.firstName ?? null,
          });
        } catch (err) {
          console.error("[admin] Failed to send expert approval email (non-fatal):", err);
        }
      }
    }

    // If rejected, send the applicant an email with the rejection reason (if any).
    // Guard: only send when actually transitioning TO rejected — not on re-saves of the same status.
    if (status === "rejected" && priorStatus !== "rejected") {
      const [applicant] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, updated.userId));
      if (applicant?.email) {
        try {
          const { sendExpertApplicationRejectionEmail } = await import("../services/email.service");
          sendExpertApplicationRejectionEmail({
            toEmail: applicant.email,
            firstName: applicant.firstName ?? null,
            rejectionMessage: rejectionMessage ?? null,
          });
        } catch (err) {
          console.error("[admin] Failed to send expert rejection email (non-fatal):", err);
        }
      }
    }

    res.json(updated);
  });

  // Admin: Update rejection reason only (without changing status)
router.patch("/api/admin/expert-applications/:id/rejection-reason", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const schema = z.object({ rejectionMessage: z.string().trim().min(1, "rejectionMessage must be a non-empty string").max(2000, "rejectionMessage must be 2000 characters or fewer") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const { rejectionMessage } = parsed.data;
    const updated = await storage.updateLocalExpertFormRejectionMessage(req.params.id, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    await insertNotification({
      userId: updated.userId,
      type: "rejection_reason_updated",
      title: "Rejection Feedback Updated",
      message: "An admin has updated the feedback on your expert application. Review the new message to understand what you can improve before reapplying.",
      data: { link: "/expert-status" },
    });
    res.json(updated);
  });

  // ─── Per-expert commission override (EXP-OVR.P3) ──────────────────────────
  // Admin sets/clears the override that commission.ts:resolveCommissionRates
  // reads before falling back to category. Stored value is the expert-share
  // percent (e.g. 80 → expert keeps 80%, platform takes 20%).

router.patch("/api/admin/users/:id/verification", isAuthenticated, async (req, res) => {
  const admin = await getAdminRole(getUserId(req)!);
  if (!admin || admin.role !== "admin") return res.status(403).json({ message: "Admin access required" });

  const schema = z.object({
    providerVerificationStatus: z.enum(["pending", "verified", "rejected"]).optional(),
    backgroundCheckConfirmed: z.boolean().optional(),
    reason: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });

  const { reason, ...verificationUpdate } = parsed.data;

  // Capture the prior status + recipient BEFORE the update so we only email on an
  // ACTUAL decision change (re-saving an already-verified provider must not re-send).
  const [target] = await db
    .select({ email: users.email, firstName: users.firstName, priorStatus: users.providerVerificationStatus })
    .from(users)
    .where(eq(users.id, req.params.id));
  if (!target) return res.status(404).json({ message: "User not found" });

  await storage.updateProviderVerification(req.params.id, verificationUpdate);
  const updated = await getUserVerificationStatus(req.params.id);
  if (!updated) return res.status(404).json({ message: "User not found" });

  // Fire-and-forget email to the provider when a decision CHANGES to verified/rejected.
  const decision = verificationUpdate.providerVerificationStatus;
  if ((decision === "verified" || decision === "rejected") && decision !== target.priorStatus) {
    if (target.email) {
      try {
        const { sendVerificationDecisionEmail } = await import("../services/email.service");
        sendVerificationDecisionEmail({
          toEmail: target.email,
          firstName: target.firstName ?? null,
          decision,
          reason: reason ?? null,
        }).catch((e: any) => console.error("[email] verification-decision send error:", e?.message));
      } catch (mailErr: any) {
        console.error("[admin verification] email send error (non-fatal):", mailErr.message);
      }
    }
  }

  res.json(updated);
});

router.patch("/api/admin/users/:id/commission-override", isAuthenticated, async (req, res) => {
    const admin = await getFullAdminUser(getUserId(req)!);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const targetId = req.params.id;
    const raw = (req.body as any)?.commissionOverrideExpertSharePercent;
    let nextValue: string | null;
    if (raw === null || raw === undefined || raw === "") {
      nextValue = null;
    } else {
      const pct = Number(raw);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ message: "commissionOverrideExpertSharePercent must be a number in [0, 100] or null" });
      }
      nextValue = pct.toFixed(2);
    }
    const before = await getUserCommissionOverride(targetId);
    if (!before) {
      return res.status(404).json({ message: "User not found" });
    }
    await setUserCommissionOverride(targetId, nextValue);
    await insertAccessAuditLog({
      actorId: admin.id,
      actorRole: "admin",
      action: "update_commission_override",
      resourceType: "user",
      resourceId: targetId,
      targetUserId: targetId,
      metadata: { previous: before.prev ?? null, next: nextValue },
    });
    res.json({ id: targetId, commissionOverrideExpertSharePercent: nextValue });
  });

  // === Provider Application Routes ===
  
  // Get current user's provider application

router.get("/api/admin/provider-applications", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const status = req.query.status as string | undefined;
    const forms = await storage.getServiceProviderForms(status);
    res.json(forms);
  });

  // Admin: Get active platform service providers with their services

router.get("/api/admin/platform-service-providers", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Get approved provider forms
    const approvedForms = await getApprovedProviderForms();

    // For each provider, fetch their services and user info
    const enriched = await Promise.all(approvedForms.map(async (form: any) => {
      const providerUser = await getProviderUserInfo(form.userId);
      const services = await getProviderServicesForUser(form.userId);

      const totalBookings = services.reduce((s, sv) => s + (sv.bookingsCount ?? 0), 0);
      const totalRevenue = services.reduce((s, sv) => s + parseFloat(sv.totalRevenue ?? "0"), 0);
      const activeServices = services.filter(sv => sv.status === "active").length;

      return {
        ...form,
        user: providerUser ? { id: providerUser.id, name: [providerUser.firstName, providerUser.lastName].filter(Boolean).join(" "), email: providerUser.email, profileImageUrl: providerUser.profileImageUrl } : null,
        providerVerificationStatus: providerUser?.providerVerificationStatus ?? "pending",
        backgroundCheckConfirmed: providerUser?.backgroundCheckConfirmed ?? false,
        stripeAccountId: providerUser?.stripeAccountId ?? null,
        stripeAccountStatus: providerUser?.stripeAccountStatus ?? null,
        canReceivePayments: providerUser?.canReceivePayments ?? false,
        services, totalBookings, totalRevenue, activeServices,
      };
    }));

    res.json(enriched);
  });

  // Admin: Get count of providers missing Stripe Connect setup
router.get("/api/admin/providers/stripe-incomplete-count", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const approvedForms = await getApprovedProviderForms();
    let count = 0;
    for (const form of approvedForms) {
      const providerUser = await getProviderUserInfo(form.userId);
      if (!providerUser?.stripeAccountStatus || providerUser.stripeAccountStatus !== "complete") {
        count++;
      }
    }
    res.json({ count });
  });

  // Admin: Send a Stripe Connect reminder notification to a provider
router.post("/api/admin/providers/:userId/remind-stripe", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { userId } = req.params;
    await insertNotification({
      userId,
      type: "stripe_connect_reminder",
      title: "Complete Your Payout Setup",
      message: "An admin has sent you a reminder to complete your Stripe Connect setup so you can receive payouts. Visit your Money page to get started.",
      // C9: provider Earnings module renamed Money (§17) — /provider/earnings redirects here.
      data: { link: "/provider/money" },
    });
    res.json({ ok: true });
  });

  // Admin: Update provider application status

router.patch("/api/admin/provider-applications/:id/status", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { status, rejectionMessage } = req.body;
    const updated = await storage.updateServiceProviderFormStatus(req.params.id, status, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // If approved, update user role to service_provider
    if (status === "approved") {
      await updateUserRole(updated.userId, "service_provider", {
        actorId: user.id,
        actorRole: user.role,
        reason: "admin_provider_application_approved",
      });
      // Notify the user to complete Stripe Connect setup
      await insertNotification({
        userId: updated.userId,
        type: "application_approved",
        title: "Application Approved! 🎉",
        message: "Congratulations! Your provider application has been approved. Complete your Stripe Connect setup to start receiving payouts.",
        // C9: provider Earnings module renamed Money (§17) — /provider/earnings redirects here.
        data: { link: "/provider/money" },
      });
      // Send approval email (fire-and-forget)
      const providerUser = await storage.getUser(updated.userId);
      if (providerUser?.email) {
        const { sendProviderApplicationApprovalEmail } = await import("../services/email.service");
        sendProviderApplicationApprovalEmail({
          toEmail: providerUser.email,
          firstName: providerUser.firstName ?? null,
        });
      }
    }

    if (status === "rejected") {
      // Notify the user in-app
      await insertNotification({
        userId: updated.userId,
        type: "application_rejected",
        title: "Application Not Approved",
        message: rejectionMessage
          ? `Your provider application was not approved. Feedback: ${rejectionMessage}`
          : "Unfortunately, your provider application was not approved at this time. You can review the feedback and reapply when you're ready.",
        data: { link: "/provider-status", rejectionMessage: rejectionMessage ?? null },
      });
      // Send rejection email (fire-and-forget)
      const providerUser = await storage.getUser(updated.userId);
      if (providerUser?.email) {
        const { sendProviderApplicationRejectionEmail } = await import("../services/email.service");
        sendProviderApplicationRejectionEmail({
          toEmail: providerUser.email,
          firstName: providerUser.firstName ?? null,
          rejectionMessage: rejectionMessage ?? null,
        });
      }
    }
    
    res.json(updated);
  });

  // Admin: Update provider application rejection reason only (without changing status)
router.patch("/api/admin/provider-applications/:id/rejection-reason", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const schema = z.object({ rejectionMessage: z.string().trim().min(1, "rejectionMessage must be a non-empty string").max(2000, "rejectionMessage must be 2000 characters or fewer") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const { rejectionMessage } = parsed.data;
    const updated = await storage.updateServiceProviderFormRejectionMessage(req.params.id, rejectionMessage);
    if (!updated) {
      return res.status(404).json({ message: "Application not found" });
    }
    await insertNotification({
      userId: updated.userId,
      type: "rejection_reason_updated",
      title: "Rejection Feedback Updated",
      message: "An admin has updated the feedback on your provider application. Review the new message to understand what you can improve before reapplying.",
      data: { link: "/provider-status" },
    });
    // Send updated rejection feedback email (fire-and-forget)
    const providerUser = await storage.getUser(updated.userId);
    if (providerUser?.email) {
      const { sendProviderApplicationRejectionEmail } = await import("../services/email.service");
      sendProviderApplicationRejectionEmail({
        toEmail: providerUser.email,
        firstName: providerUser.firstName ?? null,
        rejectionMessage: rejectionMessage,
      });
    }
    res.json(updated);
  });

  // GET /api/expert/application-status — user-facing live step status for expert applicants

router.post("/api/admin/service-templates", isAuthenticated, async (req, res) => {
    try {
      const user = await getFullAdminUser(getUserId(req)!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { title, description, suggestedPrice, sortOrder } = req.body;
      if (!title) {
        return res.status(400).json({ message: "title is required" });
      }
      const categoryRow = await resolveOrCreateItineraryPlanningCategory();
      const esoRow = await createExpertServiceOfferingRow({
        categoryId:  categoryRow.id,
        name:        sanitizeText(title) as string,
        description: sanitizeText(description ?? null),
        price:       suggestedPrice ?? "0",
        isDefault:   true,
        sortOrder:   sortOrder ?? 0,
      });
      // Return ServiceTemplate-compatible shape so existing admin UIs don't break
      res.status(201).json({
        id:               esoRow.id,
        title:            esoRow.name,
        description:      esoRow.description,
        categoryId:       null,
        serviceType:      null,
        deliveryMethod:   null,
        deliveryTimeframe: null,
        suggestedPrice:   esoRow.price,
        requirements:     null,
        whatIncluded:     null,
        isActive:         esoRow.isDefault ?? true,
        sortOrder:        esoRow.sortOrder,
        createdAt:        esoRow.createdAt,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Update template (admin only)

router.patch("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await getFullAdminUser(getUserId(req)!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = sanitizeStringFields(insertServiceTemplateSchema.partial().parse(req.body));
      const updated = await storage.updateServiceTemplate(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Delete template (admin only - soft delete)

router.delete("/api/admin/service-templates/:id", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceTemplate(req.params.id);
    res.status(204).send();
  });

  // === Role-Scoped Expert Templates (ESO platform rows) ===

  // GET /api/admin/expert-templates
  // Returns all platform templates (expertId IS NULL) from expert_service_offerings.
  // Accepts optional ?role= filter to scope to a specific expert role.

router.get("/api/admin/expert-templates", isAuthenticated, async (req, res) => {
    try {
      const user = await getFullAdminUser(getUserId(req)!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const roleFilter = req.query.role as string | undefined;

      const rows = await getAllExpertServiceOfferings();

      // Apply role filter in JS (simpler than Postgres array operator for admin use)
      const filtered = roleFilter
        ? rows.filter((r) =>
            r.targetRoles == null ||
            (r.targetRoles as string[]).includes(roleFilter)
          )
        : rows;

      const templates = filtered.map((o) => ({
        id: o.id,
        title: o.name,
        description: o.description,
        price: o.price,
        sortOrder: o.sortOrder,
        createdAt: o.createdAt,
        targetRoles: (o.targetRoles as string[] | null) ?? [],
      }));

      res.json(templates);
    } catch (err) {
      console.error("Error fetching admin expert templates:", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // PATCH /api/admin/expert-templates/:id/roles
  // Update the targetRoles array on a platform template.
  // Pass { targetRoles: ["local_expert", "travel_expert"] } — empty array = all roles.

router.patch("/api/admin/expert-templates/:id/roles", isAuthenticated, async (req, res) => {
    try {
      const user = await getFullAdminUser(getUserId(req)!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { targetRoles } = req.body;
      if (!Array.isArray(targetRoles)) {
        return res.status(400).json({ message: "targetRoles must be an array" });
      }

      const VALID_ROLES = ["local_expert", "travel_expert", "event_planner", "executive_assistant"];
      const invalid = (targetRoles as string[]).filter((r) => !VALID_ROLES.includes(r));
      if (invalid.length > 0) {
        return res.status(400).json({ message: `Invalid roles: ${invalid.join(", ")}` });
      }

      const updated = await updateExpertServiceOfferingRoles(req.params.id, targetRoles.length > 0 ? targetRoles : null);

      if (!updated) {
        return res.status(404).json({ message: "Template not found" });
      }

      res.json({
        id: updated.id,
        title: updated.name,
        targetRoles: (updated.targetRoles as string[] | null) ?? [],
      });
    } catch (err) {
      console.error("Error updating expert template roles:", err);
      res.status(500).json({ message: "Failed to update template roles" });
    }
  });

  // === Admin Service Category Management ===

  // Get all categories with subcategories

router.get("/api/admin/categories", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const type = req.query.type as string | undefined;
    const categories = await storage.getServiceCategories(type);
    const subcategories = await storage.getAllServiceSubcategories();
    
    // Attach subcategories to each category
    const categoriesWithSubs = categories.map(cat => ({
      ...cat,
      subcategories: subcategories.filter(sub => sub.categoryId === cat.id)
    }));
    res.json(categoriesWithSubs);
  });

  // Get single category

router.get("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const category = await storage.getServiceCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    const subcategories = await storage.getServiceSubcategories(req.params.id);
    res.json({ ...category, subcategories });
  });

  // Create category (admin only)

router.post("/api/admin/categories", isAuthenticated, async (req, res) => {
    try {
      const user = await getFullAdminUser(getUserId(req)!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.parse(req.body);

      // ── R2 (fee-ledger lane): a category may NEVER be created without a commission band ──────
      // Layer 1 of the two-layer guard (ruling 35); layer 2 is the NOT NULL added by migration 180.
      // The resolver is fail-loud by design (no silent fallback rate, ever — D0/R2), so a bandless
      // category is not a degraded state, it is a category whose bookings throw at checkout.
      if (!input.commissionBandKey) {
        return res.status(400).json({
          error: "category_requires_commission_band",
          message:
            "commission_band_key is required: a category cannot exist without a commission band (R2). " +
            "Pick one of the provider bands (limited | moderate | commercial | premium).",
        });
      }
      const createBandRow = await validateCommissionBand(input.commissionBandKey);
      if (!createBandRow) {
        return res.status(400).json({
          error: "commission_band_not_found",
          message: `commission_band_key='${input.commissionBandKey}' does not match any fee_bands row.`,
        });
      }
      if (!createBandRow.is_active) {
        return res.status(400).json({
          error: "commission_band_inactive",
          message: `commission_band_key='${input.commissionBandKey}' is inactive in fee_bands.`,
        });
      }

      const category = await storage.createServiceCategory(input);
      res.status(201).json(category);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  // Update category (admin only)
  // Phase 8.2: includes footgun validation for the billing-aware fields
  // (commission_band_key, insurance_band, risk_profile, etc.). A category
  // cannot be saved with a commission_band_key that doesn't reference an
  // active percent band; an explicit NULL is permitted only when the
  // platform-wide default_commission_band_key inheritance fallback is itself
  // a valid active band. Edits are audit-logged.

router.patch("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await getFullAdminUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceCategorySchema.partial().parse(req.body);

      // ── Phase 8.2 footgun validation ────────────────────────────────────
      if ("commissionBandKey" in input) {
        const newBandKey = input.commissionBandKey;
        if (newBandKey === null || newBandKey === "" || newBandKey === undefined) {
          // ── R2 (fee-ledger lane): clearing the band is no longer a legal operation ───────────
          // This branch previously permitted "explicit inheritance" — clearing the column and
          // letting platform_settings.default_commission_band_key stand in. R2 ends that: a
          // category must never exist without a band, and migration 180 backs it with NOT NULL, so
          // a clear would now fail at the DB anyway. Rejecting here turns a 500 into a typed 400
          // and states the rule. (The inheritance HELPER stays for the settings surface that reads
          // the default; it is only this write path that may no longer produce a bandless row.)
          return res.status(400).json({
            error: "category_requires_commission_band",
            message:
              "commission_band_key cannot be cleared: a category cannot exist without a commission " +
              "band (R2). Pick an explicit band (limited | moderate | commercial | premium) instead " +
              "of inheriting a platform default.",
          });
        } else {
          // Explicit band — validate it exists, is active, rate_type='percent'.
          const bandRow = await validateCommissionBand(newBandKey);
          if (!bandRow) {
            return res.status(400).json({
              error: "commission_band_not_found",
              message: `commission_band_key='${newBandKey}' does not match any fee_bands row.`,
            });
          }
          if (!bandRow.is_active) {
            return res.status(400).json({
              error: "commission_band_inactive",
              message: `Band '${newBandKey}' exists but is inactive — activate it before pinning a category to it.`,
            });
          }
          if (bandRow.rate_type !== "percent") {
            return res.status(400).json({
              error: "commission_band_wrong_type",
              message: `Band '${newBandKey}' is rate_type='${bandRow.rate_type}', expected 'percent' for a commission band.`,
            });
          }
        }
      }

      if ("insuranceBand" in input && input.insuranceBand !== null && input.insuranceBand !== undefined) {
        const ib = Number(input.insuranceBand);
        if (!Number.isInteger(ib) || ib < 1 || ib > 4) {
          return res.status(400).json({
            error: "invalid_insurance_band",
            message: "insurance_band must be 1, 2, 3, or 4 (Premium escalation per §5.2).",
          });
        }
      }

      if ("riskProfile" in input && input.riskProfile !== null && input.riskProfile !== undefined) {
        if (!["low", "moderate", "high"].includes(String(input.riskProfile))) {
          return res.status(400).json({
            error: "invalid_risk_profile",
            message: "risk_profile must be 'low' | 'moderate' | 'high'.",
          });
        }
      }

      // ── Snapshot before for audit ────────────────────────────────────────
      const before = await storage.getServiceCategoryById(req.params.id);
      const updated = await storage.updateServiceCategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Audit-log changes to billing-aware fields.
      const billingFields = [
        "commissionBandKey", "insuranceBand", "riskProfile", "requiresBackgroundCheck",
        "sourceType", "launchTier", "affiliatePartnerKey", "categoryKey",
      ] as const;
      const changedBilling = before
        ? billingFields.filter(f => (input as any)[f] !== undefined && (before as any)[f] !== (input as any)[f])
        : [];
      if (changedBilling.length > 0) {
        await insertAccessAuditLog({
          actorId: userId,
          actorRole: user.role,
          action: "service_category_billing_update",
          resourceType: "service_category",
          resourceId: req.params.id,
          metadata: {
            changed: changedBilling,
            before: Object.fromEntries(changedBilling.map(f => [f, (before as any)?.[f] ?? null])),
            after: Object.fromEntries(changedBilling.map(f => [f, (input as any)[f] ?? null])),
          },
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        }).catch((err: any) => console.error("[service-category] audit log failed (non-fatal):", err));
      }

      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  // Delete category (admin only)

router.delete("/api/admin/categories/:id", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceCategory(req.params.id);
    res.status(204).send();
  });

  // Create subcategory (admin only)

router.post("/api/admin/categories/:categoryId/subcategories", isAuthenticated, async (req, res) => {
    try {
      const user = await getFullAdminUser(getUserId(req)!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const category = await storage.getServiceCategoryById(req.params.categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
      const input = insertServiceSubcategorySchema.parse({ ...req.body, categoryId: req.params.categoryId });
      const subcategory = await storage.createServiceSubcategory(input);
      res.status(201).json(subcategory);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create subcategory" });
    }
  });

  // Update subcategory (admin only)

router.patch("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    try {
      const user = await getFullAdminUser(getUserId(req)!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const input = insertServiceSubcategorySchema.partial().parse(req.body);
      const updated = await storage.updateServiceSubcategory(req.params.id, input);
      if (!updated) {
        return res.status(404).json({ message: "Subcategory not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update subcategory" });
    }
  });

  // Delete subcategory (admin only)

router.delete("/api/admin/subcategories/:id", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await storage.deleteServiceSubcategory(req.params.id);
    res.status(204).send();
  });

  // Seed 15 core categories (admin only - run once)

router.post("/api/admin/seed-categories", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const coreCategories = [
      { name: "Photography & Videography", slug: "photography-videography", description: "Portrait, event, engagement, family, architectural photography and travel videos, drone footage", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["portfolio", "insurance"], priceRange: { min: 150, max: 1000 }, sortOrder: 1 , commissionBandKey: "limited" },
      { name: "Transportation & Logistics", slug: "transportation-logistics", description: "Private drivers, airport transfers, day trips, specialty transport", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance", "vehicle_registration"], priceRange: { min: 50, max: 800 }, sortOrder: 2 , commissionBandKey: "commercial" },
      { name: "Food & Culinary", slug: "food-culinary", description: "Private chefs, cooking lessons, meal prep, sommelier services, food tours", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["culinary_credentials", "food_handler_license"], priceRange: { min: 100, max: 600 }, sortOrder: 3 , commissionBandKey: "moderate" },
      { name: "Childcare & Family", slug: "childcare-family", description: "Babysitters, nannies, kids activity coordinators, family assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "cpr_certification", "references"], priceRange: { min: 20, max: 150 }, sortOrder: 4 , commissionBandKey: "moderate" },
      { name: "Tours & Experiences", slug: "tours-experiences", description: "Tour guides, walking tours, museum tours, adventure guides, cultural experiences", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["tour_guide_license", "insurance"], priceRange: { min: 100, max: 500 }, sortOrder: 5 , commissionBandKey: "limited" },
      { name: "Personal Assistance", slug: "personal-assistance", description: "Travel companions, personal concierge, executive assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "references", "first_aid"], priceRange: { min: 100, max: 300 }, sortOrder: 6 , commissionBandKey: "limited" },
      { name: "TaskRabbit Services", slug: "taskrabbit-services", description: "Handyman, delivery, cleaning, property management", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 30, max: 200 }, sortOrder: 7 , commissionBandKey: "moderate" },
      { name: "Health & Wellness", slug: "health-wellness", description: "Fitness instructors, massage therapists, yoga teachers, wellness coaches", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["certification", "insurance"], priceRange: { min: 50, max: 200 }, sortOrder: 8 , commissionBandKey: "moderate" },
      { name: "Beauty & Styling", slug: "beauty-styling", description: "Hair stylists, makeup artists, personal stylists", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 75, max: 300 }, sortOrder: 9 , commissionBandKey: "limited" },
      { name: "Pets & Animals", slug: "pets-animals", description: "Pet sitters, dog walkers, animal experience guides", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["references"], priceRange: { min: 25, max: 100 }, sortOrder: 10 , commissionBandKey: "moderate" },
      { name: "Events & Celebrations", slug: "events-celebrations", description: "Event coordinators, florists, bakers, party planners", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 1500 }, sortOrder: 11 , commissionBandKey: "moderate" },
      { name: "Technology & Connectivity", slug: "technology-connectivity", description: "Tech support, social media management, photography editing", categoryType: "service_provider", verificationRequired: false, requiredDocuments: [], priceRange: { min: 50, max: 150 }, sortOrder: 12 , commissionBandKey: "commercial" },
      { name: "Language & Translation", slug: "language-translation", description: "Translators, interpreters, language tutors", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["certification", "references"], priceRange: { min: 50, max: 200 }, sortOrder: 13 , commissionBandKey: "commercial" },
      { name: "Specialty Services", slug: "specialty-services", description: "Wedding coordinators, relocation specialists, legal/visa assistants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "insurance"], priceRange: { min: 200, max: 2000 }, sortOrder: 14 , commissionBandKey: "moderate" },
      // FP-1 / A1: `categoryKey` mirrors server/seed-categories.ts — the provider offering picker's
      // catch-all (service_offering_types.custom_other_offering) points at 'custom_other', and a row
      // created without it leaves the wizard's derived-category lock unresolvable and Publish
      // permanently disabled. Keep the two lists in step.
      { name: "Custom / Other", slug: "custom-other", categoryKey: "custom_other", description: "Custom service requests, user-suggested categories", categoryType: "service_provider", verificationRequired: true, requiredDocuments: [], priceRange: { min: 0, max: 0 }, sortOrder: 15 , commissionBandKey: "moderate" },
      // New categories from comprehensive directory
      { name: "Lodging & Accommodation", slug: "lodging-accommodation", description: "Vacation rentals, B&Bs, homestays, glamping, houseboat rentals, room hosts", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["property_license", "insurance"], priceRange: { min: 50, max: 1000 }, sortOrder: 16 , commissionBandKey: "commercial" },
      { name: "Music & Performance", slug: "music-performance", description: "Live musicians, bands, DJs, string quartets, vocalists, ceremony musicians, music instructors", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 2000 }, sortOrder: 17 , commissionBandKey: "moderate" },
      { name: "Entertainment", slug: "entertainment", description: "Comedians, magicians, acrobats, fire performers, caricature artists, game coordinators, kids entertainers", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 1500 }, sortOrder: 18 , commissionBandKey: "moderate" },
      { name: "Floral & Decoration", slug: "floral-decoration", description: "Florists, floral designers, balloon artists, event stylists, backdrop designers, centerpiece designers", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 3000 }, sortOrder: 19 , commissionBandKey: "limited" },
      { name: "Arts & Crafts Instruction", slug: "arts-crafts-instruction", description: "Painting, pottery, jewelry making, dance, calligraphy, woodworking, drawing, photography instruction", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio", "certification"], priceRange: { min: 50, max: 300 }, sortOrder: 20 , commissionBandKey: "moderate" },
      { name: "Companionship & Assistance", slug: "companionship-assistance", description: "Travel companions, local friends, shopping assistants, elderly and child travel companions, day-of coordinators", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["background_check", "references"], priceRange: { min: 50, max: 400 }, sortOrder: 21 , commissionBandKey: "moderate" },
      { name: "Rental Services", slug: "rental-services", description: "Bicycle, car, scooter, boat, camping, beach equipment, sports equipment, costume and baby equipment rentals", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["insurance", "business_license"], priceRange: { min: 20, max: 500 }, sortOrder: 22 , commissionBandKey: "moderate" },
      { name: "Cultural & Educational", slug: "cultural-educational", description: "Cultural ambassadors, history lecturers, etiquette consultants, wedding officiants, archaeologist guides", categoryType: "hybrid", verificationRequired: true, requiredDocuments: ["credentials", "references"], priceRange: { min: 50, max: 500 }, sortOrder: 23 , commissionBandKey: "moderate" },
      { name: "Attire & Fashion", slug: "attire-fashion", description: "Wedding dress designers, tailors, tuxedo rental, wardrobe stylists, jewelry rental and accessories", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 50, max: 2000 }, sortOrder: 24 , commissionBandKey: "moderate" },
      { name: "Safety & Security", slug: "safety-security", description: "Personal security guards, safety consultants, first aid trainers, crowd control specialists", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "certification", "insurance"], priceRange: { min: 100, max: 500 }, sortOrder: 25 , commissionBandKey: "moderate" },
      { name: "Business & Professional", slug: "business-professional", description: "Notaries, legal consultants, real estate consultants, permit coordinators, immigration consultants", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["license", "credentials"], priceRange: { min: 100, max: 1000 }, sortOrder: 26 , commissionBandKey: "moderate" },
      { name: "Technical Services", slug: "technical-services", description: "Audio engineers, lighting technicians, sound systems, LED screen operators, projection mapping, visual effects", categoryType: "service_provider", verificationRequired: false, requiredDocuments: ["portfolio"], priceRange: { min: 100, max: 2000 }, sortOrder: 27 , commissionBandKey: "moderate" },
      { name: "Restaurants & Dining", slug: "restaurants-dining", description: "Restaurants, dining experiences, private dining, food and drink venues", categoryType: "service_provider", verificationRequired: true, requiredDocuments: ["business_license", "food_handler_license"], priceRange: { min: 20, max: 500 }, sortOrder: 28 , commissionBandKey: "moderate" },
    ];
    
    const created = [];
    for (const cat of coreCategories) {
      try {
        const existing = await storage.getServiceCategoryBySlug(cat.slug);
        if (!existing) {
          const newCat = await storage.createServiceCategory(cat as any);
          created.push(newCat);
        }
      } catch (err) {
        console.error(`Failed to create category ${cat.name}:`, err);
      }
    }
    
    res.json({ message: `Created ${created.length} categories`, categories: created });
  });

  // === Enhanced Expert Services Routes ===

  // Get all expert service categories with offerings (public)


  // Ruling 112 / R3 (Run-2 finding): the review-decision NOTIFICATION promise, kept. The wizard
  // says "you'll be notified when it's been looked at" — these writers make that true for every
  // decision arm (born-approval, rejection, edit-review apply/discard). Durable at-most-once via
  // dedupe_key (migration 209's partial UNIQUE); a 23505 means the notification already exists.
  async function notifyListingDecision(opts: {
    userId: string;
    type: string;
    title: string;
    message: string;
    serviceId: string;
    dedupeKey: string;
  }): Promise<void> {
    try {
      await storage.createNotification({
        userId: opts.userId,
        type: opts.type,
        title: opts.title,
        message: opts.message,
        relatedId: opts.serviceId,
        relatedType: "provider_service",
        dedupeKey: opts.dedupeKey,
      } as any);
    } catch (err: any) {
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode !== "23505") {
        console.error("[notifyListingDecision] failed (non-fatal):", err);
      }
    }
  }

router.get("/api/admin/provider-services/pending", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const services = await storage.getProviderServiceListingsByStatus("submitted");
    // Ruling 112 Q8 (CLAUDE.md §23): EDIT REVIEWS share this queue — approved listings whose
    // identity edit waits in pending_changes. The live listing is untouched while it waits;
    // the card carries `editReview: true` + the staged patch so the admin sees exactly what
    // would change.
    const editReviews = await storage.getEditReviewServiceListings();
    res.json([...editReviews, ...services]);
  });

  // Admin: Approve custom service

router.post("/api/admin/provider-services/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = getUserId(req)!;
      const user = await getFullAdminUser(adminId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const service = await storage.getProviderServiceListingById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }

      // Ruling 112 Q8 (CLAUDE.md §23): approving an EDIT REVIEW applies the staged identity
      // patch to the live row (atomic conditional on edit_review_status='pending' — a double
      // click is one effect). The listing was approved all along; nothing was ever taken down.
      const fullRow = await storage.getProviderServiceById(req.params.id);
      if (fullRow && (fullRow as any).editReviewStatus === "pending") {
        const applied = await storage.applyPendingChanges(req.params.id, adminId);
        await insertAccessAuditLog({
          actorId: adminId,
          actorRole: user.role,
          action: "provider_service_edit_review_approve",
          resourceType: "provider_service",
          resourceId: req.params.id,
          metadata: { appliedKeys: Object.keys(((fullRow as any).pendingChanges ?? {}) as object) },
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        }).catch((err: any) => console.error("[admin/provider-services] audit log failed (non-fatal):", err));
        await notifyListingDecision({
          userId: (fullRow as any).userId,
          type: "listing_edit_approved",
          title: "Your listing edit was approved",
          message: `The changes you submitted for "${(fullRow as any).serviceName}" are now live.`,
          serviceId: req.params.id,
          dedupeKey: `service:${req.params.id}:edit-approved:${Date.now()}`,
        });
        return res.json(applied ?? fullRow);
      }

      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only approve submitted services" });
      }

      // QA_PUNCH_LIST.md P0 / DECISIONS.md ruling 53's amending ruling — option (B): admin
      // approval always records the approval (preserves the admin's review work) but only
      // goes publicly live when the LISTING OWNER (service.expertId, NEVER adminId — the
      // acting admin's own verification is irrelevant here) already satisfies the publish
      // predicate. An unverified owner's listing lands approved+draft — held, not live;
      // go-live then follows automatically the next time the owner completes verification
      // (activateVerificationHeldListings, wired at the verification write paths).
      const ownerVerification = await resolvePublishVerification(service.expertId);
      const approved = await storage.approveProviderServiceListing(req.params.id, adminId, ownerVerification.ok);

      // Ruling 112 / R3: keep the wizard's promise — the owner hears about the decision.
      await notifyListingDecision({
        userId: service.expertId,
        type: "listing_approved",
        title: "Your listing was approved",
        message: ownerVerification.ok
          ? `"${service.title}" is approved and live — travelers can find and book it now.`
          : `"${service.title}" is approved. It goes live automatically once your verification completes.`,
        serviceId: req.params.id,
        dedupeKey: `service:${req.params.id}:approved`,
      });

      // ESO promotion was using expert_id / external_id columns dropped in migration 013.
      // Expert-owned services now live in provider_services; no ESO write needed here.

      await insertAccessAuditLog({
        actorId: adminId,
        actorRole: user.role,
        action: "provider_service_approve",
        resourceType: "provider_service",
        resourceId: req.params.id,
        metadata: {},
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch((err: any) => console.error("[admin/provider-services] audit log failed (non-fatal):", err));

      res.json(approved);
    } catch (err) {
      console.error("Error approving custom service:", err);
      res.status(500).json({ message: "Failed to approve custom service" });
    }
  });

  // Admin: Reject custom service

router.post("/api/admin/provider-services/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = getUserId(req)!;
      const user = await getFullAdminUser(adminId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const service = await storage.getProviderServiceListingById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Custom service not found" });
      }

      // Ruling 112 Q8 (CLAUDE.md §23): rejecting an EDIT REVIEW discards the staged patch —
      // the live listing stays approved exactly as it was. Never touches approval_status.
      const fullRowReject = await storage.getProviderServiceById(req.params.id);
      if (fullRowReject && (fullRowReject as any).editReviewStatus === "pending") {
        const discarded = await storage.discardPendingChanges(req.params.id);
        await insertAccessAuditLog({
          actorId: adminId,
          actorRole: user.role,
          action: "provider_service_edit_review_reject",
          resourceType: "provider_service",
          resourceId: req.params.id,
          metadata: { reason, discardedKeys: Object.keys(((fullRowReject as any).pendingChanges ?? {}) as object) },
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        }).catch((err: any) => console.error("[admin/provider-services] audit log failed (non-fatal):", err));
        await notifyListingDecision({
          userId: (fullRowReject as any).userId,
          type: "listing_edit_rejected",
          title: "Your listing edit was not approved",
          message: `The changes you submitted for "${(fullRowReject as any).serviceName}" were not approved: ${reason}. Your live listing is unchanged.`,
          serviceId: req.params.id,
          dedupeKey: `service:${req.params.id}:edit-rejected:${Date.now()}`,
        });
        return res.json(discarded ?? fullRowReject);
      }

      if (service.status !== "submitted") {
        return res.status(400).json({ message: "Can only reject submitted services" });
      }

      const rejected = await storage.rejectProviderServiceListing(req.params.id, adminId, reason);

      // Ruling 112 / R3: rejection is a decision too — say it, with the reason.
      await notifyListingDecision({
        userId: service.expertId,
        type: "listing_rejected",
        title: "Your listing was not approved",
        message: `"${service.title}" was not approved: ${reason}. Edit it and resubmit when ready.`,
        serviceId: req.params.id,
        dedupeKey: `service:${req.params.id}:rejected`,
      });

      await insertAccessAuditLog({
        actorId: adminId,
        actorRole: user.role,
        action: "provider_service_reject",
        resourceType: "provider_service",
        resourceId: req.params.id,
        metadata: { reason },
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch((err: any) => console.error("[admin/provider-services] audit log failed (non-fatal):", err));

      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting custom service:", err);
      res.status(500).json({ message: "Failed to reject custom service" });
    }
  });

  // === Expert Templates (Income Streams) ===
  
  // Get all published templates (public)

router.get("/api/admin/destination-events/pending", isAuthenticated, async (req, res) => {
    const user = await getFullAdminUser(getUserId(req)!);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const events = await storage.getPendingDestinationEvents();
    res.json(events);
  });

  // Admin: Approve destination event

router.post("/api/admin/destination-events/:id/approve", isAuthenticated, async (req, res) => {
    try {
      const adminId = getUserId(req)!;
      const user = await getFullAdminUser(adminId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only approve pending events" });
      }

      const approved = await storage.approveDestinationEvent(req.params.id, adminId);
      res.json(approved);
    } catch (err) {
      console.error("Error approving destination event:", err);
      res.status(500).json({ message: "Failed to approve event" });
    }
  });

  // Admin: Reject destination event

router.post("/api/admin/destination-events/:id/reject", isAuthenticated, async (req, res) => {
    try {
      const adminId = getUserId(req)!;
      const user = await getFullAdminUser(adminId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const event = await storage.getDestinationEventById(req.params.id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      if (event.status !== "pending") {
        return res.status(400).json({ message: "Can only reject pending events" });
      }

      const rejected = await storage.rejectDestinationEvent(req.params.id, adminId, reason);
      res.json(rejected);
    } catch (err) {
      console.error("Error rejecting destination event:", err);
      res.status(500).json({ message: "Failed to reject event" });
    }
  });

  // Get single service by ID (public - for booking page)

router.get("/api/admin/data/location-summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // flights RETIRED from this summary (migration 176 dropped flight_cache — it was
      // writerless since the Amadeus drop and this only ever counted an empty table).
      const { eventData, hotelData, activityData } = await getLocationSummaryData();

      const totals = {
        events: eventData.reduce((sum: number, e: any) => sum + e.count, 0),
        hotels: hotelData.reduce((sum: number, h: any) => sum + h.count, 0),
        activities: activityData.reduce((sum: number, a: any) => sum + a.count, 0),
      };

      res.json({
        events: eventData,
        hotels: hotelData,
        activities: activityData,
        totals,
      });
    } catch (error) {
      console.error("[Admin] Location summary error:", error);
      res.status(500).json({ error: "Failed to get location summary" });
    }
  });

  // Manually refresh all cities (admin only)

router.get("/api/admin/affiliate/reconciliation", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const partner = (req.query.partner as string) || undefined;
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }

      const { affiliateReconciliationService } = await import("../services/affiliate-reconciliation.service");
      const result = await affiliateReconciliationService.getReconciliationView(period, partner);
      res.json(result);
    } catch (error: any) {
      console.error("[Reconciliation] Error:", error);
      res.status(500).json({ message: "Failed to get reconciliation data", error: error.message });
    }
  });

  // Admin: Update reconciliation status for an earnings row

router.patch("/api/admin/affiliate/reconciliation/:earningId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { earningId } = req.params;
      const { status, notes, partnerReferenceId } = req.body;
      const validStatuses = ["unmatched", "matched", "disputed", "written_off"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const { affiliateReconciliationService } = await import("../services/affiliate-reconciliation.service");
      await affiliateReconciliationService.updateReconciliationStatus(earningId, status, notes, partnerReferenceId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Reconciliation] Update error:", error);
      res.status(500).json({ message: "Failed to update reconciliation status", error: error.message });
    }
  });

  // Get products for a specific location (for itinerary integration)

router.get("/api/admin/content/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const summary = await storage.getContentTrackingSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content summary", error: error.message });
    }
  });

  // Get all content registry entries (admin only)

router.get("/api/admin/content/registry", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { status, contentType, ownerId, flagged, provider, limit, offset } = req.query;
      const content = await storage.getContentRegistry({
        status: status as string,
        contentType: contentType as string,
        ownerId: ownerId as string,
        flagged: flagged === 'true',
        provider: provider as string,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content registry", error: error.message });
    }
  });

  // Get distinct affiliate providers present in the content registry

router.get("/api/admin/content/providers", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const providers = await storage.getAffiliateProviders();
      res.json(providers);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get providers", error: error.message });
    }
  });

  // Get content by tracking number

router.get("/api/admin/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const content = await storage.getContentByTrackingNumber(trackingNumber);
      if (!content) {
        return res.status(404).json({ message: "Content not found" });
      }

      // Get related data
      const versions = await storage.getContentVersions(trackingNumber);
      const flags = await storage.getContentFlags(trackingNumber);
      const invoices = await storage.getInvoicesByTrackingNumber(trackingNumber);

      res.json({
        content,
        versions,
        flags,
        invoices,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content details", error: error.message });
    }
  });

  // Register new content (manual registration via API)

router.post("/api/admin/content/register", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { contentType, contentId, ownerId, title, description, status, metadata } = req.body;

      if (!contentType || !contentId) {
        return res.status(400).json({ message: "contentType and contentId are required" });
      }

      // Auto-generate tracking number for manual API registration
      const trackingNumber = await storage.generateTrackingNumber('TRV');

      const content = await storage.registerContent({
        trackingNumber,
        contentType,
        contentId,
        ownerId,
        title,
        description,
        status: status || 'published',
        metadata: metadata || {},
      });

      res.json(content);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to register content", error: error.message });
    }
  });

  // Get moderation queue (flagged content)

router.get("/api/admin/content/moderation/queue", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const queue = await storage.getModerationQueue();
      res.json(queue);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get moderation queue", error: error.message });
    }
  });

  // Moderate content

router.post("/api/admin/content/:trackingNumber/moderate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber } = req.params;
      const { action, notes } = req.body;

      if (!['approve', 'suspend', 'delete'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be: approve, suspend, or delete" });
      }

      const result = await storage.moderateContent(
        trackingNumber,
        userId,
        action,
        notes
      );

      if (!result) {
        return res.status(404).json({ message: "Content not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to moderate content", error: error.message });
    }
  });

  // Flag content

router.get("/api/admin/content/flags/pending", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const flags = await storage.getPendingFlags();
      res.json(flags);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pending flags", error: error.message });
    }
  });

  // Resolve flag (admin only)

router.post("/api/admin/content/flags/:flagId/resolve", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { flagId } = req.params;
      const { resolution } = req.body;

      if (!resolution) {
        return res.status(400).json({ message: "resolution is required" });
      }

      const result = await storage.resolveFlag(flagId, userId, resolution);
      if (!result) {
        return res.status(404).json({ message: "Flag not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to resolve flag", error: error.message });
    }
  });

  // ============================================================
  // ADMIN SERVICES REGISTRY
  // ============================================================


router.get("/api/admin/services/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const all = await storage.getAllProviderServices();
      const byStatus: Record<string, number> = {};
      let totalRevenue = 0;
      let totalBookings = 0;
      let featuredCount = 0;
      for (const s of all) {
        const sKey = s.status ?? "unknown";
        byStatus[sKey] = (byStatus[sKey] || 0) + 1;
        totalRevenue += parseFloat(s.totalRevenue ?? "0");
        totalBookings += s.bookingsCount ?? 0;
        if (s.isFeatured) featuredCount++;
      }
      res.json({
        total: all.length,
        byStatus,
        totalRevenue,
        totalBookings,
        featuredCount,
        averageRating: all.length > 0
          ? all.reduce((sum, s) => sum + parseFloat(s.averageRating ?? "0"), 0) / all.filter(s => s.averageRating).length
          : 0,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch services summary", error: err.message });
    }
  });


router.get("/api/admin/services", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { status, search, category } = req.query;
      const all = await storage.getAllProviderServices();

      const providerIds = Array.from(new Set(all.map(s => s.userId)));
      const providerRows = providerIds.length > 0
        ? await getUsersBasicByIds(providerIds)
        : [];
      const providerMap = Object.fromEntries(providerRows.map(p => [p.id, p]));

      // ── FP-1 / B10 (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1) ──────────────────────────
      // VISIBILITY ONLY — zero behavior change to any charge. A listing with no category (every
      // property, room and bundle the Workstation builders create) resolves no
      // service_categories.commission_band_key, so the resolver falls through to the configured
      // platform default band. Nothing surfaced that anywhere; an admin reviewing a catalog could
      // not see which listings were on a default band. This annotates the row with the BAND KEY
      // and whether it resolved — never a rate, never a percentage, and it does not participate in
      // resolution (§8/§18: the fee lanes own rates and amounts; this read touches neither).
      const catBandRows = await db
        .select({ id: serviceCategories.id, commissionBandKey: serviceCategories.commissionBandKey })
        .from(serviceCategories);
      const bandByCategoryId = new Map(catBandRows.map((c) => [c.id, c.commissionBandKey ?? null]));

      let services = all.map(s => ({
        ...s,
        providerName: providerMap[s.userId]
          ? `${providerMap[s.userId].firstName ?? ""} ${providerMap[s.userId].lastName ?? ""}`.trim() || providerMap[s.userId].email
          : "Unknown",
        providerEmail: providerMap[s.userId]?.email,
        commissionBand: (() => {
          const bandKey = s.categoryId ? (bandByCategoryId.get(s.categoryId) ?? null) : null;
          return {
            resolved: !!bandKey,
            bandKey,
            reason: bandKey
              ? null
              : s.categoryId
                ? "category has no commission band — platform default applies"
                : "no category — platform default commission band applies",
          };
        })(),
      }));

      if (status && status !== "all") services = services.filter(s => s.status === status);
      if (category && category !== "all") services = services.filter(s => s.categoryId === category);
      if (search) {
        const q = (search as string).toLowerCase();
        services = services.filter(s =>
          s.serviceName.toLowerCase().includes(q) ||
          (s.providerName as string).toLowerCase().includes(q) ||
          s.trackingNumber?.toLowerCase().includes(q) ||
          s.location?.toLowerCase().includes(q)
        );
      }

      services.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
      res.json(services);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch services", error: err.message });
    }
  });


router.patch("/api/admin/services/:id/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { status } = req.body;
      if (!["active", "paused", "draft", "suspended"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await updateProviderServiceStatus(req.params.id, status);
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update service status", error: err.message });
    }
  });


router.patch("/api/admin/services/:id/featured", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { isFeatured } = req.body;
      const updated = await updateProviderServiceFeatured(req.params.id, Boolean(isFeatured));
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update featured status", error: err.message });
    }
  });


router.patch("/api/admin/services/:id/affinity-tags", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const { contentAffinityTags } = req.body;
      if (!Array.isArray(contentAffinityTags)) {
        return res.status(400).json({ message: "contentAffinityTags must be an array" });
      }

      const validTags = [
        "hotel_arrival", "photo_shoot", "restaurant_visit", "cultural_attraction",
        "wellness_experience", "nightlife", "hiking_outdoor", "wedding_proposal", "general_logistics",
      ];
      const sanitized: string[] = contentAffinityTags.filter((t: any) => typeof t === "string" && validTags.includes(t));

      const updated = await updateProviderServiceAffinityTags(req.params.id, sanitized);
      if (!updated) return res.status(404).json({ message: "Service not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update affinity tags", error: err.message });
    }
  });


router.delete("/api/admin/services/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const row = await getProviderServiceById(req.params.id);
      if (!row) return res.status(404).json({ message: "Service not found" });

      // Financial-history guard: service_bookings.service_id is ON DELETE CASCADE, so a
      // hard delete would silently destroy historical bookings (and the platform_fee
      // snapshots the revenue dashboard sums). If any bookings reference this service,
      // soft-delete instead — mark it suspended so it disappears from public surfaces
      // while every historical record keeps its reference intact.
      //
      // Runs in a single transaction with the service row locked FOR UPDATE: a booking
      // INSERT takes a FK KEY SHARE lock on this row, which conflicts with FOR UPDATE,
      // so a concurrent checkout blocks until we commit — it can never slip a booking
      // in between the count and the delete (post-delete it fails the FK honestly).
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM provider_services WHERE id = ${req.params.id} FOR UPDATE`);
        const [{ bookingCount }] = await tx
          .select({ bookingCount: sql<number>`count(*)::int` })
          .from(serviceBookings)
          .where(eq(serviceBookings.serviceId, req.params.id));
        if (bookingCount > 0) {
          await tx
            .update(providerServices)
            .set({ status: "suspended", updatedAt: new Date() })
            .where(eq(providerServices.id, req.params.id));
          return { softDeleted: true as const, bookingCount };
        }
        await tx.delete(providerServices).where(eq(providerServices.id, req.params.id));
        return { softDeleted: false as const, bookingCount: 0 };
      });

      if (outcome.softDeleted) {
        return res.json({
          ok: true,
          softDeleted: true,
          message: `Service has ${outcome.bookingCount} booking(s) — it was archived (suspended) instead of deleted so booking history stays intact.`,
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      // Migration 151 (§17): bundle_components.component_service_id is ON DELETE RESTRICT —
      // a service inside a bundle can't be deleted until removed from it. Surface the FK
      // violation (23503) as an honest 409 naming the bundle(s), not an opaque 500.
      if ((err?.code ?? err?.cause?.code) === "23503") {
        const inBundles = await db
          .select({ serviceName: providerServices.serviceName })
          .from(bundleComponents)
          .innerJoin(providerServices, eq(bundleComponents.bundleServiceId, providerServices.id))
          .where(eq(bundleComponents.componentServiceId, req.params.id));
        if (inBundles.length > 0) {
          return res.status(409).json({
            message: "This service is part of a bundle — remove it from the bundle(s) before deleting it.",
            bundles: inBundles.map((r) => r.serviceName),
          });
        }
      }
      res.status(500).json({ message: "Failed to delete service", error: err.message });
    }
  });

  // === Content Invoices API ===

  // Create invoice for content

router.post("/api/admin/invoices", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { trackingNumber, customerId, providerId, invoiceType, amount, currency, taxAmount, discountAmount, notes, dueDate } = req.body;

      if (!trackingNumber || !invoiceType || !amount) {
        return res.status(400).json({ message: "trackingNumber, invoiceType, and amount are required" });
      }

      const totalAmount = amount + (taxAmount || 0) - (discountAmount || 0);

      const invoice = await storage.createContentInvoice({
        invoiceNumber: `INV-${trackingNumber}`,
        trackingNumber,
        customerId,
        providerId,
        invoiceType,
        amount,
        currency: currency || 'USD',
        taxAmount: taxAmount || 0,
        discountAmount: discountAmount || 0,
        totalAmount,
        notes,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create invoice", error: error.message });
    }
  });

  // Get invoice by number

router.get("/api/admin/invoices/:invoiceNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const invoice = await storage.getContentInvoice(invoiceNumber);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(invoice);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get invoice", error: error.message });
    }
  });

  // Update invoice status

router.patch("/api/admin/invoices/:invoiceNumber/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { invoiceNumber } = req.params;
      const { status, paymentReference } = req.body;

      if (!status) {
        return res.status(400).json({ message: "status is required" });
      }

      const result = await storage.updateInvoiceStatus(invoiceNumber, status, paymentReference);
      if (!result) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update invoice status", error: error.message });
    }
  });

  // Get invoices by customer

router.get("/api/admin/ai-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const summary = await aiUsageService.getSummary(start, end);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage summary", error: error.message });
    }
  });

  // Get daily AI usage for charts

router.get("/api/admin/ai-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const days = parseInt(req.query.days as string) || 30;
      const dailyUsage = await aiUsageService.getDailyUsage(days);
      res.json(dailyUsage);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily AI usage", error: error.message });
    }
  });

  // Get recent AI usage logs

router.get("/api/admin/ai-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await aiUsageService.getRecentLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get AI usage logs", error: error.message });
    }
  });

  // Get AI pricing info

router.get("/api/admin/ai-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      res.json({
        providers: {
          grok: {
            models: {
              'grok-2': { input: 200, output: 1000 },
              'grok-2-vision': { input: 200, output: 1000 },
              'grok-4': { input: 300, output: 1500 },
              'grok-4.1-fast': { input: 20, output: 50 },
            },
            note: "Prices in cents per 1M tokens"
          },
          anthropic: {
            models: {
              'claude-3-sonnet': { input: 300, output: 1500 },
              'claude-3-opus': { input: 1500, output: 7500 },
            },
            note: "Prices in cents per 1M tokens"
          }
        },
        lastUpdated: "2026-01-27"
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get pricing info", error: error.message });
    }
  });

router.get("/api/admin/ai/circuit-breaker", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { getCircuitBreakerState } = await import("../utils/requestDeduplication");
      const state = getCircuitBreakerState();

      res.json({
        ...state,
        retryAfterSeconds: state.open && state.openedAt
          ? Math.max(0, Math.ceil((state.recoveryWindowMs - (Date.now() - state.openedAt)) / 1000))
          : null,
        checkedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get circuit breaker state", error: error.message });
    }
  });

  // External API Usage Tracking (Amadeus, etc.)

router.get("/api/admin/api-usage/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const summary = await apiUsageService.getUsageSummary(30);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage summary", error: error.message });
    }
  });


router.get("/api/admin/api-usage/daily", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const daily = await apiUsageService.getDailyUsage(30);
      res.json(daily);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get daily API usage", error: error.message });
    }
  });


router.get("/api/admin/api-usage/logs", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const logs = await apiUsageService.getRecentLogs(100);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API usage logs", error: error.message });
    }
  });


router.get("/api/admin/api-usage/pricing", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { apiUsageService } = await import('../services/api-usage.service');
      const pricing = apiUsageService.getPricingInfo();
      res.json(pricing);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get API pricing info", error: error.message });
    }
  });

  // === Revenue Tracking Endpoints ===

  // Admin unified revenue dashboard

router.get("/api/admin/revenue/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const dashboard = await withQueryTimer(
        "admin-revenue-dashboard",
        () => revenueTrackingService.getUnifiedDashboard(),
        (req.user as any)?.role
      );
      res.json(dashboard);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue dashboard", error: error.message });
    }
  });

  // Platform revenue summary with filters

router.get("/api/admin/revenue/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      
      const summary = await storage.getPlatformRevenueSummary(startDate, endDate);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue summary", error: error.message });
    }
  });

  // Platform revenue transactions list

router.get("/api/admin/revenue/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : undefined;
      const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : undefined;
      const sourceType = req.query.sourceType ? String(req.query.sourceType) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      
      const transactions = await storage.getPlatformRevenue({ startDate, endDate, sourceType, status });
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get revenue transactions", error: error.message });
    }
  });

  // Revenue report by content tracking number

router.get("/api/admin/revenue/content/:trackingNumber", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { revenueTrackingService } = await import('../services/revenue-tracking.service');
      const report = await revenueTrackingService.getContentRevenueReport(req.params.trackingNumber);
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get content revenue report", error: error.message });
    }
  });

  // Unified revenue endpoint — fans out to all affiliate/payment streams in parallel

router.get("/api/admin/revenue/unified", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }

      const [
        { getTravelpayoutsStatistics },
        { getViatorCommissions },
        { getFeverCommissions },
        { getBookingComCommissions },
        { getApiCostsSummary },
      ] = await Promise.all([
        import("../services/travelpayouts/statistics.service"),
        import("../services/viator-commissions.service"),
        import("../services/fever-commissions.service"),
        import("../services/booking-com-commissions.service"),
        import("../services/api-costs.service"),
      ]);

      // Compute period-specific date bounds for Stripe query
      const now = new Date();
      const periodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            end: now,
          };
        }
        // this_month
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now,
        };
      })();

      // Comparison (prior) period bounds for MoM badge
      const priorPeriodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
            end: new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
            end: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          };
        }
        // this_month → compare against last calendar month
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
        };
      })();

      const [travelpayouts, viator, fever, bookingCom, apiCosts, stripePeriodSummary, stripePriorSummary] = await Promise.all([
        getTravelpayoutsStatistics(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD", balance: 0, byPartner: [] })),
        getViatorCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getFeverCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getBookingComCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getApiCostsSummary(period).catch(() => ({ entries: [], totalCostDollars: 0 })),
        // Fetch period-accurate Stripe total directly from DB
        storage.getPlatformRevenueSummary(periodBounds.start, periodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
        // Fetch prior period for MoM comparison
        storage.getPlatformRevenueSummary(priorPeriodBounds.start, priorPeriodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
      ]);

      const stripeThisMonth = stripePeriodSummary.totalPlatformFee;
      const stripeLastMonth = stripePriorSummary.totalPlatformFee;
      // Use period-accurate DB query result (not all-time totalRevenue)
      const stripeTotal = stripePeriodSummary.totalPlatformFee;
      const stripeGrowthPercent = stripeLastMonth > 0
        ? Math.round(((stripeThisMonth - stripeLastMonth) / stripeLastMonth) * 1000) / 10
        : 0;

      // Use only reconciliation-confirmed affiliate totals when available
      let confirmedAffiliateTotal = 0;
      try {
        const { affiliateReconciliationService } = await import("../services/affiliate-reconciliation.service");
        confirmedAffiliateTotal = await affiliateReconciliationService.getConfirmedAffiliateTotal(
          periodBounds.start,
          periodBounds.end
        );
      } catch (_) { /* ignore — fallback to raw totals */ }

      const rawAffiliateRevenue =
        (travelpayouts.total || 0) +
        (viator.total || 0) +
        (fever.total || 0) +
        (bookingCom.total || 0);

      // Always use confirmed (matched) totals; raw affiliate numbers are for context only.
      // If reconciliation has never run, confirmed will be 0 — that is the correct conservative figure.
      const totalAffiliateRevenue = confirmedAffiliateTotal;

      const totalNetRevenue = stripeTotal + totalAffiliateRevenue - apiCosts.totalCostDollars;

      res.json({
        period,
        totalNetRevenue,
        stripe: {
          configured: true,
          thisMonth: stripeThisMonth,
          lastMonth: stripeLastMonth,
          total: stripeTotal,
          currency: "USD",
          growthPercent: stripeGrowthPercent,
        },
        travelpayouts,
        viator,
        fever,
        bookingCom,
        apiCosts,
      });
    } catch (error: any) {
      console.error("[UnifiedRevenue] Error:", error);
      res.status(500).json({ message: "Failed to get unified revenue data", error: error.message });
    }
  });

  // Admin unified revenue export (CSV or PDF)

router.get("/api/admin/revenue/unified/export", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const period = (req.query.period as string) || "this_month";
      const format = ((req.query.format as string) || "csv").toLowerCase();
      const validPeriods = ["this_month", "last_month", "last_90_days"];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({ message: "Invalid period. Use: this_month, last_month, last_90_days" });
      }
      if (!["csv", "pdf"].includes(format)) {
        return res.status(400).json({ message: "Invalid format. Use: csv, pdf" });
      }

      const [
        { getTravelpayoutsStatistics },
        { getViatorCommissions },
        { getFeverCommissions },
        { getBookingComCommissions },
        { getApiCostsSummary },
        { revenueTrackingService },
      ] = await Promise.all([
        import("../services/travelpayouts/statistics.service"),
        import("../services/viator-commissions.service"),
        import("../services/fever-commissions.service"),
        import("../services/booking-com-commissions.service"),
        import("../services/api-costs.service"),
        import("../services/revenue-tracking.service"),
      ]);

      const now = new Date();
      const periodBounds = (() => {
        if (period === "last_month") {
          return {
            start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
          };
        }
        if (period === "last_90_days") {
          return {
            start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            end: now,
          };
        }
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now,
        };
      })();

      const [stripe, travelpayouts, viator, fever, bookingCom, apiCosts, stripePeriodSummary, transactions] = await Promise.all([
        revenueTrackingService.getUnifiedDashboard().catch(() => null),
        getTravelpayoutsStatistics(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD", balance: 0, byPartner: [] })),
        getViatorCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getFeverCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getBookingComCommissions(period).catch(() => ({ configured: false, thisMonth: 0, lastMonth: 0, total: 0, currency: "USD" })),
        getApiCostsSummary(period).catch(() => ({ entries: [], totalCostDollars: 0 })),
        storage.getPlatformRevenueSummary(periodBounds.start, periodBounds.end).catch(() => ({ totalPlatformFee: 0, totalGross: 0, bySource: {} })),
        storage.getPlatformRevenue({ startDate: periodBounds.start, endDate: periodBounds.end }).catch(() => []),
      ]);

      const stripeTotal = stripePeriodSummary.totalPlatformFee;
      const totalAffiliateRevenue = (travelpayouts.total || 0) + (viator.total || 0) + (fever.total || 0) + (bookingCom.total || 0);
      const totalNetRevenue = stripeTotal + totalAffiliateRevenue - apiCosts.totalCostDollars;

      const periodLabel = period === "last_month" ? "Last Month" : period === "last_90_days" ? "Last 90 Days" : "This Month";
      const exportedAt = now.toISOString();
      const fmt = (n: number) => n.toFixed(2);

      if (format === "csv") {
        const rows: string[] = [];
        const addRow = (...cols: (string | number)[]) => rows.push(cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));
        const addBlank = () => rows.push("");
        const addHeader = (title: string) => { addBlank(); addRow(title); };

        addRow("Traveloure - Unified Revenue Export");
        addRow(`Period: ${periodLabel}`);
        addRow(`Exported: ${exportedAt}`);

        addHeader("REVENUE STREAM TOTALS");
        addRow("Stream", "This Month (USD)", "Last Month (USD)", "Period Total (USD)");
        addRow("Stripe (Platform Fees)", fmt(stripe?.platform?.thisMonth || 0), fmt(stripe?.platform?.lastMonth || 0), fmt(stripeTotal));
        addRow("Travelpayouts", fmt(travelpayouts.thisMonth || 0), fmt(travelpayouts.lastMonth || 0), fmt(travelpayouts.total || 0));
        addRow("Viator", fmt(viator.thisMonth || 0), fmt(viator.lastMonth || 0), fmt(viator.total || 0));
        addRow("Fever", fmt(fever.thisMonth || 0), fmt(fever.lastMonth || 0), fmt(fever.total || 0));
        addRow("Booking.com", fmt(bookingCom.thisMonth || 0), fmt(bookingCom.lastMonth || 0), fmt(bookingCom.total || 0));
        addRow("API Costs (deducted)", "", "", `-${fmt(apiCosts.totalCostDollars)}`);
        addRow("NET REVENUE", "", "", fmt(totalNetRevenue));

        if ((travelpayouts as any).byPartner?.length) {
          addHeader("TRAVELPAYOUTS PARTNER BREAKDOWN");
          addRow("Partner", "This Month (USD)", "Last Month (USD)", "Period Total (USD)");
          for (const p of (travelpayouts as any).byPartner) {
            addRow(p.partnerLabel || p.partner, fmt(p.thisMonth || 0), fmt(p.lastMonth || 0), fmt(p.total || 0));
          }
        }

        if (apiCosts.entries?.length) {
          addHeader("API COST BREAKDOWN");
          addRow("Provider", "API Calls", "Cost (USD)");
          for (const e of apiCosts.entries) {
            addRow(e.provider, e.calls, fmt(e.costDollars));
          }
          addRow("TOTAL API COSTS", "", fmt(apiCosts.totalCostDollars));
        }

        if (Array.isArray(transactions) && transactions.length) {
          addHeader("RECENT TRANSACTIONS");
          addRow("Date", "Source Type", "Gross Amount (USD)", "Platform Fee (USD)", "Tracking #");
          for (const tx of transactions) {
            addRow(
              new Date((tx as any).date).toLocaleDateString("en-US"),
              tx.sourceType || "",
              fmt(Number(tx.grossAmount) || 0),
              fmt(Number(tx.platformFee) || 0),
              tx.trackingNumber || ""
            );
          }
        }

        const csvContent = rows.join("\r\n");
        const filename = `traveloure-revenue-${period}-${now.toISOString().slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send("\uFEFF" + csvContent); // BOM for Excel UTF-8
      }

      // PDF: generate a real PDF using pdfkit
      const PDFDocument = (await import("pdfkit")).default;
      const periodTransactions = Array.isArray(transactions) ? transactions : [];

      const filename = `traveloure-revenue-${period}-${now.toISOString().slice(0, 10)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);

      const COL_GRAY = "#6b7280";
      const COL_GREEN = "#16a34a";
      const COL_BLACK = "#111827";
      const COL_HEADER_BG = "#f3f4f6";

      // Helper: sanitize string for PDF output (strip control chars)
      const safe = (v: unknown) => String(v ?? "").replace(/[\x00-\x1F\x7F]/g, " ").slice(0, 200);

      // Title
      doc.fontSize(18).fillColor(COL_BLACK).font("Helvetica-Bold").text("Traveloure – Unified Revenue Report");
      doc.fontSize(10).fillColor(COL_GRAY).font("Helvetica").text(`Period: ${periodLabel}   |   Exported: ${exportedAt}`);
      doc.moveDown(0.5);

      // Net Revenue highlight
      doc.fontSize(13).fillColor(COL_GREEN).font("Helvetica-Bold").text(`Net Revenue: $${fmt(totalNetRevenue)} USD`);
      doc.moveDown(1);

      // Helper: draw a simple table
      const drawTable = (headers: string[], colWidths: number[], rows: (string | number)[][], highlightLast = false) => {
        const startX = doc.page.margins.left;
        const rowH = 18;
        let y = doc.y;

        // Header row
        doc.font("Helvetica-Bold").fontSize(9).fillColor(COL_BLACK);
        let x = startX;
        headers.forEach((h, i) => {
          doc.rect(x, y, colWidths[i], rowH).fill(COL_HEADER_BG).stroke("#d1d5db");
          doc.fillColor(COL_BLACK).text(h, x + 4, y + 4, { width: colWidths[i] - 8, lineBreak: false });
          x += colWidths[i];
        });
        y += rowH;

        // Data rows
        doc.font("Helvetica").fontSize(9);
        rows.forEach((row, ri) => {
          if (y + rowH > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          const isLast = highlightLast && ri === rows.length - 1;
          x = startX;
          row.forEach((cell, ci) => {
            doc.rect(x, y, colWidths[ci], rowH).fill(isLast ? "#f9fafb" : "#ffffff").stroke("#e5e7eb");
            doc.font(isLast ? "Helvetica-Bold" : "Helvetica").fillColor(COL_BLACK)
              .text(safe(cell), x + 4, y + 4, { width: colWidths[ci] - 8, lineBreak: false });
            x += colWidths[ci];
          });
          y += rowH;
        });
        doc.y = y;
        doc.moveDown(1);
      };

      // Revenue Streams
      doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("Revenue Stream Totals");
      doc.moveDown(0.3);
      drawTable(
        ["Stream", "This Month", "Last Month", "Period Total"],
        [210, 100, 100, 100],
        [
          ["Stripe (Platform Fees)", `$${fmt(stripe?.platform?.thisMonth || 0)}`, `$${fmt(stripe?.platform?.lastMonth || 0)}`, `$${fmt(stripeTotal)}`],
          ["Travelpayouts", `$${fmt(travelpayouts.thisMonth || 0)}`, `$${fmt(travelpayouts.lastMonth || 0)}`, `$${fmt(travelpayouts.total || 0)}`],
          ["Viator", `$${fmt(viator.thisMonth || 0)}`, `$${fmt(viator.lastMonth || 0)}`, `$${fmt(viator.total || 0)}`],
          ["Fever", `$${fmt(fever.thisMonth || 0)}`, `$${fmt(fever.lastMonth || 0)}`, `$${fmt(fever.total || 0)}`],
          ["Booking.com", `$${fmt(bookingCom.thisMonth || 0)}`, `$${fmt(bookingCom.lastMonth || 0)}`, `$${fmt(bookingCom.total || 0)}`],
          ["API Costs (deducted)", "", "", `-$${fmt(apiCosts.totalCostDollars)}`],
          ["NET REVENUE", "", "", `$${fmt(totalNetRevenue)}`],
        ],
        true
      );

      // Travelpayouts partner breakdown
      const partners = (travelpayouts as any).byPartner ?? [];
      if (partners.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("Travelpayouts Partner Breakdown");
        doc.moveDown(0.3);
        drawTable(
          ["Partner", "This Month", "Last Month", "Period Total"],
          [210, 100, 100, 100],
          partners.map((p: any) => [
            safe(p.partnerLabel || p.partner),
            `$${fmt(p.thisMonth || 0)}`,
            `$${fmt(p.lastMonth || 0)}`,
            `$${fmt(p.total || 0)}`,
          ])
        );
      }

      // API costs breakdown
      if (apiCosts.entries?.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text("API Cost Breakdown");
        doc.moveDown(0.3);
        drawTable(
          ["Provider", "API Calls", "Cost (USD)"],
          [240, 130, 130],
          [
            ...apiCosts.entries.map((e: any) => [safe(e.provider), String(e.calls), `$${fmt(e.costDollars)}`]),
            ["TOTAL API COSTS", "", `$${fmt(apiCosts.totalCostDollars)}`],
          ],
          true
        );
      }

      // Transactions
      if (periodTransactions.length) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor(COL_BLACK).text(`Transactions (${periodTransactions.length})`);
        doc.moveDown(0.3);
        drawTable(
          ["Date", "Source Type", "Gross Amount", "Platform Fee", "Tracking #"],
          [80, 140, 90, 90, 110],
          periodTransactions.map((tx: any) => [
            new Date(tx.date).toLocaleDateString("en-US"),
            safe(tx.sourceType),
            `$${fmt(tx.grossAmount || 0)}`,
            `$${fmt(tx.platformFee || 0)}`,
            safe(tx.trackingNumber || ""),
          ])
        );
      }

      doc.end();
      return;
    } catch (error: any) {
      console.error("[RevenueExport] Error:", error);
      res.status(500).json({ message: "Failed to export revenue data", error: error.message });
    }
  });

  // Provider earnings endpoints
  // Uses same auth pattern as /api/provider/services, /api/provider/bookings

router.get("/api/admin/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const status = req.query.status as string | undefined;
      const validStatuses = ['pending', 'processing', 'approved', 'completed', 'failed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status filter" });
      }
      const [expertPayouts, providerPayouts] = await Promise.all([
        storage.getAllExpertPayouts(status),
        storage.getAllProviderPayouts(status),
      ]);
      const allPayouts = [
        ...expertPayouts.map(p => ({ ...p, requesterType: 'expert' as const, isStale: isPayoutStale(p) })),
        ...providerPayouts.map(p => ({ ...p, requesterType: 'provider' as const, isStale: isPayoutStale(p) })),
      ].sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());
      res.json(allPayouts);
    } catch (error: any) {
      console.error("Error fetching admin payouts:", error);
      res.status(500).json({ message: "Failed to get payouts", error: error.message });
    }
  });


router.post("/api/admin/payouts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { requesterType, requesterId, amountCents, notes } = req.body;
      if (!requesterType || !requesterId) {
        return res.status(400).json({ error: "requesterType and requesterId are required" });
      }
      if (!['expert', 'provider'].includes(requesterType)) {
        return res.status(400).json({ error: "requesterType must be 'expert' or 'provider'" });
      }

      let summary;
      if (requesterType === 'expert') {
        summary = await storage.getExpertEarningsSummary(requesterId);
      } else {
        summary = await storage.getProviderEarningsSummary(requesterId);
      }

      const payoutAmountCents = amountCents ?? Math.round(summary.available * 100);
      if (payoutAmountCents <= 0) {
        return res.status(400).json({ error: "No available earnings to payout" });
      }
      if (payoutAmountCents < MIN_PAYOUT_CENTS) {
        return res.status(400).json({
          error: `Payout amount is below the minimum threshold of $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}. Current amount: $${(payoutAmountCents / 100).toFixed(2)}.`,
          minimumCents: MIN_PAYOUT_CENTS,
          requestedCents: payoutAmountCents,
        });
      }
      if (payoutAmountCents > Math.round(summary.available * 100)) {
        return res.status(400).json({ error: "Payout amount exceeds available earnings" });
      }

      let payout;
      const now = new Date();
      if (requesterType === 'expert') {
        payout = await storage.createExpertPayout({
          expertId: requesterId,
          amount: (payoutAmountCents / 100).toFixed(2),
          status: "pending",
          requestedAt: now,
          notes: notes || "Admin-triggered payout",
        });
      } else {
        payout = await storage.createProviderPayout({
          providerId: requesterId,
          amount: (payoutAmountCents / 100).toFixed(2),
          status: "pending",
          requestedAt: now,
          notes: notes || "Admin-triggered payout",
        });
      }

      res.status(201).json({ ...payout, requesterType });
    } catch (error: any) {
      console.error("Error creating admin payout:", error);
      res.status(500).json({ message: "Failed to create payout", error: error.message });
    }
  });

router.patch("/api/admin/payouts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { id } = req.params;
      const { status, notes, transactionId, payoutReference, requesterType } = req.body;
      const validStatuses = ['processing', 'completed', 'failed'];
      const validTypes = ['expert', 'provider'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: processing, completed, failed" });
      }
      if (!requesterType || !validTypes.includes(requesterType)) {
        return res.status(400).json({ error: "Invalid requesterType. Must be 'expert' or 'provider'" });
      }
      let updated;
      if (status === 'completed') {
        const recipientId = await getPayoutRecipientId(id, requesterType);

        if (!recipientId) {
          return res.status(404).json({ error: "Payout not found" });
        }

        const recipientStripe = await storage.getUserStripeAccount(recipientId);

        if (recipientStripe.stripeAccountId && recipientStripe.canReceivePayments) {
          const { stripeConnectService } = await import('../services/stripe-connect.service');
          const payoutAmount = await getPayoutAmount(id, requesterType);

          const payoutAmountNum = parseFloat(payoutAmount || '0');

          // Minimum payout threshold — same floor as the creation gate (MONEY_MAP F-7)
          if (payoutAmountNum < MIN_PAYOUT_DOLLARS) {
            return res.status(400).json({
              error: `Payout of $${payoutAmountNum.toFixed(2)} is below the $${MIN_PAYOUT_DOLLARS.toFixed(2)} minimum. Accumulate more earnings before transferring.`,
              minimumDollars: MIN_PAYOUT_DOLLARS,
              requestedDollars: payoutAmountNum,
            });
          }

          // Check platform balance before initiating transfer
          try {
            const platformBalance = await stripeConnectService.getAccountBalance();
            if (platformBalance.available < payoutAmountNum) {
              return res.status(402).json({
                error: `Insufficient platform balance. Available: $${platformBalance.available.toFixed(2)}, Required: $${payoutAmountNum.toFixed(2)}`,
                platformAvailable: platformBalance.available,
                required: payoutAmountNum,
              });
            }
          } catch (balanceError: any) {
            console.error('Failed to check platform balance:', balanceError);
            return res.status(500).json({ error: "Failed to check platform balance before transfer" });
          }

          // Atomic claim BEFORE the transfer (money-safety idempotency): flip the row to
          // 'processing' only if it isn't already completed/processing. If zero rows claim, another
          // concurrent call / retry already owns this payout → do NOT transfer again. The DB
          // transition is the guard (a check-then-transfer is the double-spend TOCTOU we're closing).
          const claimed = requesterType === 'expert'
            ? await storage.claimExpertPayoutForProcessing(id)
            : await storage.claimProviderPayoutForProcessing(id);
          if (!claimed) {
            return res.status(409).json({
              error: "Payout is already processing or completed — refusing to transfer again.",
              payoutId: id,
            });
          }

          try {
            const transfer = await stripeConnectService.createTransfer(
              payoutAmountNum,
              'usd',
              recipientStripe.stripeAccountId,
              `Traveloure ${requesterType} payout`,
              { payoutId: id, requesterType, recipientId },
              // Deterministic key so even a process-level retry of the SAME payout can't double-transfer at Stripe.
              `payout-${requesterType}-${id}`,
            );

            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'completed', notes, transfer.transferId);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'completed', notes, transfer.transferId);
            }

            // Audit-log the approve (this is the money-moving branch — a real Stripe transfer just fired).
            await insertAccessAuditLog({
              actorId: userId,
              actorRole: user.role,
              action: "payout_approve",
              resourceType: "payout",
              resourceId: id,
              targetUserId: recipientId,
              metadata: { requesterType, amountDollars: payoutAmountNum, transferId: transfer.transferId, notes: notes ?? null },
              ipAddress: req.ip ?? null,
              userAgent: req.get("user-agent") ?? null,
            }).catch((err: any) => console.error("[admin-payouts] audit log failed (non-fatal):", err));

            // Send in-app notification to the recipient
            try {
              await storage.createNotification({
                userId: recipientId,
                type: 'payout_processed',
                title: 'Payout Processed',
                message: `Your payout of $${payoutAmountNum.toFixed(2)} has been processed and is on its way to your Stripe account.`,
                data: { payoutId: id, amount: payoutAmountNum, transferId: transfer.transferId },
              });
            } catch (notifError) {
              console.error('Failed to send payout notification:', notifError);
            }
          } catch (stripeError: any) {
            console.error('Stripe transfer failed:', stripeError);
            if (requesterType === 'expert') {
              updated = await storage.updateExpertPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            } else {
              updated = await storage.updateProviderPayoutStatus(id, 'failed', `Stripe transfer failed: ${stripeError.message}`);
            }
            await insertAccessAuditLog({
              actorId: userId,
              actorRole: user.role,
              action: "payout_approve_failed",
              resourceType: "payout",
              resourceId: id,
              targetUserId: recipientId,
              metadata: { requesterType, amountDollars: payoutAmountNum, stripeError: stripeError.message },
              ipAddress: req.ip ?? null,
              userAgent: req.get("user-agent") ?? null,
            }).catch((err: any) => console.error("[admin-payouts] audit log failed (non-fatal):", err));
            return res.json({ ...updated, stripeError: stripeError.message });
          }
        } else {
          return res.status(400).json({
            error: "Recipient does not have an active Stripe Connect account. They must complete onboarding first.",
            recipientId,
            hasStripeAccount: !!recipientStripe.stripeAccountId,
            canReceivePayments: recipientStripe.canReceivePayments,
          });
        }
      } else {
        if (requesterType === 'expert') {
          updated = await storage.updateExpertPayoutStatus(id, status, notes, transactionId);
        } else {
          updated = await storage.updateProviderPayoutStatus(id, status, notes, payoutReference);
        }
        // status is 'processing' or 'failed' here (the 'completed' branch is handled above).
        // 'failed' at this stage is an admin explicitly rejecting the payout request (no transfer attempted).
        if (updated) {
          await insertAccessAuditLog({
            actorId: userId,
            actorRole: user.role,
            action: status === 'failed' ? "payout_reject" : "payout_status_update",
            resourceType: "payout",
            resourceId: id,
            metadata: { requesterType, status, notes: notes ?? null },
            ipAddress: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
          }).catch((err: any) => console.error("[admin-payouts] audit log failed (non-fatal):", err));
        }
      }
      if (!updated) {
        return res.status(404).json({ error: "Payout not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update payout", error: error.message });
    }
  });

  // === Logistics: Temporal Anchors ===


router.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      const role = req.query.role as string | undefined;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      // Admin's IANA timezone (e.g. "America/New_York") so the "New Today"
      // aggregate uses the admin's local day boundary, not server UTC.
      const timezone = (req.query.timezone as string) || undefined;

      let conditions: any[] = [];
      // Always exclude soft-deleted users from the normal admin listing.
      // Deleted users are visible at GET /api/admin/users/deleted instead.
      conditions.push(eq(users.isDeleted, false));
      if (search) {
        conditions.push(
          or(
            like(users.email, `%${search}%`),
            like(users.firstName, `%${search}%`),
            like(users.lastName, `%${search}%`)
          )
        );
      }
      if (role) {
        // Filter-key vocabulary matches the client tabs: role *groups* expand to
        // the shared role lists (shared/roles.ts); anything else is an exact role.
        const roleGroups: Record<string, readonly string[]> = {
          expert: EXPERT_ROLES,
          provider: PROVIDER_ROLES,
          ea: ["executive_assistant"],
        };
        const roleList = roleGroups[role] ?? [role];
        conditions.push(inArray(users.role, [...roleList]));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const { allUsers, totalResult, stats } = await withQueryTimer(
        "admin-users-paginated",
        () => getAdminUsersPage(whereClause, limit, offset, timezone),
        (req.user as any)?.claims?.role
      );

      const enrichedUsers = await Promise.all(allUsers.map(async (u: any) => {
        const userTrips = await getUserTripCount(u.id);
        const userBookings = await getUserServiceBookings(u.id);
        const totalSpent = userBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        return {
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          email: u.email || "",
          role: u.role || "user",
          status: u.isSuspended ? "suspended" : "active",
          suspensionReason: u.suspensionReason || null,
          joined: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
          trips: Number(userTrips) || 0,
          spent: `$${totalSpent.toLocaleString()}`,
        };
      }));

      res.json({
        users: enrichedUsers,
        total: totalResult?.count || 0,
        // Whole-filtered-set aggregates so the stat cards don't change per page.
        stats,
        page,
        limit,
      });
    } catch (err) {
      console.error("Admin users error:", err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // === Admin: Soft-deleted user recovery list ===
  // Returns only users with is_deleted=true so support/recovery workflows can
  // inspect or restore accounts without commingling them with active users.

router.get("/api/admin/users/deleted", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const deletedUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          deletedAt: users.deletedAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.isDeleted, true))
        .orderBy(desc(users.deletedAt));

      res.json({ users: deletedUsers, total: deletedUsers.length });
    } catch (err) {
      console.error("Admin deleted users error:", err);
      res.status(500).json({ message: "Failed to fetch deleted users" });
    }
  });

  // === Admin: Force soft-delete a user account ===
  // Performs the same cascade as the self-service DELETE /api/auth/account but
  // allows an admin to delete any account (except their own, as a safety guard).

router.delete("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      const adminUser = req.user as any;
      if (adminUser?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const adminId: string = getUserId(req)!;

      if (targetUserId === adminId) {
        return res.status(400).json({ message: "Admins cannot delete their own account via this endpoint" });
      }

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId));

      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.isDeleted) {
        return res.json({ success: true, message: "User already deleted" });
      }

      const anonymizedEmail = `deleted_${targetUserId}@deleted.traveloure.com`;

      // 1 & 2: Anonymize PII + mark deleted
      await db
        .update(users)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          email: anonymizedEmail,
          password: null,
          instagramAccessToken: null,
        })
        .where(eq(users.id, targetUserId));

      // 3: Cancel pending expert requests
      await db
        .update(expertRequests)
        .set({ status: "cancelled" })
        .where(eq(expertRequests.userId, targetUserId));

      // 4a: Deactivate local expert form
      await db
        .update(localExpertForms)
        .set({ status: "deactivated" })
        .where(eq(localExpertForms.userId, targetUserId));

      // 4b: Deactivate service provider form
      await db
        .update(serviceProviderForms)
        .set({ status: "deactivated" })
        .where(eq(serviceProviderForms.userId, targetUserId));

      // 5: Destroy all sessions for target user from the PostgreSQL session store
      await db.execute(sql`
        DELETE FROM sessions
        WHERE sess -> 'passport' -> 'user' -> 'claims' ->> 'sub' = ${targetUserId}
           OR sess -> 'passport' -> 'user' ->> 'id' = ${targetUserId}
      `);

      console.info(`[admin-delete] Admin ${adminId} soft-deleted user ${targetUserId}`);
      res.json({ success: true, message: "User account deleted successfully" });
    } catch (err) {
      console.error("Admin delete user error:", err);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // === Admin Trips/Plans Management ===

// CLAUDE.md §13: `trips.status` is a dead write-once field (born draft/planning at creation,
// nothing ever advances it) — do not read it for phase. Every phase derivation here mirrors the
// date-derived convention already used by every traveler-facing renderer (client/src/pages/my-trips.tsx:
// past = endDate < now, active = startDate <= now <= endDate, upcoming = startDate > now).
// See docs/briefs/L3-trips-status-brief.md (Option B, ratified Jul 31, 2026).
function deriveTripPhase(startDate: unknown, endDate: unknown, now: Date): "upcoming" | "active" | "past" {
  const start = new Date(startDate as any);
  const end = new Date(endDate as any);
  if (end < now) return "past";
  if (start <= now && end >= now) return "active";
  return "upcoming";
}

router.get("/api/admin/trips", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const search = (req.query.search as string) || "";
      // §13: `status` filtering used to run `eq(trips.status, status)` against the dead field —
      // it never matched the client's "active"/"pending"/"completed" filter values (which aren't
      // trips.status vocabulary at all) and would have silently returned zero rows. Phase is now
      // date-derived IN SQL (getAdminTripsPage) so filtering + paging happen before enrichment.
      const rawPhase = req.query.status as string | undefined;
      const phaseFilter = rawPhase === "upcoming" || rawPhase === "active" || rawPhase === "past" ? rawPhase : undefined;
      const { limit, offset } = parsePagination(req.query);

      const { rows, stats, filteredTotal } = await getAdminTripsPage({
        search: search || undefined,
        phase: phaseFilter,
        limit,
        offset,
      });

      const now = new Date();

      // Batch owner lookup (one query per page, not one per trip).
      const ownerIds = Array.from(new Set(rows.map((t) => t.userId).filter((id): id is string => !!id)));
      const owners = await getUsersBasicByIds(ownerIds);
      const ownerMap = new Map(owners.map((u) => [u.id, u]));

      const enrichedTrips = rows.map((t) => {
        const owner = t.userId ? ownerMap.get(t.userId) : undefined;
        return {
          id: t.id,
          title: t.title || "Untitled Trip",
          type: t.eventType || "Travel",
          destination: t.destination || "TBD",
          startDate: t.startDate,
          endDate: t.endDate,
          guests: t.numberOfTravelers || 1,
          budget: t.budget ? `$${Number(t.budget).toLocaleString()}` : "N/A",
          // Honest, date-derived phase (§13) — NOT trips.status (dead field).
          status: deriveTripPhase(t.startDate, t.endDate, now),
          user: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email : "Unknown",
          created: t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown",
        };
      });

      // Honest labels (§13) — the three buckets are exactly the three phases SQL can derive.
      const statusCounts = {
        total: Number(stats.total ?? 0),
        upcoming: Number(stats.upcoming ?? 0),
        active: Number(stats.active ?? 0),
        past: Number(stats.past ?? 0),
      };

      res.json({
        trips: enrichedTrips,
        stats: statusCounts,
        total: filteredTotal,
        hasMore: offset + enrichedTrips.length < filteredTotal,
        limit,
        offset,
      });
    } catch (err) {
      console.error("Admin trips error:", err);
      res.status(500).json({ message: "Failed to fetch trips" });
    }
  });

  // === Admin Analytics Overview ===

router.get("/api/admin/analytics/overview", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await getAllUsersBasic();
      const allBookings = await storage.getServiceBookings({});
      const allTrips = await getAllTrips();
      const allReviews = await getAllServiceReviews();

      const totalUsers = allUsers.length;
      const completedBookings = allBookings.filter(b => b.status === "completed");
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);

      const destCounts: Record<string, { bookings: number; revenue: number }> = {};
      allTrips.forEach(t => {
        const dest = t.destination || "Unknown";
        if (!destCounts[dest]) destCounts[dest] = { bookings: 0, revenue: 0 };
        destCounts[dest].bookings++;
        destCounts[dest].revenue += Number(t.budget || 0);
      });
      const topDestinations = Object.entries(destCounts)
        .map(([name, data]) => ({ name, bookings: data.bookings, revenue: `$${data.revenue.toLocaleString()}` }))
        .sort((a, b) => b.bookings - a.bookings)
        .slice(0, 5);

      const roleCounts: Record<string, number> = {};
      allUsers.forEach(u => {
        const role = u.role || "user";
        roleCounts[role] = (roleCounts[role] || 0) + 1;
      });
      const userDemographics = Object.entries(roleCounts)
        .map(([segment, count]) => ({
          segment: segment.charAt(0).toUpperCase() + segment.slice(1) + "s",
          percentage: Math.round((count / totalUsers) * 100),
        }))
        .sort((a, b) => b.percentage - a.percentage);

      const now = new Date();
      const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const weeklyActivity = weekDays.map((day, i) => {
        const dayDate = new Date(now);
        dayDate.setDate(now.getDate() - (now.getDay() - i));
        const dayUsers = allUsers.filter(u => {
          if (!u.createdAt) return false;
          const d = new Date(u.createdAt);
          return d.toDateString() === dayDate.toDateString();
        }).length;
        return { day, users: dayUsers };
      });

      const avgRating = allReviews.length > 0
        ? allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length
        : 0;

      res.json({
        metrics: [
          { label: "Total Users", value: totalUsers.toLocaleString(), change: `+${allUsers.filter(u => { const d = u.createdAt ? new Date(u.createdAt) : null; return d && d > new Date(now.getTime() - 30*24*60*60*1000); }).length} this month`, positive: true },
          { label: "Total Bookings", value: allBookings.length.toLocaleString(), change: `${completedBookings.length} completed`, positive: true },
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, change: `${allBookings.filter(b => b.status === "pending").length} pending`, positive: true },
          { label: "Avg Rating", value: avgRating.toFixed(1), change: `${allReviews.length} reviews`, positive: avgRating >= 4.0 },
        ],
        topDestinations,
        userDemographics,
        weeklyActivity,
      });
    } catch (err) {
      console.error("Admin analytics error:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

// GET /api/admin/analytics/export?from=&to=&format=csv — CSV download of the same data the
// analytics overview shows, optionally filtered to a created-at date range. Additive; the
// overview endpoint is untouched.
router.get("/api/admin/analytics/export", isAuthenticated, async (req, res) => {
  const user = await getFullAdminUser(getUserId(req)!);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  try {
    const fromParam = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : null;
    const toParam = typeof req.query.to === "string" && req.query.to ? new Date(req.query.to) : null;
    const from = fromParam && !isNaN(fromParam.getTime()) ? fromParam : null;
    const to = toParam && !isNaN(toParam.getTime()) ? toParam : null;
    const inRange = (d: Date | string | null | undefined) => {
      if (!from && !to) return true;
      if (!d) return false;
      const t = new Date(d).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    };

    const allUsers = (await getAllUsersBasic()).filter(u => inRange(u.createdAt as any));
    const allBookings = (await storage.getServiceBookings({})).filter(b => inRange(b.createdAt as any));
    const allTrips = (await getAllTrips()).filter((t: any) => inRange(t.createdAt));
    const allReviews = (await getAllServiceReviews()).filter((r: any) => inRange(r.createdAt));

    const completedBookings = allBookings.filter(b => b.status === "completed");
    const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / allReviews.length
      : 0;

    const destCounts: Record<string, { bookings: number; revenue: number }> = {};
    allTrips.forEach((t: any) => {
      const dest = t.destination || "Unknown";
      if (!destCounts[dest]) destCounts[dest] = { bookings: 0, revenue: 0 };
      destCounts[dest].bookings++;
      destCounts[dest].revenue += Number(t.budget || 0);
    });

    const roleCounts: Record<string, number> = {};
    allUsers.forEach(u => {
      const role = u.role || "user";
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    const esc = (v: unknown) => {
      let s = String(v ?? "");
      // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR would be
      // evaluated by Excel/Sheets even inside a quoted cell. Prefix with an apostrophe.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    lines.push("Section,Label,Value");
    lines.push(`Range,From,${esc(from ? from.toISOString() : "all time")}`);
    lines.push(`Range,To,${esc(to ? to.toISOString() : "now")}`);
    lines.push(`Metrics,Total Users,${allUsers.length}`);
    lines.push(`Metrics,Total Bookings,${allBookings.length}`);
    lines.push(`Metrics,Completed Bookings,${completedBookings.length}`);
    lines.push(`Metrics,Total Revenue,${totalRevenue.toFixed(2)}`);
    lines.push(`Metrics,Avg Rating,${avgRating.toFixed(2)}`);
    lines.push(`Metrics,Total Reviews,${allReviews.length}`);
    Object.entries(destCounts)
      .sort((a, b) => b[1].bookings - a[1].bookings)
      .forEach(([name, d]) => lines.push(`Top Destinations,${esc(name)},${d.bookings} trips / $${d.revenue.toFixed(2)}`));
    Object.entries(roleCounts).forEach(([role, count]) => lines.push(`User Roles,${esc(role)},${count}`));

    const filename = `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(lines.join("\n"));
  } catch (err) {
    console.error("Admin analytics export error:", err);
    res.status(500).json({ message: "Failed to export analytics" });
  }
});

  // Country/Region Analytics

router.get("/api/admin/analytics/by-country", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { expertsByCountry, providersByCountry, tripsByDestination } = await getAnalyticsByCountry();

      // Get bookings summary
      const allBookings = await storage.getServiceBookings({});
      const bookingsByStatus = {
        total: allBookings.length,
        completed: allBookings.filter(b => b.status === "completed").length,
        pending: allBookings.filter(b => b.status === "pending").length,
        cancelled: allBookings.filter(b => b.status === "cancelled").length,
      };

      res.json({
        expertsByCountry: expertsByCountry.map(e => ({
          country: e.country || "Unknown",
          total: e.count,
          approved: e.approved || 0,
          pending: e.pending || 0,
        })),
        providersByCountry: providersByCountry.map(p => ({
          country: p.country || "Unknown",
          total: p.count,
          approved: p.approved || 0,
          pending: p.pending || 0,
        })),
        tripsByDestination: tripsByDestination.map(t => ({
          destination: t.destination || "Unknown",
          count: t.count,
        })),
        bookingsSummary: bookingsByStatus,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Country analytics error:", err);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  // Expert Analytics - detailed breakdown

router.get("/api/admin/analytics/experts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { byCountry, byCity, statusSummary, byExperience } = await getExpertAnalytics();

      res.json({
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        byCity: byCity.map(c => ({
          city: c.city || "Unknown",
          country: c.country || "",
          count: c.count,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        byExperience: byExperience.map(e => ({
          years: e.years || "Unknown",
          count: e.count,
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Expert analytics error:", err);
      res.status(500).json({ message: "Failed to fetch expert analytics" });
    }
  });

  // Provider Analytics - detailed breakdown

router.get("/api/admin/analytics/providers", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { byBusinessType, byCountry, statusSummary, activeServices, topProviders } = await getProviderAnalytics();

      res.json({
        byBusinessType: byBusinessType.map(b => ({
          type: b.businessType || "Unknown",
          total: b.count,
          approved: b.approved || 0,
        })),
        byCountry: byCountry.map(c => ({
          country: c.country || "Unknown",
          total: c.count,
          approved: c.approved || 0,
        })),
        statusSummary: {
          total: statusSummary.reduce((sum, s) => sum + s.count, 0),
          pending: statusSummary.find(s => s.status === "pending")?.count || 0,
          approved: statusSummary.find(s => s.status === "approved")?.count || 0,
          rejected: statusSummary.find(s => s.status === "rejected")?.count || 0,
        },
        activeServicesCount: activeServices[0]?.count || 0,
        topProviders: topProviders.map(p => ({
          serviceName: p.serviceName,
          bookings: p.bookingsCount || 0,
          revenue: `$${Number(p.totalRevenue || 0).toLocaleString()}`,
          rating: Number(p.averageRating || 0).toFixed(1),
        })),
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Provider analytics error:", err);
      res.status(500).json({ message: "Failed to fetch provider analytics" });
    }
  });

  // === Tourism Analytics Dashboard ===

router.get("/api/admin/analytics/tourism", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const {
        destinationDemand, bookingTrends, sourceMarkets, usersByMonth,
        spendingPatterns, allTrips,
      } = await getTourismAnalytics();

      const partyComposition = {
        solo: 0,
        couples: 0,
        families: 0,
        groups: 0,
      };

      allTrips.forEach(trip => {
        const adults = trip.adults || 1;
        const kids = trip.kids || 0;
        const total = trip.numberOfTravelers || adults + kids;

        if (total === 1) {
          partyComposition.solo++;
        } else if (total === 2 && kids === 0) {
          partyComposition.couples++;
        } else if (kids > 0) {
          partyComposition.families++;
        } else if (total > 2) {
          partyComposition.groups++;
        } else {
          partyComposition.couples++;
        }
      });

      // NEW-1 (V3): getTourismSummaryMetrics never returned seasonality/eventTypes — those
      // come from their own (previously imported-but-uncalled) query helpers.
      const [{ totalBookings, completedBookings, avgTripDuration }, seasonality, eventTypes] = await Promise.all([
        getTourismSummaryMetrics(),
        getTourismSeasonality(),
        getTourismEventTypes(),
      ]);
      const totalTrips = allTrips.length;

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      res.json({
        destinationDemand: destinationDemand.map(d => ({
          destination: d.destination || "Unknown",
          searches: d.searchCount,
          totalBudget: Math.round(Number(d.totalBudget || 0)),
          avgBudget: Math.round(Number(d.avgBudget || 0)),
        })),
        bookingTrends: bookingTrends.map(b => ({
          month: b.month,
          bookings: b.count,
          revenue: Math.round(Number(b.revenue || 0)),
        })),
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          travelers: s.count,
        })),
        userGrowth: usersByMonth.map(u => ({
          month: u.month,
          users: u.count,
        })),
        spendingPatterns: spendingPatterns.map(s => ({
          destination: s.destination || "Unknown",
          avgSpend: Math.round(Number(s.avgSpend || 0)),
          minSpend: Math.round(Number(s.minSpend || 0)),
          maxSpend: Math.round(Number(s.maxSpend || 0)),
          trips: s.tripCount,
        })),
        partyComposition: [
          { type: "Solo", count: partyComposition.solo, color: "#8884d8" },
          { type: "Couples", count: partyComposition.couples, color: "#82ca9d" },
          { type: "Families", count: partyComposition.families, color: "#ffc658" },
          { type: "Groups", count: partyComposition.groups, color: "#ff7c43" },
        ],
        seasonality: monthNames.map((name, i) => {
          const monthData = seasonality.find(s => s.month === i + 1);
          return {
            month: name,
            monthNum: i + 1,
            bookings: monthData?.count || 0,
            avgBudget: Math.round(Number(monthData?.avgBudget || 0)),
          };
        }),
        eventTypes: eventTypes.map(e => ({
          type: e.eventType || "vacation",
          count: e.count,
        })),
        summary: {
          totalTrips,
          totalBookings: totalBookings[0]?.count || 0,
          completedBookings: completedBookings[0]?.count || 0,
          totalRevenue: Math.round(Number(completedBookings[0]?.revenue || 0)),
          avgTripDuration: Math.round(Number(avgTripDuration[0]?.avgDays || 0)),
          avgPartySize: totalTrips > 0 
            ? Math.round(allTrips.reduce((sum, t) => sum + (t.numberOfTravelers || t.adults || 1) + (t.kids || 0), 0) / totalTrips * 10) / 10
            : 0,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Tourism analytics error:", err);
      res.status(500).json({ message: "Failed to fetch tourism analytics" });
    }
  });

  // === Audit Logs ===

/**
 * GET /api/admin/audit-logs/role-changes
 * Returns paginated role-change events from access_audit_logs.
 * Query params: limit, offset, targetUserId, dateFrom, dateTo
 */
router.get("/api/admin/audit-logs/role-changes", isAuthenticated, requireAdminLocal, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(String(req.query.limit  ?? "25"), 10) || 25, 100);
    const offset = parseInt(String(req.query.offset ?? "0"),  10) || 0;
    const targetUserId = req.query.targetUserId ? String(req.query.targetUserId) : undefined;
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
    const dateTo   = req.query.dateTo   ? new Date(String(req.query.dateTo) + "T23:59:59Z") : undefined;

    const result = await getRoleChangeAuditLogs({ targetUserId, dateFrom, dateTo, limit, offset });
    res.json({ ...result, limit, offset });
  } catch (err) {
    console.error("Audit-log role-changes error:", err);
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
});

  // === Admin System Health ===

router.get("/api/admin/system/health", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dbStart = Date.now();
      let dbStatus = "operational";
      try {
        await pingDb();
      } catch {
        // DB ping failure is represented as degraded status — never abort the health response.
        dbStatus = "degraded";
      }
      const dbLatency = Date.now() - dbStart;

      const services = [
        { service: "Web Server", status: "operational", uptime: "99.9%", latency: `${process.uptime().toFixed(0)}s uptime` },
        { service: "Database", status: dbStatus, uptime: dbLatency < 100 ? "99.9%" : "99.0%", latency: `${dbLatency}ms` },
        { service: "AI Processing", status: "operational", uptime: "99.5%" },
        { service: "Payment Gateway", status: "operational", uptime: "99.9%" },
        { service: "Email Service", status: "operational", uptime: "99.5%" },
        { service: "CDN", status: "operational", uptime: "99.9%" },
      ];

      let aiUsage = { used: 0, limit: 1000000, cost: "$0" };
      let apiUsage = { transactions: 0, volume: "$0" };
      try {
        const { aiUsageService: aiSvc } = await import('../services/ai-usage.service');
        const summary = await aiSvc.getSummary();
        aiUsage = { used: summary.totalTokens || 0, limit: 1000000, cost: `$${(summary.totalCostDollars || 0).toFixed(2)}` };
      } catch (aiErr) {
        console.warn("[admin/system-health] Could not load AI usage summary — returning defaults:", aiErr);
      }

      try {
        const allBookings = await storage.getServiceBookings({});
        const completedBookings = allBookings.filter(b => b.status === "completed");
        const volume = completedBookings.reduce((sum, b) => sum + parseFloat(b.totalAmount || "0"), 0);
        apiUsage = { transactions: allBookings.length, volume: `$${volume.toLocaleString()}` };
      } catch (bookingErr) {
        console.warn("[admin/system-health] Could not load booking usage stats — returning defaults:", bookingErr);
      }

      res.json({
        services,
        apiUsage: {
          claude: aiUsage,
          stripe: apiUsage,
          email: { sent: 0, bounceRate: "0%" },
        },
      });
    } catch (err) {
      console.error("System health error:", err);
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  // === Admin Test Email ===

  router.post("/api/admin/system/test-email", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const adminUser = await getFullAdminUser(userId);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Optional custom recipient — falls back to admin's own address.
      const rawTo = (req.body?.to as string | undefined)?.trim();
      if (rawTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawTo)) {
        return res.status(400).json({ ok: false, error: "Invalid email address in 'to' field" });
      }
      const toEmail = rawTo || adminUser.email;
      if (!toEmail) {
        return res.status(400).json({ ok: false, error: "Admin account has no email address on file" });
      }

      // Call Resend directly — same pattern as auth-critical emails — so the test
      // works even when email_notifications_enabled is turned off in platform settings.
      // This is intentional: admins must be able to verify delivery credentials
      // regardless of the notification kill-switch state.
      const { getAppBaseUrl } = await import("../services/email.service");
      const { Resend } = await import("resend");
      const appUrl = getAppBaseUrl();

      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.EMAIL_FROM_NOREPLY ?? process.env.EMAIL_FROM;
      const replyTo = process.env.EMAIL_REPLY_TO ?? toEmail;
      if (!apiKey) return res.status(502).json({ ok: false, error: "RESEND_API_KEY is not configured" });
      if (!from) return res.status(502).json({ ok: false, error: "EMAIL_FROM is not configured" });

      const resendClient = new Resend(apiKey);
      const emailPayload: Record<string, unknown> = {
        from,
        to: toEmail,
        replyTo,
        subject: "[Traveloure] Test email — delivery verified",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #FF385C; margin-bottom: 8px;">Test Email</h2>
            <p style="color: #374151;">Hi ${adminUser.firstName ?? adminUser.email},</p>
            <p style="color: #374151;">
              This is a test email sent from the Traveloure admin panel to confirm that email
              delivery is working correctly.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #F9FAFB; border-radius: 8px; overflow: hidden;">
              <tr>
                <td style="padding: 12px 16px; color: #6B7280; width: 40%;">Sent to</td>
                <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${toEmail}</td>
              </tr>
              <tr style="background: #F3F4F6;">
                <td style="padding: 12px 16px; color: #6B7280;">Sent at</td>
                <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${new Date().toISOString()}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; color: #6B7280;">Platform</td>
                <td style="padding: 12px 16px; color: #111827; font-weight: 600;">${appUrl}</td>
              </tr>
            </table>
            <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px;">
              This email was triggered manually from the admin system settings page.<br>
              If you did not initiate this, another admin may have sent it.
            </p>
          </div>
        `,
        text: [
          "Test Email",
          "",
          `Hi ${adminUser.firstName ?? adminUser.email},`,
          "",
          "This is a test email sent from the Traveloure admin panel to confirm that email delivery is working correctly.",
          "",
          `Sent to:  ${toEmail}`,
          `Sent at:  ${new Date().toISOString()}`,
          `Platform: ${appUrl}`,
          "",
          "This email was triggered manually from the admin system settings page.",
        ].join("\n"),
      };

      // Use test hook when set (unit tests only); real Resend client in production.
      const sender = _adminTestEmailHooks.resendSend
        ? _adminTestEmailHooks.resendSend
        : (payload: Record<string, unknown>) => resendClient.emails.send(payload as any);

      const timeoutMs = _adminTestEmailHooks.resendTimeoutMs ?? 12_000;

      let sendResult: { data: { id?: string } | null; error: { message?: string } | null };
      try {
        sendResult = await Promise.race([
          sender(emailPayload),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("__RESEND_TIMEOUT__")),
              timeoutMs,
            ),
          ),
        ]);
      } catch (sendErr) {
        const errMsg = (sendErr as Error)?.message ?? String(sendErr);
        if (errMsg === "__RESEND_TIMEOUT__") {
          console.error("[admin/test-email] Resend API timed out after", timeoutMs, "ms");
          return res.status(504).json({
            ok: false,
            error: "Email service did not respond in time. Please try again.",
          });
        }
        console.error("[admin/test-email] send error:", errMsg);
        return res.status(502).json({ ok: false, error: errMsg });
      }

      const { data: emailData, error: emailError } = sendResult;

      if (emailError) {
        const msg = String((emailError as { message?: string }).message ?? emailError);
        console.error("[admin/test-email] Resend error:", msg);
        return res.status(502).json({ ok: false, error: msg });
      }

      const emailId = (emailData as { id?: string } | null)?.id;
      return res.json({ ok: true, id: emailId, to: toEmail });
    } catch (err) {
      console.error("[admin/test-email] unexpected error:", err);
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  });

  // === Admin Global Search ===

router.get("/api/admin/search", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const q = (req.query.q as string) || "";
      if (!q.trim()) {
        return res.json({ results: [], counts: {} });
      }

      const searchPattern = `%${q}%`;

      const { matchedUsers, matchedTrips, matchedServices } = await adminGlobalSearch(searchPattern);

      const results = [
        ...matchedUsers.map(u => ({
          id: u.id,
          // Role families from shared/roles.ts — the old bare-string checks typed every
          // local_expert/travel_expert/event_planner AND every service_provider as "user".
          type: isExpertRole(u.role) ? "expert" as const : isProviderRole(u.role) ? "provider" as const : "user" as const,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unknown",
          description: u.email || "",
          meta: `Role: ${u.role || "user"}`,
        })),
        ...matchedTrips.map(t => ({
          id: t.id,
          type: "plan" as const,
          name: t.title || "Untitled Trip",
          description: `${t.destination || "TBD"} - ${t.startDate || ""}`,
          meta: t.budget ? `Budget: $${Number(t.budget).toLocaleString()}` : undefined,
        })),
        ...matchedServices.map(s => ({
          id: s.id,
          type: "provider" as const,
          name: s.serviceName || "Unnamed Service",
          description: s.location || "",
          meta: s.averageRating ? `${s.averageRating} rating` : undefined,
        })),
      ];

      const { userCount, expertCount, tripCount, serviceCount } = await getAdminSearchCounts();

      res.json({
        results,
        counts: {
          users: userCount?.count || 0,
          experts: expertCount?.count || 0,
          providers: serviceCount?.count || 0,
          plans: tripCount?.count || 0,
        },
      });
    } catch (err) {
      console.error("Admin search error:", err);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // === Platform Stats (Public) ===

router.get("/api/admin/notifications", isAuthenticated, async (req, res) => {
    try {
      // DB role lookup harvested from the routes.ts shadow copy — the previous
      // `claims?.role` check 403'd every real admin (no auth flow writes a role
      // claim into the session; role lives in the users table). Belt-and-suspenders
      // under the blanket adminApiGuard (§2).
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const [userNotifs, adminAlerts] = await Promise.all([
        getAdminNotifications(userId),
        db.select().from(adminNotificationsTable)
          .orderBy(desc(adminNotificationsTable.createdAt))
          .limit(50),
      ]);

      const enrichedUser = userNotifs.map(n => ({
        id: n.id,
        type: n.type?.includes("warning") || n.type?.includes("dispute") ? "warning"
          : n.type?.includes("success") || n.type?.includes("payment") ? "success"
          : n.type?.includes("alert") ? "alert"
          : "info",
        category: n.relatedType || "System",
        title: n.title || "Notification",
        message: n.message || "",
        time: n.createdAt ? getRelativeTime(n.createdAt) : "Unknown",
        createdAt: n.createdAt,
        read: n.isRead || false,
      }));

      // Platform-level alerts (reconciliation mismatches, unassigned leads,
      // service requests, etc.) live in admin_notifications with numeric ids;
      // prefix them so PATCH can route to the right table.
      const alertCategory = (type: string) =>
        type.includes("reconciliation") ? "Reconciliation"
          : type.includes("lead") || type.includes("expert") ? "Lead Routing"
          : type.includes("service") ? "Service Requests"
          : "Platform Alert";
      const enrichedAlerts = adminAlerts.map(n => ({
        id: `alert-${n.id}`,
        type: n.type?.includes("mismatch") || n.type?.includes("reconciliation") ? "warning"
          : "alert",
        category: alertCategory(n.type || ""),
        title: n.destination ? `${alertCategory(n.type || "")}: ${n.destination}` : alertCategory(n.type || ""),
        message: [n.message, n.reason].filter(Boolean).join(" — "),
        time: n.createdAt ? getRelativeTime(n.createdAt) : "Unknown",
        createdAt: n.createdAt,
        read: n.isRead || false,
      }));

      const merged = [...enrichedUser, ...enrichedAlerts]
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
        .map(({ createdAt, ...rest }) => rest);

      res.json(merged);
    } catch (err) {
      console.error("Admin notifications error:", err);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  function getRelativeTime(date: Date | string): string {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // ============================================================
  // SHAREABLE ITINERARY CARD SYSTEM
  // ============================================================

  // POST /api/itinerary-variants/:variantId/share

router.get("/api/admin/reports/destination-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const destinationDemand = await getDestinationDemandReport();

      res.json({
        reportType: "destination_demand",
        generatedAt: new Date().toISOString(),
        data: destinationDemand,
        summary: {
          totalDestinations: destinationDemand.length,
          totalSearches: destinationDemand.reduce((sum, d) => sum + d.searchCount, 0),
        }
      });
    } catch (err) {
      console.error("Destination demand report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Service Provider Market Report

router.get("/api/admin/reports/provider-market", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { marketByType, topServices } = await getProviderMarketReport();

      res.json({
        reportType: "provider_market",
        generatedAt: new Date().toISOString(),
        marketByType,
        topServices,
      });
    } catch (err) {
      console.error("Provider market report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Geographic Insights Report (sell to countries/tourism boards)

router.get("/api/admin/reports/geographic-insights", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { travelerOrigins, expertCoverage } = await getGeographicInsightsReport();

      res.json({
        reportType: "geographic_insights",
        generatedAt: new Date().toISOString(),
        travelerOrigins,
        expertCoverage,
        insights: {
          topDestinations: travelerOrigins.slice(0, 5).map(t => t.country),
          underservedMarkets: expertCoverage.filter(e => e.expertCount < 3).map(e => `${e.city}, ${e.country}`),
        }
      });
    } catch (err) {
      console.error("Geographic insights error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Conversion Funnel Report

router.get("/api/admin/reports/conversion-funnel", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const funnelData = await getConversionFunnelReport();

      const stages = ["search", "view", "cart", "checkout", "payment", "complete"];
      const orderedFunnel = stages.map(stage => {
        const data = funnelData.find(f => f.stage === stage);
        return {
          stage,
          count: data?.count || 0,
          uniqueUsers: data?.uniqueUsers || 0,
          avgPrice: data?.avgPrice || 0,
        };
      });

      res.json({
        reportType: "conversion_funnel",
        generatedAt: new Date().toISOString(),
        funnel: orderedFunnel,
        conversionRates: {
          searchToView: orderedFunnel[0].count > 0 ? ((orderedFunnel[1].count / orderedFunnel[0].count) * 100).toFixed(1) + "%" : "0%",
          viewToCart: orderedFunnel[1].count > 0 ? ((orderedFunnel[2].count / orderedFunnel[1].count) * 100).toFixed(1) + "%" : "0%",
          cartToComplete: orderedFunnel[2].count > 0 ? ((orderedFunnel[5].count / orderedFunnel[2].count) * 100).toFixed(1) + "%" : "0%",
        }
      });
    } catch (err) {
      console.error("Conversion funnel error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });


  // Track activity/service interactions

router.get("/api/admin/reports/activity-demand", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { byActivityType, byDestination, byTripType, byOriginCountry } = await getActivityDemandReport();

      res.json({
        reportType: "activity_demand",
        generatedAt: new Date().toISOString(),
        byActivityType: byActivityType.map(a => ({
          type: a.activityType,
          views: a.views || 0,
          inquiries: a.inquiries || 0,
          bookings: a.bookings || 0,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
          avgPrice: `$${Number(a.avgPrice || 0).toFixed(0)}`,
          avgGroupSize: a.avgGroupSize || 0,
          conversionRate: a.views > 0 ? `${((a.bookings / a.views) * 100).toFixed(1)}%` : "0%",
        })),
        byDestination,
        byTripType,
        byOriginCountry: byOriginCountry.map(o => ({
          country: o.originCountry || "Unknown",
          activityType: o.activityType,
          bookings: o.bookings,
          avgSpend: `$${Number(o.avgSpend || 0).toFixed(0)}`,
        })),
        insights: {
          topActivities: byActivityType.slice(0, 5).map(a => a.activityType),
          highestRevenue: byActivityType.sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 3).map(a => a.activityType),
          highestConversion: byActivityType.filter(a => a.views > 10).sort((a, b) => (b.bookings / b.views) - (a.bookings / a.views)).slice(0, 3).map(a => a.activityType),
        }
      });
    } catch (err) {
      console.error("Activity demand report error:", err);
      res.status(500).json({ message: "Failed to generate activity report" });
    }
  });

  // Activity trends by category (for selling to specific industries)

router.get("/api/admin/reports/activity-trends/:activityType", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const activityType = req.params.activityType;
      const { destinations, travelerProfiles } = await getActivityTrendsReport(activityType);

      res.json({
        reportType: `activity_trends_${activityType}`,
        activityType,
        generatedAt: new Date().toISOString(),
        topDestinations: destinations,
        travelerProfiles,
        summary: {
          totalBookings: destinations.reduce((sum, d) => sum + d.bookings, 0),
          totalRevenue: `$${destinations.reduce((sum, d) => sum + Number(d.revenue || 0), 0).toLocaleString()}`,
          topMarket: destinations[0]?.destination || "N/A",
        }
      });
    } catch (err) {
      console.error("Activity trends report error:", err);
      res.status(500).json({ message: "Failed to generate activity trends" });
    }
  });


  // Track enhanced trip analytics

router.get("/api/admin/reports/destination-benchmark/:destination", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (user?.claims?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const destination = decodeURIComponent(req.params.destination);
      const { metrics, sourceMarkets, tripPurposes, partyTypes, activities, seasonality } = await getDestinationBenchmarkReport(destination);

      res.json({
        reportType: "destination_benchmark",
        destination,
        generatedAt: new Date().toISOString(),
        overview: metrics[0] || {},
        sourceMarkets: sourceMarkets.map(s => ({
          country: s.country || "Unknown",
          visitors: s.count,
          avgSpend: `$${Number(s.avgSpend || 0).toLocaleString()}`,
          share: metrics[0]?.totalTrips ? `${((s.count / metrics[0].totalTrips) * 100).toFixed(1)}%` : "0%",
        })),
        tripPurposes: tripPurposes.map(t => ({
          purpose: t.purpose || "Unknown",
          count: t.count,
        })),
        partyTypes: partyTypes.map(p => ({
          type: p.composition || "Unknown",
          count: p.count,
          avgSpend: `$${Number(p.avgSpend || 0).toLocaleString()}`,
        })),
        topActivities: activities.map(a => ({
          activity: a.activityType,
          bookings: a.bookings,
          revenue: `$${Number(a.revenue || 0).toLocaleString()}`,
        })),
        seasonality: seasonality.map(s => ({
          month: s.month?.trim() || "Unknown",
          bookings: s.count,
        })),
        insights: {
          topSourceMarket: sourceMarkets[0]?.country || "N/A",
          primaryTripPurpose: tripPurposes[0]?.purpose || "N/A",
          mostPopularActivity: activities[0]?.activityType || "N/A",
          peakSeason: seasonality[0]?.month?.trim() || "N/A",
        }
      });
    } catch (err) {
      console.error("Destination benchmark error:", err);
      res.status(500).json({ message: "Failed to generate benchmark report" });
    }
  });


  // === AUTO-INFER ANALYTICS FROM USER BEHAVIOR ===
  
  // Middleware/helper to infer trip analytics from itinerary data
  async function inferTripAnalytics(tripId: string, userId: string) {
    try {
      const { tripAnalyticsEnhanced } = await import("@shared/schema");
      
      // Get trip data
      const trip = await storage.getTrip(tripId);
      if (!trip) return;

      // Get itinerary items for this trip
      const itineraryData = await getGeneratedItinerary(tripId);
      const items = itineraryData?.itineraryData as any;

      // Infer party composition from travelers + event type
      let partyComposition = "group";
      const travelers = trip.numberOfTravelers || 1;
      const eventType = trip.eventType || "vacation";
      
      if (travelers === 1) partyComposition = "solo";
      else if (travelers === 2 && ["honeymoon", "anniversary", "proposal", "romantic"].includes(eventType)) partyComposition = "couple";
      else if (travelers <= 4 && eventType === "vacation") partyComposition = "family";
      else partyComposition = "group";

      // Infer if has children from activities (look for kid-friendly keywords)
      let hasChildren = false;
      if (items?.dailyItinerary) {
        const allActivities = JSON.stringify(items.dailyItinerary).toLowerCase();
        hasChildren = allActivities.includes("kid") || allActivities.includes("child") || 
                     allActivities.includes("family") || allActivities.includes("playground") ||
                     allActivities.includes("zoo") || allActivities.includes("aquarium");
      }

      // Calculate length of stay
      const startDate = trip.startDate ? new Date(trip.startDate) : null;
      const endDate = trip.endDate ? new Date(trip.endDate) : null;
      const lengthOfStay = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

      // Determine season
      let season = null;
      if (startDate) {
        const month = startDate.getMonth();
        if (month >= 2 && month <= 4) season = "spring";
        else if (month >= 5 && month <= 7) season = "summer";
        else if (month >= 8 && month <= 10) season = "fall";
        else season = "winter";
      }

      // Infer destination details
      const destination = trip.destination || "";
      // Try to extract country from destination string
      const destinationParts = destination.split(",").map(s => s.trim());
      const destinationCity = destinationParts[0] || destination;
      const destinationCountry = destinationParts.length > 1 ? destinationParts[destinationParts.length - 1] : null;

      // Infer price segment from budget
      let priceSegment = "mid-range";
      const budget = parseFloat(trip.budget || "0");
      const dailyBudget = lengthOfStay && lengthOfStay > 0 ? budget / lengthOfStay : budget;
      if (dailyBudget < 100) priceSegment = "budget";
      else if (dailyBudget < 300) priceSegment = "mid-range";
      else if (dailyBudget < 500) priceSegment = "luxury";
      else priceSegment = "ultra-luxury";

      // Infer primary activity from itinerary
      let primaryActivity = null;
      if (items?.dailyItinerary) {
        const activityCounts: Record<string, number> = {};
        for (const day of items.dailyItinerary) {
          for (const activity of day.activities || []) {
            const type = activity.type || activity.category || "sightseeing";
            activityCounts[type] = (activityCounts[type] || 0) + 1;
          }
        }
        primaryActivity = Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      }

      // Upsert analytics record
      await upsertTripAnalyticsEnhanced({
        tripId,
        userId,
        destinationCity,
        destinationCountry,
        tripStartDate: startDate,
        tripEndDate: endDate,
        lengthOfStay,
        season,
        partySize: travelers,
        partyComposition,
        hasChildren,
        tripPurpose: eventType,
        totalBudget: trip.budget,
        priceSegment,
        primaryActivity,
      });

      return true;
    } catch (err) {
      console.error("Error inferring trip analytics:", err);
      return false;
    }
  }

  // === Review Moderation Routes (REV-MOD) ===

// ─── Message-abuse moderation queue (migration 228) ──────────────────────────
// GET  /api/admin/message-reports   — list reports filterable by status
// PATCH /api/admin/message-reports/:id — update status + optional admin note

router.get("/api/admin/message-reports", isAuthenticated, async (req, res) => {
  try {
    const actorId = getUserId(req)!;
    const adminCheck = await getAdminRole(actorId);
    if (!adminCheck || adminCheck.role !== "admin") return res.status(403).json({ message: "Admin access required" });

    const statusParam = (req.query.status as string) || "pending";
    const rows = await db
      .select({
        id: messageReports.id,
        reporterId: messageReports.reporterId,
        reportedUserId: messageReports.reportedUserId,
        messageId: messageReports.messageId,
        reportType: messageReports.reportType,
        reason: messageReports.reason,
        details: messageReports.details,
        status: messageReports.status,
        adminNote: messageReports.adminNote,
        createdAt: messageReports.createdAt,
      })
      .from(messageReports)
      .where(eq(messageReports.status, statusParam))
      .orderBy(desc(messageReports.createdAt))
      .limit(100);

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const reporter = await storage.getUser(row.reporterId);
        const reported = await storage.getUser(row.reportedUserId);
        let messageText: string | null = null;
        if (row.messageId) {
          const [msg] = await db
            .select({ message: userAndExpertChats.message })
            .from(userAndExpertChats)
            .where(eq(userAndExpertChats.id, row.messageId));
          messageText = msg?.message ?? null;
        }
        return {
          ...row,
          reporterName: reporter
            ? [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") || reporter.email || "Unknown"
            : "Unknown",
          reportedUserName: reported
            ? [reported.firstName, reported.lastName].filter(Boolean).join(" ") || reported.email || "Unknown"
            : "Unknown",
          messageText,
        };
      }),
    );
    res.json(enriched);
  } catch (err) {
    console.error("Admin message-reports list error:", err);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
});

router.patch("/api/admin/message-reports/:id", isAuthenticated, async (req, res) => {
  try {
    const actorId = getUserId(req)!;
    const adminCheck = await getAdminRole(actorId);
    if (!adminCheck || adminCheck.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const { status, adminNote } = req.body;
    const VALID_STATUSES = ["reviewed", "actioned", "dismissed"];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    const [updated] = await db
      .update(messageReports)
      .set({ status, adminNote: adminNote ?? null, reviewedBy: actorId, reviewedAt: new Date() })
      .where(eq(messageReports.id, req.params.id))
      .returning({ id: messageReports.id, status: messageReports.status });
    if (!updated) return res.status(404).json({ message: "Report not found" });
    res.json(updated);
  } catch (err) {
    console.error("Admin message-report update error:", err);
    res.status(500).json({ message: "Failed to update report" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/api/admin/reviews", isAuthenticated, async (req, res) => {
    try {
      const actorId0 = getUserId(req)!;
      const adminUser = await getAdminRole(actorId0);
      if (!adminUser || adminUser.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      const status = req.query.status as string | undefined;
      const rows = await getAdminReviews(status);
      // Enrich with traveler + service names
      const enriched = await Promise.all(rows.map(async r => {
        const traveler = await storage.getUser(r.travelerId);
        const service = await storage.getProviderServiceById(r.serviceId);
        const logs = await getReviewModerationLogs(r.id);
        return {
          id: r.id,
          serviceId: r.serviceId,
          travelerId: r.travelerId,
          rating: r.rating,
          reviewText: r.reviewText ?? null,
          responseText: r.responseText ?? null,
          responseAt: r.responseAt ?? null,
          // §06d: the provider's public reply (distinct from the legacy responseText/responseAt
          // above) — moderators see it here, read-only in v1 (no clear-reply admin action).
          providerReply: r.providerReply ?? null,
          providerRepliedAt: r.providerRepliedAt ?? null,
          status: r.status,
          flagReason: r.flagReason ?? null,
          moderatedAt: r.moderatedAt ?? null,
          createdAt: r.createdAt,
          travelerName: traveler ? [traveler.firstName, traveler.lastName].filter(Boolean).join(" ") || traveler.email : "Unknown",
          serviceName: service?.serviceName ?? "Unknown Service",
          logs,
        };
      }));
      res.json(enriched);
    } catch (err) {
      console.error("Admin reviews error:", err);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

router.patch("/api/admin/reviews/:id/status", isAuthenticated, async (req, res) => {
    try {
      const actorId = getUserId(req)!;
      const adminCheck = await getAdminRole(actorId);
      if (!adminCheck || adminCheck.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      const { status, reason } = req.body;
      if (!["approved", "flagged", "removed", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be approved, flagged, removed, or pending." });
      }
      const review = await getReviewById(req.params.id);
      if (!review) return res.status(404).json({ message: "Review not found" });
      const updated = await moderateReview(req.params.id, status, actorId, reason);
      await insertReviewModerationLog({ reviewId: req.params.id, action: status, actorId, reason: reason ?? null });

      // Recalculate service rating/count from approved reviews only
      const serviceId = review.serviceId;
      await recalcServiceRating(serviceId);

      res.json(updated);
    } catch (err) {
      console.error("Admin review status error:", err);
      res.status(500).json({ message: "Failed to update review status" });
    }
  });

  // Response-scoped moderation (W0.7): clears an inappropriate provider/expert RESPONSE
  // (responseText/responseAt) without touching the traveler's review, its status, or the
  // service rating. Logged to review_moderation_logs as 'response_cleared'.
  router.post("/api/admin/reviews/:id/clear-response", isAuthenticated, async (req, res) => {
    try {
      const actorId = getUserId(req)!;
      const adminCheck = await getAdminRole(actorId);
      if (!adminCheck || adminCheck.role !== "admin") return res.status(403).json({ message: "Admin access required" });
      const review = await getReviewById(req.params.id);
      if (!review) return res.status(404).json({ message: "Review not found" });
      if (!review.responseText) return res.status(400).json({ message: "Review has no response to clear" });
      const { reason } = req.body;
      const updated = await updateServiceReviewStatus(req.params.id, { responseText: null, responseAt: null });
      await insertReviewModerationLog({ reviewId: req.params.id, action: "response_cleared", actorId, reason: reason ?? null });
      res.json(updated);
    } catch (err) {
      console.error("Admin clear-response error:", err);
      res.status(500).json({ message: "Failed to clear review response" });
    }
  });

  // ─── Featured testimonials (curated rail, §13) ───────────────────────────
  // The landing page's testimonial rail is admin-curated, never fabricated:
  // an admin picks real service_reviews ids here; storage is the existing
  // platform_settings key/value store (no new table) — see CLAUDE.md §13.
  // GET returns the raw curated id list (for the review-moderation "featured"
  // toggle to know what's already picked); PUT replaces the whole list.
  const featuredTestimonialIdsSchema = z.object({
    ids: z.array(z.string().min(1)).max(12),
  });

  router.get("/api/admin/testimonials/featured", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await getAdminRole(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const raw = await getPlatformSettingValue("featured_testimonial_review_ids");
      let ids: string[] = [];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === "string");
        } catch {
          ids = []; // malformed setting → honest empty, never throw
        }
      }
      res.json({ ids });
    } catch (err) {
      console.error("Admin get featured testimonials error:", err);
      res.status(500).json({ message: "Failed to fetch featured testimonials" });
    }
  });

  router.put("/api/admin/testimonials/featured", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await getAdminRole(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const parsed = featuredTestimonialIdsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid body", errors: parsed.error.errors });

      // Dedupe while preserving the admin's chosen (display) order.
      const ids = Array.from(new Set(parsed.data.ids));

      await upsertPlatformSetting("featured_testimonial_review_ids", JSON.stringify(ids), userId);
      res.json({ ok: true, ids });
    } catch (err) {
      console.error("Admin set featured testimonials error:", err);
      res.status(500).json({ message: "Failed to update featured testimonials" });
    }
  });

  // Hook into itinerary generation to auto-capture analytics

  // ─── Phase 8.1: fee_bands + platform_settings admin CRUD ─────────────────────
  // Live source of truth for the new resolver. Replaces the removed legacy
  // GET + POST /api/admin/fee-config endpoints (which wrote to booking_fee_configs,
  // dormant since Phase 1.3). Admin UI redirects /admin/fee-config → /admin/fee-bands.

  // GET /api/admin/fee-bands — list all bands grouped by rate_type
  router.get("/api/admin/fee-bands", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await getAdminRole(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

      const result = await db.execute(sql`
        SELECT
          id, band_key, rate_type,
          CAST(default_rate AS FLOAT) AS default_rate,
          CAST(min_rate AS FLOAT)     AS min_rate,
          CAST(max_rate AS FLOAT)     AS max_rate,
          display_name, description, is_active, updated_by, updated_at
        FROM fee_bands
        ORDER BY rate_type ASC, band_key ASC
      `);
      res.json(result.rows ?? []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/admin/fee-bands/:bandKey — update one band.
  // Editable fields: default_rate, min_rate, max_rate, display_name, description, is_active.
  // band_key and rate_type are immutable post-seed (they identify the band).
  // Validates default_rate falls within min/max if set.
  router.patch("/api/admin/fee-bands/:bandKey", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await getAdminRole(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

      const bandKey = String(req.params.bandKey || "").trim();
      if (!bandKey) return res.status(400).json({ error: "Invalid bandKey" });

      const { defaultRate, minRate, maxRate, displayName, description, isActive } = req.body;

      // Fetch current row for audit + validation context.
      const current = await db.execute(sql`
        SELECT band_key, CAST(default_rate AS FLOAT) AS default_rate,
               CAST(min_rate AS FLOAT) AS min_rate, CAST(max_rate AS FLOAT) AS max_rate, is_active
        FROM fee_bands WHERE band_key = ${bandKey} LIMIT 1
      `);
      if (!current.rows || current.rows.length === 0) {
        return res.status(404).json({ error: "Band not found", bandKey });
      }
      const before = current.rows[0] as any;

      // Reject present-but-invalid rate fields outright. Previously a non-numeric
      // defaultRate (e.g. "abc") silently fell back to the stored value and returned
      // 200 ok — a false "saved" that dropped the admin's intended change. Omitting a
      // field still means "leave unchanged"; only present values must be finite numbers.
      if (defaultRate !== undefined && (typeof defaultRate !== "number" || !Number.isFinite(defaultRate))) {
        return res.status(400).json({ error: "defaultRate must be a finite number", received: defaultRate });
      }
      if (minRate !== undefined && minRate !== null && (typeof minRate !== "number" || !Number.isFinite(minRate))) {
        return res.status(400).json({ error: "minRate must be a finite number or null", received: minRate });
      }
      if (maxRate !== undefined && maxRate !== null && (typeof maxRate !== "number" || !Number.isFinite(maxRate))) {
        return res.status(400).json({ error: "maxRate must be a finite number or null", received: maxRate });
      }

      // Apply min/max validation against the proposed (or unchanged) default_rate.
      const nextDefault = defaultRate !== undefined ? defaultRate : Number(before.default_rate);
      const nextMin = minRate === undefined ? (before.min_rate === null ? null : Number(before.min_rate)) : (minRate === null ? null : minRate);
      const nextMax = maxRate === undefined ? (before.max_rate === null ? null : Number(before.max_rate)) : (maxRate === null ? null : maxRate);
      if (nextMin !== null && nextDefault < nextMin) {
        return res.status(400).json({ error: "default_rate below min_rate", nextDefault, nextMin });
      }
      if (nextMax !== null && nextDefault > nextMax) {
        return res.status(400).json({ error: "default_rate above max_rate", nextDefault, nextMax });
      }

      await db.execute(sql`
        UPDATE fee_bands
        SET
          default_rate = ${nextDefault},
          min_rate     = ${nextMin},
          max_rate     = ${nextMax},
          display_name = COALESCE(${displayName ?? null}, display_name),
          description  = COALESCE(${description ?? null}, description),
          is_active    = COALESCE(${isActive ?? null}, is_active),
          updated_by   = ${userId},
          updated_at   = NOW()
        WHERE band_key = ${bandKey}
      `);

      // Audit-log every fee_bands edit. Critical: these rows drive live billing.
      await insertAccessAuditLog({
        actorId: userId,
        actorRole: user.role,
        action: "fee_band_update",
        resourceType: "fee_band",
        resourceId: bandKey,
        metadata: {
          before: { default_rate: before.default_rate, is_active: before.is_active },
          after: { default_rate: nextDefault, is_active: isActive ?? before.is_active },
        },
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch(err => console.error("[fee-bands] audit log failed (non-fatal):", err));

      res.json({ ok: true, bandKey, defaultRate: nextDefault });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // Phase 8 — Offering-types admin CRUD (service_offering_types + expert_offering_types).
  // These are the Phase-2 catalog vocabularies the /earn page and the offering
  // selection flows read. Read-only to the app; mutated only here by admins.
  // Writes are audit-logged. offeringTypeKey is the immutable identity (unique);
  // PATCH/DELETE address rows by it. serviceTier / deliveryFormats values are
  // constrained by DB CHECKs (mapped to 400 below).
  // ──────────────────────────────────────────────────────────────────────

  /** Resolve the caller and ensure admin; on failure sends the response and returns null. */
  const requireAdmin = async (req: any, res: any): Promise<{ userId: string; role: string } | null> => {
    const userId = getUserId(req)!;
    const user = await getAdminRole(userId);
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return { userId, role: user.role };
  };

  const auditOfferingWrite = (admin: { userId: string; role: string }, req: any, action: string, resourceType: string, resourceId: string, metadata: any) =>
    insertAccessAuditLog({
      actorId: admin.userId,
      actorRole: admin.role,
      action,
      resourceType,
      resourceId,
      metadata,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error(`[offering-types] audit log failed (non-fatal):`, err));

  /** Map a Postgres write error to a client-meaningful status. */
  const offeringWriteError = (error: any, res: any) => {
    if (error?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: error.errors });
    if (error?.code === "23505") return res.status(409).json({ error: "offeringTypeKey already exists" });
    if (error?.code === "23514") return res.status(400).json({ error: "Value violates a DB constraint (serviceTier / deliveryFormats enum)", detail: error.detail ?? null });
    if (error?.code === "23502") return res.status(400).json({ error: "Missing required field", detail: error.detail ?? null });
    return res.status(500).json({ error: error?.message ?? "Unknown error" });
  };

  // ── service_offering_types ────────────────────────────────────────────
  router.get("/api/admin/service-offering-types", isAuthenticated, async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const rows = await getAllServiceOfferingTypes();
      res.json(rows);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  router.post("/api/admin/service-offering-types", isAuthenticated, async (req, res) => {
    try {
      const admin = await requireAdmin(req, res); if (!admin) return;
      const parsed = insertServiceOfferingTypeSchema.parse(req.body);
      const [created] = await createServiceOfferingType(parsed);
      auditOfferingWrite(admin, req, "service_offering_type_create", "service_offering_type", created.offeringTypeKey, { after: created });
      res.status(201).json(created);
    } catch (error: any) { offeringWriteError(error, res); }
  });

  router.patch("/api/admin/service-offering-types/:key", isAuthenticated, async (req, res) => {
    try {
      const admin = await requireAdmin(req, res); if (!admin) return;
      const key = String(req.params.key || "").trim();
      const b = req.body ?? {};
      // offeringTypeKey is immutable identity; everything else is editable.
      const updates: Record<string, unknown> = {};
      if (b.categoryKey !== undefined) updates.categoryKey = b.categoryKey;
      if (b.displayName !== undefined) updates.displayName = b.displayName;
      if (b.tagline !== undefined) updates.tagline = b.tagline;
      if (b.isSurprising !== undefined) updates.isSurprising = b.isSurprising;
      if (b.marketScoped !== undefined) updates.marketScoped = b.marketScoped;
      if (b.isActive !== undefined) updates.isActive = b.isActive;
      if (b.sortOrder !== undefined) updates.sortOrder = b.sortOrder;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No editable fields supplied" });
      updates.updatedAt = new Date();
      const [updated] = await updateServiceOfferingType(key, updates);
      if (!updated) return res.status(404).json({ error: "Offering type not found", key });
      auditOfferingWrite(admin, req, "service_offering_type_update", "service_offering_type", key, { after: updated });
      res.json(updated);
    } catch (error: any) { offeringWriteError(error, res); }
  });

  router.delete("/api/admin/service-offering-types/:key", isAuthenticated, async (req, res) => {
    try {
      const admin = await requireAdmin(req, res); if (!admin) return;
      const key = String(req.params.key || "").trim();
      const [deleted] = await deleteServiceOfferingType(key);
      if (!deleted) return res.status(404).json({ error: "Offering type not found", key });
      auditOfferingWrite(admin, req, "service_offering_type_delete", "service_offering_type", key, { before: deleted });
      res.json({ ok: true, key });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // ── expert_offering_types ─────────────────────────────────────────────
  router.get("/api/admin/expert-offering-types", isAuthenticated, async (req, res) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const rows = await getExpertOfferingTypesList();
      res.json(rows);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  router.post("/api/admin/expert-offering-types", isAuthenticated, async (req, res) => {
    try {
      const admin = await requireAdmin(req, res); if (!admin) return;
      const parsed = insertExpertOfferingTypeSchema.parse(req.body);
      const [created] = await createExpertOfferingTypeRow(parsed);
      auditOfferingWrite(admin, req, "expert_offering_type_create", "expert_offering_type", created.offeringTypeKey, { after: created });
      res.status(201).json(created);
    } catch (error: any) { offeringWriteError(error, res); }
  });

  router.patch("/api/admin/expert-offering-types/:key", isAuthenticated, async (req, res) => {
    try {
      const admin = await requireAdmin(req, res); if (!admin) return;
      const key = String(req.params.key || "").trim();
      const b = req.body ?? {};
      const updates: Record<string, unknown> = {};
      if (b.serviceTier !== undefined) updates.serviceTier = b.serviceTier;
      if (b.displayName !== undefined) updates.displayName = b.displayName;
      if (b.tagline !== undefined) updates.tagline = b.tagline;
      if (b.deliveryFormats !== undefined) updates.deliveryFormats = b.deliveryFormats;
      if (b.isSurprising !== undefined) updates.isSurprising = b.isSurprising;
      if (b.isActive !== undefined) updates.isActive = b.isActive;
      if (b.sortOrder !== undefined) updates.sortOrder = b.sortOrder;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No editable fields supplied" });
      updates.updatedAt = new Date();
      const [updated] = await updateExpertOfferingTypeRow(key, updates);
      if (!updated) return res.status(404).json({ error: "Offering type not found", key });
      auditOfferingWrite(admin, req, "expert_offering_type_update", "expert_offering_type", key, { after: updated });
      res.json(updated);
    } catch (error: any) { offeringWriteError(error, res); }
  });

  router.delete("/api/admin/expert-offering-types/:key", isAuthenticated, async (req, res) => {
    try {
      const admin = await requireAdmin(req, res); if (!admin) return;
      const key = String(req.params.key || "").trim();
      const [deleted] = await deleteExpertOfferingTypeRow(key);
      if (!deleted) return res.status(404).json({ error: "Offering type not found", key });
      auditOfferingWrite(admin, req, "expert_offering_type_delete", "expert_offering_type", key, { before: deleted });
      res.json({ ok: true, key });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // GET /api/admin/platform-settings — list all key/value settings
  router.get("/api/admin/platform-settings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await getAdminRole(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

      const result = await db.execute(sql`
        SELECT setting_key, setting_value, description, updated_by, updated_at
        FROM platform_settings
        ORDER BY setting_key ASC
      `);
      res.json(result.rows ?? []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/admin/platform-settings/:settingKey — update one setting.
  // The active_provider_commission_policy flip lives here. Audit-logged.
  router.patch("/api/admin/platform-settings/:settingKey", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await getAdminRole(userId);
      if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

      const settingKey = String(req.params.settingKey || "").trim();
      const { settingValue } = req.body;
      if (!settingKey) return res.status(400).json({ error: "Invalid settingKey" });
      if (typeof settingValue !== "string") return res.status(400).json({ error: "settingValue must be a string" });

      // Boolean flags from /admin/system must be exactly "true"/"false" so the
      // enforcement middleware never misreads a junk value.
      const BOOLEAN_FLAG_KEYS = ["maintenance_mode", "new_user_registration_enabled", "email_notifications_enabled"];
      if (BOOLEAN_FLAG_KEYS.includes(settingKey) && !["true", "false"].includes(settingValue)) {
        return res.status(400).json({ error: `${settingKey} must be 'true' or 'false'`, got: settingValue });
      }

      // Footgun guard: validate the policy enum at the boundary so an admin
      // can't set active_provider_commission_policy to a junk string that
      // would route every provider through the default fallback band.
      if (settingKey === "active_provider_commission_policy" && !["beta_flat", "tiered"].includes(settingValue)) {
        return res.status(400).json({ error: "active_provider_commission_policy must be 'beta_flat' or 'tiered'", got: settingValue });
      }
      // Footgun guard #2: default_commission_band_key must reference an existing
      // active band — otherwise the tiered-policy fallback is unpriced.
      if (settingKey === "default_commission_band_key") {
        const bandCheck = await db.execute(sql`
          SELECT 1 FROM fee_bands WHERE band_key = ${settingValue} AND is_active = true LIMIT 1
        `);
        if (!bandCheck.rows || bandCheck.rows.length === 0) {
          return res.status(400).json({ error: "default_commission_band_key must reference an active fee_bands row", got: settingValue });
        }
      }

      // Fetch before-value for audit.
      const before = await db.execute(sql`
        SELECT setting_value FROM platform_settings WHERE setting_key = ${settingKey} LIMIT 1
      `);
      const beforeValue = before.rows && before.rows.length > 0 ? (before.rows[0] as any).setting_value : null;

      await db.execute(sql`
        INSERT INTO platform_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES (${settingKey}, ${settingValue}, ${userId}, NOW())
        ON CONFLICT (setting_key) DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_by    = EXCLUDED.updated_by,
          updated_at    = NOW()
      `);

      await insertAccessAuditLog({
        actorId: userId,
        actorRole: user.role,
        action: "platform_setting_update",
        resourceType: "platform_setting",
        resourceId: settingKey,
        metadata: { before: beforeValue, after: settingValue },
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch(err => console.error("[platform-settings] audit log failed (non-fatal):", err));

      // Apply toggles immediately in-process (flag reads are otherwise TTL-cached).
      invalidatePlatformFlagCache(settingKey);

      res.json({ ok: true, settingKey, settingValue });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

router.get("/api/admin/lead-routing-logs", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await withQueryTimer(
        "admin-routing-logs-fetch",
        () => db.execute(sql`
          SELECT
            lrl.*,
            u.first_name || ' ' || u.last_name AS user_name,
            eu.first_name || ' ' || eu.last_name AS expert_name
          FROM lead_routing_logs lrl
          LEFT JOIN users u ON u.id = lrl.user_id
          LEFT JOIN users eu ON eu.id = lrl.assigned_expert_id
          ORDER BY lrl.created_at DESC
          LIMIT ${limit}
        `),
        (req.user as any)?.role
      );
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/admin/lead-routing-logs/:id/override — admin override assignment

router.patch("/api/admin/lead-routing-logs/:id/override", isAuthenticated, async (req, res) => {
    try {
      const adminId = getUserId(req)!;
      const { id } = req.params;
      const { newExpertId } = req.body;

      await db.execute(sql`
        UPDATE lead_routing_logs
        SET assigned_expert_id = ${newExpertId}, overridden_by = ${adminId}
        WHERE id = ${id}
      `);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/routing-queue — routed leads awaiting admin confirmation

router.get("/api/admin/routing-queue", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await getFullAdminUser(getUserId(req)!);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      // E2(b): stranded rows — leadRoutingService.scoreExperts returned [] (e.g. a
      // swallowed SQL error), so the request has no assigned_expert_id and was
      // stamped status='unassigned'. They never satisfy the base WHERE below (it
      // requires assigned_expert_id IS NOT NULL) and were previously invisible to
      // any admin surface. `?unassigned=1` widens the query to also include them;
      // default (no query param) keeps the original routed-queue-only shape.
      const includeUnassigned = req.query.unassigned === "1";
      const result = await db.execute(sql`
        SELECT
          er.id,
          er.trip_id,
          er.user_id,
          er.destination_city,
          er.request_type,
          er.status,
          er.assigned_expert_id,
          er.created_at,
          er.assigned_at,
          u.first_name || ' ' || u.last_name AS traveler_name,
          u.email AS traveler_email,
          eu.first_name || ' ' || eu.last_name AS expert_name,
          eu.email AS expert_email,
          lrl.top_score,
          lrl.scores_json
        FROM expert_requests er
        LEFT JOIN users u ON u.id = er.user_id
        LEFT JOIN users eu ON eu.id = er.assigned_expert_id
        LEFT JOIN lead_routing_logs lrl ON lrl.trip_id::text = er.trip_id
          AND lrl.assigned_expert_id = er.assigned_expert_id
        WHERE (
          er.assigned_expert_id IS NOT NULL
          AND er.status NOT IN ('confirmed', 'completed', 'cancelled')
          AND NOT EXISTS (
            SELECT 1 FROM trip_expert_advisors tea
            WHERE tea.trip_id = er.trip_id
              AND tea.local_expert_id = er.assigned_expert_id
          )
        )
        ${includeUnassigned ? sql`OR er.status = 'unassigned'` : sql``}
        ORDER BY er.created_at DESC
        LIMIT 100
      `);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/leads/:expertRequestId/assign — manual admin assignment for a lead that
  // auto-routing failed to place (E2: scoreExperts returned [], the row was stamped
  // status='unassigned' with no assigned_expert_id, and previously had no way back into the
  // pipeline). Stamps the same fields the successful auto-routed path stamps
  // (assignExpertAdvisorToRequest in booking-actions.service.ts: assigned_expert_id +
  // status='assigned' + assigned_at) so the EXISTING confirm endpoint below can run unchanged.
router.post("/api/admin/leads/:expertRequestId/assign", isAuthenticated, async (req, res) => {
    const adminUser = await getFullAdminUser(getUserId(req)!);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    try {
      const { expertId } = z.object({ expertId: z.string().min(1) }).parse(req.body);

      // Mirror the assign-coordinator picker's eligibility check: a real,
      // non-suspended, non-deleted expert-family user.
      const [expert] = await db
        .select({ id: users.id, role: users.role, isSuspended: users.isSuspended, isDeleted: users.isDeleted })
        .from(users)
        .where(eq(users.id, expertId))
        .limit(1);
      if (
        !expert ||
        !isExpertRole(expert.role) ||
        expert.isSuspended ||
        expert.isDeleted
      ) {
        return res.status(400).json({ message: "Target user is not an eligible expert" });
      }

      const { expertRequestId } = req.params;
      const [updated] = await db
        .update(expertRequests)
        .set({ assignedExpertId: expertId, status: "assigned", assignedAt: new Date() })
        .where(eq(expertRequests.id, expertRequestId))
        .returning();
      if (!updated) {
        return res.status(404).json({ message: "Lead not found" });
      }

      res.json({ success: true, expertRequest: updated });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: err.errors });
      }
      console.error("Admin manual lead-assign error:", err);
      res.status(500).json({ message: "Failed to assign expert to lead" });
    }
  });

  // Shared handler: confirm lead → workspace bridge (used by both route aliases below)
  async function confirmLeadAssignmentHandler(requestId: string, req: any, res: any) {
    const adminUser = await getFullAdminUser(getUserId(req)!);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const queueResult = await db.execute(sql`
      SELECT * FROM expert_requests WHERE id = ${requestId}
    `);
    const row = queueResult.rows?.[0] as any;
    if (!row) return res.status(404).json({ error: "Routing request not found" });
    if (!row.assigned_expert_id) return res.status(400).json({ error: "No expert assigned to this request" });
    if (!row.trip_id) return res.status(400).json({ error: "Request has no associated trip" });

    const { assignment, wasCreated } = await db.transaction(async (tx) => {
      // Lock the expert_requests row to serialise concurrent confirms
      await tx.execute(sql`SELECT id FROM expert_requests WHERE id = ${requestId} FOR UPDATE`);

      // Idempotency: return the existing advisor row if one already exists
      const [existing] = await tx.select().from(tripExpertAdvisors)
        .where(and(
          eq(tripExpertAdvisors.tripId, row.trip_id),
          eq(tripExpertAdvisors.localExpertId, row.assigned_expert_id),
        ))
        .limit(1);

      if (existing) return { assignment: existing, wasCreated: false };

      // Insert; ON CONFLICT DO NOTHING handles the rare concurrent-insert race
      const [created] = await tx.insert(tripExpertAdvisors)
        .values({
          tripId: row.trip_id,
          localExpertId: row.assigned_expert_id,
          status: "assigned",
          workspaceStatus: "draft",
          assignedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // If concurrent insert won the race, fetch the winning row
      const result = created ?? await tx.select().from(tripExpertAdvisors)
        .where(and(
          eq(tripExpertAdvisors.tripId, row.trip_id),
          eq(tripExpertAdvisors.localExpertId, row.assigned_expert_id),
        ))
        .then(r => r[0]);

      // Flip expert_requests status
      await tx.execute(sql`
        UPDATE expert_requests SET status = 'assigned', assigned_at = NOW() WHERE id = ${requestId}
      `);

      return { assignment: result, wasCreated: Boolean(created) };
    });

    // Task 1113: notify the expert the moment they're assigned a trip. Fires only when a NEW
    // advisor row was created (idempotent re-confirms stay silent). Non-fatal — the assignment
    // itself must still succeed even if the notification insert fails.
    if (wasCreated && assignment) {
      try {
        const { createExpertAssignmentNotification, getTripLabel } = await import("../services/booking-actions.service");
        const tripLabel = await getTripLabel(row.trip_id);
        await createExpertAssignmentNotification(row.assigned_expert_id, row.trip_id, tripLabel);
      } catch (notifyErr) {
        console.error("Failed to notify expert of trip assignment:", notifyErr);
      }
    }

    return res.json({ assignment });
  }

  // POST /api/admin/leads/:expertRequestId/confirm — canonical endpoint (task spec)

router.post("/api/admin/leads/:expertRequestId/confirm", isAuthenticated, async (req, res) => {
    try {
      await confirmLeadAssignmentHandler(req.params.expertRequestId, req, res);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/routing-queue/:requestId/confirm — legacy alias (UI still uses this)

router.post("/api/admin/routing-queue/:requestId/confirm", isAuthenticated, async (req, res) => {
    try {
      await confirmLeadAssignmentHandler(req.params.requestId, req, res);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/routing-queue/:requestId/reassign — pick a different expert

router.post("/api/admin/routing-queue/:requestId/reassign", isAuthenticated, async (req, res) => {
    try {
      const adminUser = await getFullAdminUser(getUserId(req)!);
      if (!adminUser || adminUser.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { requestId } = req.params;
      const { expertId } = req.body;
      if (!expertId) return res.status(400).json({ error: "expertId is required" });

      const queueResult = await db.execute(sql`
        SELECT * FROM expert_requests WHERE id = ${requestId}
      `);
      const row = queueResult.rows?.[0] as any;
      if (!row) return res.status(404).json({ error: "Routing request not found" });
      if (row.status === "confirmed") return res.status(409).json({ error: "Assignment already confirmed; cannot reassign" });

      await db.execute(sql`
        UPDATE expert_requests
        SET assigned_expert_id = ${expertId}, assigned_at = NOW()
        WHERE id = ${requestId}
      `);

      const expertResult = await db.execute(sql`
        SELECT first_name || ' ' || last_name AS expert_name FROM users WHERE id = ${expertId}
      `);
      const expertName = (expertResult.rows?.[0] as any)?.expert_name || expertId;

      res.json({ success: true, newExpertId: expertId, expertName });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auto-capture accommodation preference from hotel searches/bookings

router.get("/api/admin/local-experts/nugget-counts", isAuthenticated, async (req, res) => {
    try {
      const rows = await db
        .select({ expertUserId: localKnowledgeNuggets.expertUserId, count: count() })
        .from(localKnowledgeNuggets)
        .groupBy(localKnowledgeNuggets.expertUserId);
      const map: Record<string, number> = {};
      for (const r of rows) map[r.expertUserId] = Number(r.count);
      res.json(map);
    } catch (err) {
      console.error("[Knowledge Nuggets] admin counts error:", err);
      res.status(500).json({ message: "Failed to fetch nugget counts" });
    }
  });

  // GET /api/knowledge-nuggets/city — for AI to pull nuggets by city

router.get("/api/admin/content-placement-rules", requireAdminLocal, async (req, res) => {
    try {
      const { cityName, surface, contentSource } = req.query as Record<string, string>;
      const rules = await storage.getContentPlacementRules({
        cityName: cityName || undefined,
        surface: surface || undefined,
        contentSource: contentSource || undefined,
        isActive: undefined,
      });
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch placement rules", error: err.message });
    }
  });

  // POST /api/admin/content-placement-rules — create a rule

router.post("/api/admin/content-placement-rules", requireAdminLocal, async (req, res) => {
    try {
      const rule = await storage.createContentPlacementRule(req.body as InsertContentPlacementRule);
      res.status(201).json(rule);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create placement rule", error: err.message });
    }
  });

  // PATCH /api/admin/content-placement-rules/:id — update a rule

router.patch("/api/admin/content-placement-rules/:id", requireAdminLocal, async (req, res) => {
    try {
      const rule = await storage.updateContentPlacementRule(req.params.id, req.body);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update placement rule", error: err.message });
    }
  });

  // DELETE /api/admin/content-placement-rules/:id — delete a rule

router.delete("/api/admin/content-placement-rules/:id", requireAdminLocal, async (req, res) => {
    try {
      await storage.deleteContentPlacementRule(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete placement rule", error: err.message });
    }
  });

  // POST /api/admin/content-placement-rules/auto-index
  // Scans affiliate_products and content_registry, matches them to active TravelPulse
  // cities by city/country name, and upserts placement rules with appropriate surfaces.

router.post("/api/admin/content-placement-rules/auto-index", requireAdminLocal, async (req, res) => {
    try {
      // 1. Load all TravelPulse cities
      const cities = await getTravelPulseCitiesList();

      if (!cities.length) {
        return res.json({ created: 0, message: "No TravelPulse cities found. Seed city data first." });
      }

      // Build a fast lookup: lowercase city name → city data
      const cityLookup = new Map(cities.map(c => [c.cityName.toLowerCase(), c]));

      const rulesToUpsert: InsertContentPlacementRule[] = [];

      // 2. Scan affiliate_products
      const products = await getActiveAffiliateProducts();

      // §13 no-silent-caps: count inventory dropped for want of a matching TravelPulse city so the
      // response reports coverage honestly instead of silently under-indexing.
      let affiliateSkippedNoCity = 0;
      let registrySkippedNoCity = 0;

      for (const p of products) {
        const cityKey = (p.city ?? "").toLowerCase();
        const cityData = cityKey
          ? (cityLookup.get(cityKey) ||
            Array.from(cityLookup.values()).find(c =>
              cityKey.includes(c.cityName.toLowerCase()) ||
              c.cityName.toLowerCase().includes(cityKey)
            ))
          : undefined;
        if (!cityData) { affiliateSkippedNoCity++; continue; }

        // Determine which surfaces this product's category matches
        const surfaces = (SURFACE_SLUGS as readonly string[]).filter(slug => {
          const cats = SURFACE_DEFAULT_AFFILIATE_CATEGORIES[slug as keyof typeof SURFACE_DEFAULT_AFFILIATE_CATEGORIES] ?? [];
          const pCat = (p.category ?? "").toLowerCase();
          return cats.some(c => pCat.includes(c) || c.includes(pCat));
        });
        if (!surfaces.length) surfaces.push("travelpulse-discover");

        rulesToUpsert.push({
          contentSource: "affiliate_product",
          sourceId: p.id,
          contentLabel: p.name,
          cityName: cityData.cityName,
          country: cityData.country,
          surfaces,
          minPulseScore: 0,
          isPinned: false,
          isAutoTagged: true,
          isActive: true,
          notes: `Auto-indexed from affiliate_products`,
        });
      }

      // 3. Scan content_registry (published only, with location metadata)
      const registryItems = await getPublishedContentRegistry();

      for (const r of registryItems) {
        const meta = (r.metadata ?? {}) as Record<string, any>;
        const rawCity: string = meta.city ?? meta.location ?? meta.destination ?? "";
        if (!rawCity) { registrySkippedNoCity++; continue; }

        const cityKey = rawCity.toLowerCase().split(",")[0].trim();
        const cityData = cityLookup.get(cityKey) ||
          Array.from(cityLookup.values()).find(c =>
            cityKey.includes(c.cityName.toLowerCase()) ||
            c.cityName.toLowerCase().includes(cityKey)
          );
        if (!cityData) { registrySkippedNoCity++; continue; }

        // Determine surfaces from content type
        const surfaces = (SURFACE_SLUGS as readonly string[]).filter(slug => {
          const types = SURFACE_DEFAULT_CONTENT_TYPES[slug as keyof typeof SURFACE_DEFAULT_CONTENT_TYPES] ?? [];
          return types.includes(r.contentType as any);
        });
        if (!surfaces.length) surfaces.push("travelpulse-discover");

        rulesToUpsert.push({
          contentSource: "content_registry",
          sourceId: r.id,
          contentLabel: r.title ?? undefined,
          cityName: cityData.cityName,
          country: cityData.country,
          surfaces,
          minPulseScore: 0,
          isPinned: false,
          isAutoTagged: true,
          isActive: true,
          notes: `Auto-indexed from content_registry`,
        });
      }

      const created = await storage.bulkUpsertContentPlacementRules(rulesToUpsert);
      const totalSkippedNoCity = affiliateSkippedNoCity + registrySkippedNoCity;
      res.json({
        created,
        total: rulesToUpsert.length,
        cities: cities.length,
        affiliateScanned: products.length,
        registryScanned: registryItems.length,
        // §13 no-silent-caps: surface inventory that couldn't be placed for want of a matching city.
        skippedNoCity: totalSkippedNoCity,
        affiliateSkippedNoCity,
        registrySkippedNoCity,
        message: `Auto-indexed ${created} new rules across ${cities.length} TravelPulse cities` +
          (totalSkippedNoCity > 0 ? ` (${totalSkippedNoCity} items skipped — no matching city)` : ""),
      });
    } catch (err: any) {
      console.error("[ContentMap] auto-index error:", err);
      res.status(500).json({ message: "Auto-index failed", error: err.message });
    }
  });

// ─── Optimization Fee Tier Admin ─────────────────────────────────────────────

router.get("/api/admin/optimization-fees", requireAdminLocal, async (req, res) => {
  try {
    // CON-A.P2: include event_type + is_disabled. Tier-level defaults first (event_type IS NULL),
    // then per-event-type overrides alphabetically.
    const result = await db.execute(sql`
      SELECT id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, updated_by, updated_at
      FROM optimization_fees
      ORDER BY
        CASE WHEN event_type IS NULL THEN 0 ELSE 1 END,
        CASE complexity_tier
          WHEN 'simple'   THEN 1
          WHEN 'standard' THEN 2
          WHEN 'complex'  THEN 3
          ELSE 4
        END,
        event_type
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/admin/optimization-fees", requireAdminLocal, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { complexityTier, eventType = null, priceCents, currency = "USD", isActive = true, isDisabled = false } = req.body;

    if (!complexityTier || !["simple", "standard", "complex"].includes(complexityTier)) {
      return res.status(400).json({ error: "complexityTier must be simple | standard | complex" });
    }
    if (typeof priceCents !== "number" || priceCents < 0) {
      return res.status(400).json({ error: "priceCents must be a non-negative integer" });
    }

    // CON-A.P2: upsert keyed by (complexity_tier, event_type). Composite unique not
    // enforced at DB level (NULL semantics) — update-then-insert preserves single-row
    // invariant per (tier, event_type|NULL).
    const existing = await db.execute(sql`
      SELECT id FROM optimization_fees
      WHERE complexity_tier = ${complexityTier}
        AND ((${eventType}::text IS NULL AND event_type IS NULL) OR event_type = ${eventType})
      LIMIT 1
    `);

    if (existing.rows.length > 0) {
      await db.execute(sql`
        UPDATE optimization_fees
        SET price_cents = ${priceCents},
            currency    = ${currency},
            is_active   = ${isActive},
            is_disabled = ${isDisabled},
            updated_by  = ${userId},
            updated_at  = NOW()
        WHERE id = ${(existing.rows[0] as any).id}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, updated_by, created_at, updated_at)
        VALUES (gen_random_uuid(), ${complexityTier}, ${eventType}, ${priceCents}, ${currency}, ${isActive}, ${isDisabled}, ${userId}, NOW(), NOW())
      `);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Event Packages Admin (CON-A.P8 / N6) ────────────────────────────────────
// Minimal CRUD for the Full/DFY catalog. Phase A is catalog-only; Phase C/C1
// will add the transactional flow (quote → approve → PI → workspace bundle).

router.get("/api/admin/event-packages", requireAdminLocal, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT id, event_type, market, title, description, price_from_cents, status, created_at, updated_at
      FROM event_packages
      ORDER BY status ASC, created_at DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/admin/event-packages", requireAdminLocal, async (req, res) => {
  try {
    const { eventType, market, title, description = null, priceFromCents = null, status = "active" } = req.body;
    if (!eventType || !market || !title) {
      return res.status(400).json({ error: "eventType, market, and title are required" });
    }
    if (priceFromCents !== null && (typeof priceFromCents !== "number" || priceFromCents < 0)) {
      return res.status(400).json({ error: "priceFromCents must be null or a non-negative integer" });
    }
    if (!["active", "paused", "archived"].includes(status)) {
      return res.status(400).json({ error: "status must be active | paused | archived" });
    }
    await db.execute(sql`
      INSERT INTO event_packages (id, event_type, market, title, description, price_from_cents, status, created_at, updated_at)
      VALUES (gen_random_uuid(), ${eventType}, ${market}, ${title}, ${description}, ${priceFromCents}, ${status}, NOW(), NOW())
    `);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/api/admin/event-packages/:id", requireAdminLocal, async (req, res) => {
  try {
    const { id } = req.params;
    const { eventType, market, title, description, priceFromCents, status } = req.body;
    if (status !== undefined && !["active", "paused", "archived"].includes(status)) {
      return res.status(400).json({ error: "status must be active | paused | archived" });
    }
    if (priceFromCents !== undefined && priceFromCents !== null && (typeof priceFromCents !== "number" || priceFromCents < 0)) {
      return res.status(400).json({ error: "priceFromCents must be null or a non-negative integer" });
    }
    await db.execute(sql`
      UPDATE event_packages SET
        event_type        = COALESCE(${eventType ?? null}::text, event_type),
        market            = COALESCE(${market ?? null}::text, market),
        title             = COALESCE(${title ?? null}::text, title),
        description       = ${description !== undefined ? description : sql`description`},
        price_from_cents  = ${priceFromCents !== undefined ? priceFromCents : sql`price_from_cents`},
        status            = COALESCE(${status ?? null}::text, status),
        updated_at        = NOW()
      WHERE id = ${id}::uuid
    `);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/admin/event-packages/:id", requireAdminLocal, async (req, res) => {
  // Soft delete: status='archived' so historical references survive.
  try {
    const { id } = req.params;
    await db.execute(sql`
      UPDATE event_packages SET status = 'archived', updated_at = NOW() WHERE id = ${id}::uuid
    `);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Phase 8.3: Neighborhood admin ───────────────────────────────────────────
// Three surfaces:
//   1. Coverage targets (CRUD on neighborhood_coverage_target)
//   2. Expert lead assignment (atomic swap — never raw partial-index violation)
//   3. Adjacency editing (symmetric writes: A→B implies B→A)
//
// Footgun discipline carries over from Phase 8.2:
//   - coverage_target.category_key must resolve in service_categories.
//   - lead expert must serve the neighborhood's market (city) per their
//     localExpertForms row; mismatch with concrete-evidence rejects, missing
//     data allows with warning.
//   - adjacency must stay within the same (city, country) — graph is undirected
//     and city-scoped.

async function isAdmin(req: any): Promise<{ ok: true; userId: string } | { ok: false }> {
  const userId = getUserId(req)!;
  if (!userId) return { ok: false };
  const user = await getAdminRole(userId);
  if (!user || user.role !== "admin") return { ok: false };
  return { ok: true, userId };
}

// GET /api/admin/neighborhoods?city=Kyoto — list with current lead summary.
router.get("/api/admin/neighborhoods", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const city = typeof req.query.city === "string" ? req.query.city.trim() : null;
    const result = await db.execute(sql`
      SELECT
        cn.id, cn.city, cn.country, cn.name, cn.slug,
        cn.adjacent_keys, cn.lead_expert_target,
        CAST(cn.radius_km AS FLOAT) AS radius_km,
        (SELECT en.expert_id FROM expert_neighborhoods en
          WHERE en.neighborhood_id = cn.id AND en.is_lead = true LIMIT 1) AS lead_expert_id,
        (SELECT COUNT(*) FROM neighborhood_coverage_target t WHERE t.neighborhood_id = cn.id) AS coverage_target_count
      FROM city_neighborhoods cn
      ${city ? sql`WHERE cn.city = ${city}` : sql``}
      ORDER BY cn.city, cn.name
    `);
    res.json(result.rows ?? []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/neighborhoods/untagged + POST /api/admin/neighborhoods/backfill —
// L4 fix (docs/audits/ux-walkthrough-5-roles-jul29.md): these two routes never existed.
// GET fell through to the /:id route below with id="untagged" and 404'd on
// "Neighborhood not found"; POST 404'd the same way for any client that tried it. Both
// are registered here, BEFORE /:id, so a literal "untagged" segment can never be
// re-shadowed by the param route (the §9 route-shadow class — order matters).
router.get("/api/admin/neighborhoods/untagged", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const rows = await getUntaggedProviderServices();
    const services = (rows as any[]).map((r) => ({
      id: r.id,
      serviceName: r.service_name,
      city: r.city ?? (r.location && r.location.toLowerCase() !== "unknown" ? r.location : null),
      providerFirstName: r.provider_first_name,
      providerLastName: r.provider_last_name,
      providerEmail: r.provider_email,
    }));
    res.json({ services, count: services.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/admin/neighborhoods/backfill", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const serviceId = typeof req.body?.serviceId === "string" ? req.body.serviceId : undefined;
    const result = await backfillProviderServiceNeighborhoods(serviceId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/neighborhoods/:id — full detail with coverage targets + adjacency.
router.get("/api/admin/neighborhoods/:id", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const id = req.params.id;
    const neighborhood = await getNeighborhoodById(id);
    if (!neighborhood) return res.status(404).json({ error: "Neighborhood not found" });

    const experts = await db.execute(sql`
      SELECT en.expert_id, en.is_lead, en.sort_order,
             u.first_name, u.last_name, u.email
      FROM expert_neighborhoods en
      JOIN users u ON u.id = en.expert_id
      WHERE en.neighborhood_id = ${id}
      ORDER BY en.is_lead DESC, en.sort_order ASC
    `);

    const coverage = await getNeighborhoodCoverageTargets(id);

    res.json({ neighborhood, experts: experts.rows ?? [], coverage });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/neighborhoods/:id/coverage-targets — upsert one target row.
router.post("/api/admin/neighborhoods/:id/coverage-targets", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const id = req.params.id;
    const { categoryKey, targetCount } = req.body;
    if (typeof categoryKey !== "string" || !categoryKey.trim()) {
      return res.status(400).json({ error: "categoryKey required" });
    }
    const count = Number(targetCount);
    if (!Number.isInteger(count) || count < 0) {
      return res.status(400).json({ error: "targetCount must be a non-negative integer" });
    }

    // Footgun: categoryKey must resolve in service_categories.
    const cat = await getServiceCategoryByKey(categoryKey);
    if (!cat) {
      return res.status(400).json({
        error: "category_key_not_found",
        message: `categoryKey='${categoryKey}' does not resolve to any service_categories row. Reconcile the taxonomy first.`,
      });
    }

    await db.execute(sql`
      INSERT INTO neighborhood_coverage_target (neighborhood_id, category_key, target_count)
      VALUES (${id}, ${categoryKey}, ${count})
      ON CONFLICT (neighborhood_id, category_key) DO UPDATE SET
        target_count = EXCLUDED.target_count,
        updated_at = NOW()
    `);

    await insertAccessAuditLog({
      actorId: auth.userId,
      actorRole: "admin",
      action: "neighborhood_coverage_target_upsert",
      resourceType: "neighborhood_coverage_target",
      resourceId: `${id}:${categoryKey}`,
      metadata: { neighborhoodId: id, categoryKey, targetCount: count },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(err => console.error("[neighborhoods] audit failed:", err));

    res.json({ ok: true, neighborhoodId: id, categoryKey, targetCount: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/neighborhoods/:id/coverage-targets/:categoryKey
router.delete("/api/admin/neighborhoods/:id/coverage-targets/:categoryKey", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const { id, categoryKey } = req.params;
    await deleteNeighborhoodCoverageTarget(id, categoryKey);
    await insertAccessAuditLog({
      actorId: auth.userId,
      actorRole: "admin",
      action: "neighborhood_coverage_target_delete",
      resourceType: "neighborhood_coverage_target",
      resourceId: `${id}:${categoryKey}`,
      metadata: { neighborhoodId: id, categoryKey },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(err => console.error("[neighborhoods] audit failed:", err));
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/neighborhoods/:id/lead — atomic swap (demote old, promote new).
// Body: { expertId: string } to assign, or { clear: true } to vacate.
// The transaction prevents the partial-unique index from ever firing.
router.put("/api/admin/neighborhoods/:id/lead", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const id = req.params.id;
    const { expertId, clear } = req.body;

    const neighborhood = await getNeighborhoodById(id);
    if (!neighborhood) return res.status(404).json({ error: "Neighborhood not found" });

    if (clear === true) {
      // Vacate the lead slot. No-op if already vacant.
      await db.transaction(async (tx) => {
        await tx.update(expertNeighborhoods)
          .set({ isLead: false, updatedAt: new Date() })
          .where(and(eq(expertNeighborhoods.neighborhoodId, id), eq(expertNeighborhoods.isLead, true)));
      });
      await insertAccessAuditLog({
        actorId: auth.userId,
        actorRole: "admin",
        action: "neighborhood_lead_clear",
        resourceType: "neighborhood",
        resourceId: id,
        metadata: { neighborhoodId: id },
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch(err => console.error("[neighborhoods] audit failed:", err));
      return res.json({ ok: true, cleared: true });
    }

    if (typeof expertId !== "string" || !expertId.trim()) {
      return res.status(400).json({ error: "expertId or clear required" });
    }

    // Footgun: lead must serve the neighborhood's market. Check localExpertForms.
    // Concrete-evidence rejection: if the form exists AND its city + destinations
    // both disagree with the neighborhood's city. Missing-data soft-pass (with audit).
    const form = await getExpertFormCityInfo(expertId);

    let marketCheck: "match" | "missing" | "mismatch" = "missing";
    if (form && (form.city || (Array.isArray(form.destinations) && form.destinations.length > 0))) {
      const nbhCity = (neighborhood.city || "").toLowerCase();
      const expertCity = (form.city || "").toLowerCase();
      const destinationsArr = Array.isArray(form.destinations) ? form.destinations.map(d => String(d).toLowerCase()) : [];
      if (expertCity === nbhCity || destinationsArr.some(d => d.includes(nbhCity))) {
        marketCheck = "match";
      } else {
        marketCheck = "mismatch";
      }
    }

    if (marketCheck === "mismatch") {
      return res.status(400).json({
        error: "expert_outside_market",
        message: `Expert serves '${form?.city ?? "unknown"}', not '${neighborhood.city}'. Assign a lead whose localExpertForms covers this market.`,
      });
    }

    // Get current lead (for "Reassign from A to B?" UI surfacing — server still does it).
    const currentLead = await getNeighborhoodCurrentLead(id);

    // Atomic swap: demote any existing lead, upsert the new one with is_lead=true.
    await db.transaction(async (tx) => {
      // Step 1: demote whatever's currently lead.
      await tx.update(expertNeighborhoods)
        .set({ isLead: false, updatedAt: new Date() })
        .where(and(eq(expertNeighborhoods.neighborhoodId, id), eq(expertNeighborhoods.isLead, true)));

      // Step 2: upsert the new lead (expert may or may not have an existing row).
      await tx.execute(sql`
        INSERT INTO expert_neighborhoods (expert_id, neighborhood_id, is_lead, updated_at)
        VALUES (${expertId}, ${id}, true, NOW())
        ON CONFLICT (expert_id, neighborhood_id) DO UPDATE SET
          is_lead = true,
          updated_at = NOW()
      `);
    });

    await insertAccessAuditLog({
      actorId: auth.userId,
      actorRole: "admin",
      action: "neighborhood_lead_assigned",
      resourceType: "neighborhood",
      resourceId: id,
      targetUserId: expertId,
      metadata: {
        neighborhoodId: id,
        replaced: currentLead?.expertId ?? null,
        marketCheck,
      },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(err => console.error("[neighborhoods] audit failed:", err));

    res.json({
      ok: true,
      neighborhoodId: id,
      newLeadExpertId: expertId,
      replacedLeadExpertId: currentLead?.expertId ?? null,
      marketCheck,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/admin/neighborhoods/:id/adjacency — set adjacent_keys with symmetric writes.
// Body: { adjacentKeys: string[] }. All slugs must reference neighborhoods in the
// SAME (city, country). Removing a slug also removes this neighborhood from
// that slug's adjacent_keys. Adding does the same in reverse. Transactional.
router.patch("/api/admin/neighborhoods/:id/adjacency", isAuthenticated, async (req, res) => {
  const auth = await isAdmin(req);
  if (!auth.ok) return res.status(403).json({ error: "Admin access required" });
  try {
    const id = req.params.id;
    const { adjacentKeys } = req.body;
    if (!Array.isArray(adjacentKeys) || !adjacentKeys.every(s => typeof s === "string" && s.length <= 100)) {
      return res.status(400).json({ error: "adjacentKeys must be an array of slugs" });
    }
    const newKeys: string[] = Array.from(new Set(adjacentKeys.map(s => s.trim()).filter(Boolean)));

    const self = await getNeighborhoodById(id);
    if (!self) return res.status(404).json({ error: "Neighborhood not found" });
    if (newKeys.includes(self.slug)) {
      return res.status(400).json({ error: "adjacency_self_loop", message: "A neighborhood cannot be adjacent to itself." });
    }

    // Validate every target slug is in the same (city, country).
    if (newKeys.length > 0) {
      const validTargets = await db.execute(sql`
        SELECT slug FROM city_neighborhoods
        WHERE city = ${self.city} AND country = ${self.country} AND slug = ANY(${newKeys})
      `);
      const validSlugs = new Set((validTargets.rows ?? []).map((r: any) => r.slug));
      const invalid = newKeys.filter(k => !validSlugs.has(k));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: "adjacency_cross_market",
          message: `Adjacency must stay within (${self.city}, ${self.country}). Invalid slugs: ${invalid.join(", ")}`,
        });
      }
    }

    const oldKeys: string[] = Array.isArray(self.adjacentKeys) ? self.adjacentKeys : [];
    const added = newKeys.filter(k => !oldKeys.includes(k));
    const removed = oldKeys.filter(k => !newKeys.includes(k));

    await db.transaction(async (tx) => {
      // Update self.
      await tx.update(cityNeighborhoods)
        .set({ adjacentKeys: newKeys, updatedAt: new Date() })
        .where(eq(cityNeighborhoods.id, id));

      // For each ADDED slug: append self.slug to that neighborhood's adjacent_keys.
      for (const slug of added) {
        await tx.execute(sql`
          UPDATE city_neighborhoods
          SET adjacent_keys = ARRAY(SELECT DISTINCT unnest(COALESCE(adjacent_keys, ARRAY[]::TEXT[]) || ARRAY[${self.slug}]::TEXT[])),
              updated_at = NOW()
          WHERE city = ${self.city} AND country = ${self.country} AND slug = ${slug}
        `);
      }

      // For each REMOVED slug: drop self.slug from that neighborhood's adjacent_keys.
      for (const slug of removed) {
        await tx.execute(sql`
          UPDATE city_neighborhoods
          SET adjacent_keys = ARRAY(SELECT x FROM unnest(COALESCE(adjacent_keys, ARRAY[]::TEXT[])) AS x WHERE x <> ${self.slug}),
              updated_at = NOW()
          WHERE city = ${self.city} AND country = ${self.country} AND slug = ${slug}
        `);
      }
    });

    await insertAccessAuditLog({
      actorId: auth.userId,
      actorRole: "admin",
      action: "neighborhood_adjacency_update",
      resourceType: "neighborhood",
      resourceId: id,
      metadata: { neighborhoodId: id, before: oldKeys, after: newKeys, added, removed, symmetric: true },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch(err => console.error("[neighborhoods] audit failed:", err));

    res.json({ ok: true, neighborhoodId: id, adjacentKeys: newKeys, added, removed });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin-only trigger for the daily digest — useful for ops verification without
// waiting for the 24-hour cron. Protected by requireAdminLocal (role=admin check).
router.post("/api/admin/trigger-digest", requireAdminLocal, async (_req, res) => {
  try {
    const { runDailyAdminDigest } = await import("../jobs/dailyAdminDigest");
    await runDailyAdminDigest();
    res.json({ ok: true, message: "Digest run complete — check server log for result" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Canonical on-demand digest endpoint (matches user-facing API contract).
// Alias of /api/admin/trigger-digest with a standardised response envelope.
router.post("/api/admin/digest/send-now", requireAdminLocal, async (_req, res) => {
  try {
    const { runDailyAdminDigest } = await import("../jobs/dailyAdminDigest");
    await runDailyAdminDigest();
    res.json({
      success: true,
      message: "Digest triggered successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Digest failed",
      error: String(err),
    });
  }
});

// ─── Account suspension management ──────────────────────────────────────────
// Suspension is a temporary, recoverable block distinct from soft-delete.
// PII is NOT anonymized — admins can unsuspend and the user can log back in.
// Active sessions are terminated immediately: isAuthenticated checks isSuspended
// on every request, so a currently-logged-in user is kicked out at their next call.

const suspendBodySchema = z.object({
  reason: z.string().min(1, "Suspension reason is required").max(500),
});

router.patch("/api/admin/users/:id/suspend", isAuthenticated, async (req, res) => {
  try {
    // Email-auth sessions carry user.id (no claims); Replit Auth carries claims.sub.
    const adminUserId = getUserId(req)!;
    const adminUser = await storage.getUser(adminUserId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const parsed = suspendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed", errors: parsed.error.errors });
    }

    const { id } = req.params;
    const { reason } = parsed.data;

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.isDeleted) return res.status(400).json({ message: "Cannot suspend a deleted account" });
    if (target.role === "admin") return res.status(400).json({ message: "Cannot suspend another admin account" });

    const [updated] = await db
      .update(users)
      .set({ isSuspended: true, suspendedAt: new Date(), suspensionReason: reason, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    // Destroy all active sessions for this user so the suspension takes effect immediately.
    try {
      await db.execute(
        sql`DELETE FROM sessions WHERE sess->'passport'->'user'->'claims'->>'sub' = ${id}`
      );
    } catch (sessErr) {
      console.warn("[admin/suspend] session purge failed (non-fatal):", (sessErr as any)?.message);
    }

    await insertAccessAuditLog({
      actorId: adminUserId,
      actorRole: adminUser.role,
      action: "user_suspend",
      resourceType: "user",
      resourceId: id,
      targetUserId: id,
      metadata: { reason },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[admin/suspend] audit log failed (non-fatal):", err));

    res.json({ message: "Account suspended", user: { id: updated.id, isSuspended: updated.isSuspended, suspendedAt: updated.suspendedAt, suspensionReason: updated.suspensionReason } });
  } catch (error: any) {
    console.error("Error suspending user:", error);
    res.status(500).json({ message: "Failed to suspend account", error: error.message });
  }
});

// ─── QA Live Verify endpoint ─────────────────────────────────────────────────
// GET /api/admin/qa/last-run
// Returns the most recent QA run snapshot so the checklist page can show a badge.
router.get("/api/admin/qa/last-run", isAuthenticated, async (req, res) => {
  try {
    const adminUserId = getUserId(req)!;
    const adminUser = await storage.getUser(adminUserId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { qaRunSnapshots } = await import("@shared/schema");
    const { desc: descOrd } = await import("drizzle-orm");
    const rows = await db.select().from(qaRunSnapshots).orderBy(descOrd(qaRunSnapshots.ranAt)).limit(1);
    if (rows.length === 0) return res.json({ lastRun: null });
    const r = rows[0];
    res.json({
      lastRun: {
        id: r.id,
        ranAt: r.ranAt,
        triggeredBy: r.triggeredBy,
        passCount: r.passCount,
        failCount: r.failCount,
        totalCount: r.totalCount,
      },
    });
  } catch (err: any) {
    console.error("QA last-run error:", err);
    res.status(500).json({ message: "Failed to fetch last run" });
  }
});

// POST /api/admin/qa/run-nightly
// Triggers the nightly QA job on-demand (same as the scheduled 02:00 UTC run).
router.post("/api/admin/qa/run-nightly", isAuthenticated, async (req, res) => {
  try {
    const adminUserId = getUserId(req)!;
    const adminUser = await storage.getUser(adminUserId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { runNightlyQA } = await import("../jobs/nightlyQA");
    const result = await runNightlyQA("manual");
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("QA run-nightly error:", err);
    res.status(500).json({ message: "Failed to run nightly QA", error: err.message });
  }
});

// GET /api/admin/qa/verify
// Runs all DB / filesystem checks for the Architect Sign-Off Audit and
// returns a flat map of checkId → { pass, detail }.
// Admin-only. Safe to call repeatedly — read-only queries throughout.

router.get("/api/admin/qa/verify", isAuthenticated, async (req, res) => {
  try {
    const adminUserId = getUserId(req)!;
    const adminUser = await storage.getUser(adminUserId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { runQAVerify } = await import("../services/qa-verify.service");
    const summary = await runQAVerify();
    return res.json({ ok: true, results: summary.results, checkedAt: summary.checkedAt });
  } catch (error: any) {
    console.error("QA verify error:", error);
    res.status(500).json({ message: "Verify failed", error: error.message });
  }
});

// ── Tombstone: the old inline verify body was removed. All check logic
// now lives in server/services/qa-verify.service.ts. Delete this comment
// once the migration has been verified in production.

router.patch("/api/admin/users/:id/unsuspend", isAuthenticated, async (req, res) => {
  try {
    // Email-auth sessions carry user.id (no claims); Replit Auth carries claims.sub.
    const adminUserId = getUserId(req)!;
    const adminUser = await storage.getUser(adminUserId);
    if (!adminUser || adminUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { id } = req.params;
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (!target.isSuspended) return res.status(400).json({ message: "Account is not suspended" });

    const [updated] = await db
      .update(users)
      .set({ isSuspended: false, suspendedAt: null, suspensionReason: null, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    await insertAccessAuditLog({
      actorId: adminUserId,
      actorRole: adminUser.role,
      action: "user_unsuspend",
      resourceType: "user",
      resourceId: id,
      targetUserId: id,
      metadata: { previousReason: target.suspensionReason ?? null },
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((err: any) => console.error("[admin/unsuspend] audit log failed (non-fatal):", err));

    res.json({ message: "Account reinstated", user: { id: updated.id, isSuspended: updated.isSuspended } });
  } catch (error: any) {
    console.error("Error unsuspending user:", error);
    res.status(500).json({ message: "Failed to reinstate account", error: error.message });
  }
});

// ─── Phase 4: affiliate partner approval (partner-level admin gate, D1a) ──────────────
// Rides the blanket /api/admin adminApiGuard (§2). Approval is set ONLY here — a partner
// can never self-approve via the client-facing create/update paths. Approving a partner
// clears its whole product catalog to the public read-gate; rejecting keeps it hidden.

router.post("/api/admin/affiliate/partners/:id/approve", isAuthenticated, async (req: any, res) => {
  try {
    const reviewerId = getUserId(req)!;
    const partner = await affiliateScraperService.setPartnerApproval(req.params.id, "approved", reviewerId);
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    res.json({ partner, message: "Partner approved" });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to approve partner", error: error.message });
  }
});

router.post("/api/admin/affiliate/partners/:id/reject", isAuthenticated, async (req: any, res) => {
  try {
    const reviewerId = getUserId(req)!;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) return res.status(400).json({ message: "A rejection reason is required." });
    const partner = await affiliateScraperService.setPartnerApproval(req.params.id, "rejected", reviewerId, reason);
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    res.json({ partner, message: "Partner rejected" });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to reject partner", error: error.message });
  }
});

// ─── Travelpayouts cache status ────────────────────────────────────────────────
// Rides the blanket /api/admin adminApiGuard (§2). Aggregates all cache rows by
// brand so operators can see whether displayed eSIM, transport, and activity
// cards are fresh or stale. refreshedAt (migration 221, stamped on every upsert
// by shared-cache.service.ts) is the accurate last-refresh time — createdAt is
// immutable after first insert and is not surfaced here. Pre-migration rows with
// null refreshedAt are represented as lastRefreshedAt: null ("unknown").
router.get("/api/admin/travelpayouts-cache/status", isAuthenticated, async (_req, res) => {
  try {
    const now = new Date();
    const rows = await db
      .select({
        brand: travelpayoutsCache.brand,
        cacheKey: travelpayoutsCache.cacheKey,
        expiresAt: travelpayoutsCache.expiresAt,
        refreshedAt: travelpayoutsCache.refreshedAt,
      })
      .from(travelpayoutsCache)
      .orderBy(travelpayoutsCache.brand, travelpayoutsCache.cacheKey);

    const { aggregateBrandStatus } = await import("../services/travelpayouts/travelpayouts-cache-status");
    const brands = aggregateBrandStatus(rows, now);
    res.json({ brands, retrievedAt: now });
  } catch (error: any) {
    console.error("[admin/travelpayouts-cache/status] error:", error);
    res.status(500).json({ message: "Failed to retrieve cache status", error: error.message });
  }
});

export default router;
