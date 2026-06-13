/**
 * Optimization Routes
 *
 * G3 + G4: Free heuristic preview + payment-gated full LLM optimization.
 *
 * POST /api/optimization-preview
 *   Runs smart-sequencing scoring only (no AI calls). Returns an instant
 *   estimate of potential improvement plus the complexity-tiered fee.
 *   Visible to authenticated and guest users (no auth required).
 *
 * POST /api/optimization-payments
 *   Validates the trip/tier, checks the 24-hour free-rerun window, and
 *   creates a Stripe PaymentIntent for the optimization fee.
 *   Requires authentication.
 */

import { Router } from "express";
import { db } from "../db";
import { itineraryComparisons, users, trips, userExperiences, experienceTypes, platformRevenue } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  calculateItineraryMetrics,
  complexityTier,
} from "../services/smart-sequencing.service";
import { getFee } from "../services/optimization-fee.service";
import { revenueTrackingService } from "../services/revenue-tracking.service";
import Stripe from "stripe";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia" as any,
});

/**
 * POST /api/optimization-preview
 * Body: { items: [{serviceType, price?, duration?, dayNumber?}[]], eventType?, travelers? }
 * Returns heuristic estimate + fee — no LLM, no auth required.
 */
router.post("/api/optimization-preview", async (req, res) => {
  try {
    const { items = [], eventType, travelers = 1 } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    const normalizedItems = items.map((it: any, i: number) => ({
      serviceType: it.serviceType || it.type || it.category || "sightseeing",
      price: it.price ?? 0,
      duration: it.duration ?? 90,
      dayNumber: it.dayNumber ?? Math.floor(i / 3) + 1,
    }));

    const metrics = calculateItineraryMetrics(normalizedItems, Number(travelers) || 1, eventType);
    const tier = complexityTier(eventType);
    const { priceCents, currency, isDisabled, creditTowardCoordination } = await getFee(eventType, tier);

    // Estimate improvement potential:
    // overallScore is 0–100; lower score means more room to improve.
    const improvementRoom = Math.max(0, 100 - metrics.overallScore);
    const estimatedSavingsPct = Math.round(improvementRoom * 0.25); // up to 25% savings
    const estimatedScheduleTighteningPct = Math.round(
      (metrics.paceScore < 70 ? 70 - metrics.paceScore : 0) * 0.3
    );
    const estimatedCostDelta =
      metrics.totalCost > 0
        ? -Math.round(metrics.totalCost * (estimatedSavingsPct / 100))
        : 0;

    // Check free re-run for authenticated users
    let freeRerun = false;
    const userId = (req as any).user?.claims?.sub ?? (req as any).user?.id;
    if (userId) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [recent] = await db
        .select({ id: itineraryComparisons.id })
        .from(itineraryComparisons)
        .where(
          and(
            eq(itineraryComparisons.userId, userId),
            gte(itineraryComparisons.optimizedAt, cutoff)
          )
        )
        .limit(1);
      if (recent) freeRerun = true;
    }

    return res.json({
      estimatedSavingsPct,
      estimatedCostDelta,
      estimatedScheduleTighteningPct,
      currentScore: Math.round(metrics.overallScore),
      complexityTier: tier,
      feeCents: isDisabled ? 0 : priceCents,
      currency,
      freeRerun,
      aiDisabled: isDisabled,
      creditTowardCoordination, // Phase 2: Event branch optimizers credit toward coordination fee
      metrics: {
        balanceScore: Math.round(metrics.balanceScore),
        wellnessScore: Math.round(metrics.wellnessScore),
        paceScore: Math.round(metrics.paceScore),
        diversityScore: Math.round(metrics.diversityScore),
      },
    });
  } catch (err: any) {
    console.error("[optimization-preview] error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/optimization-fee
 * Lightweight fee lookup for a trip or experience. No items required.
 * Auth required (to verify ownership and resolve the correct fee).
 * Returns the same fee shape as the preview endpoint.
 */
router.get("/api/optimization-fee", isAuthenticated, async (req, res) => {
  try {
    const { tripId, userExperienceId } = req.query as { tripId?: string; userExperienceId?: string };

    if (!tripId && !userExperienceId) {
      return res.status(400).json({
        error: "target_required",
        message: "Provide tripId or userExperienceId to determine optimization fee.",
      });
    }

    const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
    const { eventType: dbEventType, ownerId } = await resolveTargetFromDb(tripId, userExperienceId);
    if (ownerId === undefined) {
      return res.status(404).json({ error: "Target trip or experience not found" });
    }
    if (ownerId !== userId) {
      return res.status(403).json({ error: "Not authorized to view this resource" });
    }

    const tier = complexityTier(dbEventType);
    const fee = await getFee(dbEventType, tier);

    return res.json({
      complexityTier: tier,
      feeCents: fee.isDisabled ? 0 : fee.priceCents,
      currency: fee.currency,
      creditTowardCoordination: fee.creditTowardCoordination,
      aiDisabled: fee.isDisabled,
    });
  } catch (err: any) {
    console.error("[optimization-fee] error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/optimization-payments
 * Creates a Stripe PaymentIntent for the optimization fee.
 * Auth required. Returns { clientSecret, paymentIntentId, feeCents, freeRerun }.
 */
/** Resolve event-type slug AND owner user ID from DB for a given trip or experience. */
async function resolveTargetFromDb(
  tripId: string | undefined,
  userExperienceId: string | undefined
): Promise<{ eventType: string | undefined; ownerId: string | undefined }> {
  if (tripId) {
    const [row] = await db
      .select({ eventType: trips.eventType, ownerId: trips.userId })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (!row) return { eventType: undefined, ownerId: undefined };
    return { eventType: row.eventType ?? undefined, ownerId: row.ownerId ?? undefined };
  }
  if (userExperienceId) {
    const [row] = await db
      .select({ slug: experienceTypes.slug, ownerId: userExperiences.userId })
      .from(userExperiences)
      .innerJoin(experienceTypes, eq(userExperiences.experienceTypeId, experienceTypes.id))
      .where(eq(userExperiences.id, userExperienceId))
      .limit(1);
    if (!row) return { eventType: undefined, ownerId: undefined };
    return { eventType: row.slug ?? undefined, ownerId: row.ownerId ?? undefined };
  }
  return { eventType: undefined, ownerId: undefined };
}

router.post("/api/optimization-payments", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
    const { tripId, userExperienceId, comparisonContext } = req.body;

    // Require a concrete optimization target — cannot omit both
    if (!tripId && !userExperienceId) {
      return res.status(400).json({
        error: "target_required",
        message: "Provide tripId or userExperienceId to determine optimization tier.",
      });
    }

    // Resolve event type from DB and verify ownership
    const { eventType: dbEventType, ownerId } = await resolveTargetFromDb(tripId, userExperienceId);
    if (ownerId === undefined) {
      return res.status(404).json({ error: "Target trip or experience not found" });
    }
    if (ownerId !== userId) {
      return res.status(403).json({ error: "Not authorized to optimize this resource" });
    }

    const tier = complexityTier(dbEventType);
    const { priceCents, currency, isDisabled, creditTowardCoordination } = await getFee(dbEventType, tier);

    if (isDisabled) {
      return res.status(400).json({
        error: "ai_concierge_disabled",
        message: "AI Concierge is currently disabled for this experience type.",
      });
    }

    // 24-hour free re-run check
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ id: itineraryComparisons.id, optimizedAt: itineraryComparisons.optimizedAt })
      .from(itineraryComparisons)
      .where(
        and(
          eq(itineraryComparisons.userId, userId),
          gte(itineraryComparisons.optimizedAt, cutoff)
        )
      )
      .limit(1);

    if (recent) {
      return res.json({ freeRerun: true, feeCents: 0, comparisonId: recent.id });
    }

    // Look up or create a Stripe customer so cards can be saved for one-tap reuse
    const [userRow] = await db
      .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    let stripeCustomerId: string | undefined;
    if (userRow?.email) {
      const existing = await stripe.customers.list({ email: userRow.email, limit: 1 });
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id;
      } else {
        const created = await stripe.customers.create({
          email: userRow.email,
          name: [userRow.firstName, userRow.lastName].filter(Boolean).join(" ") || undefined,
          metadata: { userId },
        });
        stripeCustomerId = created.id;
      }
    }

    // Create Stripe PaymentIntent with saved-card support
    const paymentIntent = await stripe.paymentIntents.create({
      amount: priceCents,
      currency: currency.toLowerCase(),
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      setup_future_usage: "off_session",
      metadata: {
        type: "optimization_fee",
        userId,
        complexityTier: tier,
        eventType: dbEventType ?? "",
        targetTripId: tripId ?? "",
        targetExperienceId: userExperienceId ?? "",
        context: JSON.stringify(comparisonContext || {}),
      },
      description: `Traveloure AI Optimization (${tier})`,
    });

    return res.json({
      freeRerun: false,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      feeCents: priceCents,
      currency,
      complexityTier: tier,
      creditTowardCoordination, // Phase 2: Event branch optimizers credit toward coordination fee
    });
  } catch (err: any) {
    console.error("[optimization-payments] error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/optimization-payments/confirm
 * Called after Stripe payment succeeds on the client. Records revenue.
 */
router.post("/api/optimization-payments/confirm", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).claims?.sub ?? (req.user as any).id;
    const { paymentIntentId, comparisonId, feeCents, currency = "USD" } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: "paymentIntentId required" });
    }

    // Verify payment with Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not yet confirmed" });
    }

    // Ownership + type binding — prevent ledger pollution from unrelated PIs
    if (pi.metadata?.type !== "optimization_fee") {
      return res.status(400).json({ error: "invalid_payment_type", message: "PaymentIntent is not an optimization fee." });
    }
    if (pi.metadata?.userId && pi.metadata.userId !== userId) {
      return res.status(403).json({ error: "payment_belongs_to_another_user" });
    }

    // If comparisonId provided, verify it belongs to the requesting user
    if (comparisonId) {
      const [compRow] = await db
        .select({ ownerId: itineraryComparisons.userId })
        .from(itineraryComparisons)
        .where(eq(itineraryComparisons.id, comparisonId))
        .limit(1);
      if (!compRow) {
        return res.status(404).json({ error: "Comparison not found" });
      }
      if (compRow.ownerId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this comparison" });
      }
    }

    // Amount always comes from Stripe (never from client)
    const confirmedAmount = pi.amount / 100;

    // Store payment ID on comparison if provided
    if (comparisonId) {
      await db
        .update(itineraryComparisons)
        .set({ optimizationPaymentId: paymentIntentId })
        .where(eq(itineraryComparisons.id, comparisonId));
    }

    // Idempotency: skip revenue recording if this PI was already recorded
    const [existingRev] = await db
      .select({ id: platformRevenue.id })
      .from(platformRevenue)
      .where(eq(platformRevenue.sourceId, paymentIntentId))
      .limit(1);

    if (!existingRev) {
      try {
        await revenueTrackingService.recordRevenueEvent({
          sourceType: "optimization_fee",
          sourceId: paymentIntentId,
          grossAmount: confirmedAmount,
          description: `AI Optimization fee (${pi.metadata?.complexityTier ?? "standard"})`,
          metadata: {
            type: "optimization_fee",
            complexityTier: pi.metadata?.complexityTier,
            userId,
            comparisonId,
            currency: pi.currency?.toUpperCase() ?? "USD",
          },
        });
      } catch (revErr) {
        console.warn("[optimization-payments/confirm] revenue record failed (non-critical):", revErr);
      }
    }

    // Phase 2: Event branch optimizers credit toward coordination fee.
    // If this is an Event-branch optimization, record the credit so it
    // can be applied against the eventual coordination fee (Phase 4).
    const eventType = pi.metadata?.eventType as string | undefined;
    // TODO: Record creditTowardCoordination in a dedicated ledger when
    //       the coordination fee infrastructure is ready (Phase 4).

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[optimization-payments/confirm] error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
