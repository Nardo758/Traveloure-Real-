/**
 * V-1 (ledger `2026-10-11-v1-version-sanity`) against a real database.
 *
 *   L1 versionSanityFlags: untimed stops; two dinners on a day (lunch never a dinner, an unlabelled
 *      20:00 restaurant is one); a start after the latest-start threshold — flags only, nothing changed
 *   L2 the thresholds are config: defaults 17:00 / 22:00, env-overridable, a bad value keeps the default
 *   L3 the optimizer baseline locates like the slip: a trusted row point; an AI area row's centroid is
 *      NOT used and its Google fact rides in memory only (`placesPoint`); no fact ⇒ unlocated
 *   L4 the coordinate resolver matches a kept stop by sourceItemId (a renamed stop keeps its point);
 *      a Google-only stop is never copied and spends no geocode
 *   L5 the board reads: the plan column and a version stop are located at read time from the fact
 *      (never the centroid), the anchor carries its stored type, the flags arrive — and no Google
 *      point was written to any row
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { versionSanityFlags, sanityMetricRows } from "../services/version-sanity";
import { optimizerDinnerFromMinutes, optimizerLatestStopStartMinutes } from "../config/optimizer-sanity.config";
import { loadTripOptimizerInputs } from "../services/optimizer-baseline.service";
import { createOptimizerGeocodeBudget, resolveOptimizerActivityCoordinates } from "../services/optimizer-activity-geocoder.service";
import { loadVersionsBoard } from "../services/version-board.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `v1-${RUN}-${s}`;
const OWNER = id("owner");
const T = id("plan");
const CMP = id("cmp");
const VA = id("vA");
const FACT = { lat: 34.9949, lng: 135.785 };
const CENTROID = { lat: 34.99, lng: 135.78 };

const TH = { dinnerFromMinutes: 17 * 60, latestStartMinutes: 22 * 60 };

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, event_type)
    VALUES (${T}, ${OWNER}, 'V-1', 'Kyoto, Japan', '2027-11-11', '2027-11-12', 'draft', 'vacation')`);
  // A traveler-added stop with its own point (trusted).
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, item_type, origin, start_time, routing_status, latitude, longitude)
    VALUES (${id("own")}, ${T}, 1, 0, 'Nishiki Market', 'activity', 'traveler', '10:00', 'in_planning', '35.005', '135.765')`);
  // An AI stop whose location is only an area — its row holds a ward centroid — with a Google fact.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, item_type, origin, start_time, routing_status, location_name, latitude, longitude)
    VALUES (${id("area")}, ${T}, 1, 1, 'Kiyomizu-dera', 'activity', 'ai', '13:00', 'in_planning', 'Higashiyama Ward, Kyoto', ${String(CENTROID.lat)}, ${String(CENTROID.lng)})`);
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (${id("fact")}, 'place_id', 'ChIJ-v1', 'activity', 'location', ${JSON.stringify(FACT)}::jsonb,
      'places_api', now(), now() + interval '20 days', ${T}, ${id("area")})`);
  // An AI area stop with no fact at all.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, sort_order, title, item_type, origin, start_time, routing_status, location_name, latitude, longitude)
    VALUES (${id("bare")}, ${T}, 2, 0, 'Gion stroll', 'activity', 'ai', '18:00', 'in_planning', 'Gion', ${String(CENTROID.lat)}, ${String(CENTROID.lng)})`);

  await db.execute(sql`INSERT INTO itinerary_comparisons (id, user_id, trip_id, title, destination, status)
    VALUES (${CMP}, ${OWNER}, ${T}, 'V-1', 'Kyoto, Japan', 'generated')`);
  await db.execute(sql`INSERT INTO itinerary_variants (id, comparison_id, name, source, status, sort_order, run_id, anchor_type, anchor_name, anchor_lat, anchor_lng)
    VALUES (${VA}, ${CMP}, 'Relaxed', 'ai_optimized', 'generated', 1, ${id("run")}, 'activity', 'Kiyomizu-dera', '34.9949', '135.785')`);
  // Version A: the area stop saved with a copy of the centroid; the same stop renamed with NULLs; a new stop.
  await db.execute(sql`INSERT INTO itinerary_variant_items (id, variant_id, day_number, sort_order, name, service_type, start_time, source_item_id, latitude, longitude)
    VALUES (${id("vi1")}, ${VA}, 1, 0, 'Kiyomizu-dera', 'activity', '09:00', ${id("area")}, ${String(CENTROID.lat)}, ${String(CENTROID.lng)}),
           (${id("vi2")}, ${VA}, 1, 1, 'Nishiki (renamed)', 'activity', '11:00', ${id("own")}, '35.005', '135.765'),
           (${id("vi3")}, ${VA}, 2, 0, 'Kiyomizu at dusk', 'activity', NULL, ${id("area")}, NULL, NULL)`);
  await db.insert((await import("@shared/schema")).itineraryVariantMetrics).values(
    sanityMetricRows(VA, [{ key: "untimed_stops", count: 1, stopNames: ["Kiyomizu at dusk"] }]) as any,
  );
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_variant_metrics WHERE variant_id = ${VA}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variant_items WHERE variant_id = ${VA}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_variants WHERE comparison_id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_comparisons WHERE id = ${CMP}`).catch(() => {});
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${T}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`).catch(() => {});
});

test("L1 sanity flags: untimed, duplicate dinner, late start — flags only", () => {
  const stops = [
    { name: "Temple", serviceType: "activity", dayNumber: 1, startTime: "09:00" },
    { name: "Late lunch", serviceType: "lunch", dayNumber: 1, startTime: "17:30" },
    { name: "Kaiseki", serviceType: "dinner", dayNumber: 1, startTime: "18:00" },
    { name: "Izakaya", serviceType: "restaurant", dayNumber: 1, startTime: "20:00" },
    { name: "Ramen", serviceType: "restaurant", dayNumber: 2, startTime: "19:00" },
    { name: "Bar", serviceType: "nightlife", dayNumber: 2, startTime: "22:00" },
    { name: "Club", serviceType: "nightlife", dayNumber: 2, startTime: "22:30" },
    { name: "Somewhere", serviceType: "activity", dayNumber: 2, startTime: null },
  ];
  const before = JSON.stringify(stops);
  const flags = versionSanityFlags(stops, TH);
  assert.deepEqual(flags, [
    { key: "untimed_stops", count: 1, stopNames: ["Somewhere"] },
    { key: "duplicate_dinner", count: 2, stopNames: ["Kaiseki", "Izakaya"] },
    { key: "late_start", count: 1, stopNames: ["Club"] },
  ]);
  assert.equal(JSON.stringify(stops), before, "nothing is moved, dropped or re-timed");
  assert.deepEqual(versionSanityFlags([{ name: "Dinner", serviceType: "dinner", dayNumber: 1, startTime: "16:59" }, { name: "Supper", serviceType: "meal", dayNumber: 1, startTime: "17:00" }], TH), []);
  const rows = sanityMetricRows("v", flags);
  assert.deepEqual(rows.map((r) => [r.metricKey, r.value, r.description]), [
    ["untimed_stops", "1", "Somewhere"],
    ["duplicate_dinner", "2", "Kaiseki, Izakaya"],
    ["late_start", "1", "Club"],
  ]);
});

test("L2 thresholds are config", () => {
  const saved = { d: process.env.OPTIMIZER_DINNER_FROM, l: process.env.OPTIMIZER_LATEST_STOP_START };
  try {
    delete process.env.OPTIMIZER_DINNER_FROM;
    delete process.env.OPTIMIZER_LATEST_STOP_START;
    assert.equal(optimizerDinnerFromMinutes(), 17 * 60);
    assert.equal(optimizerLatestStopStartMinutes(), 22 * 60);
    process.env.OPTIMIZER_DINNER_FROM = "18:30";
    process.env.OPTIMIZER_LATEST_STOP_START = "garbage";
    assert.equal(optimizerDinnerFromMinutes(), 18 * 60 + 30);
    assert.equal(optimizerLatestStopStartMinutes(), 22 * 60, "a bad value keeps the default");
  } finally {
    if (saved.d === undefined) delete process.env.OPTIMIZER_DINNER_FROM; else process.env.OPTIMIZER_DINNER_FROM = saved.d;
    if (saved.l === undefined) delete process.env.OPTIMIZER_LATEST_STOP_START; else process.env.OPTIMIZER_LATEST_STOP_START = saved.l;
  }
});

test("L3 the baseline locates like the slip; the Google point stays in memory", async () => {
  const { baselineItems } = await loadTripOptimizerInputs(T);
  const by = new Map(baselineItems.map((b) => [b.id, b]));
  const own = by.get(id("own"))!;
  assert.deepEqual([own.latitude, own.longitude, own.placesPoint], [35.005, 135.765, undefined]);
  const area = by.get(id("area"))!;
  assert.equal(area.latitude, undefined, "the ward centroid is never the stop's point");
  assert.equal(area.longitude, undefined);
  assert.deepEqual(area.placesPoint, FACT);
  const bare = by.get(id("bare"))!;
  assert.deepEqual([bare.latitude, bare.placesPoint], [undefined, undefined], "no fact ⇒ unlocated, never guessed");
});

test("L4 the resolver: a kept stop by sourceItemId; a Google-only stop is never copied and spends no geocode", async () => {
  const baseline = [
    { name: "Nishiki Market", planItemId: "p-own", latitude: 35.005, longitude: 135.765 },
    { name: "Kiyomizu-dera", planItemId: "p-area", providerServiceId: "svc-1", placesPoint: FACT },
  ];
  const acts: any[] = [
    { name: "Nishiki, renamed", sourceItemId: "p-own" },
    { name: "Kiyomizu at dusk", sourceItemId: "p-area", providerServiceId: "svc-1" },
  ];
  let geocodes = 0;
  await resolveOptimizerActivityCoordinates(acts, baseline, new Map(), "Kyoto, Japan", createOptimizerGeocodeBudget(5), {
    cache: { get: async () => null, put: async () => {} },
    geocode: async () => { geocodes++; return { lat: 1, lng: 1, formattedAddress: "x", locationType: "ROOFTOP", types: [] } as any; },
  });
  assert.deepEqual([acts[0].latitude, acts[0].longitude], [35.005, 135.765]);
  assert.deepEqual([acts[1].latitude, acts[1].longitude], [undefined, undefined], "the Google point is never copied (LD 57)");
  assert.equal(geocodes, 0, "no geocode is spent on a stop the place facts locate");
});

test("L5 the board locates at read time, sends the anchor type and the flags, and writes nothing", async () => {
  const view = await loadVersionsBoard(T);
  const plan = new Map(view.plan.stops.map((s) => [s.id, s]));
  assert.deepEqual([plan.get(id("area"))!.lat, plan.get(id("area"))!.lng], [FACT.lat, FACT.lng], "the plan column: fact, never centroid");
  assert.deepEqual([plan.get(id("bare"))!.lat, plan.get(id("bare"))!.lng], [null, null]);
  assert.deepEqual([plan.get(id("own"))!.lat, plan.get(id("own"))!.lng], [35.005, 135.765]);
  const a = view.versions[0];
  const vs = new Map(a.stops.map((s) => [s.id, s]));
  assert.deepEqual([vs.get(id("vi1"))!.lat, vs.get(id("vi1"))!.lng], [FACT.lat, FACT.lng], "a saved centroid copy is relocated");
  assert.deepEqual([vs.get(id("vi2"))!.lat, vs.get(id("vi2"))!.lng], [35.005, 135.765], "a saved durable point stands");
  assert.deepEqual([vs.get(id("vi3"))!.lat, vs.get(id("vi3"))!.lng], [FACT.lat, FACT.lng], "a NULL stop is located through sourceItemId");
  assert.equal(a.anchor?.type, "activity");
  assert.deepEqual(a.flags, [{ key: "untimed_stops", count: 1, stopNames: ["Kiyomizu at dusk"] }]);
  const rows = (await db.execute(sql`SELECT id, latitude FROM itinerary_variant_items WHERE variant_id = ${VA} ORDER BY id`)).rows as any[];
  assert.equal(rows.find((r) => r.id === id("vi3")).latitude, null, "the read wrote no Google point onto the version");
  const item = (await db.execute(sql`SELECT latitude FROM itinerary_items WHERE id = ${id("bare")}`)).rows[0] as any;
  assert.equal(Number(item.latitude), CENTROID.lat, "nor onto a plan item");
});
