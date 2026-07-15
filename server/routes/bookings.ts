/**
 * Booking Routes
 * API endpoints for the booking system
 */

import { Router } from 'express';
import { bookingService } from '../services/booking.service';
import { stripePaymentService } from '../services/stripe-payment.service';
import { availabilityService } from '../services/availability.service';
import { pricingService } from '../services/pricing.service';
import { isAuthenticated } from '../replit_integrations/auth';
import { requireOwnership } from '../middleware/ownershipGuard';
import { storage } from '../storage';
import { db } from '../db';
import { serviceBookings } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { getUserId } from '../utils/auth';
import Stripe from 'stripe';

const router = Router();

// Owner of a legacy `bookings` row (for the refund authorization gate). Returns null if absent.
async function getBookingOwnerId(bookingId: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT user_id FROM bookings WHERE id = ${bookingId} LIMIT 1`);
  const row = r.rows?.[0] as any;
  return row?.user_id != null ? String(row.user_id) : null;
}

// Owner (traveler) of a `service_bookings` row. The escrow confirm/dispute endpoints operate on
// service_bookings (that's where the earnings link and where /api/my-bookings reads), so their
// ownership gate must resolve against service_bookings.traveler_id — NOT the legacy `bookings`
// table (which would 404 every real service booking). Returns null if the booking is absent.
async function getServiceBookingOwnerId(bookingId: string): Promise<string | null> {
  const rows = await db
    .select({ travelerId: serviceBookings.travelerId })
    .from(serviceBookings)
    .where(eq(serviceBookings.id, bookingId))
    .limit(1);
  return rows[0]?.travelerId ?? null;
}

/**
 * GET /api/bookings/:id
 * Fetch a single service booking by ID.
 * Protected by requireOwnership — only the traveler who made the booking or an admin may access.
 */
router.get(
  '/:id',
  isAuthenticated,
  requireOwnership(async (req) => {
    const rows = await db
      .select({ travelerId: serviceBookings.travelerId })
      .from(serviceBookings)
      .where(eq(serviceBookings.id, req.params.id))
      .limit(1);
    return rows[0]?.travelerId ?? null;
  }),
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(serviceBookings)
        .where(eq(serviceBookings.id, req.params.id))
        .limit(1);
      if (!rows[0]) return res.status(404).json({ message: 'Booking not found' });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ message: 'Failed to fetch booking' });
    }
  }
);

/**
 * POST /api/bookings/process-cart
 * Process cart and create bookings
 */
router.post('/process-cart', isAuthenticated, async (req, res) => {
  try {
    // Acting user = session, NEVER the body. (Was: `userId` from req.body — an IDOR letting an
    // authenticated user create trips/bookings under another user's id.)
    const sessionUserId = getUserId(req);
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });

    const { cartItems, paymentMethod = 'full', bookingMetadata } = req.body;

    if (!cartItems || !Array.isArray(cartItems)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const result = await bookingService.processCart(sessionUserId, cartItems, paymentMethod, bookingMetadata);

    // If any item was rejected because the slot was taken (race-condition double-booking),
    // return 409 Conflict so the frontend can show a clear message and refresh the slot list.
    const slotTakenError = result.errors.find((e) => e.startsWith('SLOT_TAKEN:'));
    if (slotTakenError) {
      const itemTitle = slotTakenError.slice('SLOT_TAKEN:'.length);
      return res.status(409).json({
        success: false,
        slotTaken: true,
        message: `This time slot for "${itemTitle}" was just booked by someone else. Please choose another time.`,
      });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Process cart error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/bookings/confirm-payment
 *
 * FALLBACK / POLLING ENDPOINT — the authoritative confirmation path is the
 * Stripe webhook (payment_intent.succeeded → stripePaymentService.handlePaymentSucceeded).
 * This endpoint exists so the client can recover when the browser was closed before
 * the webhook fired, or in local dev where webhooks aren't delivered.
 *
 * Behaviour:
 *   1. If the booking is already confirmed (webhook beat us here) → return 200 immediately.
 *   2. If the booking is still pending_payment → run the full server-side verification
 *      and confirm it (idempotent fallback).
 */
router.post('/confirm-payment', isAuthenticated, async (req, res) => {
  try {
    const { bookingId, paymentIntentId } = req.body;

    if (!bookingId || !paymentIntentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract userId handling both Replit Auth (user.id) and email-auth (user.claims.sub)
    const userId = (req as any).user?.id ?? (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User identity could not be resolved' });
    }

    // Fast-path: if the webhook already confirmed this booking, return success immediately
    const existing = await storage.getBookingStatusForUser(bookingId, userId);
    if (existing?.status === 'confirmed') {
      console.log(`[confirm-payment] booking ${bookingId} already confirmed by webhook — returning success`);
      return res.json({ success: true, message: 'Booking confirmed', source: 'webhook' });
    }

    // Fallback: webhook hasn't fired yet (or this is local dev) — confirm it now
    console.log(`[confirm-payment] webhook hasn't confirmed booking ${bookingId} yet — running fallback confirmation`);
    await bookingService.confirmBookingPayment(bookingId, paymentIntentId, userId);

    res.json({ success: true, message: 'Booking confirmed', source: 'fallback' });
  } catch (error: any) {
    const code = error?.code;
    if (code === 'PAYMENT_NOT_SUCCEEDED' || code === 'STRIPE_LOOKUP_FAILED') {
      return res.status(402).json({ success: false, error: error.message });
    }
    if (code === 'BOOKING_OWNERSHIP_MISMATCH') {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (code === 'BOOKING_NOT_FOUND') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (code === 'BOOKING_ALREADY_CONFIRMED' || code === 'PAYMENT_INTENT_ALREADY_USED') {
      return res.status(409).json({ success: false, error: error.message });
    }
    console.error('Confirm payment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bookings/bulk-status
 * Return the current status for a list of booking IDs belonging to the authenticated user.
 * Used by the client to poll whether the Stripe webhook has already confirmed the bookings
 * before falling back to the confirm-payment endpoint.
 */
router.post('/bulk-status', isAuthenticated, async (req, res) => {
  try {
    const { bookingIds } = req.body;
    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({ error: 'bookingIds must be a non-empty array' });
    }

    const userId = (req as any).user?.id ?? (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User identity could not be resolved' });
    }

    const statuses = await storage.getBulkBookingStatuses(bookingIds, userId);
    const allConfirmed = bookingIds.every((id: string) => statuses[id]?.status === 'confirmed');
    res.json({ statuses, allConfirmed });
  } catch (error: any) {
    console.error('Bulk status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bookings/availability/:providerId
 * Check availability for a provider
 */
router.get('/availability/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { date, time, quantity = '1' } = req.query;

    if (!date || !time) {
      return res.status(400).json({ error: 'Date and time required' });
    }

    const available = await availabilityService.checkAvailability(
      providerId,
      date as string,
      time as string,
      parseInt(quantity as string)
    );

    res.json({
      available,
      providerId,
      date,
      time,
    });
  } catch (error: any) {
    console.error('Availability check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/bookings/availability-calendar/:providerId
 * Get availability calendar for date range
 */
router.get('/availability-calendar/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end dates required' });
    }

    const calendar = await availabilityService.getAvailabilityCalendar(
      providerId,
      startDate as string,
      endDate as string
    );

    res.json({
      success: true,
      calendar,
    });
  } catch (error: any) {
    console.error('Calendar error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/bookings/estimate-cost
 * Get price estimate for trip items
 */
router.post('/estimate-cost', isAuthenticated, async (req, res) => {
  try {
    const { tripItems } = req.body;

    if (!tripItems || !Array.isArray(tripItems)) {
      return res.status(400).json({ error: 'Invalid trip items' });
    }

    const estimate = await pricingService.estimateTripCost(tripItems);

    res.json({
      success: true,
      ...estimate,
    });
  } catch (error: any) {
    console.error('Estimate cost error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/bookings/apply-promo
 * Apply promo code to booking
 */
router.post('/apply-promo', isAuthenticated, async (req, res) => {
  try {
    // userId from the session, never the body (was the same client-trusted-identity class as
    // process-cart: a client could pass another user's id to probe/bypass the per-user promo
    // limit). This is a discount PREVIEW only — no money moves and no usage is recorded here
    // (recordPromoUsage runs at checkout); `amount` is the client subtotal to preview against and
    // is not authoritative — the actual charge + promo are re-derived server-side at /api/checkout.
    const sessionUserId = getUserId(req);
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });

    const { code, amount } = req.body; // money-derive-ok: preview subtotal only; charge re-derives at /api/checkout

    if (!code || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pricingService.applyPromoCode(code, amount, sessionUserId);

    if (result.valid) {
      res.json({
        success: true,
        ...result,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Apply promo error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/bookings/webhooks/stripe
 * Stripe webhook endpoint
 */
router.post('/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).json({ error: 'Missing signature' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-18.acacia' as any,
    });

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    await stripePaymentService.handleWebhook(event);

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(400).json({
      error: `Webhook Error: ${error.message}`,
    });
  }
});

/**
 * POST /api/bookings/refund
 * Create refund for a booking
 */
router.post('/refund', isAuthenticated, async (req, res) => {
  try {
    // Was WORLD-WRITABLE: auth-only, any user could refund any bookingId for an arbitrary amount.
    // Now: owner-or-admin gate, and the refund amount is server-derived from the booking record
    // (client-sent `amount` is ignored). Acting user from the session, never the body.
    const sessionUserId = getUserId(req);
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });

    const { bookingId, reason } = req.body; // NOTE: `amount` intentionally not read — server-derived.

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    const ownerId = await getBookingOwnerId(bookingId);
    if (ownerId === null) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (ownerId !== sessionUserId) {
      const actor = await storage.getUser(sessionUserId);
      if (actor?.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to refund this booking' });
      }
    }

    // amount omitted → createRefund derives it from the booking's stored total_amount.
    const result = await stripePaymentService.createRefund(bookingId, undefined, reason);

    // Escrow Phase 4 (closes §14 A2): a refund now also reverses the linked earnings ledger + the
    // recognised platform revenue, so a refunded booking doesn't leave the provider/expert credited.
    // Both are idempotent no-ops when the booking has no in-escrow earnings, so this is safe on any
    // refund. paid_out earnings are left for manual clawback (surfaced via skippedPaidOut).
    const reversal = await storage.reverseEarningsForBooking(bookingId);
    await storage.reversePlatformRevenueForBooking(bookingId);

    res.json({
      success: true,
      ...result,
      reversedEarnings: reversal.reversed,
      skippedPaidOut: reversal.skippedPaidOut,
    });
  } catch (error: any) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ── Escrow Phase 3: traveler confirm-completion (early release) + dispute (block) ──
// The provider marks a booking `completed` (which creates the held earning); the traveler then
// either confirms — releasing the held earning early — or disputes, which blocks release until an
// admin resolves it. Acting user is the session; only the booking's traveler may act.

router.post('/:id/confirm-completion', isAuthenticated, async (req, res) => {
  try {
    const sessionUserId = getUserId(req);
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });
    const bookingId = req.params.id;

    const ownerId = await getServiceBookingOwnerId(bookingId);
    if (ownerId === null) return res.status(404).json({ error: 'Booking not found' });
    if (ownerId !== sessionUserId) return res.status(403).json({ error: 'Only the traveler can confirm this booking' });

    const [booking] = await db.select({ status: serviceBookings.status })
      .from(serviceBookings).where(eq(serviceBookings.id, bookingId));
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'Only a completed booking can be confirmed' });
    }

    const released = await storage.releaseEarningsForBooking(bookingId);
    res.json({ success: true, released });
  } catch (error: any) {
    console.error('Confirm-completion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/dispute', isAuthenticated, async (req, res) => {
  try {
    const sessionUserId = getUserId(req);
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });
    const bookingId = req.params.id;
    const { reason } = req.body;

    const ownerId = await getServiceBookingOwnerId(bookingId);
    if (ownerId === null) return res.status(404).json({ error: 'Booking not found' });
    if (ownerId !== sessionUserId) return res.status(403).json({ error: 'Only the traveler can dispute this booking' });

    // Persist the dispute reason into booking_metadata so the admin disputes list can surface it —
    // service_bookings has no dispute_reason column, and updateServiceBookingStatus only records a
    // reason for cancel/refund. jsonb-merge so other metadata (visa, etc.) is preserved.
    await db.update(serviceBookings)
      .set({
        bookingMetadata: sql`COALESCE(${serviceBookings.bookingMetadata}, '{}'::jsonb) || ${JSON.stringify({
          disputeReason: reason ?? null,
        })}::jsonb`,
      })
      .where(eq(serviceBookings.id, bookingId));

    // Block release: flag the booking's unpaid earnings disputed (pulled back to held), mark booking disputed.
    const blocked = await storage.setBookingEarningsDispute(bookingId, true);
    await storage.updateServiceBookingStatus(bookingId, 'disputed', reason);
    res.json({ success: true, blocked });
  } catch (error: any) {
    console.error('Dispute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
