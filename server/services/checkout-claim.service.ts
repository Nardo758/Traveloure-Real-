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
 *   5. CONFIRM    — the traveler actually PAYS. `promotePaidCheckout` below moves the authorized
 *                 claim `payment_pending → confirmed`. Added by the legacy-reconciliation lane
 *                 (tasks #212/#213); see its own docblock for why this step previously had a
 *                 single un-redundant implementation.
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
 * charged. When this module was written nothing else in the codebase would catch it: BOTH
 * reconciliation paths that appear to cover it — `stripePaymentService.handlePaymentSucceeded`
 * and `POST /api/bookings/confirm-payment` — queried the LEGACY `bookings` table and were inert
 * for cart checkout (filed as tasks #212 / #213), so the sweep was designed assuming they stay
 * broken. **#212/#213 have since LANDED** (legacy-reconciliation lane): both now drive
 * `promotePaidCheckout` below, which covers cart checkout. The sweep's design is unchanged and
 * deliberately still assumes nothing about them — redundancy means every layer stands alone.
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
import { markItemPurchased } from "./item-routing.service";
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

// ══ STEP 5 — THE PAYMENT PROMOTION (tasks #212 / #213, legacy-reconciliation lane) ═══════════
//
// WHY THIS EXISTS
// ───────────────
// `POST /api/checkout` ends with an AUTHORIZED claim: `service_bookings.status='payment_pending'`
// with the PaymentIntent id stamped. The traveler then pays in the Stripe PaymentElement, and
// something has to move that row to `confirmed`. Both documented reconciliation paths —
// `stripePaymentService.handlePaymentSucceeded` and `POST /api/bookings/confirm-payment` — query
// the LEGACY `bookings` table with `service_bookings` ids, so for a cart checkout they matched
// ZERO rows and did nothing (ruling 38 filed them as #212/#213). The only thing that actually
// moved a cart booking to `confirmed` was one raw inline UPDATE in the webhook route, keyed on
// `stripe_payment_intent_id` — a single implementation, with no redundancy behind it and no
// audit trail, that could not help at all when the PI id was never stamped.
//
// This function is the ONE promotion implementation, with TWO callers (webhook + client confirm).
//
// IT IS NOT `promoteAuthorizedCheckout`. That one (payments.routes.ts) is the AUTHORIZATION
// promotion — the post-Stripe-call commitment of step 3 (item flips, counters, notifications,
// cart clear). This is the PAYMENT promotion — step 5, the money leg. Deliberately disjoint:
// the effects in step 3 are NOT idempotent (a counter increment, a provider EMAIL), so this
// function must never re-run them. The one step-3 effect it DOES retry is `markItemPurchased`,
// because that helper is an atomic conditional flip and is safely re-runnable — which makes this
// path a genuine catch-up for a server that died between the authorization stamp and the promote.
//
// IDEMPOTENCY MECHANISM (§15, the same discipline as `stampAuthorization` / `voidClaim`)
// ───────────────────────────────────────────────────────────────────────────────────────
//     UPDATE service_bookings SET status='confirmed', confirmed_at=NOW()
//      WHERE id = … AND status='payment_pending' AND stripe_payment_intent_id = <pi>
//      RETURNING id
//
// The row transition IS the guard — never check-then-update. Whichever signal arrives first
// matches the row and promotes it; every later signal matches 0 rows and is a NO-OP, not a second
// flip and not a second diary row. That is exactly what makes "client confirm AND webhook" safe.
//
// The predicate also carries the §14/security property that a client cannot promote with a
// PaymentIntent of its own choosing: the row's OWN server-stamped `stripe_payment_intent_id` has
// to equal the one presented.
//
// ORDERING GUARANTEES (all five orderings, stated explicitly)
// ───────────────────────────────────────────────────────────
//  1. webhook BEFORE the authorization stamp (server died mid-authorization, Stripe has the PI,
//     the row is provisional): resolvable ONLY from the PI's own `bookingIds` metadata. The
//     webhook stamps the PI first via `stampAuthorization` — the SAME atomic conditional the
//     TTL sweep's Layer-2 recovery uses — then promotes. Allowed for SERVER-VERIFIED actors
//     only (`webhook`, `reconciliation` — see SERVER_VERIFIED_ACTORS): that PaymentIntent object
//     came either from a signature-verified Stripe delivery or from the drift job's own
//     authenticated read of the Stripe API, so its metadata is Stripe's word, not a client's.
//     A CLIENT may never stamp a PI onto an unstamped row (ruling 40 amends 39's phrasing here;
//     the client prohibition is unchanged and still proven by N17c).
//  2. webhook AFTER the authorization stamp, before payment: normal path — one promotion.
//  3. webhook AFTER the client confirm (or vice-versa): the loser matches 0 rows ⇒ no-op,
//     reported as `alreadyConfirmed`. Exactly ONE promotion and ONE diary set.
//  4. webhook AFTER the TTL void: `status='expired'` fails the predicate. The row is NEVER
//     resurrected — void wins after TTL. But a PI that genuinely succeeded post-void is real
//     money, so this lands in a RECONCILIATION-EXCEPTION state: a `reconciliationException`
//     marker on the booking row, a `checkout_reconcile_exception` diary row, and a
//     logger.error. Ops-visible, never silent. (In practice the sweep cannot void a row whose
//     PI may exist — that is its Layer-1/Layer-2 contract — so this is the residual case where
//     Stripe was unreachable at sweep time; it must still be caught, not assumed away.)
//  5. TTL void racing the webhook on an UNSTAMPED row: `stampAuthorization` is the arbiter.
//     Void first ⇒ the stamp matches 0 rows ⇒ no promotion, reconciliation exception. Stamp
//     first ⇒ the row leaves the sweep's candidate set (`stripe_payment_intent_id IS NULL`)
//     and the void matches 0 rows. A promote and a void can never both win.

/**
 * Which signal drove this promotion. Recorded on the diary row (rulings 12/16/18).
 *
 * `reconciliation` (reconciliation-detection lane) is the daily Stripe-vs-DB drift job. It is a
 * SERVER-VERIFIED Stripe source exactly as `webhook` is — see `SERVER_VERIFIED_ACTORS` below for
 * why that distinction, and not the transport, is what ordering 1 actually turns on.
 */
export type PromotionActor = "webhook" | "client" | "reconciliation" | "checkout";

/**
 * Ordering-1 capability (resolve bookings from `pi.metadata.bookingIds` and stamp a PI onto an
 * unstamped claim) is gated on the PaymentIntent object being STRIPE'S OWN WORD, not a client's.
 *
 * Ruling 39 wrote that as "webhook only", because at the time the signature-verified webhook was
 * the only server-verified source in the codebase. The reconciliation-detection lane adds a
 * second one: the drift job reads the PaymentIntent from `stripe.paymentIntents.list` using the
 * platform's OWN secret key. That is the same authority as a signed delivery — arguably stronger,
 * since it is a pull rather than a push — so it carries the same capability. The rule that
 * matters and does NOT move: a CLIENT-SUPPLIED PaymentIntent may never resolve or stamp anything
 * (proven by N17c). See DECISIONS.md ruling 40, which amends 39 on exactly this clause.
 */
const SERVER_VERIFIED_ACTORS: ReadonlySet<PromotionActor> = new Set<PromotionActor>([
  "webhook",
  "reconciliation",
]);
// NOTE ON "checkout" (B2, one-click): deliberately NOT server-verified, even though it IS a
// server-side confirm with the platform's own key. Ordering-1 is the capability to resolve
// bookings from `pi.metadata.bookingIds` and stamp a PI onto an UNSTAMPED claim — and the
// checkout spine never needs it: it holds the booking ids in hand and has already run
// stampAuthorization before promoting. Granting a capability that is not needed would widen
// the set of callers that can stamp arbitrary rows for no gain. Least privilege.

/** The diary `actorType` for a promotion actor (item-transition-log vocabulary). A client-driven
 *  promotion is the traveler's own confirm poll, hence `traveler`. */
function diaryActorType(actor: PromotionActor): "webhook" | "reconciliation" | "traveler" {
  if (actor === "webhook") return "webhook";
  if (actor === "reconciliation") return "reconciliation";
  return "traveler";
}

export interface PaymentPromotionResult {
  /** Booking ids THIS call moved `payment_pending → confirmed`. */
  promoted: string[];
  /** Already `confirmed` (or confirmed by the other signal mid-flight) — idempotent no-op. */
  alreadyConfirmed: string[];
  /** Rows in a non-promotable terminal state (expired/failed/cancelled/refunded) — a payment
   *  signal arrived for a booking that cannot be confirmed. Ops-visible; never resurrected. */
  exceptions: Array<{ bookingId: string; status: string | null; reason: string }>;
  /** Rows the webhook stamped a PaymentIntent onto first (ordering 1 above). */
  lateAuthorized: string[];
  /** Diary rows written (rulings 12/16/18). */
  diaryRows: number;
}

const TERMINAL_UNPROMOTABLE = new Set([
  CLAIM_EXPIRED_STATUS,
  "failed",
  "payment_failed",
  "cancelled",
  "canceled",
  "refunded",
]);

interface CandidateRow {
  id: string;
  tripId: string | null;
  status: string | null;
  stripePaymentIntentId: string | null;
  bookingDetails: Record<string, unknown> | null;
  travelerId: string | null;
  idempotencyKey: string | null;
}

function mapCandidate(r: any): CandidateRow {
  return {
    id: String(r.id),
    tripId: r.trip_id ?? null,
    status: r.status ?? null,
    stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
    bookingDetails: (r.booking_details ?? null) as Record<string, unknown> | null,
    travelerId: r.traveler_id ?? null,
    idempotencyKey: r.idempotency_key ?? null,
  };
}

const CANDIDATE_COLUMNS = sql`id, trip_id, status, stripe_payment_intent_id, booking_details, traveler_id, idempotency_key`;

async function loadPromotionCandidates(
  paymentIntentId: string,
  metadataBookingIds: string[],
  restrictToBookingIds: string[] | undefined,
): Promise<CandidateRow[]> {
  const byId = metadataBookingIds.filter(Boolean);
  const rows = await db.execute(sql`
    SELECT ${CANDIDATE_COLUMNS}
    FROM service_bookings
    WHERE stripe_payment_intent_id = ${paymentIntentId}
       ${byId.length > 0 ? sql`OR id IN (${sql.join(byId.map((id) => sql`${id}`), sql`, `)})` : sql``}
  `);
  const found = new Map<string, CandidateRow>();
  for (const r of rows.rows as any[]) {
    const row = mapCandidate(r);
    found.set(row.id, row);
  }

  // SIBLING EXPANSION — for the never-stamped window only.
  //
  // Stripe caps a metadata VALUE at 500 chars, and `createPaymentIntent` TRUNCATES `bookingIds`
  // past 490 (`…` suffix). For a large enough cart the tail of the list is simply not in the
  // metadata, so the metadata-resolved recovery above would rescue the first N rows of a
  // multi-item checkout and silently leave the rest provisional — a partially-recovered
  // checkout, which is worse than either outcome. The rows carry their own linkage: checkout
  // stamps the bare idempotency key on the first row and `key#1`, `key#2`, … on the rest
  // (payments.routes.ts), the same convention `findPriorClaim` reads. So one unstamped row
  // identifies its whole checkout. Scoped to that row's OWN traveler, exactly as findPriorClaim
  // is, so a `%`/`_` in a client-chosen key can never reach another user's rows.
  const unstamped = Array.from(found.values()).filter((r) => r.stripePaymentIntentId === null && r.idempotencyKey && r.travelerId);
  for (const row of unstamped) {
    const base = row.idempotencyKey!.replace(/#\d+$/, "");
    const siblings = await db.execute(sql`
      SELECT ${CANDIDATE_COLUMNS}
      FROM service_bookings
      WHERE traveler_id = ${row.travelerId}
        AND (idempotency_key = ${base} OR idempotency_key LIKE ${base + "#%"})
    `);
    for (const r of siblings.rows as any[]) {
      const sibling = mapCandidate(r);
      if (found.has(sibling.id)) continue;
      // Only rows this PaymentIntent could legitimately own. A sibling already stamped with a
      // DIFFERENT PI is not ours to touch — including it would manufacture a false
      // `payment_intent_mismatch` exception out of an expansion the caller never asked for.
      if (sibling.stripePaymentIntentId !== null && sibling.stripePaymentIntentId !== paymentIntentId) continue;
      found.set(sibling.id, sibling);
    }
  }

  const all = Array.from(found.values());
  if (!restrictToBookingIds) return all;
  const allow = new Set(restrictToBookingIds);
  return all.filter((r) => allow.has(r.id));
}

/**
 * THE SHARED PAYMENT PROMOTION. Never throws — a reconciliation path that can take the webhook
 * (or the traveler's confirmation poll) down is worse than one that reports and logs.
 *
 * @param paymentIntentId   the PaymentIntent that succeeded (server-verified by BOTH callers:
 *                          the webhook by Stripe signature, the client path by a
 *                          `paymentIntents.retrieve` status check before it calls in).
 * @param actor             which signal is promoting — recorded on the diary row.
 * @param metadataBookingIds `pi.metadata.bookingIds`. Webhook only (see ordering 1).
 * @param bookingIds        optional narrowing to the caller's own booking (the client confirm
 *                          names exactly one). Never widens the set.
 */
export async function promotePaidCheckout(opts: {
  paymentIntentId: string;
  actor: PromotionActor;
  actorId?: string | null;
  metadataBookingIds?: string[];
  bookingIds?: string[];
}): Promise<PaymentPromotionResult> {
  const { paymentIntentId, actor } = opts;
  const result: PaymentPromotionResult = {
    promoted: [],
    alreadyConfirmed: [],
    exceptions: [],
    lateAuthorized: [],
    diaryRows: 0,
  };
  if (!paymentIntentId) return result;

  // Ordering 1 is a SERVER-VERIFIED-SOURCE capability: only a PaymentIntent that is Stripe's own
  // word — a signature-verified webhook delivery, or the drift job's authenticated read of the PI
  // from the Stripe API — may name bookings that do not yet carry this PI id. A CLIENT is confined
  // to rows already stamped (N17c). Ruling 40, amending 39's "webhook only" phrasing.
  const metadataIds = SERVER_VERIFIED_ACTORS.has(actor) ? (opts.metadataBookingIds ?? []) : [];

  let candidates: CandidateRow[];
  try {
    candidates = await loadPromotionCandidates(paymentIntentId, metadataIds, opts.bookingIds);
  } catch (err) {
    logger.error(
      { err, paymentIntentId, actor },
      "[checkout-promote] candidate query failed — no rows touched",
    );
    return result;
  }
  if (candidates.length === 0) return result;

  for (const row of candidates) {
    // ── Ordering 1: the webhook is the FIRST signal of success and the PI was never stamped.
    if (row.stripePaymentIntentId === null) {
      if (row.status !== "payment_pending") {
        result.exceptions.push({
          bookingId: row.id,
          status: row.status,
          reason: "unauthorized_claim_not_pending",
        });
        await recordReconciliationException(row, paymentIntentId, actor, "unauthorized_claim_not_pending", result);
        continue;
      }
      const stamped = await stampAuthorization([row.id], paymentIntentId);
      if (!stamped) {
        // Ordering 5: the TTL void won. The row is voided and stays voided.
        result.exceptions.push({ bookingId: row.id, status: row.status, reason: "claim_voided_before_authorization" });
        await recordReconciliationException(row, paymentIntentId, actor, "claim_voided_before_authorization", result);
        continue;
      }
      result.lateAuthorized.push(row.id);
      logger.error(
        { bookingId: row.id, paymentIntentId, actor },
        `[checkout-promote] the ${actor} was the FIRST signal of success — PaymentIntent existed but was ` +
          "never stamped (server died mid-authorization). Stamped from a SERVER-VERIFIED Stripe source " +
          "(a signed webhook delivery, or the drift job's own authenticated read), now promoting.",
      );
      row.stripePaymentIntentId = paymentIntentId;
    }

    if (row.stripePaymentIntentId !== paymentIntentId) {
      // A different PaymentIntent is stamped on this row — never promote it from this signal.
      result.exceptions.push({ bookingId: row.id, status: row.status, reason: "payment_intent_mismatch" });
      await recordReconciliationException(row, paymentIntentId, actor, "payment_intent_mismatch", result);
      continue;
    }

    const outcome = await promoteOneBooking(row, paymentIntentId, actor, opts.actorId ?? null);
    if (outcome.promoted) {
      result.promoted.push(row.id);
      result.diaryRows += outcome.diaryRows;
    } else if (outcome.terminalStatus && TERMINAL_UNPROMOTABLE.has(outcome.terminalStatus)) {
      result.exceptions.push({ bookingId: row.id, status: outcome.terminalStatus, reason: "not_promotable" });
      await recordReconciliationException(row, paymentIntentId, actor, "not_promotable", result);
    } else {
      // `confirmed` (or anything else already past payment_pending that is not terminal) —
      // the OTHER signal won the race. Idempotent no-op: no second flip, no second diary row.
      result.alreadyConfirmed.push(row.id);
    }
  }

  // Plan-side catch-up, AFTER the money leg and outside its transaction. Only for rows this call
  // promoted, and only through `markItemPurchased`, which is an atomic conditional flip paired
  // with its own diary row (ruling 18) and therefore idempotent: an item already `purchased` (the
  // normal case — the authorization promote flipped it) matches 0 rows and is left alone. This is
  // what closes the "server died between the authorization stamp and promoteAuthorizedCheckout"
  // hole, in which the booking is paid but the plan never learned about it.
  for (const id of result.promoted) {
    const row = candidates.find((c) => c.id === id);
    const itemId = row?.bookingDetails?.itineraryItemId;
    if (typeof itemId === "string" && itemId) {
      await markItemPurchased(itemId, id).catch((err) =>
        logger.error({ err, bookingId: id, itemId }, "[checkout-promote] plan catch-up flip failed (booking stands)"),
      );
    }
  }

  if (result.promoted.length + result.exceptions.length + result.lateAuthorized.length > 0) {
    logger.info(
      {
        paymentIntentId,
        actor,
        promoted: result.promoted.length,
        alreadyConfirmed: result.alreadyConfirmed.length,
        exceptions: result.exceptions.length,
        lateAuthorized: result.lateAuthorized.length,
      },
      "[checkout-promote] payment promotion complete",
    );
  }
  return result;
}

/**
 * ONE booking's money leg: the atomic conditional flip and its diary row, in ONE transaction
 * (rulings 12/18 — the flip and its log entry are an all-or-nothing pair, exactly as
 * `markItemPurchased` and `voidClaim` do it).
 */
async function promoteOneBooking(
  row: CandidateRow,
  paymentIntentId: string,
  actor: PromotionActor,
  actorId: string | null,
): Promise<{ promoted: boolean; diaryRows: number; terminalStatus: string | null }> {
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        UPDATE service_bookings
        SET status = 'confirmed',
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${row.id}
          AND status = 'payment_pending'
          AND stripe_payment_intent_id = ${paymentIntentId}
        RETURNING id
      `);
      if (claimed.rows.length === 0) {
        const cur = await tx.execute(sql`SELECT status FROM service_bookings WHERE id = ${row.id}`);
        const status = ((cur.rows[0] as any)?.status ?? null) as string | null;
        return { promoted: false, diaryRows: 0, terminalStatus: status };
      }

      // Rulings 12/16/18: the money-path flip and its diary row are one atomic pair. Item-grained
      // when the claim carried a plan item, trip-grained (itemId NULL, ruling 16) otherwise; the
      // whole event is skipped for a booking with no trip (the log is trip-scoped by FK).
      let diaryRows = 0;
      if (row.tripId) {
        const itemId =
          typeof row.bookingDetails?.itineraryItemId === "string"
            ? (row.bookingDetails.itineraryItemId as string)
            : null;
        await logItemTransition(tx, {
          tripId: row.tripId,
          itemId,
          eventType: "checkout_payment_confirmed",
          fromStatus: "payment_pending",
          toStatus: "confirmed",
          actorType: diaryActorType(actor),
          actorId,
        });
        diaryRows = 1;
      }
      return { promoted: true, diaryRows, terminalStatus: null };
    });
  } catch (err) {
    logger.error(
      { err, bookingId: row.id, paymentIntentId, actor },
      "[checkout-promote] promotion transaction failed — booking left payment_pending for the next signal",
    );
    return { promoted: false, diaryRows: 0, terminalStatus: null };
  }
}

/**
 * RECONCILIATION EXCEPTION — a payment signal that could not be applied. Never a resurrection and
 * never silent. Three surfaces so it cannot be missed:
 *   • a `reconciliationException` object merged into `service_bookings.booking_details` (jsonb —
 *     no migration, no publish-push trap), which is the DB FACT the assertions and the admin
 *     endpoint read;
 *   • a trip-grained `checkout_reconcile_exception` diary row when the booking has a trip;
 *   • a logger.error carrying both ids.
 * The booking's `status` is deliberately UNTOUCHED: void wins after TTL (ruling 38 §15b).
 */
async function recordReconciliationException(
  row: CandidateRow,
  paymentIntentId: string,
  actor: PromotionActor,
  reason: string,
  result: PaymentPromotionResult,
): Promise<void> {
  logger.error(
    { bookingId: row.id, paymentIntentId, actor, reason, status: row.status },
    "[checkout-promote] RECONCILIATION EXCEPTION — a payment signal arrived for a booking that cannot be " +
      "promoted. The row is NOT resurrected. If the PaymentIntent really succeeded this is money that " +
      "needs a manual refund or a manual booking — see GET /api/admin/bookings/reconciliation-exceptions.",
  );
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE service_bookings
        SET booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
              'reconciliationException'::text, jsonb_build_object(
                'paymentIntentId'::text, ${paymentIntentId}::text,
                'actor'::text, ${actor}::text,
                'reason'::text, ${reason}::text,
                'status'::text, ${row.status ?? ""}::text,
                'detectedAt'::text, to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              )
            ),
            updated_at = NOW()
        WHERE id = ${row.id}
      `);
      if (row.tripId) {
        await logItemTransition(tx, {
          tripId: row.tripId,
          itemId:
            typeof row.bookingDetails?.itineraryItemId === "string"
              ? (row.bookingDetails.itineraryItemId as string)
              : null,
          eventType: "checkout_reconcile_exception",
          fromStatus: row.status ?? null,
          toStatus: row.status ?? null,
          actorType: diaryActorType(actor),
          actorId: null,
        });
        result.diaryRows += 1;
      }
    });
  } catch (err) {
    logger.error(
      { err, bookingId: row.id, paymentIntentId },
      "[checkout-promote] failed to RECORD the reconciliation exception (the log line above is the surviving trace)",
    );
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
