import { and, eq, lt, sql } from "drizzle-orm";
import { backgroundDb, db } from "../db";
import { emailOutbox, itineraryComparisons, users } from "@shared/schema";
import { dispatchMessagingEvent } from "../automations/messaging/runtime";
import {
  buildItineraryOutcomeEmail, generationNoticeKey, resolveGenerationOutcome,
  canQueueGenerationNotice,
  type GenerationOutcome, GENERATION_TIMEOUT_MS,
} from "./itinerary-outcome-email";
import { deliverQueuedEmail } from "./email-outbox.service";
import { scheduleItineraryFollowups } from "./itinerary-followup.service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface GenerationOutcomeInput {
  comparisonId: string;
  startedAt: Date;
  outcome: GenerationOutcome;
  now?: Date;
  generatedPatch?: Pick<typeof itineraryComparisons.$inferInsert, "segmentationProposal">;
  /** Recovery sweep queues durably; the existing drain sends without blocking the sweep on SMTP. */
  deliverImmediately?: boolean;
}

/**
 * One transaction owns both terminal status and outbox insertion. The startedAt guard prevents
 * old workers/timers touching a newer attempt. Exported for rollback-only database verification.
 * No entitlement, fee, payment, membership, or wallet writer is called here.
 */
export async function persistGenerationOutcome(tx: Transaction, input: GenerationOutcomeInput) {
  const now = input.now ?? new Date();
  const resolved = resolveGenerationOutcome(input.outcome, input.startedAt, now);
  const [comparison] = await tx.update(itineraryComparisons).set({
    status: resolved.outcome === "ready" ? "generated" : "failed",
    updatedAt: now,
    ...(resolved.outcome === "ready" ? { ...input.generatedPatch, optimizedAt: now } : {}),
  }).where(and(
    eq(itineraryComparisons.id, input.comparisonId),
    eq(itineraryComparisons.status, "generating"),
    eq(itineraryComparisons.updatedAt, input.startedAt),
  )).returning();
  if (!comparison) return { transitioned: false, outcome: resolved.outcome, outboxId: null, tripId: null as string | null };
  // P0-b item 1 (ledger `2026-10-11-p0b-routing-follow-ups`): the plan a READY run belongs to, so the
  // caller can recompute its legs after commit. Null for a failed run or a comparison with no plan.
  const tripId = resolved.outcome === "ready" ? comparison.tripId ?? null : null;

  const [user] = await tx.select({ email: users.email, firstName: users.firstName })
    .from(users).where(eq(users.id, comparison.userId)).limit(1);
  if (!user?.email || !/^[^\s@<>\[\]]+@[^\s@<>\[\]]+\.[^\s@<>\[\]]+$/.test(user.email)) {
    return { transitioned: true, outcome: resolved.outcome, outboxId: null, tripId };
  }
  if (!canQueueGenerationNotice(user.email)) {
    return { transitioned: true, outcome: resolved.outcome, outboxId: null, tripId };
  }

  const key = generationNoticeKey(comparison.id, resolved.outcome, input.startedAt);
  // An action-owned advisory lock guards the existing JSONB metadata key; no new ledger/schema.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  const [existing] = await tx.select({ id: emailOutbox.id, status: emailOutbox.status }).from(emailOutbox)
    .where(sql`${emailOutbox.metadata}->>'generationNoticeKey' = ${key}`).limit(1);
  if (existing && existing.status !== "cancelled") {
    return { transitioned: true, outcome: resolved.outcome, outboxId: null, tripId };
  }

  const { getAppBaseUrl } = await import("./email.service");
  const message = buildItineraryOutcomeEmail({
    comparisonId: comparison.id, outcome: resolved.outcome, reason: resolved.reason,
    firstName: user.firstName, destination: comparison.destination, baseUrl: getAppBaseUrl(),
  });
  const outboxId = await dispatchMessagingEvent(
    "messaging.email-outbox-enqueue", "email.enqueue",
    { emailType: `itinerary_${resolved.outcome}` }, {},
    async () => {
      const values = {
        emailType: `itinerary_${resolved.outcome}`, toEmail: user.email!,
        subject: message.subject, html: message.html, textBody: message.text,
        status: "pending", maxAttempts: 6,
        metadata: {
          generationNoticeKey: key, comparisonId: comparison.id,
          generationAttemptStartedAt: input.startedAt.toISOString(),
          generationCompletedAt: now.toISOString(),
          outcome: resolved.outcome, ...(resolved.reason ? { reason: resolved.reason } : {}),
        },
      };
      // Cancellation before receipt must not permanently suppress a later valid ready notice.
      // Reuse the row/key rather than minting a second per-itinerary delivery identity.
      const [row] = existing
        ? await tx.update(emailOutbox).set({
            ...values, attemptCount: 0, retryAfter: null, lastError: null, updatedAt: now,
          }).where(and(eq(emailOutbox.id, existing.id), eq(emailOutbox.status, "cancelled")))
            .returning({ id: emailOutbox.id })
        : await tx.insert(emailOutbox).values(values).returning({ id: emailOutbox.id });
      return row?.id ?? null;
    },
  );
  if (resolved.outcome === "ready") {
    await scheduleItineraryFollowups(tx, {
      itineraryId: comparison.id, travelerId: comparison.userId, email: user.email,
      readyAt: now,
    });
  }
  return { transitioned: true, outcome: resolved.outcome, outboxId, tripId };
}

export async function finishComparisonGeneration(input: GenerationOutcomeInput) {
  const now = input.now ?? new Date();
  const { outcome } = resolveGenerationOutcome(input.outcome, input.startedAt, now);
  const result = await dispatchMessagingEvent(
    outcome === "ready" ? "messaging.plan-delivered-email" : "messaging.itinerary-failed-email",
    `itinerary.${outcome}`, { comparisonId: input.comparisonId }, {},
    () => db.transaction((tx) => persistGenerationOutcome(tx, { ...input, now })),
  );
  // Only after commit: failed immediate delivery stays durable for the existing retry worker.
  if (result.outboxId !== null && input.deliverImmediately !== false) await deliverQueuedEmail(result.outboxId);
  // P0-b item 1: after a READY run commits, recompute the plan's legs now — a finished Optimize run is what
  // earns a plan routed legs, so waiting for the next item edit left them unworked. Never awaited and never
  // fails the outcome (§15b); `runNow` logs its own skip reason.
  if (result.transitioned && result.tripId) {
    const { runNow } = await import("./routing/plan-legs-queue");
    void runNow(result.tripId);
  }
  // A paid run that stored no optimized version is refunded after the status commits.
  // Never fails the outcome (§15b). Trip Pass runs and runs that stored a version no-op.
  if (result.transitioned) {
    try {
      const { refundFailedPaidOptimizerRun } = await import("./optimizer-run-refund.service");
      await refundFailedPaidOptimizerRun(input.comparisonId);
    } catch (err) {
      console.error("[Optimizer] paid-run refund failed (sweep will retry):", (err as Error)?.message ?? err);
    }
  }
  return result;
}

export async function sweepTimedOutGenerations(staleBefore: Date) {
  // Candidate read uses the small background pool. A Neon wake-up waiting on
  // connectionTimeoutMillis must not occupy a request-pool slot. Terminal
  // writes stay on `db` and run only after this select has connected.
  const candidates = await backgroundDb.select({
    id: itineraryComparisons.id, userId: itineraryComparisons.userId,
    startedAt: itineraryComparisons.updatedAt,
  }).from(itineraryComparisons).where(and(
    eq(itineraryComparisons.status, "generating"),
    lt(itineraryComparisons.updatedAt, staleBefore),
  )).limit(100);
  const swept: Array<{ id: string; userId: string }> = [];
  for (const row of candidates) {
    if (!row.startedAt) continue;
    const result = await finishComparisonGeneration({
      comparisonId: row.id, startedAt: row.startedAt, outcome: "failed",
      deliverImmediately: false,
    });
    if (result.transitioned) swept.push({ id: row.id, userId: row.userId });
  }
  return swept;
}