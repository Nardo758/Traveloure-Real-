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
 * POST /api/bookings/activity/check-availability
 * Check real-time Viator availability for a product on a given date before payment.
 * Returns available productOptionCodes so the booking step can use the correct one.
 */
router.post('/activity/check-availability', isAuthenticated, async (req, res) => {
  try {
    const { productCode, travelDate, adults = 1, currency = 'USD' } = req.body;

    if (!productCode || !travelDate) {
      return res.status(400).json({ error: 'productCode and travelDate are required' });
    }

    const { viatorService } = await import('../services/viator.service');
    const result = await viatorService.checkAvailabilityForBooking(
      productCode,
      travelDate,
      Math.max(1, parseInt(adults) || 1),
      currency
    );

    res.json(result);
  } catch (error: any) {
    console.error('Availability check error:', error);
    res.status(500).json({ error: error.message, available: false, options: [] });
  }
});

/**
 * POST /api/bookings/activity/checkout
 * Create a Stripe Payment Intent for a single external activity (Viator/Amadeus/Fever)
 * and persist a pending activityBookings record.
 * Now accepts travelDate, travelerCount, and productOptionCode for Viator bookings.
 */
router.post('/activity/checkout', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const {
      provider, productCode, productOptionCode, title, price,
      currency = 'USD', imageUrl, bookingUrl,
      travelDate, travelerCount = 1,
    } = req.body;

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

    // Persist a pending activity booking record (with new travel fields)
    const bookingId = crypto.randomUUID();
    await db.execute(sql`
      INSERT INTO activity_bookings (
        id, user_id, provider, product_code, product_option_code, product_title,
        image_url, price_amount, price_currency, booking_url,
        stripe_payment_intent_id, travel_date, traveler_count, status, created_at
      )
      VALUES (
        ${bookingId}, ${userId}, ${provider}, ${productCode || null},
        ${productOptionCode || null}, ${title}, ${imageUrl || null},
        ${amount}, ${currency}, ${bookingUrl || null},
        ${paymentIntent.id}, ${travelDate || null}, ${Math.max(1, parseInt(travelerCount) || 1)},
        'pending', NOW()
      )
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
 * POST /api/bookings/activity/viator-book
 * Called after successful Stripe payment for a Viator activity.
 * Makes the actual booking with Viator's API and stores their bookingRef (BR-XXXXXXXXX).
 * Attribution is automatic via the exp-api-key header on all Viator API calls.
 */
router.post('/activity/viator-book', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId is required' });
    }

    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    // Load the booking + user profile in parallel
    const [bookingRows, userRows] = await Promise.all([
      db.execute(sql`
        SELECT * FROM activity_bookings
        WHERE id = ${bookingId} AND user_id = ${userId} AND status = 'confirmed'
        LIMIT 1
      `),
      db.execute(sql`
        SELECT first_name, last_name, email, phone FROM users WHERE id = ${userId} LIMIT 1
      `),
    ]);

    if (bookingRows.rows.length === 0) {
      return res.status(404).json({ error: 'Confirmed booking not found' });
    }

    const booking = bookingRows.rows[0] as any;
    const user = userRows.rows[0] as any;

    // Only call Viator API for Viator activities with a productCode
    if (booking.provider !== 'viator' || !booking.product_code) {
      return res.json({
        success: true,
        skipped: true,
        reason: 'Non-Viator provider or missing productCode — no API booking needed',
      });
    }

    // We need travelDate and productOptionCode to call Viator
    if (!booking.travel_date) {
      return res.status(400).json({ error: 'travel_date is required for Viator booking' });
    }

    const { viatorService } = await import('../services/viator.service');

    // If we don't have a productOptionCode yet, fetch availability to get one
    let productOptionCode = booking.product_option_code;
    let startTime: string | undefined;

    if (!productOptionCode) {
      const avail = await viatorService.checkAvailabilityForBooking(
        booking.product_code,
        booking.travel_date,
        booking.traveler_count || 1,
        booking.price_currency || 'USD'
      );
      if (!avail.available || avail.options.length === 0) {
        await db.execute(sql`
          UPDATE activity_bookings SET status = 'failed' WHERE id = ${bookingId}
        `);
        return res.status(422).json({ error: 'Activity not available on selected date' });
      }
      productOptionCode = avail.options[0].productOptionCode;
      startTime = avail.options[0].startTime;
    }

    // Make the Viator booking — partnerBookingRef is our internal ID for reconciliation
    const viatorResult = await viatorService.createBooking({
      productCode: booking.product_code,
      productOptionCode,
      startTime,
      travelDate: booking.travel_date,
      currency: booking.price_currency || 'USD',
      adults: booking.traveler_count || 1,
      partnerBookingRef: bookingId,
      firstName: user?.first_name || 'Guest',
      lastName: user?.last_name || 'Traveler',
      email: user?.email || '',
      phone: user?.phone || '+10000000000',
    });

    // Store Viator's booking reference for commission reconciliation
    await db.execute(sql`
      UPDATE activity_bookings
      SET provider_booking_ref = ${viatorResult.bookingRef},
          product_option_code = ${productOptionCode}
      WHERE id = ${bookingId}
    `);

    const isConfirmed = ['CONFIRMED', 'PENDING', 'IN_PROGRESS'].includes(viatorResult.status);

    res.json({
      success: isConfirmed,
      viatorStatus: viatorResult.status,
      viatorBookingRef: viatorResult.bookingRef,
      partnerBookingRef: viatorResult.partnerBookingRef,
      rejectionReason: viatorResult.rejectionReasonCode,
    });
  } catch (error: any) {
    console.error('Viator booking error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bookings/activity/stage-cart
 * Server-side staging of external activity cart items.
 * Prices are resolved from the authoritative activity_cache table (keyed by productCode).
 * Falls back to client-supplied price only for items not in cache, with strict range validation.
 */
router.post('/activity/stage-cart', isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims.sub;
    const { externalItems } = req.body;

    if (!Array.isArray(externalItems) || externalItems.length === 0) {
      return res.status(400).json({ error: 'externalItems must be a non-empty array' });
    }

    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    const activityBookingIds: string[] = [];

    for (const ext of externalItems) {
      const clientQuantity = parseInt(ext.quantity) || 1;
      if (clientQuantity < 1 || clientQuantity > 20) {
        return res.status(400).json({ error: `Invalid quantity for item: ${ext.name}` });
      }

      // Look up authoritative price from activity_cache (server-stored when activities were served)
      let authorizedPricePerUnit: number | null = null;
      const productCode = ext.id || ext.productCode;
      if (productCode) {
        const cacheRows = await db.execute(sql`
          SELECT price FROM activity_cache
          WHERE product_code = ${productCode}
          LIMIT 1
        `);
        if (cacheRows.rows.length > 0 && (cacheRows.rows[0] as any).price != null) {
          authorizedPricePerUnit = parseFloat((cacheRows.rows[0] as any).price);
        }
      }

      // Use server-side price if available; otherwise validate and use client price
      let pricePerUnit: number;
      if (authorizedPricePerUnit !== null && authorizedPricePerUnit > 0) {
        pricePerUnit = authorizedPricePerUnit;
      } else {
        // Fallback: client-supplied price with strict range validation
        const clientPrice = parseFloat(ext.price);
        if (isNaN(clientPrice) || clientPrice <= 0) {
          return res.status(400).json({ error: `Invalid price for item: ${ext.name}` });
        }
        if (clientPrice > 25000) {
          return res.status(400).json({ error: `Price exceeds maximum allowed for: ${ext.name}` });
        }
        pricePerUnit = clientPrice;
      }

      const priceAmount = pricePerUnit * clientQuantity;
      const provider = (ext.provider || ext.type || 'external').toLowerCase();
      const bookingId = crypto.randomUUID();

      await db.execute(sql`
        INSERT INTO activity_bookings (
          id, user_id, provider, product_code, product_title,
          image_url, price_amount, price_currency, booking_url, status, created_at
        ) VALUES (
          ${bookingId}, ${userId}, ${provider}, ${productCode || null}, ${ext.name},
          ${ext.metadata?.imageUrl || null}, ${priceAmount}, 'USD',
          ${ext.metadata?.bookingUrl || null}, 'staged', NOW()
        )
      `);

      activityBookingIds.push(bookingId);
    }

    res.status(201).json({ activityBookingIds });
  } catch (error: any) {
    console.error('Activity stage-cart error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bookings/activity/confirm
 * Confirms an activity booking after verifying Stripe payment intent is succeeded.
 * Verifies via internal payment_intents table (populated by webhook or payment intent creation).
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

    // Verify the payment intent belongs to this user and has succeeded
    // Check internal payment_intents table first (faster, no Stripe API call)
    const piRows = await db.execute(sql`
      SELECT status FROM payment_intents
      WHERE stripe_payment_intent_id = ${paymentIntentId}
        AND user_id = ${userId}
      LIMIT 1
    `);

    const piStatus = piRows.rows.length > 0 ? (piRows.rows[0] as any).status : null;

    // Allow if internal DB shows succeeded, or if we haven't received webhook yet
    // (webhook may be delayed; fall back to Stripe API to verify in real-time)
    if (piStatus !== 'succeeded') {
      // Double-check via Stripe API for real-time confirmation
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });

      try {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status !== 'succeeded') {
          return res.status(402).json({
            error: `Payment not completed. Status: ${intent.status}`,
          });
        }
        if (intent.metadata?.userId && intent.metadata.userId !== userId) {
          return res.status(403).json({ error: 'Payment intent does not belong to this user' });
        }
      } catch (stripeErr: any) {
        return res.status(400).json({ error: `Could not verify payment: ${stripeErr.message}` });
      }
    }

    // Verify the booking belongs to this user and is linked to this payment intent
    const bookingRows = await db.execute(sql`
      SELECT id, status FROM activity_bookings
      WHERE id = ${bookingId}
        AND user_id = ${userId}
        AND stripe_payment_intent_id = ${paymentIntentId}
      LIMIT 1
    `);

    if (bookingRows.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or payment intent mismatch' });
    }

    await db.execute(sql`
      UPDATE activity_bookings 
      SET status = 'confirmed'
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
      SELECT * FROM activity_bookings
      WHERE user_id = ${userId} AND status != 'staged'
      ORDER BY created_at DESC
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
