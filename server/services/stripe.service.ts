/**
 * Stripe Service — Transport Booking Checkout & Webhook Utilities
 *
 * OWNERSHIP: This service is the canonical owner of Stripe Checkout Sessions for
 * platform-managed transport bookings (booking type "platform" in transportBookingOptions).
 * It creates checkout sessions, retrieves session details, confirms transport bookings on
 * payment success, and verifies incoming Stripe webhook signatures. It also exports the
 * shared `getBaseUrl()` helper used across Stripe services for constructing redirect URLs.
 *
 * DOES NOT OWN: PaymentIntents (owned by stripe-payment.service.ts), Checkout Sessions for
 * expert services or cart bookings (owned by stripe-payment.service.ts), Connect accounts or
 * transfers to experts/providers (owned by stripe-connect.service.ts).
 *
 * Stripe API calls made here:
 *   - stripe.checkout.sessions.create    — transport booking checkout
 *   - stripe.checkout.sessions.retrieve  — payment confirmation + session status
 *   - stripe.webhooks.constructEvent     — webhook signature verification
 */

import Stripe from "stripe";
import { db } from "../db";
import { transportBookingOptions, serviceBookings } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { getStripeSecretKey } from "../utils/stripe-key";
// Ruling 2026-09-02-traveler-fee-applies-everywhere (path 4 — platform transport is merchant-of-record,
// so the traveler service fee applies). ONE band-driven resolver (§8/§14), Trip-Pass suppression via
// coversAction, and the shared service_bookings fee-ledger writer at confirmation.
import { resolveTravelerServiceFee } from "./fee-resolution.service";
import { coversAction } from "./trip-entitlement.service";
import { recordTravelerServiceFeeLedger } from "./fee-ledger.service";

const key = getStripeSecretKey();

if (!key) {
  throw new Error("STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_TEST) is not set");
}

// Primary enforcement lives in server/validate-env.ts (imported first in
// server/index.ts, before this or any other Stripe-constructing module).
// This is a defense-in-depth duplicate using the same canonical variable —
// ENVIRONMENT === "PROD" — not NODE_ENV, which is unset on this deployment.
const isProd = process.env.ENVIRONMENT === "PROD";

if (isProd) {
  if (!key.startsWith("sk_live_")) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a live secret key (sk_live_...) when ENVIRONMENT=PROD. " +
        "Found a value that does not match — refusing to start."
    );
  }
} else {
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a TEST secret key (sk_test_...) outside production (ENVIRONMENT=" +
        (process.env.ENVIRONMENT || "undefined") +
        "). A live key (sk_live_...) or publishable key (pk_...) was found instead. " +
        "Live keys are never allowed in dev/E2E — update the STRIPE_SECRET_KEY_TEST secret with a sk_test_ key."
    );
  }
}

const stripe = new Stripe(key, {
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
  tripId: string | null,
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

  // ── Traveler service fee (ruling 2026-09-02, path 4) ──────────────────────────────────────────
  // On the transport subtotal, from the ONE band-driven resolver (§8/§14), $25 cap. Trip Pass
  // suppression via the same coversAction the other rails use (transport has no rails ref, so
  // trip_pass is the only coverage). Covered → charged 0, waiver recorded.
  const feeCovered = tripId
    ? await coversAction(tripId, "traveler_service_fee").catch(() => false)
    : false;
  const travelerFeeResolved = await resolveTravelerServiceFee(totalAmount / 100);
  const feeChargedCents = feeCovered ? 0 : Math.round(travelerFeeResolved.amount * 100);
  const travelerServiceFeeSnapshot = {
    charged: feeCovered ? 0 : travelerFeeResolved.amount,
    wouldHaveBeen: travelerFeeResolved.amount,
    rate: travelerFeeResolved.rate,
    bandId: travelerFeeResolved.bandId,
    bandKey: travelerFeeResolved.bandKey,
    capApplied: travelerFeeResolved.capApplied,
    waived: feeCovered,
    waiverBasis: feeCovered ? "trip_pass" : null,
  };

  // Create a service booking record first
  const bookingId = `booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // NOTE: serviceBookings.providerId is a users.id varchar FK; transportBookingOptions.providerId
  // is an unrelated integer column that platform options never populate (always null here), so it
  // is intentionally NOT mapped. tripId links the booking to its trip when available (nullable).
  await db.insert(serviceBookings).values({
    id: bookingId,
    travelerId: userId,
    tripId: tripId ?? undefined,
    status: "pending",
    totalAmount: String(totalAmount / 100),
    bookingDetails: {
      bookingType: "transport",
      optionId,
      travelers,
      specialRequests,
      transportMode: option.modeType,
      source: option.source,
      currency: option.currency || "USD",
      // Locked snapshot (like the cart path) — read back at confirmation by the fee-ledger writer.
      travelerServiceFee: travelerServiceFeeSnapshot,
    },
  });

  // Create Stripe checkout session. The traveler fee (when not covered) is a SEPARATE, disclosed
  // line item — not folded into the transport unit price (which is the provider's amount).
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
      ...(feeChargedCents > 0
        ? [
            {
              price_data: {
                currency: (option.currency || "USD").toLowerCase(),
                product_data: { name: "Traveloure service fee" },
                unit_amount: feeChargedCents,
              },
              quantity: 1,
            },
          ]
        : []),
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

    // Ruling 2026-09-02 (path 4): record the traveler service fee event for this transport booking —
    // idempotent per booking id, best-effort (payment is confirmed; a recording failure is logged,
    // never re-throws). The row is a service_bookings row, so the shared writer reads its snapshot.
    try {
      const stripePaymentRef =
        typeof session.payment_intent === "string" ? session.payment_intent : null;
      await recordTravelerServiceFeeLedger({ bookingIds: [bookingId], stripePaymentRef, actor: "transport_confirm" });
    } catch (ledgerErr: any) {
      console.error(`[transport] traveler-fee ledger write failed for booking=${bookingId} (payment CONFIRMED):`, ledgerErr?.message ?? ledgerErr);
    }

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

