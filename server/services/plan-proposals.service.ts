/**
 * PLAN PROPOSALS — the ONE writer and the ONE reader of an AI proposal staged beside a plan.
 *
 * (decision-maker ruling 2026-09-15, punchlist **D-19** = option (b); ledger
 *  `2026-09-15-d19-plan-proposals`; migration 299. CLAUDE.md Locked Decision 45 (3), Locked
 *  Decision 42 D3 / D4 / D18 / D23, §13, §15, §18 rule 1, §18b, §19.)
 *
 * ── WHY THIS TABLE EXISTS AT ALL ─────────────────────────────────────────────────────────────
 * Locked Decision 45 (3) rules that every Ask-AI answer is a PROPOSAL staged beside the plan and
 * that nothing changes until the traveler applies it. The L16 brief's first version said the
 * proposal would land on the EXISTING expert suggestions rail. It cannot: `trip_suggestions`
 * carries a NOT NULL `expert_id` FK -> `users.id`, its create route refuses anyone who is not an
 * assigned expert, and its approve path hardcodes `origin:'expert'` on the item it creates — the
 * false attribution Locked Decision 42 D4 and D23 forbid by name. **That rail is untouched by this
 * module.** Nothing here reads it, writes it, or mints a sentinel author on it.
 *
 * ── WHAT THIS LANE DOES NOT DO, AND WHO OWNS IT ──────────────────────────────────────────────
 * **THERE IS NO `apply` HERE, AND NOTHING IS STUBBED.** Applying a proposal is the CHARGE POINT:
 * Locked Decision 45 (3) charges an AI task at apply and never at ask, and the shape of that
 * charge is punchlist **D-20** (flat from `fee_bands` vs tiered like the optimizer) and **D-21**
 * (what one "task" is, and the §15b claim on the proposal row that makes a double-click one
 * charge). Both are OPEN rulings. A half-written apply here would be a second, uncharged rail into
 * the plan's items, which is precisely the fourth AI write path Locked Decision 45 refuses. The
 * L16 lane, after D-20/D-21 answer, owns `applied_at`, `applied_item_ids` and the charge.
 *
 * **THERE IS NO CREATE ROUTE, AND NOTHING OUTSIDE TESTS CALLS `createPlanProposal` TODAY.** That
 * is deliberate and it is not the §18c case: §18c says "no consumer + a state-bearing effect =>
 * DELETE, don't gate", and its instance was a reachable endpoint that consumed real inventory.
 * This is a RULED STORE landing ahead of its one consumer, with no route, no effect and no way for
 * a client to reach it (§19 — the admission schema is pick-based and is parsed from no
 * `req.body`).
 *
 * ── §13 — THE ABSENCES ARE ANSWERS ───────────────────────────────────────────────────────────
 *   · `conversationId` NULL = this proposal names no thread. A reader says so; it never resolves
 *     the proposal to the plan's nearest conversation.
 *   · `question` NULL = not recorded. Never an invented prompt shown as the traveler's words.
 *   · `modelTier` NULL = unrecorded. It is a COST RECORD ONLY (Locked Decision 41 (c)) and no
 *     surface may describe a proposal by the engine that produced it.
 *   · A plan with NO rows here has never been asked anything. The list is empty, which is not the
 *     same as "the AI had nothing to say", and no caller may render it as the latter.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  planProposalCreateSchema,
  planProposals,
  type PlanProposal,
  type PlanProposalCreate,
} from "@shared/schema";
import {
  PLAN_PROPOSAL_STATUS_DISCARDED,
  PLAN_PROPOSAL_STATUS_PROPOSED,
} from "@shared/plan-proposals";

/**
 * Stage a proposal against a plan. SERVER-SIDE ONLY — the input is parsed by the pick-based
 * allowlist (§19), never by a `createInsertSchema` denylist and never off a request body.
 *
 * `status` defaults to `proposed` HERE, in the one writer, rather than on the column: the column
 * has no DEFAULT deliberately (migration 299), so a row can never exist because somebody forgot to
 * say what it was. A caller may state it explicitly; the value set is `PLAN_PROPOSAL_STATUSES` and
 * the schema enforces it.
 *
 * It writes NO lifecycle column — `appliedAt`, `appliedItemIds` and `discardedAt` are not in the
 * pick and cannot be handed in. A born-applied proposal would be an apply that skipped the charge
 * point (punchlist D-20/D-21).
 */
export async function createPlanProposal(
  input: Omit<PlanProposalCreate, "status"> & { status?: PlanProposalCreate["status"] },
): Promise<PlanProposal> {
  const parsed = planProposalCreateSchema.parse({
    ...input,
    status: input.status ?? PLAN_PROPOSAL_STATUS_PROPOSED,
  });
  const [row] = await db
    .insert(planProposals)
    .values({
      tripId: parsed.tripId,
      conversationId: parsed.conversationId ?? null,
      question: parsed.question ?? null,
      proposal: (parsed.proposal ?? null) as PlanProposal["proposal"],
      status: parsed.status,
      modelTier: parsed.modelTier ?? null,
    })
    .returning();
  return row;
}

/**
 * Every proposal on a plan, newest first — INCLUDING discarded and applied ones.
 *
 * The whole log is returned on purpose: a discarded proposal is a record of what was offered and
 * refused, and hiding it would make the log a filtered claim rather than a record. It is also why
 * migration 299 adds no partial index on `status='proposed'` — no reader asks that question.
 *
 * This function takes NO owner argument and performs NO authorization. That is the ROUTE's job
 * (§14: the owner is the session, never a parameter a caller chose), and the two routes in
 * `trips.routes.ts` run the same shared item-mutation gate before calling in.
 */
export async function listPlanProposals(tripId: string): Promise<PlanProposal[]> {
  if (!tripId) return [];
  return await db
    .select()
    .from(planProposals)
    .where(eq(planProposals.tripId, tripId))
    .orderBy(desc(planProposals.createdAt));
}

/**
 * Discard a proposal. **THE STATEMENT IS THE GUARD** (§15, §18b): one atomic conditional
 * `UPDATE … WHERE id = ? AND trip_id = ? AND status = 'proposed'`, never a SELECT followed by a
 * decision taken against what it returned — that shape is the TOCTOU bug §15 names by hand.
 *
 * Three refusals fall out of the one statement and none of them needs its own pre-check:
 *   · two concurrent discards => exactly ONE writes; the loser matches zero rows and gets
 *     `undefined`. The caller's retry is therefore idempotent in effect and honest in report.
 *   · an ALREADY-APPLIED proposal cannot be discarded. An apply changed the plan's items and
 *     (once punchlist D-20/D-21 lands the charge point) took money; letting a discard walk that
 *     back in the row while the items stayed would be a record that disagrees with the plan, and
 *     Locked Decision 42 D18 is explicit that there is no undo.
 *   · a proposal on ANOTHER trip is not this trip's to discard — the `trip_id` clause, not a
 *     second ownership read. The route answers a 404 for that, never a 403 (the probing posture).
 *   · **a proposal that already has a PaymentIntent cannot be discarded** (punchlist **D-21**,
 *     ledger `2026-09-15-d20-d21-proposal-charge`). A PaymentIntent the traveler can still confirm
 *     is money that may yet move; discarding the row underneath it would take a charge with nothing
 *     to apply it to. A CLAIM ALONE does NOT block the discard, and that distinction is
 *     load-bearing: `charge_claimed_at` with no `stripe_payment_intent_id` is a pay attempt whose
 *     Stripe call never landed, and leaving THAT row undiscardable would brick a proposal on a
 *     transient error. Discard is its recovery. (Stated liveness limit: a claimed row whose
 *     PaymentIntent exists and is never confirmed stays un-applied and un-discardable until it is;
 *     a TTL reclaim is a later lane, not a compensating rollback — §15b.)
 *
 * Returns the updated row, or `undefined` when nothing matched. `undefined` deliberately does not
 * distinguish "no such proposal", "not on this trip", "already discarded" and "lost the race": the
 * route turns every one of them into the same 404, so the rail cannot be used to probe which
 * proposals exist on plans the caller cannot read.
 */
export async function discardPlanProposal(
  id: string,
  tripId: string,
): Promise<PlanProposal | undefined> {
  if (!id || !tripId) return undefined;
  const [row] = await db
    .update(planProposals)
    .set({ status: PLAN_PROPOSAL_STATUS_DISCARDED, discardedAt: new Date() })
    .where(
      and(
        eq(planProposals.id, id),
        eq(planProposals.tripId, tripId),
        eq(planProposals.status, PLAN_PROPOSAL_STATUS_PROPOSED),
        // D-21: a PaymentIntent exists ⇒ money may yet move on this proposal, so the row is not
        // the traveler's to discard. One more clause in the SAME statement — never a pre-check.
        isNull(planProposals.stripePaymentIntentId),
      ),
    )
    .returning();
  return row;
}
