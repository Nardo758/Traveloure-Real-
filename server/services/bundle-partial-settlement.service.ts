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
 *          the failed components' `refunded_at`/`refund_amount_cents`/`stripe_refund_id` in the same
 *          transaction. Two promoters — this module and the `charge.refunded` webhook — converge on
 *          one promote (§15c's shape). A retry after promote finds `settled_at` set and is a no-op.
 * RECLAIM  a claim older than `BUNDLE_SETTLEMENT_CLAIM_TTL_MINUTES` with `settled_at IS NULL` is
 *          re-stamped by the sweep and re-driven; Stripe's idempotency key returns the SAME refund if
 *          the first call did land. Inside the TTL a second caller is told `settlement_in_progress`
 *          and makes NO Stripe call.
 *
 * ══ §13 ══════════════════════════════════════════════════════════════════════════════════════════
 * Every refusal is NAMED (`BundlePartialSettlementResult`): a bundle with no allocation cannot settle
 * and says so; a bundle with no PaymentIntent has unknown custody and is refused, never assumed; a
 * `cancelled` component with no PINNED policy outcome (`cancel_refund_percent`, migration 308) refuses
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
 * IMPORTS NO `storage` and nothing from `booking-completion.service` (which imports THIS): the flip and
 * its mint are that module's; the entry `settleBundlePartially` there calls `issueBundlePartialSettlement`
 * here after the flip. §14: nothing here reads a request; every amount comes from the rows.
 */
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { bookingComponentStates, bundlePartialSettlements, serviceBookings } from "@shared/schema";
import { PARTIALLY_COMPLETED_STATUS } from "@shared/bundle-component-states";
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

  const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId));
  if (!booking) return { settled: false, bookingId, reason: "booking_not_found" };
  if (booking.status !== PARTIALLY_COMPLETED_STATUS) {
    return { settled: false, bookingId, reason: "wrong_status", detail: booking.status ?? undefined };
  }

  const details = (booking.bookingDetails ?? null) as Record<string, any> | null;
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
      await tx
        .update(bookingComponentStates)
        .set({ refundedAt: now, refundAmountCents: o.refundCents, stripeRefundId: input.stripeRefundId, updatedAt: now })
        .where(
          and(
            eq(bookingComponentStates.bookingId, input.bookingId),
            eq(bookingComponentStates.componentServiceId, o.componentServiceId),
            isNull(bookingComponentStates.refundedAt),
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
       WHERE sb.status = ${PARTIALLY_COMPLETED_STATUS}
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
