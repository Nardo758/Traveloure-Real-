/**
 * THE REFUND ON A REJECTED ARTIFACT — LD 46 / D-27's money outcome, ruled 2026-09-17 (ledger
 * `2026-09-17-ld50-remainder-and-artifact-refund`). `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` §5 carried
 * this as the one question that lane left open ("THE REFUND ON A REJECTED ARTIFACT is NOT RULED and is
 * invented nowhere here" — `booking-acceptance.service.ts`'s negative space). It is ruled now, and this
 * is the whole of it.
 *
 * ══ WHAT IS RULED, AND WHAT DELIBERATELY IS NOT ═════════════════════════════════════════════════
 * A TRAVELER'S REJECTION OF AN ARTIFACT MOVES NO MONEY BY ITSELF. D-27 already routes a rejection to
 * ASK (`confirmed → awaiting_acceptance`) and then ESCALATE (`awaiting_acceptance → disputed`) through
 * the ONE dispute writer, into the EXISTING admin dispute queue; nothing on that path touches Stripe,
 * mints, reverses or refunds, and this lane adds nothing to it. §14's rule that the ACTOR of a money
 * movement is a session with standing is why: the traveler states a fact, an admin resolves it.
 *
 * THE REFUND IS THE ADMIN'S RESOLUTION OUTCOME — "resolved for the traveler on a rejected artifact" —
 * and it is a FULL refund of what the booking's traveler was charged. It is a third outcome on the
 * EXISTING dispute rail (`POST /api/admin/disputes/:bookingId/refund-rejected-artifact`, under §2's
 * blanket `/api/admin` guard), beside `/reject` and `/uphold`, because that rail spells one resolution
 * outcome per route; no new queue, no new status, no new table, no migration.
 *
 * ══ WHY NOT JUST `/uphold` ═══════════════════════════════════════════════════════════════════════
 * `/uphold` refunds through `refundServiceBooking`, whose claim is `status <> 'refunded'` — ANY state
 * may refund — and whose key is `refund-sb-<id>`. This outcome may consume ONLY the `disputed` state a
 * dispute writer created (`ARTIFACT_REJECTION_REFUND_FROM_STATUSES`), so it owns a narrower claim and
 * its own amount-unambiguous key. Both outcomes remain available to an admin; they are different
 * findings, and the `refunds.reason` each records says which was made.
 *
 * ══ §15 / §15b SHAPE ═════════════════════════════════════════════════════════════════════════════
 * CLAIM    ONE atomic conditional — `UPDATE service_bookings SET status='refunded', … WHERE id = ? AND
 *          status IN ('disputed')` — taken BEFORE the Stripe call, so two concurrent resolutions produce
 *          exactly one refund and the loser matches zero rows. A check-then-update is the TOCTOU bug,
 *          never the guard. The same statement moves the row to `refunded` (the ruling: "the
 *          component/booking status moved to `refunded` in the same statement") and, in the same
 *          transaction, moves every not-yet-refunded `booking_component_states` row of a bundle to
 *          `refunded` too — the whole allocation came back, which is exactly what that status means.
 * STRIPE   `stripePaymentService.refundRejectedArtifact` — one more CALLER of the ONE
 *          `stripe.refunds.create` site for a service booking — with the key
 *          `artifact-reject-refund-<bookingId>`, so a retry returns the SAME refund and issues no second.
 * REVERT   a Stripe FAILURE puts the row back in `disputed` (its own from-state) so an admin can retry,
 *          mirroring `refundServiceBooking`'s posture exactly. This is safe here and only here because
 *          the claim is amount-unambiguous: a retry rebuilds the SAME key, so even a refund that landed
 *          invisibly cannot be issued twice.
 * RECORD   `recordIssuedRefund` — the ONE audit writer: the `refunds` row and the traveler-service-fee
 *          `reversal` ledger leg.
 *
 * ══ THE SELLER IS NEVER PAID FOR A REJECTED ARTIFACT ════════════════════════════════════════════
 * Two independent layers, both asserted: (a) the ledger reversals run FIRST (the `/uphold` order —
 * internal and idempotent, so a Stripe failure leaves a fully reversed ledger a retry re-confirms);
 * (b) the completion mint CANNOT fire for the row afterwards, because `mintCompletionEarningsForBooking`
 * runs only inside `storage.updateServiceBookingStatus` for `completed` / `partially_completed`, and
 * every from-state list that reaches either (`COMPLETION_ALLOWED_FROM_STATUSES`,
 * `DECLARED_WINDOW_CLOSE_FROM_STATUSES`, `PARTIAL_COMPLETION_FROM_STATUSES`, `ACCEPTANCE_FROM_STATUSES`,
 * `DISPUTE_REJECT_FROM_STATUSES`) excludes `refunded`. Nothing needs to be gated; the from-states
 * already are the gate, and the proof pins that they stay so.
 *
 * ══ §13 ══════════════════════════════════════════════════════════════════════════════════════════
 * Every refusal is NAMED and nothing is assumed: a booking with no PaymentIntent has unknown custody
 * and is refused (`no_payment_intent`), never "refunded" on paper; a booking that was charged nothing is
 * refused (`nothing_charged`) rather than sent to Stripe with a zero amount; a row that is not
 * `disputed` is refused with its current status stated. `refunded: true` is returned ONLY with a Stripe
 * refund id in hand — a surface may say "refund issued" on nothing less.
 *
 * §14: every amount is composed from the ROW (the ONE `travelerChargeForRow`, plus the booking's own
 * `travelerServiceFee` snapshot); nothing here reads a request body, and the acting admin arrives from
 * the session at the route.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { bookingComponentStates, serviceBookings } from "@shared/schema";
import { BUNDLE_COMPONENT_STATUS } from "@shared/bundle-component-states";
import { ARTIFACT_REJECTION_REFUND_FROM_STATUSES } from "../utils/booking-from-states";
import { travelerChargeForRow } from "./traveler-charge";
import { stripePaymentService } from "./stripe-payment.service";
import { storage } from "../storage";
import { checkRefundAgainstLostChargebacks, type LostChargebackGuardResult } from "./lost-chargeback-guard.service";

/** The internal reason recorded on the `refunds` row and the fee-ledger reversal for this outcome. */
export const ARTIFACT_REJECTION_REFUND_REASON = "artifact_rejected_resolved_for_traveler";

/** Injectable for the suite — the shared issuer's shape. Default = the real one. */
export type ArtifactRejectionRefundIssuer = (input: {
  bookingId: string;
  paymentIntentId: string;
  amountCents: number;
  travelerServiceFeeRefund: number;
  internalReason: string;
}) => Promise<{ id: string; status: string | null }>;

const defaultIssuer: ArtifactRejectionRefundIssuer = (input) =>
  stripePaymentService.refundRejectedArtifact(input);

export type ArtifactRejectionRefundResult =
  | {
      refunded: true;
      bookingId: string;
      /** True when this call found the booking already `refunded` — nothing moved, no Stripe call. */
      alreadyRefunded: boolean;
      /** NULL only on the already-refunded arm, where this call did not issue the refund. */
      stripeRefundId: string | null;
      amountCents: number;
      travelerServiceFeeRefundCents: number;
      componentsRefunded: number;
      reversedEarnings: number;
      skippedPaidOut: number;
      reversedRevenueRows: number;
    }
  | {
      refunded: false;
      bookingId: string;
      reason:
        | "booking_not_found"
        /** The row is not in a state a dispute created. `currentStatus` says which. */
        | "wrong_status"
        /** No Traveloure PaymentIntent — custody UNKNOWN, refused rather than assumed (§13). */
        | "no_payment_intent"
        /** The row records no traveler charge, so there is nothing to refund (§13 — never a $0 refund). */
        | "nothing_charged"
        /** Stripe refused or was unreachable; the claim was reverted and an admin may retry. */
        | "stripe_refund_failed"
        /** PR #1066: a lost chargeback already returned this money; nothing was changed. */
        | "lost_chargeback";
      currentStatus?: string | null;
      detail?: string;
      message?: string;
      guard?: Extract<LostChargebackGuardResult, { allowed: false }>;
    };

/**
 * THE OUTCOME. Idempotent and race-safe by the spine in the header. Never throws for a money reason —
 * every outcome is a named result; only a broken database throws.
 */
export async function refundRejectedArtifact(input: {
  bookingId: string;
  /** The resolving ADMIN, from the session (§14). Recorded on the cancellation reason; grants nothing. */
  actorUserId: string;
  now?: Date;
  refundIssuer?: ArtifactRejectionRefundIssuer;
}): Promise<ArtifactRejectionRefundResult> {
  const now = input.now ?? new Date();
  const bookingId = input.bookingId;
  const issuer = input.refundIssuer ?? defaultIssuer;

  const [booking] = await db.select().from(serviceBookings).where(eq(serviceBookings.id, bookingId));
  if (!booking) return { refunded: false, bookingId, reason: "booking_not_found" };
  if (booking.status === "refunded") {
    // A retry after a completed resolution: nothing moves, and no Stripe call is made. The refund id
    // lives on the `refunds` audit row, not on the booking, so this arm honestly reports NULL rather
    // than inventing one (§13).
    return {
      refunded: true,
      bookingId,
      alreadyRefunded: true,
      stripeRefundId: null,
      amountCents: 0,
      travelerServiceFeeRefundCents: 0,
      componentsRefunded: 0,
      reversedEarnings: 0,
      skippedPaidOut: 0,
      reversedRevenueRows: 0,
    };
  }
  if (!ARTIFACT_REJECTION_REFUND_FROM_STATUSES.includes(booking.status ?? "")) {
    // A pre-check is only the error message; the UPDATE below is the guard (§18b).
    return { refunded: false, bookingId, reason: "wrong_status", currentStatus: booking.status ?? null };
  }
  const paymentIntentId = booking.stripePaymentIntentId;
  if (typeof paymentIntentId !== "string" || paymentIntentId.length === 0) {
    return { refunded: false, bookingId, reason: "no_payment_intent" };
  }

  // ── THE AMOUNT, SERVER-DERIVED FROM THE ROW (§14) ────────────────────────────────────────────
  // What the traveler was CHARGED, through the ONE `travelerChargeForRow` composition (§18 rule 1) —
  // never re-composed here — plus the traveler service fee the row records having billed. A rejected
  // artifact is a made-whole outcome, so the fee comes back in FULL (the `/uphold` posture); a waived
  // fee billed nothing and refunds nothing.
  const totalAmount = Number(booking.totalAmount ?? 0) || 0;
  const details = (booking.bookingDetails ?? null) as Record<string, any> | null;
  const { amount: charged } = travelerChargeForRow({
    totalAmount,
    platformFee: booking.platformFee,
    insuranceFee: booking.insuranceFee,
    conciergeFeeSnapshot: details?.travelerCharge?.conciergeFee ?? null,
  });
  const feeSnap = details?.travelerServiceFee ?? null;
  const travelerServiceFeeRefundCents =
    feeSnap && feeSnap.waived !== true ? Math.max(0, Math.round((Number(feeSnap.charged) || 0) * 100)) : 0;
  const amountCents = Math.max(0, Math.round(charged * 100)) + travelerServiceFeeRefundCents;
  if (amountCents <= 0) return { refunded: false, bookingId, reason: "nothing_charged" };

  // ── PR #1066: A LOST CHARGEBACK ALREADY RETURNED THE MONEY ────────────────────────────────────
  // Refused BEFORE the ledger moves when this refund would reach into money the bank already gave
  // back. No Stripe call, no ledger change, no claim.
  const chargebackGuard = await checkRefundAgainstLostChargebacks({ paymentIntentId, requestedCents: amountCents });
  if (!chargebackGuard.allowed) {
    return { refunded: false, bookingId, reason: "lost_chargeback", message: chargebackGuard.message, guard: chargebackGuard };
  }

  // ── LEDGER FIRST (the `/uphold` order) ───────────────────────────────────────────────────────
  // Internal and idempotent, so a Stripe failure leaves a fully reversed ledger that a retry simply
  // re-confirms as a no-op. The opposite order has the worse failure mode: money out the door with the
  // earner still credited.
  const earnings = await storage.reverseEarningsForBooking(bookingId);
  const reversedRevenueRows = await storage.reversePlatformRevenueForBooking(bookingId);

  // ── CLAIM — ONE atomic conditional, taken BEFORE the Stripe call (§15b) ──────────────────────
  // The statement IS the guard: a concurrent resolution matches zero rows and makes no Stripe call.
  // The booking and its components move to `refunded` in the same transaction — a bundle's components
  // each had their whole allocation returned, which is exactly what that status means.
  const claimReason = `artifact_rejected:${input.actorUserId}`;
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(serviceBookings)
      .set({ status: "refunded", cancelledAt: now, cancellationReason: claimReason, updatedAt: now })
      .where(
        and(
          eq(serviceBookings.id, bookingId),
          inArray(serviceBookings.status, [...ARTIFACT_REJECTION_REFUND_FROM_STATUSES]),
        ),
      )
      .returning({ id: serviceBookings.id });
    if (rows.length === 0) return { won: false as const, components: 0 };
    const components = await tx
      .update(bookingComponentStates)
      .set({ status: BUNDLE_COMPONENT_STATUS.refunded, refundedAt: now, updatedAt: now })
      .where(
        and(
          eq(bookingComponentStates.bookingId, bookingId),
          isNull(bookingComponentStates.refundedAt),
          // §18b — the from-state is in the statement. A component already `refunded` matches nothing.
          sql`${bookingComponentStates.status} <> ${BUNDLE_COMPONENT_STATUS.refunded}`,
        ),
      )
      .returning({ id: bookingComponentStates.id });
    return { won: true as const, components: components.length };
  });
  if (!claimed.won) {
    const [after] = await db
      .select({ status: serviceBookings.status })
      .from(serviceBookings)
      .where(eq(serviceBookings.id, bookingId));
    return { refunded: false, bookingId, reason: "wrong_status", currentStatus: after?.status ?? null };
  }

  // ── STRIPE ───────────────────────────────────────────────────────────────────────────────────
  let refund: { id: string; status: string | null };
  try {
    refund = await issuer({
      bookingId,
      paymentIntentId,
      amountCents,
      travelerServiceFeeRefund: travelerServiceFeeRefundCents / 100,
      internalReason: ARTIFACT_REJECTION_REFUND_REASON,
    });
  } catch (err: any) {
    // Revert the claim to the from-state it consumed so an admin may retry — `refundServiceBooking`'s
    // posture, and safe for the same reason: the key is amount-unambiguous, so a retry rebuilds the
    // SAME key and a refund that landed invisibly is returned rather than re-issued.
    await db
      .update(serviceBookings)
      .set({ status: "disputed", cancelledAt: null, cancellationReason: null, updatedAt: now })
      .where(and(eq(serviceBookings.id, bookingId), eq(serviceBookings.status, "refunded")));
    logger.error({ err, bookingId }, "[artifact-rejection-refund] Stripe refund failed — claim reverted to disputed");
    return { refunded: false, bookingId, reason: "stripe_refund_failed", detail: err?.message };
  }

  logger.info(
    { bookingId, stripeRefundId: refund.id, amountCents, componentsRefunded: claimed.components },
    "[artifact-rejection-refund] rejected artifact resolved for the traveler — full refund issued",
  );
  return {
    refunded: true,
    bookingId,
    alreadyRefunded: false,
    stripeRefundId: refund.id,
    amountCents,
    travelerServiceFeeRefundCents,
    componentsRefunded: claimed.components,
    reversedEarnings: earnings.reversed,
    skippedPaidOut: earnings.skippedPaidOut,
    reversedRevenueRows,
  };
}
