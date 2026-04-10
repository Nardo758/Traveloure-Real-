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
import Stripe from 'stripe';

const router = Router();

/**
 * POST /api/bookings/process-cart
 * Process cart and create bookings
 */
router.post('/process-cart', isAuthenticated, async (req, res) => {
  try {
    const { userId, cartItems, paymentMethod = 'full' } = req.body;

    if (!userId || !cartItems || !Array.isArray(cartItems)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const result = await bookingService.processCart(userId, cartItems, paymentMethod);

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
 * Confirm booking after payment success
 */
router.post('/confirm-payment', isAuthenticated, async (req, res) => {
  try {
    const { bookingId, paymentIntentId } = req.body;

    if (!bookingId || !paymentIntentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const success = await bookingService.confirmBookingPayment(bookingId, paymentIntentId);

    if (success) {
      res.json({
        success: true,
        message: 'Booking confirmed',
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to confirm booking',
      });
    }
  } catch (error: any) {
    console.error('Confirm payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
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
    const { code, amount, userId } = req.body;

    if (!code || !amount || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pricingService.applyPromoCode(code, amount, userId);

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
 * POST /api/bookings/activity/checkout
 * Create a Stripe Payment Intent for a single external activity (Viator/Amadeus/Fever)
 * and persist a pending activityBookings record.
 */
router.post('/activity/checkout', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { provider, productCode, title, price, currency = 'USD', imageUrl, bookingUrl } = req.body;

    if (!provider || !title || !price) {
      return res.status(400).json({ error: 'provider, title, and price are required' });
    }

    const amount = parseFloat(price);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    // Create Stripe Payment Intent
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2024-12-18.acacia' as any,
    });

    const userResult = await db.execute(sql`SELECT email FROM users WHERE id = ${userId}`);
    const userEmail = (userResult.rows[0] as any)?.email || `user${userId}@traveloure.com`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: { userId, type: 'activity_booking', provider, productCode: productCode || '' },
      description: `Activity Booking: ${title}`,
      receipt_email: userEmail,
      automatic_payment_methods: { enabled: true },
    });

    // Persist a pending activity booking record
    const bookingId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO activity_bookings (id, user_id, provider, product_code, product_title, image_url, price_amount, price_currency, booking_url, stripe_payment_intent_id, status, created_at)
      VALUES (${bookingId}, ${userId}, ${provider}, ${productCode || null}, ${title}, ${imageUrl || null}, ${amount}, ${currency}, ${bookingUrl || null}, ${paymentIntent.id}, 'pending', NOW())
    `);

    res.status(201).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      bookingId,
    });
  } catch (error: any) {
    console.error('Activity checkout error:', error);
    res.status(500).json({ error: `Checkout failed: ${error.message}` });
  }
});

/**
 * POST /api/bookings/activity/confirm
 * Called after a successful Stripe payment on the client side to confirm the booking.
 */
router.post('/activity/confirm', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { bookingId, paymentIntentId } = req.body;

    if (!bookingId || !paymentIntentId) {
      return res.status(400).json({ error: 'bookingId and paymentIntentId are required' });
    }

    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    await db.execute(sql`
      UPDATE activity_bookings 
      SET status = 'confirmed', stripe_payment_intent_id = ${paymentIntentId}
      WHERE id = ${bookingId} AND user_id = ${userId}
    `);

    res.json({ success: true, bookingId, status: 'confirmed' });
  } catch (error: any) {
    console.error('Activity confirm error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/my-activity-bookings
 * Return the current user's activity bookings (sorted newest first)
 */
router.get('/my-activity-bookings', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    const result = await db.execute(sql`
      SELECT * FROM activity_bookings WHERE user_id = ${userId} ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('My activity bookings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bookings/refund
 * Create refund for a booking
 */
router.post('/refund', isAuthenticated, async (req, res) => {
  try {
    const { bookingId, amount, reason } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    const result = await stripePaymentService.createRefund(bookingId, amount, reason);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
