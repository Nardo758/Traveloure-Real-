/**
 * ready-made-teaser-map.service.ts — server-rendered pre-purchase teaser SVG for a Ready Made
 * Trips store listing (GET /api/ready-made/:id/teaser-map.svg, server/routes/ready-made.routes.ts).
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
 * Geography layer: shared/geo/market-geography.ts's self-rendered OSM-derived vector sketch
 * (water/parks/roads) beneath the route — never Google-derived (see that module's header). When
 * no geography exists for the trip's market, this renders routes/dots alone on plain ground —
 * never another city's shapes (§13 honesty).
 */
import {
  getMarketGeography,
  projectPath,
  projectPoint,
  type MarketGeography,
} from "@shared/geo/market-geography";

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 420;
const GROUND_COLOR = "#FAFAF8";
const WATER_COLOR = "#EAF1F8";
const PARK_COLOR = "#EAF4EF";
const ROAD_COLOR = "#E8E8E2";
const LEGEND_COLOR = "#7A7A72";
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

export interface TeaserMapDayDistance {
  dayNumber: number;
  totalMeters: number;
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
  /** Per-day summed transport_legs.distance_meters (trip-scoped, variantId IS NULL). Empty when
   *  no transport legs exist for this trip — the caller never estimates one (§13). */
  dayDistances: TeaserMapDayDistance[];
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
 *  [lon, lat] — matches MarketGeography's point order (projectPoint/projectPath expect it). */
function jitterPoint(lat: number, lon: number, listingId: string, itemId: string): [number, number] {
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

export function renderReadyMadeTeaserMapSvg(opts: TeaserMapOptions): string {
  const { listingId, destination, items, dayDistances } = opts;

  type Stop = { dayNumber: number; lon: number; lat: number };
  const stops: Stop[] = [];
  for (const item of items) {
    const lat = item.latitude != null ? Number(item.latitude) : NaN;
    const lon = item.longitude != null ? Number(item.longitude) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue; // unlocated — simply absent
    const [jLon, jLat] = jitterPoint(lat, lon, listingId, item.id);
    stops.push({ dayNumber: item.dayNumber, lon: jLon, lat: jLat });
  }

  const geo = getMarketGeography(destination);
  const stopsBbox = computeBbox(stops.map((s) => [s.lon, s.lat] as [number, number]));

  let bbox: Bbox;
  if (stopsBbox) {
    const padded = padBbox(stopsBbox, PAD_FRACTION, MIN_SPAN_DEG);
    // Union with the market bbox (when one exists) so the geography layer and the route render
    // in the SAME projection and stay aligned; padBbox's minimum span above is the "clamp" half
    // of that — it keeps a single stop (or a market with a much larger bbox) from degenerating
    // the viewport before the union runs.
    bbox = geo ? unionBbox(padded, geo.bbox) : padded;
  } else if (geo) {
    // No located stops at all — render the geography layer alone, honestly (§13: never invent a
    // route or a stop to fill the frame).
    bbox = geo.bbox;
  } else {
    // Neither stops nor geography exist — a bare deterministic placeholder box; nothing renders
    // on top of it beyond ground + attribution.
    bbox = [-1, -1, 1, 1];
  }

  const layers: string[] = [];
  layers.push(`<rect x="0" y="0" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" fill="${GROUND_COLOR}" />`);
  if (geo) layers.push(geographyLayer(geo, bbox));

  // Routes: per day, connect that day's located stops in itinerary order (the order they arrive
  // in `items`, which the caller has already sorted). Unlocated items simply don't appear.
  const stopsByDay = new Map<number, Stop[]>();
  for (const s of stops) {
    if (!stopsByDay.has(s.dayNumber)) stopsByDay.set(s.dayNumber, []);
    stopsByDay.get(s.dayNumber)!.push(s);
  }
  const routeLayers: string[] = [];
  const dotLayers: string[] = [];
  for (const [dayNumber, dayStops] of Array.from(stopsByDay.entries()).sort((a, b) => a[0] - b[0])) {
    const color = DAY_PALETTE[(dayNumber - 1) % DAY_PALETTE.length];
    if (dayStops.length >= 2) {
      const line = dayStops.map((s) => [s.lon, s.lat] as [number, number]);
      routeLayers.push(
        `<path d="${projectPath(line, bbox, VIEW_WIDTH, VIEW_HEIGHT)}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85" />`,
      );
    }
    for (const s of dayStops) {
      const [x, y] = projectPoint([s.lon, s.lat], bbox, VIEW_WIDTH, VIEW_HEIGHT);
      dotLayers.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${color}" stroke="#FFFFFF" stroke-width="2" />`,
      );
    }
  }
  layers.push(...routeLayers, ...dotLayers);

  // Distance legend (bottom-left) — ONLY when real transport legs exist; never estimated (§13:
  // an absent leg set means no legend, not a guessed distance).
  if (dayDistances.length > 0) {
    const sorted = dayDistances.slice().sort((a, b) => a.dayNumber - b.dayNumber);
    const lineHeight = 14;
    const startY = VIEW_HEIGHT - 16 - (sorted.length - 1) * lineHeight;
    sorted.forEach((d, i) => {
      const km = (d.totalMeters / 1000).toFixed(1);
      layers.push(
        `<text x="14" y="${startY + i * lineHeight}" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="${LEGEND_COLOR}">${esc(`Day ${d.dayNumber} · ${km} km`)}</text>`,
      );
    });
  }

  // Attribution (bottom-right, 8px) — required whenever the geography layer rendered (the OSM
  // ruling); plain "Traveloure map" when it didn't (no OSM-derived shapes are on screen).
  const attribution = geo ? "Traveloure map · © OpenStreetMap contributors" : "Traveloure map";
  layers.push(
    `<text x="${VIEW_WIDTH - 8}" y="${VIEW_HEIGHT - 8}" text-anchor="end" font-family="system-ui, -apple-system, sans-serif" font-size="8" fill="${ATTRIBUTION_COLOR}">${esc(attribution)}</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}">${layers.join("")}</svg>`;
}
