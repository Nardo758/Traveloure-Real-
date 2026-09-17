/**
 * THE ONE PLACE A PLAN PROPOSAL'S VOCABULARY IS WRITTEN DOWN.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-19** = option (b); ledger
 *  `2026-09-15-d19-plan-proposals`; migration 299. CLAUDE.md Locked Decision 45 (3), Locked
 *  Decision 42 D3 / D4 / D18 / D23, §13, §18 rule 1, §19.)
 *
 * `plan_proposals.status` carries **NO DB CHECK** (the publish-trap posture) and **NO DEFAULT**,
 * so the value set is APP-ENFORCED — which only means anything if it is stated ONCE. A second
 * copy of this list in a route, a service or a client is the derivation-drift class §18 rule 1
 * names, and it is how a reader starts classifying a status the writer never writes.
 *
 * ── WHAT A PROPOSAL IS ───────────────────────────────────────────────────────────────────────
 * An answer the AI gives about ONE plan, staged beside that plan, changing nothing until the
 * traveler applies it. It is deliberately NOT an expert `trip_suggestions` row: that table's
 * `expert_id` is NOT NULL and its approve path hardcodes `origin:'expert'`, so an AI author there
 * would render in the expert's treatment — the false attribution Locked Decision 42 D4 and D23
 * forbid by name.
 */

/**
 * The three states, in the order a row can move through them.
 *
 * `proposed`  — staged, nothing has changed on the plan. The only state this lane ever writes.
 * `applied`   — the traveler applied it; `applied_item_ids` records the `itinerary_items` rows
 *               the apply created. **A RECORD, NEVER AN UNDO** (Locked Decision 42 D18: apply
 *               replaces every in-planning row in one transaction and nothing holds the previous
 *               set, so no surface may offer a reverse on the strength of this).
 * `discarded` — the traveler read it and said no. Discarding costs nothing and the row STAYS, so
 *               the plan's proposal log remains a true record of what was offered.
 *
 * `refunded`  — (decision-maker ruling 2026-09-16, OPTION B — refund the fee on expiry; ledger
 *               `2026-09-16-l16-lane1-review-fixes`.) The traveler PAID, and before the apply
 *               landed the proposal went stale or a listing it names went away. It is NOT applied
 *               at a changed price and NOT left terminally unappliable with money taken: the fee is
 *               refunded, and this is the terminal state that records it. The flip to it IS the
 *               §15b claim on the refund — taken atomically BEFORE the Stripe call — so the row is
 *               never `proposed` again and can never be applied or discarded afterwards. It is
 *               deliberately ONE state for every refusal reason — stale price, unavailable listing
 *               and, since the 2026-09-17 widening, protected work (LD 42 D3): what happened to the
 *               MONEY is the same, and the `refunds` audit row carries the reason.
 *
 * There is no `expired`, no `superseded` and no `failed`. Two ways to say one thing is how a
 * reader ends up guessing which was meant (§13, the ruling-31 posture on empty states). A paid
 * proposal that expires is `refunded`, never `expired`: the state names what the platform DID,
 * not what time did.
 */
export const PLAN_PROPOSAL_STATUSES = ["proposed", "applied", "discarded", "refunded"] as const;
export type PlanProposalStatus = (typeof PLAN_PROPOSAL_STATUSES)[number];

/** The state a proposal is BORN in. Stated here so no writer has to restate the literal. */
export const PLAN_PROPOSAL_STATUS_PROPOSED: PlanProposalStatus = "proposed";
/** The state `discardPlanProposal`'s atomic conditional writes. Same reason: one literal, one home. */
export const PLAN_PROPOSAL_STATUS_DISCARDED: PlanProposalStatus = "discarded";
/**
 * The state an APPLY writes. **Nothing in the D-19 lane writes it** — the apply is the charge
 * point and belongs to punchlist D-20/D-21 — but it is named here so that lane restates no
 * literal either.
 */
export const PLAN_PROPOSAL_STATUS_APPLIED: PlanProposalStatus = "applied";
/**
 * The state `refundRefusedProposalCharge`'s atomic conditional writes (OPTION B, ledger
 * `2026-09-16-l16-lane1-review-fixes`). One literal, one home.
 */
export const PLAN_PROPOSAL_STATUS_REFUNDED: PlanProposalStatus = "refunded";

/** Fails closed: a NULL, a non-string or any unrecognised value is not a status. */
export function isPlanProposalStatus(value: unknown): value is PlanProposalStatus {
  return typeof value === "string" && (PLAN_PROPOSAL_STATUSES as readonly string[]).includes(value);
}

/**
 * ── THE PROPOSED CHANGE SET ──────────────────────────────────────────────────────────────────
 *
 * The shape stored in `plan_proposals.proposal` (jsonb). It is a TS type rather than a DB CHECK
 * or a zod parse of stored rows, for the same reason the status has no CHECK: the column must
 * stay permissive so a later shape does not become a publish-time push failure. What the SERVER
 * writes is narrowed by `planProposalCreateSchema` (`shared/schema.ts`, §19 allowlist); what it
 * READS back is treated as data, and a reader that cannot understand a row says so rather than
 * rendering a guess (§13).
 *
 * §13 RUNS THROUGH EVERY FIELD HERE. An absent price is "the source did not state one", never
 * `0`; an absent day is "unplaced", never day 1. That is why nearly everything is optional and
 * why nothing carries a zero default.
 */

/** One item the proposal would ADD to the plan. Mirrors the honest subset of an itinerary item. */
export interface PlanProposalAddition {
  /** What the traveler would see on the row. The one field a proposal cannot be without. */
  title: string;
  description?: string;
  /** Free-text day/slot hints. NOT a schedule: a proposal places nothing by itself. */
  dayNumber?: number;
  startTime?: string;
  endTime?: string;
  location?: string;
  /**
   * A price ONLY where one was actually found. The L16 brief's §4 rule is a rule about the
   * PAYLOAD, not a slogan: prices and availability are never invented, and a missing one is said
   * out loud. Absent ⇒ the surface omits the line; it never renders "$0" (§13).
   */
  estimatedCost?: string;
  /** The catalog row this addition names, when it names one. Absent ⇒ it names nothing bookable. */
  providerServiceId?: string;
  /** Why the AI is proposing this, in its own words. Attributed to the AI, never to an expert. */
  reason?: string;
}

/**
 * An existing plan row the proposal would REPLACE, named by `itinerary_items.id`.
 *
 * Locked Decision 42 **D3**: an item carrying `expert_note` or `origin='expert'`, and any booked
 * row, is PROTECTED — injected into the optimizer as a constraint, never emitted as a suggestion
 * and never deleted by an apply. A proposal therefore must never name one here, and the protected
 * set is resolved by the ONE existing predicate (`server/services/optimizer-baseline.service.ts`),
 * never by a second "is this expert work?" test written beside it (§18 rule 1). `protectedNote`
 * is where the proposal SAYS ON SCREEN what it will not touch, which the brief requires in the
 * payload rather than only in code.
 */
export interface PlanProposalReplacement {
  itemId: string;
  reason?: string;
}

export interface PlanProposalChangeSet {
  /** Items the proposal would add. Empty or absent ⇒ the proposal adds nothing. */
  additions?: PlanProposalAddition[];
  /** Existing rows it would replace, by id. Never a protected row (D3). */
  replaces?: PlanProposalReplacement[];
  /** The AI's own notes to the traveler, attributed to the AI (D4/D23). */
  notes?: string[];
  /**
   * What this proposal will NOT touch, in the words shown on screen — expert items and booked
   * rows (D3, and the L16 brief §4). Absent ⇒ nothing was claimed, which is not the same as
   * "nothing is protected"; a surface says the former and never the latter (§13).
   */
  protectedNote?: string;
}

/**
 * ── THE CHARGE BASIS ─────────────────────────────────────────────────────────────────────────
 *
 * (decision-maker rulings 2026-09-15, punchlist **D-20** = A and **D-21** = A; ledger
 *  `2026-09-15-d20-d21-proposal-charge`; migration 300. CLAUDE.md Locked Decision 45 (3),
 *  Locked Decision 41 (a), §8, §13, §18 rule 1.)
 *
 * WHY the apply was allowed, recorded on the row. `plan_proposals.charge_basis` carries **NO DB
 * CHECK** and **NO DEFAULT** (the publish-trap posture), so — exactly like the status above — the
 * value set only means anything if it is stated ONCE, here.
 *
 * `trip_pass` — an active Trip Pass on THIS plan covers the action (`coversAction(tripId,
 *               "ai_task")`). Coverage is UNLIMITED by ruling, so a covered apply takes no claim,
 *               creates no PaymentIntent and leaves `charged_amount_cents` NULL. Locked Decision
 *               41 (a)'s posture, one product over.
 * `paid`      — a PaymentIntent for THIS proposal was verified `succeeded` by the server.
 *
 * There is deliberately **no `free_rerun`** and **no `waived`**. The optimizer's free-re-run window
 * is a property of THAT product's pricing (LD 41 (a)); an AI task has no such window, and inventing
 * a basis nothing writes is how a reader starts classifying a state that never occurs (§13).
 *
 * NULL is NOT a member of this set: it means the proposal was never applied. Two ways to say
 * "nothing happened" is how a reader ends up guessing which was meant.
 */
export const PLAN_PROPOSAL_CHARGE_BASES = ["trip_pass", "paid"] as const;
export type PlanProposalChargeBasis = (typeof PLAN_PROPOSAL_CHARGE_BASES)[number];

/** The basis a Trip-Pass-covered apply records. One literal, one home (§18 rule 1). */
// `satisfies`, not a `: PlanProposalChargeBasis` annotation: the annotation would widen these to
// the whole union and every discriminated result that narrows on them would stop narrowing. This
// keeps the LITERAL type while still checking membership of the one set above.
export const PLAN_PROPOSAL_CHARGE_BASIS_TRIP_PASS = "trip_pass" satisfies PlanProposalChargeBasis;
/** The basis a verified-PaymentIntent apply records. Same reason. */
export const PLAN_PROPOSAL_CHARGE_BASIS_PAID = "paid" satisfies PlanProposalChargeBasis;

/** Fails closed: a NULL, a non-string or any unrecognised value is not a basis. */
export function isPlanProposalChargeBasis(value: unknown): value is PlanProposalChargeBasis {
  return (
    typeof value === "string" && (PLAN_PROPOSAL_CHARGE_BASES as readonly string[]).includes(value)
  );
}

/**
 * THE ONE PLACE THE APPLY'S STRIPE IDEMPOTENCY KEY IS SPELLED (§15, D-21).
 *
 * D-21 = A: one charge per DISTINCT PROPOSAL APPLIED, idempotent on that proposal's id. The key is
 * therefore derived from the proposal id and NOTHING else — no date component (the optimizer's
 * `opt-fee-<user>-<target>-<YYYY-MM-DD>` shape is per-target-per-DAY because its unit of charge is
 * a run, not a row), no user component (the row already belongs to exactly one plan, and the plan
 * to one owner). A double-click, a retry and a resumed session all rebuild the same key and Stripe
 * returns the same PaymentIntent.
 *
 * It lives in `shared/` beside the vocabulary rather than in the charge service so the test that
 * pins the shape and the code that sends it read the same expression (§18 rule 1).
 */
export function planProposalApplyIdempotencyKey(proposalId: string): string {
  return `ai-apply-${proposalId}`;
}

/**
 * THE ONE PLACE THE REFUND'S STRIPE IDEMPOTENCY KEY IS SPELLED (§15; OPTION B, ledger
 * `2026-09-16-l16-lane1-review-fixes`).
 *
 * A paid proposal refused at apply (stale price, unavailable listing, protected work) is refunded
 * ONCE. The key is
 * derived from the proposal id and nothing else, for the same reason the apply key is: the unit is
 * the proposal, the row belongs to one plan and the plan to one owner, and the amount is the ONE
 * charge Stripe reports for that proposal's PaymentIntent — so there is no amount component to
 * disambiguate (the booking refund keys carry one because a booking can be refunded at several
 * policy-scaled amounts; a proposal cannot). Two concurrent applies both refused, a retry after a
 * failed Stripe call and a reloaded drawer all rebuild this key and Stripe returns the SAME refund.
 */
export function planProposalRefundIdempotencyKey(proposalId: string): string {
  return `ai-task-refund-${proposalId}`;
}

/**
 * The `refunds.reason` text a proposal refund records, spelled once so the writer and the reader
 * that recognises it agree (§18 rule 1). Carries the refusal that triggered it — the ONE place the
 * refusal reason survives, since `refunded` is a single terminal status for both (§13).
 */
export const PLAN_PROPOSAL_REFUND_REASON = "ai_task_proposal_refused";

export function planProposalRefundReason(refusal: string, proposalId: string): string {
  return `${PLAN_PROPOSAL_REFUND_REASON}:${refusal}:${proposalId}`;
}
