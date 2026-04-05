/**
 * Booking Actions Routes
 * API endpoints for Expert Review, Save for Later, and Share
 */

import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import { stripePaymentService } from '../services/stripe-payment.service';
import { isAuthenticated } from '../replit_integrations/auth';

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
    const {
      userId,
      userEmail,
      variantId,
      comparisonId,
      destination,
      serviceType,
      amount,
      notes,
    } = req.body;

    if (!userId || !variantId || !comparisonId || !destination || !serviceType || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const paymentIntent = await stripePaymentService.createExpertServicePaymentIntent(
      userId,
      userEmail || `user${userId}@traveloure.com`,
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
 * POST /api/expert-requests
 * Create expert review request
 */
router.post('/expert-requests', isAuthenticated, async (req, res) => {
  try {
    const {
      userId,
      variantId,
      comparisonId,
      destination,
      requestType,
      expertFee,
      notes,
    } = req.body;

    if (!userId || !variantId || !comparisonId || !destination || !requestType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get current queue position for this city
    const queueResult = await db.execute(sql`
      SELECT COALESCE(MAX(queue_position), 0) + 1 as next_position
      FROM expert_requests
      WHERE destination_city = ${destination.toLowerCase()}
        AND status IN ('queued', 'assigned')
    `);

    const queuePosition = queueResult.rows?.[0]?.next_position || 1;

    // Create expert request
    const result = await db.execute(sql`
      INSERT INTO expert_requests (
        id, user_id, variant_id, comparison_id, destination_city,
        request_type, expert_fee, status, queue_position, notes,
        created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${userId},
        ${variantId},
        ${comparisonId},
        ${destination.toLowerCase()},
        ${requestType},
        ${expertFee},
        'queued',
        ${queuePosition},
        ${notes || null},
        NOW()
      )
      RETURNING id
    `);

    // TODO: Notify experts in city queue
    // TODO: Send email to user confirming request

    res.json({
      success: true,
      requestId: result.rows?.[0]?.id,
      queuePosition,
      message: `Expert request submitted. You are #${queuePosition} in the queue for ${destination}.`,
    });
  } catch (error: any) {
    console.error('Expert request error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/saved-trips
 * Save trip for later
 */
router.post('/saved-trips', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { variantId, comparisonId, notes } = req.body;

    if (!variantId || !comparisonId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get variant data for price snapshot
    const variant = await db.execute(sql`
      SELECT total_cost
      FROM itinerary_variants
      WHERE id = ${variantId}
    `);

    const priceSnapshot = variant.rows?.[0]?.total_cost || 0;

    // Calculate expiration (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Create saved trip
    const result = await db.execute(sql`
      INSERT INTO saved_trips (
        id, user_id, variant_id, comparison_id, notes,
        saved_at, expires_at, price_snapshot, status
      ) VALUES (
        ${crypto.randomUUID()},
        ${userId},
        ${variantId},
        ${comparisonId},
        ${notes || null},
        NOW(),
        ${expiresAt.toISOString()},
        ${priceSnapshot},
        'active'
      )
      RETURNING id
    `);

    // TODO: Send confirmation email
    // TODO: Schedule reminder emails (day 7, 14, 28)

    res.json({
      success: true,
      savedTripId: result.rows?.[0]?.id,
      expiresAt: expiresAt.toISOString(),
      message: 'Trip saved! You will receive reminder emails.',
    });
  } catch (error: any) {
    console.error('Save trip error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/saved-trips/:id/convert
 * Convert a saved trip into an active Trip record (status: planning)
 */
router.post('/saved-trips/:id/convert', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;

    // Validate UUID format — non-UUID strings cause a PostgreSQL cast error
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(id)) {
      return res.status(404).json({ error: 'Saved trip not found or already converted' });
    }

    // Fetch the saved trip owned by this user
    const savedResult = await db.execute(sql`
      SELECT st.*, ic.destination, ic.start_date, ic.end_date, ic.travelers, ic.budget
      FROM saved_trips st
      LEFT JOIN itinerary_comparisons ic ON ic.id = st.comparison_id
      WHERE st.id = ${id}
        AND st.user_id = ${userId}
        AND st.status = 'active'
    `);

    if (!savedResult.rows || savedResult.rows.length === 0) {
      return res.status(404).json({ error: 'Saved trip not found or already converted' });
    }

    interface SavedTripRow {
      destination: string | null;
      start_date: string | null;
      end_date: string | null;
      travelers: number | null;
      budget: string | null;
    }
    const saved = savedResult.rows[0] as SavedTripRow;
    const destination = saved.destination || 'My Destination';
    const startDate = saved.start_date || new Date().toISOString().split('T')[0];
    const endDate = saved.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const travelers = saved.travelers || 1;
    const budget = saved.budget || null;

    // Atomically mark saved trip as converted — prevents duplicate conversions under concurrent requests
    const markResult = await db.execute(sql`
      UPDATE saved_trips
      SET status = 'converted'
      WHERE id = ${id}
        AND user_id = ${userId}
        AND status = 'active'
      RETURNING id
    `);

    if (!markResult.rows || markResult.rows.length === 0) {
      return res.status(409).json({ error: 'Already converted or not eligible' });
    }

    // Create a Trip record in planning status
    const tripId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO trips (
        id, user_id, title, destination, start_date, end_date,
        number_of_travelers, budget, status, created_at, updated_at
      ) VALUES (
        ${tripId},
        ${userId},
        ${`Trip to ${destination}`},
        ${destination},
        ${startDate},
        ${endDate},
        ${travelers},
        ${budget},
        'planning',
        NOW(),
        NOW()
      )
    `);

    res.json({ success: true, tripId });
  } catch (error: any) {
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
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await db.execute(sql`
      SELECT 
        st.id,
        st.variant_id,
        st.comparison_id,
        st.notes,
        st.saved_at,
        st.expires_at,
        st.price_snapshot,
        st.status,
        iv.name as variant_name,
        iv.total_cost as variant_cost,
        ic.destination,
        ic.start_date,
        ic.end_date,
        ic.travelers,
        ic.trip_id
      FROM saved_trips st
      LEFT JOIN itinerary_variants iv ON iv.id = st.variant_id
      LEFT JOIN itinerary_comparisons ic ON ic.id = st.comparison_id
      WHERE st.user_id = ${userId}
        AND st.status = 'active'
      ORDER BY st.saved_at DESC
    `);

    res.json(result.rows || []);
  } catch (error: any) {
    console.error('Get saved trips error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/shared-trips
 * Generate shareable link
 */
router.post('/shared-trips', isAuthenticated, async (req, res) => {
  try {
    const { variantId, comparisonId, sharedBy } = req.body;

    if (!variantId || !comparisonId || !sharedBy) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate share token
    const shareToken = generateToken();

    // Set expiration (90 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    // Create shared trip
    await db.execute(sql`
      INSERT INTO shared_trips (
        id, variant_id, comparison_id, shared_by,
        share_token, expires_at, views, bookings, created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${variantId},
        ${comparisonId},
        ${sharedBy},
        ${shareToken},
        ${expiresAt.toISOString()},
        0,
        0,
        NOW()
      )
    `);

    res.json({
      success: true,
      shareToken,
      expiresAt: expiresAt.toISOString(),
      message: 'Share link generated',
    });
  } catch (error: any) {
    console.error('Share trip error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/shared-trips/:token
 * View shared trip (public) — itinerary-variant-based sharing
 */
router.get('/shared-trips/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Get shared trip
    const shared = await db.execute(sql`
      SELECT st.*, iv.*, ic.*
      FROM shared_trips st
      JOIN itinerary_variants iv ON st.variant_id = iv.id
      JOIN itinerary_comparisons ic ON st.comparison_id = ic.id
      WHERE st.share_token = ${token}
        AND st.expires_at > NOW()
    `);

    if (!shared.rows || shared.rows.length === 0) {
      return res.status(404).json({ error: 'Shared trip not found or expired' });
    }

    // Increment view count
    await db.execute(sql`
      UPDATE shared_trips
      SET views = views + 1
      WHERE share_token = ${token}
    `);

    res.json({
      success: true,
      shared: shared.rows[0],
    });
  } catch (error: any) {
    console.error('Get shared trip error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/trips/:id/share
 * Generate (or retrieve) a share token for a trip plan.
 * Creates/reuses a shared_trips record (trip_id column) for the trip.
 */
router.post('/trips/:id/share', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;

    // Validate UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Verify ownership
    const tripResult = await db.execute(sql`
      SELECT id, user_id FROM trips WHERE id = ${id} AND user_id = ${userId}
    `);

    if (!tripResult.rows || tripResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found or not owned by you' });
    }

    // Atomic upsert: INSERT ... ON CONFLICT (trip_id) DO NOTHING, then SELECT
    // The UNIQUE constraint on shared_trips.trip_id prevents race-condition duplicates.
    const shareToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    const sharedTripId = crypto.randomUUID();

    await db.execute(sql`
      INSERT INTO shared_trips (id, trip_id, shared_by, share_token, expires_at, views, bookings, created_at)
      VALUES (${sharedTripId}, ${id}, ${userId}, ${shareToken}, ${expiresAt.toISOString()}, 0, 0, NOW())
      ON CONFLICT (trip_id) DO NOTHING
    `);

    // Always read back the canonical token (covers both insert and conflict case)
    const canonical = await db.execute(sql`
      SELECT share_token FROM shared_trips WHERE trip_id = ${id} LIMIT 1
    `);

    res.json({ success: true, shareToken: canonical.rows[0].share_token });
  } catch (error: any) {
    console.error('Trip share error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trips/shared/:token
 * Public endpoint — fetch trip plan by share token (shared_trips.share_token), log the view.
 * No auth required.
 */
router.get('/trips/shared/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Fetch via shared_trips.share_token -> trips + generated_itineraries
    const result = await db.execute(sql`
      SELECT
        st.id as shared_trip_id,
        t.id, t.title, t.destination, t.start_date, t.end_date,
        t.number_of_travelers, t.status,
        gi.itinerary_data
      FROM shared_trips st
      JOIN trips t ON t.id = st.trip_id
      LEFT JOIN generated_itineraries gi ON gi.trip_id = t.id AND gi.status = 'generated'
      WHERE st.share_token = ${token}
        AND (st.expires_at IS NULL OR st.expires_at > NOW())
      LIMIT 1
    `);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Shared trip not found or link has expired' });
    }

    interface SharedTripResultRow {
      shared_trip_id: string;
      id: string;
      [key: string]: unknown;
    }
    const row = result.rows[0] as SharedTripResultRow;

    // Log view into shared_trip_views using shared_trip_id (relational integrity preserved)
    const viewerIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || null;

    await db.execute(sql`
      INSERT INTO shared_trip_views (id, shared_trip_id, viewer_ip, viewed_at)
      VALUES (${crypto.randomUUID()}, ${row.shared_trip_id}::uuid, ${viewerIp}, NOW())
    `);

    // Increment view counter on shared_trips
    await db.execute(sql`
      UPDATE shared_trips SET views = views + 1 WHERE share_token = ${token}
    `);

    res.json({ success: true, trip: row });
  } catch (error: any) {
    console.error('Get shared trip error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trip-experts?destination=X
 * Return approved experts, optionally filtered by destination.
 * Named /api/trip-experts to avoid shadowing the existing /api/experts endpoint.
 */
router.get('/trip-experts', async (req, res) => {
  try {
    const { destination } = req.query as { destination?: string };

    let result;
    if (destination && destination.trim()) {
      const destLower = destination.trim().toLowerCase();
      const destPattern = `%${destLower}%`;
      result = await db.execute(sql`
        SELECT
          lef.id, lef.user_id,
          lef.first_name, lef.last_name,
          lef.bio, lef.specialties, lef.destinations,
          lef.hourly_rate, lef.years_of_experience,
          lef.availability, lef.response_time,
          u.profile_image_url,
          COALESCE(AVG(rr.rating), 0)::numeric(3,1) as avg_rating,
          COUNT(rr.id) as review_count
        FROM local_expert_forms lef
        JOIN users u ON u.id = lef.user_id
        LEFT JOIN review_ratings rr ON rr.local_expert_id = lef.user_id
        WHERE lef.status = 'approved'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(lef.destinations) d
            WHERE lower(d) LIKE ${destPattern}
          )
        GROUP BY lef.id, lef.user_id, lef.first_name, lef.last_name, lef.bio,
                 lef.specialties, lef.destinations, lef.hourly_rate,
                 lef.years_of_experience, lef.availability, lef.response_time,
                 u.profile_image_url
        ORDER BY avg_rating DESC, review_count DESC
        LIMIT 20
      `);
    } else {
      result = await db.execute(sql`
        SELECT
          lef.id, lef.user_id,
          lef.first_name, lef.last_name,
          lef.bio, lef.specialties, lef.destinations,
          lef.hourly_rate, lef.years_of_experience,
          lef.availability, lef.response_time,
          u.profile_image_url,
          COALESCE(AVG(rr.rating), 0)::numeric(3,1) as avg_rating,
          COUNT(rr.id) as review_count
        FROM local_expert_forms lef
        JOIN users u ON u.id = lef.user_id
        LEFT JOIN review_ratings rr ON rr.local_expert_id = lef.user_id
        WHERE lef.status = 'approved'
        GROUP BY lef.id, lef.user_id, lef.first_name, lef.last_name, lef.bio,
                 lef.specialties, lef.destinations, lef.hourly_rate,
                 lef.years_of_experience, lef.availability, lef.response_time,
                 u.profile_image_url
        ORDER BY avg_rating DESC, review_count DESC
        LIMIT 20
      `);
    }

    res.json(result.rows || []);
  } catch (error: any) {
    console.error('Get experts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trips/:id/expert-advisor
 * Return the assigned expert advisor for a trip (or null).
 * Ownership is enforced: only the trip's owner can read this.
 */
router.get('/trips/:id/expert-advisor', isAuthenticated, async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;

    // Ownership check — prevents IDOR leakage
    const ownerCheck = await db.execute(sql`
      SELECT id FROM trips WHERE id = ${id} AND user_id = ${userId}
    `);
    if (!ownerCheck.rows || ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const result = await db.execute(sql`
      SELECT
        tea.id as advisor_id,
        tea.status,
        tea.message,
        tea.expert_response,
        tea.assigned_at,
        lef.id as expert_form_id,
        lef.first_name, lef.last_name,
        lef.bio, lef.specialties, lef.destinations,
        lef.hourly_rate,
        u.profile_image_url,
        COALESCE(AVG(rr.rating), 0)::numeric(3,1) as avg_rating,
        COUNT(rr.id) as review_count
      FROM trip_expert_advisors tea
      JOIN local_expert_forms lef ON lef.user_id = tea.local_expert_id
      JOIN users u ON u.id = tea.local_expert_id
      LEFT JOIN review_ratings rr ON rr.local_expert_id = tea.local_expert_id
      WHERE tea.trip_id = ${id}
        AND tea.status IN ('pending', 'accepted')
      GROUP BY tea.id, tea.status, tea.message, tea.expert_response, tea.assigned_at,
               lef.id, lef.first_name, lef.last_name, lef.bio, lef.specialties,
               lef.destinations, lef.hourly_rate, u.profile_image_url
      ORDER BY tea.assigned_at DESC
      LIMIT 1
    `);

    if (!result.rows || result.rows.length === 0) {
      return res.json({ advisor: null });
    }

    const advisorRow = result.rows[0] as Record<string, unknown>;

    // Surface the expert's first response from trip_expert_advisors.expert_response
    // (set by the expert when they accept/respond to this specific trip request)
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

    // Verify trip ownership
    const tripCheck = await db.execute(sql`
      SELECT id FROM trips WHERE id = ${id} AND user_id = ${userId}
    `);
    if (!tripCheck.rows || tripCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Check if already assigned (pending or accepted)
    const existing = await db.execute(sql`
      SELECT id, status FROM trip_expert_advisors
      WHERE trip_id = ${id} AND status IN ('pending', 'accepted')
      LIMIT 1
    `);

    if (existing.rows && existing.rows.length > 0) {
      // Idempotent: return the existing advisor record instead of erroring
      const existingRow = existing.rows[0] as Record<string, unknown>;
      return res.json({
        success: true,
        advisorId: existingRow.id,
        status: existingRow.status,
        existing: true,
      });
    }

    // Verify expert exists and is approved
    const expertCheck = await db.execute(sql`
      SELECT user_id FROM local_expert_forms
      WHERE user_id = ${expertUserId} AND status = 'approved'
    `);
    if (!expertCheck.rows || expertCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Expert not found or not approved' });
    }

    // Fetch trip details for expert_requests record
    const tripInfo = await db.execute(sql`
      SELECT destination FROM trips WHERE id = ${id}
    `);
    const destination = (tripInfo.rows[0] as any)?.destination || 'unknown';

    // Get queue position for expert_requests
    const queueResult = await db.execute(sql`
      SELECT COALESCE(MAX(queue_position), 0) + 1 as next_position
      FROM expert_requests
      WHERE destination_city = ${destination.toLowerCase()}
        AND status IN ('queued', 'assigned')
    `);
    const queuePosition = (queueResult.rows?.[0] as any)?.next_position || 1;

    // Create both records atomically inside a transaction
    const expertRequestId = crypto.randomUUID();
    const advisorId = crypto.randomUUID();

    await db.execute(sql`BEGIN`);
    try {
      await db.execute(sql`
        INSERT INTO expert_requests (
          id, user_id, trip_id, destination_city, request_type,
          status, queue_position, notes, assigned_expert_id, created_at
        ) VALUES (
          ${expertRequestId}, ${userId}, ${id},
          ${destination.toLowerCase()}, 'review',
          'queued', ${queuePosition}, ${message || null},
          ${expertUserId}, NOW()
        )
      `);

      await db.execute(sql`
        INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, message, assigned_at)
        VALUES (${advisorId}, ${id}, ${expertUserId}, 'pending', ${message || null}, NOW())
      `);

      await db.execute(sql`COMMIT`);
    } catch (txErr) {
      await db.execute(sql`ROLLBACK`);
      throw txErr;
    }

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

    const result = await db.execute(sql`
      SELECT
        t.id as trip_id,
        t.title as trip_title,
        t.destination,
        t.start_date,
        t.end_date,
        tea.status,
        tea.assigned_at,
        u.first_name as traveler_first_name,
        u.last_name as traveler_last_name,
        COALESCE(
          (SELECT COUNT(*) FROM trip_suggestions ts WHERE ts.trip_id = t.id AND ts.expert_id = ${userId}),
          0
        )::int as suggestion_count
      FROM trip_expert_advisors tea
      JOIN trips t ON t.id = tea.trip_id
      JOIN users u ON u.id = t.user_id
      WHERE tea.local_expert_id = ${userId}
        AND tea.status IN ('pending', 'accepted')
      ORDER BY tea.assigned_at DESC
    `);

    const trips = (result.rows || []).map((row: any) => ({
      ...row,
      traveler_name: [row.traveler_first_name, row.traveler_last_name].filter(Boolean).join(' ') || 'Traveler',
    }));

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

    // Verify user is either trip owner or an assigned expert
    const authCheck = await db.execute(sql`
      SELECT
        t.user_id as owner_id,
        tea.local_expert_id as expert_user_id
      FROM trips t
      LEFT JOIN trip_expert_advisors tea ON tea.trip_id = t.id AND tea.status IN ('pending', 'accepted')
      WHERE t.id = ${id}
      LIMIT 1
    `);

    if (!authCheck.rows || authCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const row = authCheck.rows[0] as { owner_id: string; expert_user_id: string | null };
    const isOwner = row.owner_id === userId;
    const isExpert = row.expert_user_id === userId;

    if (!isOwner && !isExpert) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.execute(sql`
      SELECT
        ts.id, ts.trip_id, ts.expert_id, ts.type, ts.day_number,
        ts.title, ts.description, ts.estimated_cost, ts.status,
        ts.rejection_note, ts.created_at, ts.reviewed_at,
        u.first_name as expert_first_name, u.last_name as expert_last_name,
        u.profile_image_url as expert_profile_image_url
      FROM trip_suggestions ts
      JOIN users u ON u.id = ts.expert_id
      WHERE ts.trip_id = ${id}
      ORDER BY ts.created_at DESC
    `);

    res.json({ suggestions: result.rows || [] });
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

    // Verify expert is assigned to this trip
    const expertCheck = await db.execute(sql`
      SELECT tea.id FROM trip_expert_advisors tea
      WHERE tea.trip_id = ${id}
        AND tea.local_expert_id = ${userId}
        AND tea.status IN ('pending', 'accepted')
      LIMIT 1
    `);

    if (!expertCheck.rows || expertCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not an assigned expert for this trip' });
    }

    const suggestionId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO trip_suggestions (id, trip_id, expert_id, type, day_number, title, description, estimated_cost, status, created_at)
      VALUES (${suggestionId}, ${id}, ${userId}, ${type}, ${dayNumber ?? null}, ${title}, ${description ?? null}, ${estimatedCost ?? null}, 'pending', NOW())
    `);

    res.json({ success: true, suggestionId });
  } catch (error: any) {
    console.error('Create trip suggestion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/trips/:id/suggestions/:suggestionId
 * Trip owner approves or rejects a suggestion.
 * On approval, the suggestion is appended to the generated itinerary for that day.
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

    // Only trip owner can review suggestions
    const ownerCheck = await db.execute(sql`
      SELECT id FROM trips WHERE id = ${id} AND user_id = ${userId}
    `);
    if (!ownerCheck.rows || ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch the suggestion details before updating
    const suggestionResult = await db.execute(sql`
      SELECT id, type, day_number, title, description, estimated_cost
      FROM trip_suggestions
      WHERE id = ${suggestionId} AND trip_id = ${id} AND status = 'pending'
    `);

    if (!suggestionResult.rows || suggestionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Suggestion not found or already reviewed' });
    }

    const suggestion = suggestionResult.rows[0] as {
      id: string;
      type: string;
      day_number: number | null;
      title: string;
      description: string | null;
      estimated_cost: string | null;
    };

    // Update suggestion status
    await db.execute(sql`
      UPDATE trip_suggestions
      SET status = ${status},
          rejection_note = ${rejectionNote ?? null},
          reviewed_at = NOW()
      WHERE id = ${suggestionId} AND trip_id = ${id}
    `);

    // If approved, apply the suggestion to the generated itinerary
    if (status === 'approved') {
      const itineraryResult = await db.execute(sql`
        SELECT id, itinerary_data
        FROM generated_itineraries
        WHERE trip_id = ${id} AND status = 'generated'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (itineraryResult.rows && itineraryResult.rows.length > 0) {
        const itineraryRow = itineraryResult.rows[0] as { id: string; itinerary_data: any };
        const itineraryData = itineraryRow.itinerary_data || {};
        const days: any[] = Array.isArray(itineraryData.days) ? itineraryData.days : [];

        // Build the new activity entry from the suggestion
        const newActivity = {
          type: suggestion.type || 'activity',
          title: suggestion.title,
          description: suggestion.description || '',
          estimatedCost: suggestion.estimated_cost ? parseFloat(suggestion.estimated_cost) : undefined,
          time: '',
          expertCurated: true,
        };

        // Find the target day (default to day 1)
        const targetDay = suggestion.day_number ?? 1;
        const dayEntry = days.find((d: any) => d.day === targetDay);

        if (dayEntry) {
          if (!Array.isArray(dayEntry.activities)) dayEntry.activities = [];
          dayEntry.activities.push(newActivity);
        } else {
          // Day not found — append to the last day or create a new entry
          if (days.length > 0) {
            const lastDay = days[days.length - 1];
            if (!Array.isArray(lastDay.activities)) lastDay.activities = [];
            lastDay.activities.push(newActivity);
          } else {
            days.push({ day: targetDay, title: `Day ${targetDay}`, activities: [newActivity] });
          }
        }

        const updatedItineraryData = { ...itineraryData, days };

        await db.execute(sql`
          UPDATE generated_itineraries
          SET itinerary_data = ${JSON.stringify(updatedItineraryData)}::jsonb,
              updated_at = NOW()
          WHERE id = ${itineraryRow.id}
        `);
      }
    }

    res.json({ success: true, suggestion: { id: suggestionId, status } });
  } catch (error: any) {
    console.error('Review trip suggestion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
