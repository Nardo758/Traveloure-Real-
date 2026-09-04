/**
 * TRIP DESTINATIONS — the DATABASE-FREE half: admission and derivation.
 * Migration 281, ledger `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 34.
 *
 * WHY THIS IS A SEPARATE FILE FROM `trip-destinations.service.ts`.
 * The service imports `../db` and `../storage`, and `server/db.ts` THROWS at import time when
 * `DATABASE_URL` is unset. Everything decided before a row is written — the §19 allowlist, the
 * empty-list refusal, the cap, the server-derived positions, the both-or-neither coordinate rule
 * and the mirror rule — is pure, and putting it here is what lets it keep its proof in the DB-free
 * unit lane (`server/__tests__/trip-destinations.service.test.ts`). The service RE-EXPORTS every
 * symbol below, so callers still have one import to reach for and there is still exactly one
 * definition of each rule (§18 rule 1).
 */
import { z } from "zod";

/**
 * The most stops one plan may state. A cap, not a design claim: it exists so a single request
 * cannot write an unbounded child list. Stated here rather than in the route so every caller of the
 * one writer inherits it.
 */
export const MAX_TRIP_DESTINATIONS = 20;

/**
 * §19 ALLOWLIST — the ONLY fields a client may state about a stop.
 * `.strict()`: an unknown key is a refusal, not a silent strip. A silent strip is how a caller comes
 * to believe it set something the server ignored, and how a column added later becomes quietly
 * reachable without anyone deciding that it should be. `position`, `id` and `tripId` are absent by
 * construction: order comes from the ARRAY's order and the server numbers it.
 */
export const tripDestinationStopSchema = z
  .object({
    // The place as the traveler typed or picked it. Position 0's name becomes `trips.destination`.
    name: z.string().trim().min(1).max(255),
    // Optional structure a picker may already have resolved. Absent stays absent — neither is ever
    // derived FROM `name` here, because parsing a free-text place into city/country is a guess and
    // this module makes none (§13).
    city: z.string().trim().max(255).nullable().optional(),
    country: z.string().trim().max(255).nullable().optional(),
    // Coordinates come ONLY from an explicit placement, never from a lookup on read (ruling 22's
    // confirm-gated posture). Both or neither — enforced in normalizeTripDestinations.
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  })
  .strict();

/**
 * The request body: a NON-EMPTY ordered list, capped. `.min(1)` states the empty-list refusal as
 * schema rather than as a branch, so every caller inherits it.
 */
export const tripDestinationsBodySchema = z.object({
  stops: z.array(tripDestinationStopSchema).min(1).max(MAX_TRIP_DESTINATIONS),
});

export type TripDestinationStopInput = z.infer<typeof tripDestinationStopSchema>;

/** A stop normalized for insertion: coordinates resolved both-or-neither, position assigned. */
export interface NormalizedTripDestination {
  position: number;
  name: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

export type NormalizeResult =
  | { ok: true; rows: NormalizedTripDestination[] }
  | { ok: false; message: string };

/**
 * PURE. Derive the rows to store from the ordered input — no database, no clock, no network.
 *
 * POSITIONS ARE 0-BASED, unlike `service_route_points`' 1-based numbered pins, and that is the
 * mirror rule made structural: position 0 IS the primary destination, so the index a reader needs
 * in order to find the mirror is the array's own first one.
 */
export function normalizeTripDestinations(
  stops: readonly TripDestinationStopInput[],
): NormalizeResult {
  if (stops.length === 0) {
    // Unreachable through the schema (`.min(1)`), kept because this function is also the one place
    // an internal caller could hand over an empty list — and silence there would leave a plan with
    // no stops behind a mirror that still names one. `trips.destination` is NOT NULL.
    return { ok: false, message: "A plan needs at least one stop" };
  }
  if (stops.length > MAX_TRIP_DESTINATIONS) {
    return { ok: false, message: `A plan may hold at most ${MAX_TRIP_DESTINATIONS} stops` };
  }
  const rows: NormalizedTripDestination[] = [];
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const hasLat = typeof stop.lat === "number";
    const hasLng = typeof stop.lng === "number";
    if (hasLat !== hasLng) {
      // A half-coordinate is a guess waiting to happen (§13; the route-points precedent): both or
      // neither. REFUSED rather than quietly demoted to an unlocated stop, because the caller
      // plainly believed it was placing this one and a silent demotion hides the fault.
      return { ok: false, message: `Stop ${i + 1} must carry both lat and lng, or neither` };
    }
    rows.push({
      position: i,
      name: stop.name,
      city: stop.city ?? null,
      country: stop.country ?? null,
      lat: hasLat ? (stop.lat as number) : null,
      lng: hasLng ? (stop.lng as number) : null,
    });
  }
  return { ok: true, rows };
}

/**
 * PURE. The mirror: what `trips.destination` must become for this list. Stated as its own function
 * so the rule has a name, exactly one definition, and a test that needs no database.
 */
export function mirrorDestinationFor(rows: readonly NormalizedTripDestination[]): string {
  return rows[0].name;
}
