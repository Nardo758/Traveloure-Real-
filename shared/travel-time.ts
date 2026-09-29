/**
 * THE LAUNCH-CITY TRAVEL-TIME MATRIX — the pure half (Track A step A2; ledger
 * `2026-09-29-a2-travel-time-matrix`; product map §M3/§M4, R186).
 *
 * No DB, no fetch, no clock of its own: every function here is proven without a database, and the
 * service (`server/services/travel-time-matrix.service.ts`) is its only I/O caller.
 *
 * The rules, and they are the §M3 honesty rules:
 *   · A point SNAPS to its neighbourhood centroid only when it lies within that neighbourhood's own
 *     radius (× SNAP_RADIUS_FACTOR). A point near no centroid is never snapped to the nearest one
 *     anyway — it falls back to the straight-line estimate and says why.
 *   · A pair the matrix holds is `basis: "matrix"`. Everything else — no row, a NULL duration (the
 *     API found no route), both points in one neighbourhood, an unsnapped point — is
 *     `basis: "est"`, a straight line at the stated walk speed (`WALK_METERS_PER_MIN`), and every
 *     surface labels it "est.". Nothing unlabelled is ever a straight-line number.
 */
import { haversineMeters, WALK_METERS_PER_MIN } from "./geo";

export const TRAVEL_MODES = ["walk", "transit"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

/** A neighbourhood centroid as `city_neighborhoods` holds it. */
export interface Centroid {
  slug: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * How far past a neighbourhood's own radius a point may lie and still snap to it. 1 = inside the
 * stated radius only. Kept at 1.5 so a hotel on the edge of Gion still reads as Gion; beyond that
 * the point is honestly "not in a known neighbourhood" and gets the estimate.
 */
export const SNAP_RADIUS_FACTOR = 1.5;

/** The centroid a point belongs to, or null when it lies in no neighbourhood's radius. */
export function snapToCentroid(point: LatLng, centroids: readonly Centroid[]): Centroid | null {
  let best: Centroid | null = null;
  let bestMeters = Infinity;
  for (const c of centroids) {
    const m = haversineMeters(point.lat, point.lng, c.lat, c.lng);
    if (m <= c.radiusKm * 1000 * SNAP_RADIUS_FACTOR && m < bestMeters) {
      best = c;
      bestMeters = m;
    }
  }
  return best;
}

/** One stored matrix cell. `durationSeconds` NULL = the API found no route for the pair. */
export interface MatrixCell {
  originSlug: string;
  destSlug: string;
  mode: TravelMode;
  durationSeconds: number | null;
}

export const matrixKey = (originSlug: string, destSlug: string, mode: TravelMode) => `${originSlug}|${destSlug}|${mode}`;

export type EstReason = "same_neighbourhood" | "not_in_a_neighbourhood" | "pair_not_in_matrix" | "no_route_found";

export type TravelTime =
  | { basis: "matrix"; minutes: number; mode: TravelMode; originSlug: string; destSlug: string }
  | { basis: "est"; minutes: number; mode: TravelMode; reason: EstReason; straightLineMeters: number };

/** The straight-line estimate at the stated walk speed, whole minutes, never below 1. */
export function estimatedMinutes(from: LatLng, to: LatLng): { minutes: number; meters: number } {
  const meters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  return { minutes: Math.max(1, Math.round(meters / WALK_METERS_PER_MIN)), meters };
}

/** The ONE read rule plan-fit calls: the matrix when it answers, the labelled estimate otherwise. */
export function resolveTravelTime(input: {
  from: LatLng;
  to: LatLng;
  mode: TravelMode;
  centroids: readonly Centroid[];
  lookup: (key: string) => MatrixCell | undefined;
}): TravelTime {
  const { from, to, mode, centroids, lookup } = input;
  const est = (reason: EstReason): TravelTime => {
    const e = estimatedMinutes(from, to);
    return { basis: "est", minutes: e.minutes, mode, reason, straightLineMeters: Math.round(e.meters) };
  };
  const a = snapToCentroid(from, centroids);
  const b = snapToCentroid(to, centroids);
  if (!a || !b) return est("not_in_a_neighbourhood");
  if (a.slug === b.slug) return est("same_neighbourhood");
  const cell = lookup(matrixKey(a.slug, b.slug, mode));
  if (!cell) return est("pair_not_in_matrix");
  if (cell.durationSeconds == null) return est("no_route_found");
  return { basis: "matrix", minutes: Math.max(1, Math.round(cell.durationSeconds / 60)), mode, originSlug: a.slug, destSlug: b.slug };
}

/** One Routes-API request: a block of origins against a block of destinations. */
export interface MatrixBatch {
  originStart: number;
  originEnd: number; // exclusive
  destStart: number;
  destEnd: number; // exclusive
  elements: number;
}

/**
 * Square blocks that respect the per-request element cap (100 for transit ⇒ 10×10; 625 otherwise ⇒
 * 25×25). Every origin×destination pair appears in exactly one batch.
 */
export function planMatrixBatches(count: number, elementsPerRequest: number): MatrixBatch[] {
  if (count <= 0) return [];
  const side = Math.max(1, Math.floor(Math.sqrt(elementsPerRequest)));
  const out: MatrixBatch[] = [];
  for (let o = 0; o < count; o += side) {
    for (let d = 0; d < count; d += side) {
      const oe = Math.min(count, o + side);
      const de = Math.min(count, d + side);
      out.push({ originStart: o, originEnd: oe, destStart: d, destEnd: de, elements: (oe - o) * (de - d) });
    }
  }
  return out;
}

/** What a refresh would cost at list price and at the planning ceiling (no free caps). */
export function estimateRefreshCost(input: {
  centroidCount: number;
  modes: readonly TravelMode[];
  essentialsPer1000: number;
  proPer1000: number;
  ceilingPer1000: number;
}): { elements: number; listUsd: number; ceilingUsd: number } {
  const perMode = input.centroidCount * input.centroidCount;
  let list = 0;
  for (const m of input.modes) list += (perMode / 1000) * (m === "transit" ? input.proPer1000 : input.essentialsPer1000);
  const elements = perMode * input.modes.length;
  return {
    elements,
    listUsd: Math.round(list * 100) / 100,
    ceilingUsd: Math.round((elements / 1000) * input.ceilingPer1000 * 100) / 100,
  };
}

/** Is a refresh due? Monthly, or at once when the centroid set has changed since the last complete run. */
export function refreshDue(input: {
  lastComplete: { finishedAt: Date; centroidHash: string } | null;
  currentHash: string;
  now: Date;
  afterDays: number;
}): { due: boolean; reason: "never_refreshed" | "centroids_changed" | "stale" | "fresh" } {
  const { lastComplete, currentHash, now, afterDays } = input;
  if (!lastComplete) return { due: true, reason: "never_refreshed" };
  if (lastComplete.centroidHash !== currentHash) return { due: true, reason: "centroids_changed" };
  const ageDays = (now.getTime() - lastComplete.finishedAt.getTime()) / 86_400_000;
  return ageDays >= afterDays ? { due: true, reason: "stale" } : { due: false, reason: "fresh" };
}

/** The canonical string a centroid set is hashed from: sorted, fixed precision. */
export function centroidFingerprint(centroids: readonly Centroid[]): string {
  return [...centroids]
    .sort((x, y) => x.slug.localeCompare(y.slug))
    .map((c) => `${c.slug}:${c.lat.toFixed(6)}:${c.lng.toFixed(6)}`)
    .join(";");
}
