/**
 * BookingService - Central booking orchestrator
 * Handles all booking types and coordinates with other services
 */

import { db } from '../db';
import { stripePaymentService } from './stripe-payment.service';
import { availabilityService } from './availability.service';
import { pricingService } from './pricing.service';
import { affiliateService } from './affiliate.service';

export interface CartItem {
  id: string;
  tripId: string;
  providerId?: string;
  title: string;
  itemType: string;
  bookingType: 'instant' | 'request' | 'external';
  date: string;
  time?: string;
  price: number;
  location: string;
  metadata?: any;
  externalUrl?: string;
  affiliatePartner?: string;
}

export interface ProcessCartResult {
  instantBookings: any[];
  pendingRequests: any[];
  externalLinks: any[];
  paymentRequired: number;
  paymentIntent?: any;
  errors: string[];
}

class BookingService {
  /**
   * Process entire cart with mixed booking types
   */
  async processCart(
    userId: string,
    cartItems: CartItem[],
    paymentMethod: 'full' | 'deposit' = 'full'
  ): Promise<ProcessCartResult> {
    const results: ProcessCartResult = {
      instantBookings: [],
      pendingRequests: [],
      externalLinks: [],
      paymentRequired: 0,
      paymentIntent: undefined,
      errors: [],
    };

    // Separate items by booking type
    const instantItems = cartItems.filter(item => item.bookingType === 'instant');
    const requestItems = cartItems.filter(item => item.bookingType === 'request');
    const externalItems = cartItems.filter(item => item.bookingType === 'external');

    // Process instant bookings
    if (instantItems.length > 0) {
      try {
        const instantResult = await this.processInstantBookings(
          userId,
          instantItems,
          paymentMethod
        );
        results.instantBookings = instantResult.bookings;
        results.paymentRequired = instantResult.totalAmount;
        results.paymentIntent = instantResult.paymentIntent;
        results.errors.push(...instantResult.errors);
      } catch (error: any) {
        results.errors.push(`Instant booking error: ${error.message}`);
      }
    }

    // Submit booking requests
    if (requestItems.length > 0) {
      try {
        const requestResult = await this.submitBookingRequests(userId, requestItems);
        results.pendingRequests = requestResult.requests;
        results.errors.push(...requestResult.errors);
      } catch (error: any) {
        results.errors.push(`Booking request error: ${error.message}`);
      }
    }

    // Generate external links
    if (externalItems.length > 0) {
      const externalResult = await this.generateExternalLinks(externalItems);
      results.externalLinks = externalResult.links;
    }

    return results;
  }

  /**
   * Process instant-book items
   */
  private async processInstantBookings(
    userId: string,
    cartItems: CartItem[],
    paymentMethod: 'full' | 'deposit'
  ) {
    const bookings: any[] = [];
    let totalAmount = 0;
    const errors: string[] = [];

    for (const item of cartItems) {
      try {
        // Skip availability check if no provider (AI-generated items)
        if (item.providerId) {
          const available = await availabilityService.checkAvailability(
            item.providerId,
            item.date,
            item.time || '09:00'
          );

          if (!available) {
            errors.push(`${item.title} is no longer available`);
            continue;
          }
        }

        // Get price - use item price if no provider
        const finalPrice = item.providerId 
          ? await pricingService.getPrice(item.providerId, item.date, 1)
          : item.price;

        // Calculate fees
        const feeBreakdown = pricingService.calculatePlatformFees(
          finalPrice,
          item.itemType
        );

        // Determine payment amount
        let depositAmount: number | null = null;
        let balanceAmount: number | null = null;

        if (paymentMethod === 'deposit') {
          depositAmount = pricingService.calculateDeposit(finalPrice);
          balanceAmount = finalPrice + feeBreakdown.platformFee - depositAmount;
        }

        // Create booking in database
        const booking = await db.execute(
          `INSERT INTO bookings (
            user_id, trip_id, provider_id, booking_type, status,
            title, booking_date, booking_time, travelers,
            service_amount, platform_fee, total_amount, provider_payout,
            payment_method, deposit_amount, balance_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            userId,
            item.tripId,
            item.providerId,
            'instant',
            'pending_payment',
            item.title,
            item.date,
            item.time || null,
            1, // travelers
            finalPrice,
            feeBreakdown.platformFee,
            finalPrice + feeBreakdown.platformFee,
            finalPrice - feeBreakdown.providerDeduction,
            paymentMethod,
            depositAmount,
            balanceAmount,
          ]
        );

        bookings.push({
          id: booking.lastInsertRowid,
          ...item,
          serviceAmount: finalPrice,
          totalAmount: finalPrice + feeBreakdown.platformFee,
          status: 'pending_payment',
        });

        // Add to payment total
        totalAmount += depositAmount || (finalPrice + feeBreakdown.platformFee);
      } catch (error: any) {
        errors.push(`Error booking ${item.title}: ${error.message}`);
      }
    }

    // Create payment intent
    let paymentIntent;
    if (bookings.length > 0 && totalAmount > 0) {
      try {
        paymentIntent = await stripePaymentService.createPaymentIntent(
          userId,
          bookings,
          totalAmount,
          paymentMethod === 'deposit'
        );
      } catch (error: any) {
        errors.push(`Payment intent creation failed: ${error.message}`);
      }
    }

    return {
      bookings,
      totalAmount,
      paymentIntent,
      errors,
    };
  }

  /**
   * Submit booking requests to providers
   */
  private async submitBookingRequests(userId: string, cartItems: CartItem[]) {
    const requests: any[] = [];
    const errors: string[] = [];

    for (const item of cartItems) {
      try {
        // Create booking request
        const result = await db.execute(
          `INSERT INTO booking_requests (
            user_id, provider_id, trip_id, status,
            requested_date, requested_time, travelers,
            title, item_type, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+48 hours'))`,
          [
            userId,
            item.providerId,
            item.tripId,
            'pending_provider',
            item.date,
            item.time || null,
            1, // travelers
            item.title,
            item.itemType,
          ]
        );

        requests.push({
          id: result.lastInsertRowid,
          ...item,
          status: 'pending_provider',
        });

        // TODO: Send notification to provider
      } catch (error: any) {
        errors.push(`Error submitting request for ${item.title}: ${error.message}`);
      }
    }

    return { requests, errors };
  }

  /**
   * Generate affiliate links for external bookings
   */
  private async generateExternalLinks(cartItems: CartItem[]) {
    const links: any[] = [];

    for (const item of cartItems) {
      if (item.externalUrl) {
        links.push({
          tripItemId: item.id,
          title: item.title,
          url: item.externalUrl,
          partner: item.affiliatePartner,
        });
      } else {
        // Generate affiliate link
        const affiliateLink = await affiliateService.generateLink(
          item.itemType,
          item.location,
          item.date,
          item.metadata
        );

        if (affiliateLink) {
          links.push({
            tripItemId: item.id,
            title: item.title,
            url: affiliateLink.url,
            partner: affiliateLink.partner,
          });
        }
      }
    }

    return { links };
  }

  /**
   * Confirm booking after successful payment
   */
  async confirmBookingPayment(bookingId: string, paymentIntentId: string): Promise<boolean> {
    try {
      const confirmationCode = this.generateConfirmationCode();

      await db.execute(
        `UPDATE bookings SET
          status = 'confirmed',
          payment_status = 'succeeded',
          confirmed_at = datetime('now'),
          confirmation_code = ?,
          deposit_paid = 1
        WHERE id = ?`,
        [confirmationCode, bookingId]
      );

      // TODO: Update provider earnings
      // TODO: Decrease availability
      // TODO: Send notifications

      return true;
    } catch (error) {
      console.error('Error confirming booking:', error);
      return false;
    }
  }

  /**
   * Generate unique confirmation code
   */
  private generateConfirmationCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'TRV';
    for (let i = 0; i < 10; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

export const bookingService = new BookingService();
