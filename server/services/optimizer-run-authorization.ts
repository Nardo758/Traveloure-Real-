/**
 * optimizer-run-authorization.ts — the ONE decision about whether the optimizer may RUN
 * (CLAUDE.md Locked Decision 41, ledger `2026-09-05-trip-pass-run-gate`).
 *
 * THE DEFECT THIS CLOSES. Trip Pass coverage was consulted at exactly ONE place: the CHARGE
 * point, `POST /api/optimization-payments` (`coversAction(tripId, "optimizer_run")`). The RUN
 * gate — the `canRunOptimizer` decision inside `POST /api/itinerary-comparisons` and
 * `POST /api/itinerary-comparisons/:id/regenerate` — never read `trip_entitlements` at all. So a
 * pass holder running outside the 24h free-rerun window was told `{coveredByTripPass:true}` by
 * the charge gate, the client then created the comparison with NO `optimizationPaymentId`
 * (correctly — there is no PaymentIntent for a covered run), and the run gate, seeing no recent
 * run and no PI, refused: the comparison was born `pending_payment` with no variants generated.
 * The traveler had paid for the pass, was told the run was included, and got nothing. A Trip
 * Pass covers the RUN, not just the charge.
 *
 * §18 rule 1 — ONE IMPLEMENTATION, THREE CALLERS' WORTH OF RULES IN ONE PLACE. The 24h window,
 * the already-recorded-payment window and the PaymentIntent verification were written twice
 * (create and regenerate) before this module existed; adding the pass basis as a third copy is
 * exactly the derivation-drift class. Both sites now call `resolveOptimizerRunAuthorization`
 * and branch on its discriminated result.
 *
 * §14 POSTURE — EVERY INPUT TO THE DECISION IS SERVER-DERIVED. The caller supplies the acting
 * user from the session, the trip from a row it has already authorized (the body trip on create,
 * the STORED comparison's trip on regenerate — never `req.body` on regenerate), and the recorded
 * payment from the comparison row. The only client-supplied value is the PaymentIntent id, and
 * it is never trusted: it is handed to the caller's `verifyPayment` (Stripe retrieve + amount
 * re-derivation) before it can authorize anything.
 *
 * DELIBERATELY DEPENDENCY-FREE. This module imports no `db`, no `storage` and no Stripe client:
 * the three facts it needs arrive as injected functions. That is what lets the decision be
 * proven by a pure test in CI with no database (the `pending-events.pure.ts` precedent), which
 * matters here because the failure it fixes produced NO error anywhere — a `pending_payment`
 * comparison renders as "payment required", which is indistinguishable from working software.
 *
 * WHAT THIS MODULE DOES NOT DO (stated negative space):
 *   - It never CHARGES, never claims a PaymentIntent and never writes a row. A `paid` result
 *     carrying `claimRequired: true` tells the caller it must still run its own §15 atomic
 *     conditional claim; this module makes no state transition of its own.
 *   - It never consumes a Trip Pass allowance. `optimizer_run` coverage is unlimited by ruling
 *     (`trip-entitlement.service.ts`), so a pass-authorized run decrements nothing and takes no
 *     claim — there is no counter to race on.
 *   - It says nothing about whether there is anything TO optimize (the empty-baseline /
 *     cart-conversion pre-flights stay with their callers) and nothing about who may touch the
 *     trip (ownership is authorized by the caller BEFORE this is consulted).
 */

/** The documented free-re-run window (`/api/optimization-payments` returns `freeRerun` on the same clock). */
export const OPTIMIZATION_FREE_RERUN_MS = 24 * 60 * 60 * 1000;

/**
 * WHY the optimizer may run. Recorded honestly wherever the run is reported — a pass-covered run
 * and a free re-run are different facts and must never be reported as each other (§13).
 */
export type OptimizerRunBasis = "trip_pass" | "free_rerun" | "paid";

export type OptimizerRunAuthorization =
  /** An active Trip Pass on THIS trip covers the run (ruling 2026-08-29-trip-pass). No charge, no claim. */
  | { authorized: true; basis: "trip_pass" }
  /** The caller completed an optimization inside the documented 24h window. No charge, no claim. */
  | { authorized: true; basis: "free_rerun" }
  /**
   * A verified optimization payment authorizes the run. `claimRequired` says whether the caller
   * still has to record it: false = the PI is ALREADY on the comparison row (regenerate case (b),
   * verified at create and still inside the window); true = a freshly verified PI the caller must
   * record with its own atomic conditional so it can never be spent twice (§15).
   */
  | { authorized: true; basis: "paid"; optimizationPaymentId: string; claimRequired: boolean }
  /** No basis at all. The caller decides what that means on its own surface (born `pending_payment` on create; 402 on regenerate). */
  | { authorized: false; reason: "payment_required" }
  /**
   * A PaymentIntent was supplied and REFUSED by verification (reuse, wrong target, wrong amount,
   * unconfirmed, …). Carries the verifier's own status/body verbatim — the caller answers with it
   * rather than collapsing every refusal into one message.
   */
  | { authorized: false; reason: "payment_rejected"; status: number; body: Record<string, unknown> };

export type OptimizerPaymentVerification =
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> };

export interface OptimizerRunAuthorizationDeps {
  /** `coversAction(tripId, "optimizer_run")` — server-side entitlement read; the client never asserts coverage. */
  tripPassCoversRun: (tripId: string) => Promise<boolean>;
  /** `storage.getRecentOptimizationRun(userId, cutoff)` reduced to the only thing the decision needs. */
  hasRecentOptimizationRun: (userId: string, cutoff: Date) => Promise<boolean>;
  /** `verifyOptimizationPayment` — Stripe retrieve, PI→user/target binding, server-re-derived amount. */
  verifyPayment: (params: {
    userId: string;
    optimizationPaymentId: string;
    tripId?: string;
    userExperienceId?: string;
  }) => Promise<OptimizerPaymentVerification>;
  /** Test seam only. Defaults to `Date.now`. */
  now?: () => number;
}

export interface OptimizerRunAuthorizationInput {
  /** The acting user, from the session (§14) — never from a body. */
  userId: string;
  /** The trip this run is for, from a row the caller has ALREADY authorized. */
  tripId?: string | null;
  userExperienceId?: string | null;
  /** Client-supplied PaymentIntent id. Verified before it authorizes anything; never trusted. */
  optimizationPaymentId?: string | null;
  /** Regenerate only: the payment already recorded on the comparison, and when that row was created. */
  recordedPaymentId?: string | null;
  recordedPaymentAt?: Date | null;
}

/**
 * Resolve whether the optimizer may run, and on what basis.
 *
 * ORDER, and why it is this order:
 *   1. TRIP PASS first — the same order the charge gate uses, so the two gates can never
 *      disagree about a covered trip. It is also the honest basis: when a pass covers the trip,
 *      "free re-run" would be the wrong reason to report even when it also happens to be true.
 *   2. FREE RE-RUN — identical clock and query to `POST /api/optimization-payments`.
 *   3. THE PAYMENT ALREADY RECORDED on this comparison, inside the same window (regenerate only)
 *      — covers a re-run fired before the first run has stamped `optimizedAt`, so a just-paid
 *      traveler is never charged twice.
 *   4. A FRESHLY SUPPLIED PaymentIntent, verified.
 * Bases 1-3 need no PaymentIntent, so a run they authorize never verifies, claims or consumes
 * one — exactly as the free-re-run path behaved before this module existed.
 */
export async function resolveOptimizerRunAuthorization(
  input: OptimizerRunAuthorizationInput,
  deps: OptimizerRunAuthorizationDeps,
): Promise<OptimizerRunAuthorization> {
  const nowMs = (deps.now ?? Date.now)();
  const cutoff = new Date(nowMs - OPTIMIZATION_FREE_RERUN_MS);

  // 1. Trip Pass. Scoped to THIS trip: a pass on any other trip authorizes nothing, and a run
  //    with no trip at all (cart / experience-template flows) has no trip to be covered.
  const tripId = normalizeId(input.tripId);
  if (tripId && (await deps.tripPassCoversRun(tripId))) {
    return { authorized: true, basis: "trip_pass" };
  }

  // 2. The documented 24h free re-run.
  if (await deps.hasRecentOptimizationRun(input.userId, cutoff)) {
    return { authorized: true, basis: "free_rerun" };
  }

  // 3. This comparison's own payment, verified at create and still inside the window.
  const recordedPaymentId = normalizeId(input.recordedPaymentId);
  if (recordedPaymentId && input.recordedPaymentAt && input.recordedPaymentAt >= cutoff) {
    return {
      authorized: true,
      basis: "paid",
      optimizationPaymentId: recordedPaymentId,
      claimRequired: false,
    };
  }

  // 4. A freshly supplied PaymentIntent — verified before it authorizes anything.
  const suppliedPaymentId = normalizeId(input.optimizationPaymentId);
  if (suppliedPaymentId) {
    const check = await deps.verifyPayment({
      userId: input.userId,
      optimizationPaymentId: suppliedPaymentId,
      tripId: tripId ?? undefined,
      userExperienceId: normalizeId(input.userExperienceId) ?? undefined,
    });
    if (check.ok === false) {
      return { authorized: false, reason: "payment_rejected", status: check.status, body: check.body };
    }
    return {
      authorized: true,
      basis: "paid",
      optimizationPaymentId: suppliedPaymentId,
      claimRequired: true,
    };
  }

  return { authorized: false, reason: "payment_required" };
}

/** An empty string is an ABSENT id, not an id — never let one reach an entitlement or Stripe lookup. */
function normalizeId(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The one place the pass-covered run is announced. Mirrors the charge gate's
 * `[trip-pass] optimizer charge suppressed (covered_by:trip_pass)` line verbatim in shape, because
 * the durable record is the SAME one that ruling names for the suppressed charge: the active
 * `trip_entitlements` row on the trip plus the absence of a PaymentIntent on the comparison.
 *
 * §13 — WHAT IS *NOT* RECORDED, said out loud. `itinerary_comparisons` has no basis column: it
 * records a payment IDENTITY (`optimization_payment_id`) and nothing else, so a free re-run and a
 * pass-covered run are both stored as "no payment id". Writing a sentinel like `"trip_pass"` into
 * that column would be a lie about a payment identity (§19a) and would poison the reuse check
 * that reads it, and a $0 `fee_ledger` row is forbidden by that table's `amount<>0` CHECK. So the
 * basis is reported (log line + the run response's `runBasis`) and reconstructible from the
 * entitlement row — it is deliberately NOT claimed to be pinned per comparison.
 */
export function logOptimizerRunBasis(
  basis: OptimizerRunBasis,
  ctx: { tripId?: string | null; comparisonId?: string | null },
): void {
  if (basis !== "trip_pass") return;
  console.log(
    `[trip-pass] optimizer run authorized (covered_by:trip_pass) trip=${ctx.tripId ?? "none"} comparison=${ctx.comparisonId ?? "pending"}`,
  );
}
