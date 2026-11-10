/**
 * The legacy crowd/pulse fields a public route must never carry.
 *
 * Ruling (ledger `2026-09-29-travelpulse-hygiene`): the legacy `travel_pulse_cities.crowd_level`
 * leaves EVERY public route that carried it. The keys are listed once here so the server's public
 * projections and the DB lane's own pin read the same set.
 *
 * Why this exists at all: R2-2 made the Kyoto recommendations section SUCCEED (it had been failing
 * with "country unknown"), and the recommendation engine's payload carries
 * `seasonalInsight.crowdLevel` — a legacy claim that had simply never reached the page because the
 * section was always empty. The DB lane caught it (`travelpulse-public-crowd.db.test.ts` T1) the
 * moment the section started answering, which is exactly what that pin is for.
 */

/** The retired field names, in every casing the codebase has used for them. */
export const LEGACY_CROWD_KEYS: readonly string[] = [
  "crowdLevel",
  "seasonCrowdLevel",
  "pulseScore",
  "crowd_level",
  "pulse_score",
];

/**
 * A copy of `value` with every legacy crowd/pulse key removed, at any depth.
 *
 * Immutable: the input is never mutated, because the same object can be a cached payload or a row
 * another section still reads. Arrays keep their order; `null`/primitives pass through unchanged.
 */
export function stripLegacyCrowdFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripLegacyCrowdFields(entry)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (LEGACY_CROWD_KEYS.includes(key)) continue;
      out[key] = stripLegacyCrowdFields(entry);
    }
    return out as T;
  }
  return value;
}
