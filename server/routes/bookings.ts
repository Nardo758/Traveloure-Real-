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
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getUserId } from '../utils/auth';
import { holdWindowDays } from '../config/earnings-hold.config';
import { revertPurchasedItemsForBooking } from '../services/item-routing.service';
import Stripe from 'stripe';

const router = Router();

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
    const sessionUserId = getUserId(req)!;
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
 * Does `bookingId` name a CART-CHECKOUT booking (service_bookings) owned by `userId`?
 *
 * The two booking rails have disjoint id spaces, so this is also how confirm-payment and
 * bulk-status decide which rail a client-supplied id belongs to. Returns null when the id is
 * not a service_booking at all (⇒ the legacy `bookings` rail owns it) and `owned:false` when it
 * is one but belongs to someone else (⇒ 403, never a cross-user confirmation).
 */
async function loadCartBooking(
  bookingId: string,
  userId: string,
): Promise<{ owned: boolean; status: string | null; paymentIntentId: string | null } | null> {
  const rows = await db
    .select({
      travelerId: serviceBookings.travelerId,
      status: serviceBookings.status,
      pi: serviceBookings.stripePaymentIntentId,
    })
    .from(serviceBookings)
    .where(eq(serviceBookings.id, bookingId))
    .limit(1);
  if (rows.length === 0) return null;
  return {
    owned: rows[0].travelerId === userId,
    status: rows[0].status ?? null,
    paymentIntentId: rows[0].pi ?? null,
  };
}

/**
 * POST /api/bookings/confirm-payment
 *
 * FALLBACK / POLLING ENDPOINT — the authoritative confirmation path is the
 * Stripe webhook (payment_intent.succeeded → stripePaymentService.handlePaymentSucceeded).
 * This endpoint exists so the client can recover when the browser was closed before
 * the webhook fired, or in local dev where webhooks aren't delivered.
 *
 * TWO RAILS (task #213, legacy-reconciliation lane)
 * ─────────────────────────────────────────────────
 * This endpoint used to read ONLY the legacy `bookings` table, so a CART-CHECKOUT booking id
 * (`service_bookings`) 404'd here — the client's fallback could not confirm the very bookings
 * `POST /api/checkout` creates (ruling 38 filed this as #213). It now detects which rail the id
 * belongs to and, for the cart rail, drives the SAME shared promotion the webhook drives
 * (`promotePaidCheckout`) — one promotion implementation, two callers, so the two signals can
 * never diverge on what "confirmed" means and a double signal produces exactly one flip.
 *
 * Behaviour:
 *   1. If the booking is already confirmed (webhook beat us here) → return 200 immediately.
 *   2. If the booking is still pending → run the full server-side verification and confirm it
 *      (idempotent — the atomic conditional in the shared promotion IS the guard).
 */
router.post('/confirm-payment', isAuthenticated, async (req, res) => {
  try {
    const { bookingId, paymentIntentId } = req.body;

    if (!bookingId || !paymentIntentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract userId handling both Replit Auth (user.id) and email-auth (user.claims.sub)
    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User identity could not be resolved' });
    }

    // ── CART RAIL (service_bookings) ────────────────────────────────────────────────────
    const cart = await loadCartBooking(String(bookingId), userId);
    if (cart) {
      if (!cart.owned) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      if (cart.status === 'confirmed') {
        return res.json({ success: true, message: 'Booking confirmed', source: 'webhook' });
      }
      // §14/security: the client-supplied paymentIntentId is NEVER trusted on its own. It must
      // (a) be the PI the SERVER stamped on this very row, and (b) actually have succeeded at
      // Stripe. The shared promotion re-asserts (a) inside its atomic WHERE; this check makes
      // the failure legible instead of a silent zero-row no-op. Unlike the webhook, the client
      // path may NOT stamp a PaymentIntent onto an unstamped claim — only a signature-verified
      // Stripe delivery may do that.
      if (!cart.paymentIntentId || cart.paymentIntentId !== String(paymentIntentId)) {
        return res.status(409).json({
          success: false,
          error: 'payment_intent_mismatch',
          message: 'That payment does not belong to this booking.',
        });
      }
      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });
      let intent: Stripe.PaymentIntent;
      try {
        intent = await stripeClient.paymentIntents.retrieve(String(paymentIntentId));
      } catch (stripeErr: any) {
        return res.status(402).json({
          success: false,
          error: `Stripe lookup failed: ${stripeErr?.message ?? stripeErr}`,
        });
      }
      if (intent.status !== 'succeeded') {
        return res.status(402).json({
          success: false,
          error: `PaymentIntent ${paymentIntentId} has status "${intent.status}", not "succeeded"`,
        });
      }

      const { promotePaidCheckout } = await import('../services/checkout-claim.service');
      const promotion = await promotePaidCheckout({
        paymentIntentId: String(paymentIntentId),
        actor: 'client',
        actorId: userId,
        bookingIds: [String(bookingId)],
      });
      if (promotion.promoted.length > 0) {
        return res.json({ success: true, message: 'Booking confirmed', source: 'fallback' });
      }
      if (promotion.alreadyConfirmed.length > 0) {
        // The webhook won the race between our read above and the atomic flip. Same outcome.
        return res.json({ success: true, message: 'Booking confirmed', source: 'webhook' });
      }
      const exception = promotion.exceptions[0];
      return res.status(409).json({
        success: false,
        error: 'reconciliation_exception',
        message:
          'This checkout could not be confirmed (it expired or was cancelled before the payment landed). ' +
          'Nothing was resurrected — our team has been alerted to reconcile the payment.',
        detail: exception?.reason ?? 'not_promotable',
      });
    }

    // ── LEGACY RAIL (`bookings`) — process-cart / booking-demo flow. Unchanged. ──────────
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
 *
 * TWO RAILS (task #213): `storage.getBulkBookingStatuses` reads the legacy `bookings` table, so
 * a cart-checkout id returned NOTHING and `allConfirmed` was permanently false — the client's
 * poll could never observe the webhook's work. Both id spaces are now answered; they are
 * disjoint, so an id is resolved by whichever rail owns it, always scoped to the session user.
 */
router.post('/bulk-status', isAuthenticated, async (req, res) => {
  try {
    const { bookingIds } = req.body;
    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({ error: 'bookingIds must be a non-empty array' });
    }

    const userId = getUserId(req)!;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User identity could not be resolved' });
    }

    const statuses = await storage.getBulkBookingStatuses(bookingIds, userId);
    // Cart rail: fill in every id the legacy rail did not answer. Ownership is enforced by the
    // traveler_id predicate, exactly as the legacy query enforces it with user_id.
    const unresolved = (bookingIds as string[]).filter((id) => !statuses[id]);
    if (unresolved.length > 0) {
      const cartRows = await db
        .select({
          id: serviceBookings.id,
          status: serviceBookings.status,
          trackingNumber: serviceBookings.trackingNumber,
        })
        .from(serviceBookings)
        .where(and(inArray(serviceBookings.id, unresolved), eq(serviceBookings.travelerId, userId)));
      for (const row of cartRows) {
        statuses[row.id] = {
          status: row.status ?? 'unknown',
          confirmationCode: row.trackingNumber ?? null,
        };
      }
    }
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

// MONEY_MAP F-2: production guard — STRIPE_WEBHOOK_SECRET defaults to '' below, and passing an
// empty secret into constructEvent just throws inside the try/catch on every delivery (a noisy,
// per-request 400 that masks the real misconfiguration). In production specifically, refuse the
// route outright instead. Logged once (not once-per-request) to avoid log-flooding a webhook
// endpoint that Stripe will retry repeatedly while misconfigured.
let loggedMissingWebhookSecretOnce = false;

/**
 * POST /api/bookings/webhooks/stripe
 * Stripe webhook endpoint
 */
//
// SIGNATURE VERIFICATION USES req.rawBody, NOT req.body (L14 money-path P0).
// This handler used to pass `req.body` to constructEvent. By the time any route runs, the global
// express.json() in server/index.ts has already PARSED the body, so `req.body` is a plain object
// and the exact bytes Stripe signed are gone — constructEvent could therefore NEVER verify a real
// Stripe delivery, which made the `charge.refunded` handler unreachable over HTTP.
// The raw bytes ARE available: that same express.json() supplies a `verify` callback that stashes
// the Buffer on `req.rawBody`. This is exactly how the two working Stripe webhooks
// (POST /api/webhooks/stripe and /api/webhooks/stripe-identity in webhooks.routes.ts) verify, so
// this route now mirrors that established pattern — no new middleware, no change to body parsing
// for any other route.
router.post('/webhooks/stripe', async (req: any, res) => {
  if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_WEBHOOK_SECRET) {
    if (!loggedMissingWebhookSecretOnce) {
      console.error(
        '[bookings webhook] STRIPE_WEBHOOK_SECRET is not set in production — refusing webhook deliveries ' +
          'rather than attempting signature verification with an empty secret.'
      );
      loggedMissingWebhookSecretOnce = true;
    }
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).json({ error: 'Missing signature' });
  }

  if (!req.rawBody) {
    return res.status(500).json({ error: 'Raw body unavailable for signature verification' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-18.acacia' as any,
    });

    const event = stripe.webhooks.constructEvent(
      req.rawBody,
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
    const sessionUserId = getUserId(req)!;
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });

    const { bookingId, reason } = req.body; // NOTE: `amount` intentionally not read — server-derived.

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    // Re-pointed onto service_bookings (the canonical booking rail). The old code gated on
    // and refunded against the legacy `bookings` table (getBookingOwnerId + createRefund),
    // so it 404'd every real booking — refunds live in service_bookings, where disputes and
    // the earnings link already are. Uses the same service-booking-native owner gate + refund
    // as the admin dispute-uphold path (§14 amount server-derived, §15 idempotent).
    const ownerId = await getServiceBookingOwnerId(bookingId);
    if (ownerId === null) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    let isAdmin = false;
    if (ownerId !== sessionUserId) {
      const actor = await storage.getUser(sessionUserId);
      if (actor?.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to refund this booking' });
      }
      isAdmin = true;
    }

    // Cancellation-policy enforcement: a TRAVELER-initiated refund is bounded by the service's
    // cancellation_policy_type + time-to-start (cancellation-policy.service.ts) — the same quote
    // the cancel-preview endpoint shows. Admin-initiated refunds (dispute resolution, goodwill)
    // remain full-amount and are NOT policy-limited.
    let amountOverride: number | undefined;
    let refundFraction = 1;
    if (!isAdmin) {
      const { quoteCancellationForBooking } = await import('../services/cancellation-policy.service');
      const quote = await quoteCancellationForBooking(bookingId);
      if (quote) {
        if (!quote.automaticRefundAllowed) {
          return res.status(400).json({
            error: 'This service is non-refundable, so an automatic refund cannot be issued. Contact support if you believe an exception applies.',
            policyType: quote.policyType,
            refundAmount: 0,
          });
        }
        if (quote.refundAmount <= 0) {
          return res.status(400).json({
            error: quote.message,
            policyType: quote.policyType,
            refundAmount: 0,
          });
        }
        if (quote.refundPercent < 100) {
          amountOverride = quote.refundAmount;
          refundFraction = quote.refundPercent / 100;
        }
      }
    }

    // Escrow Phase 4 (closes §14 A2): a refund also reverses the linked earnings ledger + the
    // recognised platform revenue, so a refunded booking doesn't leave the provider/expert
    // credited. Both are idempotent no-ops when the booking has no in-escrow earnings, so this
    // is safe on any refund. paid_out earnings are never auto-clawed-back (ratified "reversal
    // only while in escrow") — they are surfaced via skippedPaidOut for manual handling.
    //
    // ORDER: ledger-first, Stripe-second — matching the admin dispute-uphold path
    // (admin.routes.ts POST /api/admin/disputes/:bookingId/uphold) and the §18 Phase 4
    // rationale. The reversals are idempotent atomic flips, so a Stripe failure leaves a
    // fully-reversed ledger that a retry simply re-confirms as a no-op. The previous
    // Stripe-first order had the opposite failure mode: money out the door with the ledger
    // still crediting the earner if the reversal then threw.
    // PROPORTIONAL for policy partial refunds: a 50% refund reverses only half the recognised
    // platform revenue (retained share stays recognised) and does NOT reverse earnings — the
    // in-escrow earnings correspond to the provider's retained economics, and zeroing them for a
    // partial refund undercounted every partial cancellation. Full refunds keep the original
    // full-reversal behavior.
    const reversal =
      refundFraction >= 1
        ? await storage.reverseEarningsForBooking(bookingId)
        : { reversed: 0, skippedPaidOut: 0 };
    const reversedRevenueRows = await storage.reversePlatformRevenueForBooking(bookingId, new Date(), refundFraction);

    // Amount server-derived from service_bookings.total_amount (policy-scaled when partial);
    // idempotent (atomic status claim + amount-unambiguous Stripe idempotencyKey).
    const result = await stripePaymentService.refundServiceBooking(
      bookingId,
      reason,
      amountOverride !== undefined ? { amountOverride } : undefined,
    );

    // Lane 1 W4 — the ROUTING reversal edge (ROUTING_STATE_CONTRACT §1: the refund path is its
    // SOLE writer). Without it the Trip Card keeps showing as `purchased` an item the traveler was
    // refunded for — H2's mirror image. Runs AFTER the refund succeeds, so the ledger-first /
    // Stripe-second ordering above is untouched; the helper is atomic, idempotent, and never
    // throws (a plan flag must never surface as a refund failure).
    const routingReversal = await revertPurchasedItemsForBooking(bookingId);

    res.json({
      success: true,
      ...result,
      revertedPlanItems: routingReversal.reverted,
      reversedEarnings: reversal.reversed,
      skippedPaidOut: reversal.skippedPaidOut,
      reversedRevenueRows,
      ...(reversal.skippedPaidOut > 0
        ? {
            note: `${reversal.skippedPaidOut} earning(s) were already paid out and were NOT auto-reversed — a post-payout clawback must be handled manually.`,
          }
        : {}),
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
    const sessionUserId = getUserId(req)!;
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
    const sessionUserId = getUserId(req)!;
    if (!sessionUserId) return res.status(401).json({ error: 'Not authenticated' });
    const bookingId = req.params.id;
    const { reason } = req.body;

    const ownerId = await getServiceBookingOwnerId(bookingId);
    if (ownerId === null) return res.status(404).json({ error: 'Booking not found' });
    if (ownerId !== sessionUserId) return res.status(403).json({ error: 'Only the traveler can dispute this booking' });

    // Escrow decisions 3 + 4 (docs/design/escrow-spine.md): a traveler may dispute ONLY during the
    // clearance window. Once it elapses the held earning matures → releasable → paid_out, and per
    // decision 4 there is NO automated post-payout claw-back. So a late dispute must be REJECTED
    // here — silently accepting one would strand a refund the escrow spine can't fund. The cutoff
    // uses the same holdWindowDays('service_booking') config the release job uses, so the dispute
    // window and the payout timing line up exactly (default 7 days, env-overridable). completedAt
    // null (not yet completed) → no matured earning → the window doesn't apply (dispute allowed).
    const [bk] = await db
      .select({ completedAt: serviceBookings.completedAt })
      .from(serviceBookings)
      .where(eq(serviceBookings.id, bookingId));
    if (!bk) return res.status(404).json({ error: 'Booking not found' });
    if (bk.completedAt) {
      const windowDays = holdWindowDays('service_booking');
      const deadline = new Date(bk.completedAt).getTime() + windowDays * 24 * 60 * 60 * 1000;
      if (Date.now() > deadline) {
        return res.status(409).json({
          error: 'dispute_window_closed',
          message: `The ${windowDays}-day dispute window for this booking has closed.`,
        });
      }
    }

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
