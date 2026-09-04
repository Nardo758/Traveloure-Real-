/**
 * BALANCE PAYER — WHO may settle a deposit-paid booking's outstanding balance.
 * Ledger `2026-09-04-cost-split-phase-one` (cost split, phase one).
 *
 * Until this ruling `POST /api/bookings/:id/pay-balance` was owner-only: `booking.travelerId ===
 * session user`, full stop. Phase one widens WHO may pay by exactly one case and nothing else:
 *
 *   (a) the booking's OWNER (`service_bookings.traveler_id`) — unchanged, byte-identical; or
 *   (b) a `trip_participants` row on THE BOOKING'S OWN TRIP whose `user_id` is the session user
 *       and whose `role` is exactly `payer` (`TRIP_PARTICIPANT_ROLE_PAYER`, the one shared
 *       spelling — see shared/schema.ts).
 *
 * WHAT THIS HELPER IS NOT ALLOWED TO CHANGE, and does not:
 *   • THE AMOUNT. It never sees one. The balance stays server-derived from the booking row
 *     (`balance_amount`) at the route, never from `req.body` (§14).
 *   • THE ACTOR. `sessionUserId` is the session's own id at the call site; this module has no
 *     access to a request body and takes no user id from one (§14).
 *   • OWNERSHIP. A collaborator who pays a balance does NOT become the booking's owner: nothing
 *     here writes, and `service_bookings.traveler_id` is untouched. Refunds therefore continue to
 *     flow to the original payment method per Stripe's own semantics — which, for a balance paid
 *     by a collaborator, means back to THAT COLLABORATOR'S CARD. No refund routing is built or
 *     implied by this file; that is Stripe returning money the way it came in.
 *   • THE CONCURRENCY GUARD. Authorization is not a claim. The atomic conditional
 *     (`UPDATE … WHERE status = 'deposit_paid' AND stripe_balance_intent_id IS NULL`) in
 *     `checkout-claim.service.ts` remains the ONE thing that decides which caller wins (§15) — a
 *     permission check is never a substitute for it, and a check-then-update is the bug.
 *
 * PURITY IS DELIBERATE. `canPayBalance` is a total function of facts already in hand, so it is
 * unit-testable with no database, no server and no Stripe (`server/__tests__/balance-payer.test.ts`).
 * The one DB read this lane needs lives in `loadBalancePayerParticipants`, below, which resolves
 * `../db` through a DYNAMIC import so a pure test can import this module without a DATABASE_URL.
 *
 * ONE HELPER, ONE CALLER. `POST /api/bookings/:id/pay-balance` (server/routes/payments.routes.ts)
 * is the only caller. A second copy of this predicate anywhere is the derivation-drift class
 * CLAUDE.md §18 rule 1 names — on a string that decides who may move money.
 */
import { TRIP_PARTICIPANT_ROLE_PAYER } from "@shared/schema";

/** The `service_bookings` columns the decision reads. Nothing else is consulted. */
export interface BalancePayerBooking {
  /** `service_bookings.traveler_id` — the OWNER, and the only identity that changes hands never. */
  travelerId?: string | null;
  /** `service_bookings.trip_id` — nullable on this table (a booking need not belong to a trip). */
  tripId?: string | null;
}

/** The `trip_participants` columns the decision reads. */
export interface BalancePayerParticipant {
  tripId?: string | null;
  userId?: string | null;
  role?: string | null;
}

export type BalancePayerRefusal =
  /** No authenticated actor at all — never treated as "the owner". */
  | "no_session_user"
  /** No booking to decide about. */
  | "no_booking"
  /** Not the owner, and no `payer` participant row on this booking's trip names this user. */
  | "not_owner_and_no_payer_role";

export type BalancePayerDecision =
  | { allowed: true; payerKind: "owner" | "participant_payer" }
  | { allowed: false; reason: BalancePayerRefusal };

/**
 * MAY THIS SESSION USER PAY THIS BOOKING'S BALANCE?
 *
 * @param booking                the booking row (owner + trip), server-read, never client-supplied.
 * @param sessionUserId          the acting user, FROM THE SESSION (§14) — never `req.body`.
 * @param tripParticipantRows    `trip_participants` rows to consider. The caller passes the rows
 *                               it looked up (see `loadBalancePayerParticipants`); this function
 *                               RE-CHECKS both the trip and the user on every row rather than
 *                               trusting the query's scoping, so a future caller that widens its
 *                               lookup cannot widen the grant by accident.
 *
 * Fail-closed everywhere: a blank actor, an absent booking, a participant row with a null
 * `user_id` (a non-registered guest — there is no account to authorize), a row on a DIFFERENT
 * trip, and any role that is not exactly `payer` all refuse.
 */
export function canPayBalance(
  booking: BalancePayerBooking | null | undefined,
  sessionUserId: string | null | undefined,
  tripParticipantRows: readonly BalancePayerParticipant[] = [],
): BalancePayerDecision {
  const actor = typeof sessionUserId === "string" ? sessionUserId.trim() : "";
  if (!actor) return { allowed: false, reason: "no_session_user" };
  if (!booking) return { allowed: false, reason: "no_booking" };

  // (a) The owner — the pre-ruling rule, unchanged.
  if (typeof booking.travelerId === "string" && booking.travelerId === actor) {
    return { allowed: true, payerKind: "owner" };
  }

  // (b) A `payer` participant on THIS booking's own trip. A booking with no trip has no
  // participants by construction, so it stays owner-only — never guessed onto another trip (§13).
  const tripId = typeof booking.tripId === "string" ? booking.tripId.trim() : "";
  if (!tripId) return { allowed: false, reason: "not_owner_and_no_payer_role" };

  const named = tripParticipantRows.some((row) => {
    if (!row) return false;
    // A participant with no `user_id` is a non-registered guest: there is no account this could
    // be, so it can never match an authenticated actor.
    if (typeof row.userId !== "string" || row.userId.trim() === "" || row.userId !== actor) return false;
    if (typeof row.tripId !== "string" || row.tripId !== tripId) return false;
    // EXACTLY `payer`. No trimming, no case-folding: a role that does not match the one shared
    // spelling is not the role, and widening the comparison here is how a money grant leaks.
    return row.role === TRIP_PARTICIPANT_ROLE_PAYER;
  });

  return named
    ? { allowed: true, payerKind: "participant_payer" }
    : { allowed: false, reason: "not_owner_and_no_payer_role" };
}

/**
 * THE STRIPE IDEMPOTENCY KEY FOR A BALANCE CHECKOUT — extended, not replaced.
 *
 * Before this ruling the key was `bal-<bookingId>`: deterministic per BOOKING, which was right
 * while the owner was the only possible payer. With two possible payers it is wrong in a way that
 * is not merely cosmetic — `createPaymentIntent` builds the PaymentIntent from the ACTOR (their
 * Stripe customer, their email, their saved card), so the same key presented with a different
 * actor is the same key with different parameters. Stripe's answer to that is either an
 * idempotency error or, worse, the FIRST payer's PaymentIntent handed to the second — a charge
 * against the wrong person's card.
 *
 * So the key carries the actor. The property that must not be lost, and is not: ONE payer
 * retrying/double-clicking still produces the SAME key and therefore the SAME single
 * PaymentIntent (§15 layer a). What changes is only that two DIFFERENT payers can no longer
 * collide on one key.
 *
 * Both parts are REQUIRED. An empty actor would silently degrade the key back to the pre-ruling
 * per-booking shape that two payers can share, so it throws rather than producing one.
 */
export function buildBalanceIdempotencyKey(bookingId: string, payerUserId: string): string {
  const booking = typeof bookingId === "string" ? bookingId.trim() : "";
  const payer = typeof payerUserId === "string" ? payerUserId.trim() : "";
  if (!booking) throw new Error("buildBalanceIdempotencyKey: bookingId is required");
  if (!payer) throw new Error("buildBalanceIdempotencyKey: payerUserId is required");
  return `bal-${booking}-${payer}`;
}

/**
 * The ONE DB read phase one needs: the acting user's OWN participant rows on the booking's trip.
 *
 * Scoped to (trip, user) on purpose — this never loads the party roster, so it discloses no other
 * participant's PII (the standing "L20 tier 4 — participant PII is OWNER-only" posture the
 * participant routes carry). `canPayBalance` re-checks both columns anyway.
 *
 * `../db` is imported DYNAMICALLY: `server/db.ts` throws at module load without a DATABASE_URL,
 * and the decision above must stay importable in a pure unit test.
 */
export async function loadBalancePayerParticipants(
  tripId: string,
  sessionUserId: string,
): Promise<BalancePayerParticipant[]> {
  if (!tripId || !sessionUserId) return [];
  const [{ db }, { and, eq }, { tripParticipants }] = await Promise.all([
    import("../db"),
    import("drizzle-orm"),
    import("@shared/schema"),
  ]);
  const rows = await db
    .select({
      tripId: tripParticipants.tripId,
      userId: tripParticipants.userId,
      role: tripParticipants.role,
    })
    .from(tripParticipants)
    .where(and(eq(tripParticipants.tripId, tripId), eq(tripParticipants.userId, sessionUserId)));
  return rows;
}
