/**
 * proposal-apply-authorization.ts — the ONE decision about whether an AI proposal may be APPLIED.
 *
 * (decision-maker rulings 2026-09-15, punchlist **D-20** = A and **D-21** = A; ledger
 *  `2026-09-15-d20-d21-proposal-charge`; migration 300. CLAUDE.md Locked Decision 45 (3) — every
 *  Ask-AI answer is a PROPOSAL, charged only at apply — Locked Decision 41 (a) (the shape this
 *  module copies) and 41 (f) (the `ai_task` entitlement that until now had NO charge site at all),
 *  §13, §14, §15, §18 rule 1.)
 *
 * ── WHAT IT DECIDES, AND WHAT IT REFUSES TO DECIDE ───────────────────────────────────────────
 * It answers exactly one question: **has this apply been paid for, and on what basis?** It says
 * NOTHING about who may touch the trip (the route runs the shared §12 WRITE-access gate BEFORE
 * this is consulted), nothing about whether the proposal is still `proposed` (the apply's own
 * atomic conditional is that guard — §15: a check is not a claim), and nothing about what the
 * change set contains.
 *
 * ── THE ORDER, AND WHY IT IS THIS ORDER ──────────────────────────────────────────────────────
 *   1. **TRIP PASS** — `coversAction(tripId, "ai_task")`, the server's own entitlement read; the
 *      client never asserts coverage. FIRST, for exactly the reason Locked Decision 41 (a) gives
 *      for the optimizer: the CHARGE gate and the APPLY gate must never disagree about a covered
 *      plan. LD 41 (a)'s whole defect was a pass holder being told "included" by one gate and
 *      "payment required" by the other, with nothing thrown and nothing logged. Putting the pass
 *      first in the ONE predicate both gates call is what makes that unrepeatable here.
 *   2. **PAID** — a PaymentIntent for THIS proposal, verified `succeeded` server-side.
 *
 * There is deliberately **NO free-re-run basis**. The optimizer's 24h window is a property of that
 * product's pricing; an AI task has none, and a basis nothing writes is a state no reader should
 * ever have to classify (§13).
 *
 * ── A TRIP PASS TAKES NO CLAIM AND SPENDS NO PaymentIntent ───────────────────────────────────
 * `ai_task` coverage is UNLIMITED by ruling (`trip-entitlement.service.ts`), so there is no
 * counter to race on: a covered apply decrements nothing, claims nothing and creates no
 * PaymentIntent. A supplied PaymentIntent is neither verified nor recorded on a covered apply.
 *
 * ── DELIBERATELY DEPENDENCY-FREE ─────────────────────────────────────────────────────────────
 * This module imports no `db`, no `storage` and no Stripe client: both facts it needs arrive as
 * injected functions, exactly as `resolveOptimizerRunAuthorization` does. That is what lets the
 * decision be proven by a pure CI test with no database — which matters here for the same reason
 * it mattered there: the failure this class produces is SILENT. An apply that was never authorized
 * and an apply that was authorized and simply had nothing to add look identical on a slip.
 *
 * ── IT NEVER WRITES ──────────────────────────────────────────────────────────────────────────
 * It takes no claim, stamps no PaymentIntent and makes no state transition. A `paid` result says
 * whether the caller still owes its own §15 atomic conditional (`claimRequired`); the caller does
 * that, not this.
 */

import {
  PLAN_PROPOSAL_CHARGE_BASIS_PAID,
  PLAN_PROPOSAL_CHARGE_BASIS_TRIP_PASS,
  type PlanProposalChargeBasis,
} from "@shared/plan-proposals";

/** WHY the apply was allowed. Recorded honestly wherever it is reported (§13). */
export type ProposalApplyBasis = PlanProposalChargeBasis;

export type ProposalApplyAuthorization =
  /** An active Trip Pass on THIS plan covers the task. No charge, no claim, no PaymentIntent. */
  | { authorized: true; basis: typeof PLAN_PROPOSAL_CHARGE_BASIS_TRIP_PASS }
  /**
   * A verified PaymentIntent for THIS proposal authorizes the apply. `claimRequired` says whether
   * the caller still has to record it: `false` = the PI is ALREADY stamped on the proposal row
   * (the pay rail recorded it); `true` = a freshly verified PI the caller must record with its own
   * atomic conditional so it can never be spent twice (§15).
   */
  | {
      authorized: true;
      basis: typeof PLAN_PROPOSAL_CHARGE_BASIS_PAID;
      paymentIntentId: string;
      claimRequired: boolean;
      /**
       * What Stripe says was ACTUALLY charged, carried out of the verifier so the row records the
       * charge that happened rather than the band's value at the moment of apply. §14: the amount
       * is server-derived at BOTH ends — the band priced the intent, Stripe reports what it took,
       * and a band edited between the two moves future charges without rewriting this one.
       */
      amountCents: number;
    }
  /** No basis at all — the traveler has not paid and no pass covers the plan. The caller answers 402. */
  | { authorized: false; reason: "payment_required" }
  /**
   * A PaymentIntent was supplied or found and REFUSED by verification (not succeeded, not this
   * proposal's, wrong amount, …). Carries the verifier's own reason verbatim so the caller answers
   * with it rather than collapsing every refusal into one message (§13).
   */
  | { authorized: false; reason: "payment_rejected"; detail: string };

export type ProposalPaymentVerification =
  | { ok: true; amountCents: number }
  | { ok: false; detail: string };

export interface ProposalApplyAuthorizationDeps {
  /** `coversAction(tripId, "ai_task")` — the SERVER's entitlement read, never a client assertion. */
  tripPassCoversTask: (tripId: string) => Promise<boolean>;
  /**
   * Stripe retrieve + binding check: the PaymentIntent must be `succeeded` AND name THIS proposal
   * in its own metadata. A client-supplied id is never trusted; it is handed here first (§15c
   * posture — a client-supplied PaymentIntent may never resolve or stamp anything on its own word).
   */
  verifyPayment: (params: {
    paymentIntentId: string;
    proposalId: string;
  }) => Promise<ProposalPaymentVerification>;
}

export interface ProposalApplyAuthorizationInput {
  /** The proposal being applied. The unit of charge (D-21 = A). */
  proposalId: string;
  /** The plan it belongs to, read from the ROW — never from a body (§14). */
  tripId: string;
  /**
   * The PaymentIntent already STAMPED on the proposal row by the pay rail, if any. Server-sourced:
   * the row's own column, written by the one writer §19a names.
   */
  recordedPaymentIntentId?: string | null;
  /**
   * A PaymentIntent the CLIENT supplied. Never trusted — it reaches `verifyPayment` before it can
   * authorize anything, and it is only consulted when the row carries none.
   */
  suppliedPaymentIntentId?: string | null;
}

export async function resolveProposalApplyAuthorization(
  input: ProposalApplyAuthorizationInput,
  deps: ProposalApplyAuthorizationDeps,
): Promise<ProposalApplyAuthorization> {
  // 1. TRIP PASS, first and scoped to THIS plan. An empty trip id is an ABSENT trip, not a trip —
  //    never let one reach an entitlement lookup.
  const tripId = normalizeId(input.tripId);
  if (tripId && (await deps.tripPassCoversTask(tripId))) {
    return { authorized: true, basis: PLAN_PROPOSAL_CHARGE_BASIS_TRIP_PASS };
  }

  const proposalId = normalizeId(input.proposalId);
  if (!proposalId) return { authorized: false, reason: "payment_required" };

  // 2. THE PAYMENT RECORDED ON THE ROW. It is still verified against Stripe: a stamped id proves
  //    a PaymentIntent was CREATED for this proposal, never that it was PAID (the pay rail stamps
  //    before the traveler confirms the sheet). `claimRequired: false` — the row already carries it.
  const recorded = normalizeId(input.recordedPaymentIntentId);
  if (recorded) {
    const check = await deps.verifyPayment({ paymentIntentId: recorded, proposalId });
    if (check.ok === false) {
      return { authorized: false, reason: "payment_rejected", detail: check.detail };
    }
    return {
      authorized: true,
      basis: PLAN_PROPOSAL_CHARGE_BASIS_PAID,
      paymentIntentId: recorded,
      claimRequired: false,
      amountCents: check.amountCents,
    };
  }

  // 3. A FRESHLY SUPPLIED PaymentIntent — verified before it authorizes anything, and the caller
  //    still owes the §15 atomic conditional that records it.
  const supplied = normalizeId(input.suppliedPaymentIntentId);
  if (supplied) {
    const check = await deps.verifyPayment({ paymentIntentId: supplied, proposalId });
    if (check.ok === false) {
      return { authorized: false, reason: "payment_rejected", detail: check.detail };
    }
    return {
      authorized: true,
      basis: PLAN_PROPOSAL_CHARGE_BASIS_PAID,
      paymentIntentId: supplied,
      claimRequired: true,
      amountCents: check.amountCents,
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
 * The one place a pass-covered apply is announced, mirroring the ratified provenance line
 * (`2026-08-29-trip-pass-provenance`, Locked Decision 41 (a)) in shape.
 *
 * §13 — WHAT *IS* RECORDED HERE, and it differs from the optimizer's answer on purpose. LD 41 (a)
 * could not pin the optimizer's basis to a row because `itinerary_comparisons` has no basis column
 * and a `"trip_pass"` sentinel in its PAYMENT-IDENTITY column would have been a fabricated payment
 * identity (§19a). D-21 ratifies the proposal row as the claim's home, so here the basis IS
 * durably recorded — in `plan_proposals.charge_basis`, a column of its own, never in the payment
 * identity column. The log line stays because an operator reading stdout should see the same fact
 * the row carries.
 */
export function logProposalApplyBasis(
  basis: ProposalApplyBasis,
  ctx: { tripId?: string | null; proposalId?: string | null },
): void {
  if (basis !== PLAN_PROPOSAL_CHARGE_BASIS_TRIP_PASS) return;
  console.log(
    `[trip-pass] ai task charge suppressed (covered_by:trip_pass) trip=${ctx.tripId ?? "none"} proposal=${ctx.proposalId ?? "none"}`,
  );
}
