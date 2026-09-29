/**
 * THE LAUNCH-CITY TRAVEL-TIME MATRIX — refresh job and read helper (Track A step A2; ledger
 * `2026-09-29-a2-travel-time-matrix`; product map §M3/§M4, R186). The ONE writer of
 * `travel_time_matrix` and `travel_time_matrix_refreshes`; the pure rules are `@shared/travel-time`.
 *
 * REFRESH (`refreshMarketMatrix`):
 *   · runs ONLY where `GOOGLE_MAPS_API_KEY` is set — the Routes API with Compute Route Matrix enabled.
 *     With no key it records nothing and answers `skipped: "no_api_key"`. This session never runs it;
 *     the first refresh is the operator's signal on Replit (`POST /internal/jobs/travel-matrix-refresh`).
 *   · centroid × centroid for each mode (walk, transit), batched to the per-request cap (transit
 *     100 ⇒ 10×10), transit routed at a weekday daytime departure so a night-time run is not a
 *     matrix of "no route".
 *   · COST-TRACKED: the run row records the elements asked for and returned and the unit prices it
 *     was costed at (config, read at run time). A run whose CEILING cost exceeds the configured
 *     maximum is refused before any call (§M4's Kyoto planning ceiling is $72).
 *   · Writes each cell with an UPSERT on (market, origin, dest, mode), so a re-run replaces rather
 *     than duplicates; a pair the API returned no route for is stored with NULL duration (§13).
 *   · A failed batch fails the RUN (status `failed`, error recorded); cells already written by
 *     earlier batches stay — they are real answers — and the next run replaces them.
 *
 * READ (`loadMatrixReader`): one query per market for centroids + cells, then the pure
 * `resolveTravelTime` for every pair — matrix when it answers, the labelled "est." otherwise.
 */
import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { travelTimeMatrix, travelTimeMatrixRefreshes } from "@shared/schema";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import {
  centroidFingerprint,
  estimateRefreshCost,
  matrixKey,
  planMatrixBatches,
  refreshDue,
  resolveTravelTime,
  type Centroid,
  type LatLng,
  type MatrixCell,
  type TravelMode,
  type TravelTime,
} from "@shared/travel-time";
import {
  ceilingPricePer1000,
  essentialsPricePer1000,
  maxRefreshCeilingUsd,
  otherElementsPerRequest,
  proPricePer1000,
  refreshAfterDays,
  transitDepartureLocalTime,
  transitElementsPerRequest,
} from "../config/travel-matrix.config";
import { MARKET_TIMEZONES } from "./trend-engine/operating-markets";

const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const ROUTE_MATRIX_FIELD_MASK = "originIndex,destinationIndex,duration,distanceMeters,condition";
const ALL_MODES: readonly TravelMode[] = ["walk", "transit"];

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

export const centroidHash = (centroids: readonly Centroid[]) =>
  crypto.createHash("sha256").update(centroidFingerprint(centroids)).digest("hex");

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

/** The next weekday (Mon–Fri) at `HH:MM` in `zone`, as an RFC 3339 instant. */
export function nextWeekdayDeparture(zone: string, hhmm: string, now = new Date()): string {
  const [h, m] = hhmm.split(":").map(Number);
  for (let add = 1; add <= 7; add++) {
    const day = new Date(now.getTime() + add * 86_400_000);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
        .formatToParts(day)
        .map((p) => [p.type, p.value]),
    );
    if (parts.weekday === "Sat" || parts.weekday === "Sun") continue;
    // The zone's offset at that local wall time, found by formatting a UTC guess back through the zone.
    const guess = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h, m);
    const asZone = new Date(new Date(guess).toLocaleString("en-US", { timeZone: zone }));
    const asUtc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }));
    return new Date(guess - (asZone.getTime() - asUtc.getTime())).toISOString();
  }
  return now.toISOString();
}

const waypoint = (c: Centroid) => ({ waypoint: { location: { latLng: { latitude: c.lat, longitude: c.lng } } } });
const parseSeconds = (d?: string) => (d && /^\d+(\.\d+)?s$/.test(d) ? Math.round(Number(d.slice(0, -1))) : null);

export type RefreshOutcome =
  | { skipped: "no_api_key" | "no_centroids" | "not_due"; market: string; reason?: string }
  | { refused: "over_ceiling"; market: string; ceilingUsd: number; maxUsd: number }
  | { refreshId: string; market: string; status: "complete" | "failed"; elementsRequested: number; elementsReturned: number; listUsd: number; error?: string };

/**
 * Refresh one market's matrix. `force` runs even when not due (the operator's explicit signal);
 * `fetchMatrix` is injectable so the job is proven without the network.
 */
export async function refreshMarketMatrix(opts: {
  marketSlug: string;
  force?: boolean;
  fetchMatrix?: RouteMatrixFetch;
  now?: Date;
  /** Test seam: the centroids to use instead of `city_neighborhoods`. */
  loadCentroids?: (market: string) => Promise<Centroid[]>;
}): Promise<RefreshOutcome> {
  const market = opts.marketSlug;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!opts.fetchMatrix && !apiKey) return { skipped: "no_api_key", market };
  const fetchMatrix = opts.fetchMatrix ?? googleRouteMatrixFetch(apiKey!);
  const now = opts.now ?? new Date();

  const centroids = await (opts.loadCentroids ?? loadMarketCentroids)(market);
  if (centroids.length < 2) return { skipped: "no_centroids", market };
  const hash = centroidHash(centroids);

  if (!opts.force) {
    const [last] = await db
      .select({ finishedAt: travelTimeMatrixRefreshes.finishedAt, centroidHash: travelTimeMatrixRefreshes.centroidHash })
      .from(travelTimeMatrixRefreshes)
      .where(and(eq(travelTimeMatrixRefreshes.marketSlug, market), eq(travelTimeMatrixRefreshes.status, "complete")))
      .orderBy(desc(travelTimeMatrixRefreshes.startedAt))
      .limit(1);
    const due = refreshDue({
      lastComplete: last?.finishedAt ? { finishedAt: last.finishedAt, centroidHash: last.centroidHash } : null,
      currentHash: hash,
      now,
      afterDays: refreshAfterDays(),
    });
    if (!due.due) return { skipped: "not_due", market, reason: due.reason };
  }

  const prices = { essentialsPer1000: essentialsPricePer1000(), proPer1000: proPricePer1000(), ceilingPer1000: ceilingPricePer1000() };
  const cost = estimateRefreshCost({ centroidCount: centroids.length, modes: ALL_MODES, ...prices });
  if (cost.ceilingUsd > maxRefreshCeilingUsd()) {
    return { refused: "over_ceiling", market, ceilingUsd: cost.ceilingUsd, maxUsd: maxRefreshCeilingUsd() };
  }

  const refreshId = crypto.randomUUID();
  await db.insert(travelTimeMatrixRefreshes).values({
    id: refreshId,
    marketSlug: market,
    modes: [...ALL_MODES],
    centroidHash: hash,
    centroidCount: centroids.length,
    status: "running",
    elementsRequested: cost.elements,
    essentialsPricePer1000: String(prices.essentialsPer1000),
    proPricePer1000: String(prices.proPer1000),
    estimatedListCostUsd: String(cost.listUsd),
    startedAt: now,
  });

  let returned = 0;
  try {
    const zone = MARKET_TIMEZONES[market] ?? "UTC";
    const departureTime = nextWeekdayDeparture(zone, transitDepartureLocalTime(), now);
    for (const mode of ALL_MODES) {
      const perRequest = mode === "transit" ? transitElementsPerRequest() : otherElementsPerRequest();
      for (const batch of planMatrixBatches(centroids.length, perRequest)) {
        const origins = centroids.slice(batch.originStart, batch.originEnd);
        const dests = centroids.slice(batch.destStart, batch.destEnd);
        const body: Record<string, unknown> = {
          origins: origins.map(waypoint),
          destinations: dests.map(waypoint),
          travelMode: mode === "transit" ? "TRANSIT" : "WALK",
          ...(mode === "transit" ? { departureTime } : {}),
        };
        const elements = await fetchMatrix(body);
        for (const el of elements) {
          const o = origins[el.originIndex];
          const d = dests[el.destinationIndex];
          if (!o || !d) continue;
          const found = el.condition !== "ROUTE_NOT_FOUND";
          const durationSeconds = found ? parseSeconds(el.duration) : null;
          const distanceMeters = found && typeof el.distanceMeters === "number" ? el.distanceMeters : null;
          await db
            .insert(travelTimeMatrix)
            .values({ id: crypto.randomUUID(), marketSlug: market, originSlug: o.slug, destSlug: d.slug, mode, durationSeconds, distanceMeters, refreshId, computedAt: now })
            .onConflictDoUpdate({
              target: [travelTimeMatrix.marketSlug, travelTimeMatrix.originSlug, travelTimeMatrix.destSlug, travelTimeMatrix.mode],
              set: { durationSeconds, distanceMeters, refreshId, computedAt: now },
            });
          returned++;
        }
      }
    }
    await db
      .update(travelTimeMatrixRefreshes)
      .set({ status: "complete", elementsReturned: returned, finishedAt: new Date() })
      .where(eq(travelTimeMatrixRefreshes.id, refreshId));
    return { refreshId, market, status: "complete", elementsRequested: cost.elements, elementsReturned: returned, listUsd: cost.listUsd };
  } catch (err: any) {
    const error = String(err?.message ?? err).slice(0, 1000);
    await db
      .update(travelTimeMatrixRefreshes)
      .set({ status: "failed", elementsReturned: returned, error, finishedAt: new Date() })
      .where(eq(travelTimeMatrixRefreshes.id, refreshId));
    return { refreshId, market, status: "failed", elementsRequested: cost.elements, elementsReturned: returned, listUsd: cost.listUsd, error };
  }
}

/**
 * THE READ HELPER plan-fit calls. Loads the market's centroids and every stored cell ONCE, then
 * answers any number of pairs through the pure `resolveTravelTime` — the matrix where it answers,
 * the labelled straight-line estimate everywhere else (§M3). An unknown market answers "est." for
 * every pair; nothing is ever unlabelled.
 */
export async function loadMatrixReader(
  marketSlug: string,
  loadCentroids: (market: string) => Promise<Centroid[]> = loadMarketCentroids,
): Promise<(from: LatLng, to: LatLng, mode: TravelMode) => TravelTime> {
  const centroids = await loadCentroids(marketSlug);
  const rows = centroids.length
    ? await db
        .select({ originSlug: travelTimeMatrix.originSlug, destSlug: travelTimeMatrix.destSlug, mode: travelTimeMatrix.mode, durationSeconds: travelTimeMatrix.durationSeconds })
        .from(travelTimeMatrix)
        .where(eq(travelTimeMatrix.marketSlug, marketSlug))
    : [];
  const cells = new Map<string, MatrixCell>();
  for (const r of rows) {
    if (r.mode !== "walk" && r.mode !== "transit") continue;
    cells.set(matrixKey(r.originSlug, r.destSlug, r.mode), { ...r, mode: r.mode });
  }
  return (from, to, mode) => resolveTravelTime({ from, to, mode, centroids, lookup: (k) => cells.get(k) });
}
