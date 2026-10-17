/**
 * The launch-city centroids, and the Route Matrix call the stay pick still makes live (Track A step A2, ledger
 * `2026-09-29-a2-travel-time-matrix`; S1, ledger `2026-10-09-s1-one-stay`).
 *
 * 9b-b (ledger `2026-10-16-9b-b-legs-off-google`; 9b spec T1, Phase 0 ruling 1): the `travel_time_matrix` is
 * RETIRED. Its cells were Google Route Matrix durations, which may not be stored: `refreshMarketMatrix` and
 * `loadMatrixReader` are deleted, `POST /internal/jobs/travel-matrix-refresh` answers 410, and every former reader
 * uses `loadEstimateReader` (the market's centroids, no cells — the labelled straight-line estimate). The stay
 * pick's live matrix call (`gatedRouteMatrixFetch`) keeps only counts and ranks, never minutes (`shared/stay-pick.ts`).
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { resolveTravelTime, type Centroid, type LatLng, type TravelMode, type TravelTime } from "@shared/travel-time";
import { essentialsPricePer1000, proPricePer1000 } from "../config/travel-matrix.config";
import { gatedMapsCall } from "./maps-billing/maps-billing.service";

const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const ROUTE_MATRIX_FIELD_MASK = "originIndex,destinationIndex,duration,distanceMeters,condition";

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

/** One element as the Routes API streams it back. */
export interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  duration?: string; // "123s"
  distanceMeters?: number;
  condition?: string; // ROUTE_EXISTS | ROUTE_NOT_FOUND
}

export type RouteMatrixFetch = (body: Record<string, unknown>) => Promise<RouteMatrixElement[]>;

/** The live Routes API call. Throws on a non-2xx answer (the run records it and stops). */
export function googleRouteMatrixFetch(apiKey: string): RouteMatrixFetch {
  return async (body) => {
    const res = await fetch(ROUTE_MATRIX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": ROUTE_MATRIX_FIELD_MASK },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`computeRouteMatrix ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    return Array.isArray(json) ? (json as RouteMatrixElement[]) : [];
  };
}

/**
 * R299: the live call behind the Maps billing gate (`route_matrix`). Each batch counts its ELEMENTS
 * against the daily cap; a refused batch throws, which fails the run exactly like an API error
 * (the run row records it). The cost stays on the refresh row (`costRecordedOn`), never twice —
 * except for a caller that passes `costHere`, which has no refresh row and records it on the gate row.
 */
export function gatedRouteMatrixFetch(opts: { costHere?: { purpose: string; ref?: string | null } } = {}): RouteMatrixFetch {
  return async (body) => {
    const elements =
      (Array.isArray(body.origins) ? body.origins.length : 0) * (Array.isArray(body.destinations) ? body.destinations.length : 0);
    const transit = body.travelMode === "TRANSIT";
    // FU-S1-1 (ledger `2026-10-09-fu-s1-1-stay-pick-cost`): a caller with no refresh row (the stay pick)
    // records its cost on the gate row, at the SAME per-SKU list price a refresh run is costed at.
    const costHere = opts.costHere
      ? { ...opts.costHere, usdPer1000: transit ? proPricePer1000() : essentialsPricePer1000() }
      : undefined;
    const out = await gatedMapsCall(
      "route_matrix",
      async (apiKey) => ({ value: await googleRouteMatrixFetch(apiKey)(body), units: Math.max(1, elements) }),
      { sku: transit ? "compute_route_matrix_pro" : "compute_route_matrix_essentials", costHere },
    );
    if ("refused" in out) throw new Error(`computeRouteMatrix refused by the Maps billing gate: ${out.refused}`);
    return out.value;
  };
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

