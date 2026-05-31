/**
 * BookingService - Central booking orchestrator
 * Handles all booking types and coordinates with other services
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
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
   * Generate a UUID for new trips
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Validate that a tripId exists in the database
   */
  private async tripExists(tripId: string): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        SELECT id FROM trips WHERE id = ${tripId} LIMIT 1
      `);
      return (result.rows?.length || 0) > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a trip record for booking items that don't have one
   */
  private async createTripForBooking(
    userId: string,
    cartItems: CartItem[]
  ): Promise<string> {
    if (!cartItems || cartItems.length === 0) {
      throw new Error('Cannot create trip for empty cart');
    }
    
    const firstItem = cartItems[0];
    const destination = firstItem?.location || 'Unknown Destination';
    const today = new Date().toISOString().split('T')[0];
    const startDate = firstItem?.date || today;
    
    // Calculate end date from last item or default to start date
    const dates = cartItems.map(item => item.date).filter(Boolean).sort();
    const endDate = dates[dates.length - 1] || startDate;
    
    // Use UUID format for consistency with the rest of the application
    const tripId = this.generateUUID();
    
    await db.execute(sql`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, created_at)
      VALUES (${tripId}, ${userId}, ${'AI Generated Trip'}, ${destination}, ${startDate}::date, ${endDate}::date, 'draft', NOW())
    `);
    
    console.log(`Created trip ${tripId} for ${cartItems.length} booking items`);
    return tripId;
  }

  /**
   * Validate multiple tripIds using individual queries
   */
  private async getValidTripIds(tripIds: string[]): Promise<Set<string>> {
    if (tripIds.length === 0) {
      return new Set();
    }
    
    const validIds = new Set<string>();
    
    // Check each tripId individually (trade-off: multiple queries but simpler and safer)
    for (const tripId of tripIds) {
      if (await this.tripExists(tripId)) {
        validIds.add(tripId);
      }
    }
    
    return validIds;
  }

  /**
   * Ensure all cart items have valid tripIds, creating trips as needed
   */
  private async ensureValidTripIds(
    userId: string,
    cartItems: CartItem[]
  ): Promise<CartItem[]> {
    if (!cartItems || cartItems.length === 0) {
      return cartItems;
    }

    // Collect all unique tripIds that need validation
    const tripIdsToValidate: string[] = [];
    for (const item of cartItems) {
      if (item.tripId && item.tripId.trim() !== '') {
        if (!tripIdsToValidate.includes(item.tripId)) {
          tripIdsToValidate.push(item.tripId);
        }
      }
    }

    // Validate existing tripIds in a single query
    const validTripIds = await this.getValidTripIds(tripIdsToValidate);
    
    // Determine which tripIds are invalid
    const invalidTripIds = new Set<string>();
    for (const tripId of tripIdsToValidate) {
      if (!validTripIds.has(tripId)) {
        console.log(`TripId ${tripId} does not exist in database`);
        invalidTripIds.add(tripId);
      }
    }

    // If no items need a trip created, return as-is
    const itemsNeedTrip = cartItems.some(item => 
      !item.tripId || 
      item.tripId.trim() === '' || 
      invalidTripIds.has(item.tripId)
    );

    if (!itemsNeedTrip) {
      return cartItems;
    }

    // Create a new trip for items with missing/invalid tripIds
    const newTripId = await this.createTripForBooking(userId, cartItems);
    
    // Update items that need a valid tripId
    return cartItems.map(item => ({
      ...item,
      tripId: (!item.tripId || item.tripId.trim() === '' || invalidTripIds.has(item.tripId)) 
        ? newTripId 
        : item.tripId
    }));
  }

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

    // Guard against empty cart
    if (!cartItems || cartItems.length === 0) {
      results.errors.push('Cart is empty');
      return results;
    }

    // Ensure all items have valid tripIds (validates existing ones, creates new trip if needed)
    try {
      cartItems = await this.ensureValidTripIds(userId, cartItems);
    } catch (error: any) {
      console.error('Error ensuring valid trip IDs:', error);
      results.errors.push(`Failed to validate/create trip: ${error.message}`);
      return results;
    }

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
        console.log(`Processing item: ${item.title}, providerId: ${item.providerId}, bookingType: ${item.bookingType}`);
        
        // Skip availability check if no provider (AI-generated items)
        // Only check if we have a real provider ID (not null, undefined, or empty)
        if (item.providerId && item.providerId.trim().length > 0) {
          try {
            const available = await availabilityService.checkAvailability(
              item.providerId,
              item.date,
              item.time || '09:00'
            );

            if (!available) {
              errors.push(`${item.title} is no longer available`);
              continue;
            }
          } catch (availErr) {
            // Provider doesn't exist - treat as AI-generated
            console.log(`Provider ${item.providerId} not found, treating as AI-generated`);
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
        const bookingTime = item.time || null;
        const totalAmountValue = finalPrice + feeBreakdown.platformFee;
        const providerPayout = finalPrice - feeBreakdown.providerDeduction;
        
        const booking = await db.execute(sql`
          INSERT INTO bookings (
            user_id, trip_id, provider_id, booking_type, status,
            title, booking_date, booking_time, travelers,
            service_amount, platform_fee, total_amount, provider_payout,
            payment_method, deposit_amount, balance_amount, created_at
          ) VALUES (
            ${userId}, ${item.tripId}, ${item.providerId || null}, ${'instant'}, ${'pending_payment'},
            ${item.title}, ${item.date}, ${bookingTime}, ${1},
            ${finalPrice}, ${feeBreakdown.platformFee}, ${totalAmountValue}, ${providerPayout},
            ${paymentMethod}, ${depositAmount}, ${balanceAmount}, NOW()
          ) RETURNING id
        `);

        const insertedBooking = booking.rows?.[0] as { id: string } | undefined;
        const { id: _itemId, ...itemWithoutId } = item;
        bookings.push({
          ...itemWithoutId,
          id: insertedBooking?.id,
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
        const requestedTime = item.time || null;
        const result = await db.execute(sql`
          INSERT INTO booking_requests (
            user_id, provider_id, trip_id, status,
            requested_date, requested_time, travelers,
            title, item_type, created_at, expires_at
          ) VALUES (
            ${userId}, ${item.providerId || null}, ${item.tripId}, ${'pending_provider'},
            ${item.date}, ${requestedTime}, ${1},
            ${item.title}, ${item.itemType}, NOW(), NOW() + INTERVAL '48 hours'
          ) RETURNING id
        `);

        const insertedRequest = result.rows?.[0] as { id: string } | undefined;
        const { id: _reqItemId, ...reqItemWithoutId } = item;
        requests.push({
          ...reqItemWithoutId,
          id: insertedRequest?.id,
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
   * Confirm booking after successful payment.
   * Verifies the Stripe payment intent has succeeded and belongs to the requesting user,
   * and that the booking is owned by that user, before marking it confirmed.
   */
  async confirmBookingPayment(bookingId: string, paymentIntentId: string, userId: string): Promise<boolean> {
    try {
      // 1. Verify booking ownership — prevents cross-account confirmation
      const ownerRows = await db.execute(sql`
        SELECT id FROM bookings WHERE id = ${bookingId} AND user_id = ${userId} LIMIT 1
      `);
      if (!ownerRows.rows || ownerRows.rows.length === 0) {
        throw new Error('Booking not found or does not belong to this user');
      }

      // 2. Verify the Stripe payment intent actually succeeded
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia' as any,
      });

      let intent;
      try {
        intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      } catch (stripeErr: any) {
        throw new Error(`Could not verify payment: ${stripeErr.message}`);
      }

      if (intent.status !== 'succeeded') {
        throw new Error(`Payment not completed. Stripe status: ${intent.status}`);
      }

      // 3. Verify the payment intent is tied to this user (metadata set at creation time)
      if (intent.metadata?.userId && intent.metadata.userId !== userId) {
        throw new Error('Payment intent does not belong to this user');
      }

      // 4. Mandatory PI-booking binding — the payment intent must be explicitly linked to
      //    this booking ID. No amount-only fallback; a reused PI from another flow is rejected.
      {
        let bound = false;

        // Primary: check Stripe metadata (set by createPaymentIntent)
        if (intent.metadata?.bookingIds) {
          const metaBookingIds = intent.metadata.bookingIds.split(',').map((s: string) => s.trim());
          if (metaBookingIds.includes(bookingId)) {
            bound = true;
          }
        }

        // Secondary: check internal payment_intents table metadata (same source of truth)
        if (!bound) {
          const piDbRows = await db.execute(sql`
            SELECT metadata FROM payment_intents
            WHERE stripe_payment_intent_id = ${paymentIntentId}
              AND user_id = ${userId}
            LIMIT 1
          `);
          if (piDbRows.rows.length > 0) {
            const metaStr = (piDbRows.rows[0] as any).metadata;
            try {
              const meta = typeof metaStr === 'string' ? JSON.parse(metaStr) : metaStr;
              if (meta?.bookingIds) {
                const dbBookingIds = String(meta.bookingIds).split(',').map((s: string) => s.trim());
                if (dbBookingIds.includes(bookingId)) {
                  bound = true;
                }
              }
            } catch {
              // JSON parse failure — treat as unbound
            }
          }
        }

        if (!bound) {
          throw new Error('Payment intent is not linked to this booking. Payment confirmation rejected.');
        }
      }

      // 5. Anti-replay: ensure *this specific booking* has not already been confirmed
      //    (a single PI may legitimately cover multiple bookings, so we scope the check
      //    to the booking row itself — not to all bookings sharing this PI)
      const alreadyConfirmed = await db.execute(sql`
        SELECT status FROM bookings
        WHERE id = ${bookingId} AND status = 'confirmed'
        LIMIT 1
      `);
      if (alreadyConfirmed.rows && alreadyConfirmed.rows.length > 0) {
        throw new Error('This booking has already been confirmed');
      }

      // 6. Verify the PI amount covers the booking total (prevents partial-payment abuse)
      const bookingAmountRows = await db.execute(sql`
        SELECT total_amount FROM bookings WHERE id = ${bookingId} AND user_id = ${userId} LIMIT 1
      `);
      if (bookingAmountRows.rows.length > 0) {
        const expectedTotal = parseFloat(String((bookingAmountRows.rows[0] as any).total_amount || 0));
        if (expectedTotal > 0) {
          const paidAmountUsd = intent.amount / 100;
          // Allow 5% tolerance to absorb platform-fee rounding differences
          if (paidAmountUsd < expectedTotal * 0.95) {
            throw new Error(
              `Payment amount ($${paidAmountUsd.toFixed(2)}) is less than booking total ($${expectedTotal.toFixed(2)})`
            );
          }
        }
      }

      const confirmationCode = this.generateConfirmationCode();

      // Store stripe_payment_intent_id on the booking row for anti-replay and audit
      await db.execute(sql`
        UPDATE bookings SET
          status = 'confirmed',
          payment_status = 'succeeded',
          confirmed_at = NOW(),
          confirmation_code = ${confirmationCode},
          deposit_paid = true,
          stripe_payment_intent_id = ${paymentIntentId}
        WHERE id = ${bookingId} AND user_id = ${userId}
      `);

      // TODO: Update provider earnings
      // TODO: Decrease availability

      // Send confirmation email (non-blocking — failure does not roll back the booking)
      this.sendConfirmationEmail(bookingId, confirmationCode).catch((err) =>
        console.warn('[BookingService] Confirmation email failed (non-fatal):', err)
      );

      return true;
    } catch (error) {
      console.error('Error confirming booking:', error);
      return false;
    }
  }

  /**
   * Look up booking + user and dispatch a confirmation email via emailService.
   * Separated so payment confirmation is never blocked by email delivery.
   */
  async sendConfirmationEmail(bookingId: string, confirmationCode?: string): Promise<void> {
    const { emailService } = await import('./email.service');

    const row = await db.execute(sql`
      SELECT
        b.id, b.confirmation_code, b.total_amount, b.currency,
        b.created_at AS booking_date,
        u.email AS user_email,
        u.first_name, u.last_name,
        sp.name AS service_name
      FROM bookings b
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN service_providers sp ON sp.id = b.service_provider_id
      WHERE b.id = ${bookingId}
      LIMIT 1
    `);

    const booking = row.rows?.[0] as any;
    if (!booking?.user_email) return;

    await emailService.sendBookingConfirmation({
      to: booking.user_email,
      guestName: [booking.first_name, booking.last_name].filter(Boolean).join(' ') || 'Traveller',
      bookingId,
      confirmationCode: confirmationCode ?? booking.confirmation_code ?? bookingId,
      serviceName: booking.service_name ?? 'Your Booking',
      bookingDate: booking.booking_date,
      totalAmount: booking.total_amount ? Number(booking.total_amount) : null,
      currency: booking.currency ?? 'USD',
    });
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
