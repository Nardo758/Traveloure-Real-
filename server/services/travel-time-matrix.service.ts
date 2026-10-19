/**
 * The launch-city centroids and the labelled straight-line estimate reader (Track A step A2, ledger
 * `2026-09-29-a2-travel-time-matrix`).
 *
 * 9b-b (ledger `2026-10-16-9b-b-legs-off-google`; 9b spec T1, Phase 0 ruling 1): the `travel_time_matrix` is
 * RETIRED. Its cells were Google Route Matrix durations, which may not be stored: `refreshMarketMatrix` and
 * `loadMatrixReader` are deleted, `POST /internal/jobs/travel-matrix-refresh` answers 410, and every former reader
 * uses `loadEstimateReader` (the market's centroids, no cells — the labelled straight-line estimate).
 *
 * LG-2 (ledger `2026-10-18-lg2-route-matrix-delete`): the two live Route Matrix functions (`googleRouteMatrixFetch`,
 * `gatedRouteMatrixFetch`) had no caller once the stay pick moved to open coordinates and OSRM, and are deleted with
 * their price config; migration 392 deletes the stored Google cells.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveTravelTime, type Centroid, type LatLng, type TravelMode, type TravelTime } from "@shared/travel-time";

/** The market's centroids, from `city_neighborhoods`. An unknown market has none. */
export async function loadMarketCentroids(marketSlug: string): Promise<Centroid[]> {
  const market = OPERATING_MARKETS.find((m) => m.marketKey === marketSlug);
  if (!market) return [];
  const result = await db.execute(sql`
    SELECT slug, centroid_lat, centroid_lng, radius_km FROM city_neighborhoods
    WHERE lower(city) = lower(${market.cityName})
    ORDER BY slug
  `);
  return (result.rows as any[])
    .map((r) => ({
      slug: String(r.slug),
      lat: Number(r.centroid_lat),
      lng: Number(r.centroid_lng),
      radiusKm: r.radius_km == null ? 1.5 : Number(r.radius_km),
    }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

/**
 * 9b-b (ledger `2026-10-16-9b-b-legs-off-google`; 9b spec T1, Phase 0 ruling 1): THE MATRIX IS RETIRED AS A
 * SOURCE. Its cells are Google Route Matrix durations, which may not be stored, so no reader reads them: every
 * caller that read the matrix reads this instead — the SAME `resolveTravelTime` with the market's centroids and
 * no cells, so every pair answers the labelled straight-line estimate ("est.", §13). The refresh job and the reader
 * are deleted; the table goes in the deletion PR (after "delete approved — Leon").
 */
export async function loadEstimateReader(
  marketSlug: string,
  loadCentroids: (market: string) => Promise<Centroid[]> = loadMarketCentroids,
): Promise<(from: LatLng, to: LatLng, mode: TravelMode) => TravelTime> {
  const centroids = marketSlug ? await loadCentroids(marketSlug) : [];
  return (from, to, mode) => resolveTravelTime({ from, to, mode, centroids, lookup: () => undefined });
}

