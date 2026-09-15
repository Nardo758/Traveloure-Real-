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
 * There is no `expired`, no `superseded` and no `failed`. Two ways to say one thing is how a
 * reader ends up guessing which was meant (§13, the ruling-31 posture on empty states).
 */
export const PLAN_PROPOSAL_STATUSES = ["proposed", "applied", "discarded"] as const;
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
