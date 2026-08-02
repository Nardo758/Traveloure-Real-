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
  | "system";

export type TransitionEventType = "status_transition" | "variant_applied";

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
