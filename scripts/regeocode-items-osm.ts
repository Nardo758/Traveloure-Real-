/**
 * 9b-e — re-geocode plan items through OpenStreetMap (Nominatim). v1 and v2 are DRY RUNS that report what a write
 * would do; only `--v2 --apply` writes, and only to `osm_place_coords` (LG-1 — never a `coord_source` stamp on the
 * Google row).
 *
 *   npx tsx scripts/regeocode-items-osm.ts         # v1 (step 1)
 *   npx tsx scripts/regeocode-items-osm.ts --v2    # v2 (step 1b): normalised names, place phrases, spine viewbox
 *   npx tsx scripts/regeocode-items-osm.ts --v2 --apply   # LG-1: the ONE-OFF write into osm_place_coords
 *
 * --apply (LG-1, ledger `2026-10-17-lg1-osm-place-coords`): a resolved match is written to `osm_place_coords` keyed by
 * the item's Google place id (`itinerary_items.google_place_id`, else its unexpired place_id fact) through the ONE
 * writer, credited "© OpenStreetMap contributors". Nothing is written to place_facts or itinerary_items (ODbL). Each
 * place id is asked once; a place already in the table is skipped without a request, so a re-run resumes. An item
 * with no place id, an ambiguous match and an unresolved one write nothing. One-off batch at 1 request/s — never a
 * runtime Nominatim call. Run by Replit after "Migration 389" is applied; the output is plan content, never committed.
 *
 * v2 reads `city_neighborhoods` (names, centroids, radii) for the viewbox hint and prints per-reason unresolved
 * counts, the query basis and viewbox source counts, and twenty samples.
 *
 * Reads `itinerary_items` (located rows) with their plan's destination, sends one Nominatim request per item that
 * names a place, at least 1.1 s apart, with a user agent naming Traveloure. Prints the counts (resolved /
 * ambiguous / unresolved / unreachable) and ten sample rows. Against production it is run by Replit; this
 * session never holds a production database URL. The output is plan content: post it as a report, never commit it.
 */
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../server/db";
import { cityNeighborhoods, itineraryItems, osmPlaceCoords, trips } from "../shared/schema";
import { placeRefsForTrip } from "../server/services/content-facts/place-facts.service";
import { recordOsmPlaceCoord } from "../server/services/routing/open-place-coords.service";
import {
  NOMINATIM_MIN_INTERVAL_MS,
  regeocodeItem,
  regeocodeItemV2,
  type RegeocodeItem,
  type RegeocodeOutcome,
  type RegeocodeV2Result,
  type SpineNeighbourhood,
} from "../server/services/item-osm-regeocode.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** v2 scope: located items, and items that carry a Google place id even without a stored point. */
async function loadItemsV2(): Promise<Array<RegeocodeItem & { tripId: string; placeId: string | null }>> {
  const rows = await db
    .select({
      id: itineraryItems.id,
      tripId: itineraryItems.tripId,
      title: itineraryItems.title,
      locationName: itineraryItems.locationName,
      latitude: itineraryItems.latitude,
      longitude: itineraryItems.longitude,
      googlePlaceId: itineraryItems.googlePlaceId,
      destination: trips.destination,
    })
    .from(itineraryItems)
    .innerJoin(trips, eq(trips.id, itineraryItems.tripId))
    .where(or(and(isNotNull(itineraryItems.latitude), isNotNull(itineraryItems.longitude)), isNotNull(itineraryItems.googlePlaceId)));
  // The place id: the item's own column, else its unexpired place_id fact (read per plan, the one reader).
  const byTrip = new Map<string, string[]>();
  for (const r of rows) if (!r.googlePlaceId) byTrip.set(r.tripId, [...(byTrip.get(r.tripId) ?? []), r.id]);
  const factPlaceId = new Map<string, string>();
  for (const [tripId, ids] of Array.from(byTrip.entries())) {
    const refs = await placeRefsForTrip(tripId, ids);
    refs.forEach((v, itemId) => {
      if (v.placeId) factPlaceId.set(itemId, v.placeId);
    });
  }
  return rows.map((row) => ({
    id: row.id,
    tripId: row.tripId,
    title: row.title,
    locationName: row.locationName,
    destination: row.destination,
    storedLat: row.latitude == null ? null : Number(row.latitude),
    storedLng: row.longitude == null ? null : Number(row.longitude),
    placeId: row.googlePlaceId || factPlaceId.get(row.id) || null,
  }));
}

async function mainV2(apply: boolean): Promise<void> {
  const items = await loadItemsV2();
  const knownPlaceIds = new Set<string>();
  if (apply) {
    const ids = Array.from(new Set(items.map((i) => i.placeId).filter((p): p is string => !!p)));
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = await db.select({ placeId: osmPlaceCoords.placeId }).from(osmPlaceCoords).where(inArray(osmPlaceCoords.placeId, chunk));
      rows.forEach((r) => knownPlaceIds.add(r.placeId));
    }
  }
  const writes = { written: 0, alreadyPresent: 0, noPlaceId: 0, samePlaceThisRun: 0, resolvedWithPlaceId: 0 };
  const askedPlaceIds = new Set<string>();
  const spine: SpineNeighbourhood[] = (
    await db
      .select({
        name: cityNeighborhoods.name,
        city: cityNeighborhoods.city,
        centroidLat: cityNeighborhoods.centroidLat,
        centroidLng: cityNeighborhoods.centroidLng,
        radiusKm: cityNeighborhoods.radiusKm,
      })
      .from(cityNeighborhoods)
  ).map((n) => ({
    name: n.name,
    city: n.city,
    centroidLat: Number(n.centroidLat),
    centroidLng: Number(n.centroidLng),
    radiusKm: n.radiusKm == null ? null : Number(n.radiusKm),
  }));

  const counts = { located: items.length, requested: 0, resolved: 0, ambiguous: 0, unresolved: 0, unreachable: 0 };
  const unresolvedBy: Record<string, number> = {};
  const resolvedBy: Record<string, number> = {};
  const viewboxBy: Record<string, number> = {};
  const results: Array<{ item: RegeocodeItem; r: RegeocodeV2Result }> = [];
  let lastRequestAt = 0;

  for (const item of items) {
    if (apply) {
      if (!item.placeId) {
        writes.noPlaceId += 1;
        continue;
      }
      if (knownPlaceIds.has(item.placeId)) {
        writes.alreadyPresent += 1;
        continue;
      }
      if (askedPlaceIds.has(item.placeId)) {
        writes.samePlaceThisRun += 1;
        continue;
      }
      askedPlaceIds.add(item.placeId);
    }
    const wait = lastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const r = await regeocodeItemV2(item, spine);
    if (r.outcome.kind === "resolved" && item.placeId) {
      writes.resolvedWithPlaceId += 1;
      if (apply) {
        const inserted = await recordOsmPlaceCoord({
          placeId: item.placeId,
          lat: r.outcome.lat,
          lng: r.outcome.lng,
          osmType: r.outcome.osmType ?? null,
          osmId: r.outcome.osmId ?? null,
          osmName: r.outcome.matchedName,
          matchedAt: new Date(),
        });
        if (inserted) writes.written += 1;
        else writes.alreadyPresent += 1;
      }
    }
    if (r.requested) {
      counts.requested += 1;
      lastRequestAt = Date.now();
      viewboxBy[r.viewboxSource ?? "none"] = (viewboxBy[r.viewboxSource ?? "none"] ?? 0) + 1;
    }
    counts[r.outcome.kind] += 1;
    if (r.outcome.kind === "unresolved") unresolvedBy[r.outcome.reason] = (unresolvedBy[r.outcome.reason] ?? 0) + 1;
    if (r.outcome.kind === "resolved") resolvedBy[r.queryBasis ?? "none"] = (resolvedBy[r.queryBasis ?? "none"] ?? 0) + 1;
    results.push({ item, r });
  }

  // Twenty samples: unresolved first (by reason, round-robin), then ambiguous, then resolved, then unreachable.
  const byReason = new Map<string, typeof results>();
  for (const x of results) {
    if (x.r.outcome.kind !== "unresolved") continue;
    const k = x.r.outcome.reason;
    byReason.set(k, [...(byReason.get(k) ?? []), x]);
  }
  const unresolvedSample: typeof results = [];
  for (let i = 0; unresolvedSample.length < 12 && Array.from(byReason.values()).some((l) => l.length > i); i++) {
    byReason.forEach((l) => {
      if (l[i] && unresolvedSample.length < 12) unresolvedSample.push(l[i]);
    });
  }
  const pick = (kind: string, n: number) => results.filter((x) => x.r.outcome.kind === kind).slice(0, n);
  const sample = [...unresolvedSample, ...pick("ambiguous", 3), ...pick("resolved", 5), ...pick("unreachable", 2)].slice(0, 20);

  const pct = counts.requested > 0 ? Math.round((counts.resolved / counts.requested) * 1000) / 10 : 0;
  console.log(apply ? "APPLY (v2) — resolved matches written to osm_place_coords only." : "DRY RUN (v2) — nothing written.");
  console.log(JSON.stringify({ counts, resolvedOfRequestedPct: pct, resolvedBy, unresolvedBy, viewboxBy, writes }, null, 2));
  for (const { item, r } of sample) {
    console.log(
      JSON.stringify({
        item: item.id.slice(0, 8),
        title: item.title,
        locationName: item.locationName,
        destination: item.destination,
        query: r.query,
        queryBasis: r.queryBasis,
        viewbox: r.viewboxSource,
        outcome: r.outcome,
      }),
    );
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--v2")) throw new Error("--apply runs only with --v2");
  if (process.argv.includes("--v2")) return mainV2(apply);
  const rows = await db
    .select({
      id: itineraryItems.id,
      title: itineraryItems.title,
      locationName: itineraryItems.locationName,
      latitude: itineraryItems.latitude,
      longitude: itineraryItems.longitude,
      destination: trips.destination,
    })
    .from(itineraryItems)
    .innerJoin(trips, eq(trips.id, itineraryItems.tripId))
    .where(and(isNotNull(itineraryItems.latitude), isNotNull(itineraryItems.longitude)));

  const counts = { located: rows.length, requested: 0, resolved: 0, ambiguous: 0, unresolved: 0, unreachable: 0 };
  const unresolvedBy: Record<string, number> = {};
  const results: Array<{ item: RegeocodeItem; outcome: RegeocodeOutcome }> = [];
  let lastRequestAt = 0;

  for (const row of rows) {
    const item: RegeocodeItem = {
      id: row.id,
      title: row.title,
      locationName: row.locationName,
      destination: row.destination,
      storedLat: row.latitude == null ? null : Number(row.latitude),
      storedLng: row.longitude == null ? null : Number(row.longitude),
    };
    const wait = lastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const { outcome, requested } = await regeocodeItem(item);
    if (requested) {
      counts.requested += 1;
      lastRequestAt = Date.now();
    }
    counts[outcome.kind] += 1;
    if (outcome.kind === "unresolved") unresolvedBy[outcome.reason] = (unresolvedBy[outcome.reason] ?? 0) + 1;
    results.push({ item, outcome });
  }

  // Ten samples, spread across the outcomes: up to four resolved, then ambiguous, unresolved, unreachable.
  const pick = (kind: RegeocodeOutcome["kind"], n: number) => results.filter((r) => r.outcome.kind === kind).slice(0, n);
  const sample = [...pick("resolved", 4), ...pick("ambiguous", 3), ...pick("unresolved", 3), ...pick("unreachable", 2)].slice(0, 10);

  console.log("DRY RUN — nothing written.");
  console.log(JSON.stringify({ counts, unresolvedBy }, null, 2));
  for (const { item, outcome } of sample) {
    console.log(
      JSON.stringify({
        item: item.id.slice(0, 8),
        title: item.title,
        locationName: item.locationName,
        destination: item.destination,
        outcome,
      }),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
