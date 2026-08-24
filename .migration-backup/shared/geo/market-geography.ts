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
 * DATA HONESTY (§13): every geometry this type describes is a REAL OSM/Overpass extract
 * (scripts/generate-market-geography.ts offline tool; server/services/market-extract.service.ts
 * server-side) — length-ranked and capped per layer, so a rendered layer is a recognizable
 * selection of the market's geography, NOT full OSM coverage and NOT navigation data —
 * nothing routes, geocodes, or navigates from this data. Attribution is REQUIRED wherever this
 * renders: "© OpenStreetMap contributors".
 *
 * DATA HOME (migration 186; CLAUDE.md ruling, Aug 9 2026): this module used to also carry the
 * committed KYOTO_GEOGRAPHY literal and a MARKET_GEOGRAPHIES lookup — both REMOVED here. Geography
 * lookup is now DB-first: server/services/market-geography.service.ts reads the `market_geography`
 * table, falling back to the committed literal in server/geo/kyoto-geography.ts (server-only —
 * never bundled to the client). Server code calls that service; client code fetches
 * GET /api/markets/geography via client/src/lib/use-market-geography.ts. This module now carries
 * ONLY the shared shape (MarketGeography) and the pure lon/lat → SVG projection helpers both
 * sides still need.
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
