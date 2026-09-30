import { verifyTripOwnership } from '../utils/trip-ownership';
import { zodErrorBody } from "../utils/zod-error-body";
import { getUserId } from "../utils/auth";
import { authorizeTripLogistics, authorizeTripOwnerTier } from '../utils/trip-logistics-auth';
import { createRateLimiter } from "../infrastructure/rate-limiter";
import { withQueryTimer } from '../utils/queryTimer';
import path from "path";
import fs from "fs";
import { transformDevHtml } from "../vite-dev-html";
import crypto from "crypto";
import { Router } from "express";
import type { Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
// W2 (Trip-Canon Lane 1 Phase 1b): `cart_items` has exactly ONE writer — the projection module.
// NOTE: the apply-to-cart handler below is a §9 SHADOWED copy (this router mounts LAST, so the
// inline routes.ts copy wins the path). It is re-pointed anyway so no live-or-dead file retains a
// direct cart write. Passthrough; behavior identical.
import * as cartProjection from "../services/cart-projection.service";
// The ONE server-side resolution of the item→EVENT link (migration 277) — shared with the live
// POST rail in server/routes.ts so the two cannot drift (§18 rule 1).
import { resolveItemEventLink } from "../services/item-event-link.service";
// The ONE server-side resolution of the item→AFFILIATE PRODUCT link (migration 256), on the same
// pattern and shared with the live POST rail in server/routes.ts (§18 rule 1).
import { resolveItemAffiliateLink } from "../services/item-affiliate-link.service";
import { discardPlanProposal, listPlanProposals } from "../services/plan-proposals.service";
import { createProposalFromAsk } from "../services/proposal-create.service";
// L16 lane 1 — the CREATE rail (punchlist D-45..D-50, ledger `2026-09-16-l16-rulings-d45-d50`).
// The two named limits live in the ONE existing fixed-window limiter module (§18 rule 1, D-46 ii);
// the in-flight marker is a mutual exclusion over the model call, never a §15 claim (D-46 i).
import { checkAiAskRateLimit } from "../infrastructure/message-rate-limiter";
import { beginAiAsk, endAiAsk } from "../services/ai-ask-inflight";
import { aiAskBodySchema } from "@shared/ai-ask-request";
// The APPLY and its CHARGE (punchlist D-20/D-21, ledger `2026-09-15-d20-d21-proposal-charge`).
// The route holds the gate and the sequence; every money decision lives in the two modules below —
// the PURE authorization predicate and the one charge/apply service (§18 rule 1).
import {
  logProposalApplyBasis,
  resolveProposalApplyAuthorization,
} from "../services/proposal-apply-authorization";
import {
  applyPlanProposal,
  assertProposalCatalogStillValid,
  claimProposalCharge,
  createProposalChargeIntent,
  getPlanProposal,
  ledgerProposalCharge,
  ProposalApplyRefused,
  resolveAiTaskChargeCents,
  retrieveProposalPaymentIntent,
  stampProposalPaymentIntent,
  verifyProposalPayment,
  isRefundableProposalRefusal,
  refundRefusedProposalCharge,
  type ProposalRefundOutcome,
} from "../services/proposal-charge.service";
import { recordAiTaskToll } from "../services/fee-ledger.service";
import {
  PLAN_PROPOSAL_STATUS_PROPOSED,
  PLAN_PROPOSAL_STATUS_REFUNDED,
  PLAN_PROPOSAL_ALREADY_REFUNDED_MESSAGE,
} from "@shared/plan-proposals";
import { coversAction } from "../services/trip-entitlement.service";
import { stripePaymentService } from "../services/stripe-payment.service";
// Ledger `2026-09-05-slip-own-your-plan` (review R14): the ONE row-level answer to "is this row
// money?", re-exported by the rebuild guard so the set-level WHERE clause and this single-row test
// are read together (§18 rule 1). Imported from the guard module rather than from `@shared`
// directly, so the relationship between the two is visible at the call site.
import {
  itineraryItemIsMoneyCommitted,
} from "../services/itinerary-rebuild-guard";
import { ITEM_BOOKED_DELETE_ERROR } from "@shared/itinerary-item-money";
// The ONE writer and the ONE reader of a plan's ordered stops (migration 281, Locked Decision 34).
// The mirror rule — position 0's name IS `trips.destination` — lives there, not here.
import {
  getTripDestinations,
  replaceTripDestinations,
  tripDestinationsBodySchema,
} from "../services/trip-destinations.service";
import { redactMoneyForNonOwner } from "../utils/share-money-redaction";
import { api } from "@shared/routes";
// ONE derivation of the plan's party total, shared with the client (ledger
// `2026-09-05-slip-events-first-render`; CLAUDE.md Locked Decision 33 / §18 rule 1).
import { partyTotal } from "@shared/plan-vocabulary";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
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
  eventTypeEnum,
  // Ledger `2026-09-04-step4-variants-fields` — the ONE field authority for migration 284's three
  // step-4 columns, shared with the pre-trip pen's allowlist so the two rails cannot drift.
  tripBudgetApproverNameSchema,
  tripBudgetApproverEmailSchema,
  tripAccessibilityNoteSchema,
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
// Phase 1c — "build around a location": rank anchor candidates for the Optimize popup (the read
// rail). The pinned-anchor WRITE is resolved on the live POST /generate handler in server/routes.ts.
import { loadRankedAnchors, type NamedStop } from "../services/anchor-candidates";
import { loadTripOptimizerInputs } from "../services/optimizer-baseline.service";
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
  itineraryItemEventLinkSchema,
  itineraryItemAffiliateLinkSchema,
  insertTripEmergencyContactSchema,
  insertTripAlertSchema,
  insertProviderAvailabilityScheduleSchema,
  insertProviderBlackoutDateSchema,
  tripExpertAdvisors,
} from "@shared/schema";
import { authoredItemPriceRefusal } from "@shared/item-kind";
import {
  resolveCommissionRates,
  type CommissionRates,
} from "../services/commission";
import { getTripRole } from "../utils/trip-role";
// The CANONICAL §12 READ-access advisor predicate (pending/accepted/assigned; rejected and any
// unrecognised status DENY). Imported directly rather than re-derived — V-33.
import { isTripAdvisor } from "../utils/trip-advisor";
import { isManagingEaForTrip } from "../services/ea-plan-delegate.service";
import { isTripAuthor } from "../utils/trip-authorship";
import { renderTripPdf } from "../services/trip-pdf.render";
// The plan's .ics — ONE generator, two callers (§18 rule 1). `generateIcsContent` already owned
// the wall-clock/zone decision for `GET /api/my-itinerary/:id/calendar`; the trip-keyed route
// below is a second CALLER of it, never a second exporter.
import { generateIcsContent } from "../utils/ics-calendar";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { resolveTripTimezone } from "../services/trip-timezone";
// Plan-approval mode-flip (migration 164, QA_PUNCH_LIST W2-A item 13): see routes.ts's import of
// the same module for the full rationale. Advisor-only gate — never owner, never author.
import { isPlanApprovedForExpert, PLAN_APPROVED_SUGGEST_INSTEAD_ERROR } from "../utils/plan-approval";

import { trackAnthropicResponse } from "../services/ai-cost-tracker";
import { buildItineraryViewOgTags, injectIntoHead } from "../utils/html-head";
import { sanitizeInput } from "../utils/sanitize";

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

function optimizerItemsToNamedStops(
  baselineItems: Array<{
    id?: unknown;
    name?: unknown;
    title?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  }>,
): NamedStop[] {
  return baselineItems.map((item) => {
    const latitude = item.latitude != null ? Number(item.latitude) : NaN;
    const longitude = item.longitude != null ? Number(item.longitude) : NaN;
    return {
      id: String(item.id),
      name:
        typeof item.name === "string"
          ? item.name
          : typeof item.title === "string"
            ? item.title
            : "Stop",
      lat: Number.isFinite(latitude) ? latitude : null,
      lng: Number.isFinite(longitude) ? longitude : null,
    };
  });
}

interface TripAnchorCandidatesDependencies {
  getTrip: typeof storage.getTrip;
  loadTripInputs: typeof loadTripOptimizerInputs;
  rankAnchors: typeof loadRankedAnchors;
}

export function createTripAnchorCandidatesHandler(
  dependencies: TripAnchorCandidatesDependencies = {
    getTrip: storage.getTrip.bind(storage),
    loadTripInputs: loadTripOptimizerInputs,
    rankAnchors: loadRankedAnchors,
  },
) {
  return async (req: any, res: any) => {
    try {
      const userId = getReqUserId(req);
      const trip = await dependencies.getTrip(req.params.id);
      if (!trip || trip.userId !== userId) {
        return res.status(404).json({ message: "Trip not found" });
      }

      const inputs = await dependencies.loadTripInputs(trip.id);
      const stops = optimizerItemsToNamedStops(inputs.baselineItems);
      const ranked = await dependencies.rankAnchors(trip.destination, stops, { limit: 8 });
      return res.json(ranked);
    } catch (error) {
      console.error("Error loading trip anchor candidates:", error);
      return res.status(500).json({ message: "Failed to load anchor candidates" });
    }
  };
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

// sanitizeInput: the ONE canonical copy lives in server/utils/sanitize.ts (board #1318).

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
    // LD 52 (C): the managing assistant passes only through the LIVE accepted link.
    const isManagingEa = !isOwner && userId != null && (await isManagingEaForTrip(trip.id, userId));
    const isGuestWithToken = shareToken && trip.shareToken === shareToken;
    // V-33 (ledger `2026-09-15-v32-v33-leads-door-item-read-gate`). The expert arm here used to be
    // `(trip as any).expertId === userId` — a grant NOTHING can satisfy. `trips.expert_id` is
    // declared (shared/schema.ts) and no code path under `server/` writes it, so an expert assigned
    // through the ONE author of `trip_expert_advisors` (`upsertTripAdvisorRow`, Locked Decision 32's
    // CORRECTION paragraph) was refused 403 on the trip they had just been assigned to AND was
    // libelled by the `[IDOR ATTEMPT]` line below — a §13 falsehood in the log as well as a refused
    // read. The arm now asks the question that dead column was standing in for, through the
    // CANONICAL §12 READ predicate (`isTripAdvisor`, server/utils/trip-advisor.ts — the single
    // source of truth every other read surface authorizes against, and the same function
    // `storage.isExpertAssignedToTrip` and `getTripRole` both delegate to; §18 rule 1: one
    // implementation, one more caller — never a second copy of the status allow-list here).
    // `pending` PASSES: Locked Decision 12 names the trip GET among the read surfaces that keep
    // granting it, so an invited expert can see the trip while deciding. Evaluated ONLY when no
    // cheaper arm already granted, so an owner's read costs no extra query. The EA-managed and
    // share-token arms are untouched.
    const isAssignedAdvisor =
      !isOwner && !isManagingEa && !isGuestWithToken
        ? await isTripAdvisor(trip.id, userId)
        : false;
    if (!isOwner && !isAssignedAdvisor && !isManagingEa && !isGuestWithToken) {
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
    // principal; only the managing EA is. Redact it here rather than trust
    // every future consumer of the `...trip` spread to know not to render it — the same posture
    // `/api/itinerary-share/:token` below already takes for its own (unrelated)
    // `shared_itineraries.expertNotes` column. `expertTravelerNote` (§21's traveler-facing
    // counterpart) is NOT redacted — it is meant for exactly this audience.
    //
    // V-33: this predicate is DELIBERATELY NOT widened by the advisor arm added above, and the
    // change is behaviour-preserving — its former `isExpert` term read `trips.expertId`, which
    // nothing writes, so the managing EA was already the only principal it could ever admit. A
    // builder-side reader of the private build notes has its OWN rail,
    // `GET /api/trips/:tripId/expert-notes` (booking-actions.ts), hardened Aug 29 2026 to the §12
    // WRITE allow-list (accepted/assigned — a `pending` advisor is refused there). Letting a
    // READ-status advisor inherit the notes through this spread would re-open exactly the §21 leak
    // that rail closed, so the access fix and the redaction predicate stay separate decisions.
    const canSeePrivateExpertNotes = isManagingEa;

    // Migration 281 (ledger `2026-09-04-stops-and-event-time`, Locked Decision 34): the plan's
    // ORDERED STOPS, additive — every existing consumer ignores the key. Gated by exactly the
    // owner/expert/EA/share-token check above, and by nothing else.
    //
    // §13 — AN EMPTY ARRAY MEANS NOT CAPTURED, NOT "no destination". Legacy plans have no child
    // rows (there is no backfill, deliberately), and `trips.destination` — carried unchanged in the
    // `...trip` spread directly below — is still the plan's headline destination and the
    // position-0 mirror of this list when the list exists. A reader that meets `[]` FALLS BACK TO
    // `trip.destination` and says so; it must never render such a plan as having nowhere to go.
    const destinations = await getTripDestinations(trip.id);

    res.json({
      ...trip,
      expertNotes: canSeePrivateExpertNotes ? trip.expertNotes : null,
      expertWorkspaceStatus: advisorRow?.workspaceStatus ?? null,
      destinations,
    });
  });


/**
 * PUT /api/trips/:tripId/destinations — the plan's ordered stops (migration 281, Locked
 * Decision 34). Replace-list: the full ordered array in, positions derived server-side from its
 * order, `trips.destination` re-mirrored from stop 0 by the one writer.
 *
 * OWNER-GATED, FAIL-CLOSED — deliberately NOT the §12 advisor posture that item mutations take.
 * Stops are the plan's IDENTITY (they move its market, its timezone and its headline destination),
 * not its contents, so an advisor with write access to items does not get to move the plan
 * somewhere else. `verifyTripOwnership` answering false is a 403 with nothing else attempted.
 *
 * The body allowlist, the empty-list refusal, the 20 cap and the both-or-neither coordinate rule
 * all live in the service — this handler holds no second copy of any of them (§18 rule 1).
 */
router.put("/api/trips/:tripId/destinations", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    if (!(await verifyTripOwnership(req.params.tripId, userId))) {
      return res.status(403).json({ message: "Not your trip" });
    }
    const parsed = tripDestinationsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid stops", errors: parsed.error.flatten() });
    }
    const result = await replaceTripDestinations(req.params.tripId, parsed.data.stops);
    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }
    res.json({ destinations: result.destinations });
  } catch (err: any) {
    // The FOR UPDATE lock in replaceTripDestinations serializes concurrent saves; a 23505 here is
    // the residual race backstop — the list changed under this caller, and a fresh read + retry
    // succeeds. Never a silent 500 either way.
    const pgCode = err?.code ?? err?.cause?.code;
    if (pgCode === "23505") {
      return res.status(409).json({ message: "Stops changed elsewhere — reload and try again" });
    }
    console.error("[trip-destinations] save failed:", err);
    res.status(500).json({ message: "Failed to save stops" });
  }
});


// POST /api/trips — MOUNT-ORDER DEAD TWIN. tripsRoutes is `app.use`d LAST, so the inline
// registration in `server/routes.ts` always wins this path and this handler never runs. It is
// ANNOTATED rather than duplicated or quietly aligned, per the LD 29 precedent for a shadowed POST
// twin (a second copy of an admission decision is the drift class §18 rule 1 names).
//
// PORT-FORWARD WARNING — READ BEFORE RESURRECTING (ledger `2026-09-14-guest-trip-mint-responds`,
// punchlist R-9). This copy still carries the guest branch the live handler DELETED: it mints a
// NULL-owner `trips` row for an anonymous caller and hands back a `shareToken`. That is the product
// `2026-09-13-guest-cart-becomes-plan` holds — "nothing lets an anonymous principal own a `trips`
// row" (G2 HELD; punchlist D-15) — and the live handler now refuses the anonymous mint with a 401
// BEFORE the parse and before any write. If this path is ever moved back here, MOVE the canonical
// handler; do not revive this one, which would reopen guest trips by accident.
// (It does not hang the way the live copy did: this file imports `crypto` as a namespace, so
// `crypto.randomBytes` resolves here. The hang was the live copy reading the ESM Web Crypto global.)
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
      // MINT SITE 2 of 10 (migration 302, ledger `2026-09-15-d22-dates-confirmed`, punchlist
      // D-22). This is the SHADOWED twin of the live `POST /api/trips` in the `server/routes.ts`
      // monolith (see the port-forward warning above — the monolith registers first). It carries
      // the same claim for the same reason: `insertTripSchema` requires the dates and the client's
      // one mint door refuses rather than defaulting them. Kept in step with the live copy
      // deliberately — a resurrected twin that silently stopped stamping would re-open the exact
      // §13 gap this column closes.
      const trip = await storage.createTrip({ ...sanitizedInput, userId }, { datesChosenByTraveler: true });

      // If guest, ensure they have a shareToken for access
      if (!userId && !trip.shareToken) {
        const token = crypto.randomBytes(32).toString("hex");
        const updated = await storage.setTripShareToken(trip.id, token);
        return res.status(201).json(updated);
      }

      res.status(201).json(trip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(zodErrorBody(err));
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
      const isManagingEa = !isOwner && userId != null && (await isManagingEaForTrip(trip.id, userId));
      const isGuestWithToken = shareToken && trip.shareToken === shareToken;

      if (!isOwner && !isManagingEa && !isGuestWithToken) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const updatedTrip = await storage.updateTrip(req.params.id, sanitizedInput);
      res.json(updatedTrip);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(zodErrorBody(err));
      }
      throw err;
    }
  });

// ── S4 SWEEP (ledger 2026-09-07-shadowed-trip-twins) ─────────────────────────────────
// FOURTEEN §9 mount-order-dead POST twins were deleted here (they always lost to the
// inline routes.ts registrations; tripsRoutes mounts LAST): claim, participants,
// participants/bulk-invite, contracts, transactions, transactions/split,
// budget/calculate-split, itinerary-items, itinerary/reorder, itinerary/optimize-order,
// activate-transport, emergency-contacts, emergency/initialize, alerts.
// PORT-FORWARD WARNING (from the deleted banners, preserved): if any of these handlers
// is ever reintroduced HERE, the live routes.ts copies carry admission allowlists the
// deleted copies lacked — the booking-input allowlist (itineraryItemBookingInputsSchema)
// and the item→event pairing check (itineraryItemEventLinkSchema + resolveItemEventLink).
// Reintroduce by MOVING the canonical handler, never by resurrecting a stale copy.



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
// REMOVED (Phase 3b): the §9 mount-order-dead generate twin below this point — the
// identically-routed POST /api/trips/:id/generate-itinerary in routes.ts always won, so
// this copy never executed. Deleted so there is one generate handler, not a shadowed pair.


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
        return res.status(400).json(zodErrorBody(err));
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


// Phase 1c: the located stops an anchor is scored against. Prefer the trip-backed loader (real
// item/catalog coordinates) when the comparison has a trip; otherwise there is no coordinate source
// on this path and anchors are scored against nothing — honest, not fabricated (§13). Never throws.
async function buildAnchorStops(
  comparison: { tripId?: string | null },
): Promise<NamedStop[]> {
  if (!comparison.tripId) return [];
  try {
    const inputs = await loadTripOptimizerInputs(comparison.tripId);
    return optimizerItemsToNamedStops(inputs.baselineItems);
  } catch (err) {
    console.warn("[anchor-stops] trip load failed (non-critical):", (err as Error).message);
    return [];
  }
}

// Phase 3: pre-create candidate read for the Slip popup. Owner-gated by the trip itself and scored
// against the exact optimizer baseline the create handler will use. Read-only: no comparison row,
// payment, or generation is started here.
router.get(
  "/api/trips/:id/anchor-candidates",
  isAuthenticated,
  createTripAnchorCandidatesHandler(),
);

// Phase 1c: rank real anchor candidates (hotel / neighborhood / activity) for the Optimize popup.
router.get("/api/itinerary-comparisons/:id/anchor-candidates", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const comparison = await storage.getItineraryComparison(req.params.id);
      if (!comparison) {
        return res.status(404).json({ message: "Comparison not found" });
      }
      if (comparison.userId !== userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      // Defensive: only load trip inputs for a trip the same user owns (loadTripOptimizerInputs
      // authorizes nothing itself).
      if (comparison.tripId) {
        const trip = await storage.getTrip(comparison.tripId);
        if (trip && trip.userId !== userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }
      }
      const stops = await buildAnchorStops(comparison);
      const ranked = await loadRankedAnchors(comparison.destination, stops, { limit: 8 });
      res.json(ranked);
    } catch (error) {
      console.error("Error loading anchor candidates:", error);
      res.status(500).json({ message: "Failed to load anchor candidates" });
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
            // travel_pulse_hidden_gems has no `name` column — the field is placeName
            // (fixed Aug 29 2026: g.name fed the model undefined gem names).
            name: g.placeName,
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

// ── The printable trip document (Lane C, ledger `2026-09-03-slip-convergence`) ───────────────
//
// Renders the trip's CANONICAL `itinerary_items` — the same rows the slip, the PlanCard and the
// cart projection read — so the paper copy can never disagree with the screen. A buyer of a
// ready-made trip gets both: the editable clone (ready-made-purchase.service.ts) and this.
//
// NOT a replacement for `/api/my-itinerary/:id/pdf`, which renders an itinerary COMPARISON's
// variant rows; a purchased ready-made trip has no comparison, so that endpoint could never
// serve this. Two siblings, two sources, neither reimplementing the other.
//
// READ gate, not a write gate: `getTripRole` (§12 — read surfaces grant a PENDING advisor;
// only mutation paths take the one write resolver, `authorizeTripLogistics(…, { requireWriteAccess:
// true })` — V-29), plus the authoring-mode branch so an author can
// print the source trip they are building. `privateNotes` and `trips.expertNotes` are never
// read by the renderer (§21).
router.get("/api/trips/:tripId/pdf", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId } = req.params;

      const trip = await storage.getTrip(tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const tripRole = await getTripRole(tripId, userId);
      if (!tripRole && !(await isTripAuthor(tripId, userId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const items = await storage.getItineraryItems(tripId);

      const pdf = await renderTripPdf({
        title: trip.title || "Your trip",
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        trackingNumber: trip.trackingNumber,
        // §21: the TRAVELER-FACING trip note. `trip.expertNotes` (private build notes) is
        // deliberately not passed — the renderer has no field for it.
        expertTravelerNote: (trip as any).expertTravelerNote ?? null,
        items: items.map((item: any) => ({
          title: item.title,
          description: item.description,
          dayNumber: item.dayNumber,
          startTime: item.startTime,
          endTime: item.endTime,
          scheduledDate: item.scheduledDate,
          locationName: item.locationName,
          locationAddress: item.locationAddress,
          estimatedCost: item.estimatedCost,
          actualCost: item.actualCost,
          currency: item.currency,
          notes: item.notes,
          expertNote: item.expertNote,
          itemType: item.itemType,
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          sortOrder: item.sortOrder,
        })),
      });

      const slug = (trip.title || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "trip";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}.pdf"`);
      res.setHeader("Content-Length", String(pdf.length));
      return res.send(pdf);
    } catch (error) {
      console.error("[TripPDF] render error:", error);
      return res.status(500).json({ message: "Failed to generate trip PDF" });
    }
  });


// ── The plan's CALENDAR (.ics) — ledger `2026-09-05-slip-rail-regroup`, S11 ──────────────────
//
// WHAT WAS MISSING. `generateIcsContent` had exactly ONE route,
// `GET /api/my-itinerary/:id/calendar`, keyed on an itinerary COMPARISON id. A plan with no
// comparison — a hand-built slip, a ready-made clone, a plan the traveler never optimized — had
// no .ics at all, and the slip's rail had nothing to point at. This is that route, keyed on the
// TRIP, and it is a second CALLER of the one generator, never a second exporter (§18 rule 1):
// every decision about wall clocks, zones and floating time stays in `ics-calendar.ts`.
//
// THE ZONE IS THE PLAN'S OWN (CLAUDE.md Locked Decision 30). `itinerary_items.start_time` is a
// WALL-CLOCK string and is never converted in storage; `trips.timezone` is the zone it is READ
// in. Handed to the generator exactly as the my-itinerary route hands it over:
//   1. the plan's stored `timezone` — its own answer, stamped at mint;
//   2. failing that, the SAME server-side derivation the mint would have applied, run on this
//      trip's own destination (`resolveTripTimezone` — one module, now three callers).
// §13 — BOTH CAN ANSWER NULL, AND NULL IS A FINISHED ANSWER. The exporter then keeps its
// pre-existing RFC 5545 FLOATING output byte-for-byte. Never UTC, never the server's zone: a
// wrong instant that looks authoritative is worse than an honestly floating one.
//
// GATE: the SAME read gate the trip PDF beside it uses — `getTripRole` (§12: a read surface
// grants a PENDING advisor) plus the authoring branch — which is the plancard read's own tier.
// It is deliberately not narrower: an .ics carries the same item titles, times and places the
// PDF and the plancard already hand this exact set of viewers.
router.get("/api/trips/:tripId/calendar", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const { tripId } = req.params;

      const trip = await storage.getTrip(tripId);
      if (!trip) return res.status(404).json({ message: "Trip not found" });

      const tripRole = await getTripRole(tripId, userId);
      if (!tripRole && !(await isTripAuthor(tripId, userId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // `trips.start_date` is NOT NULL, so the generator's day arithmetic always has a real
      // anchor — nothing is invented here when a row is odd; a missing one would be a 400.
      if (!trip.startDate) {
        return res.status(400).json({ message: "This plan has no start date yet" });
      }

      const planTimezone = (trip as any).timezone ?? resolveTripTimezone(trip.destination) ?? null;
      const items = await storage.getItineraryItems(tripId);

      const icsContent = generateIcsContent(
        {
          startDate: trip.startDate as unknown as string,
          title: trip.title ?? null,
          destination: trip.destination ?? null,
          timezone: planTimezone,
          // Migration 302 (ledger `2026-09-15-d22-dates-confirmed`, punchlist D-22). `start_date`
          // is NOT NULL, so this export ALWAYS had a day to count from — including for a
          // ready-made clone whose window is the fulfilment job's `new Date()`. Handing the fact
          // over lets the ONE zone decision inside the generator fall back to floating rather than
          // stamping a confident `…Z` instant onto a date nobody picked (§13). ONE predicate,
          // `planDatesAreConfirmed` (`shared/plan-dates.ts`), shared with every other reader.
          datesConfirmed: planDatesAreConfirmed((trip as any).datesConfirmedAt),
        },
        items.map((item: any) => ({
          id: item.id,
          dayNumber: item.dayNumber,
          startTime: item.startTime,
          durationMinutes: item.durationMinutes,
          name: item.title,
          description: item.description,
          location: item.locationName,
          serviceType: item.itemType,
        })),
      );

      const slug =
        (trip.title || "trip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) ||
        "trip";
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${slug}.ics"`);
      return res.send(icsContent);
    } catch (error) {
      console.error("[TripCalendar] render error:", error);
      return res.status(500).json({ message: "Failed to generate calendar file" });
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
      // ONE TRIP-WRITE RESOLVER (V-29 = option B; ledger `2026-09-15-v29-one-trip-write-resolver`).
      // Setting a backup plan WRITES the plan's items, but this rail resolved the caller through
      // `getTripRole` — the READ resolver — so it granted a `pending` advisor a write. Moving it
      // onto THE predicate therefore carries the usual delta (a) an owner with no
      // `trip_collaborators` row is no longer refused, (b) the trip author and an audit-logged
      // admin gain write here — AND A NARROWING that is §12 applied where it was missing: a
      // PENDING advisor can no longer set a backup plan. Status and body shape are unchanged; the
      // unreachable "friend" sentence is gone (no writer mints a friend row — L20 Part C).
      const denial = await authorizeTripLogistics(
        existing.tripId,
        userId,
        "POST /api/itinerary-items/:id/backup",
        { requireWriteAccess: true },
      );
      if (denial) return res.status(denial.status).json({ message: "Access denied" });
      const { backupItemId } = req.body;
      const item = await itineraryIntelligenceService.setBackupPlan(req.params.id, backupItemId);
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to set backup plan" });
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
        return res.status(400).json(zodErrorBody(err));
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
        return res.status(400).json(zodErrorBody(error));
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
        return res.status(400).json(zodErrorBody(err));
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

      // ── MONEY REDACTION (ledger 2026-09-03-share-link-price-redaction) ─────────────────────
      // Same PUBLIC-endpoint reasoning as the expertNotes/expertDiff gate above, applied to the
      // figures this response has always sent to every token holder: per-activity `cost`,
      // per-leg `estimatedCostUsd`, the plan-level `totalCost` and the transport `totalCostUsd`.
      // What a trip costs is the traveler's own business; a "view" link handed to a friend is an
      // ITINERARY, not an invoice.
      //
      // THE AXIS IS OWNER / NOT-OWNER — strictly `isOwner`, NOT `canSeeExpertContent`. The
      // expert-review widening exists because the notes are the reviewing expert's OWN content;
      // the traveler's prices are nobody else's, so a `suggest`/`edit` link holder is a non-owner
      // here like any other. Their surface renders price-free and honest (§13) rather than
      // showing someone else's money.
      //
      // ONE redaction, applied ONCE (§18 rule 1): the FULL body is built first and handed to the
      // single helper below. The four emit sites above are deliberately NOT each gated — that
      // restatement is exactly the drift the rule names, and it is how the fifth money field
      // would leak. Keys are DELETED, never zeroed (§13).
      const payload = {
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
      };
      res.json(isOwner ? payload : redactMoneyForNonOwner(payload));
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
      const shareUrl = `${req.protocol}://${req.get("host")}/itinerary-view/${token}`;
      // Escaped at render — see buildItineraryViewOgTags (board #1318 audit).
      const ogTags = buildItineraryViewOgTags({ destination, variantName, shareUrl });

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
      template = injectIntoHead(template, ogTags);
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
      // ONE TRIP-WRITE RESOLVER (punchlist V-29 = option B, decision-maker ruled 2026-09-15;
      // ledger `2026-09-15-v29-one-trip-write-resolver`). CLAUDE.md Locked Decision 42 **D17**
      // rules ONE "may this person rewrite the plan?" predicate; there were two. This rail used
      // the collaborator-only `getTripWriteRole`/`canMutateTrip` and hand-rolled the author branch
      // beside it. It now calls THE predicate — owner off `trips.user_id` (`verifyTripOwnership`),
      // the §12 WRITE-status advisor, the trip author, and an audit-logged admin.
      //
      // BEHAVIOUR DELTA, stated here and in the ledger row rather than slipped in:
      //   (a) an OWNER WITH NO `trip_collaborators` ROW is no longer 403'd on their own plan —
      //       ownership is read from the column instead of from a row a mint site had to remember;
      //   (b) the trip AUTHOR (the expert authoring build) and an AUDIT-LOGGED ADMIN gain write
      //       here, exactly as they already have on reorder / expert-traveler-note / the D-19
      //       proposal rails.
      // §12 IS UNWEAKENED: `requireWriteAccess: true` keeps the advisor branch at accepted/assigned
      // and NEVER pending. The old `"friend"` refusal sentence is gone because it is unreachable —
      // the predicate never reads `trip_collaborators`, and no writer in this repository mints a
      // friend row (L20 Part C). The STATUS and the body SHAPE are unchanged.
      const denial = await authorizeTripLogistics(
        tripId,
        userId,
        "PATCH /api/trips/:tripId/itinerary-items/:itemId",
        { requireWriteAccess: true },
      );
      if (denial) return res.status(denial.status).json({ message: "Access denied" });
      // THE ADVISOR-NESS the two rules below key on is NOT a second "may this person rewrite the
      // plan?" test — the gate above already answered that. It is the CANONICAL advisor predicate
      // (`storage.isExpertAssignedToTripForWrite` → `isTripAdvisorWithWriteAccess`, the same one
      // the gate's own advisor branch calls), in the `owned ? false : …` shape the reorder and
      // optimize-order handlers already use, so an owner who also holds an advisor row is still
      // treated as the owner exactly as the old role resolution did.
      const ownsTrip = await verifyTripOwnership(tripId, userId);
      const isWriteAdvisor = ownsTrip ? false : await storage.isExpertAssignedToTripForWrite(tripId, userId);
      // The AUTHOR branch, named for the D-4 authored-item price contract below, which is about the
      // ready-made build's author and nobody else. Same `? false :` shape the old role resolution
      // produced: it is the author branch ONLY when neither the owner nor the advisor branch
      // applies. (One edge moved with V-29 and is stated rather than hidden: an owner who is ALSO
      // the author of their own plan now reads as the OWNER here, which is what the contract's own
      // comment says it means — "never the owner". Under the retired resolver an owner with no
      // `trip_collaborators` row fell through to the author branch instead.) The audit-logged admin
      // V-29 admitted is none of the three and takes no branch here.
      const authorMayMutate = (ownsTrip || isWriteAdvisor) ? false : await isTripAuthor(tripId, userId);
      // FABLE-REVIEW: the mode-flip gate — the advisor-only branch (never the owner; never the
      // authored-build author, who is not an advisor row).
      if (isWriteAdvisor && await isPlanApprovedForExpert(tripId, userId)) {
        return res.status(409).json(PLAN_APPROVED_SUGGEST_INSTEAD_ERROR);
      }
      const existing = await storage.getItineraryItemByIdAndTrip(itemId, tripId);
      if (!existing) return res.status(404).json({ message: "Item not found in this trip" });
      // Strip immutable/ownership fields to prevent mass-assignment. `origin` (D2, ratified Aug 7
      // 2026) is provenance stamped only at CREATE time — a PATCH must never let a client
      // retroactively rewrite it.
      const {
        id: _id, tripId: _tripId, createdAt: _createdAt, updatedAt: _updatedAt,
        suggestedBy: _sb, origin: _origin,
        // Ledger 2026-09-03-item-event-link (migration 277): the item→EVENT link is stripped out
        // of the raw destructure and re-admitted BELOW through its pick-based allowlist, because
        // this route parses no insert schema at all — a raw `...safeBody` would carry a
        // client-chosen foreign key straight into the write, naming a row in another table (and
        // possibly on another trip). This destructure is layer 1; the resolver is the §14 layer.
        userExperienceId: _uxid,
        // Ledger `2026-09-18-add-to-plan-lossless` (migration 256): the item→AFFILIATE PRODUCT
        // link is stripped out of the raw destructure for the SAME §14 reason as the event link
        // immediately above — this route parses no insert schema, so a raw `...safeBody` would
        // carry a client-chosen foreign key straight into the write with no verification that the
        // product exists or is still active. Re-admitted below through its own pick-based
        // allowlist + the shared resolver (layer 1); storage carries no layer-2 strip for this
        // column because, unlike routingStatus/bookingId/customVenueId/contentType/contentId, this
        // route is not its only writer of concern — `authoredItemPriceRefusal` below reads the
        // MERGED value, so the verified id (or its absence) must already be the one on `safeBody`
        // by the time that check runs.
        affiliateProductId: _apid,
        // Ledger `2026-09-15-d16-plan-holds-venues-and-content` (migration 295): the two SUBJECT
        // links — the traveler's own venue, and the Discover content a line came from — are
        // stripped for the same §19 reason and admitted by NO allowlist at all. They are stamped
        // server-side from the CART ROW by the projection module and there is nothing here for a
        // client to say; `customVenueId` in particular names a row in another table whose owner
        // that module verifies. Layer 1; `stripItineraryItemRoutingFields` in storage is layer 2.
        customVenueId: _cvid, contentType: _ctype, contentId: _cid,
        ...safeBody
      } = req.body as any;
      // D4 (LD 42, ratified Sep 5 2026): THE OWNER MAY NOT WRITE `itinerary_items.expert_note`.
      // §21 made the field traveler-FACING, never traveler-WRITABLE — a note labelled "from your
      // expert" that the traveler wrote themself is a false attribution on a surface whose whole
      // value is whose words those are. The field is simply not in the owner's pick (the §19
      // allowlist shape applied to an AUTHORSHIP field): stripped for every caller EXCEPT a
      // WRITE-status advisor (`isWriteAdvisor` — the canonical advisor predicate resolved above,
      // so accepted/assigned, never pending), whose writes ride this same advisor-gated rail. The
      // ready-made author branch is not an advisor and is stripped too, and so is the admin the
      // V-29 move admitted — neither of them is the person the note is attributed to.
      if (!isWriteAdvisor) delete (safeBody as any).expertNote;
      const eventLink = itineraryItemEventLinkSchema.safeParse(req.body);
      if (!eventLink.success) {
        return res.status(400).json({ message: "Invalid event link", errors: eventLink.error.errors });
      }
      // ONE implementation, two callers (the other is the live POST in server/routes.ts): the
      // event must EXIST and its `tripId` must be the route's `tripId`. A cross-trip or unknown id
      // is a 400 and NOTHING is written — the item keeps whatever link it already had.
      const resolvedEvent = await resolveItemEventLink(
        tripId,
        Object.prototype.hasOwnProperty.call(req.body ?? {}, "userExperienceId"),
        eventLink.data.userExperienceId,
      );
      if (!resolvedEvent.ok) return res.status(400).json({ message: resolvedEvent.message });
      // ABSENT ≠ NULL: `ignore` leaves the existing link untouched, `set` writes it (including an
      // explicit null, which moves the item back to the plan's implicit event).
      if (resolvedEvent.action === "set") (safeBody as any).userExperienceId = resolvedEvent.value;
      // Ledger 2026-09-18-add-to-plan-lossless (migration 256), on the item→EVENT link's pattern
      // immediately above: `affiliateProductId` is admitted through its OWN pick-based allowlist
      // and its PAIRING — that the `affiliate_products` row exists and is currently active — is
      // re-read from the DB by the shared resolver (§14), the same one the live POST rail calls
      // (§18 rule 1). An unknown or retired id is a 400 naming the reason and NOTHING is written;
      // absent leaves the item's existing link untouched. This runs BEFORE the authoring-contract
      // check below, which reads the MERGED (verified) value off `safeBody`.
      const affiliateLink = itineraryItemAffiliateLinkSchema.safeParse(req.body);
      if (!affiliateLink.success) {
        return res.status(400).json({ message: "Invalid affiliate link", errors: affiliateLink.error.errors });
      }
      const resolvedAffiliate = await resolveItemAffiliateLink(
        Object.prototype.hasOwnProperty.call(req.body ?? {}, "affiliateProductId"),
        affiliateLink.data.affiliateProductId,
      );
      if (!resolvedAffiliate.ok) {
        return res.status(400).json({ message: "That partner item could not be found or is no longer available.", reason: resolvedAffiliate.reason });
      }
      if (resolvedAffiliate.action === "set") (safeBody as any).affiliateProductId = resolvedAffiliate.value;
      // THE AUTHORING CONTRACT, on the EDIT side (decision-maker ruling 2026-09-15, punchlist D-4;
      // ledger `2026-09-15-d4-item-kind-contract`). ONE predicate, two callers — the other is the
      // create rail in server/routes.ts (§18 rule 1); a second wording of the same refusal is the
      // derivation-drift class, and a create-only rule is a one-request bypass.
      //
      // JUDGED ON THE MERGED ROW, not on the patch: an edit that adds a price to an already
      // unlinked item, and an edit that REMOVES the service link from an already priced one, are
      // the same violation arrived at from two directions. `undefined` means "this patch does not
      // mention the field", so the existing value stands.
      //
      // THE AUTHOR BRANCH ONLY (`authorMayMutate` — the ready-made build's author, never the owner
      // and never an advisor), for the reason spelled out at the create rail: a traveler's own cost
      // estimate on their own plan is a note, not a published price. Nothing is rewritten and
      // nothing is backfilled — a refusal writes NOTHING and the item keeps exactly what it had.
      const CONTRACT_FIELDS = ["estimatedCost", "providerServiceId", "affiliateProductId"];
      // IT GOVERNS THE FIELDS IT IS ABOUT, AND NO OTHERS. A patch that mentions none of the three
      // cannot introduce the violation, so it is not judged: refusing an author's TITLE fix on a
      // row that was already priced-and-unlinked would force a rewrite of exactly the legacy rows
      // this ruling said not to touch (§19b — no backfill), i.e. a backfill by another name. Such a
      // row stays as its author left it and is rendered honestly as `recommended` with its price
      // hidden by the derivation.
      if (authorMayMutate && CONTRACT_FIELDS.some((k) => (safeBody as any)[k] !== undefined)) {
        const merged = (key: string) =>
          (safeBody as any)[key] !== undefined ? (safeBody as any)[key] : (existing as any)[key];
        const refusal = authoredItemPriceRefusal({
          estimatedCost: merged("estimatedCost") ?? null,
          providerServiceId: merged("providerServiceId") ?? null,
          affiliateProductId: merged("affiliateProductId") ?? null,
          bookingId: merged("bookingId") ?? null,
        });
        if (refusal) return res.status(400).json({ message: refusal });
      }
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
      // ONE TRIP-WRITE RESOLVER (V-29 = option B — see the PATCH handler above for the full
      // rationale and the named behaviour delta: (a) an owner with no `trip_collaborators` row is
      // no longer refused on their own plan, (b) the trip author and an audit-logged admin gain
      // write here. §12 is unweakened — `requireWriteAccess: true`, never `pending`.)
      const denial = await authorizeTripLogistics(
        tripId,
        userId,
        "DELETE /api/trips/:tripId/itinerary-items/:itemId",
        { requireWriteAccess: true },
      );
      if (denial) return res.status(denial.status).json({ message: "Access denied" });
      const ownsTrip = await verifyTripOwnership(tripId, userId);
      const isWriteAdvisor = ownsTrip ? false : await storage.isExpertAssignedToTripForWrite(tripId, userId);
      // FABLE-REVIEW: the mode-flip gate — see the PATCH handler above for the full rationale.
      if (isWriteAdvisor && await isPlanApprovedForExpert(tripId, userId)) {
        return res.status(409).json(PLAN_APPROVED_SUGGEST_INSTEAD_ERROR);
      }
      const existing = await storage.getItineraryItemByIdAndTrip(itemId, tripId);
      if (!existing) return res.status(404).json({ message: "Item not found in this trip" });
      // A BOOKED ROW IS MONEY, AND NO ROLE MAY DELETE IT (ledger `2026-09-05-slip-own-your-plan`,
      // review R14; §15). Deleting a row that carries a `booking_id` — or that the routing machine
      // says is `purchased` — severs a real `service_bookings` row from the only plan surface that
      // can see it, and NOTHING in this repo puts it back. The slip hides its ✕ on such a row, but
      // a render rule is never what keeps a write out (§14 posture, D16): this is.
      //
      // REGARDLESS OF ROLE, and deliberately AFTER the authorization above: a stranger still gets
      // the 403 they always got (this refusal must not become an oracle for which items exist), and
      // the owner, a §12 WRITE-status advisor, the trip's author and an admin all get the same
      // sentence. ONE predicate, shared with the rebuild guard and with the slip's own tools.
      if (itineraryItemIsMoneyCommitted(existing)) {
        return res.status(409).json(ITEM_BOOKED_DELETE_ERROR);
      }
      // R15 (ledger 2026-08-17-partner-demand-r15-transition-log): record WHO removed the item on
      // the same-transaction `item_removed` diary row. The actor is derived from the trip
      // authorization above (never req.body): an assigned expert acting on the plan ⇒ "expert",
      // otherwise the owner/author ⇒ "traveler".
      await storage.deleteItineraryItem(itemId, {
        actorType: isWriteAdvisor ? "expert" : "traveler",
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
// gate than the private-notes PATCH it mirrors in shape (that one is advisor-only; since Aug 29
// 2026 its advisor branch resolves against the same §12 WRITE allow-list — the earlier
// assignment-existence-only check let a pending/rejected advisor write private build notes).
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



// ── PATCH /api/trips/:tripId/occasion ────────────────────────────────────────────────────────
// ONE occasion vocabulary (ledger `2026-09-03-occasion-vocabulary`). THE BUG THIS CLOSES: the
// Trip Strip's edit panel saved its occasion through `PUT /api/trip-context`, which upserts the
// `trip_contexts.context` jsonb and NOTHING else — while `SlipLogisticsSection` gates the wedding
// Guest/Anchor tooling on `trips.event_type`, a different table. So correcting "A trip" to "A
// wedding" after a trip existed never unlocked the wedding tools; the two surfaces read different
// stores. This is the ADDITIONAL write that makes the correction land, called only when the
// context has a `tripId` bound.
//
// §19 ALLOWLIST, not a denylist. `PATCH /api/trips/:id` parses `insertTripSchema.partial()`, which
// is `.omit()`-based — it happens to admit `eventType` today, but as an untyped varchar: any
// string, including a raw experience-type slug, would be accepted and then read as a literal by
// the fee/optimizer branches. Rather than widen or lean on that denylist, this is a PICK-based
// body schema over a named handful of columns, `eventType` re-typed to `eventTypeEnum`. Nothing
// else on `trips` is reachable through it, so a future privileged column on the table is
// unreachable here by construction.
//
// WHY THE PARTY PAIR RIDES THIS ROUTE (ledger `2026-09-04-one-modal-many-doors`, CLAUDE.md Locked
// Decision 33). The plan modal's step 4 asks Adults and Kids, which are `trips.adults` /
// `trips.kids` — columns that already exist and that migration 241 de-masked so an unanswered
// party stays NULL. They needed an owner-gated, allowlisted way in. The choice was to EXTEND this
// pick-based schema by exactly those two fields rather than open a second route or lean on the
// `.omit()`-based `PATCH /api/trips/:id`, because a second admission rail for the same modal's
// same save is the drift class §18 rule 1 names, and a denylist is the §19 shape this file
// deliberately avoids. The route's PATH still says "occasion"; renaming it would be a new route
// and would break its existing caller, so the name is kept and the contract is stated here: this
// is the plan modal's ONE owner-gated write of the plan's own identity fields.
//
// EVERY FIELD IS OPTIONAL AND NULLABLE, and at least one must be present. Optional because the
// modal sends only what the traveler actually answered; nullable because an explicitly emptied
// party must be able to return to NULL — "not stated" is a value here, not the absence of one
// (§13). A body naming nothing is a 400 rather than a silent no-op.
//
// Owner-gated with the shared `verifyTripOwnership` (fail-closed): these are trip IDENTITY, not
// itinerary content, so this is deliberately the OWNER gate and not the broader §12 advisor-write
// posture the item/note mutations use.
//
// AND WHY THE THREE STEP-4 VARIANT FIELDS RIDE IT TOO (ledger `2026-09-04-step4-variants-fields`,
// CLAUDE.md Locked Decision 38, migration 284). The Step4Variants artboard asks a SECOND question
// on step 4, and which one depends on the occasion's own switches: a budget approver when
// `experience_types.vocabulary` says "attendees", an accessibility note when `default_guests` is
// true. Same reasoning as the party pair directly above — the same modal, the same save, the same
// owner, so the same allowlisted route rather than a second admission rail. The FIELD schemas
// themselves are stated once in `shared/schema.ts` (`tripBudgetApprover*Schema` /
// `tripAccessibilityNoteSchema`) and shared with the pre-trip pen's allowlist, because the columns
// carry no DB CHECK and two copies of that validation would drift (§18 rule 1).
const tripOccasionBody = createInsertSchema(trips)
  .pick({
    eventType: true,
    adults: true,
    kids: true,
    budgetApproverName: true,
    budgetApproverEmail: true,
    accessibilityNote: true,
  })
  .extend({
    eventType: z.enum(eventTypeEnum).optional(),
    adults: z.coerce.number().int().min(1).max(500).nullable().optional(),
    kids: z.coerce.number().int().min(0).max(500).nullable().optional(),
    budgetApproverName: tripBudgetApproverNameSchema,
    budgetApproverEmail: tripBudgetApproverEmailSchema,
    accessibilityNote: tripAccessibilityNoteSchema,
  });

/**
 * The keys `PATCH /api/trips/:tripId/occasion` copies onto the row when — and only when — the BODY
 * actually carried them. Written once so the handler cannot drift from the schema above: a field
 * the modal did not send is a question the traveler was never asked, and writing NULL over a real
 * value because a step was walked past is exactly the loss §13 forbids. An EXPLICIT null in the
 * body is different and is honoured — that is how an answer is cleared.
 */
const TRIP_OCCASION_NULLABLE_KEYS = [
  "adults",
  "kids",
  "budgetApproverName",
  "budgetApproverEmail",
  "accessibilityNote",
] as const;

router.patch("/api/trips/:tripId/occasion", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId } = req.params;
    if (!(await verifyTripOwnership(tripId, userId))) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const parsed = tripOccasionBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message:
          "eventType must be one of: " +
          eventTypeEnum.join(", ") +
          "; adults/kids must be whole numbers or null; budgetApproverEmail must be an email address or null",
      });
    }

    // Build the patch from the keys the BODY actually carried — a field the modal did not send is
    // a question the traveler was never asked, and must not be written as a null over a real value.
    const patch: Record<string, unknown> = {};
    if (parsed.data.eventType !== undefined) patch.eventType = parsed.data.eventType;
    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const key of TRIP_OCCASION_NULLABLE_KEYS) {
      if (key in body) patch[key] = (parsed.data as Record<string, unknown>)[key] ?? null;
    }

    /**
     * ── THE DERIVED PARTY TOTAL (ledger `2026-09-05-slip-events-first-render`) ─────────────────
     * CLAUDE.md Locked Decision 33: the plan's one party number stays DERIVED from the pair by one
     * `partyTotal`, "so the Trip Strip's chip and the columns cannot disagree". This route wrote
     * the PAIR and never the total, so they did: step 4 sent `adults: 2` here, the mint had already
     * left `number_of_travelers` untouched, and the slip header — which reads that column through
     * the plancard assembler — said "1 traveler" beside a Trip Strip chip that said "2 guests".
     * The client-side derivation was correct; nothing carried it to the row.
     *
     * ONE IMPLEMENTATION, now shared: `partyTotal` is imported from `shared/plan-vocabulary.ts`,
     * the same function the plan modal calls for its context write. Re-implementing the addition
     * here is the drift class §18 rule 1 names — it is how this defect was written in the first
     * place, one route over.
     *
     * §13 — A PAIR THAT STATES NOTHING WRITES NOTHING. `partyTotal` returns `undefined` for every
     * spelling of "they did not answer" (absent, null, zero, negative, unparseable), and this then
     * leaves `number_of_travelers` exactly as it was: never 0, never a fabricated 1, and never a
     * NULL over a count some other author legitimately derived. It is written ONLY when the
     * traveler's own answer produces a real number.
     *
     * It rides the SAME `storage.updateTrip` call as the pair, so the total and its components
     * cannot be committed apart from one another.
     */
    if ("adults" in body || "kids" in body) {
      const total = partyTotal(
        (patch.adults as number | null | undefined) ?? null,
        (patch.kids as number | null | undefined) ?? null,
      );
      if (total !== undefined) patch.numberOfTravelers = total;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    await storage.updateTrip(tripId, patch as any);
    res.json({ ok: true, ...patch });
  } catch (err: any) {
    console.error("[trips] set occasion failed:", err?.message);
    res.status(500).json({ message: "Failed to save the occasion" });
  }
});


  // === EA Client Delegation Routes ===

  // GET /api/ea/clients — list all clients managed by this EA


// ── PLAN PROPOSALS: READ EXPOSURE AND DISCARD, AND NOTHING ELSE ──────────────────────────────────
//
// (decision-maker ruling 2026-09-15, punchlist **D-19** = option (b); ledger
//  `2026-09-15-d19-plan-proposals`; migration 299. CLAUDE.md Locked Decision 45 (3), Locked
//  Decision 42 D3 / D4 / D17 / D18 / D23, §13, §14, §15, §18 rule 1, §19.)
//
// `plan_proposals` is where an AI proposal lives before the traveler applies it. The EXPERT
// `trip_suggestions` rail is untouched: its `expert_id` is NOT NULL and its approve path hardcodes
// `origin:'expert'`, so an AI author there would be the false attribution Locked Decision 42 D4
// and D23 forbid by name.
//
// THE GATE. Both routes run `authorizeTripLogistics(..., { requireWriteAccess: true })` — the
// SAME named shared predicate the itinerary-item mutation rails already use
// (`POST /api/trips/:tripId/itinerary/reorder` in the monolith, and
// `PATCH /api/trips/:tripId/expert-traveler-note` above): owner ‖ §12 WRITE-status advisor
// (accepted/assigned, NEVER pending) ‖ trip author ‖ audit-logged admin. Locked Decision 42 **D17**
// warns off `authorizeTripLogistics` in its DEFAULT form, which grants `pending` — correctly, for
// reading; `requireWriteAccess: true` is exactly the §12 narrowing D17 asks for, and calling it is
// what "one predicate, one more caller — never a second copy" means here.
//
// THE READ IS GATED AS HARD AS THE WRITE, deliberately. A proposal carries the AI's reasoning about
// a plan and the rows it would replace; a pending advisor who has not accepted has no business
// reading the traveler's staged changes, and there is no reader today that needs the looser tier.
// Widening it later is a decision, not a tidy-up.
//
// THE OWNER IS THE SESSION (§14): `getUserId(req)`, never a query string or a body field.
//
// **NO CREATE ROUTE, AND NO APPLY ROUTE.** Nothing produces a proposal yet — the L16 Ask-AI drawer
// is the consumer that follows — and the APPLY is the CHARGE POINT, which is punchlist **D-20**
// (flat vs tiered) and **D-21** (what one "task" is, and the §15b claim that makes a double-click
// one charge). Both are open rulings and they own it. An apply wired here would be a second,
// uncharged AI write path into the plan's items, which Locked Decision 45 refuses by name.
router.get("/api/trips/:tripId/proposals", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId, userId, "GET /api/trips/:tripId/proposals", { requireWriteAccess: true },
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    // The WHOLE log, newest first — applied and discarded rows included. A discarded proposal is a
    // record of what was offered and refused; filtering it out would make the log a claim rather
    // than a record. §13: an empty array means this plan has never been asked anything, which is
    // NOT "the AI had nothing to say", and no surface may render it as the latter.
    const proposals = await listPlanProposals(tripId);

    // ── D-48's READ HALF: the coverage and price line, SERVER-RESOLVED (ruling 2026-09-16;
    //    ledger `2026-09-16-l16-rulings-d45-d50`) ─────────────────────────────────────────────
    // The only coverage read that existed (`GET /api/trips/:tripId/trip-pass`) is OWNER-ONLY and
    // 403s an advisor, so an advisor-viewed drawer could not honestly say whether the plan was
    // covered. The ruling extends THIS response instead: the SAME `coversAction` call and the SAME
    // fee-band resolver the charge point uses, behind the gate this route already ran — **no second
    // entitlement rail and no second fee read** (§18 rule 1), and **no literal** (§8).
    //
    // §13 — AN UNANSWERED FIELD IS OMITTED, NEVER GUESSED, and each direction matters:
    //   · `coveredByTripPass` absent = "we have no answer", which is NEITHER "covered" NOR "not
    //     covered". The drawer makes neither claim (the `shouldOfferSavePayment` posture, LD 43 (d)).
    //   · `priceCents` absent = the band could not be resolved. `requireFlatCentsBand` is fail-loud
    //     by declaration, which is right for a CHARGE and wrong for a DISPLAY read — so the failure
    //     is caught here and the number is omitted rather than shown as `0`, which would read as
    //     "this is free". The charge point's own fail-loud behaviour is untouched.
    // Neither failure may 500 this route: the proposal LOG is the thing the caller asked for.
    const aiTask: { coveredByTripPass?: boolean; priceCents?: number } = {};
    try {
      aiTask.coveredByTripPass = await coversAction(tripId, "ai_task");
    } catch (err: any) {
      console.error("[trips] proposals: trip-pass coverage read failed (omitted, not guessed):", err?.message);
    }
    try {
      aiTask.priceCents = await resolveAiTaskChargeCents();
    } catch (err: any) {
      console.error("[trips] proposals: ai-task band read failed (omitted, never rendered as 0):", err?.message);
    }

    res.json({ proposals, aiTask });
  } catch (err: any) {
    console.error("[trips] list plan proposals failed:", err?.message);
    res.status(500).json({ message: "Failed to load proposals" });
  }
});

// ── THE CREATE RAIL (L16 lane 1) ────────────────────────────────────────────────────────────────
//
// (decision-maker rulings 2026-09-16, punchlist **D-45..D-50**; ledger
//  `2026-09-16-l16-rulings-d45-d50`. Brief of record: `docs/design/ASK_AI_DRAWER_BRIEF.md` §4.
//  CLAUDE.md Locked Decision 45 (3), Locked Decision 41 (b)/(c), Locked Decision 42 D3/D17,
//  §13, §14, §18 rule 1, §19.)
//
// POST /api/trips/:tripId/proposals — the traveler asks a question about THEIR OWN plan.
//
// **THE MODEL CALL LANDED IN LANE 1b** (ledger `2026-09-16-l16-lane1b-model-call`), built to the
// design lane 1 stopped in front of so the decision-maker could read it first
// (`docs/lane-reports/2026-09-16-l16-lane1-create-rail.md` §4 — the input scope, the exclusion
// list, the `.strict()` output schema, the D-47 cost row and every failure path). Lane 1's honest
// `503 model_call_not_built` is GONE, replaced by the built behaviour; the A3 proof that pinned it
// was re-pinned rather than deleted. Everything around the call is unchanged: the gate, the §19
// body allowlist, the two named limits, the server-minted id and the in-flight marker.
// No client calls this route yet: the drawer is lane 3.
//
// THE GATE is the SAME shared predicate the read and discard routes run —
// `authorizeTripLogistics(..., { requireWriteAccess: true })`: owner ‖ §12 WRITE-status advisor
// (accepted/assigned, NEVER pending) ‖ trip author ‖ audit-logged admin. **ASK stays at the WRITE
// tier by ruling (D-48)**; it is PAY and APPLY that were narrowed to the owner. One predicate, one
// more caller — never a second copy (§18 rule 1, LD 42 D17).
//
// THE BODY is `{ question }` and nothing else — `aiAskBodySchema`, a `.strict()` pick-shaped
// allowlist in `shared/ai-ask-request.ts` whose header lists every field deliberately absent and
// why (§19). An unknown key is REFUSED, not silently stripped.
//
// D-46 (i) — THE SERVER MINTS THE PROPOSAL ID BEFORE ANYTHING ELSE. The in-flight marker holds
// THAT id, a 409 NAMES it, and the `ai_cost_tracking` row the model call will write carries it as
// `requestId` (D-47). Two consequences are INTENDED: a 409 can name a proposal that has no row
// yet, and a failed ask that burned tokens is still attributable with no `plan_proposals` row
// behind it. A half-written proposal row would sit in the log as something the AI said (§13).
//
// D-46 (ii) — TWO NAMED LIMITS, in the ONE existing fixed-window module: per (sender, trip) and a
// sender-alone DAILY ceiling, because trips are free to create and a per-trip limit alone fans
// out. Never a second limiter implementation and never a fabricated recipient.
//
// D-46 (iii) — the marker and the counters are PER PROCESS and `.replit` is autoscale, so both
// multiply by instance count. ACCEPTED for L16 by ruling (the exposure is tokens, not money); the
// shared-store lane is filed in `docs/PUNCHLIST.md` §4 with its trigger stated verbatim.
//
// **ASKING IS FREE (D-21).** Nothing on this rail reads a price, takes a claim, or touches Stripe.
// The charge point is the APPLY, and it is a different route.
//
// **IT IS NOT A SECOND FREE-DRAFT RAIL (LD 41 (b)).** It calls no `saveGeneratedItinerarySnapshot`
// and performs no rebuild delete — it writes ONE jsonb row — so `check-ai-draft-eligibility`'s
// predicate correctly does not reach it. The rule LD 41 (b) governs is the free REBUILD of a plan,
// and this rail rebuilds nothing. Do not add either call here.
router.post("/api/trips/:tripId/proposals", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId } = req.params;
    const denied = await authorizeTripLogistics(
      tripId, userId, "POST /api/trips/:tripId/proposals", { requireWriteAccess: true },
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const parsed = aiAskBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Ask a question to get a proposal." });
    }
    const { question } = parsed.data;

    // The limits come AFTER the gate (an unauthorized caller is refused before they can consume a
    // bucket) and BEFORE the model call (the expensive half — a limit checked after it protects
    // nothing). `req.ip` scopes the CI bypass to a loopback peer only, exactly as messaging does.
    // The bucket is consumed by an ask that goes on to make a REAL model call (lane 1b): the
    // limit and the spend it protects are now the same event. (Lane 1's note that the terminal
    // 503 consumed a bucket for nothing is discharged — there is no terminal 503 any more.)
    const limit = checkAiAskRateLimit({ senderId: userId, tripId, peerIp: req.ip });
    if (!limit.allowed) {
      if (limit.retryAfterSec) res.setHeader("Retry-After", String(limit.retryAfterSec));
      return res.status(429).json({
        message: limit.message,
        scope: limit.scope,
        retryAfterSec: limit.retryAfterSec,
      });
    }

    // D-46 (i): minted HERE, before the marker and before the call.
    const proposalId = crypto.randomUUID();
    const started = beginAiAsk({ tripId, userId, proposalId });
    if (!started.started) {
      // 409 NAMING the in-flight ask. §13: the drawer says an answer is already on its way — it
      // does not claim a row exists, because one may not yet.
      return res.status(409).json({
        message: "An answer for this plan is already on its way.",
        inFlightProposalId: started.inFlightProposalId,
      });
    }

    try {
      // ── THE MODEL CALL (L16 lane 1b; ledger `2026-09-16-l16-lane1b-model-call`) ─────────────
      // ONE implementation, in `server/services/proposal-create.service.ts`: it reads the plan
      // LIVE (Locked Decision 32's rule applied to the machine reader — never a client-supplied
      // snapshot), builds the D-50 input scope, makes the ONE model call on the `AI_TASK_MODEL`
      // knob, admits the answer through the `.strict()` change-set parse and the sanitiser, and
      // writes ONE `plan_proposals` row through `createPlanProposal` with the PRE-MINTED id.
      // Never an `itinerary_items` row and never a `trip_suggestions` row — the plan changes only
      // at APPLY, which is a different route and the charge point (Locked Decision 45 (3)).
      const created = await createProposalFromAsk({
        proposalId,
        tripId,
        // §14 — the asker is the SESSION, and the cost row is attributed to them (D-47). Never the
        // plan's owner, which would misattribute an advisor's asks.
        askerUserId: userId,
        question,
      });

      if (!created.ok) {
        // §4.4's failure table: NO proposal row was written on any of these, a cost row was
        // written iff the SDK surfaced usage, and the marker is released by the `finally` below.
        // §13 — the traveler is told the ask failed and that nothing was charged, which is true:
        // asking is free and the charge point is the apply.
        const status = created.reason === "trip_not_found" ? 404 : 502;
        return res.status(status).json({
          message:
            created.reason === "trip_not_found"
              ? "Proposal not found"
              : "We couldn't get an answer about this plan. Nothing was charged — try asking again.",
          reason: created.reason,
        });
      }

      // The row, so the drawer renders exactly what was staged. `empty` is a FACT about the
      // answer, not a failure: the model parsed cleanly and proposed nothing, and the traveler
      // asked for that answer too. No summary is invented to dress it up (§13).
      return res.status(201).json({ proposal: created.proposal, empty: created.empty });
    } finally {
      // Always, on every path out of the block above, including a throw: a marker that outlives its
      // ask would wedge the plan until its TTL, and the TTL exists for a dead process, not for a
      // forgotten `finally`.
      endAiAsk(tripId, userId);
    }
  } catch (err: any) {
    console.error("[trips] create plan proposal failed:", err?.message);
    res.status(500).json({ message: "Failed to ask about this plan" });
  }
});

// POST /api/trips/:tripId/proposals/:id/discard — the traveler read it and said no.
//
// Discarding costs nothing (Locked Decision 45 (3): a question is free, a proposal is free to read
// and free to discard; the charge is at apply) and the ROW STAYS, flipped to `discarded`, so the
// plan's log remains a true record of what was offered.
//
// THE STATEMENT IS THE GUARD (§15, §18b). `discardPlanProposal` is ONE atomic conditional
// `UPDATE … WHERE id = ? AND trip_id = ? AND status = 'proposed'`. There is no pre-read here to
// decide against — a check-then-update is the TOCTOU bug §15 names, not a guard — so two
// concurrent discards produce exactly one write and the loser falls into the same 404 below.
//
// ONE 404 FOR EVERY REFUSAL, NEVER A 403 (the `POST /api/conversations/start` posture, Locked
// Decision 40): "no such proposal", "not on this trip", "already applied", "already discarded" and
// "lost the race" are answered identically, so the rail cannot be used to probe which proposals
// exist. An ALREADY-APPLIED proposal is refused on purpose: an apply changed the plan's items, and
// Locked Decision 42 **D18** is explicit that there is no undo — a discard that walked the row back
// while the items stayed would be a record that disagrees with the plan.
router.post("/api/trips/:tripId/proposals/:id/discard", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId, id } = req.params;
    const denied = await authorizeTripLogistics(
      tripId, userId, "POST /api/trips/:tripId/proposals/:id/discard", { requireWriteAccess: true },
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const row = await discardPlanProposal(id, tripId);
    if (!row) return res.status(404).json({ message: "Proposal not found" });
    res.json({ ok: true, proposal: row });
  } catch (err: any) {
    console.error("[trips] discard plan proposal failed:", err?.message);
    res.status(500).json({ message: "Failed to discard the proposal" });
  }
});


// ── THE APPLY IS THE CHARGE POINT (punchlist D-20 = A, D-21 = A) ─────────────────────────────────
//
// (decision-maker rulings 2026-09-15; ledger `2026-09-15-d20-d21-proposal-charge`; migration 300.
//  CLAUDE.md Locked Decision 45 (3), Locked Decision 41 (a)/(f), Locked Decision 42 D3/D17/D18,
//  Locked Decision 43 (c), §8, §13, §14, §15, §15b, §18 rule 1, §19a.)
//
// **D-20 = A: the price is FLAT and it comes from `fee_bands`** — the `concierge:ai_task` band,
// `flat_cents`, through the EXISTING fail-loud resolver. No literal anywhere (§8), and
// `optimization_fees` is untouched: a second tiered fee table for a second AI product is how the
// platform ends up with two fee homes nobody can reconcile.
//
// **D-21 = A: ONE charge per DISTINCT PROPOSAL APPLIED.** Asking is free, reading is free,
// discarding is free. The §15b CLAIM sits on the proposal row and the Stripe idempotency key is
// derived from the proposal id, so a double-click or a retry is ONE charge.
//
// THE GATE is the SAME `authorizeTripLogistics(..., { requireWriteAccess: true })` the read and
// discard routes above already run — owner ‖ §12 WRITE-status advisor (accepted/assigned, NEVER
// pending). Locked Decision 42 **D17** is the reason it is the write tier and not the read one: an
// apply REWRITES the plan's items, and the largest item write on the platform must not be gated by
// the read-shaped tier that (correctly, for reading) grants `pending`.
//
// §14 THROUGHOUT: the acting user is the session, the plan is the ROW's, and the amount is the
// band's. Nothing about price, identity or rate arrives in a body. The only client-supplied value
// either route accepts is a PaymentIntent id, and it is never trusted — it is verified against
// Stripe, and against THIS proposal's own server-written metadata, before it authorizes anything.

// POST /api/trips/:tripId/proposals/:id/pay — create the AI-task PaymentIntent for ONE proposal.
//
// §15b CLAIM → AUTHORIZE → PROMOTE. The claim is taken BEFORE the Stripe call, as one atomic
// conditional, so two concurrent pays produce exactly one claim and the loser makes no Stripe call
// at all. A Trip Pass on the plan takes NO claim and creates NO PaymentIntent (LD 41 (a): coverage
// is unlimited, so there is no counter to race on and nothing to suppress a charge against).
router.post("/api/trips/:tripId/proposals/:id/pay", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId, id } = req.params;
    // D-48 (decision-maker ruling 2026-09-16, AMENDED against the brief's recommendation; ledger
    // `2026-09-16-l16-rulings-d45-d50`): PAY is **OWNER-ONLY AT THE ROUTE**. The PaymentIntent is
    // built from `getOrCreateCustomer(<session user>)`, so an advisor who pays pays with their own
    // card — the earner-funds-a-traveler rail LD 44 **D19** refuses by name, reached from the other
    // direction. `authorizeTripOwnerTier` is the EXISTING shared predicate in the same module:
    // "the same principal set MINUS the assigned-expert branch" (§18 rule 1 — a swap, not a new
    // gate). ASK, READ and DISCARD stay at the §12 WRITE tier.
    const denied = await authorizeTripOwnerTier(
      tripId, userId, "POST /api/trips/:tripId/proposals/:id/pay",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const proposal = await getPlanProposal(id, tripId);
    // ONE 404 for "no such proposal" and "not on this trip" alike — the probing posture the read
    // and discard routes already take (Locked Decision 40's `POST /api/conversations/start` rule).
    if (!proposal) return res.status(404).json({ message: "Proposal not found" });
    if (proposal.status !== PLAN_PROPOSAL_STATUS_PROPOSED) {
      return res.status(409).json({ message: "This proposal is no longer open — it has been applied, discarded or refunded." });
    }

    // D-50 (b)/(c) — REFUSE BEFORE CHARGING. ONE implementation, two callers
    // (`assertProposalCatalogStillValid`, §18 rule 1): the apply refuses a proposal whose catalog
    // prices are past their window or whose listing has gone away, so the PAY rail must refuse it
    // FIRST. Charging for an apply that is already certain to be refused is money taken for nothing,
    // and it happens BEFORE the claim and before any Stripe call so no claim is left behind.
    try {
      await assertProposalCatalogStillValid({ proposal, tripId });
    } catch (err: any) {
      if (err instanceof ProposalApplyRefused) {
        return res.status(409).json({ message: err.message, reason: err.code, itemIds: err.itemIds });
      }
      throw err;
    }

    // THE PASS IS READ FIRST, and it is the SERVER's read — the client never asserts coverage. It
    // is first for LD 41 (a)'s reason: the charge gate and the apply gate must never disagree about
    // a covered plan, which is the exact defect that ruling exists to close.
    if (await coversAction(tripId, "ai_task")) {
      logProposalApplyBasis("trip_pass", { tripId, proposalId: id });
      return res.json({ coveredByTripPass: true, runBasis: "trip_pass" as const });
    }

    // A PaymentIntent already stands for this proposal (a resumed sheet, a reloaded drawer). The
    // idempotency key is derived from the proposal id, so this is the SAME intent Stripe would
    // return anyway — handing back its client secret is a resume, never a second charge.
    if (proposal.stripePaymentIntentId) {
      const existing = await retrieveProposalPaymentIntent(proposal.stripePaymentIntentId);
      return res.json({
        clientSecret: existing.client_secret,
        paymentIntentId: existing.id,
        feeCents: existing.amount,
        currency: (existing.currency ?? "usd").toUpperCase(),
        resumed: true,
      });
    }

    // §8/§14: the amount is the band's, resolved server-side, fail-loud. Resolved BEFORE the claim
    // so a misconfigured band refuses without leaving a claim behind.
    const feeCents = await resolveAiTaskChargeCents();

    // §15b THE CLAIM — the statement IS the guard. A loser of the race, and a row that stopped
    // being `proposed` between the read above and here, both land on the same 409.
    const claimed = await claimProposalCharge(id, tripId);
    if (!claimed) {
      return res.status(409).json({
        message: "A payment for this proposal is already in progress, or it is no longer applicable.",
      });
    }

    const customerId = (await stripePaymentService.getOrCreateCustomer(userId)) ?? undefined;
    const intent = await createProposalChargeIntent({
      proposalId: id,
      tripId,
      userId,
      amountCents: feeCents,
      customerId,
    });
    // §19a: the ONE writer of this column, and an atomic conditional, so it can never be overwritten.
    await stampProposalPaymentIntent(id, intent.id);

    return res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      feeCents,
      currency: "USD",
    });
  } catch (err: any) {
    console.error("[trips] proposal pay failed:", err?.message);
    res.status(500).json({ message: "Failed to start the payment for this proposal" });
  }
});

/**
 * THE ONE ANSWER FOR A ROW THAT IS ALREADY `refunded`, TWO CALLERS (§18 rule 1; ledger
 * `2026-09-19-proposal-refund-race-reason`).
 *
 * A caller reaches this in one of two ways: the route's own top-of-handler read finds the row
 * ALREADY `refunded` before this request even started (an ordinary retry), or this caller's OWN
 * `applyPlanProposal` attempt raced a concurrent one and lost — its internal status read landed
 * AFTER the other caller's refund claim committed, so `applyPlanProposal` throws `"refunded"`
 * rather than the generic `"not_applicable"`. Both are the SAME fact (the row's fee is already
 * back with the traveler) reached by different roads, so both are answered here, once: look up the
 * refund `refundRefusedProposalCharge` already recorded (or complete a claim whose Stripe call had
 * failed, §15b) under `refusal: null` — never re-derived, never a second Stripe site — and report
 * it. No `paymentIntentId`/`chargedAmountCents` pair means nothing was ever charged, and the
 * response carries no `refund` block for that honestly (§13).
 */
async function respondProposalAlreadyRefunded(
  res: Response,
  ctx: {
    proposalId: string;
    tripId: string;
    paymentIntentId: string | null;
    chargedAmountCents: number | null;
  },
): Promise<void> {
  const refund: ProposalRefundOutcome | undefined =
    ctx.paymentIntentId && ctx.chargedAmountCents != null
      ? await refundRefusedProposalCharge({
          proposalId: ctx.proposalId,
          tripId: ctx.tripId,
          paymentIntentId: ctx.paymentIntentId,
          amountCents: ctx.chargedAmountCents,
          refusal: null,
        })
      : undefined;
  res.status(409).json({
    message: PLAN_PROPOSAL_ALREADY_REFUNDED_MESSAGE,
    reason: "refunded",
    ...(refund ? { refund } : {}),
  });
}

// POST /api/trips/:tripId/proposals/:id/apply — the traveler applies ONE proposal to their plan.
//
// AUTHORIZATION IS THE ONE PURE PREDICATE (`resolveProposalApplyAuthorization`), bases ordered
// trip pass → the payment recorded on the row → a freshly supplied PaymentIntent, each verified
// against Stripe. §15c posture: a client-supplied PaymentIntent never resolves or stamps anything
// on its own word.
//
// LD 42 **D3**: a `replaces` entry naming protected work — an item carrying your expert's note or
// authored by them, or one you have already committed money to — is REFUSED with the reason, never
// skipped silently. LD 42 **D18**: `applied_item_ids` is a RECORD of what the apply created and
// this rail offers no undo on the strength of it.
router.post("/api/trips/:tripId/proposals/:id/apply", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { tripId, id } = req.params;
    // D-48 (ruling 2026-09-16, AMENDED against the brief's recommendation): APPLY is **OWNER-ONLY
    // AT THE ROUTE** too. The brief recommended leaving it at the §12 WRITE tier because a
    // Trip-Pass-covered apply moves no money; three reasons on the record overrule that.
    //   (1) An accepted advisor's own `trip_suggestions` require the OWNER's acceptance, so letting
    //       the same advisor ask the AI and apply the result is a CONSENT BACK DOOR — and the row
    //       lands stamped `origin:'ai'`, so the plan cannot even show whose choice it was.
    //   (2) A render rule never keeps a write out (LD 42 D16's own wording, the §14 posture): the
    //       ROUTE is the policy, so hiding apply in the drawer while admitting it here is exactly
    //       the gap that rule names.
    //   (3) The preserved case — an advisor applying a covered proposal — is marginal, and the
    //       owner can still do it.
    // Re-widening is revisited ONLY when the `authorizeTripLogistics`/`canMutateTrip` reconciliation
    // lane rules; it is not a lane's to take back.
    const denied = await authorizeTripOwnerTier(
      tripId, userId, "POST /api/trips/:tripId/proposals/:id/apply",
    );
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const proposal = await getPlanProposal(id, tripId);
    if (!proposal) return res.status(404).json({ message: "Proposal not found" });
    if (proposal.status === PLAN_PROPOSAL_STATUS_REFUNDED) {
      // OPTION B, the RETRY: a paid proposal the apply already refused and refunded. §13: the row's
      // own recorded charge and PaymentIntent, never a request value. ONE implementation, two
      // callers (§18 rule 1) — `respondProposalAlreadyRefunded`, shared with the concurrent-loser
      // branch below (ledger `2026-09-19-proposal-refund-race-reason`).
      return await respondProposalAlreadyRefunded(res, {
        proposalId: id,
        tripId,
        paymentIntentId: proposal.stripePaymentIntentId,
        chargedAmountCents: proposal.chargedAmountCents,
      });
    }
    if (proposal.status !== PLAN_PROPOSAL_STATUS_PROPOSED) {
      return res.status(409).json({ message: "This proposal is no longer open — it has been applied, discarded or refunded." });
    }

    const auth = await resolveProposalApplyAuthorization(
      {
        proposalId: id,
        tripId,
        recordedPaymentIntentId: proposal.stripePaymentIntentId,
        // The ONLY client-supplied value on this rail, and it authorizes nothing until Stripe and
        // the intent's own server-written `proposalId` metadata both vouch for it.
        suppliedPaymentIntentId: typeof req.body?.paymentIntentId === "string" ? req.body.paymentIntentId : null,
      },
      { tripPassCoversTask: (t) => coversAction(t, "ai_task"), verifyPayment: verifyProposalPayment },
    );

    if (!auth.authorized) {
      // 402 for both: the traveler has not paid for this apply. The rejected case carries the
      // verifier's own reason rather than collapsing every refusal into one message (§13).
      return res.status(402).json({
        message: "This proposal has not been paid for yet.",
        reason: auth.reason,
        ...(auth.reason === "payment_rejected" ? { detail: auth.detail } : {}),
      });
    }

    // A freshly verified PaymentIntent still owes the §15 atomic conditional that records it. If
    // the stamp loses (somebody else's intent is already on the row), refuse rather than apply on
    // a payment identity this rail did not record.
    if (auth.basis === "paid" && auth.claimRequired) {
      const stamped = await stampProposalPaymentIntent(id, auth.paymentIntentId);
      if (!stamped) {
        return res.status(409).json({ message: "A different payment is already recorded for this proposal." });
      }
    }

    let applied;
    try {
      applied = await applyPlanProposal({
        proposalId: id,
        tripId,
        // D-49: the actor for the post-commit re-finalize. §14 — the session, never a body.
        actorId: userId,
        basis: auth.basis,
        // §13: a covered apply charged nothing, and that is NULL — never `0`, which would read as
        // "we charged them nothing" rather than "no charge was made".
        chargedAmountCents: auth.basis === "paid" ? auth.amountCents : null,
        paymentIntentId: auth.basis === "paid" ? auth.paymentIntentId : null,
      });
    } catch (err: any) {
      if (err instanceof ProposalApplyRefused) {
        // ledger `2026-09-19-proposal-refund-race-reason`: THIS caller's OWN `applyPlanProposal`
        // attempt raced a concurrent one and LOST — its internal status read landed AFTER the other
        // caller's refund claim committed (§15b: the claim is the status flip, one statement), so
        // `applyPlanProposal` reports the row's REAL state (`"refunded"`) rather than the generic
        // `"not_applicable"`. This is the SAME fact the top-of-handler retry above answers, reached
        // by a different road (a race instead of a later request), so it is answered the SAME way —
        // ONE implementation, two callers (§18 rule 1), never a re-typed string compare.
        if (err.code === "refunded") {
          return await respondProposalAlreadyRefunded(res, {
            proposalId: id,
            tripId,
            paymentIntentId: auth.basis === "paid" ? auth.paymentIntentId : null,
            chargedAmountCents: auth.basis === "paid" ? auth.amountCents : null,
          });
        }
        // D3 / D18: the reason is said out loud, and NOTHING was written — the whole apply is one
        // transaction, so a refusal leaves the plan exactly as it was.
        //
        // OPTION B, WIDENED (decision-maker rulings 2026-09-16 and 2026-09-17, ledger
        // `2026-09-16-l16-lane1-review-fixes`): a PAID proposal refused at apply — stale price,
        // unavailable listing, or protected work (D3) — is REFUNDED. Never applied at a changed
        // price, never applied over an expert's work, never left paid-and-unappliable (a
        // `protected_item` row could not even be discarded, since discard refuses a row carrying a
        // PaymentIntent). WHICH refusals qualify is asked ONCE, of the charge service's own list —
        // never re-typed here as a string compare (§18 rule 1). The refund is the ONE
        // implementation in the charge service: it claims the row atomically FIRST (§15b), then
        // drives the ONE shared Stripe refund site under a proposal-derived key. §14: the amount is
        // what Stripe reported the intent took (`auth.amountCents`), never a body value. A
        // Trip-Pass-covered apply moved no money and gets no `refund` block — an absent block is
        // "nothing was charged", which is the truth, not a refund of nothing (§13).
        const refund: ProposalRefundOutcome | undefined =
          auth.basis === "paid" && isRefundableProposalRefusal(err.code)
            ? await refundRefusedProposalCharge({
                proposalId: id,
                tripId,
                paymentIntentId: auth.paymentIntentId,
                amountCents: auth.amountCents,
                refusal: err.code,
              })
            : undefined;
        return res.status(409).json({
          message: err.message,
          reason: err.code,
          itemIds: err.itemIds,
          ...(refund ? { refund } : {}),
        });
      }
      throw err;
    }

    logProposalApplyBasis(auth.basis, { tripId, proposalId: id });

    // §15b: the ledger writes follow the operation they describe and may never break it.
    // `platform_revenue` records the MONEY (paid only — a covered apply took none). `fee_ledger`
    // records the TOLL on this plan (ruling `2026-09-25-planning-tolls`): paid ⇒ one fee row at what
    // Stripe took; Trip Pass ⇒ the fee row plus a `fee_waiver` naming `covered_by:trip_pass`, so a
    // covered task is a pair that nets to zero rather than silence — never a `$0` row (§13).
    // `recordAiTaskToll` never throws.
    if (auth.basis === "paid") {
      try {
        await ledgerProposalCharge({
          paymentIntentId: auth.paymentIntentId,
          amountCents: auth.amountCents,
          proposalId: id,
          tripId,
          userId,
        });
      } catch (ledgerErr: any) {
        console.error("[trips] proposal charge ledger failed (non-fatal):", ledgerErr?.message);
      }
    }
    await recordAiTaskToll(
      auth.basis === "paid"
        ? {
            proposalId: id,
            tripId,
            actor: userId,
            basis: "paid",
            amountCents: auth.amountCents,
            paymentIntentId: auth.paymentIntentId,
          }
        : { proposalId: id, tripId, actor: userId, basis: "trip_pass" },
    );

    res.json({
      ok: true,
      runBasis: auth.basis,
      proposal: applied.proposal,
      createdItemIds: applied.createdItemIds,
      replacedItemIds: applied.replacedItemIds,
    });
  } catch (err: any) {
    console.error("[trips] apply plan proposal failed:", err?.message);
    res.status(500).json({ message: "Failed to apply the proposal" });
  }
});


export default router;
