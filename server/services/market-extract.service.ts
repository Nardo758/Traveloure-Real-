/**
 * market-extract.service.ts — server-side port of scripts/generate-market-geography.ts's Overpass
 * extract core, invoked by the admin "Add market" flow (server/routes/admin-markets.routes.ts).
 * scripts/generate-market-geography.ts itself stays UNTOUCHED and remains the offline
 * hand-run/CI-run authoring tool for regenerating the committed server/geo/kyoto-geography.ts
 * literal — this module is the same logic (same caps, same mirrors, same UA) wired to run inside a
 * request handler instead of a CLI, and extended with a second extract (neighborhoods) the CLI tool
 * never needed.
 *
 * NETWORK EGRESS: Overpass API is a public, rate-limited third-party service. A sandboxed dev
 * environment may not reach it — a thrown error here (see fetchOverpass) is the honest signal;
 * callers must surface it as a real failure (502), never as an empty/fabricated success (§13).
 *
 * DATA HONESTY (§13): every coordinate/name this emits traces a real Overpass response element —
 * nothing is guessed, interpolated, or invented. Unnamed neighborhood nodes are skipped, not
 * defaulted to a placeholder name.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const COORD_DECIMALS = 5; // ~1.1m precision — plenty for a background illustration layer
const DEFAULT_MAX_POINTS = 40; // per way, after thinning — keeps stored rows small and readable
const OVERPASS_TIMEOUT_MS = 180_000; // 180s — matches the Overpass QL [timeout:180] below

// Per-layer selection caps — identical to scripts/generate-market-geography.ts's
// DEFAULT_MAX_WAYS/MIN_WAY_KM. A city-core bbox can return thousands of ways; ranking by real
// geographic length and capping keeps the major river segments, big parks, and main arteries while
// dropping pond-sized noise. What was dropped is always reported in wayCounts — a capped extract
// must never read as "everything Overpass had" (§13).
const DEFAULT_MAX_WAYS: Record<"water" | "parks" | "roads", number> = {
  water: 20,
  parks: 25,
  roads: 35,
};
const MIN_WAY_KM: Record<"water" | "parks" | "roads", number> = {
  water: 0.4,
  parks: 0.35,
  roads: 0.8,
};

const EARTH_RADIUS_KM = 6371;

export interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeomPoint[];
  lat?: number;
  lon?: number;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export type Bbox = [number, number, number, number]; // [west, south, east, north]

export interface WayCount {
  kept: number;
  total: number;
}

export interface MarketExtractResult {
  bbox: Bbox;
  water: [number, number][][];
  parks: [number, number][][];
  roads: [number, number][][];
  wayCounts: { water: WayCount; parks: WayCount; roads: WayCount };
}

export interface NeighborhoodExtractResult {
  name: string;
  lat: number;
  lon: number;
}

type FetchImpl = typeof globalThis.fetch;

function haversineKm(a: OverpassGeomPoint, b: OverpassGeomPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

function wayLengthKm(points: OverpassGeomPoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return km;
}

function validateBbox([west, south, east, north]: Bbox): void {
  if ([west, south, east, north].some((n) => !Number.isFinite(n))) {
    throw new Error("bbox: west/south/east/north must all be numbers");
  }
  if (west >= east || south >= north) {
    throw new Error("bbox: must satisfy west < east and south < north");
  }
}

/** Overpass QL: water (natural=water polygons, waterway=river/canal ways), parks (leisure=park,
 *  landuse=grass/forest/recreation_ground), and primary-ish roads (highway=primary|trunk), all
 *  within the given bbox. `out geom` inlines each way's node coordinates so no second lookup is
 *  needed. Identical query shape to scripts/generate-market-geography.ts. */
export function buildQuery([west, south, east, north]: Bbox): string {
  const bbox = `${south},${west},${north},${east}`; // Overpass bbox order: south,west,north,east
  return `
[out:json][timeout:180];
(
  way["natural"="water"](${bbox});
  way["waterway"~"^(river|canal)$"](${bbox});
  way["leisure"="park"](${bbox});
  way["landuse"~"^(grass|forest|recreation_ground)$"](${bbox});
  way["highway"~"^(primary|trunk)$"](${bbox});
);
out geom;
`.trim();
}

/** Overpass QL for named place nodes within the bbox — suburb/neighbourhood/quarter, the same
 *  vocabulary city_neighborhoods seeds from. `out body` is enough (no geometry needed for a node,
 *  just its own lat/lon + tags). */
export function buildNeighborhoodQuery([west, south, east, north]: Bbox): string {
  const bbox = `${south},${west},${north},${east}`;
  return `
[out:json][timeout:180];
(
  node["place"~"^(suburb|neighbourhood|quarter)$"](${bbox});
);
out body;
`.trim();
}

// Overpass's public gateways 406 requests without a descriptive User-Agent (their usage policy
// asks tools to identify themselves). Identify ourselves, ask for JSON explicitly, and fall back
// through public mirrors — same three endpoints and same UA as scripts/generate-market-geography.ts.
const OVERPASS_MIRRORS = [
  OVERPASS_ENDPOINT,
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

/** Fetches from Overpass with mirror fallback. Throws (never returns a fabricated/empty result) on
 *  total failure — callers (the admin routes) map that to an honest 502. `fetchImpl` is injectable
 *  so this is unit-testable without real network egress. */
export async function fetchOverpass(query: string, fetchImpl: FetchImpl = globalThis.fetch): Promise<OverpassResponse> {
  let lastErr: Error | null = null;
  for (const endpoint of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
      let resp: Response;
      try {
        resp = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "Traveloure-market-geography/1.0 (+https://traveloure.com; one-off market extract)",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`${endpoint} returned ${resp.status} ${resp.statusText}: ${body.slice(0, 300)}`);
      }
      return (await resp.json()) as OverpassResponse;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[market-extract] ${lastErr.message} — trying next mirror`);
    }
  }
  throw new Error(`All Overpass mirrors failed. Last: ${lastErr?.message}`);
}

/** Rounds to COORD_DECIMALS, then thins to at most maxPoints while ALWAYS keeping the first and
 *  last point. Simple stride-based thinning — identical to scripts/generate-market-geography.ts. */
export function simplify(points: OverpassGeomPoint[], maxPoints: number = DEFAULT_MAX_POINTS): [number, number][] {
  const rounded = points.map((p): [number, number] => [
    Number(p.lon.toFixed(COORD_DECIMALS)),
    Number(p.lat.toFixed(COORD_DECIMALS)),
  ]);
  if (rounded.length <= maxPoints) return rounded;

  const stride = Math.ceil(rounded.length / maxPoints);
  const thinned: [number, number][] = [];
  for (let i = 0; i < rounded.length; i += stride) thinned.push(rounded[i]);
  const last = rounded[rounded.length - 1];
  if (thinned[thinned.length - 1][0] !== last[0] || thinned[thinned.length - 1][1] !== last[1]) {
    thinned.push(last);
  }
  return thinned;
}

export function classify(el: OverpassElement): "water" | "parks" | "roads" | null {
  const tags = el.tags ?? {};
  if (tags.natural === "water" || tags.waterway === "river" || tags.waterway === "canal") return "water";
  if (tags.leisure === "park" || tags.landuse === "grass" || tags.landuse === "forest" || tags.landuse === "recreation_ground") {
    return "parks";
  }
  if (tags.highway === "primary" || tags.highway === "trunk") return "roads";
  return null;
}

/** Runs the water/parks/roads extract for a bbox — the same query, classification, length-ranking
 *  and per-layer caps as scripts/generate-market-geography.ts, wired to an injectable fetch. Throws
 *  on Overpass failure (never returns a partial/fabricated success, §13). */
export async function extractMarketGeography(
  bbox: Bbox,
  fetchImpl: FetchImpl = globalThis.fetch,
  maxPoints: number = DEFAULT_MAX_POINTS,
): Promise<MarketExtractResult> {
  validateBbox(bbox);
  const query = buildQuery(bbox);
  const data = await fetchOverpass(query, fetchImpl);

  const collected: Record<"water" | "parks" | "roads", { points: OverpassGeomPoint[]; km: number }[]> = {
    water: [],
    parks: [],
    roads: [],
  };
  for (const el of data.elements) {
    if (!el.geometry || el.geometry.length < 2) continue; // no inline geometry — skip, never guess
    const kind = classify(el);
    if (!kind) continue;
    collected[kind].push({ points: el.geometry, km: wayLengthKm(el.geometry) });
  }

  const layers: Record<"water" | "parks" | "roads", [number, number][][]> = { water: [], parks: [], roads: [] };
  const wayCounts = {} as MarketExtractResult["wayCounts"];
  for (const kind of ["water", "parks", "roads"] as const) {
    const cap = DEFAULT_MAX_WAYS[kind];
    const eligible = collected[kind].filter((w) => w.km >= MIN_WAY_KM[kind]);
    const kept = eligible.sort((a, b) => b.km - a.km).slice(0, cap);
    layers[kind] = kept.map((w) => simplify(w.points, maxPoints));
    wayCounts[kind] = { kept: kept.length, total: collected[kind].length };
  }

  return { bbox, water: layers.water, parks: layers.parks, roads: layers.roads, wayCounts };
}

/** Runs the neighborhood-node extract for a bbox: named suburb/neighbourhood/quarter place nodes.
 *  Unnamed nodes are skipped — never invented (§13). Throws on Overpass failure, same as
 *  extractMarketGeography. */
export async function extractNeighborhoods(
  bbox: Bbox,
  fetchImpl: FetchImpl = globalThis.fetch,
): Promise<NeighborhoodExtractResult[]> {
  validateBbox(bbox);
  const query = buildNeighborhoodQuery(bbox);
  const data = await fetchOverpass(query, fetchImpl);

  const out: NeighborhoodExtractResult[] = [];
  for (const el of data.elements) {
    if (el.type !== "node") continue;
    const name = el.tags?.name?.trim();
    if (!name) continue; // unnamed — skip, never invent (§13)
    if (typeof el.lat !== "number" || typeof el.lon !== "number") continue;
    out.push({ name, lat: el.lat, lon: el.lon });
  }
  return out;
}
