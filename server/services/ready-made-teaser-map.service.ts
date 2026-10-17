/**
 * ready-made-teaser-map.service.ts — server-rendered pre-purchase teaser SVG for a Ready Made
 * Trips store listing (GET /api/ready-made/:id/teaser-map.svg, server/routes/ready-made.routes.ts).
 *
 * CP-1 PR 2 (ledger `2026-10-15-cp1-teasers`): the teaser now draws NO stop and NO route. The jitter
 * below survives only for the share image's schematic map (`jitterPoint`, ready-made-share-data.service.ts),
 * which has no basemap.
 *
 * GC-1 (ledger `2026-10-17-gc1-google-coords`): a stop's own point may be Google's, so it is never drawn,
 * even blurred. Each stop is SNAPPED TO ITS NEIGHBOURHOOD: its point only finds which `city_neighborhoods`
 * row it is in (the same nearest-within-3 km rule the share chips use, `nearestAreaName`), and the region
 * drawn is that row's own centroid and radius (the spine, OSM-derived), looked up by name. One region per
 * neighbourhood per day; a stop in no neighbourhood draws nothing (§13). No distance legend: a leg's
 * distance may be a Google route's.
 *
 * CRITICAL REDACTION RULE: raw item coordinates must NEVER reach an unpurchased client. Every
 * stop position is jittered ±~250m using a PRNG seeded deterministically from the listing id
 * (stable rendering across loads — the SAME listing draws the SAME approximate map every time —
 * but positions are deliberately approximate). This is the trip-plan teaser doctrine: pre-purchase
 * surfaces don't carry precise pins. Comment this as deliberate pre-purchase redaction (§13
 * posture: "approximate by design, stated as such"), never as fabrication — nothing here invents
 * a stop, a route, or a distance that isn't backed by a real DB row; it only DISPLACES real
 * points by a bounded, reproducible offset.
 *
 * Geography layer: server/services/market-geography.service.ts's DB-first lookup (migration 186)
 * over the self-rendered OSM-derived vector sketch (water/parks/roads) beneath the route — never
 * Google-derived (see shared/geo/market-geography.ts's header). When no geography exists for the
 * trip's market, this renders routes/dots alone on plain ground — never another city's shapes
 * (§13 honesty).
 *
 * SYNC LOOKUP, DELIBERATELY (see market-geography.service.ts's getMarketGeographyForDestinationSync
 * doc comment): this module's export stays a synchronous `(opts) => string` because its one caller,
 * GET /api/ready-made/:id/teaser-map.svg in server/routes/ready-made.routes.ts, is outside this
 * build's file-ownership scope and calls it without awaiting. The sync lookup is DB-first once the
 * in-process cache has warmed (moments after boot, and on every admin geography write); until then
 * it falls back to the committed literal — the same honest-absence posture §13 already uses for "no
 * row matches", applied to "not loaded yet".
 */
import { projectPath, projectPoint, type MarketGeography } from "@shared/geo/market-geography";
import { getMarketGeographyForDestinationSync } from "./market-geography.service";
import { nearestAreaName } from "../utils/public-service-listing";

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 420;
const GROUND_COLOR = "#FAFAF8";
const WATER_COLOR = "#EAF1F8";
const PARK_COLOR = "#EAF4EF";
const ROAD_COLOR = "#E8E8E2";
const ATTRIBUTION_COLOR = "#B8B8B0";
const DAY_PALETTE = ["#E85D55", "#3B6EA5", "#2E7D5B", "#B45309"];
// Safety floor so a single stop (or several near-identical stops) never collapses the
// projection to a divide-by-zero box. ~400m at the equator.
const MIN_SPAN_DEG = 0.004;
const PAD_FRACTION = 0.15;

type Bbox = [number, number, number, number]; // [west, south, east, north]

export interface TeaserMapItemInput {
  id: string;
  dayNumber: number;
  latitude: string | number | null;
  longitude: string | number | null;
}

/** GC-1: a neighbourhood row from the spine — its own name, centroid and radius. */
export interface TeaserNeighborhood {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number | null;
}

export interface TeaserMapOptions {
  /** Ready-made listing id — the deterministic jitter seed (stable across loads; combined with
   *  each item's own id so two listings never jitter identically). */
  listingId: string;
  /** trip.destination — resolves the geography layer via getMarketGeography(). */
  destination: string | null;
  /** Itinerary items already sorted into itinerary order (dayNumber, then sortOrder) by the
   *  caller — this module never re-sorts, it only groups by day. */
  items: TeaserMapItemInput[];
  /** GC-1: the listing market's neighbourhood rows (the spine). Empty ⇒ no region is drawn. */
  neighborhoods: TeaserNeighborhood[];
}

// ─── Deterministic PRNG (mulberry32) seeded from a string hash (FNV-1a) ──────────────────────
// Never Math.random(): the SAME listing must render the SAME jittered positions on every load —
// the redaction is deliberately APPROXIMATE, not deliberately UNSTABLE. A map that reshuffles on
// refresh reads as broken, not as privacy-preserving.
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jitters a real [lat, lon] up to ~250m in a random (but deterministic) direction. Returns
 *  [lon, lat] — matches MarketGeography's point order (projectPoint/projectPath expect it).
 *  Exported (Slice B2) so the generated map slide redacts with the SAME rule as this teaser. */
export function jitterPoint(lat: number, lon: number, listingId: string, itemId: string): [number, number] {
  const rng = mulberry32(hashSeed(`${listingId}:${itemId}`));
  const angle = rng() * 2 * Math.PI;
  const magnitudeMeters = rng() * 250; // 0..250m in a random direction ("±~250m")
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLat = (magnitudeMeters * Math.sin(angle)) / metersPerDegLat;
  const dLon = metersPerDegLon > 1e-6 ? (magnitudeMeters * Math.cos(angle)) / metersPerDegLon : 0;
  return [lon + dLon, lat + dLat];
}

function computeBbox(points: [number, number][]): Bbox | null {
  if (points.length === 0) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
}

function padBbox(bbox: Bbox, padFraction: number, minSpanDeg: number): Bbox {
  let [west, south, east, north] = bbox;
  let lonSpan = east - west;
  let latSpan = north - south;
  if (lonSpan < minSpanDeg) {
    const c = (east + west) / 2;
    west = c - minSpanDeg / 2;
    east = c + minSpanDeg / 2;
    lonSpan = minSpanDeg;
  }
  if (latSpan < minSpanDeg) {
    const c = (north + south) / 2;
    south = c - minSpanDeg / 2;
    north = c + minSpanDeg / 2;
    latSpan = minSpanDeg;
  }
  const padLon = lonSpan * padFraction;
  const padLat = latSpan * padFraction;
  return [west - padLon, south - padLat, east + padLon, north + padLat];
}

function unionBbox(a: Bbox, b: Bbox): Bbox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function geographyLayer(geo: MarketGeography, bbox: Bbox): string {
  const w = VIEW_WIDTH, h = VIEW_HEIGHT;
  const water = geo.water
    .map(
      (line) =>
        `<path d="${projectPath(line, bbox, w, h)}" fill="none" stroke="${WATER_COLOR}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />`,
    )
    .join("");
  const parks = geo.parks
    .map((ring) => `<path d="${projectPath(ring, bbox, w, h, true)}" fill="${PARK_COLOR}" stroke="none" />`)
    .join("");
  const roads = geo.roads
    .map(
      (line) =>
        `<path d="${projectPath(line, bbox, w, h)}" fill="none" stroke="${ROAD_COLOR}" stroke-width="2" stroke-linecap="round" />`,
    )
    .join("");
  return `${water}${parks}${roads}`;
}

/** CP-1 PR 2: a day's region is never smaller than this, and its radius is rounded UP to this step. */
export const TEASER_REGION_MIN_RADIUS_M = 1000;
const TEASER_REGION_STEP_M = 500;

/**
 * GC-1 (ledger `2026-10-17-gc1-google-coords`): one region per neighbourhood per day, in day order and then in
 * the order the day first reaches each neighbourhood. A stop's point is used only to find its neighbourhood
 * (`nearestAreaName`); the region is the neighbourhood row's own centroid and its radius, at least 1 km and
 * rounded up to 500 m. A stop with no point, or in no neighbourhood, draws nothing (§13).
 */
export function teaserDayRegions(
  items: ReadonlyArray<TeaserMapItemInput>,
  neighborhoods: ReadonlyArray<TeaserNeighborhood>,
): Array<{ dayNumber: number; name: string; lat: number; lon: number; radiusM: number }> {
  const byName = new Map(neighborhoods.map((n) => [n.name, n] as const));
  const seen = new Set<string>();
  const out: Array<{ dayNumber: number; name: string; lat: number; lon: number; radiusM: number }> = [];
  const ordered = items.slice().sort((a, b) => a.dayNumber - b.dayNumber);
  for (const item of ordered) {
    const name = nearestAreaName(item.latitude, item.longitude, neighborhoods);
    const row = name ? byName.get(name) : undefined;
    if (!row) continue;
    const key = `${item.dayNumber}:${row.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const radius = Math.max(TEASER_REGION_MIN_RADIUS_M, (Number(row.radiusKm) || 0) * 1000);
    out.push({ dayNumber: item.dayNumber, name: row.name, lat: row.lat, lon: row.lng, radiusM: Math.ceil(radius / TEASER_REGION_STEP_M) * TEASER_REGION_STEP_M });
  }
  return out;
}

const METERS_PER_DEG_LAT = 111_320;

export function renderReadyMadeTeaserMapSvg(opts: TeaserMapOptions): string {
  const { destination, items, neighborhoods } = opts;

  const regions = teaserDayRegions(items, neighborhoods);
  const geo = getMarketGeographyForDestinationSync(destination);
  const corners: [number, number][] = [];
  for (const r of regions) {
    const dLat = r.radiusM / METERS_PER_DEG_LAT;
    const dLon = r.radiusM / (METERS_PER_DEG_LAT * Math.max(Math.cos((r.lat * Math.PI) / 180), 0.01));
    corners.push([r.lon - dLon, r.lat - dLat], [r.lon + dLon, r.lat + dLat]);
  }
  const regionsBbox = computeBbox(corners);

  let bbox: Bbox;
  if (regionsBbox) {
    const padded = padBbox(regionsBbox, PAD_FRACTION, MIN_SPAN_DEG);
    // Union with the market bbox (when one exists) so the geography layer and the regions render in
    // the SAME projection and stay aligned.
    bbox = geo ? unionBbox(padded, geo.bbox) : padded;
  } else if (geo) {
    // No located stops at all — the geography layer alone, honestly (§13).
    bbox = geo.bbox;
  } else {
    // Neither stops nor geography — a bare deterministic placeholder box (ground + attribution).
    bbox = [-1, -1, 1, 1];
  }

  const layers: string[] = [];
  layers.push(`<rect x="0" y="0" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="${GROUND_COLOR}" />`);
  if (geo) layers.push(geographyLayer(geo, bbox));

  // One soft, blurred disc per neighbourhood per day — the spine's own area, never a stop or a route (GC-1).
  if (regions.length) {
    layers.push(`<defs><filter id="teaser-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter></defs>`);
  }
  for (const r of regions) {
    const color = DAY_PALETTE[(r.dayNumber - 1) % DAY_PALETTE.length];
    const [x, y] = projectPoint([r.lon, r.lat], bbox, VIEW_WIDTH, VIEW_HEIGHT);
    const [, yTop] = projectPoint([r.lon, r.lat + r.radiusM / METERS_PER_DEG_LAT], bbox, VIEW_WIDTH, VIEW_HEIGHT);
    const rPx = Math.max(12, Math.abs(y - yTop));
    layers.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rPx.toFixed(1)}" fill="${color}" fill-opacity="0.28" filter="url(#teaser-blur)" />`,
    );
  }

  // Attribution (bottom-right, 8px) — required whenever the geography layer rendered (the OSM
  // ruling); plain "Traveloure map" when it didn't (no OSM-derived shapes are on screen).
  const attribution = geo ? "Traveloure map · © OpenStreetMap contributors" : "Traveloure map";
  layers.push(
    `<text x="${VIEW_WIDTH - 8}" y="${VIEW_HEIGHT - 8}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="8" fill="${ATTRIBUTION_COLOR}">${esc(attribution)}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}">${layers.join("")}</svg>`;
}
