/**
 * Stripe Service
 *
 * Handles Stripe payment processing for platform transport bookings
 * - Creating checkout sessions
 * - Handling payment confirmations
 * - Managing booking completion
 */

import Stripe from "stripe";
import { db } from "../db";
import { transportBookingOptions, serviceBookings } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia" as any,
});

export function getBaseUrl(): string {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    return `https://${replitDomains.split(",")[0].trim()}`;
  }
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }
  return "http://localhost:5173";
}

export interface BookingCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
  bookingId: string;
}

/**
 * Creates a Stripe checkout session for a transport booking
 */
export async function createTransportBookingCheckout(
  optionId: string,
  tripId: string,
  userId: string,
  travelers: number = 1,
  specialRequests?: string
): Promise<BookingCheckoutSession> {
  // Fetch the booking option
  const option = await db.query.transportBookingOptions.findFirst({
    where: eq(transportBookingOptions.id, optionId),
  });

  if (!option) {
    throw new Error(`Booking option ${optionId} not found`);
  }

  if (option.bookingType !== "platform") {
    throw new Error("Not a platform booking option");
  }

  // Fetch user email for Stripe checkout
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const userEmail = user?.email || undefined;

  // Calculate line items for Stripe
  const priceCents = option.priceCentsLow || 0;
  const totalAmount = priceCents * travelers;

  // Create a service booking record first
  const bookingId = `booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(serviceBookings).values({
    id: bookingId,
    userId,
    serviceProviderId: option.providerId || undefined,
    bookingType: "transport",
    status: "pending",
    bookingDate: new Date(),
    totalAmount: totalAmount / 100, // Convert to dollars
    currency: option.currency || "USD",
    metadata: {
      tripId,
      optionId,
      travelers,
      specialRequests,
      transportMode: option.modeType,
      source: option.source,
    },
  } as any);

  // Create Stripe checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: (option.currency || "USD").toLowerCase(),
          product_data: {
            name: option.title,
            description: option.description || undefined,
          },
          unit_amount: priceCents,
        },
        quantity: travelers,
      },
    ],
    mode: "payment",
    success_url: `${getBaseUrl()}/itinerary/${tripId}?booking=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getBaseUrl()}/itinerary/${tripId}?booking=cancelled`,
    customer_email: userEmail,
    metadata: {
      type: "transport_booking", // For webhook routing
      bookingId,
      tripId,
      optionId,
      userId,
    },
  });

  if (!session.url) {
    throw new Error("Failed to create Stripe checkout session");
  }

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    bookingId,
  };
}

/**
 * Handles Stripe webhook for payment completion
 */
export async function handleStripePaymentSuccess(sessionId: string): Promise<void> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return;
    }

    const bookingId = session.metadata?.bookingId;
    const optionId = session.metadata?.optionId;

    if (!bookingId || !optionId) {
      console.error("Missing metadata in Stripe session", { sessionId });
      return;
    }

    // Update booking status to confirmed
    await db
      .update(serviceBookings as any)
      .set({
        status: "confirmed",
        confirmationCode: session.id,
      })
      .where(eq(serviceBookings.id as any, bookingId));

    // Update transport booking option status
    await db
      .update(transportBookingOptions)
      .set({
        bookingStatus: "confirmed",
        bookingId: parseInt(bookingId.split("-")[1]) || undefined,
      })
      .where(eq(transportBookingOptions.id, optionId));

    console.log("Booking confirmed:", { bookingId, optionId });
  } catch (error) {
    console.error("Error handling Stripe payment:", error);
    throw error;
  }
}

/**
 * Retrieves Stripe session details
 */
export async function getStripeSessionDetails(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      status: session.payment_status,
      paymentStatus: session.payment_status,
      customerId: session.customer,
      amount: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
    };
  } catch (error) {
    console.error("Error retrieving Stripe session:", error);
    throw error;
  }
}

/**
 * Verifies Stripe webhook signature
 */
export function verifyStripeWebhookSignature(
  body: string,
  signature: string
): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }

  try {
    return stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    throw new Error(`Webhook signature verification failed: ${(error as Error).message}`);
  }
}
