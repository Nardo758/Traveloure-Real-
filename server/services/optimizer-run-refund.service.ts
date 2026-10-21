/**
 * Refund a paid Optimize run that ended with no optimized version
 * (ledger `2026-10-20-optimize-paid-failure-refund`).
 *
 * ONE refund per PaymentIntent. The claim is a `refunds` row inserted BEFORE the
 * Stripe call (`pending-optimizer-<pi>`). Stripe is called under
 * `optimizer-run-refund-<pi>`, so a retry, a sweep, and a second failure path
 * receive the same refund. The pending row is then updated to the real refund id
 * (no second audit row, no delete).
 *
 * A run that already stored an `ai_optimized` variant is not refunded: the traveler
 * received a version. A Trip Pass run has no PaymentIntent and is not refunded.
 * Nothing here changes a fee band or an `optimization_fees` price. The amount is
 * whatever Stripe still holds on that PaymentIntent.
 *
 * Never throws. A Stripe failure leaves the pending claim; the generation sweep
 * re-drives it. An unconsumed coordination credit for this PaymentIntent stops
 * being available as soon as the claim exists. A credit already consumed by a
 * coordination is left where it is — that coordination charge already happened.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { itineraryComparisons, itineraryVariants, platformRevenue } from "@shared/schema";
import {
  OPTIMIZER_RUN_REFUND_REASON,
  optimizerRunRefundIdempotencyKey,
  optimizerRunRefundPendingId,
  type OptimizerFeeRefundState,
} from "@shared/optimizer-run-refund";
import { recordRefundAuditRow, refundedCentsOnPaymentIntent, stripe, stripePaymentService } from "./stripe-payment.service";
import { recordOptimizerRunRefundToll } from "./fee-ledger.service";
import { logger } from "../infrastructure/logger";

/** How far back a sweep looks for a paid empty run whose refund claim was never written. */
export const OPTIMIZER_REFUND_RETRY_WINDOW_MS = 2 * 60 * 60 * 1000;

export type OptimizerRefundResult =
  | { state: "refunded" }
  | { state: "pending" }
  | { state: "skipped"; reason: "unpaid" | "delivered" | "not_optimization_fee" | "nothing_to_refund" };

async function countAiOptimized(comparisonId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itineraryVariants)
    .where(and(eq(itineraryVariants.comparisonId, comparisonId), eq(itineraryVariants.source, "ai_optimized")));
  return Number(row?.n ?? 0);
}

export async function readOptimizerFeeRefundState(paymentIntentId: string | null | undefined): Promise<OptimizerFeeRefundState | null> {
  if (!paymentIntentId) return null;
  const found = await db.execute(sql`
    SELECT stripe_refund_id FROM refunds
     WHERE stripe_payment_intent_id = ${paymentIntentId}
       AND reason = ${OPTIMIZER_RUN_REFUND_REASON}
  `);
  const ids = ((found.rows ?? []) as Array<{ stripe_refund_id: string | null }>).map((r) => r.stripe_refund_id ?? "");
  if (ids.some((id) => id.startsWith("re_"))) return "refunded";
  if (ids.some((id) => id.startsWith("pending-optimizer-"))) return "pending";
  return null;
}

/**
 * What the review screen says. `null` for an unpaid run, a run still generating,
 * and a run that stored an optimized version. `pending` once a refund is owed or
 * claimed and Stripe has not confirmed it. `refunded` once a Stripe refund id is
 * on the audit row.
 */
export async function optimizationFeeRefundForComparison(comparison: {
  id: string;
  status: string | null;
  optimizationPaymentId: string | null;
}): Promise<OptimizerFeeRefundState | null> {
  if (!comparison.optimizationPaymentId) return null;
  const state = await readOptimizerFeeRefundState(comparison.optimizationPaymentId);
  if (state) return state;
  if (comparison.status !== "failed" && comparison.status !== "generated") return null;
  const ai = await countAiOptimized(comparison.id);
  return ai === 0 ? "pending" : null;
}

/** The recorded PaymentIntent, or null when this run is being refunded instead of retried. */
export async function recordedOptimizerPaymentForRetry(comparison: {
  id: string;
  optimizationPaymentId: string | null;
}): Promise<string | null> {
  if (!comparison.optimizationPaymentId) return null;
  const state = await readOptimizerFeeRefundState(comparison.optimizationPaymentId);
  if (state) return null;
  const ai = await countAiOptimized(comparison.id);
  return ai > 0 ? comparison.optimizationPaymentId : null;
}

async function claimPending(paymentIntentId: string, amountDollars: string, currency: string): Promise<void> {
  const pendingId = optimizerRunRefundPendingId(paymentIntentId);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`optimizer-run-refund:${paymentIntentId}`}, 0))`);
    await tx.execute(sql`
      INSERT INTO refunds (
        stripe_refund_id, stripe_payment_intent_id, amount, currency, status, reason, created_at
      )
      SELECT ${pendingId}, ${paymentIntentId}, ${amountDollars}, ${currency}, 'pending', ${OPTIMIZER_RUN_REFUND_REASON}, NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM refunds
          WHERE stripe_payment_intent_id = ${paymentIntentId}
            AND reason = ${OPTIMIZER_RUN_REFUND_REASON}
       )
    `);
  });
}

async function promotePending(paymentIntentId: string, refund: { id: string; status: string | null; chargeId: string | null; currency: string }, amountDollars: string): Promise<void> {
  const pendingId = optimizerRunRefundPendingId(paymentIntentId);
  await db.execute(sql`
    UPDATE refunds
       SET stripe_refund_id = ${refund.id},
           stripe_charge_id = ${refund.chargeId},
           status = ${refund.status ?? "succeeded"},
           amount = ${amountDollars},
           currency = ${refund.currency}
     WHERE stripe_payment_intent_id = ${paymentIntentId}
       AND reason = ${OPTIMIZER_RUN_REFUND_REASON}
       AND stripe_refund_id = ${pendingId}
  `);
  await recordRefundAuditRow({
    refundId: refund.id,
    chargeId: refund.chargeId,
    paymentIntentId,
    amountDollars: Number(amountDollars),
    currency: refund.currency,
    status: refund.status ?? "succeeded",
    bookingId: null,
    reason: OPTIMIZER_RUN_REFUND_REASON,
  });
}

async function reverseOptimizationPlatformRevenue(paymentIntentId: string): Promise<void> {
  const originals = await db
    .update(platformRevenue)
    .set({ status: "reversed" })
    .where(and(eq(platformRevenue.sourceId, paymentIntentId), ne(platformRevenue.status, "reversed")))
    .returning();
  const now = new Date();
  for (const o of originals) {
    const neg = (v: string | null) => (-(Math.round(parseFloat(v || "0") * 100) / 100)).toFixed(2);
    await db.insert(platformRevenue).values({
      sourceType: o.sourceType,
      sourceId: o.sourceId,
      trackingNumber: o.trackingNumber,
      grossAmount: neg(o.grossAmount),
      platformFee: neg(o.platformFee),
      netAmount: neg(o.netAmount),
      processingFees: neg(o.processingFees),
      currency: o.currency,
      expertId: o.expertId,
      expertEarnings: neg(o.expertEarnings),
      providerId: o.providerId,
      providerEarnings: neg(o.providerEarnings),
      description: `Reversal of platform revenue ${o.id} (optimizer run refund)`,
      metadata: { reversalOf: o.id, reason: OPTIMIZER_RUN_REFUND_REASON },
      status: "reversed",
      transactionDate: now,
    });
  }
}

async function loadComparison(comparisonId: string) {
  const [comparison] = await db
    .select({
      id: itineraryComparisons.id,
      paymentIntentId: itineraryComparisons.optimizationPaymentId,
      tripId: itineraryComparisons.tripId,
    })
    .from(itineraryComparisons)
    .where(eq(itineraryComparisons.id, comparisonId))
    .limit(1);
  return comparison ?? null;
}

/**
 * Refund the comparison's optimization PaymentIntent when the run stored no
 * optimized version. Idempotent. Never throws.
 */
export async function refundFailedPaidOptimizerRun(comparisonId: string): Promise<OptimizerRefundResult> {
  try {
    const comparison = await loadComparison(comparisonId);
    if (!comparison?.paymentIntentId) return { state: "skipped", reason: "unpaid" };
    const paymentIntentId = comparison.paymentIntentId;
    const state = await readOptimizerFeeRefundState(paymentIntentId);
    if (state === "refunded") {
      const prior = await db.execute(sql`
        SELECT stripe_refund_id, amount FROM refunds
         WHERE stripe_payment_intent_id = ${paymentIntentId}
           AND reason = ${OPTIMIZER_RUN_REFUND_REASON}
           AND stripe_refund_id LIKE 're_%'
         LIMIT 1
      `);
      const row = (prior.rows ?? [])[0] as { stripe_refund_id: string; amount: string } | undefined;
      if (row?.stripe_refund_id) {
        await recordOptimizerRunRefundToll({
          comparisonId,
          tripId: comparison.tripId,
          paymentIntentId,
          amountCents: Math.round(Math.abs(Number(row.amount) || 0) * 100),
          stripeRefundId: row.stripe_refund_id,
          actor: "optimizer-run-refund",
        });
      }
      return { state: "refunded" };
    }
    if (state !== "pending") {
      const ai = await countAiOptimized(comparisonId);
      if (ai > 0) return { state: "skipped", reason: "delivered" };
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    if (pi.metadata?.type !== "optimization_fee") {
      logger.error(
        { comparisonId, paymentIntentId, type: pi.metadata?.type ?? null },
        "[optimizer-refund] refusing to refund a PaymentIntent that is not an optimization fee",
      );
      return { state: "skipped", reason: "not_optimization_fee" };
    }
    const refundCents = pi.amount - refundedCentsOnPaymentIntent(pi);
    const currency = (pi.currency || "usd").toLowerCase();
    if (refundCents <= 0) {
      const listed = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 5 });
      const prior = listed.data.find((r) => r.status !== "failed" && r.status !== "canceled");
      if (!prior) return { state: "skipped", reason: "nothing_to_refund" };
      await promotePending(
        paymentIntentId,
        {
          id: prior.id,
          status: prior.status ?? "succeeded",
          chargeId: typeof prior.charge === "string" ? prior.charge : prior.charge?.id ?? null,
          currency: prior.currency || currency,
        },
        (prior.amount / 100).toFixed(2),
      );
      await recordOptimizerRunRefundToll({
        comparisonId,
        tripId: comparison.tripId,
        paymentIntentId,
        amountCents: prior.amount,
        stripeRefundId: prior.id,
        actor: "optimizer-run-refund",
      });
      return { state: "refunded" };
    }

    const amountDollars = (refundCents / 100).toFixed(2);
    await claimPending(paymentIntentId, amountDollars, currency);
    const refund = await stripePaymentService.refundFailedOptimizerRun({
      comparisonId,
      paymentIntentId,
      amountCents: refundCents,
      idempotencyKey: optimizerRunRefundIdempotencyKey(paymentIntentId),
    });
    await promotePending(paymentIntentId, refund, amountDollars);
    await recordOptimizerRunRefundToll({
      comparisonId,
      tripId: comparison.tripId,
      paymentIntentId,
      amountCents: refundCents,
      stripeRefundId: refund.id,
      actor: "optimizer-run-refund",
    });
    try {
      await reverseOptimizationPlatformRevenue(paymentIntentId);
    } catch (revErr) {
      logger.error(
        { comparisonId, paymentIntentId, err: (revErr as Error)?.message },
        "[optimizer-refund] platform revenue reversal failed after the Stripe refund (non-fatal)",
      );
    }
    return { state: "refunded" };
  } catch (err) {
    logger.error(
      { comparisonId, err: (err as Error)?.message },
      "[optimizer-refund] Stripe refund failed after the claim — claim kept, the sweep re-drives the same key",
    );
    return { state: "pending" };
  }
}

/** Re-drive claims whose Stripe call did not finish. */
export async function retryPendingOptimizerRefunds(): Promise<number> {
  const pending = await db.execute(sql`
    SELECT c.id
      FROM refunds r
      JOIN itinerary_comparisons c ON c.optimization_payment_id = r.stripe_payment_intent_id
     WHERE r.reason = ${OPTIMIZER_RUN_REFUND_REASON}
       AND r.stripe_refund_id LIKE 'pending-optimizer-%'
     LIMIT 20
  `);
  let n = 0;
  for (const row of (pending.rows ?? []) as Array<{ id: string }>) {
    const result = await refundFailedPaidOptimizerRun(row.id);
    if (result.state === "refunded") n += 1;
  }
  return n;
}

/**
 * A paid empty run whose process died between the status flip and the claim.
 * Limited to the retry window so a deploy does not refund the historical backlog.
 */
export async function refundRecentUnclaimedPaidFailures(since: Date): Promise<number> {
  const rows = await db.execute(sql`
    SELECT c.id
      FROM itinerary_comparisons c
     WHERE c.optimization_payment_id IS NOT NULL
       AND c.status IN ('failed', 'generated')
       AND c.updated_at > ${since.toISOString()}::timestamp
       AND NOT EXISTS (
         SELECT 1 FROM itinerary_variants v
          WHERE v.comparison_id = c.id AND v.source = 'ai_optimized'
       )
       AND NOT EXISTS (
         SELECT 1 FROM refunds r
          WHERE r.stripe_payment_intent_id = c.optimization_payment_id
            AND r.reason = ${OPTIMIZER_RUN_REFUND_REASON}
       )
     LIMIT 20
  `);
  let n = 0;
  for (const row of (rows.rows ?? []) as Array<{ id: string }>) {
    const result = await refundFailedPaidOptimizerRun(row.id);
    if (result.state === "refunded" || result.state === "pending") n += 1;
  }
  return n;
}
