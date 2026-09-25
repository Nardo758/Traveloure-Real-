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
import {
  itineraryItems,
  planProposals,
  providerServices,
  refunds,
  trips,
  type PlanProposal,
} from "@shared/schema";
import {
  PLAN_PROPOSAL_CHARGE_BASIS_PAID,
  PLAN_PROPOSAL_STATUS_APPLIED,
  PLAN_PROPOSAL_STATUS_PROPOSED,
  PLAN_PROPOSAL_STATUS_REFUNDED,
  planProposalApplyIdempotencyKey,
  planProposalRefundIdempotencyKey,
  planProposalRefundReason,
  PLAN_PROPOSAL_REFUND_UNKNOWN_REFUSAL,
  PLAN_PROPOSAL_ALREADY_REFUNDED_MESSAGE,
  type PlanProposalChangeSet,
  type PlanProposalChargeBasis,
} from "@shared/plan-proposals";
import { changeSetProviderServiceIds } from "@shared/plan-proposal-changeset";
import { isProposalCatalogPriceStale } from "../config/proposal-staleness.config";
import { optimizerCatalogLivenessWhere } from "./optimizer-baseline.service";
import { reFinalizeIfCurrentlyFinal } from "./trip-finalize.service";
import { stripePaymentService } from "./stripe-payment.service";
import { itineraryItemIsExpertWork } from "@shared/itinerary-item-expert";
import { itineraryItemIsMoneyCommitted } from "@shared/itinerary-item-money";
import { itineraryItemRebuildDeletable } from "./itinerary-rebuild-guard";
import { CONCIERGE_AI_TASK_BAND, requireFlatCentsBand } from "./fee-resolution.service";
import { recordAiTaskRefundToll } from "./fee-ledger.service";
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
    readonly code:
      | "protected_item"
      | "not_applicable"
      // D-50 (c): the proposal's catalog prices are past their window. REFUSED with the reason and
      // the drawer offers a re-ask — never a silent reprice (ledger `2026-09-16-l16-rulings-d45-d50`).
      | "stale_catalog_price"
      // D-50 (b): a listing the proposal names is no longer bookable on this plan. Refused with the
      // reason for the same §13 reason as above — applying it would write a row naming a listing
      // the traveler cannot book, and re-pricing or silently dropping it changes what they read.
      | "listing_unavailable"
      // ledger `2026-09-19-proposal-refund-race-reason`: this caller's OWN status read landed AFTER
      // a concurrent caller's refusal already claimed and refunded the row (§15b — the claim is the
      // status flip, one statement). `not_applicable` is the truth for every OTHER terminal state
      // (applied, discarded) but not this one — the row's fee has already gone back to the
      // traveler, and the route must say so rather than lump it into the generic refusal (§13).
      | "refunded",
    message: string,
    readonly itemIds: string[] = [],
  ) {
    super(message);
    this.name = "ProposalApplyRefused";
  }
}

/**
 * D-50 (b)/(c) — THE TWO THINGS THAT CAN HAVE CHANGED SINCE THE TRAVELER READ A PROPOSAL.
 *
 * (decision-maker ruling 2026-09-16, punchlist **D-50** = A, tightened; ledger
 *  `2026-09-16-l16-rulings-d45-d50`. CLAUDE.md §13, §18 rule 1.)
 *
 * A proposal may name a live catalog listing (D-50) and carries that listing's price **as the
 * catalog stated it at ASK time** — the create rail's sanitiser overwrites every model-emitted price
 * with the catalog row's own and persists no number the model produced. By the time the traveler
 * applies, two things can have changed:
 *
 *   **(c) THE WINDOW HAS PASSED.** REFUSED with the reason; the drawer offers a re-ask. The three
 *   available answers were: reprice silently at apply (a number the traveler never read), apply the
 *   stale one (a price nobody is offering), or refuse. The ruling took the third — the only one
 *   that does not put a figure on screen that no source states (§13).
 *
 *   **(b) A LISTING IS GONE, PAUSED OR UNAPPROVED.** Validated at CREATE, RE-VALIDATED here, and
 *   refused for the same reason: applying would write an item naming a listing the traveler cannot
 *   book, and silently dropping it would change what they read after they read it. (At CREATE the
 *   answer is different and deliberately so — there the addition is simply DROPPED, because nobody
 *   has read it yet.)
 *
 * **IT BITES ONLY ON A CHANGE SET THAT NAMES A LISTING.** A proposal with no catalog reference
 * carries no price that can go stale, and expiring it would refuse an apply for a reason that is
 * not true of that proposal (§13). `changeSetProviderServiceIds` is the ONE expression of that
 * question, shared with the create rail's sanitiser (§18 rule 1).
 *
 * **ONE IMPLEMENTATION, TWO CALLERS.** `applyPlanProposal` calls it inside its transaction, and the
 * PAY route calls it BEFORE the claim and before any Stripe call — so a traveler is never charged
 * for a proposal the apply would then refuse. A second copy of this decision is the derivation-drift
 * class §18 rule 1 names, and here it would be a money bug: two rails disagreeing about whether an
 * apply is still possible, with a charge taken between them.
 *
 * **THE RE-VALIDATION IS BY ID, UNDER THE ONE LIVENESS PREDICATE** (review finding 1, ledger
 * `2026-09-16-l16-lane1-review-fixes`). The first cut checked set-membership in
 * `loadOptimizerCatalog(...)`'s result — a `.limit(100)` page with no `ORDER BY` — so on a destination
 * with more than 100 live listings a live one could fall off the page and be refused as
 * `listing_unavailable`, a false claim (§13) on a paid rail. Now each NAMED id is looked up directly:
 * `inArray(id, named)` ANDed with `optimizerCatalogLivenessWhere(destination)`, the SAME
 * active/approved/destination predicate the catalog reader pages over, exported from that reader's
 * own module so the two can never drift (§18 rule 1). No page, no limit: a listing is live or it is
 * not. The optimizer's own reader is untouched.
 *
 * `reader` takes a drizzle transaction handle when one is open, and BOTH reads here — the trip's
 * destination and the listings' liveness — go through it, so inside `applyPlanProposal` they join
 * the caller's transaction rather than opening a connection beside it (review finding 5).
 */
export async function assertProposalCatalogStillValid(params: {
  proposal: Pick<PlanProposal, "proposal" | "createdAt">;
  tripId: string;
  reader?: { select: typeof db.select };
}): Promise<void> {
  const changeSet = (params.proposal.proposal ?? {}) as PlanProposalChangeSet;
  const namedServiceIds = changeSetProviderServiceIds(changeSet);
  if (namedServiceIds.length === 0) return;

  // (c) FIRST: an expired proposal is refused for its OWN reason, not for whichever listing happens
  // also to have gone away in the meantime (§13 — the reason given is the reason that applies).
  if (isProposalCatalogPriceStale({ createdAt: params.proposal.createdAt })) {
    throw new ProposalApplyRefused(
      "stale_catalog_price",
      "This proposal quotes prices from when it was written, and they are old enough that we will " +
        "not apply them without checking. Nothing was changed — ask again for a fresh answer.",
    );
  }

  // (b) The re-validation, BY ID, under the ONE liveness predicate. Both reads on `reader`.
  const reader = params.reader ?? db;
  const [tripRow] = await reader
    .select({ destination: trips.destination })
    .from(trips)
    .where(eq(trips.id, params.tripId))
    .limit(1);
  const liveRows = await reader
    .select({ id: providerServices.id })
    .from(providerServices)
    .where(
      and(
        optimizerCatalogLivenessWhere(tripRow?.destination ?? null),
        inArray(providerServices.id, namedServiceIds),
      ),
    );
  const live = new Set(liveRows.map((c) => c.id));
  const missing = namedServiceIds.filter((id) => !live.has(id));
  if (missing.length > 0) {
    throw new ProposalApplyRefused(
      "listing_unavailable",
      "A listing this proposal names is no longer available on this plan. Nothing was changed — " +
        "ask again for a fresh answer.",
      missing,
    );
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
 * ── D-50 (b)/(c): WHAT THE APPLY RE-CHECKS, AND WHY IT REFUSES RATHER THAN REPAIRS ───────────
 * (decision-maker ruling 2026-09-16; ledger `2026-09-16-l16-rulings-d45-d50`.)
 * A proposal may name a live catalog listing and carries that listing's price AS THE CATALOG STATED
 * IT AT ASK TIME. Two things can have changed by the time the traveler applies:
 *   · **the window has passed** — D-50 (c): REFUSED with the reason, and the drawer offers a
 *     re-ask. **Never a silent reprice** (a number the traveler never read) and never the stale one
 *     (a price nobody is offering). The window bites ONLY on a change set that actually names a
 *     listing: a proposal carrying no catalog reference has no price that can go stale, and
 *     expiring it would refuse an apply for a reason that is not true of it (§13).
 *   · **a listing is gone, paused or unapproved** — D-50 (b): validated at CREATE, RE-VALIDATED
 *     here. Refused with the reason, for the same §13 reason as above: applying would write a row
 *     naming a listing the traveler cannot book, and silently dropping it would change what they
 *     read after they read it.
 * Both are checked BEFORE anything is written and BEFORE the flip, inside the same transaction, so
 * a refusal leaves the plan exactly as it was. The liveness test is `optimizerCatalogLivenessWhere`
 * — the ONE predicate the catalog reader itself pages over (§18 rule 1, D-50), applied here BY ID
 * (review finding 1); this file adds no second filter.
 *
 * ── D-49: THE TRIP CARD IS RE-FINALIZED AFTER THE APPLY COMMITS ──────────────────────────────
 * (decision-maker ruling 2026-09-16 = A, amended on timing — it ships with the CREATE rail rather
 * than with the drawer's post-final mount, because the five proposal rails are API-reachable on a
 * finalized trip TODAY.) `reFinalizeIfCurrentlyFinal` is called AFTER the transaction returns —
 * never inside it — so a re-finalize failure can never roll back a committed, possibly CHARGED
 * apply (§15b: an ancillary effect may not break the operation that authorizes it). It is
 * best-effort in the shape the four existing callers use, with ONE difference the ruling requires:
 * **the failure is LOUD** — logged at ERROR with the proposal id and the trip id, so a card that
 * did not advance after a paid apply is reconcilable rather than silent. No swallowed catch.
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
  /**
   * The SESSION user applying (§14 — the route's own `getUserId(req)`, never a body). Used only as
   * the actor on the D-49 re-finalize below; it authorizes nothing here, because authorization has
   * already happened at the route and in `resolveProposalApplyAuthorization`.
   */
  actorId: string;
}, deps: {
  /**
   * The D-49 post-commit re-finalize. Injected ONLY so a test can drive a FAILING one and prove the
   * apply still resolves and the failure is logged with both ids (review finding 4 — a behavioural
   * proof in place of a string-index pin). Production callers pass nothing and get the real helper.
   */
  reFinalize?: typeof reFinalizeIfCurrentlyFinal;
  /**
   * A test-only seam (ledger `2026-09-19-proposal-refund-race-reason`) so a concurrent-loser
   * interleaving — this caller's status read landing AFTER another caller's refund claim commits —
   * can be forced DETERMINISTICALLY rather than relied on to land right by real timing. Called
   * immediately before the status read below, inside the transaction. Production callers pass
   * nothing and get a no-op; the same injection posture `createProposalFromAsk`'s `deps` takes.
   */
  beforeStatusRead?: () => Promise<void>;
} = {}): Promise<AppliedProposalResult> {
  const result = await db.transaction(async (tx) => {
    if (deps.beforeStatusRead) await deps.beforeStatusRead();
    const [row] = await tx
      .select()
      .from(planProposals)
      .where(and(eq(planProposals.id, params.proposalId), eq(planProposals.tripId, params.tripId)))
      .limit(1);
    if (!row || row.status !== PLAN_PROPOSAL_STATUS_PROPOSED) {
      // §13/§15b — a row already `refunded` is a DIFFERENT fact than the generic "not applicable":
      // a concurrent caller's OWN refusal already claimed this row (the claim IS the status flip,
      // ledger `2026-09-19-proposal-refund-race-reason`) and its fee is already back with the
      // traveler. `not_applicable` stays the answer for every OTHER terminal state — applied,
      // discarded — where nothing is owed.
      if (row?.status === PLAN_PROPOSAL_STATUS_REFUNDED) {
        throw new ProposalApplyRefused("refunded", PLAN_PROPOSAL_ALREADY_REFUNDED_MESSAGE);
      }
      throw new ProposalApplyRefused("not_applicable", "This proposal is no longer applicable.");
    }

    const changeSet = (row.proposal ?? {}) as PlanProposalChangeSet;

    // D-50 (b)/(c) — ONE implementation, two callers (the other is the PAY route, so a traveler is
    // never charged for a proposal this would then refuse). Throws `ProposalApplyRefused`; inside
    // this transaction that rolls the whole apply back, so a refusal leaves the plan untouched.
    await assertProposalCatalogStillValid({
      proposal: row,
      tripId: params.tripId,
      reader: tx,
    });

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
      //
      // item-removed:replace — an apply REPLACES the rows the proposal names with the rows it adds,
      // in ONE transaction. R15 (ledger `2026-08-17-partner-demand-r15-transition-log`): this is a
      // rebuild, not a removal, so it writes NO `item_removed` diary row — emitting one would put a
      // false removal signal into the demand pipeline for a row the traveler never removed (§13).
      // Same classification, same reason, as apply-to-trip's own replace delete.
      const deleted = await tx
        // item-removed:replace — a rebuild in one transaction, never a removal signal (R15).
        // rebuild-guard-exempt: the WHERE carries `itineraryItemRebuildDeletable()` itself, so
        // ready_for_checkout / purchased / booked rows and D3 expert work are spared by construction.
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

  // ── D-49 — AFTER the apply has COMMITTED, never inside the transaction ────────────────────────
  // On a trip that is CURRENTLY finalized, capture the applied change as a new final version so the
  // snapshot-rendered Trip Card shows it immediately; on any other trip the helper answers null and
  // does nothing (a reopened plan's edits are captured when the traveler re-finalizes).
  //
  // Best-effort by contract — the apply has already committed and may already have been charged, so
  // a re-finalize failure must never turn a successful, paid apply into a 500. **But it is LOUD**
  // (the ruling's own amendment to the four existing callers' shape): the proposal id and the trip
  // id are on the line, so a Trip Card that did not advance after a paid apply is reconcilable
  // rather than a silence nobody can trace back to an apply.
  try {
    await (deps.reFinalize ?? reFinalizeIfCurrentlyFinal)(params.tripId, params.actorId);
  } catch (err: any) {
    console.error(
      "[proposal-apply] auto re-finalize FAILED after a committed apply (non-fatal, reconcilable):",
      { proposalId: params.proposalId, tripId: params.tripId, message: err?.message },
    );
  }

  return result;
}

/**
 * EVERY APPLY REFUSAL OF A PAID PROPOSAL REFUNDS IT (OPTION B, WIDENED — decision-maker ruling
 * 2026-09-17, ledger `2026-09-16-l16-lane1-review-fixes`). Stated once; the route asks this, never
 * a re-typed set of string compares (§18 rule 1).
 *
 * `protected_item` was off this list in the first cut because it was not yet ruled. The consequence
 * was a paid proposal that was terminally STUCK: the apply refused it for good (D3 protects the
 * item permanently, so no retry can ever succeed), and `discardPlanProposal` refuses a row carrying
 * a PaymentIntent — so the traveler could neither apply it nor discard it, and the fee stayed taken
 * for a change the platform itself had decided must never be made. The ruling closes that:
 * `protected_item` is a THIRD caller of the SAME refund path — no second Stripe site, the same
 * proposal-derived idempotency key, the same §15b claim, the same 409 shape carrying the `refund`
 * block beside `reason:"protected_item"`.
 *
 * `not_applicable` is still NOT here, and that is not an oversight: it is the apply's own atomic
 * conditional reporting that the row was no longer `proposed` when it got there — so the row is
 * already applied or discarded, and whatever was owed on it was settled by the path that moved it.
 * Refunding on that code would be a second opinion about a terminal row.
 *
 * `refunded` is ALSO not here (ledger `2026-09-19-proposal-refund-race-reason`) — it is not a
 * refusal this function should re-claim and refund, it is the route's signal that ANOTHER caller
 * already did. The route answers it through the SAME dedicated path the top-of-handler retry uses
 * (`refusal: null` — the refund is looked up, never re-issued), not through this list.
 */
export const PROPOSAL_REFUNDABLE_REFUSALS = [
  "stale_catalog_price",
  "listing_unavailable",
  "protected_item",
] as const;
export type ProposalRefundableRefusal = (typeof PROPOSAL_REFUNDABLE_REFUSALS)[number];
export function isRefundableProposalRefusal(code: string): code is ProposalRefundableRefusal {
  return (PROPOSAL_REFUNDABLE_REFUSALS as readonly string[]).includes(code);
}

/**
 * What happened to the money, said out loud on the 409 (§13).
 *
 *   `issued`         — Stripe holds a refund for this proposal's PaymentIntent; `refundId` names it
 *                      and `amountCents` is the row's recorded charge.
 *   `pending`        — the refund is CLAIMED (the row is `refunded`) but the Stripe call has not
 *                      completed: it threw, or a concurrent caller holds the same idempotency key
 *                      in flight. The claim stands; the traveler's retry re-drives the same key.
 *   `not_refundable` — the row is not a paid-and-open proposal (applied, discarded, or a different
 *                      PaymentIntent is recorded). Nothing was moved and nothing is owed here.
 */
export type ProposalRefundOutcome =
  | { issued: true; refundId: string; amountCents: number }
  | { issued: false; state: "pending" | "not_refundable" };

/**
 * OPTION B — REFUND THE FEE ON A REFUSED APPLY. (decision-maker rulings 2026-09-16 and 2026-09-17;
 * ledger `2026-09-16-l16-lane1-review-fixes`. §13, §14, §15, §15b, §18 rule 1.)
 *
 * A proposal can be PAID (the pay rail claimed it, Stripe took the fee, the PaymentIntent is stamped)
 * and then be refused at apply — it went stale, it lost a listing, or it names protected work
 * (LD 42 D3). The first cut refused the apply and left the money taken: a terminally unappliable
 * proposal the traveler had paid for. The ruling is that such a proposal is NOT applied at a changed
 * price, NOT applied over protected work, and NOT left stuck: the fee is refunded. Which refusals
 * qualify is `PROPOSAL_REFUNDABLE_REFUSALS` above, asked once.
 *
 * ── §15b: CLAIM → STRIPE → RECORD, and the claim is the status flip ──────────────────────────
 * ONE atomic conditional — `UPDATE plan_proposals SET status='refunded', charge_basis='paid',
 * charged_amount_cents=<what Stripe took> WHERE id=? AND trip_id=? AND status='proposed' AND
 * stripe_payment_intent_id=<this PI>` — is taken BEFORE the Stripe call. The statement is the guard:
 * two concurrent applies both refused produce exactly one claim. The `plan_proposals` row has no
 * `refunded_at`, and NO MIGRATION is added in this lane; the EXISTING columns carry the whole fact —
 * `status` says it was refunded, `charged_amount_cents` says how much (§14: the amount is Stripe's
 * own report of the charge, recorded on the row so every retry refunds the SAME figure and none of
 * it is read from a request), `charge_basis` says the charge was a real payment — and the `refunds`
 * audit row (migration 156; `booking_id` NULL, `stripe_payment_intent_id` = this PI, `reason` =
 * `planProposalRefundReason(...)`) carries the Stripe refund id and the refusal that caused it.
 *
 * ── THE LOSER AND THE RETRY ARE THE SAME PATH ────────────────────────────────────────────────
 * A caller that does NOT win the claim reads the row: if it is `refunded` on THIS PaymentIntent, it
 * looks for the audit row and, finding one, reports that refund. Finding none — the winner is still
 * in flight, or its Stripe call threw — it re-drives Stripe with the SAME idempotency key
 * (`planProposalRefundIdempotencyKey`): Stripe returns the same refund for a completed key, or an
 * in-use error for a concurrent one, and either way at most ONE refund exists. So a failed Stripe
 * call is never rolled back (§15b — rollback code runs in exactly the conditions that broke the
 * operation): the claim stays, the failure is logged LOUDLY, the outcome says `pending`, and the
 * traveler's next apply — which finds the row `refunded` — completes it.
 *
 * ── WHAT IS NOT WRITTEN, and why ─────────────────────────────────────────────────────────────
 * No `platform_revenue` reversal: `ledgerProposalCharge` runs only AFTER a successful apply, and a
 * refused apply never reached it, so there is no revenue row for this proposal to reverse — writing
 * a negative against nothing would fabricate a charge that was never recognised (§13). The TOLL is
 * recorded in `fee_ledger` instead (ruling `2026-09-25-planning-tolls`): once the refund is issued,
 * `recordAiTaskRefundToll` writes the fee row and its linked reversal together. No `ai_cost_tracking` row: the charge lane writes none
 * at apply. The Stripe refund and the `refunds` audit row ARE the money record, matching how a
 * booking refund is recorded.
 */
export async function refundRefusedProposalCharge(params: {
  proposalId: string;
  tripId: string;
  /** The PaymentIntent the apply was authorized on — the row's own, or the one just stamped. */
  paymentIntentId: string;
  /** What Stripe reported the intent took (`auth.amountCents`), or the row's recorded charge on a retry. */
  amountCents: number;
  /**
   * Which refusal triggered it. Every refusing caller passes its own `err.code`, so the audit row
   * names the reason the fee went back. `null` ONLY on the apply route's early return for a row
   * already `refunded` — there the refusal is not knowable and is recorded as
   * `PLAN_PROPOSAL_REFUND_UNKNOWN_REFUSAL`, never re-derived (§13; the full reasoning is on that
   * constant in `shared/plan-proposals.ts`).
   */
  refusal: ProposalRefundableRefusal | null;
}): Promise<ProposalRefundOutcome> {
  const { proposalId, tripId, paymentIntentId } = params;
  // §13: the refusal, or an explicit "not knowable" — never `retry`, which describes the CALL and
  // not the reason, and never a guess re-derived from the proposal's state now.
  const auditRefusal = params.refusal ?? PLAN_PROPOSAL_REFUND_UNKNOWN_REFUSAL;

  // §15b THE CLAIM — one statement, taken before any network call.
  const [claimed] = await db
    .update(planProposals)
    .set({
      status: PLAN_PROPOSAL_STATUS_REFUNDED,
      chargeBasis: PLAN_PROPOSAL_CHARGE_BASIS_PAID,
      chargedAmountCents: params.amountCents,
    })
    .where(
      and(
        eq(planProposals.id, proposalId),
        eq(planProposals.tripId, tripId),
        eq(planProposals.status, PLAN_PROPOSAL_STATUS_PROPOSED),
        eq(planProposals.stripePaymentIntentId, paymentIntentId),
      ),
    )
    .returning({ id: planProposals.id, chargedAmountCents: planProposals.chargedAmountCents });

  let recordedAmountCents = claimed?.chargedAmountCents ?? null;
  if (!claimed) {
    // Lost the claim, or arrived on a retry. Only a row ALREADY refunded on THIS PaymentIntent is
    // ours to finish; anything else (applied, discarded, another intent) is not refundable here.
    const [row] = await db
      .select({
        status: planProposals.status,
        stripePaymentIntentId: planProposals.stripePaymentIntentId,
        chargedAmountCents: planProposals.chargedAmountCents,
      })
      .from(planProposals)
      .where(and(eq(planProposals.id, proposalId), eq(planProposals.tripId, tripId)))
      .limit(1);
    if (
      !row ||
      row.status !== PLAN_PROPOSAL_STATUS_REFUNDED ||
      row.stripePaymentIntentId !== paymentIntentId
    ) {
      return { issued: false, state: "not_refundable" };
    }
    recordedAmountCents = row.chargedAmountCents;
  }

  // §14: the amount is the row's recorded charge — Stripe's own report, written at the claim — and
  // never a request value. `params.amountCents` is the same figure on the winner's path and the
  // fallback only if a row somehow carries none.
  const amountCents = recordedAmountCents ?? params.amountCents;

  // Already issued and recorded? Report it; no Stripe call.
  const [existing] = await db
    .select({ stripeRefundId: refunds.stripeRefundId })
    .from(refunds)
    .where(and(eq(refunds.stripePaymentIntentId, paymentIntentId), isNull(refunds.bookingId)))
    .limit(1);
  if (existing?.stripeRefundId) {
    await recordAiTaskRefundToll({
      proposalId,
      tripId,
      paymentIntentId,
      amountCents,
      stripeRefundId: existing.stripeRefundId,
      actor: "proposal-refund",
    });
    return { issued: true, refundId: existing.stripeRefundId, amountCents };
  }

  // Not yet recorded: drive Stripe under the proposal-derived key. Same key ⇒ same refund.
  try {
    const refund = await stripePaymentService.refundAiTaskProposalFee({
      proposalId,
      tripId,
      paymentIntentId,
      amountCents,
      idempotencyKey: planProposalRefundIdempotencyKey(proposalId),
      auditReason: planProposalRefundReason(auditRefusal, proposalId),
    });
    console.info(
      `[proposal-refund] fee refunded for a refused paid apply (refusal:${auditRefusal})`,
      { proposalId, tripId, paymentIntentId, refundId: refund.id },
    );
    // The toll record (ruling `2026-09-25-planning-tolls`): the fee row — the charge happened — and
    // its reversal — it went back — written together, because a refused apply never reached the
    // applied-toll writer. Idempotent on the proposal; never throws (§15b).
    await recordAiTaskRefundToll({
      proposalId,
      tripId,
      paymentIntentId,
      amountCents,
      stripeRefundId: refund.id,
      actor: "proposal-refund",
    });
    return { issued: true, refundId: refund.id, amountCents };
  } catch (err: any) {
    // LOUD, and the claim STANDS. The row is `refunded`, Stripe may or may not hold the refund, and
    // the next apply on this proposal re-drives the same key to find out (§15b).
    console.error(
      "[proposal-refund] Stripe refund FAILED after the claim — claim kept, retry re-drives the same key:",
      { proposalId, tripId, paymentIntentId, message: err?.message },
    );
    return { issued: false, state: "pending" };
  }
}

/**
 * Ledger the fee. §15b: AFTER the apply has committed, best-effort — an ancillary effect may never
 * break the operation that authorizes it, and a ledger write that could roll back a real apply
 * would be exactly that.
 *
 * `recordRevenueEventOnce` is the EXISTING idempotent recorder the optimizer's confirm path uses,
 * keyed on the PaymentIntent id, so a retry records one row (§15). **A Trip-Pass-covered apply
 * writes NO revenue row** — there is no money to record here. Its durable record is the
 * `charge_basis = 'trip_pass'` on the proposal row, and — since ruling `2026-09-25-planning-tolls` —
 * the fee + `fee_waiver` pair `recordAiTaskToll` writes to `fee_ledger` (never a `$0` row, §13).
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
