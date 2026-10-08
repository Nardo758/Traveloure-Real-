/**
 * ONE OPEN OPTIMIZE PAYMENT PER PLAN (ledger `2026-10-08-optimize-pay-flow`; decision-maker, Oct 8, 2026 —
 * the f413eda smoke: every press of Optimize minted a fresh PaymentIntent).
 *
 * `POST /api/optimization-payments` creates its PaymentIntent under a DETERMINISTIC idempotency key per
 * user, plan and day (§15) — so a second press REPLAYS the same open intent and Stripe mints nothing. A
 * key whose intent is no longer usable is skipped for the next link of the same chain:
 *   · `canceled`  — the traveler pressed Cancel (`POST /api/optimization-payments/cancel`);
 *   · `succeeded` AND already spent on a run (a comparison carries it as `optimization_payment_id`);
 *   · Stripe refused the replay because the request differs (a band edit moved the price, a new
 *     customer id) — a different request is a different intent, never a silent amount change (§14).
 * A `succeeded` intent no run has used yet is RETURNED: the traveler paid and nothing ran, so the run
 * goes ahead on that payment rather than charging again.
 *
 * PURE over its injected calls, so the decision is provable without Stripe or a database.
 */
export const OPEN_INTENT_MAX_LINKS = 8;

export interface OptimizationIntentLike {
  id: string;
  status: string;
  client_secret?: string | null;
}

export interface OpenIntentDeps<P extends OptimizationIntentLike> {
  /** Create (or replay) the intent under this idempotency key. */
  create: (idempotencyKey: string) => Promise<P>;
  /** Has a run already been authorized by this intent? */
  consumed: (paymentIntentId: string) => Promise<boolean>;
}

/** Stripe's answer when a key is replayed with different parameters. */
export function isIdempotencyMismatch(err: unknown): boolean {
  const e = err as { type?: string; rawType?: string } | null;
  return e?.type === "StripeIdempotencyError" || e?.rawType === "idempotency_error";
}

export function openIntentKey(baseKey: string, link: number): string {
  return `${baseKey}-a${link}`;
}

/** The plan's open intent (new or replayed), or null when every link is spent (the caller refuses). */
export async function reuseOrCreateOptimizationIntent<P extends OptimizationIntentLike>(
  baseKey: string,
  deps: OpenIntentDeps<P>,
  maxLinks: number = OPEN_INTENT_MAX_LINKS,
): Promise<P | null> {
  for (let link = 0; link < maxLinks; link++) {
    let pi: P;
    try {
      pi = await deps.create(openIntentKey(baseKey, link));
    } catch (err) {
      if (isIdempotencyMismatch(err)) continue;
      throw err;
    }
    if (pi.status === "canceled") continue;
    if (pi.status === "succeeded" && (await deps.consumed(pi.id))) continue;
    return pi;
  }
  return null;
}

/** Statuses Cancel may cancel — never `processing` or `succeeded` (the `cancelStalePaymentIntent` rule). */
export const OPTIMIZATION_INTENT_CANCELABLE = new Set(["requires_payment_method", "requires_confirmation", "requires_action"]);

/**
 * Cancel on the Optimize pay sheet — the decision, over injected Stripe calls (ledger
 * `2026-10-08-optimize-pay-flow`). The intent is READ first; one that is not an `optimization_fee` bound to
 * this session user is ONE 404 (LD 40: "no such thing" and "not yours" are the same sentence) and NO cancel
 * call is made. `processing` and `succeeded` are never canceled.
 */
export type CancelIntentOutcome =
  | { httpStatus: 404 }
  | { httpStatus: 200; canceled: boolean; status: string };

export async function cancelOwnOptimizationIntent(
  sessionUserId: string,
  paymentIntentId: string,
  deps: {
    retrieve: (id: string) => Promise<{ id: string; status: string; metadata?: Record<string, string> | null } | null>;
    cancel: (id: string) => Promise<{ status: string }>;
  },
): Promise<CancelIntentOutcome> {
  const pi = await deps.retrieve(paymentIntentId);
  if (!pi || pi.metadata?.type !== "optimization_fee" || pi.metadata?.userId !== sessionUserId) return { httpStatus: 404 };
  if (!OPTIMIZATION_INTENT_CANCELABLE.has(pi.status)) return { httpStatus: 200, canceled: pi.status === "canceled", status: pi.status };
  const out = await deps.cancel(pi.id);
  return { httpStatus: 200, canceled: out.status === "canceled", status: out.status };
}
