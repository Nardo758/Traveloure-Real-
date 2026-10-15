/**
 * CP-1 PR 1 — what a SIGNED-OUT read of a listing carries (ledger `2026-10-15-cp1-public-payloads`).
 *
 *   P1  GET /api/services/:id signed out: no owner id, file, session link or rate; no meeting point,
 *       pickup, drop-off, bring or access text; a ~500 m pin flagged approximate; the route as a
 *       stop count plus the first stop's area — no stop names or coordinates. Start windows and the
 *       weekly pattern stay.
 *   P2  GET /api/services and GET /api/provider-services rows: the same strips, the same coarse pin.
 *   P3  GET /api/experts, /api/experts/:id and /api/experts/:id/services: the embedded listings carry
 *       none of it either (no `userId` — LD 40).
 *   P4  GET /api/storefront/:handle: an approved but INACTIVE ready-made is not listed.
 *   P5  The detail is EXACT for the owner and for a traveler with a confirmed booking; still coarse
 *       for another signed-in member and for a traveler whose booking never got past payment.
 *
 * Run against a disposable dev database only, with the app started (SHOW_DEMO_EXPERTS=1, as CI's
 * db setup sets it, so the `traveloure.test` fixture expert is public):
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/cp1-public-payloads.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const CITY = `Cp1ville${RUN}`;
const HANDLE = `cp1${RUN}`;
const EMAILS = { owner: `cp1-owner-${RUN}@traveloure.test`, booked: `cp1-booked-${RUN}@traveloure.test`, unpaid: `cp1-unpaid-${RUN}@traveloure.test`, other: `cp1-other-${RUN}@traveloure.test` };

const FORBIDDEN = ["userId", "serviceFile", "joinLink", "revenueShareRate", "meetingPoint", "pickupAddress", "dropOffPoint", "accessNotes", "whatToBring", "routePoints"];
const EXACT_LAT = "35.0116340";
const EXACT_LNG = "135.7681490";

const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};
const serviceId = crypto.randomUUID();
const tripId = crypto.randomUUID();
const readyMadeId = crypto.randomUUID();
const neighborhoodId = crypto.randomUUID();
const bookingIds: string[] = [];

async function register(key: keyof typeof EMAILS) {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAILS[key], password: PASSWORD, firstName: "Cp", lastName: "One" }),
  });
  const text = await res.text();
  assert.equal(res.status, 201, text);
  cookies[key] = res.headers.get("set-cookie")!.split(";")[0];
  ids[key] = (JSON.parse(text) as { user: { id: string } }).user.id;
}

async function get(path: string, cookie?: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: cookie ? { cookie } : {} });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

function assertCoarse(row: Record<string, any>, label: string) {
  for (const k of FORBIDDEN) assert.ok(!(k in row), `${label}: '${k}' must not be on a public read`);
  assert.notEqual(String(row.latitude), EXACT_LAT, `${label}: the exact latitude never leaves`);
  assert.notEqual(String(row.longitude), EXACT_LNG, `${label}: the exact longitude never leaves`);
  assert.ok(Math.abs(Number(row.latitude) - Number(EXACT_LAT)) < 0.005, `${label}: the coarse pin stays within its ~500 m cell`);
  assert.equal(row.locationApproximate, true, `${label}: a coarse pin says so`);
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  for (const k of Object.keys(EMAILS) as Array<keyof typeof EMAILS>) await register(k);

  await pool.query(`UPDATE users SET role = 'travel_expert', handle = $1 WHERE id = $2`, [HANDLE, ids.owner]);
  await pool.query(
    `INSERT INTO local_expert_forms (id, user_id, status, city, identity_verification_status, stripe_connect_status)
     VALUES ($1, $2, 'approved', $3, 'verified', 'complete')`,
    [crypto.randomUUID(), ids.owner, CITY],
  );
  await pool.query(
    `INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
     VALUES ($1, $2, 'Japan', 'Higashiyama Test', $3, 35.0100000, 135.7700000)`,
    [neighborhoodId, CITY, `higashiyama-${RUN}`],
  );
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method, city,
       latitude, longitude, meeting_point, pickup_address, drop_off_point, access_notes, what_to_bring,
       service_file, join_link, revenue_share_rate, earliest_start_time, latest_start_time, duration_minutes)
     VALUES ($1, $2, 'CP-1 lane walk', '40.00', 'active', 'approved', 'in_person', $3,
       ${EXACT_LAT}, ${EXACT_LNG}, 'Under the red gate at Yasaka', '12 Gion-machi', 'Kiyomizu car park',
       'Steps at the north gate', 'Comfortable shoes', 'https://files.example.com/x.pdf',
       'https://meet.example.com/x', 0.80, '09:00', '15:00', 120)`,
    [serviceId, ids.owner, CITY],
  );
  await pool.query(
    `INSERT INTO service_route_points (id, service_id, position, name, latitude, longitude) VALUES
       ($1, $4, 1, 'Yasaka Shrine west gate', 35.0036, 135.7785),
       ($2, $4, 2, 'Ninenzaka steps', 35.0000, 135.7810),
       ($3, $4, 3, 'Unlocated tea house', NULL, NULL)`,
    [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), serviceId],
  );
  await pool.query(
    `INSERT INTO service_availability_patterns (id, service_id, day_of_week, start_time, end_time) VALUES ($1, $2, 2, '09:00', '11:00')`,
    [crypto.randomUUID(), serviceId],
  ).catch(() => undefined);

  // P4: an approved but switched-off ready-made by the same author.
  await pool.query(
    `INSERT INTO trips (id, user_id, title, start_date, end_date, destination, status)
     VALUES ($1, $2, 'CP-1 source', '2026-12-01', '2026-12-02', $3, 'planning')`,
    [tripId, ids.owner, CITY],
  );
  await pool.query(
    `INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, status, active)
     VALUES ($1, $2, $3, 'Kyoto', 'CP-1 switched-off plan', 2, 'approved', false)`,
    [readyMadeId, ids.owner, tripId],
  );

  for (const [key, status] of [["booked", "confirmed"], ["unpaid", "payment_pending"]] as const) {
    const id = crypto.randomUUID();
    bookingIds.push(id);
    await pool.query(
      `INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount) VALUES ($1, $2, $3, $4, $5, 40.00)`,
      [id, serviceId, ids[key], ids.owner, status],
    );
  }
});

after(async () => {
  try {
    await pool.query(`DELETE FROM service_bookings WHERE id = ANY($1)`, [bookingIds]);
    await pool.query(`DELETE FROM ready_made_trips WHERE id = $1`, [readyMadeId]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [tripId]);
    await pool.query(`DELETE FROM service_availability_patterns WHERE service_id = $1`, [serviceId]).catch(() => undefined);
    await pool.query(`DELETE FROM service_route_points WHERE service_id = $1`, [serviceId]);
    await pool.query(`DELETE FROM provider_services WHERE id = $1`, [serviceId]);
    await pool.query(`DELETE FROM city_neighborhoods WHERE id = $1`, [neighborhoodId]);
    await pool.query(`DELETE FROM local_expert_forms WHERE user_id = $1`, [ids.owner]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [Object.values(EMAILS)]);
  } finally {
    await pool.end();
  }
});

test("P1: the signed-out detail is coarse and the route is a count plus an area", async () => {
  const r = await get(`/api/services/${serviceId}`);
  assert.equal(r.status, 200, r.text);
  assertCoarse(r.json, "GET /api/services/:id");
  assert.equal(r.json.routeStopCount, 3);
  assert.equal(r.json.routeFirstArea, "Higashiyama Test", "the first located stop's neighbourhood, never its name");
  for (const name of ["Yasaka Shrine west gate", "Ninenzaka steps", "Unlocated tea house"]) {
    assert.ok(!r.text.includes(name), `stop name '${name}' must not appear anywhere in the payload`);
  }
  assert.equal(r.json.earliestStartTime, "09:00", "start windows stay public");
  assert.equal(r.json.latestStartTime, "15:00");
});

test("P2: the public browse rows carry the same projection", async () => {
  const services = await get(`/api/services?location=${encodeURIComponent(CITY)}`);
  assert.equal(services.status, 200, services.text);
  const row = (services.json as any[]).find((s) => s.id === serviceId);
  if (row) assertCoarse(row, "GET /api/services");
  const browse = await get(`/api/provider-services`);
  assert.equal(browse.status, 200, browse.text);
  const row2 = (browse.json as any[]).find((s) => s.id === serviceId);
  assert.ok(row2, "the listing is on the public browse");
  assertCoarse(row2, "GET /api/provider-services");
  assert.ok(row || row2, "at least one browse surfaces the fixture");
});

test("P3: listings embedded on the expert reads carry none of it", async () => {
  const one = await get(`/api/experts/${ids.owner}`);
  assert.equal(one.status, 200, one.text);
  const embedded = (one.json.selectedServices as any[]).find((s) => s.id === serviceId);
  assert.ok(embedded, "the expert's listing is embedded");
  assertCoarse(embedded, "GET /api/experts/:id selectedServices");

  const services = await get(`/api/experts/${ids.owner}/services`);
  assert.equal(services.status, 200, services.text);
  const row = (services.json as any[]).find((s) => s.id === serviceId);
  assert.ok(row);
  assertCoarse(row, "GET /api/experts/:id/services");

  const list = await get(`/api/experts`);
  assert.equal(list.status, 200, list.text);
  const listed = (Array.isArray(list.json) ? list.json : list.json?.experts ?? []).find((e: any) => e.id === ids.owner);
  if (listed) {
    const inList = (listed.selectedServices as any[]).find((s) => s.id === serviceId);
    assert.ok(inList);
    assertCoarse(inList, "GET /api/experts selectedServices");
  }
});

test("P4: the storefront lists no switched-off ready-made", async () => {
  const r = await get(`/api/storefront/${HANDLE}`);
  assert.equal(r.status, 200, r.text);
  assert.ok(!r.text.includes(readyMadeId), "an approved but inactive ready-made is not listed");
});

test("P5: exact for the owner and a booked traveler; coarse for everyone else", async () => {
  for (const key of ["owner", "booked"] as const) {
    const r = await get(`/api/services/${serviceId}`, cookies[key]);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.meetingPoint, "Under the red gate at Yasaka", `${key} reads the meeting point`);
    assert.equal(r.json.pickupAddress, "12 Gion-machi");
    assert.equal(Number(r.json.latitude), Number(EXACT_LAT), `${key} reads the exact pin`);
    assert.equal(r.json.routePoints.length, 3, `${key} reads the route stops`);
    for (const k of ["userId", "serviceFile", "joinLink", "revenueShareRate"]) assert.ok(!(k in r.json), `${key}: '${k}' is never on this read`);
  }
  for (const key of ["other", "unpaid"] as const) {
    const r = await get(`/api/services/${serviceId}`, cookies[key]);
    assert.equal(r.status, 200, r.text);
    assertCoarse(r.json, `GET /api/services/:id as ${key}`);
  }
});
