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
import { serviceBookings, providerServices, users } from "@shared/schema";
import { logItemTransition } from "./item-transition-log.service";
import { markItemPurchased } from "./item-routing.service";
// Ledger `2026-09-18-concierge-handoff`: mirrors the D6 rails-fee catch-up below — the recovery
// twin of `payments.routes.ts` `promoteAuthorizedCheckout`'s own hand-off call, for the window
// only a payment SIGNAL can reach (server died between authorization and the primary write).
import { createHandoffRequestsForBooking } from "./concierge-handoff.service";
import { logger } from "../infrastructure/logger";
import { paidRevenueAmount, paidTransitionRowFromSql, recordPaidRevenueEvent } from "./funnel-revenue.service";
import { stampPaidCharge } from "./payment-on-record";
import {
  isCanonicalBookingEmailPersistenceError,
  persistCanonicalBookingConfirmation,
} from "./canonical-booking-email.service";
import { runBackgroundJob } from "./background-job-runner";
import { jitteredStartupDelay } from "./startup-delay";
import { getStripeSecretKey } from "../utils/stripe-key";
// Ruling 11 (ledger `2026-09-08-rulings-11-12`): the plan-work advisor grant, taken at the
// authorization stamp below. ONE implementation, which itself calls the ONE author of
// `trip_expert_advisors` (`upsertTripAdvisorRow`) — never a second insert site (LD 32).
import { grantPlanWorkAdvisorAccess } from "./plan-work-access.service";

/** Ratified TTL (decision-maker, ruling 38) — stated ONCE in shared/checkout-hold.ts, which help
 *  article 8 also reads; re-exported here for this module's existing importers. */
import { CHECKOUT_CLAIM_TTL_MINUTES, STALE_AUTHORIZED_CLAIM_HOURS } from "@shared/checkout-hold";
export { CHECKOUT_CLAIM_TTL_MINUTES, STALE_AUTHORIZED_CLAIM_HOURS };

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
 * ─── VACATION-MODE PRE-FLIGHT GUARD (provider back-office wave, decision-maker ratified Aug 9
 * 2026 — `users.vacationUntil`/`vacationMessage`, migration 189) ───────────────────────────────
 *
 * Thrown by `assertServiceOwnerNotAway` when the booked service's owner is away. Message is the
 * ratified honest-error copy: "This provider is away until <date>".
 */
export class ProviderAwayError extends Error {
  constructor(public readonly until: Date) {
    super(`This provider is away until ${until.toISOString().slice(0, 10)}`);
    this.name = "ProviderAwayError";
  }
}

/**
 * Rejects when the owner of `serviceId` (a `provider_services.id`) currently has vacation mode
 * ON (`vacationUntil` non-null AND in the future — the same predicate GET /api/me/vacation and
 * the storefront/advisor surfaces use). Resolves normally (no throw) when the owner is not away,
 * when `serviceId` is absent (the documented transport-commerce NULL-`service_id` exception —
 * CLAUDE.md "Transport-commerce exception"), or when no owner can be resolved (§13: never
 * guessed — an unresolvable owner fails open rather than blocking checkout on a data gap).
 *
 * GOVERNING CONSTRAINT: business-level flag only. Reads `provider_services.userId` to find the
 * owner and `users.vacationUntil`; never reads, writes, or references `provider_services`
 * status/approval or any other row field — the listing itself is completely untouched.
 *
 * INTENDED CALL SITE (integration note — outside this file's ownership for this change): the
 * §15 CLAIM step's per-item loop in `POST /api/checkout` (server/routes/payments.routes.ts,
 * the "Step A: Create booking as payment_pending BEFORE charging Stripe" block), called with
 * `item.serviceId` immediately BEFORE `storage.createServiceBooking(...)` for that item, so a
 * blocked item never reaches the DB claim at all. Catch `ProviderAwayError` there and surface
 * `err.message` to the client (the same "known configuration errors" pass-through pattern that
 * route already uses for `resolveCoordinationFee`-style errors) rather than the generic
 * "Checkout failed" 500. Wiring that call is a payments.routes.ts change and is left to the
 * integrator — this module supplies the guard, fully implemented and independently callable
 * (see server/__tests__ or a scratch script driving it directly against a live DB).
 *
 * SURGICAL, NOT A SPINE CHANGE: this function is net-new and is not called by anything else in
 * this module — `markStripeAttempt`/`stampAuthorization`/`promotePaidCheckout` and the §15
 * atomic-conditional claim/authorize/promote spine are byte-for-byte unchanged. The atomic claim
 * remains the ONLY concurrency guard on inventory/money.
 *
 * WHY NO POST-CLAIM RE-CHECK (documented per the ratification): this is a PRE-FLIGHT COURTESY,
 * not a money invariant. A race where a provider flips vacation mode ON in the narrow window
 * between this check passing and the claim landing lets that one booking through — accepted
 * deliberately. Vacation mode is a demand valve (reduce new inbound while away), not a §15
 * money-safety invariant: adding a post-claim re-check would mean either voiding an
 * already-claimed row outside the sweep's documented void conditions (§15b — only an
 * unattempted, unmarked row is safe to void with no Stripe call) or introducing a second writer
 * on the claim's state machine, both worse than accepting the rare race. Confirmed bookings are
 * never touched by this or any vacation-mode surface.
 */
export async function assertServiceOwnerNotAway(serviceId: string | null | undefined): Promise<void> {
  if (!serviceId) return;

  const [service] = await db
    .select({ ownerId: providerServices.userId })
    .from(providerServices)
    .where(eq(providerServices.id, serviceId))
    .limit(1);
  if (!service?.ownerId) return;

  const [owner] = await db
    .select({ vacationUntil: users.vacationUntil })
    .from(users)
    .where(eq(users.id, service.ownerId))
    .limit(1);
  if (owner?.vacationUntil && owner.vacationUntil.getTime() > Date.now()) {
    throw new ProviderAwayError(owner.vacationUntil);
  }
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
 *
 * ── RULING 11 (ledger `2026-09-08-rulings-11-12`, lane `2026-09-15-plan-work-one-rail`) ──────
 * PLAN WORK SOLD AS A LISTING GRANTS ACCESS AT CHECKOUT, and the ruling puts that write HERE: on
 * authorization, inside the booking's own transaction. So the advisor row and the PaymentIntent
 * stamp commit or roll back TOGETHER — a claim the TTL sweep won never grants anyone anything.
 *
 * It is ONE MORE CALLER of the ONE author (`upsertTripAdvisorRow`), reached through
 * `grantPlanWorkAdvisorAccess`; there is no second insert site and no second copy of the "is this
 * plan work?" decision (§18 rule 1 — the class is `impactClassFor`'s, read off the booking's own
 * `offering_contract_snapshot`). Ruling 12's twin needs no code at all: a CONSULT booking is
 * classified as such and the grant simply does not fire for it.
 *
 * The grant NEVER THROWS and never fails the stamp (§15b — an ancillary effect may not break the
 * operation that authorizes it; each upsert is savepointed inside the helper), so this function's
 * own contract — true iff every row was claimed — is byte-identical to before.
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
      // Ruling 11, inside the same transaction as the stamp it depends on. Reads each row's own
      // committed snapshot (never the live listing) and grants only where the booking names a plan.
      await grantPlanWorkAdvisorAccess(tx, bookingIds);
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

// ── THE TRANSPORT RAIL'S STAMP (punchlist R-1, ledger `2026-09-14-transport-confirm-stamps-pi`) ──
//
// WHY IT IS HERE AND NOT IN `stripe.service.ts`. §19a makes this module the SOLE writer of
// `service_bookings.stripe_payment_intent_id`; a second UPDATE site for that column anywhere else
// is the violation, not a convenience. The transport rail needed one and had none: hosted-Checkout
// confirmation wrote `confirmationCode: session.id` and nothing else, so a paid transport booking
// reached `confirmed` with the column NULL — after which `POST /api/bookings/:id/cancel` gated its
// refund on `!!booking.stripePaymentIntentId` and went status-only on a refund that was owed, and
// the drift job raised `booking_confirmed_no_pi` at CRITICAL for a row whose only sin was that
// nobody had recorded the id.
//
// WHY IT IS NOT `stampAuthorization`. That one's from-state is the CART claim's
// `payment_pending` + NULL — the unauthorized-claim predicate §15b/§18b keep as one machine's
// property. A transport row is born `pending` (see `createTransportBookingCheckout`) and never
// enters that state, so `stampAuthorization` would match zero rows and silently do nothing. Same
// column, same discipline, a DIFFERENT from-state list — so the list is declared by name here,
// beside the one statement that reads it, exactly as the promotion's own list is (§18 rule 1).
//
// PROVENANCE (§17b). The only caller is `handleStripePaymentSuccess`, reached from the
// signature-verified `checkout.session.completed` delivery, and the id it passes is read off a
// session this server RE-RETRIEVED from Stripe with the platform's own secret key. Stripe's word
// twice over; no request body reaches this function and it takes no id from one (N17c's posture).

/**
 * The states a transport row may be stamped FROM. Declared once, read once.
 *
 * `pending` is the birth state and the ordinary case: the stamp runs BEFORE the status promotion,
 * so a process death between the two leaves a `pending` row carrying its PaymentIntent — which is
 * a state the `paid-service-bookings-have-payment-intent` invariant tolerates and a replay
 * promotes — rather than the `confirmed`-with-no-id row this lane exists to stop creating.
 *
 * `confirmed` is the CATCH-UP case, and it is a recovery, never a backfill: it admits a redelivery
 * for a row an earlier signal already promoted (including one confirmed before this lane existed).
 * Nothing is invented — the id still comes from Stripe's own record of THAT session.
 *
 * The terminal states are absent, for the V-8 reason one table over: a cancelled, refunded, failed
 * or expired row has left the promotable set, and quietly attaching a PaymentIntent to it would
 * change what `refundServiceBooking` and the drift job say about money on a row a human has
 * already moved. A refusal is REPORTED to the caller and logged there (§17: detect, don't repair).
 */
export const TRANSPORT_PI_STAMPABLE_FROM = ["pending", "confirmed"] as const;

export interface TransportStampResult {
  /** This call wrote the id. */
  stamped: boolean;
  /** The row already carried THIS id — an idempotent replay wrote nothing. */
  alreadyStamped: boolean;
  /** Why nothing was written, when neither of the above holds. `null` otherwise. */
  refusedReason: "booking_absent" | "not_stampable_status" | "different_payment_intent" | null;
  /** The row's status as read back on a refusal — the fact, never a guess (§13). */
  status: string | null;
  /** The id the row already carries on a `different_payment_intent` refusal. */
  existingPaymentIntentId: string | null;
}

/**
 * Records `paymentIntentId` on ONE transport booking with a §15 atomic conditional: the UPDATE
 * carries both guards (`stripe_payment_intent_id IS NULL` and the from-state list) so the statement
 * IS the concurrency guard, never a check-then-write. The read-back below runs only to say WHY
 * nothing was written — it is the error message, not the decision.
 *
 * Idempotent by construction: the second delivery of the same session matches zero rows on the
 * NULL predicate and reports `alreadyStamped`, so a replay writes nothing and overwrites nothing.
 */
export async function stampTransportPaymentIntent(
  bookingId: string,
  paymentIntentId: string,
): Promise<TransportStampResult> {
  const [stamped] = await db
    .update(serviceBookings)
    .set({ stripePaymentIntentId: paymentIntentId, updatedAt: new Date() })
    .where(
      and(
        eq(serviceBookings.id, bookingId),
        isNull(serviceBookings.stripePaymentIntentId),
        inArray(serviceBookings.status, [...TRANSPORT_PI_STAMPABLE_FROM]),
      ),
    )
    .returning({ id: serviceBookings.id });

  if (stamped) {
    return { stamped: true, alreadyStamped: false, refusedReason: null, status: null, existingPaymentIntentId: null };
  }

  const [current] = await db
    .select({ status: serviceBookings.status, existing: serviceBookings.stripePaymentIntentId })
    .from(serviceBookings)
    .where(eq(serviceBookings.id, bookingId))
    .limit(1);

  if (!current) {
    return {
      stamped: false,
      alreadyStamped: false,
      refusedReason: "booking_absent",
      status: null,
      existingPaymentIntentId: null,
    };
  }
  if (current.existing === paymentIntentId) {
    return {
      stamped: false,
      alreadyStamped: true,
      refusedReason: null,
      status: current.status ?? null,
      existingPaymentIntentId: current.existing,
    };
  }
  if (current.existing) {
    return {
      stamped: false,
      alreadyStamped: false,
      refusedReason: "different_payment_intent",
      status: current.status ?? null,
      existingPaymentIntentId: current.existing,
    };
  }
  return {
    stamped: false,
    alreadyStamped: false,
    refusedReason: "not_stampable_status",
    status: current.status ?? null,
    existingPaymentIntentId: null,
  };
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
  /** Lane 7 (ruling 72): present when this row is a deposit line — the amount its RE-DRIVE charges
   *  now (the deposit, not the full line), so a re-driven deposit checkout cannot charge the total. */
  depositAmount: string | null;
  /** Ruling 2026-09-02-traveler-fee-applies-everywhere: the traveler service fee CHARGED on this
   *  row (0 when the line was covered). Held in booking_details, NOT total_amount, so the re-drive
   *  must read it here to charge the SAME amount the first attempt would have (§14, no divergence). */
  travelerFeeCharged: string | null;
  /** Ledger 2026-09-08-cart-fee-line: the part of platform_fee the TRAVELER paid (the concierge
   *  fee). NULL ⇒ this row was claimed BEFORE that ruling and was charged its whole platform_fee;
   *  `travelerChargeForRow` reads the two cases apart, so a re-drive of an old claim still charges
   *  what the first attempt would have (§13 — presence is the discriminator, there is no backfill). */
  travelerChargeConciergeFee: string | null;
}>> {
  const rows = await db.execute(sql`
    SELECT id, status, stripe_payment_intent_id, total_amount, platform_fee, deposit_amount, idempotency_key,
           booking_details->'travelerServiceFee'->>'charged' AS traveler_fee_charged,
           booking_details->'travelerCharge'->>'conciergeFee' AS traveler_charge_concierge_fee
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
    depositAmount: r.deposit_amount == null ? null : String(r.deposit_amount),
    travelerFeeCharged: r.traveler_fee_charged == null ? null : String(r.traveler_fee_charged),
    travelerChargeConciergeFee:
      r.traveler_charge_concierge_fee == null ? null : String(r.traveler_charge_concierge_fee),
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
  const key = getStripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_TEST) unset — cannot consult Stripe");
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
 * RELEASE-ALL-NIGHTS hotfix (§18b-class defect, confirmed by the S11 design lane).
 *
 * THE BUG: a multi-night room stay claims ONE `vendor_availability_slots` row PER NIGHT (all-or-
 * nothing, `payments.routes.ts`'s C3 claim loop) but historically stamped only the FIRST night's
 * id onto the booking's `slotId` column (`firstNightSlotId` — "one representative id", by
 * design, for every OTHER consumer that expects a booking to carry at most one slot). Every
 * release path (this module's `voidClaim`, `refundServiceBooking`, `updateServiceBookingStatus`)
 * released only `slotId` — nights 2..N leaked `booked_count` permanently, with no code path in
 * the repo to return it.
 *
 * THE FIX: the claim spine now ALSO writes `bookingDetails.claimedSlotIds` — the complete
 * per-night list — at claim time (payments.routes.ts). `slotId` is UNCHANGED (still the first
 * night, for full backward compatibility with every other consumer keyed on it). This helper is
 * the ONE place that decides what to release: the full list when present, else the single
 * `slotId` — so a PRE-FIX row (no `claimedSlotIds` in its `bookingDetails`) releases EXACTLY as
 * it always did, and a POST-FIX row releases every night. All three release paths call this
 * function so they cannot drift from each other.
 */
export function deriveClaimedSlotIds(
  bookingDetails: Record<string, unknown> | null | undefined,
  slotId: string | null | undefined,
): string[] {
  const claimed = bookingDetails?.["claimedSlotIds"];
  if (Array.isArray(claimed) && claimed.length > 0 && claimed.every((id) => typeof id === "string" && id)) {
    return claimed as string[];
  }
  return slotId ? [slotId] : [];
}

/**
 * V-26 (ledger `2026-09-15-v26-slot-units`): the `booking_details` key a slot-bound checkout claim
 * stamps to record HOW MANY units of capacity it took on EACH slot in `claimedSlotIds` (or on the
 * single `slotId`, for a line that claims one slot).
 *
 * It is a record of the CLAIM, not a copy of the price. `booking_details.quantity` is the cart
 * line's unit count — what `resolveItemBaseAmount` multiplied by — and for a row born BEFORE this
 * lane it is NOT what was claimed: `bookSlot` took exactly one unit whatever the line held, so a
 * pre-fix booking carrying `quantity: 3` holds ONE unit of that slot. Releasing three would hand
 * back capacity nobody took — V-26's defect in the other direction — which is why the release
 * reads this key and not that one.
 */
export const CLAIMED_SLOT_UNITS_KEY = "claimedSlotUnits";

/**
 * How many units of capacity to give back PER SLOT for one booking.
 *
 * §13 — ABSENT MEANS ONE, AND THAT IS A RECORDED FACT, NOT A GUESS. A row with no
 * `claimedSlotUnits` was claimed by the pre-V-26 writer, which took exactly one unit per slot; a
 * row whose value is not a positive integer is equally un-trustworthy as a claim record. Both
 * release ONE — never guess more than was recorded. (A stay is unaffected either way: it claims
 * one slot PER NIGHT and stamps `1`, so its per-night release is unchanged.)
 *
 * ONE decider, every release path a caller (§18 rule 1) — `voidClaim` here,
 * `refundServiceBooking` and `updateServiceBookingStatus` — exactly as `deriveClaimedSlotIds`
 * decides WHICH slots for all three, so the two halves of a release can never drift apart.
 */
export function deriveClaimedSlotUnits(
  bookingDetails: Record<string, unknown> | null | undefined,
): number {
  const recorded = bookingDetails?.[CLAIMED_SLOT_UNITS_KEY];
  if (typeof recorded === "number" && Number.isInteger(recorded) && recorded > 0) return recorded;
  return 1;
}

/**
 * The refusal §15/C3 asks for: a slot claim/release is meaningless for a non-positive or
 * fractional unit count, so the writers REFUSE it by name rather than defaulting silently to 1
 * (§13 — a caller that computed nonsense must hear about it, not have it quietly rounded into a
 * real inventory movement). Exported so `server/storage.ts`'s two writers and any future caller
 * share ONE rule (§18 rule 1).
 */
export function assertPositiveSlotUnits(units: number, caller: string): void {
  if (typeof units !== "number" || !Number.isInteger(units) || units <= 0) {
    throw new Error(
      `${caller}: slot units must be a positive integer, received ${String(units)} (V-26 — a claim is refused, never clamped)`,
    );
  }
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
 *
 * RELEASE-ALL-NIGHTS hotfix: releases the FULL `deriveClaimedSlotIds` set (every night of a
 * multi-night stay), not just `row.slotId` (the first night). Still ONE UPDATE, still inside this
 * same transaction, still gated by the SAME claimed-rows==0 guard above — a stay's whole set of
 * slots is released iff (and only iff) this call actually won the void race, exactly as the
 * single-slot case always worked.
 */
async function voidClaim(
  row: ProvisionalClaimRow,
  reason: "never_attempted" | "stripe_has_no_intent" | "stripe_canceled" | "stale_unpaid",
  /**
   * R164 (G2): a STAMPED claim is voided only while it still carries THIS PaymentIntent, in the same
   * statement — the promotion's own predicate (`status='payment_pending' AND
   * stripe_payment_intent_id=<pi>`), so a promote and a void on the same row can never both win
   * (§15b rule 1). Omitted ⇒ the unstamped-claim predicate, unchanged.
   */
  stampedPaymentIntentId?: string,
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
          AND ${stampedPaymentIntentId ? sql`stripe_payment_intent_id = ${stampedPaymentIntentId}` : sql`stripe_payment_intent_id IS NULL`}
        RETURNING id
      `);
      if (claimed.rows.length === 0) {
        // Someone else won the race (a late authorization stamped it, or a previous pass already
        // expired it). Idempotent no-op — critically, NO slot release happens on this path.
        return { voided: false, slotsReleased: 0, diaryRows: 0 };
      }

      let slotsReleased = 0;
      const slotIdsToRelease = deriveClaimedSlotIds(row.bookingDetails, row.slotId);
      // V-26: how many units each of those slots holds — the claim's own record, not the line's
      // priced quantity (see `deriveClaimedSlotUnits`). The void PREDICATE above is untouched:
      // this changes only the size of the give-back, never who wins the race (§15b/§15c).
      const slotUnitsToRelease = deriveClaimedSlotUnits(row.bookingDetails);
      if (slotIdsToRelease.length > 0) {
        await tx.execute(sql`
          UPDATE vendor_availability_slots
          SET booked_count = GREATEST(COALESCE(booked_count, 0) - ${slotUnitsToRelease}, 0),
              status = CASE
                WHEN status = 'fully_booked'
                     AND GREATEST(COALESCE(booked_count, 0) - ${slotUnitsToRelease}, 0) < COALESCE(capacity, 1)
                  THEN 'available'
                ELSE status
              END,
              updated_at = NOW()
          WHERE id IN (${sql.join(slotIdsToRelease.map((id) => sql`${id}`), sql`, `)})
        `);
        slotsReleased = slotIdsToRelease.length;
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
export type PromotionActor = "webhook" | "client" | "reconciliation" | "checkout" | "sweep";

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
function diaryActorType(actor: PromotionActor): "webhook" | "reconciliation" | "traveler" | "system" {
  if (actor === "webhook") return "webhook";
  if (actor === "reconciliation") return "reconciliation";
  // R164 (G2): the stale-intent sweep promotes a claim it found PAID when it read Stripe. Recorded as
  // the system, never as the traveler (§13: the diary says who moved it). NOT server-verified for
  // ordering 1 — the rows it promotes are already stamped, so it never needs to stamp anything.
  if (actor === "sweep") return "system";
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
  /** R162: present when this success landed on `failed` booking(s) — the automatic refund's outcome. */
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
  /** Lane 7 (ruling 72): a deposit-partial booking carries an outstanding balance; when the PI being
   *  promoted is the DEPOSIT PI, the promotion lands the row in `deposit_paid`, not `confirmed`. */
  balanceAmount: string | null;
  balancePaid: boolean | null;
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
    balanceAmount: r.balance_amount == null ? null : String(r.balance_amount),
    balancePaid: r.balance_paid ?? null,
  };
}

const CANDIDATE_COLUMNS = sql`id, trip_id, status, stripe_payment_intent_id, booking_details, traveler_id, idempotency_key, balance_amount, balance_paid`;

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

  // ── R162: A SUCCESS ON A `failed` BOOKING IS NEVER PROMOTED — AND IS NOT REFUNDED HERE ───────
  // `failed` is final (TERMINAL_UNPROMOTABLE above: the exception is already recorded). The late-
  // success REFUND lives on the WEBHOOK path only (`handlePaymentSucceeded` →
  // `refundLateSuccessOnFailedIntent`), by decision-maker ruling Sep 27, 2026: this function is the
  // ONE confirm for every caller (client confirm-payment, one-click, the webhook, the drift job), and
  // a refund reachable from here would reach the drift job, which CLAUDE.md §17 keeps DETECT-ONLY.
  // Stripe delivers `payment_intent.succeeded` whichever way the traveler paid, so the webhook
  // always hears it; this function only confirms.

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

  // ── Ledger `2026-09-18-concierge-handoff`, retried from here ────────────────────────────────
  // Mirrors the D6 rails-fee catch-up immediately below: the primary path
  // (`payments.routes.ts` `promoteAuthorizedCheckout`) runs this on the normal path; this covers
  // the window only a payment SIGNAL can reach — a server that died between the authorization
  // stamp and that write. `createHandoffRequestsForBooking` is idempotent by its own partial
  // UNIQUE (§15), so a double call here and there lands exactly the same rows once.
  for (const id of [...result.promoted, ...result.lateAuthorized]) {
    await createHandoffRequestsForBooking(id).catch((err) =>
      logger.error({ err, bookingId: id }, "[checkout-promote] concierge hand-off catch-up failed (booking stands)"),
    );
  }

  // ── D6 (ruling 61): the rails fee EVENT, retried from here ──────────────────────────────────
  // The inline post-authorization write (`payments.routes.ts`) is the normal path; this covers the
  // window only a payment SIGNAL can reach — a server that died between the authorization stamp and
  // that write, where the booking is paid and nothing recorded the fee event. Same shared function,
  // same per-booking key, `ON CONFLICT DO NOTHING`: a double signal is a no-op, never a second row
  // and never a second waiver. §15c rule 4 holds — this is not a money move and re-runs none of
  // `promoteAuthorizedCheckout`'s non-idempotent effects; it is a recording, in the same idempotent
  // class as the `markItemPurchased` catch-up above. Best-effort: the booking is the money truth.
  if (result.promoted.length > 0 || result.lateAuthorized.length > 0) {
    try {
      const { recordRailsFeeLedger } = await import("./fee-ledger.service");
      await recordRailsFeeLedger({
        bookingIds: Array.from(new Set([...result.promoted, ...result.lateAuthorized])),
        stripePaymentRef: paymentIntentId,
        actor: `promotion:${actor}`,
      });
    } catch (err) {
      logger.error(
        { err, paymentIntentId, actor },
        "[checkout-promote] rails fee-ledger catch-up failed (booking stands; append is idempotent and retried by any later signal)",
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
  // ── Lane 7 (ruling 72): DEPOSIT-AWARE TARGET, derived from the ROW, never from a caller ────────
  // The PI being promoted here is the row's server-stamped `stripe_payment_intent_id` — for a
  // deposit-partial booking that is the DEPOSIT PI. When the row carries an outstanding balance the
  // deposit payment lands it in `deposit_paid` (NOT `confirmed`): distinguishable by construction
  // from a full-paid booking, and OUTSIDE every paid-equivalent / completion-eligible status set, so
  // no earning releases until the balance is paid and the row flips to `confirmed`. A non-deposit
  // booking (no `balance_amount`) is byte-identical to before: target `confirmed` (§13).
  const hasOutstandingBalance =
    row.balanceAmount != null && parseFloat(row.balanceAmount) > 0 && row.balancePaid !== true;
  const targetStatus = hasOutstandingBalance ? "deposit_paid" : "confirmed";
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        UPDATE service_bookings
        SET status = ${targetStatus},
            confirmed_at = ${hasOutstandingBalance ? sql`confirmed_at` : sql`NOW()`},
            deposit_paid = ${hasOutstandingBalance ? sql`true` : sql`deposit_paid`},
            stripe_deposit_intent_id = ${hasOutstandingBalance ? sql`${paymentIntentId}` : sql`stripe_deposit_intent_id`},
            deposit_amount = ${hasOutstandingBalance ? sql`COALESCE(deposit_amount, ROUND((total_amount + COALESCE(platform_fee, 0)) - balance_amount, 2))` : sql`deposit_amount`},
            updated_at = NOW()
        WHERE id = ${row.id}
          AND status = 'payment_pending'
          AND stripe_payment_intent_id = ${paymentIntentId}
        RETURNING id, traveler_id, trip_id, total_amount, platform_fee, deposit_amount, balance_amount,
                  booking_details
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
          // A deposit payment is honestly a DIFFERENT event than a full confirm — a later reader must
          // not see "confirmed" for a booking that only paid its deposit (§13).
          eventType: hasOutstandingBalance ? "checkout_deposit_paid" : "checkout_payment_confirmed",
          fromStatus: "payment_pending",
          toStatus: targetStatus,
          actorType: diaryActorType(actor),
          actorId,
        });
        diaryRows = 1;
      }
      // PAYMENT ON RECORD (ledger `2026-09-28-no-payment-no-earnings`): the winning flip stamps
      // `booking_details.paidCharge` in THIS transaction — not a savepoint, so a failed stamp rolls
      // the flip back and a paid row can never read as unpaid to the earning paths.
      const paidRow = paidTransitionRowFromSql(claimed.rows[0]);
      const stamp = await stampPaidCharge(tx, row.id, targetStatus, paidRevenueAmount(targetStatus, paidRow));
      // T6 revenue is recorded HERE, by the winning flip and inside its transaction, so a paid
      // transition has exactly one event and an unpaid row has none (ledger
      // `2026-09-27-funnel-revenue-on-paid`). Derived from the stamp; savepointed, never throws (§15b).
      await recordPaidRevenueEvent(tx, stamp, paidRow);
      await persistCanonicalBookingConfirmation(tx, {
        bookingId: row.id,
        paymentIntentId,
        leg: hasOutstandingBalance ? "deposit" : "full",
        paidCharge: stamp,
      });
      return { promoted: true, diaryRows, terminalStatus: null };
    });
  } catch (err) {
    logger.error(
      { err, bookingId: row.id, paymentIntentId, actor },
      "[checkout-promote] promotion transaction failed — booking left payment_pending for the next signal",
    );
    if (isCanonicalBookingEmailPersistenceError(err)) throw err;
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

// ══ THE FAILURE LEG — ONE payment-failed flip, TWO callers (ledger `2026-09-27-platform-payment-failed`, R161) ══
//
// §15c made the SUCCESS side one implementation with two callers (`promotePaidCheckout`). The
// FAILURE side was left behind: the ONLY code that moved a cart checkout's `service_bookings` row
// to `failed` sat inline in the CONNECT endpoint (`POST /api/webhooks/stripe`,
// STRIPE_CONNECT_WEBHOOK_SECRET). A cart checkout's PaymentIntent is a PLATFORM PaymentIntent, and
// Stripe delivers platform PI events to the PLATFORM endpoint (`POST /api/bookings/webhooks/stripe`
// → `stripePaymentService.handlePaymentFailed`), which updated the LEGACY `bookings` table by the
// `metadata.bookingIds` it was handed — `service_bookings` ids, so it matched nothing, exactly the
// disjoint-id-space failure §15c fixed one event over. A declined card therefore left the booking
// at `payment_pending` until the TTL sweep expired it, and "Payment didn't go through" never showed.
//
// Both endpoints now call THIS function. Rules that must not be weakened:
//   1. The flip is an ATOMIC CONDITIONAL keyed on the row's OWN server-stamped PaymentIntent id
//      (`WHERE stripe_payment_intent_id = <pi> AND status = 'payment_pending'`). A redelivery, or
//      the same event reaching BOTH endpoints, flips each row exactly once; the loser matches zero.
//   2. It never demotes: a row already `confirmed` (or `expired`, `cancelled`, …) is not
//      `payment_pending` and is untouched. A late failure after a promotion moves nothing.
//   3. The traveler email is sent ONLY for rows THIS call flipped (the RETURNING set), so it is
//      exactly-once for the same reason the flip is. Best-effort; it never fails the flip.
//   4. It keys on the PI id only — it does NOT resolve rows from `metadata.bookingIds`. An
//      unstamped claim (server died mid-authorization) stays the TTL sweep's to reconcile against
//      Stripe (§15b); a failure signal is not licence to touch a row that never carried this PI.
//   5. It does NOT touch the legacy `bookings` table. That rail is still live and its own caller
//      keeps its own update (§15c: both rails run, each no-ops on ids it does not own).

export type PaymentFailedActor = "platform_webhook" | "connect_webhook";

export interface PaymentFailedResult {
  /** `service_bookings` ids THIS call moved `payment_pending → failed`. */
  failedBookingIds: string[];
}

type PaymentFailedEmailSender = (params: {
  toEmail: string;
  userName: string | null;
  bookingTitle: string | null;
}) => Promise<void>;

/**
 * @param sendEmail test seam only — defaults to `email.service`'s `sendPaymentFailedEmail`.
 */
export async function markCheckoutPaymentFailed(opts: {
  paymentIntentId: string;
  actor: PaymentFailedActor;
  sendEmail?: PaymentFailedEmailSender;
}): Promise<PaymentFailedResult> {
  const { paymentIntentId, actor } = opts;
  const result: PaymentFailedResult = { failedBookingIds: [] };
  if (!paymentIntentId) return result;

  // The payment_intents ledger row, where one exists (not every PI flow writes one). Non-fatal.
  try {
    await db.execute(sql`
      UPDATE payment_intents SET status = 'failed' WHERE stripe_payment_intent_id = ${paymentIntentId}
    `);
  } catch (err: any) {
    logger.warn({ paymentIntentId, actor, err: err?.message }, "[payment-failed] payment_intents update failed (non-fatal)");
  }

  // The flip. Throws on a DB error so the caller decides (the platform rail lets Stripe retry).
  const flipped = await db.execute(sql`
    UPDATE service_bookings
    SET status     = 'failed',
        updated_at = NOW()
    WHERE stripe_payment_intent_id = ${paymentIntentId}
      AND status = 'payment_pending'
    RETURNING id, traveler_id, service_id
  `);
  const rows = (flipped.rows ?? []) as Array<{ id: string; traveler_id: string | null; service_id: string | null }>;
  result.failedBookingIds = rows.map((r) => r.id);
  if (rows.length === 0) return result;

  logger.info(
    { paymentIntentId, actor, bookingIds: result.failedBookingIds },
    `[payment-failed] marked ${rows.length} service_booking(s) failed`,
  );

  // Best-effort traveler email, ONLY for rows this call flipped (rule 3).
  let sendEmail = opts.sendEmail;
  for (const r of rows) {
    if (!r.traveler_id) continue;
    try {
      const detail = await db.execute(sql`
        SELECT u.email, u.first_name, u.last_name, ps.service_name AS title
        FROM users u
        LEFT JOIN provider_services ps ON ps.id = ${r.service_id}
        WHERE u.id = ${r.traveler_id}
        LIMIT 1
      `);
      const row = detail.rows?.[0] as any;
      if (!row?.email) continue;
      if (!sendEmail) {
        sendEmail = (await import("./email.service")).sendPaymentFailedEmail;
      }
      sendEmail({
        toEmail: row.email,
        userName: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
        bookingTitle: row.title ?? null,
      }).catch((e: any) => logger.error({ bookingId: r.id, err: e?.message }, "[payment-failed] email send error"));
    } catch (mailErr: any) {
      logger.error({ bookingId: r.id, err: mailErr?.message }, "[payment-failed] email resolve error");
    }
  }
  return result;
}

// ══ R162 — `failed` IS FINAL (ledger `2026-09-27-failed-is-final`; decision-maker, Sep 27, 2026) ══
//
// A Stripe `payment_intent.payment_failed` is NOT terminal: the same PaymentIntent returns to
// `requires_payment_method` and can still succeed. The platform's `failed` IS terminal — it is in
// TERMINAL_UNPROMOTABLE and never goes back to `confirmed` (option 1, "failed then confirmed", was
// refused: every reader would have to handle the transition, and "your payment failed" silently
// followed by "actually it went through" is how double bookings and confused refunds start). Three
// pieces make the two agree:
//   1. `cancelStalePaymentIntent` — "Try again" mints the NEW PaymentIntent first, then cancels the
//      OLD one, then opens checkout (`retireStalePaymentIntentsForCheckout`, called by the checkout
//      authorization). The first place the platform cancels a PaymentIntent.
//   2. Every confirm path already refuses a PI that is not the booking's CURRENT stamped one
//      (`promoteOneBooking`'s WHERE, `confirm-payment`'s pre-check), and a `failed` row is never
//      promotable; the same-key re-POST no longer hands back a PI whose booking is terminal
//      (`isTerminalUnpromotable`, read by `POST /api/checkout`).
//   3. `refundLateSuccessOnFailedIntent` — if the OLD intent succeeds anyway, the booking stays
//      `failed`, the success is a reconciliation exception, and the traveler is refunded
//      automatically, exactly once, whichever path hears about it.

/** True for a booking status the promotion refuses — a PI stamped on such a row is dead to us. */
export function isTerminalUnpromotable(status: string | null | undefined): boolean {
  return status != null && TERMINAL_UNPROMOTABLE.has(status);
}

export const LATE_SUCCESS_REFUND_KEY = "lateSuccessRefund";
export const lateSuccessRefundIdempotencyKey = (paymentIntentId: string) => `late-success-refund-${paymentIntentId}`;
export const cancelStalePaymentIntentIdempotencyKey = (paymentIntentId: string) => `cancel-stale-pi-${paymentIntentId}`;

/** Stripe statuses a PaymentIntent must NEVER be cancelled from: money is moving or has moved. */
const NEVER_CANCEL_PI_STATUSES = new Set(["processing", "succeeded"]);

export type CancelStaleOutcome =
  | { outcome: "canceled"; status: string }
  | { outcome: "already_canceled"; status: string }
  /** Stripe reports `processing` or `succeeded` — cancelling is refused; the caller must not open a retry. */
  | { outcome: "not_cancellable"; status: string }
  /** Stripe could not be consulted or refused the cancel. Nothing is known to have changed. */
  | { outcome: "error"; message: string };

/**
 * R162 — cancel a PaymentIntent the platform has given up on. Reads Stripe's own status FIRST and
 * never cancels an intent that is `processing` or `succeeded`; an already-`canceled` intent is a
 * no-op; everything else is cancelled with `cancellation_reason: 'abandoned'` under a PI-derived
 * idempotency key, so a retry is the same single cancel. Never throws. Reused by the G2 sweep.
 */
export async function cancelStalePaymentIntent(opts: {
  paymentIntentId: string;
  /** Carried into every log line (the booking(s) and the new PI, when there is one). */
  context?: Record<string, unknown>;
}): Promise<CancelStaleOutcome> {
  const { paymentIntentId } = opts;
  const ctx = { paymentIntentId, ...(opts.context ?? {}) };
  const { stripePaymentService } = await import("./stripe-payment.service");
  let status: string;
  try {
    status = (await stripePaymentService.retrievePaymentIntentFacts(paymentIntentId)).status;
  } catch (err: any) {
    logger.error({ ...ctx, err: err?.message }, "[stale-pi] could not read the PaymentIntent — nothing cancelled");
    return { outcome: "error", message: err?.message ?? String(err) };
  }
  if (status === "canceled") return { outcome: "already_canceled", status };
  if (NEVER_CANCEL_PI_STATUSES.has(status)) {
    logger.warn({ ...ctx, status }, "[stale-pi] PaymentIntent is processing/succeeded — NOT cancelled");
    return { outcome: "not_cancellable", status };
  }
  try {
    const res = await stripePaymentService.cancelPaymentIntent(
      paymentIntentId,
      cancelStalePaymentIntentIdempotencyKey(paymentIntentId),
    );
    logger.info({ ...ctx, status: res.status }, "[stale-pi] cancelled a stale PaymentIntent");
    return { outcome: "canceled", status: res.status };
  } catch (err: any) {
    logger.error({ ...ctx, err: err?.message }, "[stale-pi] Stripe refused or failed the cancel");
    return { outcome: "error", message: err?.message ?? String(err) };
  }
}

// R164's staleness window (STALE_AUTHORIZED_CLAIM_HOURS) is stated in shared/checkout-hold.ts and
// imported at the top of this module beside the claim TTL.

export interface StaleAuthorizedSweepResult {
  /** PaymentIntents read. */
  examined: number;
  /** Stripe says succeeded ⇒ handed to the ONE shared promotion. */
  promoted: number;
  /** Stripe already says canceled ⇒ the claim is voided and its capacity released. */
  voidedCanceled: number;
  /** Unpaid past STALE_AUTHORIZED_CLAIM_HOURS ⇒ cancelled at Stripe, then voided and released. */
  voidedStale: number;
  /** `processing` — money may be in flight; never touched. */
  leftProcessing: number;
  /** Unpaid but not yet stale — left for the traveler to finish. */
  leftYoung: number;
  /** Stripe could not be read, or refused the cancel — nothing changed; the next pass retries. */
  quarantined: number;
  slotsReleased: number;
  itemsReverted: number;
  /** Expired-claim emails sent (one per released booking, at most — see `notifyExpiredStampedClaim`). */
  noticesSent: number;
}

/** The Stripe reads/writes the sweep needs, injectable so its tests run with no network. */
export interface StaleSweepStripe {
  retrieveStatus: (paymentIntentId: string) => Promise<string>;
  cancel: (paymentIntentId: string) => Promise<CancelStaleOutcome>;
}

const defaultStaleSweepStripe: StaleSweepStripe = {
  retrieveStatus: async (pi) => {
    const { stripePaymentService } = await import("./stripe-payment.service");
    return (await stripePaymentService.retrievePaymentIntentFacts(pi)).status;
  },
  cancel: (pi) => cancelStalePaymentIntent({ paymentIntentId: pi, context: { source: "stale-authorized-sweep" } }),
};

/**
 * R164 (G2): the server-authored `booking_details` key recording that the traveler was told their
 * stamped claim was released. Its presence IS the one-per-booking guard (§19d — never body-settable).
 */
export const EXPIRED_CLAIM_NOTICE_KEY = "expiredClaimNotice";

export type ExpiredClaimEmailSender = (p: {
  toEmail: string;
  travelerName: string | null;
  serviceName: string | null;
  tripId: string | null;
}) => Promise<void>;

/**
 * R164 (G2, decision-maker Sep 27, 2026): ONE email when the sweep releases a STAMPED claim — "Your
 * booking for X wasn't completed, so we released it. It's back in your plan; you can book it again."
 * The claim is an atomic conditional (`status='expired' AND stripe_payment_intent_id IS NOT NULL AND
 * the notice key absent`), taken BEFORE the send, so a second pass, a concurrent pass or a re-run
 * finds it taken and sends nothing: at most one email per booking. An UNSTAMPED claim can never pass
 * the predicate, so its traveler — who never reached payment — is never emailed. A failed send is
 * logged and not retried (one per booking wins over a second attempt). Never throws.
 */
export async function notifyExpiredStampedClaim(
  bookingId: string,
  send?: ExpiredClaimEmailSender,
): Promise<{ sent: boolean; reason?: "not_claimed" | "no_email" | "send_failed" }> {
  try {
    const claimed = (
      await db.execute(sql`
        UPDATE service_bookings
        SET booking_details = COALESCE(booking_details, '{}'::jsonb)
              || jsonb_build_object(${EXPIRED_CLAIM_NOTICE_KEY}::text, jsonb_build_object('claimedAt', NOW()::text))
        WHERE id = ${bookingId}
          AND status = ${CLAIM_EXPIRED_STATUS}
          AND stripe_payment_intent_id IS NOT NULL
          AND NOT (COALESCE(booking_details, '{}'::jsonb) ? ${EXPIRED_CLAIM_NOTICE_KEY}::text)
        RETURNING traveler_id, service_id, trip_id
      `)
    ).rows?.[0] as { traveler_id: string | null; service_id: string | null; trip_id: string | null } | undefined;
    if (!claimed) return { sent: false, reason: "not_claimed" };
    if (!claimed.traveler_id) return { sent: false, reason: "no_email" };
    const detail = (
      await db.execute(sql`
        SELECT u.email, u.first_name, ps.service_name
        FROM users u LEFT JOIN provider_services ps ON ps.id = ${claimed.service_id}
        WHERE u.id = ${claimed.traveler_id} LIMIT 1
      `)
    ).rows?.[0] as { email: string | null; first_name: string | null; service_name: string | null } | undefined;
    if (!detail?.email) return { sent: false, reason: "no_email" };
    const sender: ExpiredClaimEmailSender =
      send ?? (async (p) => (await import("./email.service")).sendExpiredClaimEmail(p));
    try {
      await sender({
        toEmail: detail.email,
        travelerName: detail.first_name ?? null,
        serviceName: detail.service_name ?? null,
        tripId: claimed.trip_id ?? null,
      });
    } catch (err: any) {
      logger.error({ bookingId, err: err?.message }, "[stale-authorized-sweep] expired-claim email failed (claim kept; not retried)");
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (err: any) {
    logger.error({ bookingId, err: err?.message }, "[stale-authorized-sweep] expired-claim notice failed (booking stays released)");
    return { sent: false, reason: "send_failed" };
  }
}

/**
 * R164/R165 — RELEASE ONE STAMPED CLAIM whose PaymentIntent Stripe says will never be paid. ONE
 * implementation, two callers (§18 rule 1): the stale-authorized sweep and the platform
 * `payment_intent.canceled` webhook (`releaseClaimsForCanceledIntent`). In order, each step behind its
 * own guard: the void (`voidClaim`, keyed on the row's own stamped PaymentIntent — a promote racing
 * this leaves exactly one winner), the plan item back to planning (guarded on the booking still being
 * `expired`), then the traveler's one email (`notifyExpiredStampedClaim`, its own atomic claim).
 * Nothing after the void runs unless this call won it. Never throws.
 */
export async function releaseStampedClaim(
  row: ProvisionalClaimRow,
  paymentIntentId: string,
  reason: "stripe_canceled" | "stale_unpaid",
  sendExpiredClaimEmail?: ExpiredClaimEmailSender,
): Promise<{ voided: boolean; slotsReleased: number; itemsReverted: number; noticeSent: boolean }> {
  const v = await voidClaim(row, reason, paymentIntentId);
  if (!v.voided) return { voided: false, slotsReleased: 0, itemsReverted: 0, noticeSent: false };
  let itemsReverted = 0;
  try {
    const { revertPurchasedItemsForBooking } = await import("./item-routing.service");
    const rv = await revertPurchasedItemsForBooking(row.id, {
      actorType: "system",
      requireBookingStatusIn: [CLAIM_EXPIRED_STATUS],
    });
    itemsReverted = rv.reverted;
  } catch (err) {
    logger.error({ err, bookingId: row.id }, "[stamped-claim-release] item revert failed (booking voided; item re-runnable)");
  }
  // After the release and the item's return to the plan: tell the traveler, once (§15b — the
  // notice follows the operation that authorizes it, and can never undo it).
  const n = await notifyExpiredStampedClaim(row.id, sendExpiredClaimEmail);
  return { voided: true, slotsReleased: v.slotsReleased, itemsReverted, noticeSent: n.sent };
}

/**
 * R165 (G3, decision-maker Sep 27, 2026) — the PLATFORM `payment_intent.canceled` webhook releases
 * the stamped claims on that intent. Until this, the handler updated `payment_intents` and the LEGACY
 * `bookings` table only, so a cart checkout whose intent was cancelled (in the dashboard, by the
 * sweep, by Stripe's own expiry) stayed `payment_pending`, holding its slot, until the 24-hour sweep
 * noticed. A signature-verified `canceled` event is Stripe's word and `canceled` is final, so the
 * claim is released at once through the SAME `releaseStampedClaim` the sweep uses — same void
 * predicate, same item revert, same one email. Only `payment_pending` rows carrying THIS intent match:
 * a confirmed/failed/refunded row, a deposit row (whose balance leg rides `stripe_balance_intent_id`)
 * and a legacy-rail row are never touched. A redelivery finds the rows already `expired` and does
 * nothing. Never throws.
 */
export async function releaseClaimsForCanceledIntent(
  paymentIntentId: string,
  opts?: { sendExpiredClaimEmail?: ExpiredClaimEmailSender },
): Promise<{ matched: number; released: number; slotsReleased: number; itemsReverted: number; noticesSent: number }> {
  const out = { matched: 0, released: 0, slotsReleased: 0, itemsReverted: 0, noticesSent: 0 };
  let rows: ProvisionalClaimRow[];
  try {
    const r = await db.execute(sql`
      SELECT id, trip_id, slot_id, traveler_id, booking_details, idempotency_key, created_at
      FROM service_bookings
      WHERE status = 'payment_pending' AND stripe_payment_intent_id = ${paymentIntentId}
    `);
    rows = (r.rows as any[]).map((x) => ({
      id: String(x.id),
      tripId: x.trip_id ?? null,
      slotId: x.slot_id ?? null,
      travelerId: x.traveler_id ?? null,
      bookingDetails: (x.booking_details ?? null) as Record<string, unknown> | null,
      idempotencyKey: x.idempotency_key ?? null,
      createdAt: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
    }));
  } catch (err: any) {
    logger.error({ paymentIntentId, err: err?.message }, "[canceled-intent] lookup failed — the sweep will release these claims");
    return out;
  }
  out.matched = rows.length;
  for (const row of rows) {
    const r = await releaseStampedClaim(row, paymentIntentId, "stripe_canceled", opts?.sendExpiredClaimEmail);
    if (!r.voided) continue;
    out.released += 1;
    out.slotsReleased += r.slotsReleased;
    out.itemsReverted += r.itemsReverted;
    if (r.noticeSent) out.noticesSent += 1;
  }
  if (out.released > 0) logger.info({ paymentIntentId, ...out }, "[canceled-intent] released stamped claims on a canceled PaymentIntent");
  return out;
}

/**
 * R164 (G2) — THE STALE AUTHORIZED-CLAIM SWEEP. `sweepExpiredCheckoutClaims` reclaims UNSTAMPED claims
 * only; a claim that WAS authorized (a PaymentIntent stamped on it, cart cleared, item flipped to
 * `purchased`) and then never paid — the traveler closed the tab on 3-D Secure, the card form was
 * abandoned — sat `payment_pending` forever, holding its slot and showing the item as bought. The
 * ruling, per PaymentIntent, read from STRIPE (never guessed):
 *   - `succeeded` ⇒ promote, through the ONE `promotePaidCheckout` (actor `sweep`);
 *   - `canceled` ⇒ void the claim and release its capacity;
 *   - `processing` ⇒ NEVER touched (money may be moving);
 *   - otherwise unpaid and older than STALE_AUTHORIZED_CLAIM_HOURS ⇒ cancel through the ONE
 *     `cancelStalePaymentIntent` (which re-reads Stripe and never cancels processing/succeeded), then
 *     void and release; younger ⇒ left for the traveler to finish.
 * A voided claim's plan item goes back to planning through the ONE reverser, guarded on the booking
 * still being `expired` in the same statement. Stripe unreadable ⇒ nothing changes (quarantine).
 * Every write is an atomic conditional on the row's own stamped PaymentIntent (§15b), so a webhook
 * promote racing this sweep leaves exactly one winner. Never throws.
 */
export async function sweepStaleAuthorizedClaims(opts?: {
  /** Claims younger than the checkout TTL are never considered (the traveler is still paying). */
  minAgeMinutes?: number;
  staleHours?: number;
  limit?: number;
  onlyBookingIds?: string[];
  stripe?: StaleSweepStripe;
  /** Test seam for the expired-claim email; production sends through `sendExpiredClaimEmail`. */
  sendExpiredClaimEmail?: ExpiredClaimEmailSender;
}): Promise<StaleAuthorizedSweepResult> {
  const minAge = opts?.minAgeMinutes ?? CHECKOUT_CLAIM_TTL_MINUTES;
  const staleHours = opts?.staleHours ?? STALE_AUTHORIZED_CLAIM_HOURS;
  const limit = opts?.limit ?? 200;
  const scope = opts?.onlyBookingIds;
  const stripeOps = opts?.stripe ?? defaultStaleSweepStripe;
  const result: StaleAuthorizedSweepResult = {
    examined: 0, promoted: 0, voidedCanceled: 0, voidedStale: 0, leftProcessing: 0, leftYoung: 0,
    quarantined: 0, slotsReleased: 0, itemsReverted: 0, noticesSent: 0,
  };
  if (scope && scope.length === 0) return result;

  let rows: Array<ProvisionalClaimRow & { paymentIntentId: string }>;
  try {
    const r = await db.execute(sql`
      SELECT id, trip_id, slot_id, traveler_id, booking_details, idempotency_key, created_at, stripe_payment_intent_id
      FROM service_bookings
      WHERE status = 'payment_pending'
        AND stripe_payment_intent_id IS NOT NULL
        AND created_at < NOW() - (${String(minAge)} || ' minutes')::interval
        ${scope ? sql`AND id IN (${sql.join(scope.map((id) => sql`${id}`), sql`, `)})` : sql``}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
    rows = (r.rows as any[]).map((x) => ({
      id: String(x.id),
      tripId: x.trip_id ?? null,
      slotId: x.slot_id ?? null,
      travelerId: x.traveler_id ?? null,
      bookingDetails: (x.booking_details ?? null) as Record<string, unknown> | null,
      idempotencyKey: x.idempotency_key ?? null,
      createdAt: x.created_at instanceof Date ? x.created_at : new Date(String(x.created_at)),
      paymentIntentId: String(x.stripe_payment_intent_id),
    }));
  } catch (err) {
    logger.error({ err }, "[stale-authorized-sweep] candidate query failed — no rows touched");
    return result;
  }

  const byPi = new Map<string, typeof rows>();
  for (const row of rows) byPi.set(row.paymentIntentId, [...(byPi.get(row.paymentIntentId) ?? []), row]);

  const voidAll = async (pi: string, group: typeof rows, reason: "stripe_canceled" | "stale_unpaid") => {
    let voided = 0;
    for (const row of group) {
      const r = await releaseStampedClaim(row, pi, reason, opts?.sendExpiredClaimEmail);
      if (!r.voided) continue;
      voided += 1;
      result.slotsReleased += r.slotsReleased;
      result.itemsReverted += r.itemsReverted;
      if (r.noticeSent) result.noticesSent += 1;
    }
    return voided;
  };

  for (const [pi, group] of Array.from(byPi.entries())) {
    result.examined += 1;
    let status: string;
    try {
      status = await stripeOps.retrieveStatus(pi);
    } catch (err: any) {
      result.quarantined += 1;
      logger.warn({ paymentIntentId: pi, err: err?.message }, "[stale-authorized-sweep] Stripe could not be read — nothing changed");
      continue;
    }

    if (status === "succeeded") {
      const promo = await promotePaidCheckout({ paymentIntentId: pi, actor: "sweep", bookingIds: group.map((g) => g.id) });
      result.promoted += promo.promoted.length;
      continue;
    }
    if (status === "processing") {
      result.leftProcessing += 1;
      continue;
    }
    if (status === "canceled") {
      result.voidedCanceled += await voidAll(pi, group, "stripe_canceled");
      continue;
    }
    const oldest = Math.min(...group.map((g) => g.createdAt.getTime()));
    if (Date.now() - oldest < staleHours * 3600 * 1000) {
      result.leftYoung += 1;
      continue;
    }
    const cancel = await stripeOps.cancel(pi);
    if (cancel.outcome === "canceled" || cancel.outcome === "already_canceled") {
      result.voidedStale += await voidAll(pi, group, "stale_unpaid");
    } else if (cancel.outcome === "not_cancellable" && cancel.status === "succeeded") {
      // Paid between our read and the cancel: the same promotion, never a void.
      const promo = await promotePaidCheckout({ paymentIntentId: pi, actor: "sweep", bookingIds: group.map((g) => g.id) });
      result.promoted += promo.promoted.length;
    } else if (cancel.outcome === "not_cancellable") {
      result.leftProcessing += 1;
    } else {
      result.quarantined += 1;
    }
  }

  if (result.examined > 0) logger.info({ ...result, staleHours }, "[stale-authorized-sweep] pass complete");
  return result;
}

export type LateSuccessRefundResult =
  | { outcome: "refunded"; refundId: string; amountCents: number; bookingIds: string[] }
  | { outcome: "already_refunded"; refundId: string | null; bookingIds: string[] }
  /** No row carries this PI, or not every row on it is `failed` — not this rule's case. */
  | { outcome: "not_applicable"; reason: string }
  /** Stripe says the intent did not succeed, or nothing is left to refund. No money to return. */
  | { outcome: "nothing_to_refund"; status: string; bookingIds: string[] }
  /** Stripe could not be consulted or the refund call failed; the next signal re-drives. */
  | { outcome: "error"; message: string };

/**
 * R162 — THE LATE-SUCCESS REFUND. A PaymentIntent whose booking row(s) are `failed` has succeeded:
 * the booking STAYS `failed` (the caller has already recorded the reconciliation exception) and the
 * traveler is refunded automatically through the ONE shared refund call site.
 *
 * Exactly once, by three layers: (1) the §15b CLAIM — an atomic conditional stamping
 * `booking_details.lateSuccessRefund` on the PI's `failed` rows, taken BEFORE the Stripe call;
 * (2) the Stripe idempotency key `late-success-refund-<pi>`; (3) a row that already records a
 * `refundId` answers `already_refunded` with no Stripe call. A signal that loses the claim to a
 * caller that crashed before the refund re-drives the SAME key (Stripe returns the same refund).
 *
 * The amount is Stripe's own (§14): what the intent received less what its charge already
 * refunded. Money is refunded ONLY when Stripe says `succeeded`. Applies only when EVERY row on the
 * PI is `failed` — a PI that also backs a live booking is not this rule's case and is left to the
 * exception a human reads. Never throws.
 */
export async function refundLateSuccessOnFailedIntent(opts: {
  paymentIntentId: string;
  actor: string;
}): Promise<LateSuccessRefundResult> {
  const { paymentIntentId, actor } = opts;
  if (!paymentIntentId) return { outcome: "not_applicable", reason: "no_payment_intent" };
  try {
    const rows = (
      await db.execute(sql`
        SELECT id, status, booking_details -> ${LATE_SUCCESS_REFUND_KEY}::text AS lsr
        FROM service_bookings
        WHERE stripe_payment_intent_id = ${paymentIntentId}
        ORDER BY id
      `)
    ).rows as Array<{ id: string; status: string | null; lsr: any }>;
    if (rows.length === 0) return { outcome: "not_applicable", reason: "no_booking_on_intent" };
    if (!rows.every((r) => r.status === "failed")) {
      return { outcome: "not_applicable", reason: "not_every_booking_failed" };
    }
    const bookingIds = rows.map((r) => r.id);
    const recorded = rows.find((r) => r.lsr && typeof r.lsr.refundId === "string");
    if (recorded) {
      // A redelivery: the refund exists. Finish the aftermath if a crash left it half-done — both
      // halves are idempotent (fee reversal by key, the notice by its own claim), so this never
      // reverses twice or notifies twice.
      await settleLateSuccessAftermath(paymentIntentId, recorded.lsr.refundId);
      return { outcome: "already_refunded", refundId: recorded.lsr.refundId, bookingIds };
    }

    const { stripePaymentService } = await import("./stripe-payment.service");
    let facts: Awaited<ReturnType<typeof stripePaymentService.retrievePaymentIntentFacts>>;
    try {
      facts = await stripePaymentService.retrievePaymentIntentFacts(paymentIntentId);
    } catch (err: any) {
      logger.error({ paymentIntentId, actor, bookingIds, err: err?.message }, "[late-success] Stripe unreachable — no refund, re-driven by the next signal");
      return { outcome: "error", message: err?.message ?? String(err) };
    }
    const amountCents = facts.amountReceivedCents - facts.amountRefundedCents;
    if (facts.status !== "succeeded" || amountCents <= 0) {
      return { outcome: "nothing_to_refund", status: facts.status, bookingIds };
    }

    // §15b CLAIM, before the Stripe call. The WHERE is the guard; a loser matches zero rows.
    const claimed = await db.execute(sql`
      UPDATE service_bookings
      SET booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
            ${LATE_SUCCESS_REFUND_KEY}::text, jsonb_build_object(
              'claimedAt', NOW()::text, 'paymentIntentId', ${paymentIntentId}::text,
              'actor', ${actor}::text, 'amountCents', ${amountCents}::int)),
          updated_at = NOW()
      WHERE stripe_payment_intent_id = ${paymentIntentId}
        AND status = 'failed'
        AND NOT (COALESCE(booking_details, '{}'::jsonb) ? ${LATE_SUCCESS_REFUND_KEY}::text)
      RETURNING id
    `);
    if (claimed.rows.length === 0) {
      // Someone claimed first. If they finished, say so; if not (in flight, or crashed after the
      // claim), re-drive the SAME key — Stripe returns the same refund, never a second one.
      const again = (
        await db.execute(sql`
          SELECT booking_details -> ${LATE_SUCCESS_REFUND_KEY}::text AS lsr
          FROM service_bookings WHERE stripe_payment_intent_id = ${paymentIntentId}
        `)
      ).rows as Array<{ lsr: any }>;
      const done = again.find((r) => r.lsr && typeof r.lsr.refundId === "string");
      if (done) {
        await settleLateSuccessAftermath(paymentIntentId, done.lsr.refundId);
        return { outcome: "already_refunded", refundId: done.lsr.refundId, bookingIds };
      }
    }

    let refund: { id: string; status: string | null };
    try {
      refund = await stripePaymentService.refundLateSuccessOnFailedBooking({
        paymentIntentId,
        amountCents,
        idempotencyKey: lateSuccessRefundIdempotencyKey(paymentIntentId),
        bookingId: bookingIds[0],
        bookingIds,
      });
    } catch (err: any) {
      logger.error(
        { paymentIntentId, actor, bookingIds, err: err?.message },
        "[late-success] refund call failed — claim kept; the next signal re-drives the same key",
      );
      return { outcome: "error", message: err?.message ?? String(err) };
    }
    await db.execute(sql`
      UPDATE service_bookings
      SET booking_details = jsonb_set(booking_details, ${`{${LATE_SUCCESS_REFUND_KEY},refundId}`}::text[], to_jsonb(${refund.id}::text), true),
          updated_at = NOW()
      WHERE stripe_payment_intent_id = ${paymentIntentId} AND status = 'failed'
        AND booking_details ? ${LATE_SUCCESS_REFUND_KEY}::text
    `);
    logger.error(
      { paymentIntentId, actor, bookingIds, refundId: refund.id, amountCents },
      "[late-success] a PaymentIntent SUCCEEDED after its booking was marked failed — booking stays failed, " +
        "traveler refunded automatically (R162)",
    );
    await settleLateSuccessAftermath(paymentIntentId, refund.id);
    return { outcome: "refunded", refundId: refund.id, amountCents, bookingIds };
  } catch (err: any) {
    logger.error({ paymentIntentId, actor, err: err?.message }, "[late-success] unexpected error — nothing assumed");
    return { outcome: "error", message: err?.message ?? String(err) };
  }
}

/** The notification `type` of the one late-success refund notice. Stated once. */
export const LATE_SUCCESS_REFUND_NOTICE_TYPE = "payment_refunded";

/**
 * R162 — WHAT FOLLOWS A LATE-SUCCESS REFUND, both halves idempotent and neither able to fail the
 * refund (§15b: an ancillary effect never undoes the money event that authorized it).
 *
 *  (a) THE FEE RECORD. The traveler service fee written to `fee_ledger` at authorization is reversed
 *      through the ONE shared writer every refund uses (`recordTravelerServiceFeeReversal`, the same
 *      call `refundServiceBooking` makes via `recordIssuedRefund`), at the fee the booking's own
 *      snapshot says was CHARGED (a waived fee was never billed and is not reversed). Its key is
 *      per (booking, amount), so a redelivery or a second confirm never reverses twice, and the
 *      plan's fee record nets to zero once all the money has gone back.
 *  (b) THE TRAVELER IS TOLD, ONCE. One in-app notification and one email per traveler, behind their
 *      own claim — `lateSuccessRefund.noticeClaimedAt`, set by an atomic conditional only once the
 *      refund id is recorded. A redelivery finds the claim taken and sends nothing. The wording says
 *      what happened: the payment went through after it had failed, it was refunded automatically,
 *      nothing was booked, and this is not a new charge.
 */
async function settleLateSuccessAftermath(paymentIntentId: string, refundId: string): Promise<void> {
  try {
    const rows = (
      await db.execute(sql`
        SELECT id, booking_details -> 'travelerServiceFee' AS tfee
        FROM service_bookings
        WHERE stripe_payment_intent_id = ${paymentIntentId} AND status = 'failed'
      `)
    ).rows as Array<{ id: string; tfee: any }>;
    const { recordTravelerServiceFeeReversal } = await import("./fee-ledger.service");
    for (const r of rows) {
      const charged = r.tfee && r.tfee.waived !== true ? Number(r.tfee.charged) || 0 : 0;
      if (charged <= 0) continue;
      const res = await recordTravelerServiceFeeReversal({
        bookingId: r.id,
        refundAmount: charged,
        actor: LATE_SUCCESS_REFUND_ACTOR,
        stripeRefundRef: refundId,
        reason: "late_success_on_failed_booking",
      });
      if (!res.reversed && res.reason === "original_row_missing") {
        logger.error({ bookingId: r.id, paymentIntentId, refundId }, "[late-success] fee reversal skipped: original fee row not found (ledger gap)");
      }
    }
  } catch (err: any) {
    logger.error({ paymentIntentId, refundId, err: err?.message }, "[late-success] fee reversal failed (refund stands; the next signal retries)");
  }

  try {
    const claimed = (
      await db.execute(sql`
        UPDATE service_bookings
        SET booking_details = jsonb_set(booking_details, ${`{${LATE_SUCCESS_REFUND_KEY},noticeClaimedAt}`}::text[], to_jsonb(NOW()::text), true)
        WHERE stripe_payment_intent_id = ${paymentIntentId}
          AND status = 'failed'
          AND (booking_details -> ${LATE_SUCCESS_REFUND_KEY}::text) ? 'refundId'
          AND NOT ((booking_details -> ${LATE_SUCCESS_REFUND_KEY}::text) ? 'noticeClaimedAt')
        RETURNING id, traveler_id, service_id, (booking_details -> ${LATE_SUCCESS_REFUND_KEY}::text ->> 'amountCents') AS amount_cents
      `)
    ).rows as Array<{ id: string; traveler_id: string | null; service_id: string | null; amount_cents: string | null }>;
    if (claimed.length === 0) return; // someone else holds the notice claim, or it was already sent
    const byTraveler = new Map<string, (typeof claimed)[number]>();
    for (const r of claimed) if (r.traveler_id && !byTraveler.has(r.traveler_id)) byTraveler.set(r.traveler_id, r);
    const { storage } = await import("../storage");
    const { sendLateSuccessRefundEmail } = await import("./email.service");
    for (const [travelerId, r] of Array.from(byTraveler.entries())) {
      const amount = Number(r.amount_cents ?? 0) / 100;
      const detail = (
        await db.execute(sql`
          SELECT u.email, u.first_name, ps.service_name
          FROM users u LEFT JOIN provider_services ps ON ps.id = ${r.service_id}
          WHERE u.id = ${travelerId} LIMIT 1
        `)
      ).rows?.[0] as any;
      const what = detail?.service_name ? `your payment for ${detail.service_name}` : "your payment";
      try {
        await storage.createNotification({
          userId: travelerId,
          type: LATE_SUCCESS_REFUND_NOTICE_TYPE,
          title: "Your payment was refunded — nothing was booked",
          message:
            `Earlier we told you ${what} didn't go through. It went through afterwards, but the booking had ` +
            `already been closed, so nothing was booked. We refunded $${amount.toFixed(2)} to your ` +
            `original payment method automatically. This is not a new charge.`,
          relatedId: r.id,
          relatedType: "booking",
          data: { bookingId: r.id, paymentIntentId, refundId, refundAmount: amount, reason: "late_success_on_failed_booking" },
        } as any);
      } catch (err: any) {
        logger.error({ bookingId: r.id, err: err?.message }, "[late-success] refund notification failed");
      }
      if (detail?.email) {
        await sendLateSuccessRefundEmail({
          toEmail: detail.email,
          travelerName: detail.first_name ?? null,
          serviceName: detail.service_name ?? null,
          refundAmount: amount,
        }).catch((err: any) => logger.error({ bookingId: r.id, err: err?.message }, "[late-success] refund email failed"));
      }
    }
  } catch (err: any) {
    logger.error({ paymentIntentId, refundId, err: err?.message }, "[late-success] refund notice failed (refund stands)");
  }
}

const LATE_SUCCESS_REFUND_ACTOR = "late_success_refund";

/** Has the webhook's late-success refund been recorded on this PaymentIntent's rows? Read-only. */
async function lateSuccessRefundRecorded(paymentIntentId: string): Promise<boolean> {
  try {
    const r = await db.execute(sql`
      SELECT 1 FROM service_bookings
      WHERE stripe_payment_intent_id = ${paymentIntentId}
        AND (booking_details -> ${LATE_SUCCESS_REFUND_KEY}::text) ? 'refundId'
      LIMIT 1
    `);
    return r.rows.length > 0;
  } catch (err: any) {
    logger.error({ paymentIntentId, err: err?.message }, "[stale-pi] could not read the late-success refund record — treated as pending");
    return false;
  }
}

export type RetireStaleResult = {
  /** false ⇒ at least one stale intent could not be retired; the caller must NOT open checkout. */
  ok: boolean;
  stale: Array<{
    bookingIds: string[];
    paymentIntentId: string;
    result: CancelStaleOutcome;
    /** The old intent SUCCEEDED and its webhook refund is not recorded yet — checkout waits for it. */
    refundPending?: boolean;
  }>;
};

/**
 * R162 step 1 — "TRY AGAIN" RETIRES THE OLD INTENT AFTER THE NEW ONE EXISTS. Called by the checkout
 * authorization after the NEW PaymentIntent is created and BEFORE it is stamped or handed to the
 * client. For each plan item this checkout buys, the traveler's EARLIER booking of that item that is
 * `failed` with a different stamped PaymentIntent is the stale one; it is cancelled through
 * `cancelStalePaymentIntent`. A stale intent Stripe reports `succeeded` is a LATE SUCCESS and is
 * refunded (it cannot be cancelled); one that is `processing` or could not be cancelled makes
 * `ok: false`, and the caller opens no checkout. Only a PI whose EVERY row is `failed` is touched.
 *
 * NEGATIVE SPACE: the link is the plan item (`booking_details.itineraryItemId`), the identity R157's
 * "Try again" re-projects. A failed booking with no plan item is not found here; the G2 sweep is the
 * backstop for those, and the late-success refund covers any of them that succeeds.
 */
export async function retireStalePaymentIntentsForCheckout(opts: {
  travelerId: string;
  bookingIds: string[];
  newPaymentIntentId: string;
}): Promise<RetireStaleResult> {
  const { travelerId, bookingIds, newPaymentIntentId } = opts;
  const out: RetireStaleResult = { ok: true, stale: [] };
  if (!travelerId || bookingIds.length === 0) return out;
  let rows: Array<{ id: string; pi: string }>;
  try {
    rows = (
      await db.execute(sql`
        SELECT old.id, old.stripe_payment_intent_id AS pi
        FROM service_bookings old
        WHERE old.traveler_id = ${travelerId}
          AND old.status = 'failed'
          AND old.stripe_payment_intent_id IS NOT NULL
          AND old.stripe_payment_intent_id <> ${newPaymentIntentId}
          AND old.id NOT IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})
          AND old.booking_details ->> 'itineraryItemId' IN (
            SELECT nb.booking_details ->> 'itineraryItemId'
            FROM service_bookings nb
            WHERE nb.id IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})
              AND nb.booking_details ? 'itineraryItemId'
          )
          AND NOT EXISTS (
            SELECT 1 FROM service_bookings live
            WHERE live.stripe_payment_intent_id = old.stripe_payment_intent_id
              AND live.status IS DISTINCT FROM 'failed'
          )
      `)
    ).rows as Array<{ id: string; pi: string }>;
  } catch (err: any) {
    logger.error({ travelerId, bookingIds, newPaymentIntentId, err: err?.message }, "[stale-pi] stale lookup failed — checkout not opened");
    return { ok: false, stale: [] };
  }
  const byPi = new Map<string, string[]>();
  for (const r of rows) byPi.set(r.pi, [...(byPi.get(r.pi) ?? []), r.id]);
  for (const [paymentIntentId, oldIds] of Array.from(byPi.entries())) {
    const context = { oldBookingIds: oldIds, newBookingIds: bookingIds, oldPaymentIntentId: paymentIntentId, newPaymentIntentId };
    const result = await cancelStalePaymentIntent({ paymentIntentId, context });
    const entry: RetireStaleResult["stale"][number] = { bookingIds: oldIds, paymentIntentId, result };
    if (result.outcome === "not_cancellable" && result.status === "succeeded") {
      // The old intent already SUCCEEDED: a late success. It is refunded by the WEBHOOK only
      // (`handlePaymentSucceeded`; decision-maker ruling Sep 27, 2026) — this path never refunds.
      // Retiring it is complete once that refund is recorded on the old rows; until then checkout
      // does not open, so the traveler is never asked to pay again while their earlier payment is
      // still out. The caller says why (`refundPending`).
      const recorded = await lateSuccessRefundRecorded(paymentIntentId);
      entry.refundPending = !recorded;
      if (!recorded) out.ok = false;
    } else if (result.outcome !== "canceled" && result.outcome !== "already_canceled") {
      out.ok = false;
    }
    if (!out.ok) {
      logger.error({ ...context, outcome: result }, "[stale-pi] the previous PaymentIntent was NOT retired — checkout will not open");
    }
    out.stale.push(entry);
  }
  return out;
}

// ══ LANE 7 — THE BALANCE LEG (deposits / partial payments, DECISIONS.md ruling 72) ═══════════════
//
// A deposit-partial booking sits in `status='deposit_paid'` with the DEPOSIT PI stamped on
// `stripe_payment_intent_id` (+ `stripe_deposit_intent_id`) and an outstanding `balance_amount`.
// The traveler settles the BALANCE in a SECOND, separate checkout — its OWN authorized PaymentIntent
// on the SAME booking row, carried on the parallel `stripe_balance_intent_id` column.
//
// This is the SAME §15 claim shape as the deposit/promotion spine above — atomic conditional
// UPDATE … WHERE the row is in the expected state — PARAMETERISED onto the balance column and the
// `deposit_paid → confirmed` transition, NOT a second copy of the promotion's decision logic. Two
// rules that do not move:
//   • `status='deposit_paid' AND stripe_balance_intent_id IS NULL` is an UNAUTHORIZED balance claim
//     by construction (the §15b posture, one leg over): the row is real and paid-a-deposit, but the
//     balance PI is not yet stamped.
//   • The flip to `confirmed` is an atomic conditional keyed on the row's OWN server-stamped
//     `stripe_balance_intent_id`, so a double signal (webhook + inline confirm) is exactly ONE flip.

/**
 * The `booking_details` key that records WHICH USER authorized (and therefore pays) the balance.
 * Ledger `2026-09-04-cost-split-phase-one`: with the owner no longer the only possible payer, "who
 * paid the balance?" stopped being answerable from `traveler_id`. Recorded on the booking row —
 * inside the SAME atomic conditional that stamps the balance PI — so the promotion can name the
 * payer on its diary row whichever signal arrives first, including the webhook, which has no
 * session to ask. NO new table and no schema change: `booking_details` is the row's existing jsonb.
 */
export const BALANCE_PAYER_DETAIL_KEY = "balancePaidByUserId";

/** Read the recorded balance payer off a booking row's `booking_details`, or NULL. */
export function recordedBalancePayer(bookingDetails: unknown): string | null {
  if (!bookingDetails || typeof bookingDetails !== "object") return null;
  const value = (bookingDetails as Record<string, unknown>)[BALANCE_PAYER_DETAIL_KEY];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export interface BalancePayerClaimResult {
  /** This payer now holds the balance leg (freshly, or because they already held it). */
  claimed: boolean;
  /** Another user holds it — the caller must refuse rather than create a second PaymentIntent. */
  heldBy: string | null;
  /** The row is no longer an unclaimed balance (not `deposit_paid`, or already stamped). */
  notClaimable: boolean;
}

/**
 * BALANCE PAYER CLAIM — the §15 "claim the row atomically FIRST, then make the external call"
 * ordering, applied to the balance leg by ledger `2026-09-04-cost-split-phase-one`.
 *
 * WHY THIS EXISTS, and why the widening could not land without it. The balance route calls Stripe
 * BEFORE it stamps, and `createPaymentIntent` on the saved-card branch sends
 * `off_session: true, confirm: true` — a REAL CHARGE at creation. While the owner was the only
 * possible payer that was safe: two concurrent calls carried the SAME idempotency key, so Stripe
 * returned ONE PaymentIntent and there was one charge. The moment a second payer exists, the key
 * must differ by actor (it is built from the actor's customer and saved card — see
 * `buildBalanceIdempotencyKey`), and two DIFFERENT keys mean two PaymentIntents, which on the
 * saved-card branch is TWO REAL CHARGES for one balance. The post-Stripe stamp cannot undo a
 * charge that already happened; only a claim taken BEFORE the call can prevent it.
 *
 * So the claim is the guard, and it is ONE atomic conditional (§15 — never a check-then-update):
 *   `status='deposit_paid' AND stripe_balance_intent_id IS NULL AND (no payer recorded OR it is me)`
 * The `COALESCE(recorded, me) = me` predicate expresses all three admissible cases in one clause,
 * so an unclaimed row and this payer's OWN re-entry both pass (the claim is idempotent — a retry
 * or double-click re-claims and proceeds to the SAME idempotency key), while a different user
 * matches zero rows and is refused without a Stripe call ever being made.
 *
 * NOTHING EVER RELEASES A CLAIM, and that is the ruling, not an omission. `createPaymentIntent`
 * RETURNS (rather than throws) whenever Stripe attaches a PaymentIntent to the error, so a thrown
 * error is exactly the case where we cannot prove a PaymentIntent does not exist — a timeout after
 * Stripe created and (on the saved-card branch) CHARGED it is indistinguishable from a call that
 * never landed. Releasing there would hand a second payer a second charge for one balance: §15b's
 * "never void a row whose PaymentIntent may exist", one leg over. So a claim is cleared only by the
 * balance actually being paid (the row leaves `deposit_paid`). The cost is a LIVENESS limit, never
 * a money-safety one: a payer who claims and walks away holds the balance leg, and the booking's
 * owner is answered `balance_payment_in_progress` until that payer finishes. It self-heals for the
 * one person it affects — their retry rebuilds the SAME idempotency key and gets the SAME
 * PaymentIntent. A TTL reclaim is phase two's problem, where a real split needs an expiry model
 * anyway; inventing one here would be a fourth writer on the money path (§17's "detect, don't
 * repair" posture) with no evidence to act on.
 */
export async function claimBalancePayer(
  bookingId: string,
  payerUserId: string,
): Promise<BalancePayerClaimResult> {
  const payer = typeof payerUserId === "string" ? payerUserId.trim() : "";
  if (!bookingId || !payer) return { claimed: false, heldBy: null, notClaimable: true };

  const claimed = await db.execute(sql`
    UPDATE service_bookings
    SET booking_details = COALESCE(booking_details, '{}'::jsonb)
                            || jsonb_build_object(${BALANCE_PAYER_DETAIL_KEY}::text, ${payer}::text),
        updated_at = NOW()
    WHERE id = ${bookingId}
      AND status = 'deposit_paid'
      AND stripe_balance_intent_id IS NULL
      AND COALESCE(booking_details->>${BALANCE_PAYER_DETAIL_KEY}::text, ${payer}::text) = ${payer}::text
    RETURNING id
  `);
  if (claimed.rows.length === 1) return { claimed: true, heldBy: null, notClaimable: false };

  // Zero rows has two very different meanings, and the caller answers them differently. Read the
  // row back to say which — a diagnostic read AFTER the atomic decision, never a pre-check.
  const cur = await db.execute(sql`
    SELECT status, stripe_balance_intent_id, booking_details->>${BALANCE_PAYER_DETAIL_KEY}::text AS payer
    FROM service_bookings WHERE id = ${bookingId}
  `);
  const row = cur.rows[0] as any;
  const holder = typeof row?.payer === "string" && row.payer.trim() !== "" ? (row.payer as string).trim() : null;
  const stillOpen = row?.status === "deposit_paid" && !row?.stripe_balance_intent_id;
  if (stillOpen && holder && holder !== payer) {
    return { claimed: false, heldBy: holder, notClaimable: false };
  }
  return { claimed: false, heldBy: null, notClaimable: true };
}

/**
 * BALANCE AUTHORIZE gate — the atomic conditional stamp of the balance PI on a deposit-paid row.
 * Mirrors `stampAuthorization`, on the balance column. Returns false when the row is no longer an
 * unauthorized balance claim (already stamped, or no longer `deposit_paid`) — the caller must then
 * refuse to promote and reconcile against the already-stamped PI instead.
 *
 * `payerUserId` is the SESSION user of the authorizing call (§14 — never a body value), already
 * authorized by `canPayBalance` and already holding the claim above. When given it also NARROWS the
 * predicate to that claim holder, so this statement can never stamp on behalf of a payer who does
 * not hold the row — defence in depth behind `claimBalancePayer`, not a second copy of it. The
 * payer is merged into `booking_details`, never assigned over it, so every other key
 * (`stripeAttemptAt`, `itineraryItemId`, …) survives. An omitted payer leaves `booking_details`
 * byte-identical and the predicate exactly as it was before this ruling — the pre-ruling behaviour
 * every other caller keeps — rather than writing a null that would read as "nobody paid it".
 */
export async function stampBalanceAuthorization(
  bookingId: string,
  paymentIntentId: string,
  payerUserId?: string | null,
): Promise<boolean> {
  const payer = typeof payerUserId === "string" && payerUserId.trim() !== "" ? payerUserId.trim() : null;
  const detailsAssignment = payer
    ? sql`, booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(${BALANCE_PAYER_DETAIL_KEY}::text, ${payer}::text)`
    : sql``;
  const payerPredicate = payer
    ? sql` AND COALESCE(booking_details->>${BALANCE_PAYER_DETAIL_KEY}::text, ${payer}::text) = ${payer}::text`
    : sql``;
  const stamped = await db.execute(sql`
    UPDATE service_bookings
    SET stripe_balance_intent_id = ${paymentIntentId}, updated_at = NOW()${detailsAssignment}
    WHERE id = ${bookingId}
      AND status = 'deposit_paid'
      AND stripe_balance_intent_id IS NULL${payerPredicate}
    RETURNING id
  `);
  return stamped.rows.length === 1;
}

export interface BalancePromotionResult {
  promoted: boolean;
  alreadyConfirmed: boolean;
  /** A non-promotable / mismatched terminal state — ops-visible, never a resurrection. */
  exception?: { status: string | null; reason: string };
  diaryRows: number;
}

/**
 * THE BALANCE PROMOTION — flip `deposit_paid → confirmed` once the balance PI succeeds. Idempotent
 * by the same atomic-conditional discipline as `promoteOneBooking`: whichever signal (webhook or the
 * inline confirm) arrives first flips the row and writes ONE diary row; every later signal matches 0
 * rows and is a no-op. Never throws — a reconciliation path must not take the webhook down.
 *
 * The predicate carries the §14/security property that a caller cannot promote with a PaymentIntent
 * of its own choosing: the row's OWN server-stamped `stripe_balance_intent_id` must equal the one
 * presented. Amount is never read here — the balance was server-derived at the balance checkout.
 */
export async function promoteBalancePayment(opts: {
  bookingId: string;
  paymentIntentId: string;
  actor: PromotionActor;
  actorId?: string | null;
}): Promise<BalancePromotionResult> {
  const { bookingId, paymentIntentId, actor } = opts;
  const result: BalancePromotionResult = { promoted: false, alreadyConfirmed: false, diaryRows: 0 };
  if (!bookingId || !paymentIntentId) return result;

  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        UPDATE service_bookings
        SET status = 'confirmed',
            balance_paid = true,
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${bookingId}
          AND status = 'deposit_paid'
          AND stripe_balance_intent_id = ${paymentIntentId}
        RETURNING id, traveler_id, trip_id, total_amount, platform_fee, deposit_amount, balance_amount,
                  booking_details
      `);
      if (claimed.rows.length === 0) {
        // Not ours to flip: read the current state to decide honestly.
        const cur = await tx.execute(
          sql`SELECT status, balance_paid, stripe_balance_intent_id FROM service_bookings WHERE id = ${bookingId}`,
        );
        const r = cur.rows[0] as any;
        const status = (r?.status ?? null) as string | null;
        if (status === "confirmed" && r?.balance_paid === true) {
          // The other signal already promoted this exact balance — idempotent no-op.
          result.alreadyConfirmed = true;
          return result;
        }
        // Anything else (terminal, or a different balance PI stamped) is an ops-visible exception.
        result.exception = {
          status,
          reason:
            r?.stripe_balance_intent_id && r.stripe_balance_intent_id !== paymentIntentId
              ? "balance_payment_intent_mismatch"
              : "not_promotable",
        };
        return result;
      }

      const claimedRow = claimed.rows[0] as any;
      result.promoted = true;
      // The balance is its own paid transition (ledger `2026-09-27-funnel-revenue-on-paid`): stamped
      // in this transaction (ledger `2026-09-28-no-payment-no-earnings`), the event derived from it.
      const balanceRow = paidTransitionRowFromSql(claimedRow);
      const balanceStamp = await stampPaidCharge(tx, bookingId, "balance_paid", paidRevenueAmount("balance_paid", balanceRow));
      await recordPaidRevenueEvent(tx, balanceStamp, balanceRow);
      await persistCanonicalBookingConfirmation(tx, {
        bookingId,
        paymentIntentId,
        leg: "balance",
        paidCharge: balanceStamp,
      });
      const tripId = claimedRow.trip_id ?? null;
      if (tripId) {
        const details = (claimedRow.booking_details ?? {}) as Record<string, unknown>;
        // WHO PAID (ledger `2026-09-04-cost-split-phase-one`). The caller's own `actorId` wins when
        // it has one (the inline confirm, which knows its session user); otherwise the diary falls
        // back to the payer recorded on the row at authorization time. That fallback is the whole
        // point: the WEBHOOK promotes with no session, and before this ruling its diary row carried
        // `actorId: null` — with two possible payers, "the balance was paid" without a payer is no
        // longer an answer. Still NULL when neither is known — honestly blank, never guessed (§13).
        const recordedPayer =
          typeof details[BALANCE_PAYER_DETAIL_KEY] === "string" && (details[BALANCE_PAYER_DETAIL_KEY] as string).trim() !== ""
            ? (details[BALANCE_PAYER_DETAIL_KEY] as string)
            : null;
        await logItemTransition(tx, {
          tripId,
          itemId: typeof details.itineraryItemId === "string" ? (details.itineraryItemId as string) : null,
          eventType: "checkout_balance_paid",
          fromStatus: "deposit_paid",
          toStatus: "confirmed",
          actorType: diaryActorType(actor),
          actorId: opts.actorId ?? recordedPayer,
        });
        result.diaryRows = 1;
      }
      return result;
    });
  } catch (err) {
    logger.error(
      { err, bookingId, paymentIntentId, actor },
      "[checkout-balance] balance promotion transaction failed — booking left deposit_paid for the next signal",
    );
    if (isCanonicalBookingEmailPersistenceError(err)) throw err;
    return result;
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
    // Boot-herd floor + jitter (#1712) on the first pass; the 5-min sweep cadence is unchanged.
    setTimeout(() => void this.run(), jitteredStartupDelay(2 * 60 * 1000));
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
    await runBackgroundJob("checkout-sweep", () => sweepExpiredCheckoutClaims());
    // R164 (G2): the stamped-claim half of the same reclaim, on the same cadence.
    await runBackgroundJob("stale-authorized-sweep", () => sweepStaleAuthorizedClaims());
  }
}

export const checkoutClaimSweepScheduler = new CheckoutClaimSweepScheduler();
