/**
 * trip-pass.routes.ts — Trip Pass purchase + status (ruling 2026-08-29-trip-pass).
 *
 * Copies the Ready-Made purchase/confirm pair (ready-made.routes.ts, the ratified
 * precedent for a single flat-price, non-booking, metadata-typed PaymentIntent):
 *   POST /purchase   — owner + one-active gates BEFORE any Stripe call; amount is
 *                      server-resolved from the plans row (§14); deterministic
 *                      idempotencyKey so a retry re-uses the same PI (§15).
 *   POST /confirm    — never trusts client-reported state: retrieves the PI from
 *                      Stripe, requires succeeded, IDOR-guards the metadata, then
 *                      grants via grantTripPass (idempotent on the PI id — a double
 *                      confirm grants once). allowances_snapshot FROZEN here from
 *                      the plans row: later price/allowance edits never alter a
 *                      sold pass.
 *   GET  /            — owner-gated status the slip card + optimizer gate copy read
 *                      (the client never asserts coverage; it only displays this).
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import { getUserId } from "../utils/auth";
import { getStripeSecretKey } from "../utils/stripe-key";
import { PLAN_KEYS, requirePlan } from "../services/plans.service";
import { getActiveTripPass, grantTripPass } from "../services/trip-entitlement.service";

const router = Router();

function isAuthenticated(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

async function ownedTrip(tripId: string, userId: string) {
  const [trip] = await db
    .select({ id: trips.id, userId: trips.userId, title: trips.title })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return { trip: null, error: 404 as const };
  if (trip.userId !== userId) return { trip: null, error: 403 as const };
  return { trip, error: null };
}

router.get("/api/trips/:tripId/trip-pass", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { trip, error } = await ownedTrip(req.params.tripId, userId);
    if (error) return res.status(error).json({ message: error === 404 ? "Trip not found" : "Not your trip" });

    const pass = await getActiveTripPass(trip!.id);
    const plan = await requirePlan(PLAN_KEYS.TRIP_PASS);
    return res.json({
      active: pass !== null,
      priceCents: plan.priceCents,
      planName: plan.name,
      ...(pass ? { grantedAt: pass.grantedAt, allowancesSnapshot: pass.allowancesSnapshot } : {}),
    });
  } catch (err: any) {
    console.error("[trip-pass] status failed:", err?.message ?? err);
    return res.status(500).json({ message: "Failed to load Trip Pass status" });
  }
});

router.post("/api/trips/:tripId/trip-pass/purchase", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { trip, error } = await ownedTrip(req.params.tripId, userId);
    if (error) return res.status(error).json({ message: error === 404 ? "Trip not found" : "Not your trip" });

    // One active pass per trip — rejected BEFORE any PaymentIntent, never double-charged.
    if (await getActiveTripPass(trip!.id)) {
      return res.status(409).json({ message: "This trip already has an active Trip Pass" });
    }

    // §14: amount server-resolved from the plans row; fail-loud if the row is missing.
    const plan = await requirePlan(PLAN_KEYS.TRIP_PASS);
    if (!plan.active || plan.priceCents <= 0) {
      return res.status(400).json({ message: "Trip Pass is not currently available" });
    }

    const Stripe = (await import("stripe")).default;
    const stripeClient = new Stripe(getStripeSecretKey() || "", {
      apiVersion: "2024-12-18.acacia" as any,
    });
    const paymentIntent = await stripeClient.paymentIntents.create(
      {
        amount: plan.priceCents,
        currency: "usd",
        metadata: {
          type: "trip_pass_purchase",
          tripId: trip!.id,
          buyerId: userId,
        },
        description: `Traveloure Trip Pass — ${trip!.title ?? trip!.id}`,
        automatic_payment_methods: { enabled: true },
      },
      // §15: a retry re-uses the same PI instead of minting a second charge.
      { idempotencyKey: `tp-buy-${trip!.id}-${userId}` },
    );

    return res.status(202).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      priceCents: plan.priceCents,
    });
  } catch (err: any) {
    console.error("[trip-pass] purchase failed:", err?.message ?? err);
    return res.status(500).json({ message: "Failed to start Trip Pass purchase" });
  }
});

router.post("/api/trips/:tripId/trip-pass/purchase/confirm", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req)!;
    const { trip, error } = await ownedTrip(req.params.tripId, userId);
    if (error) return res.status(error).json({ message: error === 404 ? "Trip not found" : "Not your trip" });

    const { paymentIntentId } = req.body ?? {};
    if (!paymentIntentId) return res.status(400).json({ message: "paymentIntentId is required" });

    // Never trust client-reported payment state — retrieve from Stripe (§19a: the PI id
    // becomes source_payment_id only after Stripe itself vouches for it).
    const Stripe = (await import("stripe")).default;
    const stripeClient = new Stripe(getStripeSecretKey() || "", {
      apiVersion: "2024-12-18.acacia" as any,
    });
    const intent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") {
      return res.status(402).json({ message: `Payment not completed (status: ${intent.status})` });
    }
    if (
      intent.metadata?.type !== "trip_pass_purchase" ||
      intent.metadata?.tripId !== trip!.id ||
      intent.metadata?.buyerId !== userId
    ) {
      return res.status(400).json({ message: "PaymentIntent does not match this purchase" });
    }

    // FROZEN snapshot: the plans row's allowances at THIS moment plus the ruled
    // one-revision benefit and the price actually captured. Later edits to the plans
    // row never alter a sold pass.
    const plan = await requirePlan(PLAN_KEYS.TRIP_PASS);
    const { entitlement, created } = await grantTripPass({
      tripId: trip!.id,
      sourcePaymentId: intent.id,
      allowancesSnapshot: {
        ...(plan.allowances as Record<string, unknown>),
        revisionsRemaining: 1,
        priceCentsPaid: intent.amount,
        planName: plan.name,
      },
    });

    return res.json({ active: true, created, grantedAt: entitlement.grantedAt });
  } catch (err: any) {
    console.error("[trip-pass] confirm failed:", err?.message ?? err);
    return res.status(500).json({ message: "Failed to confirm Trip Pass purchase" });
  }
});

export default router;
