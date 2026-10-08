/**
 * Step 9b FU-9A-2 — airport coordinates from the IATA table, and the routed airport leg (ledger
 * `2026-10-07-step9b-optimizer-and-rechecks`; architect: "stamp anchor coordinates only when the location
 * is a real IATA code from iata-airports.json; a typed airport name stays without coordinates and keeps
 * the fixed buffer. Never guess.").
 *
 *   A1 the code rule: exactly three upper-case letters the table holds; anything else has no point
 *   A2 the storage writer stamps a flight anchor's point from its code, replacing a client-sent one; a
 *      typed name gets NULLs; changing the location to a name clears it; a non-flight anchor is untouched
 *   A3 a routed plan with a coded arrival gets ONE engine leg airport → first stop (no stay); a typed
 *      departure gets none; the anchor write itself queues the recompute
 *   A4 a free plan gets no airport leg
 *   A5 the buffer: stored (or the international default) + the routed leg's minutes; no leg ⇒ unchanged
 *
 * NEGATIVE SPACE (§18d): the adapter is the CI stub. The anchors GET's `routedLeg` and the slip's airport
 * row are read by `AnchorRow.flightAnchorFor` (client test) — not driven through HTTP here.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/airport-legs.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_airport_legs";
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
const { db } = await import("../db");
const { storage } = await import("../storage");
const { airportPointForCode, flightAnchorPoint } = await import("../services/airport-coords");
const { flightBufferWithLeg, FLIGHT_BUFFER_MIN } = await import("@shared/getting-there");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `apl-${RUN}-${s}`;
const owner = id("owner");
const PAID = id("paid");
const FREE = id("free");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[airport-legs] REFUSING to write fixtures to '${host}'.`);
}

const legs = async (trip: string) => ((await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${trip} ORDER BY day_number, leg_order`)) as any).rows as any[];
const anchor = async (anchorId: string) => ((await db.execute(sql`SELECT * FROM temporal_anchors WHERE id = ${anchorId}`)) as any).rows[0];
const settle = () => new Promise((r) => setTimeout(r, 3_000));

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${owner}, ${`${owner}@t.test`}, 'APL', 'traveler', 'traveler')`);
  for (const t of [PAID, FREE]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
      VALUES (${t}, ${owner}, 'APL', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2026-11-11', '2026-11-12', 'draft', now())`);
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time, origin) VALUES
      (${`${t}-a`}, ${t}, 'Kyoto Station', 'activity', 1, 0, 34.9858, 135.7588, '16:00', '17:00', 'traveler'),
      (${`${t}-b`}, ${t}, 'Gion', 'activity', 2, 0, 35.0037, 135.7751, '10:00', '11:00', 'traveler')`);
  }
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${PAID}-pass`}, ${PAID}, 'trip_pass', 'active', 'manual')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id IN (${PAID}, ${FREE})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);
});

test("A1: only an exact IATA code the table holds has a point", () => {
  const kix = airportPointForCode("KIX")!;
  assert.ok(Math.abs(kix.lat - 34.43) < 0.05 && Math.abs(kix.lng - 135.24) < 0.05);
  for (const t of ["kix", "Kansai airport", "KIX T1", "ZZQ", "", null]) assert.equal(airportPointForCode(t as any), null, String(t));
  assert.equal(flightAnchorPoint("custom", "KIX"), undefined, "not a flight anchor");
  assert.deepEqual(flightAnchorPoint("flight_departure", "Kansai airport"), { latitude: null, longitude: null });
});

test("A2: the writer stamps from the code, never from the client; a typed name clears it", async () => {
  const a = await storage.createTemporalAnchor({ tripId: FREE, anchorType: "flight_arrival", anchorDatetime: new Date("2026-11-11T14:00:00Z"), location: "KIX", latitude: "1", longitude: "1" } as any);
  const row = await anchor(a.id);
  assert.ok(Math.abs(Number(row.latitude) - 34.43) < 0.05, "the code's point replaced the client's");
  await storage.updateTemporalAnchor(a.id, { location: "Kansai airport" } as any);
  const cleared = await anchor(a.id);
  assert.equal(cleared.latitude, null);
  assert.equal(cleared.longitude, null);
  const other = await storage.createTemporalAnchor({ tripId: FREE, anchorType: "custom", anchorDatetime: new Date("2026-11-11T09:00:00Z"), location: "KIX", latitude: "35", longitude: "135" } as any);
  assert.equal(Number((await anchor(other.id)).latitude), 35, "a non-flight anchor keeps its own point");
});

test("A3: a routed plan's coded arrival gets one airport leg; a typed departure gets none", async () => {
  const arr = await storage.createTemporalAnchor({ tripId: PAID, anchorType: "flight_arrival", anchorDatetime: new Date("2026-11-11T13:00:00Z"), bufferAfter: 60, location: "KIX" } as any);
  await storage.createTemporalAnchor({ tripId: PAID, anchorType: "flight_departure", anchorDatetime: new Date("2026-11-12T18:00:00Z"), bufferBefore: 90, location: "Kansai airport" } as any);
  await settle(); // the anchor write queued the recompute
  const rows = await legs(PAID);
  const airport = rows.filter((l) => String(l.from_activity_id).startsWith("anchor:") || String(l.to_activity_id).startsWith("anchor:"));
  assert.equal(airport.length, 1);
  assert.equal(airport[0].from_activity_id, `anchor:${arr.id}`);
  assert.equal(airport[0].to_activity_id, `${PAID}-a`);
  assert.equal(airport[0].day_number, 1);
  assert.equal(airport[0].source, "stub");
  assert.ok(Number(airport[0].estimated_duration_minutes) > 0);
});

test("A4: a free plan gets no airport leg", async () => {
  await settle();
  assert.equal((await legs(FREE)).length, 0);
});

test("A5: the buffer adds the routed leg's minutes; without one it is unchanged", () => {
  assert.equal(flightBufferWithLeg("arrival", 60, 75), 135);
  assert.equal(flightBufferWithLeg("arrival", null, 75), FLIGHT_BUFFER_MIN.arrivalAfter.international + 75);
  assert.equal(flightBufferWithLeg("departure", 90, null), 90);
  assert.equal(flightBufferWithLeg("departure", null, null), null, "the fixed-buffer default stays the reader's");
});
