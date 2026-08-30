/**
 * MARKET-INSIGHTS RESOLVER — lane B2 (docs/DECISIONS.md ruling 84; CLAUDE.md §13/§20).
 *
 * A READ-ONLY, non-money map-insights surface for the provider Catalog map. The governing rule is
 * §13: the overlay may ONLY use REAL rows — thin signal renders an honest "not enough signal yet",
 * never invented or interpolated heat.
 *
 * SCOPE RESHAPE (the honesty pass that produced this design): there is NO honest coordinate-level
 * demand surface in the repo. The only located booking coordinates
 * (`service_bookings.bookingDetails.pickupLocation`) exist ONLY on surcharge-charged bookings — a
 * BILLING ARTIFACT, §13-FORBIDDEN as demand. Real search intent is string-granularity only. The
 * estimated / TravelPulse aggregates (`service_demand_signals`, `service_gap_analysis`,
 * `*travelpulse*`, `estimated*`) are §13-FORBIDDEN as "real demand". So B2 has TWO layers, both
 * built here as PURE functions (no DB, fully unit-testable):
 *
 *   Layer 1 — COVERAGE-GAP (real): per (neighborhood, categoryKey), REAL supply count (`have`) vs a
 *     REAL admin target (`neighborhood_coverage_target.targetCount`). A neighborhood with no target
 *     row for a category makes NO gap claim (§13 — never invent a target). `have` counts genuinely
 *     LOCATED services; an UNPLACED service (no slug match AND no confirmed pin) is EXCLUDED from
 *     every count (§13 — never dropped onto a neighborhood it isn't in). Gap renders on the
 *     neighborhood's REAL centroid.
 *
 *   Layer 2 — DEMAND (real search intent, coarse, thresholded): REAL search counts bucketed by
 *     `destination` STRING to neighborhood/city centroids — NEVER a per-lat/lng heat cell. Below a
 *     minimum real count everywhere ⇒ the layer is `hasSignal=false` ("not enough signal yet").
 *
 * Aggregation is server-side (counts per bucket); an individual traveler's row/coords never reaches
 * a resolver here, so there is no address leak by construction. ODbL attribution ("© OpenStreetMap
 * contributors") stays wherever the caller renders any of this.
 */

/**
 * The minimum number of REAL searches (in the recent window) a destination bucket must reach before
 * it renders. Below this everywhere, the demand layer shows the honest "not enough signal yet"
 * empty state rather than a sparse, over-read heat (§13). A small constant on purpose — the point is
 * to suppress single-search noise, not to hide genuine early demand.
 */
export const MIN_DEMAND_SIGNAL = 3;

// ── Input row shapes (plain data — the storage layer maps DB rows into these) ────────────────────

/** A neighborhood in the provider's market scope. Centroid is REAL (city_neighborhoods, notNull). */
export interface NeighborhoodRow {
  id: string;
  city: string;
  name: string;
  slug: string;
  centroidLat: string | number | null;
  centroidLng: string | number | null;
  radiusKm: string | number | null;
}

/** A bookable supply listing (approved+active) with everything needed to place it — or not. */
export interface SupplyServiceRow {
  id: string;
  /** provider_services.neighborhood — a soft slug into city_neighborhoods.slug (or null). */
  neighborhood: string | null;
  /** categoryKey resolved via service_categories (or null — then it fills no category target). */
  categoryKey: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
}

/** A per-(neighborhood, category) admin target. */
export interface CoverageTargetRow {
  neighborhoodId: string;
  categoryKey: string;
  targetCount: number;
}

/** A pre-aggregated real search count for one destination string. */
export interface DemandRow {
  destination: string;
  searchCount: number;
}

// ── Output row shapes ────────────────────────────────────────────────────────────────────────────

export interface GapRow {
  neighborhoodId: string;
  name: string;
  centroidLat: number;
  centroidLng: number;
  categoryKey: string;
  target: number;
  have: number;
  gap: number;
}

export interface DemandNeighborhoodBucket {
  neighborhoodId: string;
  name: string;
  centroidLat: number;
  centroidLng: number;
  searchCount: number;
}

export interface DemandCityBucket {
  city: string;
  searchCount: number;
}

export interface DemandResult {
  byNeighborhood: DemandNeighborhoodBucket[];
  cityLevel: DemandCityBucket[];
  /** Real searches that referenced the market but matched no plottable bucket — disclosed, NEVER plotted. */
  unplaceableCount: number;
  threshold: number;
  hasSignal: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

/** Tolerant decimal parse (rows store lat/lng as strings). Range-checked; null on anything unreal. */
export function parseCoord(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined,
): { lat: number; lng: number } | null {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  if (Math.abs(nLat) > 90 || Math.abs(nLng) > 180) return null;
  return { lat: nLat, lng: nLng };
}

/** Great-circle (haversine) distance in km — STRAIGHT-LINE, the SAME formula the map uses. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

/**
 * Place ONE supply service into a neighborhood id, or return null if UNPLACED (§13 — excluded, never
 * guessed). Priority: (a) its own `neighborhood` slug matched to a scoped neighborhood; else (b) the
 * nearest scoped neighborhood centroid WITHIN that neighborhood's radiusKm, using the same haversine
 * the map uses, for services carrying a confirmed pin. No slug match and no pin ⇒ null.
 */
export function placeServiceInNeighborhood(
  service: SupplyServiceRow,
  neighborhoods: NeighborhoodRow[],
): string | null {
  // (a) slug match — stable across renames, the soft-FK design on provider_services.neighborhood.
  const slug = norm(service.neighborhood);
  if (slug) {
    const bySlug = neighborhoods.find((n) => norm(n.slug) === slug);
    if (bySlug) return bySlug.id;
  }
  // (b) nearest centroid within radius — only for a genuinely LOCATED service.
  const pin = parseCoord(service.latitude, service.longitude);
  if (!pin) return null;
  let bestId: string | null = null;
  let bestDist = Infinity;
  for (const n of neighborhoods) {
    const c = parseCoord(n.centroidLat, n.centroidLng);
    if (!c) continue;
    const radius = Number(n.radiusKm ?? "1.5");
    const d = haversineKm(pin, c);
    if (d <= radius && d < bestDist) {
      bestDist = d;
      bestId = n.id;
    }
  }
  return bestId;
}

// ── Layer 1: coverage gaps ────────────────────────────────────────────────────────────────────────

/**
 * PURE. Compute the coverage gap per (neighborhood, categoryKey): `gap = target - have` when > 0,
 * rendered on the neighborhood's REAL centroid.
 *
 * `have` = count of genuinely LOCATED, categorised supply services placed into that neighborhood.
 * A gap claim exists ONLY where an admin target row exists (§13 — never an invented target); a
 * neighborhood whose centroid does not parse is skipped (nothing to render honestly).
 */
export function resolveCoverageGaps(
  services: SupplyServiceRow[],
  targets: CoverageTargetRow[],
  neighborhoods: NeighborhoodRow[],
): GapRow[] {
  const byId = new Map<string, NeighborhoodRow>();
  for (const n of neighborhoods) byId.set(n.id, n);

  // have[neighborhoodId][categoryKey] = count of located, categorised services placed there.
  const have = new Map<string, Map<string, number>>();
  for (const svc of services) {
    const catKey = norm(svc.categoryKey);
    if (!catKey) continue; // no category ⇒ fills no category target (§13 — not force-attributed).
    const nid = placeServiceInNeighborhood(svc, neighborhoods);
    if (!nid) continue; // UNPLACED ⇒ excluded from every count (§13).
    if (!have.has(nid)) have.set(nid, new Map());
    const inner = have.get(nid)!;
    inner.set(catKey, (inner.get(catKey) ?? 0) + 1);
  }

  const gaps: GapRow[] = [];
  for (const t of targets) {
    const n = byId.get(t.neighborhoodId);
    if (!n) continue; // target for a neighborhood outside scope — ignore.
    const centroid = parseCoord(n.centroidLat, n.centroidLng);
    if (!centroid) continue; // cannot render honestly without a real centroid.
    const catKey = norm(t.categoryKey);
    const haveCount = have.get(t.neighborhoodId)?.get(catKey) ?? 0;
    const gap = t.targetCount - haveCount;
    if (gap <= 0) continue; // covered (have >= target) ⇒ no gap claim.
    gaps.push({
      neighborhoodId: n.id,
      name: n.name,
      centroidLat: centroid.lat,
      centroidLng: centroid.lng,
      categoryKey: t.categoryKey,
      target: t.targetCount,
      have: haveCount,
      gap,
    });
  }
  // Largest gaps first — the most underserved neighborhoods lead.
  gaps.sort((a, b) => b.gap - a.gap);
  return gaps;
}

// ── Layer 2: demand buckets ─────────────────────────────────────────────────────────────────────

/**
 * PURE. Bucket REAL search counts by `destination` string to neighborhood/city centroids, then
 * threshold. Never a per-lat/lng heat cell — only neighborhood/market centroids (§13).
 *
 * Matching (case-insensitive, exact — no fuzzy fabrication):
 *   • destination == a scoped neighborhood name or slug ⇒ placed on that neighborhood's centroid.
 *   • destination == a scoped city ⇒ a CITY-LEVEL figure (a label, not forced onto one centroid).
 *   • destination merely REFERENCES a scoped city (contains its name) ⇒ unplaceable (disclosed, not plotted).
 *   • otherwise ⇒ OUT OF MARKET, ignored entirely (another market's demand is not this provider's).
 *
 * Threshold: a bucket renders only at/above `threshold` real searches in the window. Below threshold
 * everywhere ⇒ `hasSignal=false` ("not enough signal yet"). `unplaceableCount` is a raw disclosure
 * figure and is not thresholded (it is never plotted).
 */
export function resolveDemandBuckets(
  demandRows: DemandRow[],
  neighborhoods: NeighborhoodRow[],
  cities: string[],
  threshold: number = MIN_DEMAND_SIGNAL,
): DemandResult {
  const cityNorms = cities.map(norm).filter(Boolean);
  const citySet = new Set(cityNorms);

  const neighborhoodCounts = new Map<string, number>(); // neighborhoodId -> count
  const cityCounts = new Map<string, number>(); // normalized city -> count
  let unplaceable = 0;

  for (const row of demandRows) {
    const dest = norm(row.destination);
    if (!dest) continue;
    const c = Math.max(0, Math.trunc(Number(row.searchCount) || 0));
    if (c <= 0) continue;

    const nMatch = neighborhoods.find((n) => norm(n.name) === dest || norm(n.slug) === dest);
    if (nMatch) {
      neighborhoodCounts.set(nMatch.id, (neighborhoodCounts.get(nMatch.id) ?? 0) + c);
      continue;
    }
    if (citySet.has(dest)) {
      cityCounts.set(dest, (cityCounts.get(dest) ?? 0) + c);
      continue;
    }
    // References the market (mentions a scoped city) but no exact bucket ⇒ unplaceable.
    if (cityNorms.some((city) => dest.includes(city))) {
      unplaceable += c;
    }
    // else: out of market — ignore.
  }

  const nById = new Map<string, NeighborhoodRow>();
  for (const n of neighborhoods) nById.set(n.id, n);

  const byNeighborhood: DemandNeighborhoodBucket[] = [];
  for (const [nid, count] of Array.from(neighborhoodCounts.entries())) {
    if (count < threshold) continue;
    const n = nById.get(nid);
    if (!n) continue;
    const centroid = parseCoord(n.centroidLat, n.centroidLng);
    if (!centroid) continue; // can't plot without a real centroid (§13).
    byNeighborhood.push({
      neighborhoodId: n.id,
      name: n.name,
      centroidLat: centroid.lat,
      centroidLng: centroid.lng,
      searchCount: count,
    });
  }
  byNeighborhood.sort((a, b) => b.searchCount - a.searchCount);

  // Preserve the caller's city casing for display.
  const cityDisplay = new Map<string, string>();
  for (const raw of cities) cityDisplay.set(norm(raw), raw);
  const cityLevel: DemandCityBucket[] = [];
  for (const [cityNorm, count] of Array.from(cityCounts.entries())) {
    if (count < threshold) continue;
    cityLevel.push({ city: cityDisplay.get(cityNorm) ?? cityNorm, searchCount: count });
  }
  cityLevel.sort((a, b) => b.searchCount - a.searchCount);

  return {
    byNeighborhood,
    cityLevel,
    unplaceableCount: unplaceable,
    threshold,
    hasSignal: byNeighborhood.length > 0 || cityLevel.length > 0,
  };
}
