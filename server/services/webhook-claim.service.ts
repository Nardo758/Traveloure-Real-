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
 * re-take, so "older than the TTL" means "nobody has claimed it for that long". There is no
 * `claimed_at` column; a proper one belongs to the next migration that touches this table
 * (decision-maker, Oct 15, 2026), not to this lane.
 */
import { sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "../db";

/** A claim nobody has completed or failed in this long may be re-taken by the next delivery. */
export const WEBHOOK_CLAIM_TTL_MINUTES = 10;

export type WebhookConsumer = "platform" | "connect";

export type WebhookClaim =
  | { claimed: true }
  | { claimed: false; reason: "completed" }
  | { claimed: false; reason: "in_flight" };

export async function claimWebhookEvent(event: Pick<Stripe.Event, "id" | "type">, consumer: WebhookConsumer, rawPayload: unknown): Promise<WebhookClaim> {
  // created_at is the last-claim time on this table: set on insert, refreshed by the re-take below.
  const res: any = await db.execute(sql`
    INSERT INTO platform_webhook_consumers (stripe_event_id, consumer, event_type, raw_payload)
    VALUES (${event.id}, ${consumer}, ${event.type}, ${JSON.stringify(rawPayload ?? {})}::jsonb)
    ON CONFLICT (stripe_event_id, consumer) DO UPDATE
      SET created_at = NOW(), error = NULL
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
  const prior: any = await db.execute(sql`
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
