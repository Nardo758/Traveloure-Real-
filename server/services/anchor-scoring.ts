/**
 * Phase 0 (ledger TBD — optimizer "build around a location"): score a candidate ANCHOR against a
 * trip's actual stops.
 *
 * The decision-maker's thesis: an optimized trip is built around a location — the common
 * denominator every day radiates from. That anchor is GENERALIZED (ratified 2026-08-23) to any of
 * three kinds:
 *   • hotel        — a `hotel_cache` row (external/Amadeus inventory; booked via the §16 agent rail)
 *   • neighborhood — a `city_neighborhoods` centroid
 *   • activity     — a catalog `provider_services` row that is the trip's centrepiece
 *
 * This module is PURE and type-agnostic: it scores by geometry alone (real haversine over the
 * stops that actually have coordinates), so the same function ranks a hotel, a neighborhood, and
 * an activity on equal footing. DB-free / React-free so it unit-tests without the DB (the
 * slip-grounding-match discipline).
 *
 * §13 honesty is structural here:
 *   • Stops with no coordinates are EXCLUDED and reported (`locatedStops` / `totalStops`), never
 *     counted at distance 0.
 *   • An anchor with zero located stops to score gets `medianMeters = null` — it is unscorable,
 *     NOT a fabricated perfect score. `rankAnchors` sinks unscorable anchors to the bottom.
 *   • Walk minutes are an ESTIMATE derived from a stated speed (shared/geo `WALK_METERS_PER_MIN`),
 *     surfaced as such — never presented as a routed door-to-door time.
 */

import { haversineMeters, estWalkMinutes } from "@shared/geo";

export type AnchorType = "hotel" | "neighborhood" | "activity";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface AnchorCandidate extends GeoPoint {
  id: string;
  type: AnchorType;
  name: string;
}

/** A trip stop. `lat`/`lng` may be null — an unlocated stop is honestly excluded from scoring. */
export interface StopPoint {
  id: string;
  lat: number | null;
  lng: number | null;
}

export interface AnchorScore {
  anchorId: string;
  type: AnchorType;
  name: string;
  /** How many of the trip's stops could actually be scored (had coordinates). */
  locatedStops: number;
  totalStops: number;
  /** Median straight-line distance from the anchor to each LOCATED stop, in metres. Null when
   *  no stop could be located — the anchor is then unscorable, never scored 0 (§13). */
  medianMeters: number | null;
  /** Located stops within a ~15-min walk of the anchor (threshold below). */
  within15MinCount: number;
  /** Estimate only (see shared/geo): median distance expressed as walking minutes. Null iff
   *  `medianMeters` is null. Display must label this an estimate. */
  estMedianWalkMinutes: number | null;
}

/** ~15 min at the stated walking speed. A documented assumption, not a routed threshold. */
export const WITHIN_WALK_METERS = 15 * 80; // 1,200 m

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Score ONE anchor against the trip's stops. Never throws; unlocated stops are excluded. */
export function scoreAnchor(anchor: AnchorCandidate, stops: StopPoint[]): AnchorScore {
  const located = stops.filter(
    (s): s is StopPoint & GeoPoint => s.lat != null && s.lng != null,
  );
  const distances = located.map((s) => haversineMeters(anchor.lat, anchor.lng, s.lat, s.lng));
  const medianMeters = distances.length > 0 ? median(distances) : null;

  return {
    anchorId: anchor.id,
    type: anchor.type,
    name: anchor.name,
    locatedStops: located.length,
    totalStops: stops.length,
    medianMeters,
    within15MinCount: distances.filter((d) => d <= WITHIN_WALK_METERS).length,
    estMedianWalkMinutes: medianMeters == null ? null : estWalkMinutes(medianMeters),
  };
}

/**
 * Rank candidate anchors best-first for a given trip. Best = smallest median distance to the
 * trip's located stops, tie-broken by more stops within a short walk. Unscorable anchors
 * (no located stop) sink to the bottom — never surfaced as if they were central (§13).
 */
export function rankAnchors(candidates: AnchorCandidate[], stops: StopPoint[]): AnchorScore[] {
  return candidates
    .map((c) => scoreAnchor(c, stops))
    .sort((a, b) => {
      if (a.medianMeters == null && b.medianMeters == null) return 0;
      if (a.medianMeters == null) return 1;
      if (b.medianMeters == null) return -1;
      if (a.medianMeters !== b.medianMeters) return a.medianMeters - b.medianMeters;
      return b.within15MinCount - a.within15MinCount;
    });
}
