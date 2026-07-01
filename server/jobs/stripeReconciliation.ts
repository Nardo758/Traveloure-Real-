/**
 * Stripe Reconciliation Job
 *
 * Compares Stripe's charge records against Traveloure's bookings table
 * for the last 24 hours, flagging two classes of drift:
 *
 *   1. stripe_charge_no_booking  — A Stripe charge succeeded but no booking
 *      row in the DB has a matching bookingId in charge.metadata.
 *      (Customer was billed with no record — critical.)
 *
 *   2. booking_no_stripe_charge  — A booking is "confirmed" and has a
 *      stripePaymentIntentId, but Stripe has no succeeded charge for that PI.
 *      (Booking confirmed without payment — critical.)
 *
 * When mismatches are found, they are:
 *   • Logged to console as [RECONCILIATION] errors
 *   • Inserted into admin_notifications so the daily digest picks them up
 *
 * Do NOT import or call anything from the checkout flow.
 */

import Stripe from "stripe";
import { db } from "../db";
import { bookings, adminNotifications } from "@shared/schema";
import { gte } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

export interface ReconciliationMismatch {
  type: "stripe_charge_no_booking" | "booking_no_stripe_charge";
  chargeId?: string;
  bookingId?: string;
  paymentIntentId?: string;
  amount?: number;
  metadata?: Record<string, string>;
}

export interface ReconciliationResult {
  mismatches: ReconciliationMismatch[];
  checkedCharges: number;
  checkedBookings: number;
  ranAt: string;
}

export async function runStripeReconciliation(): Promise<ReconciliationResult> {
  const ranAt = new Date().toISOString();

  if (!process.env.STRIPE_SECRET_KEY) {
    console.log("[RECONCILIATION] STRIPE_SECRET_KEY not set — skipping");
    return { mismatches: [], checkedCharges: 0, checkedBookings: 0, ranAt };
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayUnix = Math.floor(yesterday.getTime() / 1000);

    // ── 1. Fetch Stripe charges from last 24 hours ───────────────────────────
    const charges = await stripe.charges.list({
      created: { gte: yesterdayUnix },
      limit: 100,
    });

    // ── 2. Fetch bookings created in last 24 hours ───────────────────────────
    const dbBookings = await db
      .select()
      .from(bookings)
      .where(gte(bookings.createdAt, yesterday));

    // Index for fast lookup
    const dbBookingIds = new Set(dbBookings.map(b => b.id.toString()));
    // Map paymentIntentId → booking for reverse lookup
    const piToBooking = new Map(
      dbBookings
        .filter(b => b.stripePaymentIntentId)
        .map(b => [b.stripePaymentIntentId!, b])
    );

    const mismatches: ReconciliationMismatch[] = [];

    // ── 3a. Stripe charges with no matching booking ──────────────────────────
    for (const charge of charges.data) {
      if (charge.status !== "succeeded") continue;
      const bookingId = charge.metadata?.bookingId;
      if (!bookingId || !dbBookingIds.has(bookingId)) {
        mismatches.push({
          type: "stripe_charge_no_booking",
          chargeId: charge.id,
          amount: charge.amount / 100,
          metadata: charge.metadata as Record<string, string>,
        });
      }
    }

    // ── 3b. Confirmed bookings with no succeeded Stripe charge ───────────────
    const chargesByPi = new Map<string, Stripe.Charge>();
    for (const charge of charges.data) {
      if (charge.payment_intent && typeof charge.payment_intent === "string") {
        chargesByPi.set(charge.payment_intent, charge);
      }
    }

    for (const booking of dbBookings) {
      if (booking.status !== "confirmed") continue;
      if (!booking.stripePaymentIntentId) continue;
      const matchingCharge = chargesByPi.get(booking.stripePaymentIntentId);
      if (!matchingCharge || matchingCharge.status !== "succeeded") {
        mismatches.push({
          type: "booking_no_stripe_charge",
          bookingId: booking.id,
          paymentIntentId: booking.stripePaymentIntentId,
        });
      }
    }

    // ── 4. Report results ───────────────────────────────────────────────────
    const result: ReconciliationResult = {
      mismatches,
      checkedCharges: charges.data.length,
      checkedBookings: dbBookings.length,
      ranAt,
    };

    if (mismatches.length > 0) {
      console.error(
        `[RECONCILIATION] ${mismatches.length} mismatch(es) found (${charges.data.length} charges, ${dbBookings.length} bookings checked):`,
        JSON.stringify(mismatches, null, 2)
      );

      // Insert into admin_notifications so the daily digest picks it up
      await db.insert(adminNotifications).values({
        type: "reconciliation_mismatch",
        message: `${mismatches.length} payment/booking mismatch(es) found in daily reconciliation`,
        reason: JSON.stringify(mismatches),
      } as any);
    } else {
      console.log(
        `[RECONCILIATION] Clean — ${charges.data.length} charge(s) and ${dbBookings.length} booking(s) checked, no mismatches.`
      );
    }

    return result;
  } catch (err: any) {
    console.error("[RECONCILIATION ERROR]", err);
    return { mismatches: [], checkedCharges: 0, checkedBookings: 0, ranAt };
  }
}
