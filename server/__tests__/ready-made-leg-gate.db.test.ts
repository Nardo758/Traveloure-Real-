/**
 * L1-2 — the ready-made leg gate, R-ax (work plan docs/planning/expert-console-ready-made-work-plan.md).
 *
 *   G1  submit with an unpicked leg (proposed, or confirmed with no mode) ⇒ 400 with one `legs` line
 *       per gap, naming day, stops and the leg; the listing stays `draft`
 *   G2  submit with a located pair and NO leg row at all ⇒ 400 `legs` line without a legId
 *   G3  admin approve refuses the same listing with the same lines (it calls the same gate)
 *   G4  a fully picked build passes submit; an unlocated stop does not block (advisory only)
 *   T1  the public teaser's per-day km counts confirmed legs only
 *   U1  `readyMadeLegLines` / `consecutiveStopPairs` pure cases
 *   E1  the engine, now iterating `consecutiveStopPairs`, still keeps a confirmed leg, skips an
 *       unlocated pair as `missing_coordinates`, and proposes exactly the gaps the gate names
 *
 * NEGATIVE SPACE (§18d): R-ax also accepts a host pickup in place of a mode; that column is migration
 * 346 (L1-1) and is not on this branch, so no proof covers it. Advisory lines are asserted only at
 * the pure layer — no route returns them until the readiness read (L1-9).
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/ready-made-leg-gate.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { consecutiveStopPairs, generateTripTransportLegs, readyMadeLegLines } from "../services/trip-transport-legs.service";

// admin.routes builds a Stripe client at import; a test key, never a real one.
process.env.STRIPE_SECRET_KEY ||= "sk_test_ready_made_leg_gate";
const readyMadeRoutes = (await import("../routes/ready-made.routes")).default;
const adminRoutes = (await import("../routes/admin.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  author: `l12-${RUN}-author`,
  admin: `l12-${RUN}-admin`,
  trip: `l12-${RUN}-trip`,
  listing: `l12-${RUN}-listing`,
  a: `l12-${RUN}-a`,
  b: `l12-${RUN}-b`,
  c: `l12-${RUN}-c`,
  legAB: `l12-${RUN}-ab`,
  legBC: `l12-${RUN}-bc`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[ready-made-leg-gate] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function request(userId: string | null, method: "GET" | "POST", url: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { claims: { sub: userId } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
  app.use(readyMadeRoutes);
  app.use(adminRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method });
    const text = await res.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* svg */
    }
    return { status: res.status, body };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function setLegs(rows: Array<{ id: string; from: string; to: string; status: string; mode: string | null; meters: number }>) {
  await db.execute(sql`DELETE FROM transport_legs WHERE trip_id = ${ids.trip}`);
  for (const r of rows) {
    await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
        to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
        estimated_duration_minutes, proposal_status, user_selected_mode)
      VALUES (${r.id}, ${ids.trip}, 1, 0, ${r.from}, 'x', 35.0, 135.7, ${r.to}, 'y', 35.01, 135.71,
        ${r.meters}, '', 'walk', 10, ${r.status}, ${r.mode})`);
  }
}

async function listingStatus(): Promise<string> {
  const r = await db.execute(sql`SELECT status FROM ready_made_trips WHERE id = ${ids.listing}`);
  return (r.rows[0] as any).status;
}

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.author, "local_expert"], [ids.admin, "admin"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'L12', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, author_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.author}, 'L1-2 build', 'Kyoto, Japan', '2027-05-01', '2027-05-01', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, latitude, longitude) VALUES
    (${ids.a}, ${ids.trip}, 'Kiyomizu-dera', 1, 0, 34.9949, 135.7850),
    (${ids.b}, ${ids.trip}, 'Yasaka Shrine', 1, 1, 35.0037, 135.7785),
    (${ids.c}, ${ids.trip}, 'Gion Shirakawa', 1, 2, 35.0056, 135.7740)`);
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days,
      plan_type, price_cents, pricing_mode, hero_image_url, hero_image_meta, status)
    VALUES (${ids.listing}, ${ids.author}, ${ids.trip}, 'Kyoto', 'Higashiyama in a morning', 1,
      'city_itinerary', 3900, 'fixed', 'https://images.unsplash.com/photo-1', ${JSON.stringify({ photographer: "A. Person" })}::jsonb, 'draft')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.author}, ${ids.admin})`);
});

test("G1: unpicked legs block submit, one line per gap", async () => {
  await setLegs([
    { id: ids.legAB, from: ids.a, to: ids.b, status: "proposed", mode: null, meters: 1100 },
    { id: ids.legBC, from: ids.b, to: ids.c, status: "confirmed", mode: null, meters: 600 },
  ]);
  const r = await request(ids.author, "POST", `/api/expert/ready-made/${ids.listing}/submit`);
  assert.equal(r.status, 400);
  const legs = r.body.missing.filter((m: any) => m.requirement === "legs");
  assert.equal(legs.length, 2);
  assert.deepEqual(legs.map((l: any) => [l.dayNumber, l.fromItemId, l.toItemId, l.legId]), [
    [1, ids.a, ids.b, ids.legAB],
    [1, ids.b, ids.c, ids.legBC],
  ]);
  assert.match(legs[0].message, /Kiyomizu-dera to Yasaka Shrine/);
  assert.equal(r.body.missing.length, 2, "only the leg clause is missing");
  assert.equal(await listingStatus(), "draft");
});

test("G2: a located pair with no leg row blocks, without a legId", async () => {
  await setLegs([{ id: ids.legAB, from: ids.a, to: ids.b, status: "confirmed", mode: "walk", meters: 1100 }]);
  const r = await request(ids.author, "POST", `/api/expert/ready-made/${ids.listing}/submit`);
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.missing.map((m: any) => [m.requirement, m.fromItemId, m.toItemId, m.legId]), [["legs", ids.b, ids.c, undefined]]);
});

test("G3: admin approve refuses the same listing with the same lines", async () => {
  await db.execute(sql`UPDATE ready_made_trips SET status = 'submitted' WHERE id = ${ids.listing}`);
  const r = await request(ids.admin, "POST", `/api/admin/ready-made/${ids.listing}/approve`);
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.missing.map((m: any) => [m.requirement, m.fromItemId, m.toItemId]), [["legs", ids.b, ids.c]]);
  assert.equal(await listingStatus(), "submitted");
  await db.execute(sql`UPDATE ready_made_trips SET status = 'draft' WHERE id = ${ids.listing}`);
});

test("G4: a fully picked build passes; an unlocated stop does not block", async () => {
  await db.execute(sql`UPDATE itinerary_items SET latitude = NULL, longitude = NULL WHERE id = ${ids.c}`);
  await setLegs([{ id: ids.legAB, from: ids.a, to: ids.b, status: "confirmed", mode: "walk", meters: 1100 }]);
  const r = await request(ids.author, "POST", `/api/expert/ready-made/${ids.listing}/submit`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await listingStatus(), "submitted");
  await db.execute(sql`UPDATE itinerary_items SET latitude = 35.0056, longitude = 135.7740 WHERE id = ${ids.c}`);
});

test("T1: the teaser's day distance counts confirmed legs only", async () => {
  await db.execute(sql`UPDATE ready_made_trips SET status = 'approved', active = true WHERE id = ${ids.listing}`);
  await setLegs([
    { id: ids.legAB, from: ids.a, to: ids.b, status: "confirmed", mode: "walk", meters: 1100 },
    { id: ids.legBC, from: ids.b, to: ids.c, status: "proposed", mode: null, meters: 5000 },
  ]);
  const r = await request(null, "GET", `/api/ready-made/${ids.listing}/teaser-map.svg`);
  assert.equal(r.status, 200);
  assert.match(String(r.body), /Day 1 · 1\.1 km/);
  assert.doesNotMatch(String(r.body), /6\.1 km/);
});

test("U1: pure pairing and line rules", () => {
  const items = [
    { id: "a", title: "A", dayNumber: 2, latitude: "35.0", longitude: "135.7" },
    { id: "b", title: "B", dayNumber: 2, latitude: null, longitude: null },
    { id: "c", title: "C", dayNumber: 2, latitude: 35.1, longitude: 135.8 },
    { id: "d", title: "D", dayNumber: 1, latitude: 35.2, longitude: 135.6 },
    { id: "e", title: "E", dayNumber: 1, latitude: 35.3, longitude: 135.5 },
  ];
  assert.deepEqual(consecutiveStopPairs(items).map((p) => [p.dayNumber, p.from.id, p.to.id, !!p.fromCoord, !!p.toCoord]), [
    [1, "d", "e", true, true],
    [2, "a", "b", true, false],
    [2, "b", "c", false, true],
  ]);
  const none = readyMadeLegLines(items, []);
  assert.deepEqual(none.blocking.map((l) => [l.fromItemId, l.toItemId]), [["d", "e"]]);
  assert.deepEqual(none.advisory.map((l) => [l.requirement, l.message]), [["leg_location", "Day 2: B has no location"]]);
  const picked = readyMadeLegLines(items, [
    { id: "x", dayNumber: 1, fromActivityId: "d", toActivityId: "e", proposalStatus: "confirmed", userSelectedMode: "train" },
  ]);
  assert.equal(picked.blocking.length, 0);
  const wrongDirection = readyMadeLegLines(items, [
    { id: "x", dayNumber: 1, fromActivityId: "e", toActivityId: "d", proposalStatus: "confirmed", userSelectedMode: "train" },
  ]);
  assert.equal(wrongDirection.blocking.length, 1, "a leg is directional");
});

test("E1: the engine proposes exactly the pairs the gate asks for", async () => {
  await db.execute(sql`UPDATE itinerary_items SET latitude = NULL, longitude = NULL WHERE id = ${ids.c}`);
  await setLegs([{ id: ids.legAB, from: ids.a, to: ids.b, status: "confirmed", mode: "walk", meters: 1100 }]);
  const result = await generateTripTransportLegs(ids.trip, { propagateSchedule: false });
  assert.equal(result.keptConfirmed, 1);
  assert.equal(result.created, 0);
  assert.deepEqual(result.skipped.map((k) => [k.fromItemId, k.toItemId, k.reason]), [[ids.b, ids.c, "missing_coordinates"]]);
  await db.execute(sql`UPDATE itinerary_items SET latitude = 35.0056, longitude = 135.7740 WHERE id = ${ids.c}`);
  const again = await generateTripTransportLegs(ids.trip, { propagateSchedule: false });
  assert.equal(again.keptConfirmed, 1);
  assert.equal(again.created + again.skipped.length, 1, "one gap: proposed, or skipped as unroutable");
  if (again.created === 1) {
    const r = await db.execute(sql`SELECT from_activity_id, to_activity_id, proposal_status FROM transport_legs
      WHERE trip_id = ${ids.trip} AND proposal_status = 'proposed'`);
    assert.deepEqual(r.rows.map((x: any) => [x.from_activity_id, x.to_activity_id]), [[ids.b, ids.c]]);
  }
});
