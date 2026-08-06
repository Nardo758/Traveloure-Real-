/**
 * CHECKOUT CLAIM LIFECYCLE — the §15 claim → authorize → promote spine, and the TTL reclaim.
 *
 * WHY THIS MODULE EXISTS (ruling 38; CLAUDE.md §14/§15)
 * ─────────────────────────────────────────────────────
 * `POST /api/checkout` used to commit every irreversible effect — booking rows, the
 * cart clear, the plan-item `purchased` flip + its diary row, the provider's notification and
 * email — BEFORE `stripe.paymentIntents.create`, the one operation that can fail. When it did
 * fail the traveler was stranded (same key ⇒ a bare `{duplicate:true}` the client rendered as
 * "Booking created!"; fresh key ⇒ "Cart is empty"), and the in-code promise that "the webhook
 * will flip them to confirmed" could not hold: with no PaymentIntent there is never a webhook.
 *
 * The fix could NOT be "write nothing until the PaymentIntent exists". CLAIM ORDER IS
 * LOAD-BEARING: §15 requires an atomic DB claim BEFORE the external call, and removing it was
 * measured — 3 concurrent same-key checkouts produced 3 REAL Stripe charges without the
 * `service_bookings.idempotency_key` unique claim, 1 with it (commit c3a0be03; the index is
 * declared in `shared/schema.ts` so the deploy push maintains it).
 *
 * So the claim stays exactly where it is, and the COMMITMENT moves:
 *
 *   1. CLAIM      (pre-Stripe, atomic, PROVISIONAL) — slots claimed, booking rows inserted at
 *                 `status='payment_pending'` with `stripe_payment_intent_id IS NULL`.
 *   2. AUTHORIZE  — `paymentIntents.create`.
 *   3. PROMOTE    (post-Stripe) — stamp the PI id, THEN flip items purchased, bump counters,
 *                 clear the cart, notify. Nothing irreversible happens before step 2 succeeds.
 *   4. RECLAIM    — a claim that never reached step 3 is voided by the TTL sweep below. NOT a
 *                 compensating rollback (explicitly rejected by the decision-maker: rollback
 *                 code runs in exactly the conditions that broke the operation) — expiry is
 *                 durable against a process death, rollback is not.
 *
 * NO NEW STATE WAS NEEDED. `status='payment_pending' AND stripe_payment_intent_id IS NULL` is
 * already "claimed but not authorized" by construction, and every consumer already keys on that
 * column (the webhook's confirm/fail recovery, refundServiceBooking, the invariants). No
 * migration, no new enum value, no publish-time push trap (CLAUDE.md deploy-push rule).
 *
 * ─── THE DANGEROUS WINDOW, AND WHY THE SWEEP CANNOT VOID A PAID BOOKING ────────────────────
 *
 * Stripe accepts `paymentIntents.create` and the server then dies before the PI id is stamped.
 * The row now LOOKS provisional while a real PaymentIntent exists and the traveler may be
 * charged. Nothing else in the codebase would catch it: BOTH reconciliation paths that appear
 * to cover it — `stripePaymentService.handlePaymentSucceeded` and
 * `POST /api/bookings/confirm-payment` — query the LEGACY `bookings` table and are inert for
 * cart checkout (filed as tasks #212 / #213; not fixed here, and this module is designed
 * assuming they stay broken).
 *
 * TWO LAYERS, because neither alone is sufficient:
 *
 *   LAYER 1 — PRE-FLIGHT ATTEMPT MARKER (local, needs no network, always correct).
 *     `bookingDetails.stripeAttemptAt` is stamped on every row of a checkout IMMEDIATELY
 *     BEFORE the Stripe call. A row with NO marker provably never reached Stripe, so no PI can
 *     exist for it and voiding it is safe with zero Stripe dependency. This is the ordinary
 *     path and covers every "Stripe was unreachable / key unset / request rejected" failure.
 *
 *   LAYER 2 — STRIPE-SIDE RECONCILIATION (for the narrow marked-but-unstamped window).
 *     A MARKED row is NEVER auto-voided. It is quarantined and reconciled against Stripe: we
 *     look for a PaymentIntent carrying this booking id in its `bookingIds` metadata within a
 *     bounded `created` window. Found ⇒ PROMOTE (stamp the PI id, which re-arms the webhook
 *     path) — never void. Not found ⇒ Stripe definitively has none ⇒ void. Stripe unreachable
 *     or unconfigured ⇒ LEAVE QUARANTINED, log, never void. The sweep's default answer under
 *     uncertainty is always "do nothing".
 *
 *   Layer 1 alone would leak inventory forever on marked rows; Layer 2 alone would be unusable
 *   whenever Stripe is unreachable (exactly when checkouts fail). Together: the common case
 *   needs no network and the rare case is never guessed at.
 *
 * ─── RACE SAFETY (a promote and a void must never BOTH win) ────────────────────────────────
 *
 * Every write here is an ATOMIC CONDITIONAL UPDATE on the provisional predicate — the same §15
 * discipline as the rest of the money path, never check-then-update:
 *
 *     UPDATE service_bookings SET … WHERE id = … AND status = 'payment_pending'
 *                                     AND stripe_payment_intent_id IS NULL RETURNING id
 *
 * The row transition IS the guard. If a late authorization stamps first, the void's WHERE
 * matches 0 rows and it skips. If the void lands first, the authorization stamp matches 0 rows
 * and the checkout refuses to promote (returning a truthful retry error with the cart still
 * intact) rather than handing back a clientSecret for a voided booking. Exactly one wins, and
 * the same property makes the sweep IDEMPOTENT: a second pass sees `status='expired'`, matches
 * 0 rows, and cannot double-release the slot.
 */

import Stripe from "stripe";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { serviceBookings } from "@shared/schema";
import { logItemTransition } from "./item-transition-log.service";
import { logger } from "../infrastructure/logger";

/** Ratified TTL (decision-maker, ruling 38): long enough for a traveler to finish the Stripe
 *  PaymentElement, short enough that held inventory comes back the same session. */
export const CHECKOUT_CLAIM_TTL_MINUTES = 30;

/** The `bookingDetails` key carrying the LAYER-1 pre-flight marker (see the docblock). */
export const STRIPE_ATTEMPT_AT_KEY = "stripeAttemptAt";

/** Status a reclaimed (never-authorized) claim lands in. `service_bookings.status` is a plain
 *  varchar(30) with no CHECK in the schema or any migration, so this needs no DDL and cannot
 *  trip the publish-time push. It is deliberately NOT one of the paid-equivalent statuses the
 *  `paid-service-bookings-have-payment-intent` invariant guards. */
export const CLAIM_EXPIRED_STATUS = "expired";

export interface ProvisionalClaimRow {
  id: string;
  tripId: string | null;
  slotId: string | null;
  travelerId: string | null;
  bookingDetails: Record<string, unknown> | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

export interface SweepResult {
  /** Rows past TTL that carried no attempt marker — voided (Layer 1: provably never reached Stripe). */
  voidedUnreached: number;
  /** Marked rows Stripe confirmed have no PaymentIntent — voided after Layer-2 reconciliation. */
  voidedReconciled: number;
  /** Marked rows whose PaymentIntent was FOUND at Stripe — promoted, never voided. */
  promoted: number;
  /** Marked rows left untouched because Stripe was unconfigured/unreachable (never guessed at). */
  quarantined: number;
  /** Slots whose capacity was handed back. */
  slotsReleased: number;
  /** Diary rows written for the voids (rulings 12/16/18). */
  diaryRows: number;
}

/**
 * LAYER 1. Stamp the pre-flight attempt marker on every booking row of this checkout, BEFORE
 * the Stripe call. Must complete for ALL rows before `paymentIntents.create` is invoked: a row
 * that is still unmarked when the process dies is, by that fact, one Stripe never saw.
 *
 * jsonb concat (`||`) so the existing bookingDetails snapshot (bundle contents, room nights,
 * itineraryItemId) is preserved, never replaced.
 */
export async function markStripeAttempt(
  bookingIds: string[],
  stripeIdempotencyKey: string,
): Promise<void> {
  if (bookingIds.length === 0) return;
  await db
    .update(serviceBookings)
    .set({
      bookingDetails: sql`COALESCE(${serviceBookings.bookingDetails}, '{}'::jsonb) || jsonb_build_object(
        ${STRIPE_ATTEMPT_AT_KEY}::text, to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'stripeIdempotencyKey'::text, ${stripeIdempotencyKey}::text
      )`,
      updatedAt: new Date(),
    })
    .where(inArray(serviceBookings.id, bookingIds));
}

/**
 * AUTHORIZE → PROMOTE gate. Stamps the PaymentIntent id on every row of this checkout with an
 * ATOMIC CONDITIONAL update on the provisional predicate, ALL-OR-NOTHING inside one transaction.
 *
 * Returns false when it could not claim every row — i.e. the TTL sweep (or another authorization)
 * got there first. The transaction rolls back so no row is left half-stamped, and the caller MUST
 * refuse to promote: handing back a clientSecret for a voided booking is the failure this whole
 * lane exists to prevent.
 */
export async function stampAuthorization(
  bookingIds: string[],
  paymentIntentId: string,
): Promise<boolean> {
  if (bookingIds.length === 0) return false;
  try {
    return await db.transaction(async (tx) => {
      const stamped = await tx
        .update(serviceBookings)
        .set({ stripePaymentIntentId: paymentIntentId, updatedAt: new Date() })
        .where(
          and(
            inArray(serviceBookings.id, bookingIds),
            eq(serviceBookings.status, "payment_pending"),
            isNull(serviceBookings.stripePaymentIntentId),
          ),
        )
        .returning({ id: serviceBookings.id });
      if (stamped.length !== bookingIds.length) {
        // Roll the partial stamp back — all-or-nothing.
        throw new ClaimLostError(bookingIds.length, stamped.length);
      }
      return true;
    });
  } catch (err) {
    if (err instanceof ClaimLostError) {
      logger.error(
        { bookingIds, expected: err.expected, claimed: err.claimed, paymentIntentId },
        "[checkout] authorization stamp lost the claim (rows already voided/authorized) — refusing to promote",
      );
      return false;
    }
    throw err;
  }
}

class ClaimLostError extends Error {
  constructor(public expected: number, public claimed: number) {
    super(`claim lost: expected ${expected} provisional rows, claimed ${claimed}`);
  }
}

/**
 * Reads the caller's OWN prior claim for `idempotencyKey`, newest first.
 *
 * Scoped to `travelerId` deliberately: the pre-existing lookup matched the key alone, so any
 * user replaying someone else's key learned that it existed. The sibling match (`key#1`, `key#2`
 * …) uses LIKE, and the traveler scope is also what bounds a `%`/`_` in a client-chosen key to
 * that client's own rows.
 */
export async function findPriorClaim(
  travelerId: string,
  idempotencyKey: string,
): Promise<Array<{
  id: string;
  status: string | null;
  stripePaymentIntentId: string | null;
  totalAmount: string;
  platformFee: string | null;
}>> {
  const rows = await db.execute(sql`
    SELECT id, status, stripe_payment_intent_id, total_amount, platform_fee, idempotency_key
    FROM service_bookings
    WHERE traveler_id = ${travelerId}
      AND (idempotency_key = ${idempotencyKey} OR idempotency_key LIKE ${idempotencyKey + "#%"})
    ORDER BY idempotency_key ASC
  `);
  return (rows.rows as any[]).map((r) => ({
    id: String(r.id),
    status: r.status ?? null,
    stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
    totalAmount: String(r.total_amount ?? "0"),
    platformFee: r.platform_fee == null ? null : String(r.platform_fee),
  }));
}

/**
 * The Stripe half of LAYER 2, injectable so the behavioural tests can prove all three branches
 * (found ⇒ promote, definitively-absent ⇒ void, unreachable ⇒ quarantine) without a network.
 *
 * Returns the PaymentIntent id when Stripe HAS one for `bookingId`, null when Stripe answered
 * and has none, and THROWS when Stripe could not be consulted at all — the caller treats a throw
 * as "unknown" and leaves the row alone.
 */
export type StripeIntentLookup = (
  bookingId: string,
  createdAt: Date,
) => Promise<string | null>;

/** Default lookup: bounded `paymentIntents.list` around the claim's creation time, matched on the
 *  `bookingIds` metadata `createPaymentIntent` writes. Immediately consistent (unlike Search). */
export const defaultStripeIntentLookup: StripeIntentLookup = async (bookingId, createdAt) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY unset — cannot consult Stripe");
  const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
  const from = Math.floor(createdAt.getTime() / 1000) - 300; // 5 min of clock skew tolerance
  const to = Math.floor(createdAt.getTime() / 1000) + 3600; // the attempt cannot be an hour late
  const page = await stripe.paymentIntents.list({ limit: 100, created: { gte: from, lte: to } });
  for (const pi of page.data) {
    const ids = String(pi.metadata?.bookingIds ?? "");
    if (ids.split(",").some((id) => id.trim() === bookingId)) return pi.id;
  }
  return null;
};

/**
 * THE TTL RECLAIM. Idempotent, logged, race-safe — see the module docblock for all three.
 *
 * Never throws: a sweep failure must not take the process down. Returns per-outcome counts so a
 * caller (scheduler, admin endpoint, test) can assert on them.
 */
export async function sweepExpiredCheckoutClaims(opts?: {
  ttlMinutes?: number;
  limit?: number;
  stripeIntentLookup?: StripeIntentLookup;
  /** Restrict the pass to specific booking ids. Operational scoping (reconcile one checkout on
   *  demand) and what lets the behavioural suite assert exact per-pass counts without a
   *  neighbouring row in the same database changing them. Omit for the scheduled full pass. */
  onlyBookingIds?: string[];
}): Promise<SweepResult> {
  const ttl = opts?.ttlMinutes ?? CHECKOUT_CLAIM_TTL_MINUTES;
  const limit = opts?.limit ?? 200;
  const scope = opts?.onlyBookingIds;
  const lookup = opts?.stripeIntentLookup ?? defaultStripeIntentLookup;
  const result: SweepResult = {
    voidedUnreached: 0,
    voidedReconciled: 0,
    promoted: 0,
    quarantined: 0,
    slotsReleased: 0,
    diaryRows: 0,
  };

  if (scope && scope.length === 0) return result;

  let candidates: ProvisionalClaimRow[];
  try {
    const rows = await db.execute(sql`
      SELECT id, trip_id, slot_id, traveler_id, booking_details, idempotency_key, created_at
      FROM service_bookings
      WHERE status = 'payment_pending'
        AND stripe_payment_intent_id IS NULL
        AND created_at < NOW() - (${String(ttl)} || ' minutes')::interval
        ${scope ? sql`AND id IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})` : sql``}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
    candidates = (rows.rows as any[]).map((r) => ({
      id: String(r.id),
      tripId: r.trip_id ?? null,
      slotId: r.slot_id ?? null,
      travelerId: r.traveler_id ?? null,
      bookingDetails: (r.booking_details ?? null) as Record<string, unknown> | null,
      idempotencyKey: r.idempotency_key ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
    }));
  } catch (err) {
    logger.error({ err }, "[checkout-sweep] candidate query failed — no rows touched");
    return result;
  }

  for (const row of candidates) {
    const reachedStripe = Boolean(row.bookingDetails?.[STRIPE_ATTEMPT_AT_KEY]);

    // LAYER 1: no marker ⇒ Stripe never saw this claim ⇒ safe to void with no network call.
    if (!reachedStripe) {
      const voided = await voidClaim(row, "never_attempted");
      if (voided.voided) {
        result.voidedUnreached += 1;
        result.slotsReleased += voided.slotsReleased;
        result.diaryRows += voided.diaryRows;
      }
      continue;
    }

    // LAYER 2: marked ⇒ a PaymentIntent MAY exist ⇒ never void on a guess.
    let intentId: string | null;
    try {
      intentId = await lookup(row.id, row.createdAt);
    } catch (err) {
      result.quarantined += 1;
      logger.warn(
        { bookingId: row.id, err: (err as any)?.message },
        "[checkout-sweep] claim reached Stripe but Stripe could not be consulted — QUARANTINED, not voided " +
          "(a paid booking must never be voided on an unknown)",
      );
      continue;
    }

    if (intentId) {
      // A real PaymentIntent exists. Stamp it (atomic conditional) so the webhook path can
      // confirm it — the opposite of voiding.
      const promoted = await stampAuthorization([row.id], intentId);
      if (promoted) {
        result.promoted += 1;
        logger.error(
          { bookingId: row.id, paymentIntentId: intentId },
          "[checkout-sweep] RECOVERED a booking whose PaymentIntent was created but never stamped " +
            "(server died mid-authorization) — stamped, NOT voided; the webhook will confirm it",
        );
      }
      continue;
    }

    // Stripe answered and has no PaymentIntent for this booking — definitively unpaid.
    const voided = await voidClaim(row, "stripe_has_no_intent");
    if (voided.voided) {
      result.voidedReconciled += 1;
      result.slotsReleased += voided.slotsReleased;
      result.diaryRows += voided.diaryRows;
    }
  }

  if (
    result.voidedUnreached + result.voidedReconciled + result.promoted + result.quarantined > 0
  ) {
    logger.info({ ...result, ttlMinutes: ttl }, "[checkout-sweep] pass complete");
  }
  return result;
}

/**
 * Void ONE provisional claim: atomic conditional status flip, slot release, and the diary row —
 * all in ONE transaction so reclaimed inventory is auditable rather than silently reappearing
 * (rulings 12/16/18; the flip and its log entry are an atomic pair, exactly like
 * `markItemPurchased`).
 *
 * The conditional WHERE is what makes this both race-safe and idempotent: a row a late
 * authorization already stamped (or an earlier sweep pass already expired) matches 0 rows and is
 * skipped, so capacity can never be released twice.
 *
 * The slot release mirrors `storage.releaseSlot` inline rather than calling it, because that
 * helper runs on the module-level `db` and would therefore land OUTSIDE this transaction — a
 * crash between the flip and the release would leak the capacity the sweep exists to reclaim.
 */
async function voidClaim(
  row: ProvisionalClaimRow,
  reason: "never_attempted" | "stripe_has_no_intent",
): Promise<{ voided: boolean; slotsReleased: number; diaryRows: number }> {
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        UPDATE service_bookings
        SET status = ${CLAIM_EXPIRED_STATUS},
            cancelled_at = NOW(),
            cancellation_reason = ${`checkout_claim_expired:${reason}`},
            updated_at = NOW()
        WHERE id = ${row.id}
          AND status = 'payment_pending'
          AND stripe_payment_intent_id IS NULL
        RETURNING id
      `);
      if (claimed.rows.length === 0) {
        // Someone else won the race (a late authorization stamped it, or a previous pass already
        // expired it). Idempotent no-op — critically, NO slot release happens on this path.
        return { voided: false, slotsReleased: 0, diaryRows: 0 };
      }

      let slotsReleased = 0;
      if (row.slotId) {
        await tx.execute(sql`
          UPDATE vendor_availability_slots
          SET booked_count = GREATEST(COALESCE(booked_count, 0) - 1, 0),
              status = CASE
                WHEN status = 'fully_booked'
                     AND GREATEST(COALESCE(booked_count, 0) - 1, 0) < COALESCE(capacity, 1)
                  THEN 'available'
                ELSE status
              END,
              updated_at = NOW()
          WHERE id = ${row.slotId}
        `);
        slotsReleased = 1;
      }

      // Ruling 12/16/18: the reclaim is an auditable event. Item-grained when the claim carried a
      // plan item, trip-grained (itemId NULL, ruling 16) otherwise. from/to status are NULL —
      // the item's own routing_status never moved (the purchased flip lives in PROMOTE, which
      // this claim never reached), so there is no status transition to claim there was.
      let diaryRows = 0;
      if (row.tripId) {
        const itemId =
          typeof row.bookingDetails?.itineraryItemId === "string"
            ? (row.bookingDetails.itineraryItemId as string)
            : null;
        await logItemTransition(tx, {
          tripId: row.tripId,
          itemId,
          eventType: "checkout_claim_expired",
          fromStatus: null,
          toStatus: null,
          actorType: "system",
        });
        diaryRows = 1;
      }

      return { voided: true, slotsReleased, diaryRows };
    });
  } catch (err) {
    logger.error(
      { err, bookingId: row.id, reason },
      "[checkout-sweep] void transaction failed — claim left provisional for the next pass (no partial effect)",
    );
    return { voided: false, slotsReleased: 0, diaryRows: 0 };
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────────────────────
// Runs often enough that reclaimed inventory returns within the same shopping session, and is a
// no-op on a healthy platform (the candidate query matches nothing).

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

class CheckoutClaimSweepScheduler {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    setTimeout(() => void this.run(), 2 * 60 * 1000);
    this.timer = setInterval(() => void this.run(), SWEEP_INTERVAL_MS);
    console.log(
      `[checkout-sweep] Scheduler started — unauthorized checkout claims older than ${CHECKOUT_CLAIM_TTL_MINUTES}m are reclaimed every 5m`,
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    await sweepExpiredCheckoutClaims().catch((err) =>
      logger.error({ err }, "[checkout-sweep] scheduled pass threw (swallowed)"),
    );
  }
}

export const checkoutClaimSweepScheduler = new CheckoutClaimSweepScheduler();
