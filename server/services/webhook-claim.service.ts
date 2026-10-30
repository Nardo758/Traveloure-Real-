/**
 * PAY-1 §3 — ONE claim per (Stripe event, consumer), on `platform_webhook_consumers`
 * (ledger `2026-10-15-pay1-payment-checks`).
 *
 * `webhook_events` keys on `stripe_event_id` alone, so it can RECORD a delivery but cannot say which
 * endpoint finished it: the platform rail wrote no lifecycle at all, and the Connect rail's
 * check-then-insert let two concurrent deliveries both run. `platform_webhook_consumers` already
 * keys on (stripe_event_id, consumer) — the disputes rail uses it as `platform-disputes` — so the
 * two payment rails become two more consumers, `platform` and `connect`, with no migration.
 *
 * THE CLAIM IS ONE STATEMENT (§15): an INSERT that, on conflict, re-takes the row only when it is
 * not completed AND either failed or older than the TTL. The statement is the guard; nothing reads
 * first and decides after.
 *
 * `created_at` IS THE LAST-CLAIM TIME ON THIS TABLE. It is set on insert and refreshed by the
 * re-take, so "older than the TTL" means "nobody has claimed it for that long". Row 98 (migration 418, HELD) adds the
 * `claimed_at` column the Oct 15 note asked for: it is stamped by the same statement on insert and on re-take. The
 * TTL still reads `created_at`, so no existing reader moves.
 *
 * ROW 98 (ledger `2026-10-30-row98-webhook-dedupe-replay`; option (b), Leon, Oct 30, 2026): a handler that already
 * takes a transaction runs in ONE transaction with its claim and its completion (`runUnderWebhookClaimTx`), so a
 * throw rolls the claim back with the work. No Stripe call and no email runs inside that transaction: a dispute's
 * charge is fetched first (`withExpandedDisputeCharge`).
 */
import { sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../db";

type SqlExec = Pick<typeof db, "execute">;

/** A claim nobody has completed or failed in this long may be re-taken by the next delivery. */
export const WEBHOOK_CLAIM_TTL_MINUTES = 10;

export type WebhookConsumer = "platform" | "connect";

export type WebhookClaim =
  | { claimed: true }
  | { claimed: false; reason: "completed" }
  | { claimed: false; reason: "in_flight" };

export async function claimWebhookEvent(event: Pick<Stripe.Event, "id" | "type">, consumer: WebhookConsumer, rawPayload: unknown): Promise<WebhookClaim> {
  return claimWith(db, event, consumer, rawPayload);
}

async function claimWith(exec: SqlExec, event: Pick<Stripe.Event, "id" | "type">, consumer: WebhookConsumer, rawPayload: unknown): Promise<WebhookClaim> {
  // created_at is the last-claim time on this table: set on insert, refreshed by the re-take below. claimed_at
  // (row 98) is stamped by the same statement on both.
  const res: any = await exec.execute(sql`
    INSERT INTO platform_webhook_consumers (stripe_event_id, consumer, event_type, raw_payload, claimed_at)
    VALUES (${event.id}, ${consumer}, ${event.type}, ${JSON.stringify(rawPayload ?? {})}::jsonb, NOW())
    ON CONFLICT (stripe_event_id, consumer) DO UPDATE
      SET created_at = NOW(), claimed_at = NOW(), error = NULL
      WHERE platform_webhook_consumers.completed_at IS NULL
        AND (
          platform_webhook_consumers.error IS NOT NULL
          OR platform_webhook_consumers.created_at < NOW() - make_interval(mins => ${WEBHOOK_CLAIM_TTL_MINUTES})
        )
    RETURNING stripe_event_id
  `);
  const rows = Array.isArray(res) ? res : (res?.rows ?? []);
  if (rows.length > 0) return { claimed: true };

  // Zero rows: the read below only says WHY nothing was claimed (the error message, not the decision).
  const prior: any = await exec.execute(sql`
    SELECT completed_at FROM platform_webhook_consumers
    WHERE stripe_event_id = ${event.id} AND consumer = ${consumer}
  `);
  const priorRows = Array.isArray(prior) ? prior : (prior?.rows ?? []);
  return priorRows[0]?.completed_at ? { claimed: false, reason: "completed" } : { claimed: false, reason: "in_flight" };
}

export async function completeWebhookClaim(eventId: string, consumer: WebhookConsumer): Promise<void> {
  await db.execute(sql`
    UPDATE platform_webhook_consumers SET completed_at = NOW(), error = NULL
    WHERE stripe_event_id = ${eventId} AND consumer = ${consumer}
  `);
}

/** Records the failure and leaves `completed_at` NULL, so the next delivery re-takes the claim. */
export async function failWebhookClaim(eventId: string, consumer: WebhookConsumer, error: unknown): Promise<void> {
  const message = (error as any)?.message ?? String(error);
  await db.execute(sql`
    UPDATE platform_webhook_consumers SET error = ${message}
    WHERE stripe_event_id = ${eventId} AND consumer = ${consumer} AND completed_at IS NULL
  `);
}

/** Thrown when another delivery holds a live claim: the caller answers 500 so Stripe retries. */
export class WebhookClaimInFlightError extends Error {
  constructor(eventId: string, consumer: WebhookConsumer) {
    super(`webhook ${eventId} is being processed by another delivery (consumer=${consumer}); retry later`);
    this.name = "WebhookClaimInFlightError";
  }
}

/**
 * Runs `work` under the claim. Completed ⇒ skipped (a replay). In flight ⇒ throws, so the endpoint
 * answers 500 and Stripe redelivers after the holder has finished or its claim has aged out.
 * Failure ⇒ the error is recorded, `completed_at` stays NULL, and the error is re-thrown (500).
 */
export async function runUnderWebhookClaim(
  event: Pick<Stripe.Event, "id" | "type">,
  consumer: WebhookConsumer,
  rawPayload: unknown,
  work: () => Promise<void>,
): Promise<"processed" | "already_completed"> {
  // A signature-verified Stripe event always carries an id. A caller that hands in one without
  // (in-process tests) has nothing to claim on, so the work runs unclaimed — the same posture the
  // `webhook_events` record takes (`if (event.id)`).
  if (!event.id) {
    await work();
    return "processed";
  }
  const claim = await claimWebhookEvent(event, consumer, rawPayload);
  if (!claim.claimed) {
    if (claim.reason === "completed") return "already_completed";
    throw new WebhookClaimInFlightError(event.id, consumer);
  }
  try {
    await work();
  } catch (err) {
    await failWebhookClaim(event.id, consumer, err).catch(() => undefined);
    throw err;
  }
  await completeWebhookClaim(event.id, consumer);
  return "processed";
}

/**
 * Row 98: a failure recorded after the claim's transaction rolled back. The row may not exist (a first claim rolls
 * back with the work), so this writes it: `completed_at` stays NULL and `error` names the failure, which is what the
 * admin replay and GET /api/admin/webhooks/unprocessed read. A completed claim is never touched.
 */
export async function recordWebhookFailure(
  event: Pick<Stripe.Event, "id" | "type">,
  consumer: WebhookConsumer,
  rawPayload: unknown,
  error: unknown,
): Promise<void> {
  const message = (error as any)?.message ?? String(error);
  await db.execute(sql`
    INSERT INTO platform_webhook_consumers (stripe_event_id, consumer, event_type, raw_payload, error, claimed_at)
    VALUES (${event.id}, ${consumer}, ${event.type}, ${JSON.stringify(rawPayload ?? {})}::jsonb, ${message}, NOW())
    ON CONFLICT (stripe_event_id, consumer) DO UPDATE
      SET error = EXCLUDED.error
      WHERE platform_webhook_consumers.completed_at IS NULL
  `);
}

/**
 * Row 98, option (b): the claim, the work and the completion in ONE transaction, for a handler that takes one.
 * The claim INSERT runs first under the (stripe_event_id, consumer) primary key; a completed claim is skipped. A
 * second delivery while this one is open finds the transaction-scoped advisory lock taken and is answered in flight
 * (500, Stripe retries) rather than waiting. A throw rolls back the claim with the work, then the failure is recorded
 * outside it so the next delivery or an admin replay re-takes it. `work` must not call Stripe or send email.
 */
export async function runUnderWebhookClaimTx(
  event: Pick<Stripe.Event, "id" | "type">,
  consumer: WebhookConsumer,
  rawPayload: unknown,
  work: (tx: any) => Promise<void>,
): Promise<"processed" | "already_completed"> {
  try {
    return await db.transaction(async (tx) => {
      const lock: any = await tx.execute(sql`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${`${event.id}:${consumer}`}, 0)) AS ok
      `);
      const lockRows = Array.isArray(lock) ? lock : (lock?.rows ?? []);
      if (lockRows[0]?.ok !== true) throw new WebhookClaimInFlightError(event.id, consumer);
      const claim = await claimWith(tx, event, consumer, rawPayload);
      if (!claim.claimed) {
        if (claim.reason === "completed") return "already_completed" as const;
        throw new WebhookClaimInFlightError(event.id, consumer);
      }
      await work(tx);
      await tx.execute(sql`
        UPDATE platform_webhook_consumers SET completed_at = NOW(), error = NULL
        WHERE stripe_event_id = ${event.id} AND consumer = ${consumer}
      `);
      return "processed" as const;
    });
  } catch (err) {
    if (!(err instanceof WebhookClaimInFlightError)) {
      await recordWebhookFailure(event, consumer, rawPayload, err).catch(() => undefined);
    }
    throw err;
  }
}

/** The dispute event types whose handler takes a transaction. */
export const DISPUTE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
]);

/**
 * Row 98: a dispute event whose `charge` is only an id gets it fetched HERE, before any transaction opens, so the
 * dispute handler finds the expanded charge and makes no Stripe call inside the claim's transaction. Any other event
 * is returned as it came.
 */
export async function withExpandedDisputeCharge<E extends Pick<Stripe.Event, "type" | "data">>(
  event: E,
  stripe: Pick<Stripe, "charges">,
): Promise<E> {
  if (!DISPUTE_EVENT_TYPES.has(String(event.type))) return event;
  const dispute = event.data.object as Stripe.Dispute;
  if (typeof dispute?.charge !== "string") return event;
  const charge = await stripe.charges.retrieve(dispute.charge);
  return { ...event, data: { ...event.data, object: { ...dispute, charge } } } as E;
}
