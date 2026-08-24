/**
 * FP-1 / B4 — the ONE server-side derivation of `provider_services.city`
 * (docs/testing/PROVIDER_BATCH_EXERCISE.md, P1).
 *
 * THE DEFECT. `city` was added and backfilled by migration 129, but nothing on any write path has
 * ever set it, so every listing created since carries NULL — and the market page's city scoping
 * therefore falls back to substring-matching the free-text `location` column, which is the literal
 * default `'Unknown'` for any delivery method whose form never renders a service-area input. Of one
 * real Kyoto provider's eleven listings, seven never entered the Kyoto payload at all.
 *
 * §13 RULES ENFORCED HERE (the reason this is one shared helper and not inline per-route logic):
 *
 *  1. The city is derived from ONE structured signal: `provider_services.neighborhood`, which is a
 *     soft reference into `city_neighborhoods.slug`. That is the same source migration 129 used,
 *     and the only structured place-of-business signal a listing actually carries.
 *  2. The slug must resolve to EXACTLY ONE city. `city_neighborhoods`' uniqueness constraint is
 *     (city, country, slug) — slug is NOT globally unique by schema — so an ambiguous slug yields
 *     `null` and the row keeps its honest NULL. An absent city is honest; a wrong city puts a Kyoto
 *     guesthouse on Osaka's market page.
 *  3. FREE TEXT IS NEVER PARSED. No fuzzy matching against `location`, no city-name substring
 *     search, no geocode-string splitting, no city-centre default — that is inference dressed as
 *     data (`utils/service-location.ts` rule 5 refuses the same thing for coordinates).
 *  4. `city` is never read from the request body. It is server-derived or it is NULL.
 *
 * A listing with no neighborhood is honestly absent from every city payload rather than guessed
 * into the wrong one; giving it a city is a matter of the owner picking their neighborhood.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Resolve the city for a neighborhood slug, or `null` when it is absent, unknown, or ambiguous.
 * Case/whitespace-insensitive on the slug (the migration-011/012 LOWER(TRIM) pattern).
 */
export async function resolveCityForNeighborhood(
  neighborhoodSlug: string | null | undefined,
): Promise<string | null> {
  const slug = (neighborhoodSlug ?? "").trim().toLowerCase();
  if (!slug) return null;
  try {
    const result = await db.execute(sql`
      SELECT MIN(city) AS city, COUNT(DISTINCT city) AS n
        FROM city_neighborhoods
       WHERE LOWER(TRIM(slug)) = ${slug}
    `);
    const row = (result.rows?.[0] ?? null) as { city: string | null; n: number | string } | null;
    if (!row) return null;
    // Exactly one city, or nothing. Two cities sharing a slug is AMBIGUOUS, not a coin flip.
    if (Number(row.n) !== 1) return null;
    return row.city && row.city.trim() ? row.city : null;
  } catch (err) {
    // A lookup that cannot be computed must not fabricate a city, and must not fail the write it
    // decorates — the listing simply keeps the honest NULL (§13).
    console.error("[service-city] neighborhood → city lookup failed:", err);
    return null;
  }
}

/**
 * The `city` patch for a create/update, given the neighborhood value THAT WRITE will store.
 *
 * Returns `{}` when there is nothing to say (caller passed no neighborhood key at all) so an
 * unrelated edit never touches a stored city; returns `{ city: null }` when the neighborhood was
 * explicitly cleared or does not resolve, because a listing that no longer claims a neighborhood
 * must not keep a city derived from the old one.
 */
export async function deriveCityPatch(
  neighborhoodSlug: string | null | undefined,
  opts: { neighborhoodPresent: boolean },
): Promise<{ city?: string | null }> {
  if (!opts.neighborhoodPresent) return {};
  return { city: await resolveCityForNeighborhood(neighborhoodSlug) };
}
