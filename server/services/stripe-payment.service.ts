/**
 * Stripe Payment Service — Cart Bookings, Expert Services & Refunds
 *
 * OWNERSHIP: This service is the canonical owner of Stripe PaymentIntents and Checkout
 * Sessions for cart-based bookings (multi-service checkout) and expert advisory service
 * purchases (review-only, review-and-book, full-concierge). It also owns the central
 * webhook event dispatcher: it routes `payment_intent.succeeded/failed/canceled`,
 * `charge.refunded`, and `checkout.session.completed` events to the appropriate handler,
 * delegating transport-booking confirmation to stripe.service.ts via
 * `handleStripePaymentSuccess`. Refund creation (stripe.refunds.create) is owned here.
 *
 * DOES NOT OWN: Checkout Sessions for transport bookings (owned by stripe.service.ts),
 * Connect account management or payouts to experts/providers (owned by
 * stripe-connect.service.ts).
 *
 * Stripe API calls made here:
 *   - stripe.paymentIntents.create    — cart checkout and expert service embedded checkout
 *   - stripe.paymentIntents.retrieve  — payment intent status lookup
 *   - stripe.checkout.sessions.create — expert service hosted checkout
 *   - stripe.refunds.create           — booking refunds
 */

import Stripe from 'stripe';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { handleStripePaymentSuccess } from './stripe.service';
import { sendBookingConfirmationEmail } from './email.service';
import { trackFunnelEvent } from '../utils/funnelTracker';
import { logger } from '../infrastructure/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any,
});

class StripePaymentService {
  /**
   * Return the list of supported currency codes
   */
  getSupportedCurrencies(): string[] {
    return ['usd', 'eur', 'gbp', 'jpy', 'aud', 'sgd'];
  }

  // ── FP-1: Stripe Customer + saved payment methods (frictionless payments) ──────────────
  //
  // The durable customer layer. Cards are vaulted by Stripe only — this codebase stores just
  // users.stripe_customer_id (migration 146) and reads payment_method ids live from Stripe.
  // Replaces the fragile per-request customers.list({email}) lookup optimization.routes.ts had.

  isReady(): boolean {
    return !!process.env.STRIPE_SECRET_KEY;
  }

  /**
   * Get (or lazily create) the user's Stripe Customer, persisting the id. Resolution order:
   * persisted id → email search (adopts a customer an older flow created) → create. Returns
   * null when Stripe is unconfigured or the user has no email (never fabricates).
   */
  async getOrCreateCustomer(userId: string): Promise<string | null> {
    if (!this.isReady()) return null;
    const existing = await db.execute(sql`
      SELECT stripe_customer_id, email, first_name, last_name FROM users WHERE id = ${userId} LIMIT 1
    `);
    const row = existing.rows?.[0] as any;
    if (!row) return null;
    if (row.stripe_customer_id) return String(row.stripe_customer_id);

    let customerId: string | null = null;
    if (row.email) {
      const found = await stripe.customers.list({ email: row.email, limit: 1 });
      if (found.data.length > 0) customerId = found.data[0].id;
    }
    if (!customerId) {
      if (!row.email) return null;
      const created = await stripe.customers.create({
        email: row.email,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || undefined,
        metadata: { userId },
      });
      customerId = created.id;
    }
    await db.execute(sql`
      UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${userId} AND stripe_customer_id IS NULL
    `);
    return customerId;
  }

  /** Saved cards for the session user — read live from Stripe, safe display fields only. */
  async listSavedPaymentMethods(userId: string): Promise<{
    defaultPaymentMethodId: string | null;
    methods: Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number }>;
  }> {
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return { defaultPaymentMethodId: null, methods: [] };
    const [customer, methods] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
    ]);
    const defaultPm =
      !('deleted' in customer) && customer.invoice_settings?.default_payment_method
        ? String(customer.invoice_settings.default_payment_method)
        : null;
    return {
      defaultPaymentMethodId: defaultPm,
      methods: methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'card',
        last4: pm.card?.last4 ?? '',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
      })),
    };
  }

  /** Detach a saved card — ONLY if it belongs to the session user's own customer (§14). */
  async detachSavedPaymentMethod(userId: string, paymentMethodId: string): Promise<boolean> {
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return false;
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== customerId) return false;
    await stripe.paymentMethods.detach(paymentMethodId);
    return true;
  }

  /** Set the default saved card — same ownership check as detach (§14). */
  async setDefaultSavedPaymentMethod(userId: string, paymentMethodId: string): Promise<boolean> {
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return false;
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== customerId) return false;
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return true;
  }

  /**
   * FP-1 one-click: charge the user's saved default card OFF-SESSION (create+confirm in one
   * server-side call). The AMOUNT always comes from the caller's server-side fee derivation
   * (§14) and the caller supplies a deterministic idempotencyKey (§15).
   *
   * Outcomes (never throws for the expected cases):
   *   'succeeded'        — charged; caller proceeds exactly as if the Elements flow confirmed.
   *   'requires_action'  — the bank demands 3DS; clientSecret returned so the client falls back
   *                        to the payment sheet for this one charge.
   *   'no_saved_method'  — nothing vaulted (or Stripe unconfigured); caller uses the normal sheet.
   */
  async chargeSavedMethod(
    userId: string,
    params: {
      amountCents: number;
      currency?: string;
      metadata: Record<string, string>;
      description: string;
      idempotencyKey: string;
    },
  ): Promise<
    | { status: 'succeeded'; paymentIntentId: string }
    | { status: 'requires_action'; paymentIntentId: string; clientSecret: string }
    | { status: 'no_saved_method' }
  > {
    if (!this.isReady()) return { status: 'no_saved_method' };
    const { defaultPaymentMethodId, methods } = await this.listSavedPaymentMethods(userId);
    const paymentMethodId = defaultPaymentMethodId ?? methods[0]?.id;
    if (!paymentMethodId) return { status: 'no_saved_method' };
    const customerId = await this.getOrCreateCustomer(userId);
    if (!customerId) return { status: 'no_saved_method' };

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: params.amountCents,
          currency: (params.currency ?? 'usd').toLowerCase(),
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: params.metadata,
          description: params.description,
        },
        { idempotencyKey: params.idempotencyKey },
      );
      if (pi.status === 'succeeded') return { status: 'succeeded', paymentIntentId: pi.id };
      if (pi.status === 'requires_action' && pi.client_secret) {
        return { status: 'requires_action', paymentIntentId: pi.id, clientSecret: pi.client_secret };
      }
      // Any other terminal state — treat as needing the interactive sheet.
      return pi.client_secret
        ? { status: 'requires_action', paymentIntentId: pi.id, clientSecret: pi.client_secret }
        : { status: 'no_saved_method' };
    } catch (err: any) {
      // Card declined off-session or bank demands authentication: Stripe attaches the PI to the
      // error — hand its clientSecret back so the user completes it interactively (honest
      // fallback, never a silent retry loop).
      const errPi = err?.raw?.payment_intent ?? err?.payment_intent;
      if (errPi?.client_secret) {
        return { status: 'requires_action', paymentIntentId: errPi.id, clientSecret: errPi.client_secret };
      }
      logger.warn({ err: err?.message, userId }, '[FP-1] off-session charge failed without recoverable PI');
      return { status: 'no_saved_method' };
    }
  }

  /**
   * Create payment intent for bookings
   * @param currency - Three-letter ISO currency code (defaults to 'usd'). Supported: usd, eur, gbp, jpy, aud, sgd.
   */
  async createPaymentIntent(
    userId: string,
    bookings: any[],
    amount: number,
    isDeposit: boolean = false,
    currency: string = 'usd',
    idempotencyKey?: string
  ) {
    try {
      // Get user details
      const user = await db.execute(sql`
        SELECT email, first_name, last_name FROM users WHERE id = ${userId}
      `);

      if (!user.rows || user.rows.length === 0) {
        throw new Error('User not found');
      }

      const userRow = user.rows[0] as { email?: string; first_name?: string; last_name?: string };
      const userEmail = userRow.email || `user${userId}@traveloure.com`;

      // Validate currency and compute Stripe amount
      const supportedCurrencies = this.getSupportedCurrencies();
      const effectiveCurrency = supportedCurrencies.includes(currency.toLowerCase()) ? currency.toLowerCase() : 'usd';
      const isZeroDecimal = effectiveCurrency === 'jpy';
      const stripeAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100);

      // Create payment intent
      // Stripe metadata values have 500 char limit, so truncate booking IDs if needed
      const allBookingIds = bookings.map(b => b.id).join(',');
      const truncatedBookingIds = allBookingIds.length > 490 
        ? allBookingIds.substring(0, 490) + '...' 
        : allBookingIds;
      
      const stripeRequestOptions = idempotencyKey
        ? { idempotencyKey: `pi-${idempotencyKey}` }
        : undefined;

      // FP-1: attach the durable Stripe Customer so the PaymentElement sheet offers the user's
      // saved cards (near-one-click) and newly entered cards can be vaulted for next time.
      const fpCustomerId = await this.getOrCreateCustomer(userId).catch(() => null);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: stripeAmount,
        currency: effectiveCurrency,
        ...(fpCustomerId ? { customer: fpCustomerId, setup_future_usage: 'off_session' as const } : {}),
        metadata: {
          userId,
          bookingIds: truncatedBookingIds,
          isDeposit: isDeposit.toString(),
          bookingCount: bookings.length.toString(),
        },
        description: `Traveloure ${isDeposit ? 'Deposit' : 'Booking'} - ${bookings.length} item(s)`,
        receipt_email: userEmail,
        automatic_payment_methods: {
          enabled: true,
        },
      }, stripeRequestOptions);

      // Store payment intent in database
      const metadataJson = JSON.stringify(paymentIntent.metadata);
      await db.execute(sql`
        INSERT INTO payment_intents (
          stripe_payment_intent_id, user_id, amount, currency,
          status, is_deposit, metadata, created_at
        ) VALUES (${paymentIntent.id}, ${userId}, ${amount}, ${effectiveCurrency}, ${paymentIntent.status}, ${isDeposit}, ${metadataJson}, NOW())
      `);

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
      };
    } catch (error: any) {
      console.error('Stripe payment intent error:', error);
      throw new Error(`Payment intent creation failed: ${error.message}`);
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event: Stripe.Event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.canceled':
          await this.handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.requires_action':
          await this.handleRequiresAction(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.refunded':
          await this.handleRefund(event.data.object as Stripe.Charge);
          break;

        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.metadata?.type === 'expert_service') {
            await this.handleExpertServicePayment(session);
          } else if (session.metadata?.type === 'transport_booking') {
            await handleStripePaymentSuccess(session.id);
          }
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error: any) {
      console.error('Webhook handling error:', error);
      throw error;
    }
  }

  /**
   * Generate a unique booking confirmation code
   */
  private generateConfirmationCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'TRV';
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Handle successful payment — authoritative confirmation path via Stripe webhook.
   * Idempotent: already-confirmed bookings are skipped.
   */
  async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const { userId, bookingIds, isDeposit } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(sql`
      UPDATE payment_intents SET status = 'succeeded' WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);

    if (!bookingIds) {
      console.log(`[webhook] payment_intent.succeeded: no bookingIds in metadata for ${paymentIntent.id}`);
      return;
    }

    const bookingIdList = bookingIds.split(',').map((id: string) => id.trim()).filter(Boolean);
    for (const bookingId of bookingIdList) {
      // Idempotency: skip bookings that are already confirmed
      const existing = await db.execute(sql`
        SELECT status FROM bookings WHERE id = ${bookingId} LIMIT 1
      `);
      const currentStatus = (existing.rows?.[0] as any)?.status;
      if (currentStatus === 'confirmed') {
        console.log(`[webhook] booking ${bookingId} already confirmed — skipping`);
        continue;
      }

      const confirmationCode = this.generateConfirmationCode();

      if (isDeposit === 'true') {
        await db.execute(sql`
          UPDATE bookings SET
            status = 'confirmed',
            payment_status = 'succeeded',
            confirmed_at = NOW(),
            confirmation_code = ${confirmationCode},
            deposit_paid = true
          WHERE id = ${bookingId}
        `);
      } else {
        await db.execute(sql`
          UPDATE bookings SET
            status = 'confirmed',
            payment_status = 'succeeded',
            confirmed_at = NOW(),
            confirmation_code = ${confirmationCode},
            deposit_paid = true,
            balance_paid = true
          WHERE id = ${bookingId}
        `);
      }

      console.log(`[webhook] confirmed booking ${bookingId} via payment_intent.succeeded (pi=${paymentIntent.id})`);

      // Fire-and-forget confirmation email — must not block the webhook response
      const bookingDetails = await db.execute(sql`
        SELECT b.title, b.booking_date, u.email, u.first_name, u.last_name
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        WHERE b.id = ${bookingId}
        LIMIT 1
      `).catch(() => null);

      const row = bookingDetails?.rows?.[0] as any;
      if (row?.email) {
        sendBookingConfirmationEmail({
          toEmail: row.email,
          userName: [row.first_name, row.last_name].filter(Boolean).join(' ') || '',
          bookingId,
          bookingTitle: row.title || 'Your booking',
          bookingDate: row.booking_date ?? null,
          confirmationCode,
        }).catch(err =>
          console.error(`[email] booking confirmation failed for booking ${bookingId}:`, err)
        );
      }
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const { bookingIds } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(sql`
      UPDATE payment_intents SET status = 'failed' WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);

    // Update bookings
    const bookingIdList = bookingIds.split(',');
    for (const bookingId of bookingIdList) {
      await db.execute(sql`
        UPDATE bookings SET
          status = 'payment_failed',
          payment_status = 'failed'
        WHERE id = ${bookingId}
      `);
    }

    // TODO: Notify user of payment failure
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent) {
    const { bookingIds } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(sql`
      UPDATE payment_intents SET status = 'canceled' WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);

    // Update bookings
    const bookingIdList = bookingIds.split(',');
    for (const bookingId of bookingIdList) {
      await db.execute(sql`
        UPDATE bookings SET
          status = 'canceled',
          payment_status = 'canceled'
        WHERE id = ${bookingId}
      `);
    }
  }

  /**
   * Handle 3DS / bank-authentication pending
   * Fires when Stripe cannot auto-confirm a PaymentIntent and needs
   * the customer to complete a challenge (3D Secure, bank redirect, etc.).
   * We stamp the DB row so the admin stuck-payment report picks it up,
   * and log it for observability.
   */
  private async handleRequiresAction(paymentIntent: Stripe.PaymentIntent) {
    const { userId, bookingIds } = paymentIntent.metadata;

    logger.warn(
      {
        paymentIntentId: paymentIntent.id,
        userId,
        bookingIds,
        nextAction: paymentIntent.next_action?.type,
      },
      '[WEBHOOK] payment_intent.requires_action — 3DS / bank challenge pending'
    );

    await db.execute(sql`
      UPDATE payment_intents
      SET status = 'requires_action'
      WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);
  }

  /**
   * Handle refund
   */
  private async handleRefund(charge: Stripe.Charge) {
    const paymentIntentId = charge.payment_intent as string;
    const refundAmount = charge.amount_refunded / 100;

    // Create refund record
    await db.execute(sql`
      INSERT INTO refunds (
        stripe_charge_id, stripe_payment_intent_id,
        amount, currency, status, created_at
      ) VALUES (${charge.id}, ${paymentIntentId}, ${refundAmount}, ${charge.currency}, 'completed', NOW())
    `);

    // TODO: Update booking status
    // TODO: Return inventory
  }

  /**
   * Create refund for a booking
   */
  async createRefund(bookingId: string, amount?: number, reason?: string) {
    try {
      // Get booking and payment intent
      const booking = await db.execute(sql`
        SELECT b.*, pi.stripe_payment_intent_id
        FROM bookings b
        JOIN payment_intents pi ON pi.user_id = b.user_id
        WHERE b.id = ${bookingId}
        LIMIT 1
      `);

      if (!booking.rows || booking.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const bookingRow = booking.rows[0] as any;
      const paymentIntentId = bookingRow.stripe_payment_intent_id;
      const refundAmount = amount || bookingRow.total_amount;

      // Create Stripe refund
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(refundAmount * 100),
        reason: reason as Stripe.RefundCreateParams.Reason || 'requested_by_customer',
        metadata: {
          bookingId,
        },
      });

      // Store refund in database
      const refundReason = reason || 'requested_by_customer';
      await db.execute(sql`
        INSERT INTO refunds (
          booking_id, stripe_refund_id, stripe_payment_intent_id,
          amount, currency, status, reason, created_at
        ) VALUES (${bookingId}, ${refund.id}, ${paymentIntentId}, ${refundAmount}, 'usd', ${refund.status}, ${refundReason}, NOW())
      `);

      // Update booking status
      await db.execute(sql`
        UPDATE bookings SET
          status = 'refunded',
          refunded_at = NOW()
        WHERE id = ${bookingId}
      `);

      return {
        refundId: refund.id,
        amount: refundAmount,
        status: refund.status,
      };
    } catch (error: any) {
      console.error('Refund creation error:', error);
      throw new Error(`Refund failed: ${error.message}`);
    }
  }

  /**
   * Refund a SERVICE booking (escrow Phase 4 / docs/design/escrow-spine.md).
   *
   * Unlike createRefund (which reads the legacy `bookings` table), this refunds against
   * service_bookings' OWN stripe_payment_intent_id + total_amount — the real booking rail where
   * disputes live. Amount is server-derived from the row (never client-supplied — §14).
   *
   * Idempotent (§15) on BOTH layers: (a) an atomic status claim (WHERE status <> 'refunded') so two
   * concurrent callers can't both proceed — reverted if the Stripe call then fails; (b) a
   * deterministic Stripe idempotencyKey so even a cross-process retry returns the same refund rather
   * than issuing a second one.
   */
  async refundServiceBooking(bookingId: string, reason?: string) {
    const rows = await db.execute(sql`
      SELECT id, total_amount, stripe_payment_intent_id, status, slot_id
      FROM service_bookings WHERE id = ${bookingId} LIMIT 1
    `);
    const row = rows.rows?.[0] as any;
    if (!row) throw new Error('Service booking not found');

    const amount = parseFloat(row.total_amount || '0');
    if (row.status === 'refunded') {
      return { alreadyRefunded: true, amount, status: 'refunded' as const };
    }
    const paymentIntentId = row.stripe_payment_intent_id;
    if (!paymentIntentId) throw new Error('Booking has no payment intent to refund');

    // Atomic claim: flip to 'refunded' only if it isn't already. A concurrent caller claims 0 rows.
    const claim = await db.execute(sql`
      UPDATE service_bookings SET status = 'refunded', updated_at = NOW()
      WHERE id = ${bookingId} AND status <> 'refunded'
      RETURNING id
    `);
    if (!claim.rows || claim.rows.length === 0) {
      return { alreadyRefunded: true, amount, status: 'refunded' as const };
    }

    const priorStatus = row.status;
    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: Math.round(amount * 100),
          reason: (reason as Stripe.RefundCreateParams.Reason) || 'requested_by_customer',
          metadata: { bookingId, source: 'service_booking' },
        },
        { idempotencyKey: `refund-sb-${bookingId}` },
      );
    } catch (err: any) {
      // Stripe failed — revert the optimistic status claim so a later retry can proceed cleanly.
      await db.execute(sql`UPDATE service_bookings SET status = ${priorStatus}, updated_at = NOW() WHERE id = ${bookingId}`);
      console.error('Service-booking refund error:', err);
      throw new Error(`Refund failed: ${err.message}`);
    }

    await db.execute(sql`
      INSERT INTO refunds (
        booking_id, stripe_refund_id, stripe_payment_intent_id,
        amount, currency, status, reason, created_at
      ) VALUES (${bookingId}, ${refund.id}, ${paymentIntentId}, ${amount}, 'usd', ${refund.status}, ${reason || 'requested_by_customer'}, NOW())
    `);

    // C3 filed follow-up: a refunded slot-bound booking gives its capacity back so another
    // traveler can book the time. Runs only under this refund's atomic status claim (the flip
    // above matched exactly one caller — §15), so a repeat refund cannot double-release; the
    // release itself floors at 0 and never un-blocks a provider-blocked slot. Best-effort:
    // the refund already succeeded, a release failure must not undo it.
    if (row.slot_id) {
      try {
        const { storage } = await import('../storage');
        await storage.releaseSlot(String(row.slot_id));
      } catch (releaseErr) {
        console.error(`[refund] slot release failed for booking ${bookingId} (non-critical):`, releaseErr);
      }
    }

    return { refundId: refund.id, amount, status: refund.status };
  }

  /**
   * Get payment intent status
   */
  async getPaymentIntentStatus(paymentIntentId: string) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      };
    } catch (error: any) {
      console.error('Error retrieving payment intent:', error);
      throw new Error(`Payment intent retrieval failed: ${error.message}`);
    }
  }
  /**
   * Create Payment Intent for Expert Review Service (for embedded checkout)
   */
  async createExpertServicePaymentIntent(
    userId: string,
    userEmail: string,
    variantId: number,
    comparisonId: number,
    destination: string,
    serviceType: 'review' | 'review_and_book' | 'full_concierge',
    amount: number,
    notes: string,
    currency: string = 'usd'
  ) {
    try {
      const serviceTitles = {
        review: 'Review Only',
        review_and_book: 'Review & Book',
        full_concierge: 'Full Concierge',
      };

      const supportedCurrencies = this.getSupportedCurrencies();
      const effectiveCurrency = supportedCurrencies.includes(currency.toLowerCase()) ? currency.toLowerCase() : 'usd';
      const isZeroDecimal = effectiveCurrency === 'jpy';
      const stripeAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: stripeAmount,
        currency: effectiveCurrency,
        metadata: {
          type: 'expert_service',
          userId,
          variantId: variantId.toString(),
          comparisonId: comparisonId.toString(),
          destination,
          serviceType,
          notes: notes.substring(0, 450),
        },
        description: `Expert ${serviceTitles[serviceType]} - ${destination}`,
        receipt_email: userEmail,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
      };
    } catch (error: any) {
      console.error('Expert payment intent error:', error);
      throw new Error(`Payment intent creation failed: ${error.message}`);
    }
  }

  /**
   * Create Stripe Checkout Session for Expert Review Service
   */
  async createExpertServiceCheckout(
    userId: string,
    userEmail: string,
    variantId: number,
    comparisonId: number,
    destination: string,
    serviceType: 'review' | 'review_and_book' | 'full_concierge',
    amount: number,
    notes: string,
    successUrl: string,
    cancelUrl: string,
    currency: string = 'usd'
  ) {
    try {
      const serviceTitles = {
        review: 'Review Only',
        review_and_book: 'Review & Book',
        full_concierge: 'Full Concierge',
      };

      const supportedCurrencies = this.getSupportedCurrencies();
      const effectiveCurrency = supportedCurrencies.includes(currency.toLowerCase()) ? currency.toLowerCase() : 'usd';
      const isZeroDecimal = effectiveCurrency === 'jpy';
      const unitAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: effectiveCurrency,
              product_data: {
                name: `Expert ${serviceTitles[serviceType]} - ${destination}`,
                description: `Travel expert service for your ${destination} trip`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'expert_service',
          userId,
          variantId: variantId.toString(),
          comparisonId: comparisonId.toString(),
          destination,
          serviceType,
          notes: notes.substring(0, 450), // Stripe metadata limit
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error: any) {
      console.error('Stripe checkout session error:', error);
      throw new Error(`Checkout session creation failed: ${error.message}`);
    }
  }

  /**
   * Handle successful expert service payment (called from webhook)
   */
  /** Retrieve a PaymentIntent for server-side verification; null on any error (treated as
   *  unverified by callers — the safe failure direction for a payment check). */
  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    try {
      return await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return null;
    }
  }

  async handleExpertServicePayment(session: Stripe.Checkout.Session) {
    try {
      const { userId, variantId, comparisonId, destination, serviceType, notes } = session.metadata || {};
      
      if (!userId || !variantId || !comparisonId) {
        console.error('Missing metadata in expert service session');
        return;
      }

      // Create the expert request now that payment is complete
      await db.execute(sql`
        INSERT INTO expert_requests (
          user_id, variant_id, comparison_id, destination,
          request_type, expert_fee, notes, status, payment_status,
          stripe_session_id, created_at
        ) VALUES (
          ${userId}, ${parseInt(variantId)}, ${parseInt(comparisonId)}, ${destination},
          ${serviceType}, ${(session.amount_total || 0) / 100}, ${notes || ''}, 'pending', 'paid',
          ${session.id}, NOW()
        )
      `);

      console.log(`Expert service payment completed for user ${userId}`);

      // F3 (revenue-model review): this fee was collected but never ledgered. Record it as 100%
      // platform revenue at capture (coordination-fee precedent — the reviewing expert is paid via
      // the earnings ledger when the work completes, split = filed decision). Idempotent on the
      // Stripe session id (§15 — checkout.session webhooks redeliver).
      try {
        const { revenueTrackingService } = await import("./revenue-tracking.service");
        await revenueTrackingService.recordRevenueEventOnce({
          sourceType: "expert_review_fee",
          sourceId: session.id,
          grossAmount: (session.amount_total || 0) / 100,
          description: `Expert ${serviceType} fee — ${destination}`,
          metadata: { userId, serviceType, destination },
        });
      } catch (revErr) {
        console.error("[expert-service] revenue record failed (non-fatal):", revErr);
      }

      // Fire-and-forget: T5 funnel event (expert requested after payment)
      try {
        await trackFunnelEvent({
          userId,
          eventType: "expert_requested",
          funnelStage: "T5",
          eventData: {
            variantId,
            comparisonId,
            destination,
            serviceType,
            stripeSessionId: session.id,
          },
        });
      } catch (_) {}
    } catch (error: any) {
      console.error('Error handling expert service payment:', error);
      throw error;
    }
  }
}

export const stripePaymentService = new StripePaymentService();
