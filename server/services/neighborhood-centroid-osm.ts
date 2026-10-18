/**
 * LG-1 addition (decision-maker, Oct 17, 2026): the `city_neighborhoods` centroids in `server/seeds/city-neighborhoods.seed.ts`
 * (and migration 042's seed) state no provenance. This is the PURE half of re-deriving them the way the admin Add-market
 * path does (`extractNeighborhoods`, migration 186): the OSM `place=suburb|neighbourhood|quarter` node whose name names
 * the neighbourhood, its own point, credited "© OpenStreetMap contributors". Nothing here writes; the dry run
 * (`scripts/neighborhood-centroids-osm.ts`) reports what a write would do.
 *
 *   matched    — exactly one place (every matching node within MATCH_CLUSTER_M of the first)
 *   ambiguous  — matching nodes further apart than that; nothing would be written
 *   unmatched  — no node in the city's box names the neighbourhood (the row keeps its centroid until a human looks)
 */
import { matchNormalisedName, metresBetween, normalisedNameTokens } from "./item-osm-regeocode.service";

export const MATCH_CLUSTER_M = 300;
/** The box around a city's own rows: their extent padded by this many degrees, never wider than 1° a side (Overpass). */
export const CITY_BOX_PAD_DEG = 0.08;
const MAX_SPAN_DEG = 1;

export interface CentroidRow {
  id: string;
  city: string;
  name: string;
  lat: number;
  lng: number;
}

export interface OsmPlaceNode {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export type CentroidOutcome =
  | { kind: "matched"; nodeId: number; nodeName: string; lat: number; lng: number; metresMoved: number; matches: number }
  | { kind: "ambiguous"; names: string[]; spreadM: number }
  | { kind: "unmatched" };

/** Pure: [west, south, east, north] around a city's rows, padded, capped at 1° a side about its centre. */
export function cityBoxFor(rows: readonly { lat: number; lng: number }[]): [number, number, number, number] | null {
  const ok = rows.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  if (ok.length === 0) return null;
  let w = Math.min(...ok.map((r) => r.lng)) - CITY_BOX_PAD_DEG;
  let e = Math.max(...ok.map((r) => r.lng)) + CITY_BOX_PAD_DEG;
  let s = Math.min(...ok.map((r) => r.lat)) - CITY_BOX_PAD_DEG;
  let n = Math.max(...ok.map((r) => r.lat)) + CITY_BOX_PAD_DEG;
  if (e - w > MAX_SPAN_DEG) {
    const c = (e + w) / 2;
    w = c - MAX_SPAN_DEG / 2;
    e = c + MAX_SPAN_DEG / 2;
  }
  if (n - s > MAX_SPAN_DEG) {
    const c = (n + s) / 2;
    s = c - MAX_SPAN_DEG / 2;
    n = c + MAX_SPAN_DEG / 2;
  }
  return [w, s, e, n];
}

/** Pure: every name a node carries (name:en first, then name, then the other name:* / alt names). */
export function nodeNames(node: OsmPlaceNode): string[] {
  const t = node.tags ?? {};
  const keys = Object.keys(t).filter((k) => k === "name" || k.startsWith("name:") || k === "alt_name" || k === "official_name" || k === "short_name");
  const ordered = [t["name:en"], t.name, ...keys.map((k) => t[k])];
  return Array.from(new Set(ordered.filter((n): n is string => typeof n === "string" && n.trim().length > 0)));
}

/** Pure: does a node name the neighbourhood? Both names must name each other (majority both ways). */
export function nodeNamesNeighborhood(rowName: string, nodeName: string, city: string): boolean {
  const rowTokens = normalisedNameTokens(rowName, city);
  const nodeTokens = normalisedNameTokens(nodeName, city);
  if (rowTokens.size === 0 || nodeTokens.size === 0) return false;
  return matchNormalisedName(nodeName, rowTokens, city) && matchNormalisedName(rowName, nodeTokens, city);
}

/** Pure: classify one neighbourhood row against the city's OSM place nodes. Never reads the row's centroid to choose. */
export function matchCentroid(row: CentroidRow, nodes: readonly OsmPlaceNode[]): CentroidOutcome {
  const matching: Array<{ node: OsmPlaceNode; name: string }> = [];
  for (const node of nodes) {
    const name = nodeNames(node).find((n) => nodeNamesNeighborhood(row.name, n, row.city));
    if (name && Number.isFinite(node.lat) && Number.isFinite(node.lon)) matching.push({ node, name });
  }
  if (matching.length === 0) return { kind: "unmatched" };
  const first = matching[0].node;
  const spreadM = Math.max(...matching.map((m) => metresBetween(first.lat, first.lon, m.node.lat, m.node.lon)));
  if (spreadM > MATCH_CLUSTER_M) return { kind: "ambiguous", names: Array.from(new Set(matching.map((m) => m.name))), spreadM };
  return {
    kind: "matched",
    nodeId: first.id,
    nodeName: matching[0].name,
    lat: first.lat,
    lng: first.lon,
    metresMoved: metresBetween(row.lat, row.lng, first.lat, first.lon),
    matches: matching.length,
  };
}
