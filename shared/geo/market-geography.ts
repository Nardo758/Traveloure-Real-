/**
 * market-geography.ts — the "digitized clone" geography layer for launch markets
 * (decision-maker ruling, Aug 9 2026: self-rendered from OpenStreetMap DATA, never
 * derived from Google's map — Google's terms prohibit tracing/deriving; OSM's ODbL
 * permits it with attribution).
 *
 * WHAT THIS IS: a deliberately simplified vector sketch of a market's real geography
 * (water, parks, primary roads) in lon/lat, rendered by our own components in the brand
 * palette beneath route lines — the store teaser map, the Social Kit route frame, and
 * (eventually) any surface that wants brand-styled real geography without a tile
 * provider. POI labels never exist in this layer, so pre-purchase redaction happens by
 * construction.
 *
 * DATA HONESTY (§13): the coordinates below are APPROXIMATE, hand-seeded from
 * well-known geography (the Kamo river's course, the Higashiyama edge, the Imperial
 * Palace grounds). They are a background illustration layer, NOT navigation data —
 * nothing routes, geocodes, or navigates from this module. To regenerate precisely from
 * OSM, run `scripts/generate-market-geography.ts` (Overpass extract; needs network
 * egress) and commit the emitted data. Attribution is REQUIRED wherever this renders:
 * "© OpenStreetMap contributors".
 */

export interface MarketGeography {
  /** Slug matching launch-market vocabulary (e.g. "kyoto"). */
  market: string;
  /** Render bounding box, [west, south, east, north] in lon/lat. */
  bbox: [number, number, number, number];
  /** Water courses/bodies as lon/lat polylines (rendered as wide soft strokes). */
  water: [number, number][][];
  /** Park/green polygons as lon/lat rings. */
  parks: [number, number][][];
  /** Primary roads as lon/lat polylines (rendered as faint strokes). */
  roads: [number, number][][];
}

/** Kyoto city core — Kamo/Katsura rivers, Imperial Palace + Maruyama greens, the grid's
 *  primary axes (Karasuma/Kawaramachi/Higashioji N-S; Imadegawa/Marutamachi/Shijo/Gojo E-W),
 *  and the Higashiyama green edge. Approximate by design — see module doc. */
export const KYOTO_GEOGRAPHY: MarketGeography = {
  market: "kyoto",
  bbox: [135.72, 34.975, 135.80, 35.045],
  water: [
    // Kamo river (N→S through the city; bends west below Shijo)
    [
      [135.7727, 35.045],
      [135.7717, 35.030],
      [135.7709, 35.020],
      [135.7710, 35.010],
      [135.7716, 35.000],
      [135.7712, 34.990],
      [135.7695, 34.980],
      [135.7680, 34.975],
    ],
    // Takase canal hint (parallel, west of Kamo, downtown stretch)
    [
      [135.7695, 35.005],
      [135.7692, 34.995],
      [135.7686, 34.985],
    ],
  ],
  parks: [
    // Kyoto Imperial Palace grounds
    [
      [135.7595, 35.0175],
      [135.7665, 35.0175],
      [135.7665, 35.0290],
      [135.7595, 35.0290],
    ],
    // Maruyama Park / Yasaka edge
    [
      [135.7790, 35.0020],
      [135.7830, 35.0020],
      [135.7830, 35.0060],
      [135.7790, 35.0060],
    ],
    // Higashiyama green edge (east band, simplified)
    [
      [135.7840, 34.9750],
      [135.8000, 34.9750],
      [135.8000, 35.0450],
      [135.7880, 35.0450],
      [135.7855, 35.0250],
      [135.7870, 35.0050],
      [135.7840, 34.9900],
    ],
  ],
  roads: [
    // N-S: Karasuma-dori
    [
      [135.7590, 34.975],
      [135.7590, 35.045],
    ],
    // N-S: Kawaramachi-dori
    [
      [135.7685, 34.978],
      [135.7690, 35.040],
    ],
    // N-S: Higashioji-dori
    [
      [135.7780, 34.975],
      [135.7780, 35.040],
    ],
    // E-W: Imadegawa-dori
    [
      [135.72, 35.0295],
      [135.80, 35.0295],
    ],
    // E-W: Marutamachi-dori
    [
      [135.72, 35.0175],
      [135.80, 35.0175],
    ],
    // E-W: Shijo-dori
    [
      [135.72, 35.0037],
      [135.80, 35.0037],
    ],
    // E-W: Gojo-dori
    [
      [135.72, 34.9950],
      [135.80, 34.9950],
    ],
  ],
};

const MARKET_GEOGRAPHIES: Record<string, MarketGeography> = {
  kyoto: KYOTO_GEOGRAPHY,
};

/** Case-insensitive lookup ("Kyoto, Japan" → kyoto). Null when we have no layer for the
 *  market — callers render their route WITHOUT a geography layer (honest absence, §13:
 *  never substitute another city's shapes). */
export function getMarketGeography(destination: string | null | undefined): MarketGeography | null {
  if (!destination) return null;
  const d = destination.toLowerCase();
  for (const key of Object.keys(MARKET_GEOGRAPHIES)) {
    if (d.includes(key)) return MARKET_GEOGRAPHIES[key];
  }
  return null;
}

/** Project a lon/lat point into an SVG viewBox (y flipped — SVG y grows downward). */
export function projectPoint(
  [lon, lat]: [number, number],
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number] {
  const [w, s, e, n] = bbox;
  const x = ((lon - w) / (e - w)) * width;
  const y = ((n - lat) / (n - s)) * height;
  return [x, y];
}

/** Polyline/ring → SVG path "d" string within the given viewBox. */
export function projectPath(
  line: [number, number][],
  bbox: [number, number, number, number],
  width: number,
  height: number,
  close = false,
): string {
  const pts = line.map((p) => projectPoint(p, bbox, width, height));
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return close ? `${d} Z` : d;
}
