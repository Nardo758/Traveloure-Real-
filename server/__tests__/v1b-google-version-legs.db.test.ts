/**
 * V-1b (ledger `2026-10-12-v1b-google-version-legs`; decision-maker rulings Oct 12, 2026) against a real
 * database. A version stop only Google locates routes from its in-memory point, and that point is stored
 * ONLY on a stamped leg (LD 57 as extended to legs, R311):
 *
 *   G1 versionLegStops: a saved point stands; a kept stop with no saved point takes its plan item's
 *      Google point WITH its fetch time; a stop with neither is left out (never guessed)
 *   G2 the baseline loader carries the Google fact's fetch time on the in-memory point
 *   G3 calculateTransportLegs: a leg with a Google end is stored coord_source='google' with the fetch
 *      time; a leg between saved points is not; the day holding the Google point gets NO maps link; the
 *      Google leg gets NO ride deep link
 *   G4 regenerateMapsUrlsFromLegs (the mode-change rebuild) skips a day with a Google-sourced leg
 *   G5 the daily job CLEARS an expired Google version leg (never re-routes it), rebuilds the version's
 *      maps cache, and leaves an unexpired one and a non-Google one alone
 *
 * DISPOSABLE DB ONLY. The CI routing stub (ROUTING_ADAPTER_STUB=1) answers every leg; no Routes call is made.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { versionLegStops } from "../itinerary-optimizer";
import { loadTripOptimizerInputs } from "../services/optimizer-baseline.service";
import { calculateTransportLegs, regenerateMapsUrlsFromLegs } from "../services/transport-leg-calculator";
import { runLegGoogleCoordsRefresh, defaultLegGoogleCoordsDeps } from "../jobs/legGoogleCoordsRefresh";
import { routingAdapter } from "../services/routing";
import { RouteRunMemo } from "../services/routing/route-memo";

process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
const routingCtx = () => ({
  adapter: routingAdapter()!,
  memo: new RouteRunMemo(),
  hasTransitCoverage: false,
  tripStart: "2027-11-11",
  timezone: "Asia/Tokyo",
  now: () => new Date("2026-10-12T00:00:00Z"),
});

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `v1b-${RUN}-${s}`;
const OWNER = id("owner");
const T = id("plan");
const CMP = id("cmp");
const V = id("v");
const FACT = { lat: 34.9949, lng: 135.785 };
const FETCHED = new Date("2026-10-01T00:00:00Z");

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${T}, ${OWNER}, 'V-1b', 'Kyoto, Japan', '2027-11-11', '2027-11-12', 'draft', 'vacation')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, item_type, origin, start_time, routing_status, location_name, latitude, longitude)
    VALUES (${id("area")}, ${T}, 1, 0, 'Kiyomizu-dera', 'activity', 'ai', '09:00', 'in_planning', 'Higashiyama Ward, Kyoto', '34.99', '135.78')`);
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (${id("fact")}, 'place_id', 'ChIJ-v1b', 'activity', 'location', ${JSON.stringify(FACT)}::jsonb,
      'places_api', ${FETCHED.toISOString()}::timestamptz, now() + interval '20 days', ${T}, ${id("area")})`);
  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status)
    VALUES (${CMP}, ${OWNER}, ${T}, 'V-1b', 'Kyoto, Japan', 'generated')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order)
    VALUES (${V}, ${CMP}, 'Relaxed', 'ai_optimized', 'generated', 1)`);
});

after(async () => {
  await db.execute(sql`DELETE FROM transport_booking_options WHERE variant_id = ${V} OR transport_leg_id IN (SELECT id FROM transport_legs WHERE variant_id = ${V})`).catch(() => {});
  await db.execute(sql`DELETE FROM maps_export_cache WHERE variant_id = ${V}`).catch(() => {});
  await db.execute(sql`DELETE FROM transport_legs WHERE variant_id = ${V}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variant_items WHERE variant_id = ${V}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variants WHERE comparison_id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`).catch(() => {});
});

const stop = (o: Partial<Parameters<typeof versionLegStops>[0][number]>) => ({
  id: "x", name: "Stop", latitude: null, longitude: null, startTime: "09:00", duration: 60, dayNumber: 1, sortOrder: 0, sourceItemId: null, ...o,
});

test("G1 versionLegStops: saved point, kept stop's Google point with its fetch time, nothing guessed", () => {
  const google = new Map([["p-area", { ...FACT, fetchedAt: FETCHED }]]);
  const out = versionLegStops(
    [
      stop({ id: "a", latitude: "35.0", longitude: "135.7", sourceItemId: "p-own" }),
      stop({ id: "b", sourceItemId: "p-area", sortOrder: 1 }),
      stop({ id: "c", sourceItemId: "p-none", sortOrder: 2 }),
    ],
    google,
  );
  assert.deepEqual(out.map((s) => s.id), ["a", "b"]);
  assert.equal(out[0].googleFetchedAt, undefined, "a saved point is never Google-marked");
  assert.deepEqual([out[1].lat, out[1].lng, out[1].googleFetchedAt?.toISOString()], [FACT.lat, FACT.lng, FETCHED.toISOString()]);
});

test("G2 the baseline loader carries the fact's fetch time on the in-memory point", async () => {
  const { baselineItems } = await loadTripOptimizerInputs(T);
  const area = baselineItems.find((b) => b.id === id("area"))!;
  assert.equal(area.latitude, undefined);
  assert.deepEqual(area.placesPoint, FACT);
  assert.equal(area.placesFetchedAt?.toISOString(), FETCHED.toISOString());
});

test("G3 a Google-ended version leg is stamped; its day gets no maps link and the leg no ride deep link", async () => {
  const acts = [
    { id: id("s1"), name: "Kiyomizu-dera", lat: FACT.lat, lng: FACT.lng, scheduledTime: "09:00", dayNumber: 1, order: 0, googleFetchedAt: FETCHED },
    { id: id("s2"), name: "Gion", lat: 35.0037, lng: 135.7788, scheduledTime: "11:00", dayNumber: 1, order: 1 },
    { id: id("s3"), name: "Kinkaku-ji", lat: 35.0394, lng: 135.7292, scheduledTime: "09:00", dayNumber: 2, order: 0 },
    { id: id("s4"), name: "Ryoan-ji", lat: 35.0345, lng: 135.7185, scheduledTime: "11:00", dayNumber: 2, order: 1 },
  ];
  await calculateTransportLegs(V, acts, "Kyoto", {}, routingCtx());
  const legs = (await db.execute(sql`SELECT id, day_number, coord_source, coord_fetched_at FROM transport_legs WHERE variant_id = ${V} ORDER BY day_number`)).rows as any[];
  assert.equal(legs.length, 2);
  const d1 = legs.find((l) => l.day_number === 1);
  const d2 = legs.find((l) => l.day_number === 2);
  assert.equal(d1.coord_source, "google");
  assert.equal(new Date(d1.coord_fetched_at).toISOString(), FETCHED.toISOString());
  assert.equal(d2.coord_source, null, "a leg between saved points carries no Google stamp");
  const cache = (await db.execute(sql`SELECT google_maps_urls, apple_maps_urls, apple_maps_web_urls FROM maps_export_cache WHERE variant_id = ${V}`)).rows[0] as any;
  for (const col of ["google_maps_urls", "apple_maps_urls", "apple_maps_web_urls"]) {
    assert.equal(cache[col]["1"], undefined, `${col}: the Google day has no link`);
    assert.ok(cache[col]["2"], `${col}: the other day keeps its link`);
  }
  assert.doesNotMatch(JSON.stringify(cache), new RegExp(String(FACT.lat)), "no stored link carries the Google point");
  const deep1 = (await db.execute(sql`SELECT count(*)::int AS n FROM transport_booking_options WHERE transport_leg_id = ${d1.id} AND booking_type = 'deep_link'`)).rows[0] as any;
  assert.equal(deep1.n, 0, "no ride deep link for a Google-ended leg");
  const deep2 = (await db.execute(sql`SELECT count(*)::int AS n FROM transport_booking_options WHERE transport_leg_id = ${d2.id} AND booking_type = 'deep_link'`)).rows[0] as any;
  assert.ok(deep2.n > 0, "the leg between saved points keeps its ride deep links (the skip is not vacuous)");
  const anyDeep = (await db.execute(sql`SELECT deep_link_scheme FROM transport_booking_options WHERE transport_leg_id IN (SELECT id FROM transport_legs WHERE variant_id = ${V})`)).rows as any[];
  assert.ok(anyDeep.every((r) => !String(r.deep_link_scheme ?? "").includes(String(FACT.lat))), "no deep link anywhere carries the Google point");
});

test("G4 the mode-change rebuild skips a day with a Google-sourced leg", async () => {
  const urls = await regenerateMapsUrlsFromLegs(V, 1);
  assert.equal(urls.googleMapsUrls[1], undefined);
  assert.ok(urls.googleMapsUrls[2]);
});

test("G5 the daily job clears an expired Google version leg only, and rebuilds the version's maps", async () => {
  // Make the Google leg expired; the other leg is not Google and must stay.
  await db.execute(sql`UPDATE transport_legs SET coord_fetched_at = now() - interval '400 days' WHERE variant_id = ${V} AND coord_source = 'google'`);
  const rebuilt: string[] = [];
  const result = await runLegGoogleCoordsRefresh(new Date(), {
    ...defaultLegGoogleCoordsDeps,
    candidates: async () => [],
    clearExpiredVersionLegs: async (before) => (await defaultLegGoogleCoordsDeps.clearExpiredVersionLegs(before)).filter((x) => x.variantId === V),
    rebuildVersionMaps: async (variantId, day) => {
      rebuilt.push(variantId);
      await defaultLegGoogleCoordsDeps.rebuildVersionMaps(variantId, day);
    },
  });
  assert.equal(result.versionLegsCleared, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(rebuilt, [V]);
  const left = (await db.execute(sql`SELECT day_number, coord_source FROM transport_legs WHERE variant_id = ${V}`)).rows as any[];
  assert.deepEqual(left.map((l) => [l.day_number, l.coord_source]), [[2, null]], "only the expired Google leg is gone; nothing re-routed");
  const again = await runLegGoogleCoordsRefresh(new Date(), { ...defaultLegGoogleCoordsDeps, candidates: async () => [],
    clearExpiredVersionLegs: async (b) => (await defaultLegGoogleCoordsDeps.clearExpiredVersionLegs(b)).filter((x) => x.variantId === V) });
  assert.equal(again.versionLegsCleared, undefined, "idempotent: nothing left to clear");
});
