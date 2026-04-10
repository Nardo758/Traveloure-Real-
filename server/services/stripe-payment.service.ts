/**
 * Stripe Payment Service
 * Handles Stripe payment intents, webhooks, and refunds
 */

import Stripe from 'stripe';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { handleStripePaymentSuccess } from './stripe.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any,
});

class StripePaymentService {
  /**
   * Create payment intent for bookings
   */
  async createPaymentIntent(
    userId: string,
    bookings: any[],
    amount: number,
    isDeposit: boolean = false
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

      // Create payment intent
      // Stripe metadata values have 500 char limit, so truncate booking IDs if needed
      const allBookingIds = bookings.map(b => b.id).join(',');
      const truncatedBookingIds = allBookingIds.length > 490 
        ? allBookingIds.substring(0, 490) + '...' 
        : allBookingIds;
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
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
      });

      // Store payment intent in database
      const metadataJson = JSON.stringify(paymentIntent.metadata);
      await db.execute(sql`
        INSERT INTO payment_intents (
          stripe_payment_intent_id, user_id, amount, currency,
          status, is_deposit, metadata, created_at
        ) VALUES (${paymentIntent.id}, ${userId}, ${amount}, 'usd', ${paymentIntent.status}, ${isDeposit}, ${metadataJson}, NOW())
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
   * Handle successful payment
   */
  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const { userId, bookingIds, isDeposit } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(sql`
      UPDATE payment_intents SET status = 'succeeded' WHERE stripe_payment_intent_id = ${paymentIntent.id}
    `);

    // Update platform bookings
    if (bookingIds) {
      const bookingIdList = bookingIds.split(',').filter(id => id.trim());
      for (const bookingId of bookingIdList) {
        if (isDeposit === 'true') {
          await db.execute(sql`
            UPDATE bookings SET
              status = 'confirmed',
              payment_status = 'succeeded',
              confirmed_at = NOW(),
              deposit_paid = true
            WHERE id = ${bookingId.trim()}
          `);
        } else {
          await db.execute(sql`
            UPDATE bookings SET
              status = 'confirmed',
              payment_status = 'succeeded',
              confirmed_at = NOW(),
              deposit_paid = true,
              balance_paid = true
            WHERE id = ${bookingId.trim()}
          `);
        }
      }
    }

    // Confirm any activity bookings linked to this payment intent
    await db.execute(sql`
      UPDATE activity_bookings
      SET status = 'confirmed'
      WHERE stripe_payment_intent_id = ${paymentIntent.id}
        AND status IN ('pending', 'staged')
    `);
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

    // Update platform bookings
    if (bookingIds) {
      const bookingIdList = bookingIds.split(',').filter(id => id.trim());
      for (const bookingId of bookingIdList) {
        await db.execute(sql`
          UPDATE bookings SET
            status = 'payment_failed',
            payment_status = 'failed'
          WHERE id = ${bookingId.trim()}
        `);
      }
    }

    // Mark any linked activity bookings as failed
    await db.execute(sql`
      UPDATE activity_bookings SET status = 'failed'
      WHERE stripe_payment_intent_id = ${paymentIntent.id}
        AND status IN ('pending', 'staged')
    `);
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

    // Update platform bookings
    if (bookingIds) {
      const bookingIdList = bookingIds.split(',').filter(id => id.trim());
      for (const bookingId of bookingIdList) {
        await db.execute(sql`
          UPDATE bookings SET
            status = 'canceled',
            payment_status = 'canceled'
          WHERE id = ${bookingId.trim()}
        `);
      }
    }

    // Mark any linked activity bookings as cancelled
    await db.execute(sql`
      UPDATE activity_bookings SET status = 'cancelled'
      WHERE stripe_payment_intent_id = ${paymentIntent.id}
        AND status IN ('pending', 'staged')
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
    notes: string
  ) {
    try {
      const serviceTitles = {
        review: 'Review Only',
        review_and_book: 'Review & Book',
        full_concierge: 'Full Concierge',
      };

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
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
    cancelUrl: string
  ) {
    try {
      const serviceTitles = {
        review: 'Review Only',
        review_and_book: 'Review & Book',
        full_concierge: 'Full Concierge',
      };

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Expert ${serviceTitles[serviceType]} - ${destination}`,
                description: `Travel expert service for your ${destination} trip`,
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
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
    } catch (error: any) {
      console.error('Error handling expert service payment:', error);
      throw error;
    }
  }
}

export const stripePaymentService = new StripePaymentService();
