/**
 * LG-1 addition — DRY RUN: re-derive each `city_neighborhoods` centroid from OpenStreetMap the way the admin Add-market
 * path does (the named `place=suburb|neighbourhood|quarter` node, `extractNeighborhoods`'s Overpass query) and report
 * what a write would do. Writes NOTHING; the write (with its credit) is a later, held change.
 *
 *   npx tsx scripts/neighborhood-centroids-osm.ts
 *
 * One Overpass request per city (the box around that city's own rows, ≤ 1° a side), at least 5 s apart, through the
 * same mirrors and user agent as Add-market. Matching is by name only (`matchCentroid`) — the current centroid is used
 * only to report how far the OSM node is from it. Run by Replit (this session has no Overpass egress and never holds a
 * production database URL). Neighbourhood names are public; the output is still a report, never committed.
 */
import { db } from "../server/db";
import { cityNeighborhoods } from "../shared/schema";
import { buildNeighborhoodQuery, fetchOverpass } from "../server/services/market-extract.service";
import { cityBoxFor, matchCentroid, type CentroidOutcome, type CentroidRow, type OsmPlaceNode } from "../server/services/neighborhood-centroid-osm";

const OVERPASS_SPACING_MS = 5_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const rows: CentroidRow[] = (
    await db
      .select({ id: cityNeighborhoods.id, city: cityNeighborhoods.city, name: cityNeighborhoods.name, lat: cityNeighborhoods.centroidLat, lng: cityNeighborhoods.centroidLng })
      .from(cityNeighborhoods)
  ).map((r) => ({ id: r.id, city: r.city, name: r.name, lat: Number(r.lat), lng: Number(r.lng) }));
  const byCity = new Map<string, CentroidRow[]>();
  for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r]);

  const counts = { rows: rows.length, cities: byCity.size, matched: 0, ambiguous: 0, unmatched: 0, cityFailed: 0 };
  const moved = { under100m: 0, under500m: 0, under2km: 0, over2km: 0 };
  const lines: string[] = [];
  let first = true;
  for (const [city, cityRows] of Array.from(byCity.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const box = cityBoxFor(cityRows);
    if (!box) continue;
    if (!first) await sleep(OVERPASS_SPACING_MS);
    first = false;
    let nodes: OsmPlaceNode[] = [];
    try {
      const data = await fetchOverpass(buildNeighborhoodQuery(box));
      nodes = (data.elements ?? [])
        .filter((e: any) => e.type === "node" && typeof e.lat === "number" && typeof e.lon === "number")
        .map((e: any) => ({ id: e.id, lat: e.lat, lon: e.lon, tags: e.tags ?? {} }));
    } catch (err: any) {
      counts.cityFailed += 1;
      lines.push(JSON.stringify({ city, error: String(err?.message ?? err).slice(0, 200) }));
      continue;
    }
    for (const row of cityRows) {
      const out: CentroidOutcome = matchCentroid(row, nodes);
      counts[out.kind] += 1;
      if (out.kind === "matched") {
        const m = out.metresMoved;
        if (m < 100) moved.under100m += 1;
        else if (m < 500) moved.under500m += 1;
        else if (m < 2000) moved.under2km += 1;
        else moved.over2km += 1;
      }
      lines.push(JSON.stringify({ city, name: row.name, outcome: out }));
    }
  }
  console.log("DRY RUN — nothing written. Centroids from OSM place nodes, © OpenStreetMap contributors.");
  console.log(JSON.stringify({ counts, matchedMoved: moved }, null, 2));
  for (const l of lines) console.log(l);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
