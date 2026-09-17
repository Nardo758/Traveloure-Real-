/**
 * BUNDLE PARTIAL SETTLEMENT — the MONEY LEG of a partially fulfilled bundle: the §15b spine
 * CLAIM → Stripe → PROMOTE, and the nightly TTL sweep that reclaims a claim the process died on.
 *
 * Decision-maker ruling 2026-09-16 (punchlist D-51; ledger `2026-09-16-bundle-partial-settlement`;
 * migration 307). The PURE half — what the bundle settles at — is `shared/bundle-partial-settlement.ts`
 * (`deriveBundlePartialSettlement`); this module reads the rows, hands them to that derivation, and
 * owns the four things that touch the database and Stripe.
 *
 * ══ WHAT IS SETTLED HERE, AND WHAT WAS ALREADY SETTLED BY THE MINT ═══════════════════════════════
 * The D-34 flip (`confirmed → partially_completed`) and the D-35 mint inside it — the seller's REDUCED
 * earning and the platform's REDUCED (proportional) revenue — happen in `settleBundlePartialCompletion`
 * BEFORE this module runs, over the SAME allocation this module refunds against. So this module does
 * NOT call `reversePlatformRevenueForBooking` on the commission row (that row already carries only the
 * kept share; reversing it again would deduct the undelivered share TWICE) and does NOT call
 * `reverseEarningsForBooking` (100%-only by ruling, and the earning is already reduced). What it
 * settles is the TRAVELER's side: one Stripe refund of the undelivered allocation plus the same share
 * of every traveler-paid fee, one `refunds` audit row, one traveler-service-fee `reversal` ledger row —
 * through the SHARED refund issuer in `stripe-payment.service.ts`, one more caller of the ONE Stripe
 * refund call site (§18 rule 1).
 *
 * ══ §15 / §15b SHAPE ═════════════════════════════════════════════════════════════════════════════
 * CLAIM    `INSERT INTO bundle_partial_settlements … ON CONFLICT (booking_id) DO NOTHING` with the four
 *          amounts PINNED. The statement is the guard: two concurrent callers, one row.
 * STRIPE   `refundBundlePartialSettlement` with the CLAIM ROW's cents (never a recomputation) and the
 *          amount-scoped key `bundle-settle-<bookingId>` — unambiguous because the pinned amount never
 *          changes. A Stripe failure leaves the claim CLAIMED-BUT-UNPROMOTED: no compensating rollback
 *          of money facts (rollback code runs in exactly the conditions that broke the operation).
 * PROMOTE  `UPDATE … SET settled_at, stripe_refund_id WHERE booking_id = ? AND settled_at IS NULL`, and
 *          the refunded components' `refunded_at`/`refund_amount_cents`/`stripe_refund_id` — plus
 *          `status = 'refunded'` for the ones whose WHOLE allocation came back (ledger
 *          `2026-09-17-ld50-remainder-and-artifact-refund`: this is that status's ONE writer) — in the
 *          same transaction. Two promoters — this module and the `charge.refunded` webhook — converge
 *          on one promote (§15c's shape). A retry after promote finds `settled_at` set and is a no-op,
 *          and is answered from the SETTLED ROW without re-deriving (the derivation refuses a
 *          `refunded` component by name, so re-deriving over a promote would turn a retry into a
 *          refusal).
 * RECLAIM  a claim older than `BUNDLE_SETTLEMENT_CLAIM_TTL_MINUTES` with `settled_at IS NULL` is
 *          re-stamped by the sweep and re-driven; Stripe's idempotency key returns the SAME refund if
 *          the first call did land. Inside the TTL a second caller is told `settlement_in_progress`
 *          and makes NO Stripe call.
 *
 * ══ §13 ══════════════════════════════════════════════════════════════════════════════════════════
 * Every refusal is NAMED (`BundlePartialSettlementResult`): a bundle with no allocation cannot settle
 * and says so; a bundle with no PaymentIntent has unknown custody and is refused, never assumed; a
 * `cancelled` component with no PINNED policy outcome (`cancel_refund_percent`, migration 309) refuses
 * the whole settlement rather than guessing a tier. The booking's status is never moved here — it
 * STAYS `partially_completed`.
 *
 * ══ THE TRAVELER-CANCELLED COMPONENT (Locked Decision 50, second half; ledger
 * `2026-09-16-bundle-component-traveler-cancel`) ═══════════════════════════════════════════════════
 * A `cancelled` component's allocation is refunded at the percent the SNAPSHOTTED policy yielded at the
 * cancel instant — pinned on the row by the cancel writer, read by the derivation, never re-resolved —
 * and the seller retains the remainder (already minted as delivered value by the D-35 flip). The fees
 * follow at the same refunded share. A settlement whose pinned `traveler_refund_cents` is ZERO (a late
 * strict cancel beside delivered components) is a VALID settlement that moves no money: the claim row
 * records the immutable outcome set, NO Stripe call is made (Stripe refuses a zero refund, and there is
 * nothing to refund), `stripe_refund_id` stays NULL — honestly, nothing was refunded — and the row is
 * promoted at once. Component refund columns are stamped only where `refundCents > 0`: a cancelled row
 * refunded 0 was NOT refunded, and `refunded_at` on it would say it was (§13).
 *
 * ══ THE SECOND STATE THIS LEG SETTLES — THE ALL-UNDELIVERED PARENT (decision-maker ruling 2026-09-17;
 * ledger `2026-09-17-all-undelivered-parent`) ═════════════════════════════════════════════════════
 * A bundle whose EVERY component ended undelivered is now CANCELLED by the ONE component writer
 * (`settleBundleAllUndelivered`), which flips the parent, releases the booking's claimed slot units
 * inside that same atomic statement, and MERGES `booking_details.allUndelivered = { at, cause,
 * componentIds }` onto the row. This module then refunds it through EXACTLY the spine above — one
 * claim, one Stripe refund, one promote — with each component at its OWN pinned answer: a `failed`
 * one at its full allocation (seller nonperformance is never excused by a cancellation policy), a
 * `cancelled` one at the percent its snapshotted policy pinned. NO SECOND REFUND PATH EXISTS.
 * Two narrownesses carry it, and both are load-bearing: the status gate admits `cancelled` ONLY with
 * that marker (an ordinary whole-row cancellation is still `wrong_status`, so this rail can never
 * refund beside the cancel rail's own refund), and `deriveBundlePartialSettlement`'s
 * `nothing_delivered` refusal is opted out of by THIS caller alone, through an explicit input.
 * NOTHING MINTS on that path — a cancelled parent mints no earning — so the retained remainder of a
 * late strict traveler-cancel is recorded on the immutable claim row and is NOT a seller earning;
 * minting on a cancelled parent is a new money event and needs its own ruling (§13, stated not built).
 *
 * IMPORTS NO `storage` and nothing from `booking-completion.service` (which imports THIS): the flip and
 * its mint are that module's; the entry `settleBundlePartially` there calls `issueBundlePartialSettlement`
 * here after the flip. §14: nothing here reads a request; every amount comes from the rows.
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { bookingComponentStates, bundlePartialSettlements, serviceBookings } from "@shared/schema";
import { BUNDLE_COMPONENT_STATUS, PARTIALLY_COMPLETED_STATUS } from "@shared/bundle-component-states";
import {
  deriveBundlePartialSettlement,
  type BundlePartialSettlementRefusal,
  type ComponentOutcome,
} from "@shared/bundle-partial-settlement";
import { readBundleComponentStates } from "./bundle-component-states.service";
import { travelerChargeForRow } from "./traveler-charge";
import { stripePaymentService } from "./stripe-payment.service";
import { logger } from "../infrastructure/logger";

/**
 * How long a claimed-but-unpromoted settlement is left alone before the sweep re-drives it. Long enough
 * for an in-flight Stripe call to finish; a reclaim inside a genuinely in-flight call is harmless
 * because the idempotency key returns the same refund.
 */
export const BUNDLE_SETTLEMENT_CLAIM_TTL_MINUTES = 30;

/** The internal reason recorded on the `refunds` row and the fee-ledger reversal for this refund. */
export const BUNDLE_SETTLEMENT_REFUND_REASON = "bundle_partial_settlement";

export type BundlePartialSettlementResult =
  | {
      settled: true;
      bookingId: string;
      /** True when this call found the settlement already promoted (a retry) — nothing moved. */
      alreadySettled: boolean;
      stripeRefundId: string | null;
      travelerRefundCents: number;
      settledAmountCents: number;
    }
  | {
      settled: false;
      bookingId: string;
      reason:
        | BundlePartialSettlementRefusal
        | "booking_not_found"
        | "wrong_status"
        | "bundle_component_states_unavailable"
        /** Another caller holds the claim inside the TTL — no Stripe call was made. */
        | "settlement_in_progress"
        /** The claim row's pinned amounts differ from what the rows now derive — a human decides. */
        | "settlement_amount_drift"
        /** Stripe refused or was unreachable; the claim stays reclaimable by the sweep. */
        | "stripe_refund_failed";
      detail?: string;
    };

/**
 * TRUE for the ONE non-`partially_completed` state this money leg may settle: a parent the component
 * writer cancelled because every component ended undelivered. The shape check is deliberately narrow
 * (an object carrying one of the three ruled causes), because the marker is what stands between this
 * rail and every ordinary cancellation. This module imports nothing from `booking-completion.service`
 * (which imports THIS), so the predicate is stated here rather than borrowed — it reads a jsonb key,
 * not a decision, and the WRITER of that key is still the single one over there.
 */
function isAllUndeliveredCancel(status: string | null | undefined, details: Record<string, any> | null): boolean {
  if (status !== "cancelled") return false;
  const raw = details?.allUndelivered;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return raw.cause === "seller_failed" || raw.cause === "traveler_cancelled" || raw.cause === "mixed";
}

/** Injectable for the suite: the shared issuer's shape. Default = the real one. */
export type BundleRefundIssuer = (input: {
  bookingId: string;
  paymentIntentId: string;
  amountCents: number;
  travelerServiceFeeRefund: number;
  internalReason: string;
}) => Promise<{ id: string; status: string | null }>;

const defaultIssuer: BundleRefundIssuer = (input) => stripePaymentService.refundBundlePartialSettlement(input);

interface ClaimedOutcomes {
  components: ComponentOutcome[];
  feeRefundCents: number;
  travelerServiceFeeRefundCents: number;
  /** The share of the price refunded to the traveler — the share every traveler-paid fee was refunded at. */
  refundedFraction: number;
  initiatedBy: string;
}

/**
 * THE MONEY LEG for one `partially_completed` booking. Idempotent and race-safe by the spine above.
 * Never throws for a money reason — every outcome is a named result; only a broken database throws.
 */
export async function issueBundlePartialSettlement(input: {
  bookingId: string;
  now?: Date;
  /** Who drove this (an owner rail's actor, `settlement_sweep`, …) — recorded on the claim, grants nothing. */
  actor?: string;
  ttlMinutes?: number;
  refundIssuer?: BundleRefundIssuer;
}): Promise<BundlePartialSettlementResult> {
  const now = input.now ?? new Date();
  const ttl = input.ttlMinutes ?? BUNDLE_SETTLEMENT_CLAIM_TTL_MINUTES;
  const issuer = input.refundIssuer ?? defaultIssuer;
  const bookingId = input.bookingId;

  // ── A PROMOTED SETTLEMENT IS THE IMMUTABLE RECORD; NOTHING IS RE-DERIVED OVER IT ────────────────
  // (ledger `2026-09-17-ld50-remainder-and-artifact-refund`.) The promote now ALSO stamps the fully
  // refunded components' `status = 'refunded'` (see the promote below), and
  // `deriveBundlePartialSettlement` REFUSES a component reading `refunded` by name
  // (`component_already_refunded` — "no second refund, a human decides"). Re-deriving after a promote
  // would therefore turn a plain retry into a refusal. This read goes FIRST because the settled row
  // already answers the question: "the settlement amount and component outcome set are immutable after
  // successful settlement" (the D-51 ruling), so a re-derivation could tell us nothing it may act on.
  const [settledClaim] = await db
    .select()
    .from(bundlePartialSettlements)
    .where(and(eq(bundlePartialSettlements.bookingId, bookingId), sql`${bundlePartialSettlements.settledAt} IS NOT NULL`));
  if (settledClaim) {
    return {
      settled: true,
      bookingId,
      alreadySettled: true,
      stripeRefundId: settledClaim.stripeRefundId ?? null,
      travelerRefundCents: settledClaim.travelerRefundCents,
      settledAmountCents: settledClaim.settledAmountCents,
    };
  }

  const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId));
  if (!booking) return { settled: false, bookingId, reason: "booking_not_found" };
  const details = (booking.bookingDetails ?? null) as Record<string, any> | null;
  // ── THE ALL-UNDELIVERED PARENT (ledger `2026-09-17-all-undelivered-parent`) ──────────────────────
  // The SECOND state this money leg may settle, and the narrowness is the whole of it: NOT every
  // `cancelled` booking, only one the ONE component writer cancelled because every component ended
  // undelivered — which it says by MERGING `booking_details.allUndelivered` onto the row in the same
  // call as the flip. An ordinary whole-row traveler cancellation carries no such marker and is still
  // refused `wrong_status` here, so this rail can never issue a second refund beside that one (§13: an
  // absent marker is never read as a default one). `deriveBundlePartialSettlement`'s `nothing_delivered`
  // refusal is likewise opted OUT OF only for this case, and by this caller alone.
  const allUndelivered = isAllUndeliveredCancel(booking.status, details);
  if (booking.status !== PARTIALLY_COMPLETED_STATUS && !allUndelivered) {
    return { settled: false, bookingId, reason: "wrong_status", detail: booking.status ?? undefined };
  }

  const states = await readBundleComponentStates({
    bookingId,
    bookingDetails: details,
    bundleServiceId: booking.serviceId ?? null,
  });
  if (states.source !== "rows") return { settled: false, bookingId, reason: "bundle_component_states_unavailable" };

  // What the traveler paid ABOVE the pre-fee price — through the ONE composition (§18 rule 1), never
  // recomposed here. A3: the concierge fee; pre-A3: the platform fee + insurance that row was charged.
  const totalAmount = Number(booking.totalAmount ?? 0) || 0;
  const { amount: charged } = travelerChargeForRow({
    totalAmount,
    platformFee: booking.platformFee,
    insuranceFee: booking.insuranceFee,
    conciergeFeeSnapshot: details?.travelerCharge?.conciergeFee ?? null,
  });
  const travelerFeesChargedCents = Math.max(0, Math.round(charged * 100) - Math.round(totalAmount * 100));
  const feeSnap = details?.travelerServiceFee ?? null;
  const travelerServiceFeeChargedCents =
    feeSnap && feeSnap.waived !== true ? Math.max(0, Math.round((Number(feeSnap.charged) || 0) * 100)) : 0;

  const derived = deriveBundlePartialSettlement({
    components: states.components,
    totalAmount: booking.totalAmount,
    platformFee: booking.platformFee,
    providerEarnings: booking.providerEarnings,
    parentHasPaymentIntent: typeof booking.stripePaymentIntentId === "string" && booking.stripePaymentIntentId.length > 0,
    travelerFeesChargedCents,
    travelerServiceFeeChargedCents,
    // Opted in ONLY for the all-undelivered parent above; every other caller keeps `nothing_delivered`.
    allowNothingDelivered: allUndelivered,
  });
  if (!derived.ok) return { settled: false, bookingId, reason: derived.reason, detail: derived.detail };
  const paymentIntentId = booking.stripePaymentIntentId as string;

  // ── CLAIM ─────────────────────────────────────────────────────────────────────────────────────
  const outcomes: ClaimedOutcomes = {
    components: derived.componentOutcomes,
    feeRefundCents: derived.feeRefundCents,
    travelerServiceFeeRefundCents: derived.travelerServiceFeeRefundCents,
    refundedFraction: derived.refundedFraction,
    initiatedBy: input.actor ?? "unspecified",
  };
  const inserted = await db
    .insert(bundlePartialSettlements)
    .values({
      bookingId,
      settledAmountCents: derived.settledAmountCents,
      travelerRefundCents: derived.travelerRefundCents,
      sellerEarningCents: derived.sellerEarningCents,
      platformRevenueCents: derived.platformRevenueCents,
      componentOutcomes: outcomes,
      claimedAt: now,
    })
    .onConflictDoNothing({ target: bundlePartialSettlements.bookingId })
    .returning();
  let claim = inserted[0];
  if (!claim) {
    const [existing] = await db.select().from(bundlePartialSettlements).where(eq(bundlePartialSettlements.bookingId, bookingId));
    if (!existing) return { settled: false, bookingId, reason: "settlement_in_progress" };
    if (existing.settledAt) {
      return {
        settled: true,
        bookingId,
        alreadySettled: true,
        stripeRefundId: existing.stripeRefundId ?? null,
        travelerRefundCents: existing.travelerRefundCents,
        settledAmountCents: existing.settledAmountCents,
      };
    }
    // The settlement amount is IMMUTABLE once claimed (the ruling): the pinned row is the contract, and
    // a derivation that now disagrees with it is handed to a human, never silently re-pinned.
    if (
      existing.travelerRefundCents !== derived.travelerRefundCents ||
      existing.settledAmountCents !== derived.settledAmountCents
    ) {
      return {
        settled: false,
        bookingId,
        reason: "settlement_amount_drift",
        detail: `pinned ${existing.travelerRefundCents}/${existing.settledAmountCents} vs derived ${derived.travelerRefundCents}/${derived.settledAmountCents}`,
      };
    }
    // §15b RECLAIM: only a claim older than the TTL, still unpromoted. The statement is the guard.
    const staleBefore = new Date(now.getTime() - ttl * 60_000);
    const reclaimed = await db
      .update(bundlePartialSettlements)
      .set({ claimedAt: now, updatedAt: now })
      .where(
        and(
          eq(bundlePartialSettlements.bookingId, bookingId),
          isNull(bundlePartialSettlements.settledAt),
          lt(bundlePartialSettlements.claimedAt, staleBefore),
        ),
      )
      .returning();
    if (reclaimed.length === 0) return { settled: false, bookingId, reason: "settlement_in_progress" };
    claim = reclaimed[0];
  }

  // ── NOTHING TO REFUND — a valid settlement that moves no money ───────────────────────────────
  // Every undelivered component was a traveler cancel whose snapshotted policy yielded 0 (a late strict
  // cancel, a non-refundable bundle). The seller kept everything (the mint already said so); the outcome
  // set is the record. No Stripe call — there is no amount, and Stripe refuses a zero refund — and the
  // promote stamps a NULL refund id, because none exists (§13).
  if (claim.travelerRefundCents === 0) {
    const { promoted } = await promoteBundlePartialSettlement({ bookingId, stripeRefundId: null, now });
    logger.info(
      { bookingId, settledAmountCents: claim.settledAmountCents, promoted },
      "[bundle-settlement] partial settlement recorded with nothing to refund (policy yielded 0) — no Stripe call",
    );
    return {
      settled: true,
      bookingId,
      alreadySettled: !promoted,
      stripeRefundId: null,
      travelerRefundCents: 0,
      settledAmountCents: claim.settledAmountCents,
    };
  }

  // ── STRIPE — the CLAIM ROW's cents, never a recomputation ────────────────────────────────────
  const claimedOutcomes = (claim.componentOutcomes ?? {}) as Partial<ClaimedOutcomes>;
  let refund: { id: string; status: string | null };
  try {
    refund = await issuer({
      bookingId,
      paymentIntentId,
      amountCents: claim.travelerRefundCents,
      travelerServiceFeeRefund: Math.round(claimedOutcomes.travelerServiceFeeRefundCents ?? 0) / 100,
      internalReason: BUNDLE_SETTLEMENT_REFUND_REASON,
    });
  } catch (err: any) {
    // The claim stays CLAIMED-BUT-UNPROMOTED for the sweep. No money fact is rolled back (§15b).
    logger.error({ err, bookingId }, "[bundle-settlement] Stripe refund failed — claim left for the TTL sweep");
    return { settled: false, bookingId, reason: "stripe_refund_failed", detail: err?.message };
  }

  // ── PROMOTE ──────────────────────────────────────────────────────────────────────────────────
  const { promoted } = await promoteBundlePartialSettlement({ bookingId, stripeRefundId: refund.id, now });
  logger.info(
    {
      bookingId,
      stripeRefundId: refund.id,
      travelerRefundCents: claim.travelerRefundCents,
      settledAmountCents: claim.settledAmountCents,
      promoted,
    },
    "[bundle-settlement] partial settlement issued",
  );
  return {
    settled: true,
    bookingId,
    alreadySettled: !promoted,
    stripeRefundId: refund.id,
    travelerRefundCents: claim.travelerRefundCents,
    settledAmountCents: claim.settledAmountCents,
  };
}

/**
 * THE PROMOTE — ONE atomic conditional, two callers (the settlement above and the `charge.refunded`
 * webhook). `WHERE settled_at IS NULL` is the guard: the loser matches zero rows and stamps nothing.
 * Every component that was actually refunded something — a `failed` one at its full allocation, a
 * `cancelled` one at its pinned policy share — has its refund columns (D-32 declared them) stamped in
 * the same transaction, each guarded by its own `refunded_at IS NULL`. A component whose refund is 0
 * is NOT stamped: nothing was refunded, and `refunded_at` would say otherwise (§13).
 * `stripeRefundId` is NULL only for a settlement that moved no money (see the module header).
 *
 * ══ LD 50 REMAINDER — `refunded` FINALLY HAS ITS ONE WRITER, AND IT IS THIS STATEMENT ════════════
 * (ledger `2026-09-17-ld50-remainder-and-artifact-refund`.) `BUNDLE_COMPONENT_STATUS.refunded` was
 * DECLARED so readers read it correctly and written by NOTHING, so a component whose allocation had
 * actually gone back to the traveler still read `failed` or `cancelled` forever. It is stamped HERE —
 * in the SAME transaction and the SAME UPDATE as the refund columns, never a second pass — so the money
 * fact and the status can never disagree, and the promote's `settled_at IS NULL` guard is what makes it
 * exactly-once: the loser of a concurrent promote matches zero rows and stamps nothing.
 *
 * WHICH COMPONENTS, AND WHAT THE STATUS NOW MEANS. Exactly the ones this settlement refunded something
 * for — the rows whose pinned outcome carries `refundCents > 0`; a component refunded 0 (a late strict
 * cancel) was NOT refunded and is not stamped at all (§13). `refunded` therefore means THIS COMPONENT'S
 * MONEY IS SETTLED, which is precisely the fact `deriveBundlePartialSettlement`'s
 * `component_already_refunded` refusal turns on ("a row reading it is handed to a human, never refunded
 * twice"). NOTHING about WHO ended the component or WHY is lost: `failed_at`/`failure_reason`,
 * `cancelled_at`/`cancel_reason` and the pinned `cancel_refund_percent` all stay on the row beside
 * `refund_amount_cents`, so a seller's nonperformance and a traveler's 50% cancel remain distinguishable
 * — and the settlement row's immutable `component_outcomes` names both outcomes verbatim.
 *
 * IT CANNOT MOVE AN AMOUNT ANYONE LATER DERIVES, because nothing re-derives over a promoted settlement:
 * `issueBundlePartialSettlement` answers a retry from the SETTLED ROW before deriving, the sweep's
 * candidate scan excludes promoted rows, and the flip + reduced mint only ever runs from `confirmed`.
 *
 * THE FROM-STATE IS IN THE STATEMENT (§18b): `status IN ('failed','cancelled')`. A row already
 * `refunded` matches nothing, and a row somehow back in `pending` is never silently terminalised.
 */
export async function promoteBundlePartialSettlement(input: {
  bookingId: string;
  stripeRefundId: string | null;
  now?: Date;
}): Promise<{ promoted: boolean }> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(bundlePartialSettlements)
      .set({ settledAt: now, stripeRefundId: input.stripeRefundId, updatedAt: now })
      .where(and(eq(bundlePartialSettlements.bookingId, input.bookingId), isNull(bundlePartialSettlements.settledAt)))
      .returning();
    if (rows.length === 0) return { promoted: false };
    const outcomes = ((rows[0].componentOutcomes ?? {}) as Partial<ClaimedOutcomes>).components ?? [];
    for (const o of outcomes) {
      if (o.outcome === "delivered" || !(o.refundCents > 0)) continue;
      // LD 50 remainder: the status moves to `refunded` for EVERY component this settlement refunded
      // something for — "the component rows it refunded", the ruling's own words. WHY and BY WHOM the
      // component ended is not lost: `failed_at`/`failure_reason`, `cancelled_at`/`cancel_reason` and the
      // pinned `cancel_refund_percent` stay on the row beside `refund_amount_cents`, so a reader can
      // still tell a seller's nonperformance from a traveler's 50% cancel — the status now says the money
      // is SETTLED, which is the fact the derivation's `component_already_refunded` refusal turns on.
      await tx
        .update(bookingComponentStates)
        .set({
          refundedAt: now,
          refundAmountCents: o.refundCents,
          stripeRefundId: input.stripeRefundId,
          status: BUNDLE_COMPONENT_STATUS.refunded,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookingComponentStates.bookingId, input.bookingId),
            eq(bookingComponentStates.componentServiceId, o.componentServiceId),
            isNull(bookingComponentStates.refundedAt),
            // §18b — the from-state is IN the statement. Only the two undelivered answers a settlement
            // refunds may become `refunded`; an already-`refunded` or a `pending` row matches nothing.
            inArray(bookingComponentStates.status, [
              BUNDLE_COMPONENT_STATUS.failed,
              BUNDLE_COMPONENT_STATUS.cancelled,
            ]),
          ),
        );
    }
    return { promoted: true };
  });
}

export interface BundleSettlementSweepResult {
  scanned: number;
  settled: number;
  alreadySettled: number;
  refused: Record<string, number>;
  settledBookingIds: string[];
}

/**
 * THE NIGHTLY SWEEP (§15b TTL reclaim posture): every `partially_completed` booking with NO settlement
 * row (the process died between the flip and the claim) or an UNPROMOTED one (it died between the claim
 * and the promote, or Stripe failed) is re-driven through `issueBundlePartialSettlement`, which reclaims
 * only a claim older than the TTL. Never throws; returns per-outcome counts so a scheduler, an admin
 * endpoint or a test can assert on them. `onlyBookingIds` scopes an operational or test pass.
 */
export async function sweepUnsettledBundlePartials(opts?: {
  now?: Date;
  ttlMinutes?: number;
  limit?: number;
  onlyBookingIds?: string[];
  refundIssuer?: BundleRefundIssuer;
}): Promise<BundleSettlementSweepResult> {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 200;
  const result: BundleSettlementSweepResult = { scanned: 0, settled: 0, alreadySettled: 0, refused: {}, settledBookingIds: [] };
  const scope = opts?.onlyBookingIds;
  if (scope && scope.length === 0) return result;

  let candidates: string[] = [];
  try {
    const scopeSql = scope
      ? sql` AND sb.id IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})`
      : sql``;
    const r = await db.execute(sql`
      SELECT sb.id
        FROM service_bookings sb
        LEFT JOIN bundle_partial_settlements s ON s.booking_id = sb.id
       WHERE (
               sb.status = ${PARTIALLY_COMPLETED_STATUS}
               -- Ledger 2026-09-17-all-undelivered-parent: a parent cancelled because every component
               -- ended undelivered owes the same refund, and the process can die between its flip and
               -- its claim in exactly the same way. Keyed on the MARKER, never on the status alone, so
               -- an ordinary whole-row cancellation is never swept into this rail.
               OR (sb.status = 'cancelled' AND sb.booking_details -> 'allUndelivered' IS NOT NULL)
             )
         AND (s.id IS NULL OR s.settled_at IS NULL)${scopeSql}
       ORDER BY sb.updated_at ASC
       LIMIT ${limit}
    `);
    candidates = (r.rows as Array<{ id: string }>).map((x) => x.id);
  } catch (err) {
    logger.error({ err }, "[bundle-settlement] sweep candidate scan failed");
    return result;
  }
  result.scanned = candidates.length;

  for (const bookingId of candidates) {
    try {
      const outcome = await issueBundlePartialSettlement({
        bookingId,
        now,
        actor: "settlement_sweep",
        ttlMinutes: opts?.ttlMinutes,
        refundIssuer: opts?.refundIssuer,
      });
      if (outcome.settled) {
        if (outcome.alreadySettled) result.alreadySettled += 1;
        else {
          result.settled += 1;
          result.settledBookingIds.push(bookingId);
        }
      } else {
        result.refused[outcome.reason] = (result.refused[outcome.reason] ?? 0) + 1;
      }
    } catch (err) {
      logger.error({ err, bookingId }, "[bundle-settlement] sweep item failed — booking left untouched");
      result.refused.error = (result.refused.error ?? 0) + 1;
    }
  }
  // ONE line per pass, including a pass that did nothing (§17 rule 2's spirit).
  logger.info(
    { scanned: result.scanned, settled: result.settled, alreadySettled: result.alreadySettled, refused: result.refused },
    "[bundle-settlement] nightly partial-settlement sweep",
  );
  return result;
}
