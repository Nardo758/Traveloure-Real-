/**
 * generate-market-geography.ts — regenerates a `MarketGeography` literal
 * (shared/geo/market-geography.ts) from real OpenStreetMap data via the public Overpass API.
 *
 * WHY THIS EXISTS: shared/geo/market-geography.ts's own header states the committed Kyoto data is
 * HAND-SEEDED approximate geography (the Kamo river's course, the Higashiyama edge, the Imperial
 * Palace grounds — drawn from well-known landmarks, not traced OSM ways) — a placeholder pending a
 * real regen run. This script is that regen run: it queries Overpass for a market's water/parks/
 * primary-roads within a bounding box, simplifies the results (coordinate rounding + point
 * thinning, so the committed literal stays small and readable), and prints (or writes) a
 * ready-to-paste `MarketGeography` object literal.
 *
 * STANDALONE — never imported by the server. This is an offline authoring tool, not runtime code;
 * nothing in server/ or client/src/ requires it to exist, compile cleanly under strict tsc, or even
 * be present in the repo. Run it, review the output, hand-paste the result into
 * shared/geo/market-geography.ts, and commit that file — this script itself never writes to that
 * module.
 *
 * NETWORK EGRESS: Overpass API (https://overpass-api.de) is a public, rate-limited third-party
 * service. This sandbox's outbound HTTPS may not reach it — run this WHERE NETWORK EGRESS ALLOWS
 * (a Replit workspace, a laptop, CI with internet access), not inside a network-isolated agent
 * sandbox. A timeout or DNS failure here is an environment limitation, not a bug in the query.
 *
 * DATA HONESTY (CLAUDE.md §13): every coordinate this script emits traces a real Overpass
 * `out geom` response — nothing is guessed, interpolated between landmarks, or hand-drawn. The
 * ODbL requires attribution ("© OpenStreetMap contributors") wherever the resulting geometry
 * renders — shared/geo/market-geography.ts's consumers already carry that text; do not drop it.
 *
 * USAGE:
 *   npx tsx scripts/generate-market-geography.ts <marketSlug> <west> <south> <east> <north> [--out <path>] [--max-points <n>] [--max-ways <n>]
 *
 * EXAMPLE (Kyoto city core, matching the committed KYOTO_GEOGRAPHY.bbox):
 *   npx tsx scripts/generate-market-geography.ts kyoto 135.72 34.975 135.80 35.045 \
 *     --out scratch/kyoto-geography.txt
 *
 * The bbox order matches shared/geo/market-geography.ts's `MarketGeography.bbox`:
 *   [west, south, east, north] in lon/lat (Overpass wants south,west,north,east — this script
 *   reorders for you, so pass args in the SAME order the target literal uses).
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const COORD_DECIMALS = 5; // ~1.1m precision — plenty for a background illustration layer
const DEFAULT_MAX_POINTS = 40; // per way, after thinning — keeps the literal readable/committable

// Per-layer selection caps. A city-core bbox returns THOUSANDS of ways (Kyoto: 421 water /
// 1284 parks / 494 roads) — committing them all would bloat the client bundle (shared/ ships to
// the browser) and the renderers, for a layer whose whole job is "recognizable at a glance".
// Ways are ranked by real geographic length (haversine over the raw geometry, before thinning),
// so the caps keep the major river segments, the big parks, and the main arteries and drop the
// pond-sized noise. Override uniformly with --max-ways <n>. What was dropped is always logged —
// a capped extract must never read as "everything Overpass had" (§13).
const DEFAULT_MAX_WAYS: Record<"water" | "parks" | "roads", number> = {
  water: 20,
  parks: 25,
  roads: 35,
};
// Ways shorter than this never make the cut, even under the cap — a 50m garden strip or a
// road stub adds bytes, not recognizability.
const MIN_WAY_KM: Record<"water" | "parks" | "roads", number> = {
  water: 0.4,
  parks: 0.35,
  roads: 0.8,
};

const EARTH_RADIUS_KM = 6371;
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

interface OverpassGeomPoint {
  lat: number;
  lon: number;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeomPoint[];
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function usageAndExit(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    "Usage: npx tsx scripts/generate-market-geography.ts <marketSlug> <west> <south> <east> <north> [--out <path>] [--max-points <n>] [--max-ways <n>]",
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  if (positional.length < 5) usageAndExit("expected <marketSlug> <west> <south> <east> <north>");
  const [marketSlug, westS, southS, eastS, northS] = positional;
  const [west, south, east, north] = [westS, southS, eastS, northS].map(Number);
  if ([west, south, east, north].some((n) => !Number.isFinite(n))) {
    usageAndExit("west/south/east/north must all be numbers");
  }
  if (west >= east || south >= north) {
    usageAndExit("bbox must satisfy west < east and south < north");
  }

  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : null;
  const maxPointsIdx = argv.indexOf("--max-points");
  const maxPoints = maxPointsIdx >= 0 ? Number(argv[maxPointsIdx + 1]) : DEFAULT_MAX_POINTS;
  const maxWaysIdx = argv.indexOf("--max-ways");
  const maxWaysOverride = maxWaysIdx >= 0 ? Number(argv[maxWaysIdx + 1]) : null;
  if (maxWaysOverride !== null && (!Number.isFinite(maxWaysOverride) || maxWaysOverride < 1)) {
    usageAndExit("--max-ways must be a positive number");
  }

  return {
    marketSlug,
    bbox: [west, south, east, north] as [number, number, number, number],
    outPath,
    maxPoints,
    maxWaysOverride,
  };
}

/** Overpass QL: water (natural=water polygons, waterway=river/canal ways), parks
 *  (leisure=park, landuse=grass), and primary-ish roads (highway=primary|trunk), all within the
 *  given bbox. `out geom` inlines each way's node coordinates so no second lookup is needed. */
function buildQuery([west, south, east, north]: [number, number, number, number]): string {
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

// Overpass's public gateways 406 requests without a descriptive User-Agent (their usage
// policy asks tools to identify themselves) — first observed on the Replit verification
// run. Identify ourselves, ask for JSON explicitly, and fall back through public mirrors.
const OVERPASS_MIRRORS = [
  OVERPASS_ENDPOINT,
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  let lastErr: Error | null = null;
  for (const endpoint of OVERPASS_MIRRORS) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "Traveloure-market-geography/1.0 (+https://traveloure.com; one-off market extract)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`${endpoint} returned ${resp.status} ${resp.statusText}: ${body.slice(0, 300)}`);
      }
      return (await resp.json()) as OverpassResponse;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[generate-market-geography] ${lastErr.message} — trying next mirror`);
    }
  }
  throw new Error(`All Overpass mirrors failed. Last: ${lastErr?.message}`);
}

/** Rounds to COORD_DECIMALS, then thins to at most maxPoints while ALWAYS keeping the first and
 *  last point (so a road/river/water outline never loses its endpoints). Simple stride-based
 *  thinning, not Douglas-Peucker — good enough for a background illustration layer where the
 *  point is "recognizable shape", not surveying precision. */
function simplify(points: OverpassGeomPoint[], maxPoints: number): [number, number][] {
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

function classify(el: OverpassElement): "water" | "parks" | "roads" | null {
  const tags = el.tags ?? {};
  if (tags.natural === "water" || tags.waterway === "river" || tags.waterway === "canal") return "water";
  if (tags.leisure === "park" || tags.landuse === "grass" || tags.landuse === "forest" || tags.landuse === "recreation_ground") {
    return "parks";
  }
  if (tags.highway === "primary" || tags.highway === "trunk") return "roads";
  return null;
}

function formatLine(points: [number, number][]): string {
  const rows = points.map(([lon, lat]) => `      [${lon}, ${lat}],`).join("\n");
  return `    [\n${rows}\n    ],`;
}

async function main() {
  const { marketSlug, bbox, outPath, maxPoints, maxWaysOverride } = parseArgs(process.argv.slice(2));

  console.error(`[generate-market-geography] querying Overpass for "${marketSlug}" bbox=[${bbox.join(", ")}] ...`);
  const query = buildQuery(bbox);
  const data = await fetchOverpass(query);
  console.error(`[generate-market-geography] Overpass returned ${data.elements.length} element(s)`);

  // Collect every classified way with its real length, then rank-and-cap per layer.
  const collected: Record<"water" | "parks" | "roads", { points: OverpassGeomPoint[]; km: number }[]> = {
    water: [],
    parks: [],
    roads: [],
  };
  for (const el of data.elements) {
    if (!el.geometry || el.geometry.length < 2) continue; // no inline geometry (rare) — skip, never guess
    const kind = classify(el);
    if (!kind) continue;
    collected[kind].push({ points: el.geometry, km: wayLengthKm(el.geometry) });
  }

  const layers: Record<"water" | "parks" | "roads", [number, number][][]> = { water: [], parks: [], roads: [] };
  for (const kind of ["water", "parks", "roads"] as const) {
    const cap = maxWaysOverride ?? DEFAULT_MAX_WAYS[kind];
    const eligible = collected[kind].filter((w) => w.km >= MIN_WAY_KM[kind]);
    const kept = eligible.sort((a, b) => b.km - a.km).slice(0, cap);
    layers[kind] = kept.map((w) => simplify(w.points, maxPoints));
    console.error(
      `[generate-market-geography] ${kind}: kept ${kept.length}/${collected[kind].length} way(s) ` +
        `(length-ranked, min ${MIN_WAY_KM[kind]}km, cap ${cap}; dropped ` +
        `${collected[kind].length - kept.length})`,
    );
  }
  const { water, parks, roads } = layers;

  const constName = `${marketSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_GEOGRAPHY`;
  const literal = `/** ${marketSlug} — generated by scripts/generate-market-geography.ts from live OSM/Overpass data
 *  (bbox=[${bbox.join(", ")}]) on ${new Date().toISOString().slice(0, 10)}. NOT exhaustive by design: each layer keeps
 *  only the longest ways (water ${water.length}, parks ${parks.length}, roads ${roads.length} kept) — a recognizable
 *  background illustration, not full OSM coverage. Review before committing —
 *  Overpass coverage varies by market; a sparse result (few/no ways) means the bbox or tag set needs
 *  adjusting, not that the market has no water/parks/roads. */
export const ${constName}: MarketGeography = {
  market: "${marketSlug}",
  bbox: [${bbox.join(", ")}],
  water: [
${water.map(formatLine).join("\n")}
  ],
  parks: [
${parks.map(formatLine).join("\n")}
  ],
  roads: [
${roads.map(formatLine).join("\n")}
  ],
};
`;

  if (outPath) {
    const fs = await import("fs");
    fs.writeFileSync(outPath, literal, "utf-8");
    console.error(`[generate-market-geography] wrote ${outPath}`);
  } else {
    console.log(literal);
  }

  console.error(
    "[generate-market-geography] done. Paste the literal into shared/geo/market-geography.ts, add it to " +
      "MARKET_GEOGRAPHIES, and review the shapes visually before committing (§13 — this script fetches real " +
      "data but does not validate that Overpass's tag coverage matches what a human expects to see).",
  );
}

main().catch((err) => {
  console.error("[generate-market-geography] FAILED:", err?.message ?? err);
  process.exit(1);
});
