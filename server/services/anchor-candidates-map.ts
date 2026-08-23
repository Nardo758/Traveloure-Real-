/**
 * Phase 1 — PURE anchor-candidate mappers (DB-free / React-free, like anchor-scoring.ts).
 * Row -> AnchorCandidate mapping + activity-anchor ranking. Kept import-light so it unit-tests
 * without a database; the DB loader (`anchor-candidates.ts`) imports these.
 *
 * §13: a row with no coordinates is dropped, never given a fabricated position; an activity anchor
 * is scored against the OTHER stops (self excluded) so its own zero distance can't flatter it.
 */

import {
  scoreAnchor,
  type AnchorCandidate,
  type AnchorScore,
  type AnchorType,
  type StopPoint,
} from "./anchor-scoring";

/** A trip stop that also carries a display name — the basis for an `activity` anchor. */
export interface NamedStop extends StopPoint {
  name: string;
}

/**
 * A traveler's explicit "build around THIS" choice from the Optimize popup (Phase 1c). `type` is one
 * of the three ratified anchor kinds; `id` identifies a catalog hotel / neighborhood / trip stop, and
 * `lat`/`lng` carry an explicitly-placed custom location (the "enter a location or coordinates"
 * field). Coordinates are trusted ONLY as a user's own placement (§22), never invented server-side.
 */
export interface PinnedAnchorInput {
  type: AnchorType;
  id?: string | null;
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/**
 * PURE half of pinned-anchor resolution — the two paths that need no DB: matching an `activity` pin
 * to one of the trip's own located stops, and accepting an explicitly-placed custom location. Hotel
 * and neighborhood ids are resolved by the DB loader (`anchor-candidates.ts`), which falls back here.
 * Returns null when nothing real can be built (§13 — an unresolvable pin becomes NO anchor, never a
 * fabricated one).
 */
export function buildPinnedCandidateFromCoords(
  input: PinnedAnchorInput,
  stops: NamedStop[],
): AnchorCandidate | null {
  // An activity pin IS one of the trip's stops — use that stop's own real coordinates, never the
  // client's (server-derived, §14 posture even though this is display-only).
  if (input.type === "activity" && input.id) {
    const stop = stops.find((s) => s.id === String(input.id));
    if (stop && stop.lat != null && stop.lng != null) {
      return { id: stop.id, type: "activity", name: stop.name, lat: stop.lat, lng: stop.lng };
    }
  }
  // A custom location the traveler placed/typed: their coordinates ARE the source of truth (§22).
  const lat = num(input.lat);
  const lng = num(input.lng);
  if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return {
      id: input.id ? String(input.id) : `custom:${(input.name ?? "location").slice(0, 100)}`,
      type: input.type,
      name: (input.name ?? "Chosen location").slice(0, 200),
      lat,
      lng,
    };
  }
  return null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export function hotelRowsToCandidates(
  rows: Array<{ id?: string; hotelId?: string; name: string; latitude: unknown; longitude: unknown }>,
): AnchorCandidate[] {
  const out: AnchorCandidate[] = [];
  for (const r of rows) {
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    if (lat == null || lng == null) continue;
    out.push({ id: String(r.id ?? r.hotelId ?? r.name), type: "hotel", name: r.name, lat, lng });
  }
  return out;
}

export function neighborhoodRowsToCandidates(
  rows: Array<{ id?: string; slug?: string; name: string; centroidLat: unknown; centroidLng: unknown }>,
): AnchorCandidate[] {
  const out: AnchorCandidate[] = [];
  for (const r of rows) {
    const lat = num(r.centroidLat);
    const lng = num(r.centroidLng);
    if (lat == null || lng == null) continue;
    out.push({ id: String(r.id ?? r.slug ?? r.name), type: "neighborhood", name: r.name, lat, lng });
  }
  return out;
}

export function stopsToActivityCandidates(stops: NamedStop[]): AnchorCandidate[] {
  const out: AnchorCandidate[] = [];
  for (const s of stops) {
    if (s.lat == null || s.lng == null) continue;
    out.push({ id: s.id, type: "activity", name: s.name, lat: s.lat, lng: s.lng });
  }
  return out;
}

/**
 * Choose up to `n` anchors for the optimizer's versions — one of each kind first (best hotel, best
 * neighborhood, best activity), so the three versions read as genuinely different bases (matching
 * the mock), then top up from the combined pool by best fit. Deduped by type+name; only scorable
 * anchors (real median) are eligible. Returns fewer than `n` when inventory is thin — honest (§13),
 * the optimizer then simply builds that many anchor-labelled versions.
 */
export function pickAutoAnchors(
  ranked: { hotel: AnchorScore[]; neighborhood: AnchorScore[]; activity: AnchorScore[] },
  n = 3,
): AnchorScore[] {
  const chosen: AnchorScore[] = [];
  const seen = new Set<string>();
  const key = (a: AnchorScore) => a.type + "|" + a.name;
  const types: AnchorType[] = ["hotel", "neighborhood", "activity"];
  for (const t of types) {
    const top = ranked[t].find((a) => a.medianMeters != null);
    if (top && !seen.has(key(top))) {
      chosen.push(top);
      seen.add(key(top));
    }
    if (chosen.length >= n) return chosen.slice(0, n);
  }
  const pool = [...ranked.hotel, ...ranked.neighborhood, ...ranked.activity]
    .filter((a) => a.medianMeters != null)
    .sort((a, b) => (a.medianMeters as number) - (b.medianMeters as number));
  for (const a of pool) {
    if (chosen.length >= n) break;
    if (!seen.has(key(a))) {
      chosen.push(a);
      seen.add(key(a));
    }
  }
  return chosen.slice(0, n);
}

/**
 * Rank activity anchors. Each candidate IS one of the stops, so it is scored against the OTHER
 * stops (self excluded). Sorted best-first (smallest median); unscorable sinks.
 */
export function rankActivityAnchors(stops: NamedStop[], limit = 5): AnchorScore[] {
  const candidates = stopsToActivityCandidates(stops);
  return candidates
    .map((c) => scoreAnchor(c, stops.filter((s) => s.id !== c.id)))
    .sort((a, b) => {
      if (a.medianMeters == null && b.medianMeters == null) return 0;
      if (a.medianMeters == null) return 1;
      if (b.medianMeters == null) return -1;
      if (a.medianMeters !== b.medianMeters) return a.medianMeters - b.medianMeters;
      return b.within15MinCount - a.within15MinCount;
    })
    .slice(0, limit);
}
