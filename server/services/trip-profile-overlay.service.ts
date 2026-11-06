/**
 * TC-3b — the trip profile overlay's DB half (ledger `2026-10-11-tc3b-ride-recommender`; shared/trip-profile-overlay.ts
 * holds the rules). `trips.preferences.profileOverlay` has exactly two writers, both here, both one atomic UPDATE on
 * the jsonb (never a read-modify-write, §15):
 *   · `writeTripProfileOverlay` — the owner's PUT body (mobility, pace, budget, scenic, child heights);
 *   · `addSkippedCorridor` — the dismiss route's "no suggestion on this leg again this trip" (ruling 3).
 * `storage.createTrip` / `updateTrip` strip a client-sent `profileOverlay` and keep the stored one, so the general
 * trip rails can neither forge nor wipe it (§19 layer 2).
 */
import { PLAN_OPENS_ON_KEY } from "@shared/plan-view";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";
import { parseTripProfileOverlay, SKIPPED_CORRIDORS_MAX, TRIP_PROFILE_OVERLAY_KEY, type TripProfileOverlay } from "@shared/trip-profile-overlay";

export async function readTripProfileOverlay(tripId: string): Promise<TripProfileOverlay> {
  const [row] = await db.select({ preferences: trips.preferences }).from(trips).where(eq(trips.id, tripId)).limit(1);
  return parseTripProfileOverlay(row?.preferences);
}

/** Merge a validated patch into the overlay; a `null` field is removed. Returns the overlay as stored. */
export async function writeTripProfileOverlay(tripId: string, patch: Record<string, unknown>): Promise<TripProfileOverlay | null> {
  const [row] = await db
    .update(trips)
    .set({
      preferences: sql`jsonb_set(
        COALESCE(${trips.preferences}, '{}'::jsonb),
        ${`{${TRIP_PROFILE_OVERLAY_KEY}}`}::text[],
        jsonb_strip_nulls(COALESCE(${trips.preferences} -> ${TRIP_PROFILE_OVERLAY_KEY}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)
      )`,
      updatedAt: new Date(),
    } as any)
    .where(eq(trips.id, tripId))
    .returning({ preferences: trips.preferences });
  return row ? parseTripProfileOverlay(row.preferences) : null;
}

/** Close one corridor for this trip. Idempotent: a key already present writes nothing new. */
export async function addSkippedCorridor(tripId: string, corridorKey: string): Promise<boolean> {
  const rows = await db.execute(sql`
    UPDATE trips
       SET preferences = jsonb_set(
             jsonb_set(COALESCE(preferences, '{}'::jsonb), ${`{${TRIP_PROFILE_OVERLAY_KEY}}`}::text[],
                       COALESCE(preferences -> ${TRIP_PROFILE_OVERLAY_KEY}, '{}'::jsonb)),
             ${`{${TRIP_PROFILE_OVERLAY_KEY},skippedCorridors}`}::text[],
             COALESCE(preferences -> ${TRIP_PROFILE_OVERLAY_KEY} -> 'skippedCorridors', '[]'::jsonb) || to_jsonb(${corridorKey}::text)
           ),
           updated_at = NOW()
     WHERE id = ${tripId}
       AND NOT (COALESCE(preferences -> ${TRIP_PROFILE_OVERLAY_KEY} -> 'skippedCorridors', '[]'::jsonb) ? ${corridorKey})
       AND jsonb_array_length(COALESCE(preferences -> ${TRIP_PROFILE_OVERLAY_KEY} -> 'skippedCorridors', '[]'::jsonb)) < ${SKIPPED_CORRIDORS_MAX}
     RETURNING id`);
  return ((rows as any).rows ?? rows).length > 0;
}

/**
 * §19 layer 2 for the general trip rails: a client-sent `preferences` never carries its own overlay. On a mint the
 * key is dropped; on an update the stored overlay is kept (one SQL expression, so no read-modify-write).
 */
/**
 * The `trips.preferences` keys only the server writes: the profile overlay (TC-3b) and PLAN-1 Phase 2's `opensOn` (a
 * plan created from the map). A client-sent `preferences` never carries them, and a client update never erases them.
 */
export const SERVER_OWNED_TRIP_PREFERENCE_KEYS = [TRIP_PROFILE_OVERLAY_KEY, PLAN_OPENS_ON_KEY] as const;

export function stripClientProfileOverlay<T extends Record<string, unknown> | null | undefined>(preferences: T): T {
  if (!preferences || typeof preferences !== "object") return preferences;
  if (!SERVER_OWNED_TRIP_PREFERENCE_KEYS.some((k) => k in (preferences as Record<string, unknown>))) return preferences;
  const rest = { ...(preferences as Record<string, unknown>) };
  for (const k of SERVER_OWNED_TRIP_PREFERENCE_KEYS) delete rest[k];
  return rest as T;
}

export function preferencesKeepingStoredOverlay(incoming: Record<string, unknown>) {
  const keep = SERVER_OWNED_TRIP_PREFERENCE_KEYS.map(
    (k) => sql` || CASE WHEN ${trips.preferences} ? ${k} THEN jsonb_build_object(${k}::text, ${trips.preferences} -> ${k}) ELSE '{}'::jsonb END`,
  );
  return sql`(${JSON.stringify(stripClientProfileOverlay(incoming))}::jsonb)${sql.join(keep, sql``)}`;
}
