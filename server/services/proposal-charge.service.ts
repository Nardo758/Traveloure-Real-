/**
 * proposal-charge.service.ts — THE APPLY IS THE CHARGE POINT, AND IT IS THE ONLY ONE.
 *
 * (decision-maker rulings 2026-09-15, punchlist **D-20** = A and **D-21** = A; ledger
 *  `2026-09-15-d20-d21-proposal-charge`; migration 300. CLAUDE.md Locked Decision 45 (3),
 *  Locked Decision 41 (a) and (f), Locked Decision 42 **D3** / **D17** / **D18**,
 *  Locked Decision 43 (c), §8, §13, §14, §15, §15b, §18 rule 1, §19, §19a.)
 *
 * ── D-20: THE PRICE IS FLAT, AND IT COMES FROM `fee_bands` ───────────────────────────────────
 * One band — `concierge:ai_task`, `flat_cents` — read through the EXISTING fail-loud
 * `requireFlatCentsBand` resolver. §8 forbids a fee literal anywhere outside `fee_bands`/config, so
 * there is no constant in this file and no fallback default: an absent or mistyped band THROWS and
 * the charge point refuses rather than pricing itself. The optimizer prices from a DIFFERENT home
 * (`getFee` over `optimization_fees`, complexity-tiered) and that home is deliberately untouched —
 * D-20 says a second tiered fee table for a second AI product is how the platform ends up with two
 * fee homes nobody can reconcile, and folding `optimization_fees` into `fee_bands` is an older
 * question and its own lane.
 *
 * ── D-21: ONE CHARGE PER DISTINCT PROPOSAL APPLIED ───────────────────────────────────────────
 * Asking is free, however many times; reading and discarding are free. The unit of charge is ONE
 * PROPOSAL, so the §15b CLAIM sits on the `plan_proposals` row and the Stripe idempotency key is
 * derived from the proposal id (`planProposalApplyIdempotencyKey`, `shared/plan-proposals.ts`). A
 * double-click, a retry and a resumed session all rebuild the same key and get the same
 * PaymentIntent.
 *
 * ── §15b: CLAIM → AUTHORIZE → PROMOTE ────────────────────────────────────────────────────────
 * `claimProposalCharge` is ONE atomic conditional taken BEFORE the Stripe call — the statement IS
 * the guard, never a SELECT followed by a decision. Two concurrent pays produce exactly one claim;
 * the loser is answered 409 and makes no Stripe call of its own. `stampProposalPaymentIntent` is a
 * second atomic conditional (`WHERE … AND stripe_payment_intent_id IS NULL`), so the column has
 * ONE writer and can never be overwritten (§19a).
 *
 * **NOTHING RELEASES A CLAIM.** A thrown Stripe error is exactly the case where a PaymentIntent
 * cannot be proven absent (§15b), and the traveler's retry rebuilds the same idempotency key, so a
 * claim clears only when the proposal is applied. That is a LIVENESS limit and it is stated rather
 * than papered over: it is the same posture `claimBalancePayer` takes (§15d), and a TTL reclaim
 * belongs to a later lane, not to a compensating rollback that runs in exactly the conditions that
 * broke the operation.
 *
 * ── LD 43 (c): THE PaymentIntent OFFERS WALLETS ──────────────────────────────────────────────
 * `automatic_payment_methods: { enabled: true, allow_redirects: "never" }` — every platform
 * PaymentIntent offers Apple Pay / Google Pay / Link, and `never` suppresses only the REDIRECT
 * class, which the embedded sheet (confirming with `redirect: 'if_required'`) cannot handle.
 * Wallets are not redirect methods and are unaffected.
 *
 * ── §14: THE AMOUNT AND THE ACTOR ARE SERVER-DERIVED ─────────────────────────────────────────
 * Nothing in this module reads a request body. The amount comes from the band, the plan comes from
 * the proposal ROW, and the acting user arrives from the session by way of the route's own gate.
 *
 * ── WHAT THIS MODULE DOES NOT DO (stated negative space) ─────────────────────────────────────
 *   · It never AUTHORIZES the apply — that is `resolveProposalApplyAuthorization`, the pure
 *     predicate, and the route calls it. This module claims, charges, verifies and writes.
 *   · It never decides WHO may touch the plan. The route runs the shared §12 WRITE-access gate
 *     first (LD 42 D17: an optimizer/AI write is authorized by the item-mutation predicate, never
 *     the read-shaped logistics tier that grants `pending`).
 *   · It creates no second booking store and no second AI write path into `itinerary_items`
 *     (LD 45: free draft on an empty slip, Optimize or a paid task on a non-empty one, and nothing
 *     else).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "../db";
import { itineraryItems, planProposals, type PlanProposal } from "@shared/schema";
import {
  PLAN_PROPOSAL_STATUS_APPLIED,
  PLAN_PROPOSAL_STATUS_PROPOSED,
  planProposalApplyIdempotencyKey,
  type PlanProposalChangeSet,
  type PlanProposalChargeBasis,
} from "@shared/plan-proposals";
import { itineraryItemIsExpertWork } from "@shared/itinerary-item-expert";
import { itineraryItemIsMoneyCommitted } from "@shared/itinerary-item-money";
import { itineraryItemRebuildDeletable } from "./itinerary-rebuild-guard";
import { CONCIERGE_AI_TASK_BAND, requireFlatCentsBand } from "./fee-resolution.service";
import { revenueTrackingService } from "./revenue-tracking.service";
import { getStripeSecretKey } from "../utils/stripe-key";
import type { ProposalPaymentVerification } from "./proposal-apply-authorization";

const stripe = new Stripe(getStripeSecretKey() || "", {
  apiVersion: "2024-12-18.acacia" as any,
});

/** The PaymentIntent metadata key that BINDS an intent to one proposal. Stated once (§18 rule 1). */
export const PROPOSAL_PAYMENT_METADATA_TYPE = "ai_task_fee";

/**
 * D-20: the price of one AI task, in cents, from the band and from nowhere else (§8).
 *
 * `requireFlatCentsBand` is fail-loud by declaration (`RESOLVER_FEE_BAND_REQUIREMENTS`,
 * `fallback: failLoud`), which is exactly right for a charge: a charge path that cannot price
 * itself must refuse, never guess. A non-positive rate is refused for the same reason — a `0` here
 * would be a free charge presented as a priced one, and `fee_ledger`'s own `amount <> 0` CHECK is
 * that rule one table over (§13).
 */
export async function resolveAiTaskChargeCents(): Promise<number> {
  const band = await requireFlatCentsBand(CONCIERGE_AI_TASK_BAND);
  const cents = Math.round(band.rate);
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error(
      `fee band '${CONCIERGE_AI_TASK_BAND}' resolved to a non-positive flat_cents value — ` +
        `a charge point must refuse rather than price itself (§8/§13).`,
    );
  }
  return cents;
}

/**
 * §15b THE CLAIM. ONE atomic conditional, taken BEFORE the Stripe call.
 *
 * Returns the claimed row, or `undefined` when nothing matched. `undefined` deliberately does not
 * distinguish "no such proposal", "not on this trip", "already applied or discarded" and "somebody
 * else claimed it first": the route answers 409 for the claim cases and the read that precedes it
 * has already answered 404 for a proposal the caller cannot see, so the rail cannot be used to
 * probe which proposals exist.
 */
export async function claimProposalCharge(
  proposalId: string,
  tripId: string,
): Promise<PlanProposal | undefined> {
  if (!proposalId || !tripId) return undefined;
  const [row] = await db
    .update(planProposals)
    .set({ chargeClaimedAt: new Date() })
    .where(
      and(
        eq(planProposals.id, proposalId),
        eq(planProposals.tripId, tripId),
        eq(planProposals.status, PLAN_PROPOSAL_STATUS_PROPOSED),
        isNull(planProposals.chargeClaimedAt),
      ),
    )
    .returning();
  return row;
}

/**
 * §19a: the ONE writer of `plan_proposals.stripe_payment_intent_id`, and it is an atomic
 * conditional so the column can never be overwritten by a second call.
 */
export async function stampProposalPaymentIntent(
  proposalId: string,
  paymentIntentId: string,
): Promise<boolean> {
  const [row] = await db
    .update(planProposals)
    .set({ stripePaymentIntentId: paymentIntentId })
    .where(and(eq(planProposals.id, proposalId), isNull(planProposals.stripePaymentIntentId)))
    .returning({ id: planProposals.id });
  return !!row;
}

/** Read one proposal scoped to its plan. No authorization — that is the route's job (§14). */
export async function getPlanProposal(
  proposalId: string,
  tripId: string,
): Promise<PlanProposal | undefined> {
  if (!proposalId || !tripId) return undefined;
  const [row] = await db
    .select()
    .from(planProposals)
    .where(and(eq(planProposals.id, proposalId), eq(planProposals.tripId, tripId)))
    .limit(1);
  return row;
}

/**
 * Create the apply's PaymentIntent. LD 43 (c) wallets; §15 idempotency keyed on the PROPOSAL.
 *
 * The metadata BINDS the intent to one proposal, which is what `verifyProposalPayment` below
 * checks: a PaymentIntent lifted from another flow names the thing it actually paid for and can
 * never authorize this apply (the §19b corroboration posture — server-written metadata, never a
 * client claim).
 */
export async function createProposalChargeIntent(params: {
  proposalId: string;
  tripId: string;
  userId: string;
  amountCents: number;
  customerId?: string;
}): Promise<Stripe.PaymentIntent> {
  return await stripe.paymentIntents.create(
    {
      amount: params.amountCents,
      currency: "usd",
      ...(params.customerId ? { customer: params.customerId } : {}),
      setup_future_usage: "off_session",
      metadata: {
        type: PROPOSAL_PAYMENT_METADATA_TYPE,
        userId: params.userId,
        proposalId: params.proposalId,
        tripId: params.tripId,
      },
      description: "Traveloure AI task",
      // LD 43 (c): every platform PaymentIntent offers wallets. `allow_redirects: 'never'` because
      // the sheet confirms in place with `redirect: 'if_required'` and the apply runs immediately
      // after; wallets are not redirect methods and are unaffected.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" as const },
    },
    { idempotencyKey: planProposalApplyIdempotencyKey(params.proposalId) },
  );
}

/**
 * Verify a PaymentIntent against Stripe for THIS proposal (§15c posture: a client-supplied
 * PaymentIntent is never trusted on its own word).
 *
 * Three checks, each its own honest refusal (§13 — a caller is told which one failed, not a single
 * collapsed message): it must exist and be `succeeded`, it must be an AI-task intent, and its
 * server-written `proposalId` metadata must name THIS proposal.
 */
export async function verifyProposalPayment(params: {
  paymentIntentId: string;
  proposalId: string;
}): Promise<ProposalPaymentVerification> {
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(params.paymentIntentId);
  } catch (err: any) {
    return { ok: false, detail: `payment_not_found: ${err?.message ?? "unreadable"}` };
  }
  if (pi.status !== "succeeded") return { ok: false, detail: `payment_not_succeeded: ${pi.status}` };
  if (pi.metadata?.type !== PROPOSAL_PAYMENT_METADATA_TYPE) {
    return { ok: false, detail: "payment_is_not_an_ai_task_fee" };
  }
  if (pi.metadata?.proposalId !== params.proposalId) {
    return { ok: false, detail: "payment_belongs_to_another_proposal" };
  }
  return { ok: true, amountCents: pi.amount };
}

/**
 * Retrieve the PaymentIntent already standing for a proposal, so a resumed sheet gets the SAME
 * intent rather than a second one. The idempotency key is derived from the proposal id, so Stripe
 * would return this same intent for a repeated create anyway — this read just avoids the round trip
 * and keeps the resume path explicit.
 */
export async function retrieveProposalPaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent> {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

/** A named refusal, so the route can answer with the REASON and never skip a row silently (§13). */
export class ProposalApplyRefused extends Error {
  constructor(
    readonly code: "protected_item" | "not_applicable",
    message: string,
    readonly itemIds: string[] = [],
  ) {
    super(message);
    this.name = "ProposalApplyRefused";
  }
}

export interface AppliedProposalResult {
  proposal: PlanProposal;
  createdItemIds: string[];
  replacedItemIds: string[];
}

/**
 * APPLY. One transaction: refuse a protected replacement, delete what the proposal replaces, insert
 * what it adds, and flip the row — all after authorization, and nothing irreversible before it
 * (§15b).
 *
 * ── LD 42 D3: EXPERT WORK IS PROTECTED WHERE MONEY IS PROTECTED ──────────────────────────────
 * A `replaces` entry naming an item carrying `expert_note` or `origin='expert'` is **REFUSED with
 * the reason**, never skipped silently — a silent skip would apply a proposal the traveler read as
 * replacing something and leave that something in place, which is a plan that disagrees with what
 * was shown (§13). The class test is the ONE row-level predicate `itineraryItemIsExpertWork`
 * (`shared/itinerary-item-expert.ts`) — the SAME expression `optimizer-baseline.service.ts` calls;
 * a parallel "is this expert work?" test written beside it is the derivation-drift class §18 rule 1
 * names. A money-committed row is refused by the existing `itineraryItemIsMoneyCommitted` for the
 * same reason and through the same discipline (one predicate, one more caller).
 *
 * The DELETE then ANDs in `itineraryItemRebuildDeletable()` — the WHERE-clause form of the same
 * class — so even if a row's state changed between the read and the delete, a protected row
 * survives. Two layers, one class, no third expression.
 *
 * ── THE ADDITIONS ARE BORN `origin: 'ai'` ────────────────────────────────────────────────────
 * Stamped SERVER-SIDE at create (ruling 12, LD 42 D23): `origin` is client-settable nowhere, and
 * an applied AI proposal must never render in the expert's treatment (D4/D23 — the false
 * attribution the whole `plan_proposals` table exists to avoid).
 *
 * ── §13 RUNS THROUGH THE VALUES ──────────────────────────────────────────────────────────────
 * An absent price stays NULL and is never `0`; an absent day falls back to the plan's first day and
 * SAYS SO here rather than pretending the proposal placed it; an absent location stays NULL.
 *
 * ── THE FLIP IS THE GUARD (§15/§18b) ─────────────────────────────────────────────────────────
 * `UPDATE … WHERE id = ? AND trip_id = ? AND status = 'proposed'` is the LAST statement in the
 * transaction. Two concurrent applies: the second blocks on the row lock, re-evaluates the WHERE
 * after the first commits, matches zero rows and the WHOLE transaction rolls back — so exactly one
 * apply writes items and exactly one charge is recorded. A check-then-write would be the TOCTOU bug
 * §15 names, not a guard.
 */
export async function applyPlanProposal(params: {
  proposalId: string;
  tripId: string;
  basis: PlanProposalChargeBasis;
  chargedAmountCents: number | null;
  paymentIntentId: string | null;
}): Promise<AppliedProposalResult> {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(planProposals)
      .where(and(eq(planProposals.id, params.proposalId), eq(planProposals.tripId, params.tripId)))
      .limit(1);
    if (!row || row.status !== PLAN_PROPOSAL_STATUS_PROPOSED) {
      throw new ProposalApplyRefused("not_applicable", "This proposal is no longer applicable.");
    }

    const changeSet = (row.proposal ?? {}) as PlanProposalChangeSet;
    const replaceIds = Array.from(
      new Set((changeSet.replaces ?? []).map((r) => r?.itemId).filter((v): v is string => !!v)),
    );

    let replacedItemIds: string[] = [];
    if (replaceIds.length > 0) {
      const named = await tx
        .select()
        .from(itineraryItems)
        .where(and(eq(itineraryItems.tripId, params.tripId), inArray(itineraryItems.id, replaceIds)));

      // D3 — REFUSED WITH THE REASON, never skipped. The two existing row-level predicates, called
      // once each; no third expression of either class.
      const protectedIds = named
        .filter((i) => itineraryItemIsExpertWork(i) || itineraryItemIsMoneyCommitted(i))
        .map((i) => i.id);
      if (protectedIds.length > 0) {
        throw new ProposalApplyRefused(
          "protected_item",
          "This proposal would replace work that is protected: an item carrying your expert's note " +
            "or authored by them, or an item you have already committed money to. Nothing was changed.",
          protectedIds,
        );
      }

      // The WHERE-clause form of the same class, ANDed in as the second layer: a row whose state
      // changed between the read above and this delete still survives.
      const deleted = await tx
        .delete(itineraryItems)
        .where(
          and(
            eq(itineraryItems.tripId, params.tripId),
            inArray(itineraryItems.id, replaceIds),
            itineraryItemRebuildDeletable(),
          ),
        )
        .returning({ id: itineraryItems.id });
      replacedItemIds = deleted.map((d) => d.id);
    }

    const additions = changeSet.additions ?? [];
    let createdItemIds: string[] = [];
    if (additions.length > 0) {
      const [{ nextSort }] = await tx
        .select({ nextSort: sql<number>`COALESCE(MAX(${itineraryItems.sortOrder}), 0) + 1` })
        .from(itineraryItems)
        .where(eq(itineraryItems.tripId, params.tripId));

      const inserted = await tx
        .insert(itineraryItems)
        .values(
          additions.map((addition, i) => ({
            tripId: params.tripId,
            title: addition.title,
            description: addition.description ?? null,
            // `day_number` is NOT NULL, so an unplaced addition has to land somewhere. It lands on
            // day 1 — the plan's first day — which is a PLACEMENT the traveler can move, not a
            // claim that the proposal scheduled it. §13: the proposal's own absence of a day is
            // preserved nowhere else, so no surface may present day 1 here as the AI's answer.
            dayNumber: addition.dayNumber ?? 1,
            startTime: addition.startTime ?? null,
            endTime: addition.endTime ?? null,
            locationName: addition.location ?? null,
            // A price ONLY where one was actually found. NULL is "the source did not state one",
            // never "$0" (§13).
            estimatedCost: addition.estimatedCost ?? null,
            providerServiceId: addition.providerServiceId ?? null,
            sortOrder: Number(nextSort ?? 1) + i,
            // Ruling 12 / LD 42 D23: SERVER-STAMPED, client-settable nowhere. An applied AI
            // proposal is the AI's, and must never render in the expert's treatment (D4/D23).
            origin: "ai" as const,
          })),
        )
        .returning({ id: itineraryItems.id });
      createdItemIds = inserted.map((r) => r.id);
    }

    // THE STATEMENT IS THE GUARD. Last in the transaction, atomic conditional on `proposed`.
    const [applied] = await tx
      .update(planProposals)
      .set({
        status: PLAN_PROPOSAL_STATUS_APPLIED,
        appliedAt: new Date(),
        appliedItemIds: createdItemIds,
        chargeBasis: params.basis,
        chargedAmountCents: params.chargedAmountCents,
      })
      .where(
        and(
          eq(planProposals.id, params.proposalId),
          eq(planProposals.tripId, params.tripId),
          eq(planProposals.status, PLAN_PROPOSAL_STATUS_PROPOSED),
        ),
      )
      .returning();
    if (!applied) {
      throw new ProposalApplyRefused("not_applicable", "This proposal is no longer applicable.");
    }

    return { proposal: applied, createdItemIds, replacedItemIds };
  });
}

/**
 * Ledger the fee. §15b: AFTER the apply has committed, best-effort — an ancillary effect may never
 * break the operation that authorizes it, and a ledger write that could roll back a real apply
 * would be exactly that.
 *
 * `recordRevenueEventOnce` is the EXISTING idempotent recorder the optimizer's confirm path uses,
 * keyed on the PaymentIntent id, so a retry records one row (§15). **A Trip-Pass-covered apply
 * writes NO row at all** — there is no money to record, and a `$0` ledger row is forbidden by
 * `fee_ledger`'s own `amount <> 0` CHECK and would be a fabricated charge here (§13). The durable
 * record of a covered apply is the `charge_basis = 'trip_pass'` on the proposal row plus the
 * absence of a PaymentIntent, which is LD 41 (a)'s posture with the one improvement D-21 ratifies:
 * here the basis has a column of its own.
 */
export async function ledgerProposalCharge(params: {
  paymentIntentId: string;
  amountCents: number;
  proposalId: string;
  tripId: string;
  userId: string;
}): Promise<void> {
  await revenueTrackingService.recordRevenueEventOnce({
    sourceType: "ai_task_fee",
    sourceId: params.paymentIntentId,
    grossAmount: params.amountCents / 100,
    description: "Traveloure AI task",
    metadata: {
      type: PROPOSAL_PAYMENT_METADATA_TYPE,
      proposalId: params.proposalId,
      tripId: params.tripId,
      userId: params.userId,
    },
  });
}
