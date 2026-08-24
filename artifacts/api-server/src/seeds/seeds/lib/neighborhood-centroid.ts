/**
 * Shared seed-time helper: resolve a `provider_services.neighborhood` value
 * (a slug, per CLAUDE.md "soft reference into city_neighborhoods.slug") against
 * `city_neighborhoods` and return its centroid — the SAME slug-first-then-name
 * match migration 129 (and its post-129 re-run, migration 162) apply as a
 * one-time DB backfill, applied here at INSERT time so seeded rows are never
 * born NULL-coordinate in the first place.
 *
 * NEVER FABRICATES / NEVER GEOCODES: a miss returns `null` and callers must
 * leave latitude/longitude/city/locationPrecision unset (NULL is the honest
 * state — the CLAUDE.md `location='Unknown'` lesson). Do not add a city-center
 * or any other fallback here.
 */
import { db } from "../../db";
import { cityNeighborhoods } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface NeighborhoodCentroid {
  latitude: string;
  longitude: string;
  city: string;
  locationPrecision: "neighborhood_centroid";
}

export async function resolveNeighborhoodCentroid(
  neighborhood: string | null | undefined,
): Promise<NeighborhoodCentroid | null> {
  const needle = neighborhood?.trim().toLowerCase();
  if (!needle) return null;

  const rows = await db
    .select({
      slug: cityNeighborhoods.slug,
      name: cityNeighborhoods.name,
      centroidLat: cityNeighborhoods.centroidLat,
      centroidLng: cityNeighborhoods.centroidLng,
      city: cityNeighborhoods.city,
    })
    .from(cityNeighborhoods)
    .where(
      sql`LOWER(TRIM(${cityNeighborhoods.slug})) = ${needle} OR LOWER(TRIM(${cityNeighborhoods.name})) = ${needle}`,
    );

  if (rows.length === 0) return null;

  // Prefer the slug match (matches migration 129/162's ORDER BY preference —
  // slug is the documented soft-reference key; name is a robustness fallback).
  const match = rows.find((r) => r.slug.trim().toLowerCase() === needle) ?? rows[0];

  return {
    latitude: match.centroidLat,
    longitude: match.centroidLng,
    city: match.city,
    locationPrecision: "neighborhood_centroid",
  };
}
