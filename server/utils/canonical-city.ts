import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Resolve a city name (in ANY casing) to its CANONICAL stored form, or null.
 *
 * The marketplace tables (`city_neighborhoods`, `travel_pulse_hidden_gems`,
 * `provider_services`) store the human title-case name ("Kyoto") and were read
 * with case-sensitive `=`, so a mis-cased URL (`/kyoto`) matched nothing and the
 * feed came back partially empty (neighborhoods + gems + services all `[]`,
 * while the `ilike`/`lower()` sections — DMO, calendar — still populated). This
 * looks the incoming name up case-insensitively against the two authorities and
 * returns the stored casing:
 *   1. `city_neighborhoods.city` — the marketplace canonical.
 *   2. `travel_pulse_cities.city_name` — a city that has a hero/pulse row but no
 *      neighbourhoods seeded yet.
 *
 * Returns null when the city is unknown to both. An unknown city stays honestly
 * EMPTY (§13) — never guessed into an existing one — and its URL is never
 * redirected. Both the location-view service (data match) and the
 * `/discover/location/:city` 301 handler (URL canonicalisation) call this, so
 * "what counts as the same city" has ONE definition.
 */
export async function resolveCanonicalCity(raw: string): Promise<string | null> {
  const name = (raw ?? "").trim();
  if (!name) return null;

  const nb = await db.execute(
    sql`SELECT city FROM city_neighborhoods WHERE lower(city) = lower(${name}) ORDER BY city LIMIT 1`,
  );
  const nbCity = (nb.rows[0] as any)?.city as string | undefined;
  if (nbCity) return nbCity;

  const tp = await db.execute(
    sql`SELECT city_name AS "cityName" FROM travel_pulse_cities WHERE lower(city_name) = lower(${name}) ORDER BY city_name LIMIT 1`,
  );
  const tpCity = (tp.rows[0] as any)?.cityName as string | undefined;
  return tpCity ?? null;
}
