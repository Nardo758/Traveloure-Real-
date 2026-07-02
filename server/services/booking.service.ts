/**
 * BookingService - Central booking orchestrator
 * Handles all booking types and coordinates with other services
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { stripePaymentService } from './stripe-payment.service';
import { availabilityService } from './availability.service';
import { pricingService } from './pricing.service';
import { affiliateService } from './affiliate.service';
import { sendBookingConfirmationEmail } from './email.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any,
});

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
    paymentMethod: 'full' | 'deposit' = 'full',
    bookingMetadata?: Record<string, any>
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
          paymentMethod,
          bookingMetadata
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
    paymentMethod: 'full' | 'deposit',
    bookingMetadata?: Record<string, any>
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

        // Get price — always read from DB when a real providerId is present.
        // Never trust the client-supplied price for real provider items.
        let finalPrice: number;
        if (item.providerId && item.providerId.trim().length > 0) {
          const dbPrice = await pricingService.getPrice(item.providerId, item.date, 1);
          if (item.price !== dbPrice) {
            console.warn(
              `[BookingService] Price mismatch for "${item.title}" (providerId=${item.providerId}): ` +
              `client sent ${item.price}, DB price is ${dbPrice}. Using DB price.`
            );
          }
          finalPrice = dbPrice;
        } else {
          finalPrice = item.price;
        }

        // Calculate fees
        const feeBreakdown = await pricingService.calculatePlatformFees(
          finalPrice,
          item.itemType
        );

        // Determine payment amount
        let depositAmount: number | null = null;
        let balanceAmount: number | null = null;

        if (paymentMethod === 'deposit') {
          depositAmount = await pricingService.calculateDeposit(finalPrice);
          balanceAmount = finalPrice + feeBreakdown.platformFee - depositAmount;
        }

        // Create booking in database — wrapped in a transaction so the
        // slot-existence check and the INSERT are atomic.  If a concurrent
        // request slips through the application-level check, the DB's partial
        // unique index on (expert_id, booking_date, booking_time) will reject
        // the second insert with Postgres error code 23505.
        const bookingTime = item.time || null;
        const totalAmountValue = finalPrice + feeBreakdown.platformFee;
        const providerPayout = finalPrice - feeBreakdown.providerDeduction;
        const bookingMetadataJson = bookingMetadata ? JSON.stringify(bookingMetadata) : '{}';
        const expertId: string | null = item.metadata?.expertId ?? null;

        const booking = await db.transaction(async (tx) => {
          // Application-level slot check INSIDE the transaction.
          // Only runs when we have all three coordinates for an expert slot.
          if (expertId && item.date && bookingTime) {
            const existing = await tx.execute(sql`
              SELECT id FROM bookings
              WHERE expert_id   = ${expertId}
                AND booking_date = ${item.date}
                AND booking_time = ${bookingTime}
              LIMIT 1
            `);
            if ((existing.rows?.length ?? 0) > 0) {
              const err = new Error('SLOT_ALREADY_BOOKED');
              (err as any).slotTaken = true;
              throw err;
            }
          }

          return tx.execute(sql`
            INSERT INTO bookings (
              user_id, trip_id, provider_id, expert_id, booking_type, status,
              title, booking_date, booking_time, travelers,
              service_amount, platform_fee, total_amount, provider_payout,
              payment_method, deposit_amount, balance_amount, booking_metadata, created_at
            ) VALUES (
              ${userId}, ${item.tripId}, ${item.providerId || null}, ${expertId}, ${'instant'}, ${'pending_payment'},
              ${item.title}, ${item.date}, ${bookingTime}, ${1},
              ${finalPrice}, ${feeBreakdown.platformFee}, ${totalAmountValue}, ${providerPayout},
              ${paymentMethod}, ${depositAmount}, ${balanceAmount}, ${bookingMetadataJson}::jsonb, NOW()
            ) RETURNING id
          `);
        });

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
        // Distinguish slot-taken (23505 unique violation or explicit SLOT_ALREADY_BOOKED)
        // from generic errors so the route layer can return 409 instead of 500.
        if (error.slotTaken || error.message === 'SLOT_ALREADY_BOOKED' || error.code === '23505') {
          errors.push(`SLOT_TAKEN:${item.title}`);
        } else {
          errors.push(`Error booking ${item.title}: ${error.message}`);
        }
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
        // Generate affiliate link — cart checkout is always user-initiated
        const affiliateLink = await affiliateService.generateLink(
          item.itemType,
          item.location,
          item.date,
          item.metadata,
          { initiatedBy: "user" }
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
   *
   * Security gates (in order):
   *  1. Stripe PaymentIntent must have status === 'succeeded'; reject 402 otherwise.
   *  2. Booking must exist; reject 404 otherwise.
   *  3. Booking's user_id must equal the requesting userId; reject 403 otherwise.
   *  4. Booking must still be in 'pending_payment' status — reject 409 if already confirmed
   *     (prevents re-confirmation of the same booking).
   *  5. PaymentIntent ID must not already be recorded on a different booking — reject 409 if so
   *     (prevents replay of the same pi_xxx across multiple bookings).
   */
  async confirmBookingPayment(
    bookingId: string,
    paymentIntentId: string,
    userId: string
  ): Promise<void> {
    // Gate 1: verify with Stripe that the PaymentIntent actually succeeded.
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (stripeErr: any) {
      const err = new Error(`Stripe lookup failed: ${stripeErr?.message ?? stripeErr}`);
      (err as any).code = 'STRIPE_LOOKUP_FAILED';
      throw err;
    }

    if (intent.status !== 'succeeded') {
      const err = new Error(
        `PaymentIntent ${paymentIntentId} has status "${intent.status}", not "succeeded"`
      );
      (err as any).code = 'PAYMENT_NOT_SUCCEEDED';
      throw err;
    }

    // Gate 2: load the booking row for all subsequent checks.
    const bookingRow = await db.execute(sql`
      SELECT user_id, status FROM bookings WHERE id = ${bookingId}
    `);

    if (!bookingRow.rows || bookingRow.rows.length === 0) {
      const err = new Error(`Booking ${bookingId} not found`);
      (err as any).code = 'BOOKING_NOT_FOUND';
      throw err;
    }

    const booking = bookingRow.rows[0] as { user_id: string; status: string };

    // Gate 3: verify the booking belongs to the requesting user.
    if (booking.user_id !== userId) {
      const err = new Error(`Booking ${bookingId} does not belong to user ${userId}`);
      (err as any).code = 'BOOKING_OWNERSHIP_MISMATCH';
      throw err;
    }

    // Gate 4: idempotency / double-confirmation guard.
    if (booking.status !== 'pending_payment') {
      const err = new Error(
        `Booking ${bookingId} is already in status "${booking.status}" — confirmation rejected`
      );
      (err as any).code = 'BOOKING_ALREADY_CONFIRMED';
      throw err;
    }

    // Gate 5: replay-attack guard — reject if this pi_xxx is already recorded on another booking.
    const replayCheck = await db.execute(sql`
      SELECT id FROM bookings
      WHERE stripe_payment_intent_id = ${paymentIntentId}
        AND id != ${bookingId}
      LIMIT 1
    `);

    if (replayCheck.rows && replayCheck.rows.length > 0) {
      const err = new Error(
        `PaymentIntent ${paymentIntentId} has already been used to confirm a different booking`
      );
      (err as any).code = 'PAYMENT_INTENT_ALREADY_USED';
      throw err;
    }

    const confirmationCode = this.generateConfirmationCode();

    await db.execute(sql`
      UPDATE bookings SET
        status = 'confirmed',
        payment_status = 'succeeded',
        confirmed_at = NOW(),
        confirmation_code = ${confirmationCode},
        deposit_paid = true,
        stripe_payment_intent_id = ${paymentIntentId}
      WHERE id = ${bookingId}
        AND status = 'pending_payment'
    `);

    // TODO: Update provider earnings
    // TODO: Decrease availability

    // Fire-and-forget confirmation email — must not block the caller
    db.execute(sql`
      SELECT b.title, b.booking_date, u.email, u.first_name, u.last_name
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.id = ${bookingId}
      LIMIT 1
    `).then(result => {
      const row = result?.rows?.[0] as any;
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
    }).catch(err =>
      console.error(`[email] failed to fetch booking details for confirmation email (booking ${bookingId}):`, err)
    );
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

  // ---------------------------------------------------------------------------
  // Expert Request — queue position + insert + expert notifications
  // ---------------------------------------------------------------------------

  async submitExpertRequest(params: {
    userId: string;
    tripId?: string;
    variantId?: string;
    comparisonId?: string;
    destination: string;
    requestType?: string;
    expertFee?: number;
    notes?: string;
    optimizationContext?: any;
  }): Promise<{ requestId: string; queuePosition: number }> {
    const {
      userId, tripId, variantId, comparisonId,
      destination, requestType, expertFee, notes, optimizationContext,
    } = params;

    // Prevent duplicate pending requests for the same trip
    if (tripId) {
      const existing = await db.execute(sql`
        SELECT id FROM expert_requests
        WHERE user_id = ${userId}
          AND trip_id = ${tripId}
          AND status IN ('queued', 'pending')
        LIMIT 1
      `);
      if (existing.rows && existing.rows.length > 0) {
        const err: any = new Error('A pending expert request already exists for this trip');
        err.code = 'DUPLICATE_REQUEST';
        err.requestId = (existing.rows[0] as any).id;
        throw err;
      }
    }

    // Calculate next queue position for this city
    const queueResult = await db.execute(sql`
      SELECT COALESCE(MAX(queue_position), 0) + 1 AS next_position
      FROM expert_requests
      WHERE destination_city = ${destination}
        AND status IN ('queued', 'assigned')
    `);
    const queuePosition = Number(queueResult.rows?.[0]?.next_position) || 1;

    const requestId = crypto.randomUUID();
    const optimizationContextJson = optimizationContext ? JSON.stringify(optimizationContext) : null;

    await db.execute(sql`
      INSERT INTO expert_requests (
        id, user_id, trip_id, variant_id, comparison_id, destination_city,
        request_type, expert_fee, status, queue_position, notes,
        optimization_context, created_at
      ) VALUES (
        ${requestId}, ${userId}, ${tripId || null}, ${variantId || null},
        ${comparisonId || null}, ${destination},
        ${requestType || 'polish'}, ${expertFee || null},
        'queued', ${queuePosition}, ${notes || null},
        ${optimizationContextJson}::jsonb, NOW()
      )
    `);

    // Notify matching experts — fire & forget
    this.notifyExpertsOfRequest(requestId, destination, requestType, queuePosition).catch(err =>
      console.error('[BookingService] Failed to notify experts of request:', err)
    );

    return { requestId, queuePosition };
  }

  private async notifyExpertsOfRequest(
    requestId: string,
    destination: string,
    requestType: string | undefined,
    queuePosition: number,
  ): Promise<void> {
    const { storage } = await import('../storage');
    const experts = await db.execute(sql`
      SELECT DISTINCT u.id, u.first_name, u.last_name
      FROM users u
      JOIN expert_service_categories esc ON u.id = esc.expert_id
      WHERE u.role = 'expert' AND u.status = 'verified'
        AND LOWER(esc.destination) LIKE LOWER(${'%' + destination + '%'})
      LIMIT 10
    `);
    for (const expert of experts.rows || []) {
      await storage.createNotification({
        userId: (expert as any).id,
        type: 'expert_request',
        title: 'New Expert Request',
        message: `New ${requestType || 'polish'} request for ${destination} — you are #${queuePosition} in queue.`,
        relatedId: requestId,
        relatedType: 'expert_request',
        data: { requestId, destination, queuePosition, requestType },
      }).catch(err => console.error(`[BookingService] Failed to notify expert ${(expert as any).id}:`, err));
    }
  }

  // ---------------------------------------------------------------------------
  // Convert Saved Trip → active Trip record (planning status)
  // ---------------------------------------------------------------------------

  async convertSavedTrip(savedTripId: string, userId: string): Promise<{ tripId: string }> {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(savedTripId)) {
      const err: any = new Error('Saved trip not found or already converted');
      err.status = 404;
      throw err;
    }

    const savedResult = await db.execute(sql`
      SELECT st.*, ic.destination, ic.start_date, ic.end_date, ic.travelers, ic.budget
      FROM saved_trips st
      LEFT JOIN itinerary_comparisons ic ON ic.id = st.comparison_id
      WHERE st.id = ${savedTripId}
        AND st.user_id = ${userId}
        AND st.status = 'active'
    `);

    if (!savedResult.rows || savedResult.rows.length === 0) {
      const err: any = new Error('Saved trip not found or already converted');
      err.status = 404;
      throw err;
    }

    const saved = savedResult.rows[0] as any;

    // Atomic status flip — prevents duplicate conversions under concurrent requests
    const markResult = await db.execute(sql`
      UPDATE saved_trips
      SET status = 'converted'
      WHERE id = ${savedTripId}
        AND user_id = ${userId}
        AND status = 'active'
      RETURNING id
    `);

    if (!markResult.rows || markResult.rows.length === 0) {
      const err: any = new Error('Already converted or not eligible');
      err.status = 409;
      throw err;
    }

    const destination = saved.destination || 'My Destination';
    const startDate = saved.start_date || new Date().toISOString().split('T')[0];
    const endDate = saved.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const travelers = saved.travelers || 1;
    const budget = saved.budget || null;
    const tripId = crypto.randomUUID();

    await db.execute(sql`
      INSERT INTO trips (
        id, user_id, title, destination, start_date, end_date,
        number_of_travelers, budget, status, created_at, updated_at
      ) VALUES (
        ${tripId}, ${userId}, ${`Trip to ${destination}`}, ${destination},
        ${startDate}, ${endDate}, ${travelers}, ${budget},
        'planning', NOW(), NOW()
      )
    `);

    return { tripId };
  }
}

export const bookingService = new BookingService();
