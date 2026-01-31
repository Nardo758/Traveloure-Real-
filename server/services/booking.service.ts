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
   * Confirm booking after successful payment
   */
  async confirmBookingPayment(bookingId: string, paymentIntentId: string): Promise<boolean> {
    try {
      const confirmationCode = this.generateConfirmationCode();

      await db.execute(sql`
        UPDATE bookings SET
          status = 'confirmed',
          payment_status = 'succeeded',
          confirmed_at = NOW(),
          confirmation_code = ${confirmationCode},
          deposit_paid = true
        WHERE id = ${bookingId}
      `);

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
