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
 * (§14). `POST /api/checkout` charges `subtotal + basePlatformFee + conciergeFee`, and each
 * booking row persists its own share as `total_amount` (the item price) + `platform_fee` (base
 * platform fee + insurance + concierge). So the expected total for a PaymentIntent is exactly
 * `SUM(total_amount + platform_fee)` over its rows — a fact recomputed from the catalog-sourced
 * rows, with no rate literal anywhere in this file (§8).
 */

import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { gte, sql } from "drizzle-orm";
import { db } from "../db";
import { bookings, adminNotifications } from "@shared/schema";
import type { ReconciliationExceptionKind } from "@shared/schema";
import { promotePaidCheckout } from "../services/checkout-claim.service";
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

export type ReconciliationRail = "cart" | "legacy";
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
  const key = process.env.STRIPE_SECRET_KEY;
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
  };
}

const CART_COLUMNS = sql`
  id, status, stripe_payment_intent_id, total_amount, platform_fee, idempotency_key,
  traveler_id, created_at, (booking_details ? 'reconciliationException') AS has_recon_exception
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
      const expected = chargeable.reduce(
        (sum, r) => sum + parseFloat(r.totalAmount || "0") + parseFloat(r.platformFee || "0"),
        0,
      );
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
              "rows (SUM(total_amount + platform_fee)) disagree beyond the rounding tolerance.",
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
        expectedAmount: round2(parseFloat(r.totalAmount || "0") + parseFloat(r.platformFee || "0")),
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
