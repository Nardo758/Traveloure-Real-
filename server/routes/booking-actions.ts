/**
 * Booking Actions Routes
 * API endpoints for Expert Review, Save for Later, and Share
 */

import { Router } from 'express';
import crypto from 'crypto';
import { stripePaymentService } from '../services/stripe-payment.service';
import { isAuthenticated } from '../replit_integrations/auth';
import { trackFunnelEvent } from '../utils/funnelTracker';
import { bookingService } from '../services/booking.service';
import { verifyTripOwnership } from '../utils/trip-ownership';
import { authorizeTripLogistics } from '../utils/trip-logistics-auth';
import { isTripAuthor } from '../utils/trip-authorship';
import { getUserId } from '../utils/auth';
import { storage } from '../storage';
import { db } from '../db';
import { and, desc, eq, inArray } from 'drizzle-orm';
// Aliased: this router already uses `itineraryItems` as a local variable name in more than one
// handler, and shadowing the table import would be a silent footgun.
import { notifications, itineraryItems as itineraryItemsTable, tripCollaborators, tripExpertAdvisors, PLAN_APPROVAL_STATUSES } from '@shared/schema';
import { EXPERT_SHARE_RATE } from '../services/commission';
import {
  completeExpertRequest,
  getPaidUncompletedExpertRequestIds,
  getExpertRequestsByUser,
  getVariantCost,
  getVariantOwnerAndCost,
  resolveExpertReviewAmount,
  insertSavedTrip,
  getSavedTripsForUser,
  insertSharedTrip,
  getSharedTripByVariantToken,
  incrementSharedTripViews,
  upsertTripShareToken,
  getCanonicalTripShareToken,
  getTripByShareToken,
  insertSharedTripView,
  getApprovedExperts,
  getTripExpertAdvisor,
  getExistingAdvisorRecord,
  isExpertApproved,
  getTripDestination,
  getExpertQueuePosition,
  assignExpertAdvisor,
  createExpertAssignmentNotification,
  getTripLabel,
  getExpertAssignedTrips,
  isTripOwner,
  isExpertAssignedToTrip,
  tripExistsById,
  getTripSuggestions,
  createTripSuggestion,
  getPendingSuggestion,
  updateSuggestionStatus,
  getGeneratedItinerary,
  updateGeneratedItineraryData,
  getTravelerProfile,
} from '../services/booking-actions.service';

const router = Router();

// Helper to generate secure tokens
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Fix #969 — canonical owner check for `POST /api/trips/:id/share` (the routing.routes.ts
 * `isTripOwner` pattern, NEVER `getTripRole` — see CLAUDE.md L10). True when `userId` is the
 * trip's owner via `trips.userId` OR a `trip_collaborators` role='owner' row (the two places
 * ownership can live — `createTrip` writes both, some raw-SQL trip-minting paths write only
 * the `trips` row).
 */
async function isTripOwnerCanonical(tripId: string, userId: string): Promise<boolean> {
  if (await verifyTripOwnership(tripId, userId)) return true;
  const [row] = await db
    .select({ role: tripCollaborators.role })
    .from(tripCollaborators)
    .where(
      and(
        eq(tripCollaborators.tripId, tripId),
        eq(tripCollaborators.userId, userId),
        eq(tripCollaborators.role, 'owner'),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * POST /api/expert-requests/payment-intent
 * Create Stripe payment intent for expert review service (embedded checkout)
 */
router.post('/expert-requests/payment-intent', isAuthenticated, async (req, res) => {
  try {
    // Acting user = session, NEVER the body. (Was: userId from req.body — an identity-spoof hole.)
    const sessionUserId = getUserId(req);
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });

    // `amount` and `userId` are intentionally NOT read from the body. The charge amount is derived
    // server-side from the variant's stored cost + the tier; a client-sent amount is ignored.
    const { userEmail, variantId, comparisonId, destination, serviceType, notes } = req.body;

    if (!variantId || !comparisonId || !destination || !serviceType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Ownership (IDOR) + server-side price derivation from the variant record.
    const ctx = await getVariantOwnerAndCost(variantId);
    if (!ctx) return res.status(404).json({ error: 'Variant not found' });
    if (ctx.ownerUserId !== sessionUserId) {
      return res.status(403).json({ error: 'You do not own this itinerary' });
    }
    const amount = await resolveExpertReviewAmount(serviceType, ctx.totalCost);
    if (amount == null) return res.status(400).json({ error: 'Invalid service tier' });

    const paymentIntent = await stripePaymentService.createExpertServicePaymentIntent(
      sessionUserId,
      userEmail || `user${sessionUserId}@traveloure.com`,
      variantId,
      comparisonId,
      destination,
      serviceType,
      amount,
      notes || ''
    );

    res.json(paymentIntent);
  } catch (error: any) {
    console.error('Expert payment intent error:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment intent' });
  }
});

/**
 * GET /api/expert-requests
 * List expert requests for the authenticated user, optionally filtered by tripId
 */
router.get('/expert-requests', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { tripId } = req.query;
    const requests = await getExpertRequestsByUser(userId, tripId as string | undefined);
    res.json({ requests });
  } catch (error: any) {
    console.error('Get expert requests error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/expert-requests
 * Create expert review request
 */
router.post('/expert-requests', isAuthenticated, async (req, res) => {
  try {
    const authUserId = (req as any).user?.claims?.sub;
    const {
      userId,
      tripId,
      variantId,
      comparisonId,
      destination,
      requestType,
      expertFee,
      notes,
      optimizationContext,
      paymentIntentId,
    } = req.body;

    const resolvedUserId = authUserId || userId;
    if (!resolvedUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // F3 (revenue-model review): when the request follows the paid PI path, verify the intent
    // server-side and derive the fee from Stripe — never trust the client-sent expertFee for a
    // paid request (§14) — then ledger the fee idempotently (§15, PI id as sourceId). Requests
    // without a paymentIntentId (free lead paths: template-sourced planSnapshot leads, trip-based
    // consults) keep their existing behavior.
    let verifiedFee: number | undefined;
    if (paymentIntentId) {
      const pi = await stripePaymentService.retrievePaymentIntent(paymentIntentId);
      if (
        !pi ||
        pi.status !== 'succeeded' ||
        pi.metadata?.type !== 'expert_service' ||
        pi.metadata?.userId !== resolvedUserId
      ) {
        return res.status(402).json({ error: 'Payment not verified for this request' });
      }
      verifiedFee = pi.amount / 100;
      try {
        const { revenueTrackingService } = await import('../services/revenue-tracking.service');
        await revenueTrackingService.recordRevenueEventOnce({
          sourceType: 'expert_review_fee',
          sourceId: pi.id,
          grossAmount: verifiedFee,
          description: `Expert ${pi.metadata?.serviceType ?? requestType} fee — ${destination ?? pi.metadata?.destination ?? ''}`,
          metadata: { userId: resolvedUserId, serviceType: pi.metadata?.serviceType, paymentIntentId: pi.id },
        });
      } catch (revErr) {
        console.error('[expert-requests] revenue record failed (non-fatal):', revErr);
      }
    }

    const isTripBased = !!tripId && !variantId;

    // A template-sourced lead carries the traveler's in-progress plan snapshot
    // (cart + destination/dates/travelers) instead of an optimizer comparison —
    // it lets an expert jump into a plan before it has been optimized.
    const hasPlanSnapshot = !!optimizationContext?.planSnapshot;

    if (!isTripBased && !hasPlanSnapshot && (!variantId || !comparisonId)) {
      return res.status(400).json({ error: 'Missing required fields: variantId and comparisonId are required for optimizer-based requests' });
    }
    if (!destination && !optimizationContext?.destination) {
      return res.status(400).json({ error: 'Missing required field: destination' });
    }

    const resolvedDestination = (destination || optimizationContext?.destination || '').toLowerCase();

    if (tripId) {
      const owns = await verifyTripOwnership(tripId, resolvedUserId);
      if (!owns) return res.status(403).json({ error: 'You do not own this trip' });
    }

    // R6: stamp the verified PI onto the request so completion can find the PAID signal and
    // credit the expert split from the LEDGER row (never from the client-writable expert_fee).
    const persistedContext =
      paymentIntentId && verifiedFee !== undefined
        ? { ...(optimizationContext ?? {}), paymentIntentId }
        : optimizationContext;

    const { requestId, queuePosition } = await bookingService.submitExpertRequest({
      userId: resolvedUserId, tripId, variantId, comparisonId,
      destination: resolvedDestination, requestType,
      expertFee: verifiedFee ?? expertFee, notes, optimizationContext: persistedContext,
    });

    // "book with an expert" requests originating from a Partnerize-backed
    // offer must only be routed to experts who've opted in to booking
    // affiliate offers on a traveler's behalf.
    const isPartnerizeAssisted = requestType === 'partnerize_booking_assist' || optimizationContext?.partnerizeAssisted === true;

    // Fire-and-forget: run lead routing to score experts, persist a
    // successful assignment (assigned_expert_id + status + notification),
    // and trigger the dead-end fallback (notifyNullAssign) when no approved
    // expert covers this destination. Passing expertRequestId lets the
    // service stamp the correct row with status='unassigned' + fallback_message
    // on the no-match path.
    Promise.all([
      import('../services/lead-routing.service'),
      import('../services/booking-actions.service'),
    ]).then(([{ leadRoutingService }, { assignExpertAdvisorToRequest, ensureTripAdvisorRow, createExpertAssignmentNotification, getTripLabel }]) => {
      leadRoutingService.routeLead({
        destination: resolvedDestination,
        topic: requestType,
        tripId: tripId ?? undefined,
        userId: resolvedUserId,
        requestType,
        expertRequestId: requestId,
        requireCanBookOnBehalf: isPartnerizeAssisted,
      }).then(async (result) => {
        if (!result.assignedExpertId) return;
        await assignExpertAdvisorToRequest(requestId, result.assignedExpertId);
        if (tripId) {
          // F1: without this row the routed lead never appears in Assigned Trips and the
          // workspace refuses the expert — the notification below pointed at unreachable work.
          await ensureTripAdvisorRow(tripId, result.assignedExpertId, notes ?? null).catch(err =>
            console.error('[ExpertRequests] Failed to create advisor row for routed lead:', err)
          );
          const tripLabel = await getTripLabel(tripId);
          await createExpertAssignmentNotification(result.assignedExpertId, tripId, tripLabel).catch(err =>
            console.error('[ExpertRequests] Failed to create assignment notification:', err)
          );
        }
      }).catch(err =>
        console.error('[ExpertRequests] Lead routing fire-and-forget failed:', err)
      );
    }).catch(err =>
      console.error('[ExpertRequests] Failed to import lead-routing/booking-actions service:', err)
    );

    res.json({
      success: true,
      requestId,
      queuePosition,
      message: `Expert request submitted. You are #${queuePosition} in the queue for ${resolvedDestination}.`,
    });
  } catch (error: any) {
    if (error.code === 'DUPLICATE_REQUEST') {
      return res.status(409).json({ error: error.message, requestId: error.requestId });
    }
    console.error('Expert request error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/expert-requests/:id/complete
 * Assigned expert marks a request as completed. When the request was a
 * Partnerize-assisted "book with an expert" action, bumps the expert's
 * total_bookings_assisted counter (local_expert_forms).
 */
router.patch('/expert-requests/:id/complete', isAuthenticated, async (req, res) => {
  try {
    const expertUserId = (req as any).user?.claims?.sub ?? (req as any).user?.id;
    if (!expertUserId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    const result = await completeExpertRequest(id, expertUserId);
    if (!result) {
      return res.status(404).json({ error: 'Expert request not found or not assigned to you' });
    }

    res.json({ success: true, requestId: result.id, partnerizeAssisted: result.partnerizeAssisted });
  } catch (error: any) {
    console.error('Complete expert request error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete expert request' });
  }
});

/**
 * POST /api/saved-trips
 * Save trip for later
 */
router.post('/saved-trips', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { variantId, comparisonId, notes } = req.body;
    if (!variantId || !comparisonId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const priceSnapshot = await getVariantCost(variantId);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const savedTripId = await insertSavedTrip({ userId, variantId, comparisonId, notes, priceSnapshot, expiresAt });

    res.json({
      success: true,
      savedTripId,
      expiresAt: expiresAt.toISOString(),
      message: 'Trip saved! You will receive reminder emails.',
    });
  } catch (error: any) {
    console.error('Save trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/saved-trips/:id/convert
 * Convert a saved trip into an active Trip record
 */
router.post('/saved-trips/:id/convert', isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { tripId } = await bookingService.convertSavedTrip(req.params.id, userId);
    res.json({ success: true, tripId });
  } catch (error: any) {
    const status = (error as any).status;
    if (status === 404) return res.status(404).json({ error: error.message });
    if (status === 409) return res.status(409).json({ error: error.message });
    console.error('Convert saved trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/saved-trips
 * Get user's saved trips with variant/comparison details
 */
router.get('/saved-trips', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const trips = await getSavedTripsForUser(userId);
    res.json(trips);
  } catch (error: any) {
    console.error('Get saved trips error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/shared-trips
 * Generate shareable link (variant-based)
 */
router.post('/shared-trips', isAuthenticated, async (req, res) => {
  try {
    const { variantId, comparisonId, sharedBy } = req.body;
    if (!variantId || !comparisonId || !sharedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const shareToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await insertSharedTrip({ variantId, comparisonId, sharedBy, shareToken, expiresAt });

    res.json({
      success: true,
      shareToken,
      expiresAt: expiresAt.toISOString(),
      message: 'Share link generated',
    });
  } catch (error: any) {
    console.error('Share trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/shared-trips/:token
 * View shared trip (public) — itinerary-variant-based sharing
 */
router.get('/shared-trips/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const row = await getSharedTripByVariantToken(token);
    if (!row) {
      return res.status(404).json({ error: 'Shared trip not found or expired' });
    }
    await incrementSharedTripViews(token);
    res.json({ success: true, shared: row });
  } catch (error: any) {
    console.error('Get shared trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/trips/:id/share
 * Generate (or retrieve) a share token for a trip plan.
 */
router.post('/trips/:id/share', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const exists = await tripExistsById(id);
    if (!exists) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const owns = await isTripOwnerCanonical(id, userId);
    if (!owns) {
      return res.status(403).json({ error: 'Only the trip owner can create a share link for this trip' });
    }

    const shareToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await upsertTripShareToken(id, userId, shareToken, expiresAt);
    const canonical = await getCanonicalTripShareToken(id);

    // Fire-and-forget: T7 funnel event (viral share token created)
    try {
      await trackFunnelEvent({
        userId,
        tripId: id,
        eventType: "viral_share",
        funnelStage: "T7",
        refToken: shareToken,
      });
    } catch (_) {}

    res.json({ success: true, shareToken: canonical });
  } catch (error: any) {
    console.error('Trip share error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trips/shared/:token
 * Public endpoint — fetch trip plan by share token, log the view.
 */
router.get('/trips/shared/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await getTripByShareToken(token);
    if (!result) {
      return res.status(404).json({ error: 'Shared trip not found or link has expired' });
    }

    const { row, sharedTripId } = result;

    const viewerIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || null;

    await insertSharedTripView(sharedTripId, viewerIp);
    await incrementSharedTripViews(token);

    res.json({ success: true, trip: row });
  } catch (error: any) {
    console.error('Get shared trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trip-experts?destination=X
 * Return approved experts, optionally filtered by destination.
 */
router.get('/trip-experts', async (req, res) => {
  try {
    const { destination } = req.query as { destination?: string };
    const experts = await getApprovedExperts(destination);
    res.json(experts);
  } catch (error: any) {
    console.error('Get experts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trips/:id/expert-advisor
 * Return the assigned expert advisor for a trip (or null).
 */
router.get('/trips/:id/expert-advisor', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;

    const owns = await isTripOwner(id, userId);
    if (!owns) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const advisorRow = await getTripExpertAdvisor(id);
    if (!advisorRow) {
      return res.json({ advisor: null });
    }

    const rawResponse = advisorRow.expert_response as string | null;
    const expertFirstMessage = rawResponse
      ? (rawResponse.length > 140 ? rawResponse.slice(0, 140) + '…' : rawResponse)
      : null;

    res.json({ advisor: { ...advisorRow, expertFirstMessage } });
  } catch (error: any) {
    console.error('Get trip expert advisor error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trips/:id/expert-advisor
 * Assign an expert to a trip — creates trip_expert_advisors record (status: pending).
 * Idempotent: if an active advisor exists, returns existing record.
 */
router.post('/trips/:id/expert-advisor', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    const { expertUserId, message } = req.body;

    if (!expertUserId) {
      return res.status(400).json({ error: 'expertUserId is required' });
    }

    const owns = await isTripOwner(id, userId);
    if (!owns) return res.status(404).json({ error: 'Trip not found' });

    const existing = await getExistingAdvisorRecord(id);
    if (existing) {
      return res.json({
        success: true,
        advisorId: existing.id,
        status: existing.status,
        existing: true,
      });
    }

    const expertOk = await isExpertApproved(expertUserId);
    if (!expertOk) {
      return res.status(404).json({ error: 'Expert not found or not approved' });
    }

    const destination = await getTripDestination(id);
    const queuePosition = await getExpertQueuePosition(destination);

    const { expertRequestId, advisorId } = await assignExpertAdvisor({
      userId, tripId: id, expertUserId, destination, queuePosition, message,
    });

    // Notify assigned expert (non-blocking)
    getTripLabel(id)
      .then(label => createExpertAssignmentNotification(expertUserId, id, label))
      .catch(err => console.warn('Could not create expert assignment notification:', err));

    res.json({ success: true, advisorId, expertRequestId, status: 'pending' });
  } catch (error: any) {
    console.error('Assign expert advisor error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/expert/assigned-trips
 * Return all trips where the current user is an assigned expert.
 */
router.get('/expert/assigned-trips', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const trips = await getExpertAssignedTrips(userId);
    res.json(trips);
  } catch (error: any) {
    console.error('Get expert assigned trips error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/expert/bookings/:id/plan-snapshot — Sprint 2.1 expert plan handoff.
 *
 * The expert side of the funnel's "Find a Trip Planner" escalation: when a
 * booking request carries a tripId (the cart passes it at every escalation
 * point), the receiving expert can view the traveler's plan — trip basics,
 * itinerary items, and the plan items the traveler has routed to them.
 *
 * Access gate: the session user must be the booking's provider/expert (or an
 * admin). The traveler consented to the share by requesting help with this
 * trip. Read-only; all fields server-derived; nothing from req.body.
 *
 * ── W6 (Lane 1 Phase 1c): THIS READS THE TRIP, NOT THE CART ──────────────────
 * It used to call `storage.getCartItems(booking.travelerId)` and hand the expert
 * the traveler's whole basket — including their UNASSIGNED items (`|| !i.tripId`),
 * i.e. shopping for other trips entirely. That is the expert-cart pollution the
 * Trip-Gravity Audit found live, and ROUTING_STATE_CONTRACT §2 settles it: the
 * expert workspace reads `in_planning` + `with_expert` as "the plan", and is
 * marked **NEVER** on `ready_for_checkout` — purchase intent is not the expert's
 * business. So the plan list is now sourced from `itinerary_items` on THIS trip,
 * filtered to those two states. No cart query runs on this path at all.
 */
router.get('/expert/bookings/:id/plan-snapshot', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const booking = await storage.getServiceBooking(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.providerId !== userId) {
      const requester = await storage.getUser(userId);
      if (requester?.role !== 'admin') {
        return res.status(403).json({ message: 'Not your booking' });
      }
    }

    if (!booking.tripId) {
      return res.status(404).json({ message: 'No trip plan attached to this booking' });
    }

    const trip = await storage.getTrip(booking.tripId);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    // The workstation's live-trip read (scope §1 W6: "already canonical — keep").
    const tripItems = await storage.getItineraryItems(trip.id);

    // W6: "the plan" as the contract defines it for an expert — this trip's own items in
    // `in_planning` or `with_expert`. Trip-scoped by construction, so an expert can never see the
    // traveler's other trips; `ready_for_checkout` and `purchased` are excluded because the
    // contract marks the expert workspace NEVER / READS-only on those, and a purchase list is not
    // what an expert is being asked to work on.
    const planItems = await db
      .select({
        id: itineraryItemsTable.id,
        title: itineraryItemsTable.title,
        itemType: itineraryItemsTable.itemType,
        dayNumber: itineraryItemsTable.dayNumber,
        locationName: itineraryItemsTable.locationName,
        estimatedCost: itineraryItemsTable.estimatedCost,
        scheduledDate: itineraryItemsTable.scheduledDate,
        routingStatus: itineraryItemsTable.routingStatus,
        providerServiceId: itineraryItemsTable.providerServiceId,
      })
      .from(itineraryItemsTable)
      .where(
        and(
          eq(itineraryItemsTable.tripId, trip.id),
          inArray(itineraryItemsTable.routingStatus, ["in_planning", "with_expert"]),
        ),
      );

    res.json({
      trip: {
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        numberOfTravelers: trip.numberOfTravelers,
        eventType: (trip as any).eventType ?? null,
      },
      itineraryItems: tripItems.slice(0, 100).map((i: any) => ({
        title: i.title,
        description: i.description,
        dayNumber: i.dayNumber,
        itemType: i.itemType,
        scheduledDate: i.scheduledDate ?? null,
      })),
      // Same field SHAPE the dialog already renders (name/type/price/quantity/city/scheduledDate),
      // now sourced from the plan. `quantity` is 1 because a plan item IS one item — it is not a
      // basket line with a multiplier; that was a cart-only concept and is mapped honestly rather
      // than dropped, so the client contract is unchanged. `routingStatus` is additive.
      planItems: planItems.slice(0, 100).map((i: any) => ({
        name: i.title ?? 'Item',
        type: i.providerServiceId ? 'service' : (i.itemType ?? 'item'),
        price: i.estimatedCost ?? null,
        quantity: 1,
        city: i.locationName ?? null,
        scheduledDate: i.scheduledDate ?? null,
        routingStatus: i.routingStatus,
      })),
    });
  } catch (error: any) {
    console.error('Get plan snapshot error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trips/:id/suggestions
 * Return all expert suggestions for a trip. Trip owner sees all; expert sees their own.
 */
router.get('/trips/:id/suggestions', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;

    const owner = await isTripOwner(id, userId);
    let expert = false;
    if (!owner) {
      expert = await isExpertAssignedToTrip(id, userId);
    }

    if (!owner && !expert) {
      const exists = await tripExistsById(id);
      if (!exists) return res.status(404).json({ error: 'Trip not found' });
      return res.status(403).json({ error: 'Access denied' });
    }

    const suggestions = await getTripSuggestions(id, expert && !owner ? userId : undefined);
    res.json({ suggestions });
  } catch (error: any) {
    console.error('Get trip suggestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trips/:id/suggestions
 * Expert submits a curated suggestion for a trip they are assigned to.
 */
router.post('/trips/:id/suggestions', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    const { type, dayNumber, title, description, estimatedCost } = req.body;

    if (!type || !title) {
      return res.status(400).json({ error: 'type and title are required' });
    }

    const assigned = await isExpertAssignedToTrip(id, userId);
    if (!assigned) {
      return res.status(403).json({ error: 'You are not an assigned expert for this trip' });
    }

    const suggestionId = await createTripSuggestion({
      tripId: id, expertId: userId, type,
      dayNumber: dayNumber ?? null, title,
      description: description ?? null,
      estimatedCost: estimatedCost ?? null,
    });

    // GAP 3 fix (expert-loop object-flow audit, Jul 30 2026): the Suggest submission was
    // completely silent — no notification, so the traveler only discovers a pending suggestion by
    // manually revisiting the trip page. Mirrors the (correctly-wired) workspace-status
    // notification shape: `data.tripId` + `data.workspacePath` pointed at the traveler's own trip
    // view (never the expert workspace) so the notifications-page action button renders and
    // resolves. Best-effort: a notification failure never fails the suggestion create already
    // committed above.
    try {
      const trip = await storage.getTrip(id);
      if (trip?.userId) {
        await db.insert(notifications).values({
          userId: trip.userId,
          type: "itinerary_update",
          title: "New suggestion from your expert",
          message: `Your expert suggested "${title}" for your trip.`,
          relatedId: id,
          relatedType: "trip",
          data: { tripId: id, workspacePath: `/trip/${id}?tab=itinerary` },
        } as any);
      }
    } catch (notifyErr) {
      console.error("[Expert] suggestion notify failed (non-fatal):", notifyErr);
    }

    res.json({ success: true, suggestionId });
  } catch (error: any) {
    console.error('Create trip suggestion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/trips/:id/suggestions/:suggestionId
 * Trip owner approves or rejects a suggestion.
 */
router.patch('/trips/:id/suggestions/:suggestionId', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id, suggestionId } = req.params;
    const { status, rejectionNote } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
    }

    const owns = await isTripOwner(id, userId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    const suggestion = await getPendingSuggestion(suggestionId, id);
    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found or already reviewed' });
    }

    const claimed = await updateSuggestionStatus(suggestionId, id, status, rejectionNote ?? null);
    if (!claimed) {
      // Lost a race: a concurrent decision already moved this suggestion off 'pending'.
      return res.status(409).json({ error: 'Suggestion already reviewed' });
    }

    let createdItemId: string | undefined;

    if (status === 'approved') {
      const itinerary = await getGeneratedItinerary(id);
      if (itinerary) {
        const itineraryData = itinerary.itinerary_data || {};
        const days: any[] = Array.isArray(itineraryData.days) ? itineraryData.days : [];

        const newActivity = {
          type: suggestion.type || 'activity',
          title: suggestion.title,
          description: suggestion.description || '',
          estimatedCost: suggestion.estimated_cost ? parseFloat(suggestion.estimated_cost) : undefined,
          time: '',
          expertCurated: true,
        };

        const targetDay = suggestion.day_number ?? 1;
        const dayEntry = days.find((d: any) => d.day === targetDay);

        if (dayEntry) {
          if (!Array.isArray(dayEntry.activities)) dayEntry.activities = [];
          dayEntry.activities.push(newActivity);
        } else {
          if (days.length > 0) {
            const lastDay = days[days.length - 1];
            if (!Array.isArray(lastDay.activities)) lastDay.activities = [];
            lastDay.activities.push(newActivity);
          } else {
            days.push({ day: targetDay, title: `Day ${targetDay}`, activities: [newActivity] });
          }
        }

        await updateGeneratedItineraryData(itinerary.id, { ...itineraryData, days });
      }

      // W3-A (FABLE-REVIEW): the legacy `generated_itineraries` write above lands in a jsonb blob
      // that `days`/`ItemsEditorPanel` in the expert Workstation — and the traveler's Trip Card —
      // do NOT read; both render from the canonical `itinerary_items` table (GET
      // /api/trips/:tripId/itinerary-items, §18). Without this, an "approved" suggestion never
      // actually materialized on the plan the traveler/expert look at — the doc's assumption that
      // "the existing suggestion-approve flow already applies approved suggestions into the
      // itinerary" did not hold for the canonical model. This closes that gap for every suggestion
      // (not just partner-catalog ones): approval now also creates a real itinerary_items row,
      // through the same storage path every other Add-panel source writes through.
      const created = await storage.createItineraryItem({
        tripId: id,
        title: suggestion.title,
        description: suggestion.description ?? undefined,
        itemType: suggestion.type || 'activity',
        dayNumber: suggestion.day_number ?? 1,
        estimatedCost: suggestion.estimated_cost ?? undefined,
      } as any);
      createdItemId = created.id;
    }

    res.json({ success: true, suggestion: { id: suggestionId, status }, itemId: createdItemId });
  } catch (error: any) {
    console.error('Review trip suggestion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trips/:tripId/traveler-profile
 * Returns traveler contact info for an assigned expert.
 */
router.get('/trips/:tripId/traveler-profile', isAuthenticated, async (req, res) => {
  try {
    const expertId = (req as any).user?.claims?.sub;
    if (!expertId) return res.status(401).json({ error: 'Not authenticated' });

    const { tripId } = req.params;

    const assigned = await isExpertAssignedToTrip(tripId, expertId);
    if (!assigned) {
      return res.status(403).json({ error: 'Not authorized to view this trip profile' });
    }

    const row: any = await getTravelerProfile(tripId);
    if (!row) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({
      tripId: row.trip_id,
      tripTitle: row.trip_title,
      destination: row.destination,
      startDate: row.start_date,
      endDate: row.end_date,
      numberOfTravelers: row.number_of_travelers,
      travelerName: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Traveler',
      travelerEmail: row.email || null,
      profileImageUrl: row.profile_image_url || null,
    });
  } catch (error: any) {
    console.error('Get traveler profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Expert Workspace endpoints — ported VERBATIM from the imported-but-UNMOUNTED
// trips.routes.ts + experts.routes.ts (§9 shadow-route class). These power the
// expert trip workspace (workspace.tsx); the dark copies never served traffic
// (Vite catch-all → 200-HTML), so notes/commission/status-advance silently
// failed. Mounted here (app.use("/api", …)) so the paths lose their "/api" prefix.
// The dark copies are deleted in the same change so no stale twin remains.
// ============================================================================

// POST /api/expert/assignments/:assignmentId/accept — expert accepts a PENDING advisory
// assignment (pending → accepted), so a newly-assigned trip has a path into the workspace.
// Owner-gated; the pending→accepted flip is atomic (§15) so a double-click accepts once.
router.post("/expert/assignments/:assignmentId/accept", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { assignmentId } = req.params;
    const assignment = await storage.getExpertAssignment(assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    if (assignment.localExpertId !== userId) return res.status(403).json({ message: "Access denied" });
    const updated = await storage.acceptTripAssignment(assignmentId, userId);
    if (!updated) return res.status(409).json({ message: "Assignment is not pending (already accepted or rejected)" });
    res.json(updated);
  } catch (err) {
    console.error("[Expert] accept assignment error:", err);
    res.status(500).json({ message: "Failed to accept assignment" });
  }
});

// PATCH /api/expert/assignments/:assignmentId/workspace-status — transition-validated
// state machine (draft → in_review → delivered), assigned-expert-only.
router.patch("/expert/assignments/:assignmentId/workspace-status", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { assignmentId } = req.params;
    const { workspaceStatus } = req.body;
    const validTransitions: Record<string, string[]> = {
      draft: ["in_review"],
      in_review: ["delivered"],
      delivered: [],
    };
    if (!workspaceStatus || !(workspaceStatus in validTransitions)) {
      return res.status(400).json({ message: "Invalid workspaceStatus. Must be: draft, in_review, or delivered" });
    }
    const assignment = await storage.getExpertAssignment(assignmentId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    if (assignment.localExpertId !== userId) return res.status(403).json({ message: "Access denied" });
    const current = assignment.workspaceStatus ?? "draft";
    if (!validTransitions[current]?.includes(workspaceStatus)) {
      return res.status(400).json({ message: `Cannot transition workspace status from '${current}' to '${workspaceStatus}'. Allowed: ${validTransitions[current]?.join(", ") || "none"}` });
    }
    const updated = await storage.updateExpertAssignmentWorkspaceStatus(assignmentId, workspaceStatus);

    // F2 (workstation-flows audit): delivery was SILENT — the expert advanced the status and the
    // traveler was never told, discovering changes only by reopening their trip. Notify the trip
    // owner on both outward transitions, mirroring the suggestion loop's notification symmetry.
    // Best-effort: a notification failure never fails the status change.
    try {
      const trip = await storage.getTrip(assignment.tripId);
      if (trip?.userId) {
        const copy =
          workspaceStatus === "in_review"
            ? { title: "Your itinerary is ready for review", message: "Your expert sent an itinerary update for your review." }
            : { title: "Your itinerary has been delivered", message: "Your expert marked your itinerary as complete." };
        await db.insert(notifications).values({
          userId: trip.userId,
          type: "itinerary_update",
          title: copy.title,
          message: copy.message,
          relatedId: assignment.tripId,
          relatedType: "trip",
          // The notifications page links via data.workspacePath — for a TRAVELER that must be
          // their own trip view, never the expert workspace.
          data: { tripId: assignment.tripId, workspacePath: `/trip/${assignment.tripId}?tab=itinerary` },
        } as any);
      }
    } catch (notifyErr) {
      console.error("[Expert] workspace-status notify failed (non-fatal):", notifyErr);
    }

    // R7 (GAP 2 fix, expert-loop object-flow audit, ratified Jul 30 2026): delivering the
    // bridged work is the trigger that completes any PAID `expert_requests` row bridging to this
    // same (trip, expert) pair, crediting the expert's R6 split as a HELD escrow earning (7-day
    // window, tied to the refund/dispute window — see earnings-hold.config.ts). Reuses
    // `completeExpertRequest`/`creditExpertReviewSplit` VERBATIM (the only crediting logic that
    // exists — PATCH /api/expert-requests/:id/complete had zero callers, this is the missing
    // trigger); no third copy is written. §14: amount comes from the stored, PI-verified
    // platform_revenue ledger row only. §15: idempotent — `completeExpertRequest`'s atomic
    // `status <> 'completed'` claim and `creditExpertReviewSplit`'s atomic
    // `expert_id IS NULL` claim both guard against double-credit on a repeated/racing delivered
    // flip. Best-effort: a credit failure never blocks the workspace-status transition already
    // committed above.
    if (workspaceStatus === "delivered") {
      try {
        const paidRequestIds = await getPaidUncompletedExpertRequestIds(assignment.tripId, userId);
        for (const requestId of paidRequestIds) {
          await completeExpertRequest(requestId, userId);
        }
      } catch (creditErr) {
        console.error("[Expert] delivered-transition expert-request credit failed (non-fatal):", creditErr);
      }
    }

    res.json(updated);
  } catch (err) {
    console.error("[Expert] workspace-status error:", err);
    res.status(500).json({ message: "Failed to update workspace status" });
  }
});

// POST /api/trips/:id/plan-review — the delivery handshake (QA_PUNCH_LIST W2-A, items 11+13+14b;
// migration 164). Customer signs off on a `delivered` plan (`decision: "approve"`) or sends it
// back (`decision: "request_changes"`, optional `note`). This is what flips the assigned expert's
// direct-edit mode to suggest-mode (see server/utils/plan-approval.ts + the item-write gates).
//
// FABLE-REVIEW: owner gate. Same predicate as the suggestion-approve handler above (`isTripOwner`
// — trips.userId only), NEVER getTripRole (CLAUDE.md L10: getTripRole never reads `trips` and
// under-grants the owner on several live gates; this handler must not inherit that class of bug).
router.post('/trips/:id/plan-review', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    const { decision, note } = req.body ?? {};

    if (decision !== 'approve' && decision !== 'request_changes') {
      return res.status(400).json({ error: 'decision must be "approve" or "request_changes"' });
    }
    if (note !== undefined && typeof note !== 'string') {
      return res.status(400).json({ error: 'note must be a string' });
    }

    const owns = await isTripOwner(id, userId);
    if (!owns) return res.status(403).json({ error: 'Access denied' });

    // §15 posture: claim the candidate row first (find the one delivered advisor row — the
    // uniqueTripExpert index means at most one row per (trip, expert), so if more than one
    // expert has ever advised this trip we take the most recently assigned), then flip it with
    // the SAME 'delivered' precondition re-asserted in the UPDATE's WHERE clause — that is the
    // atomic conditional guard, not the earlier SELECT. A racing/duplicate request_changes call
    // loses the race because the first one already moved workspace_status off 'delivered', so
    // the second UPDATE matches 0 rows -> 409. A racing approve is naturally idempotent (both
    // converge on the same 'approved' end state).
    const [candidate] = await db
      .select({ id: tripExpertAdvisors.id, localExpertId: tripExpertAdvisors.localExpertId })
      .from(tripExpertAdvisors)
      .where(and(eq(tripExpertAdvisors.tripId, id), eq(tripExpertAdvisors.workspaceStatus, 'delivered')))
      .orderBy(desc(tripExpertAdvisors.assignedAt))
      .limit(1);

    if (!candidate) {
      return res.status(409).json({ error: 'This trip has no delivered plan awaiting review' });
    }

    const setValues =
      decision === 'approve'
        ? { planApprovalStatus: PLAN_APPROVAL_STATUSES[0] /* 'approved' */, planApprovedAt: new Date() }
        : {
            planApprovalStatus: PLAN_APPROVAL_STATUSES[1] /* 'changes_requested' */,
            planReviewNote: note ?? null,
            workspaceStatus: 'draft', // send the expert back to work; re-delivery re-runs this handshake
          };

    const [updated] = await db
      .update(tripExpertAdvisors)
      .set(setValues as any)
      .where(and(eq(tripExpertAdvisors.id, candidate.id), eq(tripExpertAdvisors.workspaceStatus, 'delivered')))
      .returning();

    if (!updated) {
      // Lost the race (a concurrent decision already moved this row off 'delivered').
      return res.status(409).json({ error: 'This trip has no delivered plan awaiting review' });
    }

    // Reverse notification (item 14b): the expert learns the customer's decision without polling
    // the workspace. Mirrors the traveler-notify inserts above exactly (type, data shape); points
    // at the EXPERT's own workspace surface, never the traveler's trip view. Best-effort — a
    // notification failure never fails the decision already committed above.
    try {
      await db.insert(notifications).values({
        userId: updated.localExpertId,
        type: 'itinerary_update',
        title: decision === 'approve' ? 'Plan approved' : 'Changes requested',
        message:
          decision === 'approve'
            ? 'Your client approved the delivered plan.'
            : `Your client requested changes${note ? `: ${note}` : '.'}`,
        relatedId: id,
        relatedType: 'trip',
        data: { tripId: id, workspacePath: `/expert/workspace/${id}` },
      } as any);
    } catch (notifyErr) {
      console.error('[PlanReview] expert notify failed (non-fatal):', notifyErr);
    }

    res.json({
      success: true,
      planApprovalStatus: updated.planApprovalStatus,
      workspaceStatus: updated.workspaceStatus,
    });
  } catch (error: any) {
    console.error('Plan review error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/trips/:tripId/my-assignment — expert's assignment record (id + workspaceStatus).
router.get("/trips/:tripId/my-assignment", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { tripId } = req.params;
    const assignment = await storage.getTripExpertAdvisoryAssignment(tripId, userId);
    if (!assignment) return res.status(404).json({ message: "Not assigned to this trip" });
    res.json(assignment);
  } catch (err) {
    console.error("[Expert] getMyAssignment error:", err);
    res.status(500).json({ message: "Failed to get assignment" });
  }
});

// GET /api/trips/:tripId/expert-notes — readable by trip owner OR assigned expert.
router.get("/trips/:tripId/expert-notes", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { tripId } = req.params;
    const owned = await verifyTripOwnership(tripId, userId);
    if (!owned) {
      const assignment = await storage.getTripExpertAdvisoryAssignment(tripId, userId);
      // Authoring mode (ready-made brief §2): the author reads their own build's notes.
      if (!assignment && !(await isTripAuthor(tripId, userId))) {
        return res.status(403).json({ message: "Not authorized to view notes for this trip" });
      }
    }
    const expertNotes = await storage.getTripExpertNotes(tripId);
    res.json({ expertNotes });
  } catch (err) {
    console.error("[Expert] getExpertNotes error:", err);
    res.status(500).json({ message: "Failed to get expert notes" });
  }
});

// PATCH /api/trips/:tripId/expert-notes — auto-save (assigned expert only).
router.patch("/trips/:tripId/expert-notes", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { tripId } = req.params;
    const { expertNotes } = req.body;
    if (typeof expertNotes !== "string") return res.status(400).json({ message: "expertNotes must be a string" });
    const assignment = await storage.getTripExpertAdvisoryAssignment(tripId, userId);
    if (!assignment) return res.status(403).json({ message: "Not assigned to this trip" });
    await storage.updateTrip(tripId, { expertNotes });
    res.json({ ok: true });
  } catch (err) {
    console.error("[Expert] saveExpertNotes error:", err);
    res.status(500).json({ message: "Failed to save expert notes" });
  }
});

// GET /api/trips/:tripId/commission — server-derived expert revenue-share breakdown
// (read-only; amount from the catalog/records, acting user from session — §14-clean).
router.get("/trips/:tripId/commission", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.claims?.sub ?? (req.user as any)?.id;
    const { tripId } = req.params;
    const assignment = await storage.getTripExpertAdvisoryAssignment(tripId, userId);
    if (!assignment) return res.status(403).json({ message: "Not assigned to this trip" });

    const allItems = await storage.getItineraryItems(tripId);
    const CONFIRMED_STATUSES = ["planned", "confirmed", "in_progress", "booked"];
    const items = allItems.filter((item: any) =>
      CONFIRMED_STATUSES.includes(item.status) &&
      item.bookingStatus !== "cancelled"
    );

    // Expert-favorable split policy: EXPERT_SHARE_RATE (75%) floor. Do NOT lower
    // without a product decision — it inverts the split in experts' disfavor.
    const safeParseRate = (value: any, fallback: number): number => {
      const n = parseFloat(value);
      return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
    };
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

// GET /api/trips/:tripId/workspace-constraints — anchors/boundaries/energy + conflict detection.
router.get("/trips/:tripId/workspace-constraints", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { tripId } = req.params;
    const owned = await verifyTripOwnership(tripId, userId);
    if (!owned) {
      const user = await storage.getUser(userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      if (user.role === "admin") {
        // admins pass through
      } else {
        const assigned = await storage.isExpertAssignedToTrip(tripId, userId);
        // Authoring mode (ready-made brief §2): the author sees their own build's constraints.
        if (!assigned && !(await isTripAuthor(tripId, userId))) {
          return res.status(403).json({ message: "Access denied" });
        }
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

    const itemsByDay = new Map<number, typeof items>();
    for (const item of items) {
      if (!itemsByDay.has(item.dayNumber)) itemsByDay.set(item.dayNumber, []);
      itemsByDay.get(item.dayNumber)!.push(item);
    }

    const boundaryViolations: Array<{ dayNumber: number; violation: string; severity: 'warning' | 'critical' }> = [];

    for (const boundary of boundaries) {
      const dayItems = itemsByDay.get(boundary.dayNumber) || [];

      if (boundary.latestActivityEnd && dayItems.length > 0) {
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

    let optimizerScores: Record<string, number> | null = null;
    const latestComparison = await storage.getLatestComparisonByTripId(tripId);
    if (latestComparison) {
      const latestVariant = await storage.getLatestVariantByComparisonId(latestComparison.id);
      if (latestVariant) {
        const scoreMetrics = await storage.getVariantMetricsByKeys(latestVariant.id, ['balance_score', 'wellness_score', 'pace_score', 'diversity_score']);
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

// POST /api/trips/:tripId/calculate-energy — per-day energy depletion; owner/admin/expert.
router.post("/trips/:tripId/calculate-energy", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const trip = await storage.getTrip(req.params.tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
    if (denied) return res.status(denied.status).json({ message: denied.message });

    const items = await storage.getItineraryItems(req.params.tripId);

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

// POST /api/trips/:tripId/generate-presets — logistics presets from a template; owner/admin/expert.
router.post("/trips/:tripId/generate-presets", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims?.sub ?? (req.user as any)?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const trip = await storage.getTrip(req.params.tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });
    const denied = await authorizeTripLogistics(req.params.tripId, userId, `${req.method} ${req.path}`);
    if (denied) return res.status(denied.status).json({ message: denied.message });

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

export default router;
