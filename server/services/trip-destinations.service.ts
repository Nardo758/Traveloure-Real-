/**
 * TRIP DESTINATIONS — the ONE writer and the ONE reader of a plan's ordered stops.
 * Migration 281, ledger `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 34.
 *
 * WHY A MODULE AND NOT AN INLINE HANDLER.
 * The stop list and `trips.destination` are ONE fact recorded in two places: the list is the
 * ordered truth, `trips.destination` is its POSITION-0 MIRROR — the single string every existing
 * reader (the market/timezone derivations in `storage.createTrip`/`updateTrip`, the .ics export,
 * the slip, the trip PDF) still uses, and which stays NOT NULL. A second place that writes stops
 * would be a second place that has to remember the mirror rule, and forgetting it once leaves a
 * plan whose headline destination is not its first stop. That is the derivation-drift class §18
 * rule 1 names, so there is exactly one `replaceTripDestinations` and every rail calls it.
 *
 * IT IS DELIBERATELY NOT A DATABASE TRIGGER. A trigger would be a second author of
 * `trips.destination` — the thing this module exists to prevent — and, the deciding reason, it
 * could not re-run the server-side derivations that hang off that column: `market_slug` and
 * `timezone` (ruling 30) are resolved inside `storage.updateTrip` from the destination string. So
 * the mirror is written THROUGH `storage.updateTrip`, which means changing the first stop
 * re-derives the plan's market and its IANA zone in the same operation, exactly as editing the
 * destination by hand already does.
 *
 * §19 — ADMISSION IS AN ALLOWLIST, AND POSITIONS ARE NEVER CLIENT-SUPPLIED. The allowlist, the
 * cap, the empty-list refusal, the both-or-neither coordinate rule and the mirror rule all live in
 * `./trip-destinations.pure` (DB-free so they keep their proof in the unit lane) and are RE-EXPORTED
 * here, so a caller has one import to reach for and each rule still has exactly one definition.
 *
 * §13 — THE ABSENCES ARE REAL ANSWERS.
 *   · NO ROWS AT ALL = NOT CAPTURED. Legacy plans have none, and there is no backfill, deliberately:
 *     manufacturing a position-0 row for every trip on disk would turn "we never asked" into "the
 *     traveler said one stop". Every reader falls back to `trips.destination` EXPLICITLY and says
 *     so — it never renders such a plan as having nowhere to go.
 *   · lat/lng NULL = UNLOCATED. The stop stays visibly flagged and is never guessed onto a map: no
 *     city-center fallback, no geocode-on-read.
 *   · AN EMPTY LIST IS REFUSED, not stored. `trips.destination` is NOT NULL, so "this plan has zero
 *     stops" is not a state the schema can hold, and accepting it would mean either inventing a
 *     destination or leaving a stale one as the mirror of nothing.
 */
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { tripDestinations, type TripDestination } from "@shared/schema";
import {
  mirrorDestinationFor,
  normalizeTripDestinations,
  type TripDestinationStopInput,
} from "./trip-destinations.pure";

export {
  MAX_TRIP_DESTINATIONS,
  mirrorDestinationFor,
  normalizeTripDestinations,
  tripDestinationStopSchema,
  tripDestinationsBodySchema,
} from "./trip-destinations.pure";
export type {
  NormalizedTripDestination,
  NormalizeResult,
  TripDestinationStopInput,
} from "./trip-destinations.pure";

/**
 * The plan's stops, in order. NO AUTHORIZATION HERE — this reads by trip alone, exactly like
 * `getItineraryItems`, and every caller gates the trip first.
 *
 * An empty array is the honest NOT CAPTURED answer, never an error: the caller falls back to
 * `trips.destination` and says so (§13).
 */
export async function getTripDestinations(tripId: string): Promise<TripDestination[]> {
  return await db
    .select()
    .from(tripDestinations)
    .where(eq(tripDestinations.tripId, tripId))
    .orderBy(asc(tripDestinations.position));
}

export type ReplaceResult =
  | { ok: true; destinations: TripDestination[] }
  | { ok: false; message: string };

/**
 * THE ONE WRITER. Replace-list: the caller submits the full ordered list, the server derives the
 * positions, and the plan's headline destination is re-mirrored from the first stop.
 *
 * ORDER OF THE TWO WRITES, AND WHAT IS NOT ATOMIC ACROSS THEM — said out loud rather than implied.
 * The child-row delete+insert is ONE transaction, taking `FOR UPDATE` on the parent trip first so
 * two concurrent replaces serialize instead of colliding on the (trip_id, position) UNIQUE — the
 * exact race `replaceServiceRoutePoints` documents. The MIRROR is a second statement, because it
 * must go through `storage.updateTrip` to re-derive `market_slug` and `timezone` (ruling 30) and
 * that writer takes no transaction handle. A failure between the two therefore leaves the LIST
 * saved and the mirror stale. That is the honest failure mode and the recoverable one: a full
 * replace is idempotent, so the same request retried converges, and until it does the list — not
 * the mirror — is the ordered truth. The reverse order was rejected because mirroring first would
 * point `trips.destination` at a stop the plan does not yet contain.
 */
export async function replaceTripDestinations(
  tripId: string,
  stops: readonly TripDestinationStopInput[],
): Promise<ReplaceResult> {
  const normalized = normalizeTripDestinations(stops);
  if (!normalized.ok) return normalized;
  const rows = normalized.rows;

  const inserted = await db.transaction(async (tx) => {
    // Serialize concurrent replaces on the same plan. Under READ COMMITTED two parallel
    // delete+insert transactions each miss the other's rows and then collide on the composite
    // UNIQUE; locking the parent makes the second caller wait and replace cleanly.
    await tx.execute(sql`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`);
    await tx.delete(tripDestinations).where(eq(tripDestinations.tripId, tripId));
    return await tx
      .insert(tripDestinations)
      .values(
        rows.map((row) => ({
          tripId,
          position: row.position,
          name: row.name,
          city: row.city,
          country: row.country,
          // decimal columns round-trip as strings in drizzle — the same shape
          // `service_route_points` already returns. NULL stays NULL: unlocated, never zero.
          lat: row.lat === null ? null : String(row.lat),
          lng: row.lng === null ? null : String(row.lng),
        })),
      )
      .returning();
  });

  // The mirror, through `storage.updateTrip` deliberately: that is where `market_slug` and
  // `timezone` are re-derived from the destination string (§14 posture — both are server-derived,
  // neither is client-settable), so changing the first stop moves the plan's market and zone with
  // it instead of leaving the previous city's answers attached to a new place.
  await storage.updateTrip(tripId, { destination: mirrorDestinationFor(rows) });

  return { ok: true, destinations: inserted };
}
