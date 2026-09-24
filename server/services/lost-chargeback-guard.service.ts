/**
 * A LOST CHARGEBACK IS NEVER REFUNDED A SECOND TIME (decision-maker, Sep 24, 2026; PR #1066).
 *
 * When a chargeback is lost, the card network has already returned the disputed money to the
 * traveler. A platform refund of the same money pays them twice, and every refund path on this
 * platform reverses the seller's earnings and the platform revenue BEFORE it calls Stripe. So the
 * refusal has to come first: this module is the ONE decision (§18 rule 1), called
 *   (a) by every booking refund entry point BEFORE it touches the ledger, and
 *   (b) at the shared Stripe refund call (`createStripeRefundForBooking`), so a route that forgot
 *       (a) still cannot send the money.
 * A refused attempt makes no Stripe call and no ledger change, and says why.
 *
 * WHAT IS BLOCKED IS THE DISPUTED AMOUNT, NOT THE PAYMENT. One PaymentIntent can pay several
 * bookings, and a chargeback can be partial. The allowance is per PaymentIntent, from Stripe's own
 * numbers: charged − already refunded − lost chargebacks. A refund that fits in what is left is
 * allowed; one that would reach into the charged-back money is refused.
 *
 * WHEN IT LOOKS: only when this database already knows of a lost chargeback on the PaymentIntent —
 * a booking on it is `dispute_lost` or carries `booking_details.lostChargebacks` (written by the
 * dispute handler). Every other refund makes no extra Stripe call. If the lookup is needed and
 * fails, the refund is refused (fail closed): the amount cannot be proven safe.
 *
 * NOT COVERED, stated (§18d): a chargeback lost before the webhook recorded it (Stripe itself
 * refuses to refund a charged-back charge in that window); refunds outside the service-booking rail
 * (coordination fees, ready-made purchases), whose disputes the handler does not record.
 */
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { getStripeSecretKey } from "../utils/stripe-key";

export const LOST_CHARGEBACKS_KEY = "lostChargebacks" as const;

export interface PaymentIntentLedger {
  chargedCents: number;
  refundedCents: number;
  lostChargebackCents: number;
  refunds: Array<{ id: string; amount: number; metadata: Record<string, string> | null }>;
}

export type PaymentIntentLedgerLookup = (paymentIntentId: string) => Promise<PaymentIntentLedger>;

/** Stripe's own numbers for a PaymentIntent: its charges, their refunds, and its lost disputes. */
export const stripePaymentIntentLedger: PaymentIntentLedgerLookup = async (paymentIntentId) => {
  const stripe = new Stripe(getStripeSecretKey() || "", { apiVersion: "2024-12-18.acacia" as any });
  const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 100, expand: ["data.refunds"] });
  const disputes = await stripe.disputes.list({ payment_intent: paymentIntentId, limit: 100 });
  let chargedCents = 0;
  let refundedCents = 0;
  const refunds: PaymentIntentLedger["refunds"] = [];
  for (const c of charges.data) {
    if (!c.paid) continue;
    chargedCents += c.amount_captured ?? c.amount;
    refundedCents += c.amount_refunded ?? 0;
    for (const r of c.refunds?.data ?? []) {
      refunds.push({ id: r.id, amount: r.amount, metadata: (r.metadata as Record<string, string>) ?? null });
    }
  }
  const lostChargebackCents = disputes.data
    .filter((d) => d.status === "lost")
    .reduce((sum, d) => sum + d.amount, 0);
  return { chargedCents, refundedCents, lostChargebackCents, refunds };
};

/** Test seam: replaces the Stripe lookup. Never set outside tests. */
export const _lostChargebackTestHooks: { lookup?: PaymentIntentLedgerLookup } = {};

export type LostChargebackGuardResult =
  | { allowed: true; checked: boolean }
  | {
      allowed: false;
      reason: "lost_chargeback" | "lost_chargeback_unverifiable";
      message: string;
      paymentIntentId: string;
      requestedCents: number;
      chargedCents?: number;
      refundedCents?: number;
      lostChargebackCents?: number;
      refundableCents?: number;
    };

export class LostChargebackRefundBlockedError extends Error {
  constructor(public readonly result: Extract<LostChargebackGuardResult, { allowed: false }>) {
    super(result.message);
    this.name = "LostChargebackRefundBlockedError";
  }
}

/** Does this database know of a lost chargeback on the PaymentIntent? */
export async function paymentIntentHasRecordedLostChargeback(paymentIntentId: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT 1 FROM service_bookings
     WHERE stripe_payment_intent_id = ${paymentIntentId}
       AND (status = 'dispute_lost' OR (COALESCE(booking_details, '{}'::jsonb) -> ${LOST_CHARGEBACKS_KEY}::text) IS NOT NULL)
     LIMIT 1
  `);
  return (r.rows ?? []).length > 0;
}

/**
 * THE decision. `replay` names the refund this call would create (its metadata `source` and
 * `bookingId`): a refund Stripe already holds with the same source, booking and amount is the SAME
 * refund being re-driven under its idempotency key, not a second one, and is allowed.
 */
export async function checkRefundAgainstLostChargebacks(input: {
  paymentIntentId: string;
  requestedCents: number;
  replay?: { source?: string; bookingId?: string };
}): Promise<LostChargebackGuardResult> {
  const { paymentIntentId, requestedCents } = input;
  if (!paymentIntentId || !(requestedCents > 0)) return { allowed: true, checked: false };
  if (!(await paymentIntentHasRecordedLostChargeback(paymentIntentId))) return { allowed: true, checked: false };

  let ledger: PaymentIntentLedger;
  try {
    ledger = await (_lostChargebackTestHooks.lookup ?? stripePaymentIntentLedger)(paymentIntentId);
  } catch (err: any) {
    return {
      allowed: false,
      reason: "lost_chargeback_unverifiable",
      paymentIntentId,
      requestedCents,
      message:
        "This payment has a lost chargeback, and Stripe could not be reached to confirm how much of it is still " +
        "refundable, so no refund was issued and nothing was changed. Try again shortly.",
    };
  }

  if (input.replay?.source) {
    const same = ledger.refunds.find(
      (r) =>
        r.amount === requestedCents &&
        r.metadata?.source === input.replay!.source &&
        (input.replay!.bookingId === undefined || r.metadata?.bookingId === input.replay!.bookingId),
    );
    if (same) return { allowed: true, checked: true };
  }

  const refundableCents = Math.max(0, ledger.chargedCents - ledger.refundedCents - ledger.lostChargebackCents);
  if (requestedCents <= refundableCents) return { allowed: true, checked: true };
  return {
    allowed: false,
    reason: "lost_chargeback",
    paymentIntentId,
    requestedCents,
    chargedCents: ledger.chargedCents,
    refundedCents: ledger.refundedCents,
    lostChargebackCents: ledger.lostChargebackCents,
    refundableCents,
    message:
      `This payment lost a chargeback of ${fmt(ledger.lostChargebackCents)}: the bank has already returned that money ` +
      `to the traveler. Only ${fmt(refundableCents)} of it can still be refunded, and this refund asks for ` +
      `${fmt(requestedCents)}, so it was not issued and nothing was changed. To close the booking out, use ` +
      `"reconcile lost chargeback", which adjusts the ledger without sending money.`,
  };
}

/**
 * The pre-ledger check for one booking. A booking already `refunded` passes: every refund path
 * answers that retry as "already refunded" without a new Stripe call.
 */
export async function checkBookingRefundAgainstLostChargebacks(
  bookingId: string,
  requestedCents: number,
): Promise<LostChargebackGuardResult> {
  const r = await db.execute(sql`
    SELECT status, stripe_payment_intent_id FROM service_bookings WHERE id = ${bookingId} LIMIT 1
  `);
  const row = (r.rows ?? [])[0] as { status: string | null; stripe_payment_intent_id: string | null } | undefined;
  if (!row || row.status === "refunded" || !row.stripe_payment_intent_id) return { allowed: true, checked: false };
  return checkRefundAgainstLostChargebacks({ paymentIntentId: row.stripe_payment_intent_id, requestedCents });
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The pre-ledger check for a `refundServiceBooking` call, with the SAME options it will be given:
 * the amount is computed by the refund's own computation, never restated here (§18 rule 1).
 */
export async function checkServiceBookingRefundPreflight(
  bookingId: string,
  options?: { amountOverride?: number; feeRefundPercent?: number },
): Promise<LostChargebackGuardResult> {
  const { stripePaymentService } = await import("./stripe-payment.service");
  const cents = await stripePaymentService.previewServiceBookingRefundCents(bookingId, options);
  if (cents === null) return { allowed: true, checked: false };
  return checkBookingRefundAgainstLostChargebacks(bookingId, cents);
}

/** The 409 body every entry point answers with when the guard refuses. */
export function lostChargebackRefusalBody(result: Extract<LostChargebackGuardResult, { allowed: false }>) {
  return {
    error: result.message,
    message: result.message,
    reason: result.reason,
    paymentIntentId: result.paymentIntentId,
    requestedCents: result.requestedCents,
    ...(result.refundableCents !== undefined
      ? {
          refundableCents: result.refundableCents,
          lostChargebackCents: result.lostChargebackCents,
          chargedCents: result.chargedCents,
          refundedCents: result.refundedCents,
        }
      : {}),
  };
}

export const CHARGEBACK_RECONCILIATION_KEY = "chargebackReconciliation" as const;

export type LostChargebackReconciliationResult =
  | { reconciled: false; reason: "not_found" }
  | { reconciled: false; reason: "lost_chargeback_unverifiable"; message: string }
  | {
      reconciled: true;
      bookingId: string;
      /** True when an earlier call already recorded it; the reversals below re-ran as no-ops. */
      alreadyReconciled: boolean;
      /** Share of the payment the bank took back: lost chargebacks ÷ charged, capped at 1. */
      fraction: number;
      reversedEarnings: number;
      skippedPaidOut: number;
      /** A partial chargeback leaves the seller's earning on hold: no proportional earning reversal exists. */
      earningsLeftOnHold: boolean;
      reversedRevenueRows: number;
    };

/**
 * THE LEDGER-ONLY WAY TO CLOSE A LOST CHARGEBACK (decision-maker, Sep 24, 2026). The bank already
 * returned the money, so nothing is sent: the platform revenue on the booking is reversed in the
 * share the bank took back, the seller's in-escrow earnings are reversed when that share is the
 * whole payment, and the booking records who reconciled it, when and why. Earnings already paid out
 * are never touched (they stay flagged `manual_review` by the dispute handler) and are reported.
 *
 * ONE atomic conditional records the reconciliation; a retry finds it recorded, keeps the recorded
 * fraction and re-runs the two reversals, which are idempotent flips — so a crash between the record
 * and the reversals is repaired by retrying, and no retry reverses anything twice. Only a booking this
 * database knows lost a chargeback can be reconciled; anything else is one `not_found`.
 */
export async function reconcileLostChargeback(input: {
  bookingId: string;
  actorId: string;
  note: string;
  now?: Date;
}): Promise<LostChargebackReconciliationResult> {
  const nowIso = (input.now ?? new Date()).toISOString();
  const r = await db.execute(sql`
    SELECT id, status, stripe_payment_intent_id, booking_details FROM service_bookings WHERE id = ${input.bookingId} LIMIT 1
  `);
  const row = (r.rows ?? [])[0] as
    | { id: string; status: string | null; stripe_payment_intent_id: string | null; booking_details: any }
    | undefined;
  const details = (row?.booking_details ?? {}) as Record<string, any>;
  const lost = row && (row.status === "dispute_lost" || (details[LOST_CHARGEBACKS_KEY] && typeof details[LOST_CHARGEBACKS_KEY] === "object"));
  if (!row || !lost || !row.stripe_payment_intent_id) return { reconciled: false, reason: "not_found" };

  let fraction: number;
  const recorded = details[CHARGEBACK_RECONCILIATION_KEY];
  if (recorded && typeof recorded.fraction === "number") {
    fraction = recorded.fraction;
  } else {
    let ledger: PaymentIntentLedger;
    try {
      ledger = await (_lostChargebackTestHooks.lookup ?? stripePaymentIntentLedger)(row.stripe_payment_intent_id);
    } catch {
      return {
        reconciled: false,
        reason: "lost_chargeback_unverifiable",
        message:
          "Stripe could not be reached to confirm how much of this payment the chargeback took back, so nothing was reconciled. Try again shortly.",
      };
    }
    fraction = ledger.chargedCents > 0 ? Math.min(1, ledger.lostChargebackCents / ledger.chargedCents) : 1;
  }

  const claimed = await db.execute(sql`
    UPDATE service_bookings
       SET booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
             ${CHARGEBACK_RECONCILIATION_KEY}::text, jsonb_build_object(
               'at', ${nowIso}::text, 'by', ${input.actorId}::text, 'note', ${input.note}::text,
               'fraction', ${fraction}::float8, 'ledgerOnly', true)),
           updated_at = NOW()
     WHERE id = ${row.id}
       AND (COALESCE(booking_details, '{}'::jsonb) -> ${CHARGEBACK_RECONCILIATION_KEY}::text) IS NULL
    RETURNING id
  `);
  const alreadyReconciled = (claimed.rows ?? []).length === 0;

  const { storage } = await import("../storage");
  const full = fraction >= 1;
  const earnings = full ? await storage.reverseEarningsForBooking(row.id) : { reversed: 0, skippedPaidOut: 0 };
  const reversedRevenueRows = await storage.reversePlatformRevenueForBooking(row.id, new Date(nowIso), fraction);
  return {
    reconciled: true,
    bookingId: row.id,
    alreadyReconciled,
    fraction,
    reversedEarnings: earnings.reversed,
    skippedPaidOut: earnings.skippedPaidOut,
    earningsLeftOnHold: !full,
    reversedRevenueRows,
  };
}

/**
 * OPEN chargebacks on a booking (decision-maker, Sep 24, 2026). PR #1066 marks a chargebacked booking
 * `disputed`, the same status a traveler's own dispute uses, so the admin dispute-resolution actions
 * could reach it — reverse the ledger, then be refused by Stripe, which will not refund a charge under
 * dispute. While a chargeback is open the card network decides the money, so the two refunding
 * resolutions (uphold, and the rejected-artifact refund) refuse before they touch anything.
 * Returns the ids of disputes whose lifecycle row names this booking and has no terminal outcome yet.
 */
export async function openChargebacksOnBooking(bookingId: string): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT dispute_id FROM stripe_dispute_lifecycle
     WHERE terminal_outcome IS NULL AND booking_status ? ${bookingId}
     ORDER BY dispute_id
  `);
  return ((r.rows ?? []) as Array<{ dispute_id: string }>).map((x) => x.dispute_id);
}

/** The 409 body for a refunding resolution refused while a chargeback is open. */
export function openChargebackRefusalBody(disputeIds: string[]) {
  const message =
    "A card chargeback is open on this booking's payment, so the bank — not this platform — is deciding the " +
    "money. Nothing was refunded and nothing was changed. Wait for Stripe's outcome: a won chargeback " +
    "restores the booking, and a lost one can be closed out with \"reconcile lost chargeback\".";
  return { error: message, message, reason: "open_chargeback" as const, disputeIds };
}
