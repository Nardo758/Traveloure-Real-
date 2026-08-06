/**
 * ITEM TRANSITION LOG — the slip's diary (Lane S; dispatch §3 as amended by rulings 11/12/16/18).
 *
 * ONE writer module for `item_transition_log`. Every `routing_status` transition writes a row in
 * the SAME transaction as the flip (ruling 18): callers pass their `tx` so the pair is
 * all-or-nothing. Trip-scoped events (`variant_applied`, ruling 16) carry `itemId: null`.
 *
 * APPEND-ONLY: this module exposes inserts and reads ONLY. Do not add an UPDATE or DELETE — the
 * diary's integrity is the point (ruling 11 kept `itinerary_changes`, with its owner-DELETE
 * endpoint, as a separate display feed precisely because a deletable table cannot carry audit
 * invariants).
 *
 * Future subscription hook: the expert PULL→PUSH notification lane will attach a listener to this
 * insert path. Do NOT build notifications here now.
 */
import { count, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { itemTransitionLog, type ItemTransitionLogEntry } from "@shared/schema";

/** Everything that can move the slip. Matches the dispatch §3 actor vocabulary. */
export type TransitionActorType =
  | "traveler"
  | "expert"
  | "checkout"
  | "refund"
  | "optimizer"
  | "system"
  // Legacy-reconciliation lane (tasks #212/#213): the Stripe `payment_intent.succeeded` webhook
  // acting as the reconciliation caller. Distinct from `traveler` (the client polling
  // /api/bookings/confirm-payment) precisely so a diary row answers "which signal promoted this
  // booking?" — the redundancy on the money path is only worth having if it is attributable.
  // No DB CHECK on actor_type (migration 171 posture), so this is a code-only vocabulary add.
  | "webhook";

export type TransitionEventType =
  | "status_transition"
  | "variant_applied"
  // R-F (Console Realign, Trip Card delivery): trip-scoped (itemId null) Finalize/reopen events.
  | "plan_finalized"
  | "plan_reopened"
  // Task 1028 (Console Sigma ABSENCE fix): trip-scoped (itemId NULL, ruling 16) expert workspace
  // draft → in_review → delivered transitions, logged in the same transaction as the flip
  // (rulings 12/18) so disputes over when work was delivered have an audit trail.
  | "workspace_status_transition"
  // Ruling 38 (checkout atomicity): the TTL reclaim of a checkout claim that never reached an
  // authorization — booking voided, slot capacity handed back. from/to status are NULL because
  // the item's own routing_status never moved (the purchased flip lives AFTER authorization, so
  // an expired claim never reached it). Item-grained when the claim carried a plan item,
  // trip-grained (itemId NULL, ruling 16) otherwise. Written in the SAME transaction as the void
  // so reclaimed inventory is auditable rather than silently reappearing.
  | "checkout_claim_expired"
  // Legacy-reconciliation lane (#212/#213): the PAYMENT promotion — a checkout claim that was
  // authorized and has now been PAID moves `payment_pending → confirmed`. Written in the SAME
  // transaction as that flip (rulings 12/18) by whichever signal won the race, with `actorType`
  // recording which one (`webhook` | `traveler`). from/to carry the BOOKING statuses, not the
  // item's routing_status (the item's own `ready_for_checkout → purchased` edge was already
  // written at authorization time by markItemPurchased — this event is the money leg).
  | "checkout_payment_confirmed"
  // Legacy-reconciliation lane (#212/#213): a payment signal arrived for a booking that is NOT
  // in a promotable state — canonically a LATE webhook for a row the TTL sweep already voided.
  // The row is NEVER resurrected (void wins after TTL); the exception is recorded here and on
  // the booking row so it is ops-visible rather than silent. NOTE: kept ≤30 chars — event_type
  // is varchar(30) (migration 171), so `checkout_reconciliation_exception` would not fit.
  | "checkout_reconcile_exception";

/** The executor shape both `db` and a drizzle `tx` satisfy — callers inside a transaction MUST
 *  pass their `tx` (ruling 18: same-transaction pair), everything else may pass `db`. */
type Executor = Pick<typeof db, "insert">;

export interface TransitionLogEntry {
  tripId: string;
  itemId: string | null;
  eventType: TransitionEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorType: TransitionActorType;
  actorId?: string | null;
}

/** Insert one diary row. Throws on failure — atomicity with the flip is the CALLER's transaction;
 *  whether a failure may propagate past the pair (traveler edges: yes, 500) or must be swallowed
 *  after rollback (money edges: never fail a checkout/refund) is the caller's contract. */
export async function logItemTransition(executor: Executor, entry: TransitionLogEntry): Promise<void> {
  await executor.insert(itemTransitionLog).values({
    tripId: entry.tripId,
    itemId: entry.itemId,
    eventType: entry.eventType,
    fromStatus: entry.fromStatus ?? null,
    toStatus: entry.toStatus ?? null,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
  });
}

/** The slip's version number = count of logged events (display-only, NEVER stored — dispatch §3).
 *  "v14" means fourteen diary rows. History starts when the log starts; pre-existing trips
 *  honestly count from zero (no synthetic backfill — §13). */
export async function getTripTransitionCount(tripId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(itemTransitionLog)
    .where(eq(itemTransitionLog.tripId, tripId));
  return Number(row?.n ?? 0);
}

/** The slip's recent diary, newest first (Spec A `<TransitionLogFooter>` — dispatch §4).
 *  READ ONLY — this module stays append-only (inserts + reads, never UPDATE/DELETE).
 *  Rides the `itl_trip_created_idx` (tripId, createdAt) index. Empty array for trips
 *  predating the log — honest, never synthesized (§13). */
export async function getRecentTripTransitions(
  tripId: string,
  limit = 20,
): Promise<ItemTransitionLogEntry[]> {
  return db
    .select()
    .from(itemTransitionLog)
    .where(eq(itemTransitionLog.tripId, tripId))
    .orderBy(desc(itemTransitionLog.createdAt))
    .limit(limit);
}
