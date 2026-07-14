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
import { getUserId } from '../utils/auth';
import {
  completeExpertRequest,
  getExpertRequestsByUser,
  getVariantCost,
  getVariantOwnerAndCost,
  resolveExpertReviewAmount,
  insertSavedTrip,
  getSavedTripsForUser,
  insertSharedTrip,
  getSharedTripByVariantToken,
  incrementSharedTripViews,
  getTripOwnerCheck,
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
    const amount = resolveExpertReviewAmount(serviceType, ctx.totalCost);
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
    } = req.body;

    const resolvedUserId = authUserId || userId;
    if (!resolvedUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const isTripBased = !!tripId && !variantId;

    if (!isTripBased && (!variantId || !comparisonId)) {
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

    const { requestId, queuePosition } = await bookingService.submitExpertRequest({
      userId: resolvedUserId, tripId, variantId, comparisonId,
      destination: resolvedDestination, requestType, expertFee, notes, optimizationContext,
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
    ]).then(([{ leadRoutingService }, { assignExpertAdvisorToRequest, createExpertAssignmentNotification, getTripLabel }]) => {
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

    const owns = await getTripOwnerCheck(id, userId);
    if (!owns) {
      return res.status(404).json({ error: 'Trip not found or not owned by you' });
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

    await updateSuggestionStatus(suggestionId, id, status, rejectionNote ?? null);

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
    }

    res.json({ success: true, suggestion: { id: suggestionId, status } });
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

export default router;
