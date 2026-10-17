/**
 * 9b-e — DRY RUN: re-geocode every located plan item through OpenStreetMap (Nominatim) and report what a write
 * would do. Writes NOTHING; there is no apply mode in this script. Writing `coord_source` waits on production
 * confirming migration 388 (`/api/health` lastApplied) and is a later change.
 *
 *   npx tsx scripts/regeocode-items-osm.ts
 *
 * Reads `itinerary_items` (located rows) with their plan's destination, sends one Nominatim request per item that
 * names a place, at least 1.1 s apart, with a user agent naming Traveloure. Prints the counts (resolved /
 * ambiguous / unresolved / unreachable) and ten sample rows. Against production it is run by Replit; this
 * session never holds a production database URL. The output is plan content: post it as a report, never commit it.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../server/db";
import { itineraryItems, trips } from "../shared/schema";
import { NOMINATIM_MIN_INTERVAL_MS, regeocodeItem, type RegeocodeItem, type RegeocodeOutcome } from "../server/services/item-osm-regeocode.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
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
