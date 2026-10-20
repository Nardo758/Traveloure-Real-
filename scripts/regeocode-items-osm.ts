/**
 * 9b-e — re-geocode plan items through OpenStreetMap (Nominatim). v1 and v2 are DRY RUNS that report what a write
 * would do; only `--v2 --apply` writes, and only to `open_place_coords` and `itinerary_item_open_coords` (LG-1,
 * re-keyed by 390 — never a `coord_source` stamp on the Google row).
 *
 *   npx tsx scripts/regeocode-items-osm.ts         # v1 (step 1)
 *   npx tsx scripts/regeocode-items-osm.ts --v2    # v2 (step 1b): normalised names, place phrases, spine viewbox
 *   npx tsx scripts/regeocode-items-osm.ts --v2 --apply   # LG-1: the ONE-OFF write (open_place_coords + item links)
 *   npx tsx scripts/regeocode-items-osm.ts --wikidata     # LG-1 step 1c: READ-ONLY Wikidata search for Kyoto items
 *                                                          # Nominatim could not place (no_results / no_match)
 *
 * Every v2 run (dry or --apply) ends with EVERY ambiguous item and its candidates (names, points, metres apart), for a
 * person to pick one — plan content, posted in chat, never committed.
 *
 * --apply (LG-1, ledger `2026-10-17-lg1-osm-place-coords`; re-keyed by migration 390, ledger
 * `2026-10-18-lg1-open-coords-rekey`): a resolved match is written through the ONE writer, `recordOpenCoordForItem` —
 * the open place keyed by its own OSM element ('osm:<type>/<id>', insert-once, credited "© OpenStreetMap contributors")
 * and the item linked to it (`itinerary_item_open_coords`). The item's Google place id, when it has one, is recorded on
 * the row as an attribute; an item without one is written all the same. Nothing is written to place_facts or
 * itinerary_items (ODbL). An item already linked is skipped without a request, so a re-run resumes. A match that names
 * no OSM element, an ambiguous match and an unresolved one write nothing. One-off batch at 1 request/s — never a
 * runtime Nominatim call. Run by Replit after migration 390 is applied; the output is plan content, never committed.
 *
 * v2 reads `city_neighborhoods` (names, centroids, radii) for the viewbox hint and prints per-reason unresolved
 * counts, the query basis and viewbox source counts, and twenty samples.
 *
 * LG-2 Ask 8 (ruling 7): every run asks the geocoder at `GEOCODER_BASE_URL` and REFUSES to start when it is unset or
 * names the public Nominatim server — no further batch runs or rechecks against nominatim.openstreetmap.org.
 *
 * Reads `itinerary_items` (located rows) with their plan's destination, sends one Nominatim request per item that
 * names a place, at least 1.1 s apart, with a user agent naming Traveloure. Prints the counts (resolved /
 * ambiguous / unresolved / unreachable) and ten sample rows. Against production it is run by Replit; this
 * session never holds a production database URL. The output is plan content: post it as a report, never commit it.
 */
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../server/db";
import { batchGeocoderRefusal, geocoderBaseUrl } from "../server/config/geocoder.config";
import { cityNeighborhoods, itineraryItems, trips } from "../shared/schema";
import { placeRefsForTrip } from "../server/services/content-facts/place-facts.service";
import { itemsWithOpenCoord, openCoordsForPlaceIds, recordOpenCoordForItem } from "../server/services/routing/open-place-coords.service";
import { lookupItemWikidata, verifyWikidataRegion, WIKIDATA_MIN_INTERVAL_MS, WIKIDATA_REGION, type WikidataOutcome } from "../server/services/item-wikidata-lookup.service";
import {
  metresBetween,
  NOMINATIM_MIN_INTERVAL_MS,
  regeocodeItem,
  regeocodeItemV2,
  type RegeocodeItem,
  type RegeocodeOutcome,
  type RegeocodeV2Result,
  type SpineNeighbourhood,
  v2QueryPlan,
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
  // LG-1 re-key (migration 390): an item is written through its own link row, not a Google place id, so an item that
  // already has one is skipped without a request (a re-run resumes) and an item with no place id is no longer skipped.
  const linked = apply ? await itemsWithOpenCoord(items.map((i) => i.id)) : new Set<string>();
  const writes = { written: 0, alreadyLinked: 0, newOpenPlaces: 0, linkedToExistingPlace: 0, noOsmId: 0, resolved: 0, resolvedWithoutPlaceId: 0 };
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
    if (apply && linked.has(item.id)) {
      writes.alreadyLinked += 1;
      continue;
    }
    const wait = lastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const r = await regeocodeItemV2(item, spine);
    if (r.outcome.kind === "resolved") {
      writes.resolved += 1;
      if (!item.placeId) writes.resolvedWithoutPlaceId += 1;
      if (apply) {
        const w = await recordOpenCoordForItem({
          itemId: item.id,
          googlePlaceId: item.placeId,
          lat: r.outcome.lat,
          lng: r.outcome.lng,
          osmType: r.outcome.osmType ?? null,
          osmId: r.outcome.osmId ?? null,
          osmName: r.outcome.matchedName,
          matchedAt: new Date(),
        });
        if (w.reason === "no_osm_id") writes.noOsmId += 1;
        if (w.linked) writes.written += 1;
        if (w.rowInserted) writes.newOpenPlaces += 1;
        else if (w.linked) writes.linkedToExistingPlace += 1;
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
  console.log(apply ? "APPLY (v2) — resolved matches written to open_place_coords + itinerary_item_open_coords only." : "DRY RUN (v2) — nothing written.");
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
  // EVERY ambiguous item, with each candidate and how far apart they are, for a person to pick one. Nothing is written
  // for these. Plan content — post it in chat, never commit it.
  const ambiguous = results.filter((x) => x.r.outcome.kind === "ambiguous");
  if (ambiguous.length) console.log(`AMBIGUOUS (${ambiguous.length}) — not written; a person picks one:`);
  for (const { item, r } of ambiguous) {
    const o = r.outcome as Extract<RegeocodeV2Result["outcome"], { kind: "ambiguous" }>;
    const c = o.candidates ?? [];
    const apart = c.length >= 2 ? Math.round(Math.max(...c.flatMap((a) => c.map((b) => metresBetween(a.lat, a.lng, b.lat, b.lng))))) : null;
    console.log(
      JSON.stringify({
        item: item.id.slice(0, 8),
        title: item.title,
        query: r.query,
        candidates: c.map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, osm: x.osmType && x.osmId ? `${x.osmType}/${x.osmId}` : null })),
        metresApart: apart,
      }),
    );
  }
}

/**
 * LG-1 step 1c — READ-ONLY. For Kyoto items with no open coordinate yet: the v2 Nominatim lookup again (1 req/s), and
 * for each `no_results` / `no_match` a Wikidata label search (`item-wikidata-lookup.service.ts`, serial, ≥1.1 s apart).
 * Reports the resolved count, twenty samples and the remainder that names no place. Writes nothing.
 */
async function mainWikidata(): Promise<void> {
  const region = await verifyWikidataRegion();
  if (!region.ok) {
    console.error(`REFUSED: ${WIKIDATA_REGION.qid} reads "${region.label ?? "unreachable"}", not "${WIKIDATA_REGION.enLabel}". Nothing searched.`);
    process.exitCode = 1;
    return;
  }
  const all = await loadItemsV2();
  const kyoto = all.filter((i) => /kyoto/i.test(i.destination ?? ""));
  // Already open: the item is linked to an open place (390), or its place id has an admin or open row.
  const linked = await itemsWithOpenCoord(kyoto.map((i) => i.id));
  const byPlace = await openCoordsForPlaceIds(kyoto.map((i) => i.placeId).filter((p): p is string => !!p));
  const spine: SpineNeighbourhood[] = (
    await db
      .select({ name: cityNeighborhoods.name, city: cityNeighborhoods.city, centroidLat: cityNeighborhoods.centroidLat, centroidLng: cityNeighborhoods.centroidLng, radiusKm: cityNeighborhoods.radiusKm })
      .from(cityNeighborhoods)
  ).map((n) => ({ name: n.name, city: n.city, centroidLat: Number(n.centroidLat), centroidLng: Number(n.centroidLng), radiusKm: n.radiusKm == null ? null : Number(n.radiusKm) }));

  const counts = { kyotoItems: kyoto.length, otherMarketItems: all.length - kyoto.length, alreadyOpen: 0, noPlaceId: 0, nominatimAsked: 0, wikidataAsked: 0 };
  const nominatimBy: Record<string, number> = {};
  const wikidataBy: Record<string, number> = {};
  const rows: Array<{ item: RegeocodeItem & { placeId: string | null }; nominatim: string; search: string | null; outcome: WikidataOutcome | null }> = [];
  let lastNominatim = 0;
  let lastWikidata = 0;
  for (const item of kyoto) {
    if (linked.has(item.id) || (item.placeId && byPlace.has(item.placeId))) {
      counts.alreadyOpen += 1;
      continue;
    }
    if (!item.placeId) counts.noPlaceId += 1; // reported only: since 390 an item with no place id is written through its link
    const plan = v2QueryPlan(item);
    let nominatim: string;
    if (plan.skip) {
      nominatim = plan.skip;
    } else {
      const wait = lastNominatim + NOMINATIM_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const r = await regeocodeItemV2(item, spine);
      lastNominatim = Date.now();
      counts.nominatimAsked += 1;
      nominatim = r.outcome.kind === "unresolved" ? r.outcome.reason : r.outcome.kind;
    }
    nominatimBy[nominatim] = (nominatimBy[nominatim] ?? 0) + 1;
    let outcome: WikidataOutcome | null = null;
    let search: string | null = null;
    if (nominatim === "no_results" || nominatim === "no_match" || nominatim === "not_a_place") {
      const wait = lastWikidata + WIKIDATA_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const w = await lookupItemWikidata(item);
      lastWikidata = Date.now();
      if (w.requested) counts.wikidataAsked += 1;
      outcome = w.outcome;
      search = w.search;
      const k = w.outcome.kind === "unresolved" ? `unresolved:${w.outcome.reason}` : w.outcome.kind;
      wikidataBy[k] = (wikidataBy[k] ?? 0) + 1;
    }
    rows.push({ item, nominatim, search, outcome });
  }
  const resolved = rows.filter((r) => r.outcome?.kind === "resolved");
  // The remainder that stays unrouted by design (LB3 "Not on the map yet"): items that name no place, plus what
  // Wikidata could not place; ambiguous and unreachable rows are counted apart (a person, or a re-run, may still place them).
  const nonPlace = rows.filter((r) => ["no_place_phrase", "no_named_tokens", "area_title"].includes(r.nominatim)).length;
  const wikidataMissed = rows.filter((r) => r.outcome?.kind === "unresolved").length;
  console.log(`DRY RUN (Wikidata, step 1c) — nothing written. Region ${WIKIDATA_REGION.qid} = "${region.label}".`);
  console.log(JSON.stringify({ counts, nominatimBy, wikidataBy, wikidataResolved: resolved.length, remainder: { nonPlace, wikidataMissed } }, null, 2));
  const sample = [
    ...resolved.slice(0, 12),
    ...rows.filter((r) => r.outcome?.kind === "ambiguous").slice(0, 3),
    ...rows.filter((r) => r.outcome?.kind === "unresolved").slice(0, 5),
  ].slice(0, 20);
  for (const r of sample) {
    console.log(JSON.stringify({ item: r.item.id.slice(0, 8), title: r.item.title, locationName: r.item.locationName, nominatim: r.nominatim, search: r.search, outcome: r.outcome }));
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  // LG-2 Ask 8 (ruling 7): no batch run against the public Nominatim server. Wikidata (--wikidata) also asks Nominatim
  // first, so it is refused the same way. The address is config, never printed (it may name a private instance).
  const refusal = batchGeocoderRefusal(geocoderBaseUrl());
  if (refusal) {
    console.error(
      refusal === "public_nominatim"
        ? "REFUSED: GEOCODER_BASE_URL names the public Nominatim server. Batch runs wait for a self-hosted or paid geocoder."
        : refusal === "not_configured"
          ? "REFUSED: GEOCODER_BASE_URL is not set. Batch runs wait for a self-hosted or paid geocoder; nothing was requested."
          : "REFUSED: GEOCODER_BASE_URL is not an http(s) address. Nothing was requested.",
    );
    process.exitCode = 1;
    return;
  }
  if (apply && !process.argv.includes("--v2")) throw new Error("--apply runs only with --v2");
  if (process.argv.includes("--wikidata")) {
    if (apply) throw new Error("--wikidata is read-only in step 1c; it never runs with --apply");
    return mainWikidata();
  }
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
