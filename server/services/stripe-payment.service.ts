/**
 * Stripe Payment Service
 * Handles Stripe payment intents, webhooks, and refunds
 */

import Stripe from 'stripe';
import { db } from '../db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
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
      const user = await db.execute(
        'SELECT email, username FROM users WHERE id = ?',
        [userId]
      );

      if (!user.rows || user.rows.length === 0) {
        throw new Error('User not found');
      }

      const userEmail = user.rows[0].email || `user${userId}@traveloure.com`;

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          userId,
          bookingIds: bookings.map(b => b.id).join(','),
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
      await db.execute(
        `INSERT INTO payment_intents (
          stripe_payment_intent_id, user_id, amount, currency,
          status, is_deposit, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          paymentIntent.id,
          userId,
          amount,
          'usd',
          paymentIntent.status,
          isDeposit ? 1 : 0,
          JSON.stringify(paymentIntent.metadata),
        ]
      );

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
    await db.execute(
      `UPDATE payment_intents SET status = 'succeeded' WHERE stripe_payment_intent_id = ?`,
      [paymentIntent.id]
    );

    // Update bookings
    const bookingIdList = bookingIds.split(',');
    for (const bookingId of bookingIdList) {
      await db.execute(
        `UPDATE bookings SET
          status = 'confirmed',
          payment_status = 'succeeded',
          confirmed_at = datetime('now'),
          ${isDeposit === 'true' ? 'deposit_paid = 1' : 'deposit_paid = 1, balance_paid = 1'}
        WHERE id = ?`,
        [bookingId]
      );

      // TODO: Notify user and provider
      // TODO: Update provider earnings
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const { bookingIds } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(
      `UPDATE payment_intents SET status = 'failed' WHERE stripe_payment_intent_id = ?`,
      [paymentIntent.id]
    );

    // Update bookings
    const bookingIdList = bookingIds.split(',');
    for (const bookingId of bookingIdList) {
      await db.execute(
        `UPDATE bookings SET
          status = 'payment_failed',
          payment_status = 'failed'
        WHERE id = ?`,
        [bookingId]
      );
    }

    // TODO: Notify user of payment failure
  }

  /**
   * Handle canceled payment
   */
  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent) {
    const { bookingIds } = paymentIntent.metadata;

    // Update payment intent status
    await db.execute(
      `UPDATE payment_intents SET status = 'canceled' WHERE stripe_payment_intent_id = ?`,
      [paymentIntent.id]
    );

    // Update bookings
    const bookingIdList = bookingIds.split(',');
    for (const bookingId of bookingIdList) {
      await db.execute(
        `UPDATE bookings SET
          status = 'canceled',
          payment_status = 'canceled'
        WHERE id = ?`,
        [bookingId]
      );
    }
  }

  /**
   * Handle refund
   */
  private async handleRefund(charge: Stripe.Charge) {
    const paymentIntentId = charge.payment_intent as string;

    // Create refund record
    await db.execute(
      `INSERT INTO refunds (
        stripe_charge_id, stripe_payment_intent_id,
        amount, currency, status, created_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        charge.id,
        paymentIntentId,
        charge.amount_refunded / 100,
        charge.currency,
        'completed',
      ]
    );

    // TODO: Update booking status
    // TODO: Return inventory
  }

  /**
   * Create refund for a booking
   */
  async createRefund(bookingId: string, amount?: number, reason?: string) {
    try {
      // Get booking and payment intent
      const booking = await db.execute(
        `SELECT b.*, pi.stripe_payment_intent_id
        FROM bookings b
        JOIN payment_intents pi ON pi.user_id = b.user_id
        WHERE b.id = ?
        LIMIT 1`,
        [bookingId]
      );

      if (!booking.rows || booking.rows.length === 0) {
        throw new Error('Booking not found');
      }

      const paymentIntentId = booking.rows[0].stripe_payment_intent_id;
      const refundAmount = amount || booking.rows[0].total_amount;

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
      await db.execute(
        `INSERT INTO refunds (
          booking_id, stripe_refund_id, stripe_payment_intent_id,
          amount, currency, status, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          bookingId,
          refund.id,
          paymentIntentId,
          refundAmount,
          'usd',
          refund.status,
          reason || 'requested_by_customer',
        ]
      );

      // Update booking status
      await db.execute(
        `UPDATE bookings SET
          status = 'refunded',
          refunded_at = datetime('now')
        WHERE id = ?`,
        [bookingId]
      );

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
}

export const stripePaymentService = new StripePaymentService();
