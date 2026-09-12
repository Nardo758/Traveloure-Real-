/**
 * STRIPE RECONCILIATION — the daily Stripe-vs-DB DRIFT DETECTOR.
 *
 * WHY THIS FILE CHANGED (reconciliation-detection lane; DECISIONS.md ruling 40)
 * ────────────────────────────────────────────────────────────────────────────
 * Recovery on the money path is three-layered — the client confirm, the Stripe webhook and the
 * TTL sweep, all driving ONE promotion implementation (ruling 39, CLAUDE.md §15c). DETECTION was
 * one-eyed. This job scanned ONLY the legacy `bookings` table, so **cart checkout — the primary
 * checkout — was invisible to it**: `service_bookings` ids never appear in the legacy table, the
 * two id spaces are disjoint, and the queries matched zero rows without erroring. Nothing in the
 * platform told anyone that money and the database disagreed about a cart purchase.
 *
 * ONE JOB, BOTH RAILS. The legacy rail is still live (`/booking-demo`, `/itinerary-comparison/:id`
 * → `POST /api/bookings/process-cart`, CLAUDE.md §15c), so its two original checks are kept
 * verbatim in behaviour and simply re-expressed as two of the classifications below. The cart rail
 * gains seven more.
 *
 * ONE JOB, *THREE* RAILS (ready-made-reconciliation-rail lane; punchlist V-3)
 * ─────────────────────────────────────────────────────────────────────────
 * `ready_made_purchases` — the store lane's purchase table (CLAUDE.md: "`ready_made_trips` is the
 * single store lane") — appeared NOWHERE in this file, so §17's own history repeated itself one
 * table over: a ready-made PaymentIntent carries `metadata.type='ready_made_purchase'` and NO
 * `bookingIds`, and its row is not a `service_bookings` row, so every cart-rail query matched zero
 * rows and errored on nothing. A Stripe success whose delivery never completed had no detector at
 * all, while the cart rail had three recovery layers and a scan.
 *
 * The rail is added in the SHAPE the existing two already take — a third `ReconciliationRail`
 * value, a third `scan*Rail` function, the same append-only exception rows, the same run row — and
 * NOT as a second job or a parallel scanner.
 *
 * ITS LINKAGE IS CLEANER THAN THE CART RAIL'S, and no new write was needed for it (§17 rule 4):
 * `ready_made_purchases.stripe_payment_intent_id` is **NOT NULL and UNIQUE**, the row is inserted
 * only AFTER Stripe says `succeeded` (so born-`paid` is correct and there is no provisional state
 * to reason about), and the PaymentIntent self-identifies through metadata `createPaymentIntent`
 * wrote server-side at `POST /api/ready-made/:id/purchase`.
 *
 * THERE IS NO REPAIR ON THIS RAIL — NOT EVEN THE CART RAIL'S ONE NARROW EXCEPTION. That exception
 * exists because `promotePaidCheckout` is a RATIFIED recovery layer whose logic is merely arriving
 * late (§15c). The ready-made rail has NO ratified recovery layer of its own: the purchase row is
 * created by the buyer's own browser calling `/purchase/confirm`, and the Stripe webhook
 * (`handlePaymentSucceeded`) keys on `metadata.bookingIds`, which a ready-made PaymentIntent never
 * carries — so the webhook no-ops on it. `fulfillReadyMadePurchase` is idempotent and would be
 * TEMPTING to call here; it is deliberately NOT called. A detector that fulfils is a second,
 * unreviewed delivery path, and "the ready-made rail has no recovery layer" is a FINDING for a
 * human, recorded in the lane's ledger row — not a gap for the detector to quietly fill.
 *
 * DETECT, DON'T REPAIR — and the ONE exception
 * ────────────────────────────────────────────
 * This job writes exception rows. It NEVER voids, refunds, cancels or invents a booking. Repair
 * belongs to the three recovery layers plus a human; a detector that also repairs is a fourth,
 * unreviewed writer on the money path.
 *
 * The single exception is `pi_succeeded_claim_provisional`: a PaymentIntent Stripe says SUCCEEDED
 * whose booking is still an unpromoted claim. That is not new repair logic — it is recovery layer
 * 2's own logic arriving late, so the job hands it to the EXISTING shared promotion
 * (`promotePaidCheckout`, `actor="reconciliation"`), which is atomic-conditional, idempotent and
 * diary-logged exactly as the webhook path is. If the promotion does not take, the drift is
 * recorded as an exception like everything else.
 *
 * EVERY RUN IS RECORDED, INCLUDING A CLEAN ONE
 * ────────────────────────────────────────────
 * A `reconciliation_runs` row is written for every pass — completed, skipped (no Stripe key) or
 * failed. Silence must be distinguishable from the job not having run; the old version logged
 * "Clean" to stdout and left no durable trace at all, so "no exceptions today" and "the scheduler
 * died three weeks ago" looked identical from the admin page.
 *
 * ID LINKAGE — NO NEW WRITES WERE NEEDED
 * ─────────────────────────────────────
 *   • `service_bookings.stripe_payment_intent_id` — stamped by `stampAuthorization` (ruling 38).
 *   • `pi.metadata.bookingIds` — written by `createPaymentIntent`; the ONLY link for a claim whose
 *     PI was never stamped (the server-died-mid-authorization window). TRUNCATED past 490 chars,
 *     which is why the sibling `idempotency_key` convention below matters.
 *   • `service_bookings.idempotency_key` — bare on the first row of a checkout, `key#1`, `key#2` …
 *     on the rest, so one row identifies its whole checkout (`findPriorClaim` convention).
 *   • `refunds.stripe_refund_id` / `.stripe_payment_intent_id` — the DB side of a reversal.
 *   • Legacy rail: `charge.metadata.bookingId` ↔ `bookings.id`, `bookings.stripe_payment_intent_id`.
 *
 * THE EXPECTED CHARGE AMOUNT is server-derived, never taken from Stripe and never from a client
 * (§14), through the ONE `travelerChargeForRow` every charge/refund surface now shares (§18 rule 1,
 * ledger 2026-09-08-cart-fee-line). `POST /api/checkout` charges price + travel surcharge (both in
 * `total_amount`) + the concierge fee + the traveler service fee; `platform_fee` — the provider's
 * WITHHELD commission + insurance + concierge — is NOT charged to the traveler and is therefore no
 * longer expected. A row claimed BEFORE that ruling carries no `travelerCharge` snapshot and IS
 * still expected the old way (`total_amount + platform_fee`), because that is what it was charged:
 * reading a historical row the new way would raise a false amount_mismatch on every one of them
 * (§13). No rate literal anywhere in this file (§8).
 */

import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { getStripeSecretKey } from "../utils/stripe-key";
import { gte, sql } from "drizzle-orm";
import { db } from "../db";
import { bookings, adminNotifications } from "@shared/schema";
import type { ReconciliationExceptionKind } from "@shared/schema";
import { promotePaidCheckout } from "../services/checkout-claim.service";
import { travelerChargeForRow } from "../services/traveler-charge";
import { logger } from "../infrastructure/logger";

// ── Tunables ─────────────────────────────────────────────────────────────────────────────────

/** How far back a pass looks, on BOTH sides. One day, matching the daily schedule, with the
 *  overlap that a 24h job scanning a 24h window naturally gives. */
const SCAN_WINDOW_HOURS = 24;

/** Stripe list page size. One page per resource — a platform doing more than this in a day needs
 *  pagination, which is a deliberate follow-up rather than an unbounded loop inside a cron job. */
const STRIPE_PAGE_LIMIT = 100;

/** Cap on cart bookings examined per pass. Hitting it is LOGGED AS AN ERROR, never absorbed —
 *  see `loadCartBookings`. */
const CART_SCAN_LIMIT = 1000;

/** Cap on ready-made purchases examined per pass. Same posture as `CART_SCAN_LIMIT`: hitting it is
 *  logged as an error rather than absorbed, because a detector that silently stops looking is
 *  worse than no detector. */
const READY_MADE_SCAN_LIMIT = 1000;

/**
 * How long a ready-made purchase may sit `paid` with no clone before it is reported as undelivered.
 *
 * NOT a fee, a rate or a margin (§8) — it is a LIVENESS window, the same kind of constant as
 * `holdWindowDays` and `ADMIN_REFUND_OUTER_BOUND_DAYS`. `POST /purchase/confirm` INSERTs the row
 * and then calls `fulfillReadyMadePurchase` in the same request, so `paid`-with-no-clone is the
 * NORMAL state for the milliseconds in between. Reporting inside that gap would indict a purchase
 * that is being delivered while the scan reads it — the detector crying wolf on its own arithmetic,
 * exactly what `amountTolerance` exists to avoid one classification over.
 */
const READY_MADE_FULFILMENT_GRACE_MS = 15 * 60 * 1000;

/**
 * Money comparison tolerance, in DOLLARS. NOT a fee, a rate or a margin (§8) — it is the exact
 * accumulated rounding error of the checkout arithmetic. Each booking row persists two
 * `.toFixed(2)` values (`total_amount`, `platform_fee`), each ≤ half a cent from the unrounded
 * float the Stripe total was composed from, and Stripe's own `Math.round` to cents adds one more.
 * So the honest bound is one cent per row plus one.
 */
function amountTolerance(rowCount: number): number {
  return 0.01 * rowCount + 0.01;
}

/** Stripe statuses that mean the money actually moved. */
const PI_SUCCEEDED = "succeeded";

/** Booking statuses that assert the traveler HAS paid — each one must have a real PaymentIntent
 *  behind it (the `paid-service-bookings-have-payment-intent` invariant, scripts/invariants.mjs). */
const PAID_EQUIVALENT_STATUSES = ["confirmed", "in_progress", "completed", "delivered", "disputed"];

/** Statuses a claim can be in that are NOT yet a purchase — an in-flight checkout, not drift. */
const PROVISIONAL_STATUSES = ["payment_pending", "pending"];

/** Statuses from which a booking can never be promoted (ruling 39's TERMINAL_UNPROMOTABLE). */
const TERMINAL_STATUSES = ["expired", "failed", "payment_failed", "cancelled", "canceled", "refunded"];

// ── Types ────────────────────────────────────────────────────────────────────────────────────

export type ReconciliationRail = "cart" | "legacy" | "ready_made";
export type ReconciliationSeverity = "critical" | "warning";

export interface ReconciliationException {
  rail: ReconciliationRail;
  kind: ReconciliationExceptionKind;
  severity: ReconciliationSeverity;
  /** Deterministic identity of the DRIFT FACT — the UNIQUE key that makes the append-only insert
   *  idempotent across daily passes (a month-long drift is ONE row, not thirty). */
  dedupeKey: string;
  bookingId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  expectedAmount?: number | null;
  actualAmount?: number | null;
  currency?: string | null;
  details?: Record<string, unknown>;
}

export interface ReconciliationResult {
  runId: string | null;
  status: "completed" | "skipped" | "failed";
  exceptions: ReconciliationException[];
  /** Rows this pass actually inserted (detected minus already on record). */
  newExceptions: number;
  /** Claims recovered via the shared promotion (the one narrow repair). */
  promoted: number;
  checkedPaymentIntents: number;
  checkedCharges: number;
  checkedRefunds: number;
  checkedCartBookings: number;
  checkedBookings: number;
  /**
   * Ready-made purchase rows examined this pass.
   *
   * §13 — STATED, NOT HIDDEN: this count is NOT persisted on the `reconciliation_runs` row, which
   * carries `scanned_cart_bookings` and `scanned_legacy_bookings` and no third column. Adding one
   * is a migration PLUS an edit to the two admin SELECTs that name their columns explicitly, and
   * this lane deliberately took neither (a sibling lane owns `admin.routes.ts`). What the run row
   * DOES carry is unaffected and is what §17 rule 2 requires: every pass is recorded, and
   * `exceptions_detected` / `exceptions_new` already include this rail's kinds, so "still drifting"
   * stays visible. The per-rail tally lives in this response (the manual `run-now` read) and in the
   * pass's log line; persisting it is a named follow-up in the lane's ledger row.
   */
  checkedReadyMadePurchases: number;
  ranAt: string;
  /** Back-compat with the pre-existing admin page/endpoint shape, which renders `mismatches`.
   *  Legacy-rail entries only ever carried these two kinds; now every kind lands here. */
  mismatches: Array<{
    type: string;
    chargeId?: string;
    bookingId?: string;
    paymentIntentId?: string;
    amount?: number;
  }>;
}

/**
 * The Stripe half, injectable so the behavioural suite can seed every drift case against a real
 * database with NO network and NO Stripe key. Same technique as the sweep's `StripeIntentLookup`.
 */
export interface StripeReader {
  listPaymentIntents(createdGteUnix: number): Promise<Stripe.PaymentIntent[]>;
  listCharges(createdGteUnix: number): Promise<Stripe.Charge[]>;
  listRefunds(createdGteUnix: number): Promise<Stripe.Refund[]>;
}

function defaultStripeReader(): StripeReader | null {
  const key = getStripeSecretKey();
  if (!key) return null;
  const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
  return {
    listPaymentIntents: async (from) =>
      (await stripe.paymentIntents.list({ created: { gte: from }, limit: STRIPE_PAGE_LIMIT })).data,
    listCharges: async (from) =>
      (await stripe.charges.list({ created: { gte: from }, limit: STRIPE_PAGE_LIMIT })).data,
    listRefunds: async (from) =>
      (await stripe.refunds.list({ created: { gte: from }, limit: STRIPE_PAGE_LIMIT })).data,
  };
}

// ── DB row shapes (raw SQL so the cart rail can be read by PI id OR by booking id in one go) ──

interface CartBookingRow {
  id: string;
  status: string | null;
  stripePaymentIntentId: string | null;
  totalAmount: string;
  platformFee: string | null;
  idempotencyKey: string | null;
  travelerId: string | null;
  createdAt: Date | null;
  hasReconciliationException: boolean;
  /** PS15 / ruling 46 — the §15b pre-flight marker `bookingDetails.stripeAttemptAt`. Its presence
   *  is the ONLY evidence in the row that this booking's PaymentIntent came from the checkout
   *  spine (`markStripeAttempt` writes it immediately before `paymentIntents.create`, and both
   *  stamping paths act only on rows that already carry it). A stamped row without it has
   *  UNVERIFIABLE payment provenance — see the `payment_provenance_unverified` classification. */
  hasStripeAttempt: boolean;
  /** Ruling 2026-09-02-traveler-fee-applies-everywhere: the traveler service fee CHARGED on this row
   *  (0 when covered). It rode the Stripe charge but is deliberately NOT in total_amount/platform_fee
   *  (those are provider-facing), so the expected-charge derivation must add it back or every
   *  fee-bearing checkout would read as an amount_mismatch. */
  travelerFeeCharged: string | null;
  /** Ledger 2026-09-08-cart-fee-line: `booking_details.travelerCharge.conciergeFee` — the only part
   *  of `platform_fee` the traveler is charged. NULL ⇒ a PRE-A3 row, whose charge really did
   *  include the whole platform_fee; `travelerChargeForRow` reads the two apart, which is what
   *  keeps this job from manufacturing an amount_mismatch on every historical booking (§13). */
  travelerChargeConciergeFee: string | null;
}

/** The expected Stripe amount for ONE row: the traveler's charge (ONE derivation, §18 rule 1)
 *  plus the traveler service fee, which is held in booking_details rather than in a column. */
function expectedChargeForRow(r: CartBookingRow): number {
  return (
    travelerChargeForRow({
      totalAmount: r.totalAmount,
      platformFee: r.platformFee,
      conciergeFeeSnapshot: r.travelerChargeConciergeFee,
    }).amount + parseFloat(r.travelerFeeCharged || "0")
  );
}

function mapCartRow(r: any): CartBookingRow {
  return {
    id: String(r.id),
    status: r.status ?? null,
    stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
    totalAmount: String(r.total_amount ?? "0"),
    platformFee: r.platform_fee == null ? null : String(r.platform_fee),
    idempotencyKey: r.idempotency_key ?? null,
    travelerId: r.traveler_id ?? null,
    createdAt: r.created_at ? new Date(String(r.created_at)) : null,
    hasReconciliationException: Boolean(r.has_recon_exception),
    hasStripeAttempt: Boolean(r.has_stripe_attempt),
    travelerFeeCharged: r.traveler_fee_charged == null ? null : String(r.traveler_fee_charged),
    travelerChargeConciergeFee:
      r.traveler_charge_concierge_fee == null ? null : String(r.traveler_charge_concierge_fee),
  };
}

const CART_COLUMNS = sql`
  id, status, stripe_payment_intent_id, total_amount, platform_fee, idempotency_key,
  traveler_id, created_at, (booking_details ? 'reconciliationException') AS has_recon_exception,
  (COALESCE(booking_details, '{}'::jsonb) ? 'stripeAttemptAt') AS has_stripe_attempt,
  booking_details->'travelerServiceFee'->>'charged' AS traveler_fee_charged,
  booking_details->'travelerCharge'->>'conciergeFee' AS traveler_charge_concierge_fee
`;

// ── The job ──────────────────────────────────────────────────────────────────────────────────

export async function runStripeReconciliation(opts?: {
  triggeredBy?: "scheduled" | "manual" | "test";
  stripeReader?: StripeReader;
  windowHours?: number;
  /** Restrict the CART-rail scan to these booking ids. Operational scoping (reconcile one
   *  checkout on demand) and what lets the behavioural suite assert exact per-pass counts
   *  without a neighbouring row in the same database changing them. */
  onlyBookingIds?: string[];
  /** Restrict the READY-MADE scan to these purchase ids. Same purpose as `onlyBookingIds` one
   *  rail over: operational scoping, and what lets the behavioural suite assert exact per-pass
   *  counts without a neighbouring row in the same database changing them. */
  onlyPurchaseIds?: string[];
  /** Skip the DB write of the run + exception rows. Never used in production; the promotion
   *  path is unaffected. */
  dryRun?: boolean;
}): Promise<ReconciliationResult> {
  const ranAt = new Date().toISOString();
  const triggeredBy = opts?.triggeredBy ?? "scheduled";
  const windowStart = new Date(Date.now() - (opts?.windowHours ?? SCAN_WINDOW_HOURS) * 60 * 60 * 1000);
  const windowUnix = Math.floor(windowStart.getTime() / 1000);

  const runId = opts?.dryRun ? null : await openRun(triggeredBy, windowStart);

  const base: ReconciliationResult = {
    runId,
    status: "completed",
    exceptions: [],
    newExceptions: 0,
    promoted: 0,
    checkedPaymentIntents: 0,
    checkedCharges: 0,
    checkedRefunds: 0,
    checkedCartBookings: 0,
    checkedBookings: 0,
    checkedReadyMadePurchases: 0,
    ranAt,
    mismatches: [],
  };

  const reader = opts?.stripeReader ?? defaultStripeReader();
  if (!reader) {
    logger.info("[RECONCILIATION] STRIPE_SECRET_KEY not set — skipping (run RECORDED as skipped)");
    base.status = "skipped";
    await closeRun(runId, base, "STRIPE_SECRET_KEY not set — nothing was compared");
    return base;
  }

  try {
    const [paymentIntents, charges, refunds] = await Promise.all([
      reader.listPaymentIntents(windowUnix),
      reader.listCharges(windowUnix),
      reader.listRefunds(windowUnix),
    ]);
    base.checkedPaymentIntents = paymentIntents.length;
    base.checkedCharges = charges.length;
    base.checkedRefunds = refunds.length;

    const exceptions: ReconciliationException[] = [];

    // ── CART RAIL ────────────────────────────────────────────────────────────────────────────
    const cart = await scanCartRail({
      paymentIntents,
      refunds,
      windowStart,
      onlyBookingIds: opts?.onlyBookingIds,
      exceptions,
    });
    base.checkedCartBookings = cart.scannedBookings;
    base.promoted = cart.promoted;

    // ── LEGACY RAIL (behaviour preserved verbatim; still live per CLAUDE.md §15c) ────────────
    const legacy = await scanLegacyRail({ charges, windowStart, exceptions });
    base.checkedBookings = legacy.scannedBookings;

    // ── READY-MADE RAIL (the store lane; punchlist V-3) ──────────────────────────────────────
    const readyMade = await scanReadyMadeRail({
      paymentIntents,
      refunds,
      windowStart,
      onlyPurchaseIds: opts?.onlyPurchaseIds,
      exceptions,
    });
    base.checkedReadyMadePurchases = readyMade.scannedPurchases;

    base.exceptions = exceptions;
    base.mismatches = exceptions.map((e) => ({
      type: e.kind,
      ...(e.chargeId ? { chargeId: e.chargeId } : {}),
      ...(e.bookingId ? { bookingId: e.bookingId } : {}),
      ...(e.paymentIntentId ? { paymentIntentId: e.paymentIntentId } : {}),
      ...(e.actualAmount != null ? { amount: e.actualAmount } : {}),
    }));

    if (runId) {
      base.newExceptions = await persistExceptions(runId, exceptions);
    }

    if (exceptions.length > 0) {
      logger.error(
        {
          runId,
          detected: exceptions.length,
          newlyRecorded: base.newExceptions,
          promoted: base.promoted,
          byKind: countByKind(exceptions),
        },
        "[RECONCILIATION] money/database DRIFT detected — see GET /api/admin/reconciliation/exceptions",
      );
      // Keep feeding the existing daily-digest surface (admin_notifications type
      // `reconciliation_mismatch` → admin-digest-scheduler §D → the digest email). The persisted
      // rows are the durable record; this is the notification that a human is already subscribed
      // to, and removing it would silently unsubscribe them.
      await notifyDigest(exceptions, base.newExceptions).catch((err) =>
        logger.error({ err }, "[RECONCILIATION] digest notification insert failed (rows still persisted)"),
      );
    } else {
      logger.info(
        {
          runId,
          paymentIntents: base.checkedPaymentIntents,
          charges: base.checkedCharges,
          refunds: base.checkedRefunds,
          cartBookings: base.checkedCartBookings,
          legacyBookings: base.checkedBookings,
          readyMadePurchases: base.checkedReadyMadePurchases,
        },
        "[RECONCILIATION] clean pass — no drift (run RECORDED so silence is distinguishable from a dead job)",
      );
    }

    await closeRun(runId, base, null);
    return base;
  } catch (err: any) {
    logger.error({ err, runId }, "[RECONCILIATION] pass FAILED — recorded as failed, nothing repaired");
    base.status = "failed";
    await closeRun(runId, base, String(err?.message ?? err));
    return base;
  }
}

// ── CART RAIL ────────────────────────────────────────────────────────────────────────────────

async function scanCartRail(args: {
  paymentIntents: Stripe.PaymentIntent[];
  refunds: Stripe.Refund[];
  windowStart: Date;
  onlyBookingIds?: string[];
  exceptions: ReconciliationException[];
}): Promise<{ scannedBookings: number; promoted: number }> {
  const { paymentIntents, refunds, windowStart, onlyBookingIds, exceptions } = args;

  // Load every cart booking that either was created in the window OR is named by a PaymentIntent
  // in the window (a PI can succeed a day after the claim was written — the row is older than the
  // window but the money is inside it, and a window-only query would miss exactly that drift).
  const piIds = paymentIntents.map((pi) => pi.id);
  const metadataIds = new Set<string>();
  for (const pi of paymentIntents) {
    for (const id of splitBookingIds(pi.metadata?.bookingIds)) metadataIds.add(id);
  }
  const rows = await loadCartBookings({
    windowStart,
    paymentIntentIds: piIds,
    bookingIds: Array.from(metadataIds),
    onlyBookingIds,
  });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const byPi = new Map<string, CartBookingRow[]>();
  for (const r of rows) {
    if (!r.stripePaymentIntentId) continue;
    const list = byPi.get(r.stripePaymentIntentId) ?? [];
    list.push(r);
    byPi.set(r.stripePaymentIntentId, list);
  }
  const scope = onlyBookingIds ? new Set(onlyBookingIds) : null;
  const inScope = (id: string) => !scope || scope.has(id);

  let promoted = 0;

  // ── A. Stripe-first: every succeeded PaymentIntent must have promoted bookings behind it ────
  for (const pi of paymentIntents) {
    if (pi.status !== PI_SUCCEEDED) continue;

    const stamped = byPi.get(pi.id) ?? [];
    const named = splitBookingIds(pi.metadata?.bookingIds)
      .map((id) => byId.get(id))
      .filter((r): r is CartBookingRow => Boolean(r));
    const linked = dedupeRows([...stamped, ...named]).filter((r) => inScope(r.id));

    // A1 — money with NO record at all. The most serious classification in this file.
    if (linked.length === 0) {
      // A legacy-rail PaymentIntent legitimately has no service_bookings row; do not indict it.
      if (legacyOwnsIntent(pi)) continue;
      // Nor does a READY-MADE one (ready-made-reconciliation-rail lane, punchlist V-3). Its row
      // lives in `ready_made_purchases` and its own rail judges it below; without this the third
      // rail would have been bought at the price of reporting every store purchase as cart drift —
      // the cross-rail version of the disjoint-id-space failure §17 exists to close.
      if (isReadyMadeIntent(pi)) continue;
      exceptions.push({
        rail: "cart",
        kind: "pi_succeeded_no_booking",
        severity: "critical",
        dedupeKey: `cart:pi_succeeded_no_booking:${pi.id}`,
        paymentIntentId: pi.id,
        chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
        actualAmount: centsToDollars(pi.amount_received || pi.amount),
        currency: pi.currency ?? null,
        details: {
          metadataBookingIds: pi.metadata?.bookingIds ?? null,
          note:
            "A PaymentIntent SUCCEEDED and no service_bookings row can be resolved from it — " +
            "neither by stamped stripe_payment_intent_id nor by its own bookingIds metadata. " +
            "The traveler may have been charged with nothing booked.",
        },
      });
      continue;
    }

    // A2 — the ONE narrow repair. A succeeded PI whose claim is still provisional is recovery
    // layer 2's own logic arriving late, so it goes to the EXISTING shared promotion.
    const provisional = linked.filter((r) => PROVISIONAL_STATUSES.includes(r.status ?? ""));
    if (provisional.length > 0) {
      const outcome = await promotePaidCheckout({
        paymentIntentId: pi.id,
        actor: "reconciliation",
        metadataBookingIds: splitBookingIds(pi.metadata?.bookingIds),
        bookingIds: provisional.map((r) => r.id),
      }).catch((err) => {
        logger.error({ err, paymentIntentId: pi.id }, "[RECONCILIATION] shared promotion threw (detect-only fallback)");
        return null;
      });

      promoted += outcome?.promoted.length ?? 0;
      for (const r of provisional) {
        const wasPromoted = outcome?.promoted.includes(r.id) || outcome?.alreadyConfirmed.includes(r.id);
        if (wasPromoted) {
          // Refresh the local view so the amount check below reads the post-promotion status.
          r.status = "confirmed";
          r.stripePaymentIntentId = r.stripePaymentIntentId ?? pi.id;
          continue;
        }
        // The promotion did not take. Record it — the drift is real and a human owns it now.
        exceptions.push({
          rail: "cart",
          kind: "pi_succeeded_claim_provisional",
          severity: "critical",
          dedupeKey: `cart:pi_succeeded_claim_provisional:${pi.id}:${r.id}`,
          bookingId: r.id,
          paymentIntentId: pi.id,
          actualAmount: centsToDollars(pi.amount_received || pi.amount),
          currency: pi.currency ?? null,
          details: {
            bookingStatus: r.status,
            promotionExceptions: outcome?.exceptions ?? null,
            note:
              "A PaymentIntent SUCCEEDED but its booking is still an unpromoted claim, and the " +
              "shared promotion (actor=reconciliation) could not move it. Paid, not booked.",
          },
        });
      }
    }

    // A3 — a succeeded PI whose booking is VOIDED/terminal. Ruling 39: never resurrect.
    for (const r of linked) {
      if (!TERMINAL_STATUSES.includes(r.status ?? "")) continue;
      exceptions.push({
        rail: "cart",
        kind: r.status === "refunded" ? "refund_not_reversed" : "pi_succeeded_booking_voided",
        severity: r.status === "refunded" ? "warning" : "critical",
        dedupeKey: `cart:${r.status === "refunded" ? "refund_state" : "pi_succeeded_booking_voided"}:${pi.id}:${r.id}`,
        bookingId: r.id,
        paymentIntentId: pi.id,
        actualAmount: centsToDollars(pi.amount_received || pi.amount),
        currency: pi.currency ?? null,
        details: {
          bookingStatus: r.status,
          alreadyFlaggedOnRow: r.hasReconciliationException,
          note:
            r.status === "refunded"
              ? "A succeeded PaymentIntent whose booking is marked refunded — confirm the refund exists at Stripe."
              : "A PaymentIntent SUCCEEDED for a booking in a terminal, unpromotable state (ruling 39: " +
                "the void wins, the row is never resurrected). If the charge is real it needs a manual " +
                "refund or a manual re-book.",
        },
      });
    }

    // A4 — AMOUNT MISMATCH. Expected total is server-derived from the persisted rows (§14).
    const chargeable = linked.filter((r) => !TERMINAL_STATUSES.includes(r.status ?? ""));
    if (chargeable.length > 0) {
      const expected = chargeable.reduce((sum, r) => sum + expectedChargeForRow(r), 0);
      const actual = centsToDollars(pi.amount_received || pi.amount);
      const delta = Math.abs(expected - actual);
      if (delta > amountTolerance(chargeable.length)) {
        exceptions.push({
          rail: "cart",
          kind: "amount_mismatch",
          severity: "critical",
          dedupeKey: `cart:amount_mismatch:${pi.id}:${expected.toFixed(2)}:${actual.toFixed(2)}`,
          bookingId: chargeable[0].id,
          paymentIntentId: pi.id,
          expectedAmount: round2(expected),
          actualAmount: actual,
          currency: pi.currency ?? null,
          details: {
            bookingIds: chargeable.map((r) => r.id),
            delta: round2(expected - actual),
            note:
              "Stripe's captured amount and the server-derived total of this PaymentIntent's booking " +
              "rows disagree beyond the rounding tolerance.",
          },
        });
      }
    }
  }

  // ── B. DB-first: a paid-equivalent booking must have a succeeded PaymentIntent behind it ────
  const piById = new Map(paymentIntents.map((pi) => [pi.id, pi]));
  for (const r of rows) {
    if (!inScope(r.id)) continue;
    if (!PAID_EQUIVALENT_STATUSES.includes(r.status ?? "")) continue;

    if (!r.stripePaymentIntentId) {
      exceptions.push({
        rail: "cart",
        kind: "booking_confirmed_no_pi",
        severity: "critical",
        dedupeKey: `cart:booking_confirmed_no_pi:${r.id}`,
        bookingId: r.id,
        expectedAmount: round2(expectedChargeForRow(r)),
        details: {
          bookingStatus: r.status,
          note:
            "A paid-equivalent booking carries NO PaymentIntent — the booking says the traveler paid " +
            "and there is no payment to point at (scripts/invariants.mjs " +
            "`paid-service-bookings-have-payment-intent`, now ops-visible on a schedule).",
        },
      });
      continue;
    }

    const pi = piById.get(r.stripePaymentIntentId);
    // A PI outside the scan window is NOT drift — it is simply older than what we listed. Only
    // indict a PI we actually saw and that is not succeeded. Guessing about unseen PIs is exactly
    // the "never void on an unknown" discipline the sweep established.
    if (pi && pi.status !== PI_SUCCEEDED) {
      exceptions.push({
        rail: "cart",
        kind: "booking_confirmed_pi_not_succeeded",
        severity: "critical",
        dedupeKey: `cart:booking_confirmed_pi_not_succeeded:${r.id}:${pi.id}:${pi.status}`,
        bookingId: r.id,
        paymentIntentId: pi.id,
        actualAmount: centsToDollars(pi.amount_received || pi.amount),
        currency: pi.currency ?? null,
        details: {
          bookingStatus: r.status,
          paymentIntentStatus: pi.status,
          note: "A booking is paid-equivalent but its PaymentIntent is not succeeded at Stripe.",
        },
      });
    }
  }

  // ── B2. PROVENANCE drift: a PaymentIntent id nothing can vouch for (PS15, ruling 46) ────────
  // Rulings 39/40/41 gate the ordering-1 capability on the PROVENANCE of the PaymentIntent id —
  // that the platform itself obtained it from Stripe as a verified actor — and hold, immovably,
  // that a CLIENT-supplied PaymentIntent id may never resolve or stamp anything. Ruling 41 proved
  // the PROMOTION side of that clause (N17c). PS15 was the BIRTH side: `POST /api/bookings` spread
  // a body-parsed `insertServiceBookingSchema` into `createServiceBooking`, so a crafted request
  // could create a booking already carrying its own PI. Ruling 46 closes that (schema `.omit()`,
  // storage strip, route allowlist) — but a fix stops NEW rows and says nothing about rows already
  // on disk, and the detector's job is exactly the rows already on disk (§17).
  //
  // THE PREDICATE follows ruling 41's invariant as STATED — the PROVENANCE of the id, i.e. that the
  // platform itself obtained it from Stripe — rather than any one implementation of it. So there are
  // TWO independent forms of server provenance, and EITHER clears the row:
  //
  //   (1) THE §15b PRE-FLIGHT MARKER. `markStripeAttempt` writes `bookingDetails.stripeAttemptAt`
  //       immediately BEFORE `paymentIntents.create` — the marker the sweep already relies on to
  //       know a row may have reached Stripe — and BOTH stamping paths (`stampAuthorization` and the
  //       ordering-1 `resolveAndStamp`) only ever act on rows the checkout already marked. Its
  //       presence means the spine wrote this PI.
  //   (2) STRIPE'S OWN CORROBORATION. The drift job reads the PaymentIntent from the Stripe API with
  //       the platform's OWN secret key — a `SERVER_VERIFIED_ACTORS` read (§17b/ruling 40). If that
  //       PaymentIntent's `metadata.bookingIds` NAMES this booking, then Stripe is vouching for the
  //       linkage and the provenance is established independently of any marker. Ruling 41 exists
  //       precisely so this does not have to be re-litigated per actor.
  //
  // Corroboration is not a loophole a forger can walk through: `metadata.bookingIds` is written by
  // `createPaymentIntent` server-side, so a real PaymentIntent lifted from somewhere else names the
  // bookings it actually paid for — never the row it was planted on — and a PaymentIntent that does
  // not exist at Stripe is never seen at all. Both fail (2), as they must.
  //
  // WHAT THIS CANNOT TELL YOU, stated rather than hidden: once a row fails both, the PS15
  // mass-assignment, a seed (`server/seeds/beta-reviews-bookings.ts` mints synthetic `pi_…` values),
  // and a row predating ruling 38 produce the IDENTICAL signature. That indistinguishability IS the
  // finding — it is why the kind is *unverified* and not *forged*, why it is a `warning`, and why
  // the job does nothing about it. DETECT, DON'T REPAIR (§17): no promotion, no void, no refund, no
  // silent trust. A human reads the row and decides.
  //
  // Also note what bounds the blast radius on a first production run: `loadCartBookings` only loads
  // rows created inside the scan window OR named by an in-window PaymentIntent, so a backlog of old
  // bookings is not dragged in and indicted wholesale.
  for (const r of rows) {
    if (!inScope(r.id)) continue;
    if (!r.stripePaymentIntentId) continue;
    if (r.hasStripeAttempt) continue; // (1) the spine wrote it
    const pi = piById.get(r.stripePaymentIntentId);
    if (pi && splitBookingIds(pi.metadata?.bookingIds).includes(r.id)) continue; // (2) Stripe vouches
    exceptions.push({
      rail: "cart",
      kind: "payment_provenance_unverified",
      severity: "warning",
      // Keyed on the (booking, PI) PAIR, not the run: append-only + ON CONFLICT DO NOTHING means a
      // row that stays unverifiable for a month is ONE exception stamped with the run that first
      // saw it, while `exceptions_detected` keeps reporting it (§17 rule 1).
      dedupeKey: `cart:payment_provenance_unverified:${r.id}:${r.stripePaymentIntentId}`,
      bookingId: r.id,
      paymentIntentId: r.stripePaymentIntentId,
      expectedAmount: round2(expectedChargeForRow(r)),
      currency: pi?.currency ?? null,
      details: {
        bookingStatus: r.status,
        // Whether Stripe knows this id at all is the single most useful triage fact, so record it —
        // but only for PIs inside the scan window. "Not in this window's listing" is NOT "absent
        // from Stripe", and guessing about unseen PIs is the discipline the sweep established.
        paymentIntentSeenInWindow: Boolean(pi),
        paymentIntentStatus: pi?.status ?? null,
        hasCheckoutIdempotencyKey: Boolean(r.idempotencyKey),
        note:
          "This booking carries a PaymentIntent id that neither form of server provenance supports: " +
          "no `bookingDetails.stripeAttemptAt` pre-flight marker (so the checkout spine did not " +
          "write it) AND no corroborating `metadata.bookingIds` from Stripe naming this booking. " +
          "Indistinguishable causes: the PS15 mass-assignment on POST /api/bookings (closed by " +
          "ruling 46), a seeded fixture, or a row predating ruling 38. Not repaired and not trusted " +
          "— a human decides (rulings 41/46, §17 DETECT-DON'T-REPAIR).",
      },
    });
  }

  // ── C. REFUND drift: Stripe reversed money the DB never recorded (rulings 12/18) ────────────
  if (refunds.length > 0) {
    const refundIds = refunds.map((rf) => rf.id);
    const known = await loadKnownRefundIds(refundIds);
    for (const rf of refunds) {
      if (known.has(rf.id)) continue;
      const piId = typeof rf.payment_intent === "string" ? rf.payment_intent : null;
      const linked = (piId ? byPi.get(piId) : undefined) ?? [];
      // Only the CART rail is ours to judge here: a refund against a legacy-rail or non-booking
      // PaymentIntent has no service_bookings row and is not this classification's business.
      if (linked.length === 0) continue;
      const unreversed = linked.filter((r) => r.status !== "refunded" && inScope(r.id));
      if (unreversed.length === 0) continue;
      exceptions.push({
        rail: "cart",
        kind: "refund_not_reversed",
        severity: "critical",
        dedupeKey: `cart:refund_not_reversed:${rf.id}`,
        bookingId: unreversed[0].id,
        paymentIntentId: piId,
        chargeId: typeof rf.charge === "string" ? rf.charge : null,
        actualAmount: centsToDollars(rf.amount),
        currency: rf.currency ?? null,
        details: {
          stripeRefundId: rf.id,
          bookingIds: unreversed.map((r) => r.id),
          bookingStatuses: unreversed.map((r) => r.status),
          note:
            "Stripe holds a refund with no matching `refunds` row and a booking that is not marked " +
            "refunded — money went back to the traveler and the ledger does not know.",
        },
      });
    }
  }

  return { scannedBookings: rows.length, promoted };
}

// ── LEGACY RAIL (unchanged in behaviour — the two original checks) ────────────────────────────

async function scanLegacyRail(args: {
  charges: Stripe.Charge[];
  windowStart: Date;
  exceptions: ReconciliationException[];
}): Promise<{ scannedBookings: number }> {
  const { charges, windowStart, exceptions } = args;

  const dbBookings = await db.select().from(bookings).where(gte(bookings.createdAt, windowStart));
  const dbBookingIds = new Set(dbBookings.map((b) => b.id.toString()));

  // Charges whose metadata names a LEGACY booking id that does not exist. Kept exactly as the
  // original check, with one correction: a charge with NO `bookingId` metadata at all is a CART
  // charge (cart PaymentIntents carry `bookingIds`, plural), so indicting it here would report
  // every cart purchase as legacy drift. The cart rail judges those above.
  for (const charge of charges) {
    if (charge.status !== "succeeded") continue;
    const bookingId = charge.metadata?.bookingId;
    if (!bookingId) continue;
    if (dbBookingIds.has(bookingId)) continue;
    exceptions.push({
      rail: "legacy",
      kind: "stripe_charge_no_booking",
      severity: "critical",
      dedupeKey: `legacy:stripe_charge_no_booking:${charge.id}`,
      chargeId: charge.id,
      bookingId,
      paymentIntentId: typeof charge.payment_intent === "string" ? charge.payment_intent : null,
      actualAmount: centsToDollars(charge.amount),
      currency: charge.currency ?? null,
      details: {
        metadata: charge.metadata as Record<string, string>,
        note: "A succeeded Stripe charge names a legacy booking id that has no row.",
      },
    });
  }

  const chargesByPi = new Map<string, Stripe.Charge>();
  for (const charge of charges) {
    if (typeof charge.payment_intent === "string") chargesByPi.set(charge.payment_intent, charge);
  }

  for (const booking of dbBookings) {
    if (booking.status !== "confirmed") continue;
    if (!booking.stripePaymentIntentId) continue;
    const matching = chargesByPi.get(booking.stripePaymentIntentId);
    if (matching && matching.status === "succeeded") continue;
    exceptions.push({
      rail: "legacy",
      kind: "booking_no_stripe_charge",
      severity: "critical",
      dedupeKey: `legacy:booking_no_stripe_charge:${booking.id}:${booking.stripePaymentIntentId}`,
      bookingId: String(booking.id),
      paymentIntentId: booking.stripePaymentIntentId,
      details: {
        chargeStatus: matching?.status ?? null,
        note: "A confirmed legacy booking has no succeeded Stripe charge for its PaymentIntent.",
      },
    });
  }

  return { scannedBookings: dbBookings.length };
}


// ── READY-MADE RAIL (`ready_made_purchases` — the store lane; punchlist V-3) ──────────────────
//
// DETECT, DON'T REPAIR, WITH NO EXCEPTION AT ALL (§17). The cart rail's one narrow repair exists
// because `promotePaidCheckout` is a ratified recovery layer arriving late. This rail has no
// ratified recovery layer to arrive late: nothing but the buyer's own `/purchase/confirm` call
// creates the row, and the `payment_intent.succeeded` webhook keys on `metadata.bookingIds`, which
// a ready-made PaymentIntent never carries. So this scanner promotes nothing, fulfils nothing,
// refunds nothing and revokes nothing — it writes exception rows and stops.
//
// THE EXPECTED AMOUNT IS THE ROW'S OWN `price_paid_cents` (§17 rule 3). It is deliberately NOT the
// listing's current `price_cents`: the price is LOCKED at PaymentIntent creation (§14 — the
// purchase route derives the charge from the listing at that moment), so an author editing their
// price afterwards is an ordinary event and comparing against it would report every price edit as
// drift. No rate, no fee, no literal anywhere in this rail (§8).

/** Statuses in which the buyer still holds the product and the money has not been reversed. */
const READY_MADE_LIVE_STATUSES = ["paid", "cloned"];

interface ReadyMadePurchaseRow {
  id: string;
  buyerId: string | null;
  readyMadeTripId: string | null;
  status: string | null;
  /** NOT NULL + UNIQUE in the schema — the anchor that makes this rail's linkage exact. */
  stripePaymentIntentId: string;
  pricePaidCents: number;
  currency: string | null;
  cloneTripId: string | null;
  purchasedAt: Date | null;
}

function mapReadyMadeRow(r: any): ReadyMadePurchaseRow {
  return {
    id: String(r.id),
    buyerId: r.buyer_id ?? null,
    readyMadeTripId: r.ready_made_trip_id ?? null,
    status: r.status ?? null,
    stripePaymentIntentId: String(r.stripe_payment_intent_id ?? ""),
    pricePaidCents: Number(r.price_paid_cents ?? 0),
    currency: r.currency == null ? null : String(r.currency),
    cloneTripId: r.clone_trip_id ?? null,
    purchasedAt: r.purchased_at ? new Date(String(r.purchased_at)) : null,
  };
}

/** A ready-made PaymentIntent self-identifies through metadata `POST /api/ready-made/:id/purchase`
 *  wrote SERVER-SIDE — the same "linkage that already exists" the cart rail keys on (§17 rule 4).
 *  The cart rail's `bookingIds` and the legacy rail's singular `bookingId` are absent from it, so
 *  the three rails cannot indict each other's PaymentIntents. */
function isReadyMadeIntent(pi: Stripe.PaymentIntent): boolean {
  return pi.metadata?.type === "ready_made_purchase";
}

async function scanReadyMadeRail(args: {
  paymentIntents: Stripe.PaymentIntent[];
  refunds: Stripe.Refund[];
  windowStart: Date;
  onlyPurchaseIds?: string[];
  exceptions: ReconciliationException[];
}): Promise<{ scannedPurchases: number }> {
  const { paymentIntents, refunds, windowStart, onlyPurchaseIds, exceptions } = args;

  const readyMadeIntents = paymentIntents.filter(isReadyMadeIntent);
  // A refund can name a PaymentIntent whose purchase row predates the window — load by BOTH, the
  // same reason the cart rail loads by PI id as well as by creation time.
  const refundIntentIds = refunds
    .map((rf) => (typeof rf.payment_intent === "string" ? rf.payment_intent : null))
    .filter((v): v is string => Boolean(v));

  const rows = await loadReadyMadePurchases({
    windowStart,
    paymentIntentIds: [...readyMadeIntents.map((pi) => pi.id), ...refundIntentIds],
    onlyPurchaseIds,
  });

  const byPi = new Map(rows.map((r) => [r.stripePaymentIntentId, r]));
  const piById = new Map(paymentIntents.map((pi) => [pi.id, pi]));
  const scope = onlyPurchaseIds ? new Set(onlyPurchaseIds) : null;
  const inScope = (id: string) => !scope || scope.has(id);

  // ── R1. Stripe-first: a succeeded ready-made PaymentIntent must have a purchase behind it ────
  for (const pi of readyMadeIntents) {
    if (pi.status !== PI_SUCCEEDED) continue;
    const row = byPi.get(pi.id);

    if (!row) {
      // Money taken and NOTHING recorded — no purchase, no clone, no author earning. The live
      // shape of this is a buyer whose browser never got to call `/purchase/confirm`.
      exceptions.push({
        rail: "ready_made",
        kind: "rm_pi_succeeded_no_purchase",
        severity: "critical",
        dedupeKey: `ready_made:rm_pi_succeeded_no_purchase:${pi.id}`,
        paymentIntentId: pi.id,
        chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
        actualAmount: centsToDollars(pi.amount_received || pi.amount),
        currency: pi.currency ?? null,
        details: {
          // Recorded because they are the only handles a human has on an unrecorded purchase —
          // both are written server-side by the purchase route, never by a client.
          metadataListingId: pi.metadata?.listingId ?? null,
          metadataBuyerId: pi.metadata?.buyerId ?? null,
          note:
            "A ready-made PaymentIntent SUCCEEDED and no ready_made_purchases row carries its id. " +
            "The row is written only by POST /api/ready-made/:id/purchase/confirm — the BUYER'S " +
            "OWN browser call — and nothing else recovers it: the payment_intent.succeeded webhook " +
            "keys on metadata.bookingIds, which this PaymentIntent does not carry. The buyer may " +
            "have been charged with no purchase, no cloned trip and no author earning. " +
            "NOT REPAIRED (§17): a human decides refund vs. manual fulfilment.",
        },
      });
      continue;
    }
    if (!inScope(row.id)) continue;

    // R2. AMOUNT — server-derived from the purchase row's own column (§17 rule 3), never from
    // Stripe and never from a rate. Both sides are integer cents, so there is nothing to round
    // and no tolerance to justify: any difference is a real disagreement.
    const actualCents = Math.round(Number(pi.amount_received || pi.amount));
    if (row.pricePaidCents !== actualCents) {
      exceptions.push({
        rail: "ready_made",
        kind: "rm_amount_mismatch",
        severity: "critical",
        dedupeKey: `ready_made:rm_amount_mismatch:${pi.id}:${row.pricePaidCents}:${actualCents}`,
        bookingId: row.id,
        paymentIntentId: pi.id,
        expectedAmount: centsToDollars(row.pricePaidCents),
        actualAmount: centsToDollars(actualCents),
        currency: pi.currency ?? null,
        details: {
          purchaseStatus: row.status,
          deltaCents: row.pricePaidCents - actualCents,
          // Currency is reported as a FACT, never folded into the amount test: "the sums differ"
          // and "the denominations differ" are different findings and the kind names the first.
          rowCurrency: row.currency,
          paymentIntentCurrency: pi.currency ?? null,
          note:
            "ready_made_purchases.price_paid_cents and the amount Stripe captured disagree. The " +
            "expected figure is the purchase row's own column (§14/§17 rule 3), NOT the listing's " +
            "current price — a listing's price may legitimately change after a sale, since the " +
            "price is locked at PaymentIntent creation.",
        },
      });
    }
  }

  // ── R3/R4. DB-first: a live purchase must be DELIVERED and must stand on a succeeded PI ──────
  const now = Date.now();
  for (const row of rows) {
    if (!inScope(row.id)) continue;
    if (!READY_MADE_LIVE_STATUSES.includes(row.status ?? "")) continue;

    // R3 — PAID, NEVER DELIVERED (V-3's named case). `cloned` is deliberately NOT tested for a
    // missing clone id: `clone_trip_id` is ON DELETE SET NULL and a buyer deleting their own trip
    // is an ordinary act, so a `cloned` row with a NULL id is a deleted product, not a failed
    // delivery — indicting it would report the buyer's own housekeeping as drift (§13).
    if (row.status === "paid" && !row.cloneTripId) {
      const ageMs = row.purchasedAt ? now - row.purchasedAt.getTime() : null;
      // A row with no `purchased_at` cannot be aged, and the column is NOT NULL DEFAULT now() —
      // so this is unreachable rather than tolerated. If it ever happens, the honest answer is to
      // say nothing rather than guess the row is old enough to indict (§13).
      if (ageMs !== null && ageMs > READY_MADE_FULFILMENT_GRACE_MS) {
        exceptions.push({
          rail: "ready_made",
          kind: "rm_purchase_paid_not_cloned",
          severity: "critical",
          dedupeKey: `ready_made:rm_purchase_paid_not_cloned:${row.id}`,
          bookingId: row.id,
          paymentIntentId: row.stripePaymentIntentId,
          expectedAmount: centsToDollars(row.pricePaidCents),
          currency: row.currency,
          details: {
            purchaseStatus: row.status,
            readyMadeTripId: row.readyMadeTripId,
            // The buyer is the one person a human MUST reach on an undelivered purchase. This is
            // an admin-only surface under the §2 blanket guard, not a public payload — LD 40's
            // rule is about what a PUBLIC response carries, and none of this is one.
            buyerId: row.buyerId,
            purchasedAt: row.purchasedAt?.toISOString() ?? null,
            graceMinutes: Math.round(READY_MADE_FULFILMENT_GRACE_MS / 60000),
            note:
              "A ready-made purchase is still `paid` with no clone trip well past the fulfilment " +
              "grace: fulfillReadyMadePurchase's atomic paid→cloned claim never took, so the buyer " +
              "paid and has no trip and the author has no earning. NOT REPAIRED (§17) — the " +
              "fulfilment is idempotent and could be re-driven, but this job is a detector and " +
              "the ready-made rail has no ratified recovery layer for it to stand in for.",
          },
        });
      }
    }

    // R4 — the purchase is live but Stripe does not say the money moved. Only judged for a PI this
    // pass actually SAW: "not in this window's listing" is not "not succeeded at Stripe", and
    // guessing about unseen PaymentIntents is the discipline the sweep established.
    const pi = piById.get(row.stripePaymentIntentId);
    if (pi && pi.status !== PI_SUCCEEDED) {
      exceptions.push({
        rail: "ready_made",
        kind: "rm_purchase_pi_not_succeeded",
        severity: "critical",
        dedupeKey: `ready_made:rm_purchase_pi_not_succeeded:${row.id}:${pi.id}:${pi.status}`,
        bookingId: row.id,
        paymentIntentId: pi.id,
        expectedAmount: centsToDollars(row.pricePaidCents),
        actualAmount: centsToDollars(pi.amount_received || pi.amount),
        currency: pi.currency ?? null,
        details: {
          purchaseStatus: row.status,
          paymentIntentStatus: pi.status,
          note:
            "A live ready-made purchase stands on a PaymentIntent that is not succeeded at Stripe. " +
            "The row is written only after /purchase/confirm retrieves a `succeeded` intent, so a " +
            "PaymentIntent that is no longer succeeded is a fact a human has to look at.",
        },
      });
    }
  }

  // ── R5. REFUND drift: Stripe reversed money the purchase row still treats as live ────────────
  for (const rf of refunds) {
    const piId = typeof rf.payment_intent === "string" ? rf.payment_intent : null;
    if (!piId) continue;
    const row = byPi.get(piId);
    // Not ours to judge: a refund against a cart-rail, legacy or non-purchase PaymentIntent has no
    // ready_made_purchases row and belongs to another rail's classification (or to none).
    if (!row || !inScope(row.id)) continue;
    if (!READY_MADE_LIVE_STATUSES.includes(row.status ?? "")) continue;

    exceptions.push({
      rail: "ready_made",
      kind: "rm_refund_not_reversed",
      severity: "critical",
      dedupeKey: `ready_made:rm_refund_not_reversed:${rf.id}`,
      bookingId: row.id,
      paymentIntentId: piId,
      chargeId: typeof rf.charge === "string" ? rf.charge : null,
      expectedAmount: centsToDollars(row.pricePaidCents),
      actualAmount: centsToDollars(rf.amount),
      currency: rf.currency ?? null,
      details: {
        stripeRefundId: rf.id,
        purchaseStatus: row.status,
        cloneTripId: row.cloneTripId,
        note:
          "Stripe holds a refund against this ready-made PaymentIntent and the purchase is still " +
          "live (paid/cloned) — the buyer has the money back AND the trip, and the author's " +
          "escrowed earning was never reversed. The platform's own admin refund flips the status " +
          "BEFORE it calls Stripe, so this shape is typically a refund issued straight from the " +
          "Stripe dashboard. DETECT-ONLY: nothing here reverses the earning or revokes the clone.",
      },
    });
  }

  return { scannedPurchases: rows.length };
}

// ── DB access ────────────────────────────────────────────────────────────────────────────────

async function loadCartBookings(args: {
  windowStart: Date;
  paymentIntentIds: string[];
  bookingIds: string[];
  onlyBookingIds?: string[];
}): Promise<CartBookingRow[]> {
  const { windowStart, paymentIntentIds, bookingIds, onlyBookingIds } = args;
  if (onlyBookingIds && onlyBookingIds.length === 0) return [];

  const clauses = [sql`created_at >= ${windowStart.toISOString()}`];
  if (paymentIntentIds.length > 0) {
    clauses.push(sql`stripe_payment_intent_id IN (${sql.join(paymentIntentIds.map((v) => sql`${v}`), sql`, `)})`);
  }
  if (bookingIds.length > 0) {
    clauses.push(sql`id IN (${sql.join(bookingIds.map((v) => sql`${v}`), sql`, `)})`);
  }

  const rows = await db.execute(sql`
    SELECT ${CART_COLUMNS}
    FROM service_bookings
    WHERE (${sql.join(clauses, sql` OR `)})
      ${
        onlyBookingIds
          ? sql`AND id IN (${sql.join(onlyBookingIds.map((v) => sql`${v}`), sql`, `)})`
          : sql``
      }
    ORDER BY created_at ASC
    LIMIT ${CART_SCAN_LIMIT}
  `);
  if (rows.rows.length === CART_SCAN_LIMIT) {
    // A detector that silently stops looking is worse than no detector. Say so loudly rather
    // than reporting a clean tail that was never examined; pagination is a named follow-up.
    logger.error(
      { limit: CART_SCAN_LIMIT },
      "[RECONCILIATION] cart-rail scan hit its row cap — the WINDOW WAS NOT FULLY EXAMINED. " +
        "Raise CART_SCAN_LIMIT or paginate; do not read this pass as clean.",
    );
  }
  return (rows.rows as any[]).map(mapCartRow);
}

/**
 * Ready-made purchases created inside the window, OR carrying a PaymentIntent id the window's
 * Stripe listing named (a PaymentIntent can be refunded a week after the purchase — the row is
 * older than the window and the money event is inside it, and a window-only query would miss
 * exactly that drift). Same two-sided predicate as `loadCartBookings`, one table over.
 */
async function loadReadyMadePurchases(args: {
  windowStart: Date;
  paymentIntentIds: string[];
  onlyPurchaseIds?: string[];
}): Promise<ReadyMadePurchaseRow[]> {
  const { windowStart, paymentIntentIds, onlyPurchaseIds } = args;
  if (onlyPurchaseIds && onlyPurchaseIds.length === 0) return [];

  const clauses = [sql`purchased_at >= ${windowStart.toISOString()}`];
  if (paymentIntentIds.length > 0) {
    const unique = Array.from(new Set(paymentIntentIds));
    clauses.push(
      sql`stripe_payment_intent_id IN (${sql.join(unique.map((v) => sql`${v}`), sql`, `)})`,
    );
  }

  const rows = await db.execute(sql`
    SELECT id, buyer_id, ready_made_trip_id, status, stripe_payment_intent_id,
           price_paid_cents, currency, clone_trip_id, purchased_at
    FROM ready_made_purchases
    WHERE (${sql.join(clauses, sql` OR `)})
      ${
        onlyPurchaseIds
          ? sql`AND id IN (${sql.join(onlyPurchaseIds.map((v) => sql`${v}`), sql`, `)})`
          : sql``
      }
    ORDER BY purchased_at ASC
    LIMIT ${READY_MADE_SCAN_LIMIT}
  `);
  if (rows.rows.length === READY_MADE_SCAN_LIMIT) {
    // Same posture as the cart rail's cap: say it loudly rather than report a tail nobody looked at.
    logger.error(
      { limit: READY_MADE_SCAN_LIMIT },
      "[RECONCILIATION] ready-made scan hit its row cap — the WINDOW WAS NOT FULLY EXAMINED. " +
        "Raise READY_MADE_SCAN_LIMIT or paginate; do not read this pass as clean.",
    );
  }
  return (rows.rows as any[]).map(mapReadyMadeRow);
}

async function loadKnownRefundIds(stripeRefundIds: string[]): Promise<Set<string>> {
  if (stripeRefundIds.length === 0) return new Set();
  const rows = await db.execute(sql`
    SELECT stripe_refund_id FROM refunds
    WHERE stripe_refund_id IN (${sql.join(stripeRefundIds.map((v) => sql`${v}`), sql`, `)})
  `);
  return new Set((rows.rows as any[]).map((r) => String(r.stripe_refund_id)));
}

/** Open the run row FIRST, so a pass that dies mid-flight still leaves `status='running'` behind
 *  rather than nothing at all — a stuck run is itself a finding. */
async function openRun(triggeredBy: string, windowStart: Date): Promise<string | null> {
  try {
    // The id is supplied HERE rather than left to the column default. Migration 177 declares
    // `DEFAULT gen_random_uuid()::varchar`, but the deploy's drizzle-kit push is authoritative
    // over the shape it finds in shared/schema.ts, where the id is a `$defaultFn` (an APP-side
    // default the push cannot express). A push-canonical database therefore has NO column
    // default, and a raw-SQL insert that omitted the id would hit a NOT NULL violation on
    // exactly the environments the deploy push governs. Supplying it works on both.
    const r = await db.execute(sql`
      INSERT INTO reconciliation_runs (id, triggered_by, status, window_start)
      VALUES (${randomUUID()}, ${triggeredBy}, 'running', ${windowStart.toISOString()})
      RETURNING id
    `);
    return String((r.rows[0] as any)?.id ?? "") || null;
  } catch (err) {
    logger.error({ err }, "[RECONCILIATION] could not open a run row — the pass will still run, unrecorded");
    return null;
  }
}

async function closeRun(runId: string | null, result: ReconciliationResult, note: string | null): Promise<void> {
  if (!runId) return;
  try {
    await db.execute(sql`
      UPDATE reconciliation_runs
      SET finished_at = NOW(),
          status = ${result.status},
          scanned_payment_intents = ${result.checkedPaymentIntents},
          scanned_charges = ${result.checkedCharges},
          scanned_refunds = ${result.checkedRefunds},
          scanned_cart_bookings = ${result.checkedCartBookings},
          scanned_legacy_bookings = ${result.checkedBookings},
          exceptions_detected = ${result.exceptions.length},
          exceptions_new = ${result.newExceptions},
          promoted = ${result.promoted},
          note = ${note}
      WHERE id = ${runId}
    `);
  } catch (err) {
    logger.error({ err, runId }, "[RECONCILIATION] could not close the run row");
  }
}

/**
 * APPEND-ONLY insert. `ON CONFLICT (dedupe_key) DO NOTHING` is what keeps a drift that persists
 * for a month as ONE row (stamped with the run that FIRST saw it) instead of thirty — without
 * ever mutating a recorded fact. The run row separately records detected-vs-new, so "still
 * drifting" stays visible.
 */
async function persistExceptions(runId: string, exceptions: ReconciliationException[]): Promise<number> {
  let inserted = 0;
  for (const e of exceptions) {
    try {
      const r = await db.execute(sql`
        INSERT INTO reconciliation_exceptions (
          id, run_id, rail, kind, severity, dedupe_key, booking_id, payment_intent_id, charge_id,
          expected_amount, actual_amount, currency, details
        ) VALUES (
          ${randomUUID()}, ${runId}, ${e.rail}, ${e.kind}, ${e.severity}, ${e.dedupeKey},
          ${e.bookingId ?? null}, ${e.paymentIntentId ?? null}, ${e.chargeId ?? null},
          ${e.expectedAmount == null ? null : e.expectedAmount.toFixed(2)},
          ${e.actualAmount == null ? null : e.actualAmount.toFixed(2)},
          ${e.currency ?? null}, ${JSON.stringify(e.details ?? {})}::jsonb
        )
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id
      `);
      if (r.rows.length > 0) inserted += 1;
    } catch (err) {
      logger.error({ err, dedupeKey: e.dedupeKey }, "[RECONCILIATION] exception row insert failed");
    }
  }
  return inserted;
}

async function notifyDigest(exceptions: ReconciliationException[], newCount: number): Promise<void> {
  await db.insert(adminNotifications).values({
    type: "reconciliation_mismatch",
    message:
      `${exceptions.length} payment/booking drift exception(s) detected (${newCount} newly recorded) — ` +
      `see GET /api/admin/reconciliation/exceptions`,
    reason: JSON.stringify(
      exceptions.map((e) => ({
        type: e.kind,
        rail: e.rail,
        bookingId: e.bookingId ?? undefined,
        paymentIntentId: e.paymentIntentId ?? undefined,
        chargeId: e.chargeId ?? undefined,
        amount: e.actualAmount ?? undefined,
      })),
    ),
  } as any);
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────

function splitBookingIds(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    // `createPaymentIntent` appends '...' when the list exceeds Stripe's 500-char metadata cap;
    // the truncated tail is not a booking id.
    .filter((s) => s.length > 0 && s !== "...");
}

function dedupeRows(rows: CartBookingRow[]): CartBookingRow[] {
  const seen = new Map<string, CartBookingRow>();
  for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
  return Array.from(seen.values());
}

/** A legacy-rail PaymentIntent carries the SINGULAR `bookingId` metadata that
 *  `POST /api/bookings/process-cart` writes; the cart rail writes `bookingIds` (plural). Both
 *  rails run and each no-ops on ids it does not own (CLAUDE.md §15c). */
function legacyOwnsIntent(pi: Stripe.PaymentIntent): boolean {
  return Boolean(pi.metadata?.bookingId) && !pi.metadata?.bookingIds;
}

function centsToDollars(cents: number | null | undefined): number {
  return Math.round(Number(cents ?? 0)) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function countByKind(exceptions: ReconciliationException[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of exceptions) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}
