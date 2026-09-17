/**
 * THE IN-FLIGHT MARKER FOR AN AI ASK — one ask per (plan, asker) at a time.
 *
 * (decision-maker ruling 2026-09-16, punchlist **D-46** = A, amended; ledger
 *  `2026-09-16-l16-rulings-d45-d50`. CLAUDE.md Locked Decision 45 (3), §13, §14, §15, §18 rule 1.)
 *
 * ── WHAT IT IS FOR, AND WHAT IT IS NOT ───────────────────────────────────────────────────────
 * Asking is FREE (punchlist D-21), so this protects **tokens**, not money. A double-submit must not
 * make two model calls; the proposal ROW is cheap and discardable, the model call is not. That is
 * the whole job.
 *
 * **IT IS NOT A §15 CLAIM AND MUST NEVER BE MISTAKEN FOR ONE.** A §15 claim is an atomic
 * conditional on a DURABLE row, taken before a money movement, so a retry produces one effect. This
 * is an in-memory marker on a free operation. The money path's claim for this product is elsewhere
 * and unchanged — `claimProposalCharge` (`server/services/proposal-charge.service.ts`), an atomic
 * `UPDATE … WHERE … charge_claimed_at IS NULL` on the proposal row. Nothing here touches it, and no
 * caller may use this marker to authorize a charge.
 *
 * ── D-46 (i): THE ID IS MINTED BEFORE THE MODEL CALL, AND THE MARKER HOLDS IT ────────────────
 * The server mints the proposal id (`randomUUID`) FIRST, hands it to this marker, then makes the
 * model call, then hands the SAME id to `createPlanProposal` explicitly. So a 409 can name a
 * proposal that has no row yet. **That is intended, not a defect:** the caller is told which ask is
 * already running, and the id it names is the id the row will carry if that ask succeeds. §13 is
 * satisfied by the drawer saying "an answer is already on its way", never by claiming a row exists.
 *
 * ── D-46 (iii): THE STORE IS PER PROCESS, AND THAT IS AN ACCEPTED LIMIT ──────────────────────
 * `.replit` declares `deploymentTarget = "autoscale"`, so two instances hold two maps and a
 * cross-instance double-submit makes two model calls. **ACCEPTED for L16 by ruling** — the exposure
 * is tokens, not money — and the shared-store lane is filed in `docs/PUNCHLIST.md` §4 with its
 * trigger stated verbatim: *"when observed instance count > 1 or ask volume makes token spend
 * material."* Do not close it quietly by adding a second store; close it in that lane, for this
 * marker and for `message-rate-limiter.ts`'s counters together.
 *
 * ── §13: A STALE MARKER IS A BUG, SO IT EXPIRES ─────────────────────────────────────────────
 * A process that dies mid-ask, or a caller that forgets its `finally`, would otherwise wedge a plan
 * forever. Every marker carries a TTL and an expired one is treated as ABSENT — the failure mode of
 * an expiring marker is one extra model call, and the failure mode of a permanent one is a traveler
 * who can never ask about their own plan again. The first is the one to have.
 *
 * ── §14 ─────────────────────────────────────────────────────────────────────────────────────
 * The key is (tripId, askerUserId). The asker comes from the SESSION at the one call site, never
 * from a body or a query string. The marker grants nothing: it is a mutual exclusion, not a
 * permission, and the route's own §12 gate has already run before this is reached.
 */

/**
 * How long a marker may stand before it is treated as absent. A model call that has not returned in
 * three minutes has failed in a way nobody is waiting on. Not a fee, rate or band (§8) — a liveness
 * window, the posture the ready-made fulfilment grace already takes.
 */
export const AI_ASK_INFLIGHT_TTL_MS = 3 * 60 * 1000;

interface InFlightEntry {
  /** The PRE-MINTED proposal id this ask will carry if it succeeds (D-46 i). */
  proposalId: string;
  /** When this marker stops being believed. */
  expiresAt: number;
}

const inFlight = new Map<string, InFlightEntry>();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of Array.from(inFlight.entries())) {
    if (entry.expiresAt <= now) inFlight.delete(key);
  }
}, 60 * 1000);
// Never let housekeeping hold the event loop open (the `message-rate-limiter.ts` posture).
sweep.unref?.();

function keyFor(tripId: string, userId: string): string {
  return `ai-ask:${tripId}:${userId}`;
}

export type BeginAiAskResult =
  | { started: true }
  /** Refused: an ask is already running for this (plan, asker). `proposalId` is the IN-FLIGHT one. */
  | { started: false; inFlightProposalId: string };

/**
 * Take the marker for (tripId, askerUserId), holding `proposalId`.
 *
 * Returns `{started:true}` when this caller now owns the ask, or `{started:false, ...}` naming the
 * ask already running. The caller MUST clear it in a `finally` — see {@link endAiAsk} — so that a
 * thrown model call does not wedge the plan for the TTL.
 *
 * This is a single-threaded check-and-set in one synchronous function body, which is why it is
 * sound here and would NOT be sound as a database pre-check: Node runs it to completion with no
 * await inside, so no second request can interleave between the read and the write. A durable
 * equivalent would have to be an atomic conditional (§15); this one is not durable and does not
 * pretend to be.
 */
export function beginAiAsk(params: {
  tripId: string;
  userId: string;
  proposalId: string;
  /** Test seam only. Never supplied in production. */
  now?: number;
}): BeginAiAskResult {
  const now = params.now ?? Date.now();
  const key = keyFor(params.tripId, params.userId);
  const existing = inFlight.get(key);
  if (existing && existing.expiresAt > now) {
    return { started: false, inFlightProposalId: existing.proposalId };
  }
  inFlight.set(key, { proposalId: params.proposalId, expiresAt: now + AI_ASK_INFLIGHT_TTL_MS });
  return { started: true };
}

/**
 * Release the marker for (tripId, askerUserId).
 *
 * Deliberately UNCONDITIONAL on the proposal id: the only writer of a marker is `beginAiAsk`, the
 * only releaser is the caller that won it, and a caller whose marker already expired releasing a
 * successor's would need to have been running longer than the TTL — at which point one extra model
 * call is the accepted failure (see the header). Refusing to release on an id mismatch would be the
 * worse trade: a wedged plan.
 */
export function endAiAsk(tripId: string, userId: string): void {
  inFlight.delete(keyFor(tripId, userId));
}

/** Read the marker without taking it. Returns the in-flight proposal id, or null. */
export function peekAiAsk(tripId: string, userId: string, now: number = Date.now()): string | null {
  const entry = inFlight.get(keyFor(tripId, userId));
  if (!entry || entry.expiresAt <= now) return null;
  return entry.proposalId;
}

/** Test-only: clear every marker so suites do not leak state between cases. */
export function __resetAiAskInFlight(): void {
  inFlight.clear();
}
