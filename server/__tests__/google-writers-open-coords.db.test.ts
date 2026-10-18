/**
 * The Google-derived writers (decision-maker, Oct 18, 2026 — ledger `2026-10-18-google-writers-open-coords`):
 * a Ready Made copy carries routed numbers only from open coordinates, and the intelligence travel total sums a
 * stored minute only when it was routed between open coordinates. The stay pick's half is `stay-pick.db.test.ts`
 * SD8/SD12/SD13; where-to-stay's is `google-legs-rebuild.db.test.ts` GR7.
 *
 *   OW1 `legFromOpenCoordinates`: a non-Google routed leg whose two stored ends are the items' open points — yes;
 *       a Google source, a moved end, an end with no open point — no; an airport end is open by construction
 *   OW2 a leg that is not: carried as the labelled estimate (source `straight_line_est`, the configured speed for
 *       its mode, no alternatives, no routed departure), the author's pick, tip and pickup kept; no ends ⇒ not carried
 *   OW3 an item's `travelFromPrevious` rides with the copy only when it was routed between open coordinates
 *   OW4 `openPointsForItems`: an OSM row for the item's place id ⇒ `osm`; an admin row wins; none ⇒ absent
 *   OW5 the day's travel total: open + non-Google ⇒ the stored minutes; anything else ⇒ the straight-line estimate,
 *       and the day says so (`travelTimeEstimated`)
 *   OW6 the clone wires both decisions at the one fulfilment site
 *
 * NEGATIVE SPACE (§18d): the full `fulfillReadyMadePurchase` run is `ready-made-clone-legs.db.test.ts` (L1–C1);
 * here the builders and the call-site wiring are proven, not a purchase.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/google-writers-open-coords.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_google_writers";
const { db } = await import("../db");
const { buildClonedLeg, legFromOpenCoordinates } = await import("../services/ready-made-clone-legs");
const { buildClonedItineraryItem, previousItemIds, travelFromOpenCoordinates } = await import("../services/itinerary-item-clone");
const { openPointsForItems } = await import("../services/routing/plan-legs-engine.service");
const { itineraryIntelligenceService } = await import("../services/itinerary-intelligence.service");
const { STRAIGHT_LINE_EST_SOURCE } = await import("@shared/routing-engine");
const { straightLineMinutes } = await import("@shared/travel-speeds");
const { haversineMeters } = await import("@shared/geo");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `gw-${RUN}-${s}`;
const owner = id("owner");
const TRIP = id("trip");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[google-writers-open-coords] REFUSING to write fixtures to '${host}'.`);
}

const A = { lat: 35.0, lng: 135.77 };
const B = { lat: 35.01, lng: 135.78 };
const C = { lat: 35.02, lng: 135.79 };

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'GW', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status)
    VALUES (${TRIP}, ${owner}, 'GW', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-12', 'draft')`);
  // a and b are open (OSM, then admin over OSM); c has a Google place id and no open row.
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin, google_place_id, travel_from_previous) VALUES
    (${id("a")}, ${TRIP}, 'A', 'activity', 1, 0, ${A.lat}, ${A.lng}, 'traveler', ${id("pa")}, NULL),
    (${id("b")}, ${TRIP}, 'B', 'activity', 1, 1, ${B.lat}, ${B.lng}, 'traveler', ${id("pb")}, ${JSON.stringify({ mode: "walking", durationMinutes: 42, provider: "osrm" })}::jsonb),
    (${id("c")}, ${TRIP}, 'C', 'activity', 1, 2, ${C.lat}, ${C.lng}, 'traveler', ${id("pc")}, ${JSON.stringify({ mode: "driving", durationMinutes: 99, provider: "osrm" })}::jsonb)`);
  await db.execute(sql`INSERT INTO osm_place_coords (place_id, lat, lng, osm_type, osm_id, osm_name, matched_by, attribution) VALUES
    (${id("pa")}, ${A.lat}, ${A.lng}, 'node', 1, 'A', 'nominatim_batch', '© OpenStreetMap contributors'),
    (${id("pb")}, 35.5, 135.5, 'node', 2, 'B', 'nominatim_batch', '© OpenStreetMap contributors')`);
  await db.execute(sql`INSERT INTO admin_place_coords (place_id, lat, lng, source_url, entered_by) VALUES (${id("pb")}, ${B.lat}, ${B.lng}, 'https://example.org/b', ${owner})`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM osm_place_coords WHERE place_id LIKE ${`gw-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM admin_place_coords WHERE place_id LIKE ${`gw-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

const open = new Map([
  ["a", { ...A, coordOrigin: "osm" as const }],
  ["b", { ...B, coordOrigin: "admin" as const }],
]);
const leg = (over: Record<string, unknown> = {}): any => ({
  tripId: "t", variantId: null, proposalStatus: "confirmed", dayNumber: 1, legOrder: 1,
  fromActivityId: "a", fromName: "A", fromLat: String(A.lat), fromLng: String(A.lng),
  toActivityId: "b", toName: "B", toLat: String(B.lat), toLng: String(B.lng),
  distanceMeters: 1500, distanceDisplay: "1.5 km", recommendedMode: "walking", userSelectedMode: null,
  estimatedDurationMinutes: 19, alternativeModes: [{ mode: "driving", durationMinutes: 7 }],
  authorTip: "Take the river path", pickupPoint: "Gate 2", source: "osrm", routedDepartureLocal: "10:00",
  ...over,
});

test("OW1: only a non-Google routed leg between the items' open points carries its routed numbers", () => {
  assert.equal(legFromOpenCoordinates(leg(), open), true);
  assert.equal(legFromOpenCoordinates(leg({ source: "google_routes" }), open), false, "a Google source");
  assert.equal(legFromOpenCoordinates(leg({ source: null }), open), false, "an unsourced (legacy) leg");
  assert.equal(legFromOpenCoordinates(leg({ toLat: String(B.lat + 0.001) }), open), false, "an end stored at another point");
  assert.equal(legFromOpenCoordinates(leg({ toActivityId: "c" }), open), false, "an end with no open point");
  assert.equal(legFromOpenCoordinates(leg({ toActivityId: "anchor:x" }), open), true, "an airport end is IATA-stamped");
});

test("OW2: anything else is carried as the labelled estimate, the author's pick kept", () => {
  const map = new Map([["a", "A2"], ["b", "B2"]]);
  const out = buildClonedLeg(leg({ source: "google_routes" }), "copy", map, false)!;
  const meters = Math.round(haversineMeters(A.lat, A.lng, B.lat, B.lng));
  assert.equal(out.source, STRAIGHT_LINE_EST_SOURCE);
  assert.equal(out.estimatedDurationMinutes, straightLineMinutes(meters, "walk"), "the configured speed for the leg's own mode");
  assert.equal(out.distanceMeters, meters);
  assert.deepEqual(out.alternativeModes, [], "no carried alternative (it may hold Google minutes)");
  assert.equal(out.routedDepartureLocal, null);
  assert.deepEqual([out.authorTip, out.pickupPoint, out.recommendedMode, out.proposalStatus], ["Take the river path", "Gate 2", "walking", "confirmed"]);
  assert.equal(buildClonedLeg(leg({ fromLat: null }), "copy", map, false), null, "no stored ends ⇒ nothing to estimate from");
  const routed = buildClonedLeg(leg(), "copy", map, true)!;
  assert.deepEqual([routed.source, routed.estimatedDurationMinutes, routed.routedDepartureLocal], ["osrm", 19, "10:00"]);
});

test("OW3: an item's travel minutes ride with the copy only when routed between open coordinates", () => {
  const items: any[] = [
    { id: "a", dayNumber: 1, sortOrder: 0, travelFromPrevious: null },
    { id: "b", dayNumber: 1, sortOrder: 1, travelFromPrevious: { durationMinutes: 42, provider: "osrm" } },
    { id: "c", dayNumber: 1, sortOrder: 2, travelFromPrevious: { durationMinutes: 99, provider: "osrm" } },
    { id: "d", dayNumber: 2, sortOrder: 0, travelFromPrevious: { durationMinutes: 5, provider: "osrm" } },
  ];
  const prev = previousItemIds(items);
  assert.deepEqual([prev.get("a"), prev.get("b"), prev.get("c"), prev.get("d")], [null, "a", "b", null]);
  const openIds = new Set(["a", "b"]);
  assert.equal(travelFromOpenCoordinates(items[1], "a", openIds), true);
  assert.equal(travelFromOpenCoordinates(items[2], "b", openIds), false, "c has no open point");
  assert.equal(travelFromOpenCoordinates({ ...items[1], travelFromPrevious: { durationMinutes: 42, provider: "travel_time_matrix" } }, "a", openIds), false, "a Google-era provider");
  assert.equal(travelFromOpenCoordinates(items[3], null, openIds), false, "a day's first stop");
  const row: any = { title: "B", dayNumber: 1, travelFromPrevious: items[1].travelFromPrevious, origin: "expert" };
  assert.equal(buildClonedItineraryItem(row, "copy").travelFromPrevious, null, "the default carries none");
  assert.deepEqual(buildClonedItineraryItem(row, "copy", { travelOpen: true }).travelFromPrevious, items[1].travelFromPrevious);
});

test("OW4: each item's open point — OSM, an admin row over it, or nothing", async () => {
  const items: any = ((await db.execute(sql`SELECT id, google_place_id AS "googlePlaceId", provider_service_id AS "providerServiceId", latitude, longitude, origin, location_name AS "locationName", location_address AS "locationAddress" FROM itinerary_items WHERE trip_id = ${TRIP}`)) as any).rows;
  const pts = await openPointsForItems(TRIP, items);
  assert.deepEqual(pts.get(id("a")) && [pts.get(id("a"))!.coordOrigin, pts.get(id("a"))!.lat], ["osm", A.lat]);
  assert.deepEqual(pts.get(id("b")) && [pts.get(id("b"))!.coordOrigin, pts.get(id("b"))!.lat], ["admin", B.lat], "admin wins over OSM");
  assert.equal(pts.has(id("c")), false, "a Google point is not an open point");
});

test("OW5: the day's travel total sums open minutes as stored and estimates the rest, and says so", async () => {
  const [day] = await itineraryIntelligenceService.getDaySchedules(TRIP);
  const est = straightLineMinutes(haversineMeters(B.lat, B.lng, C.lat, C.lng), "drive");
  assert.equal(day.travelTimeMinutes, 42 + est, "b's 42 stored minutes (open → open, osrm), c's 99 replaced by the estimate");
  assert.equal(day.travelTimeEstimated, true);
  await db.execute(sql`UPDATE itinerary_items SET travel_from_previous = NULL WHERE id = ${id("c")}`);
  const [again] = await itineraryIntelligenceService.getDaySchedules(TRIP);
  assert.deepEqual([again.travelTimeMinutes, again.travelTimeEstimated], [42, false]);
});

test("OW6: the one fulfilment site wires both decisions", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server/services/ready-made-purchase.service.ts"), "utf8");
  assert.match(src, /buildClonedLeg\(leg, cloneTrip\.id, itemIdMap, legFromOpenCoordinates\(leg, openPoints\)\)/);
  assert.match(src, /buildClonedItineraryItem\(item, cloneTrip\.id, \{ travelOpen \}\)/);
  assert.match(src, /openPointsForItems\(listing\.sourceTripId, sourceItems\)/);
});
