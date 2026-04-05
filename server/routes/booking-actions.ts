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

    const saved = savedResult.rows[0] as any;
    const destination = saved.destination || 'My Destination';
    const startDate = saved.start_date || new Date().toISOString().split('T')[0];
    const endDate = saved.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const travelers = saved.travelers || 1;
    const budget = saved.budget || null;

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

    // Mark saved trip as converted
    await db.execute(sql`
      UPDATE saved_trips
      SET status = 'converted'
      WHERE id = ${id}
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
 * View shared trip (public)
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

    // TODO: Get variant items
    // TODO: Format response for public viewing

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

export default router;
