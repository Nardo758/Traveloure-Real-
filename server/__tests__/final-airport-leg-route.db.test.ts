/**
 * Row 185 J6 — GET /api/trips/:tripId/plancard forwards `finalAirportLeg`.
 * The handler rebuilds its JSON from a whitelist. These proofs hit that handler
 * (the payer-reads-plancard mount), not `assembleTripPlan` directly.
 *
 *   R1  owner + ?surface=card on a final that has the keys returns finalAirportLeg
 *   R2  an expert, a delegate, a payer, and a stranger do not receive it
 *   R3  the owner's live read (no surface) does not
 *   R4  a final written before the keys existed does not, even for the owner on the card
 *
 * DISPOSABLE DB ONLY. Does not call pool.end() — this file shares a tsx process
 * with the other suites on the same workflow line.
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/final-airport-leg-route.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import plancardRoutes from "../routes/plancard.routes";
import { finalizeTrip } from "../services/trip-finalize.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `j6r-${RUN}-${s}`;
const ids = {
  owner: id("owner"),
  expert: id("expert"),
  delegate: id("delegate"),
  payer: id("payer"),
  stranger: id("stranger"),
  trip: id("trip"),
  old: id("old"),
  rel: id("rel"),
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[final-airport-leg-route] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

let server: http.Server;
let base = "";

async function read(userId: string, tripId: string, card: boolean): Promise<{ status: number; body: any }> {
  const q = card ? "?surface=card" : "";
  const res = await fetch(`${base}/api/trips/${tripId}/plancard${q}`, { headers: { "x-test-user": userId } });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body };
}

before(async () => {
  assertDisposableDb();
  for (const userId of [ids.owner, ids.expert, ids.delegate, ids.payer, ids.stranger]) {
    await db.execute(sql`
      INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${userId}, ${`${userId}@t.test`}, 'J6', 'Route', 'user')
    `);
  }
  await db.execute(sql`
    INSERT INTO ea_client_relationships (id, ea_user_id, client_user_id, client_email)
    VALUES (${ids.rel}, ${ids.delegate}, ${ids.owner}, ${`${ids.owner}@t.test`})
  `);
  for (const tripId of [ids.trip, ids.old]) {
    await db.execute(sql`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status, timezone, adults)
      VALUES (${tripId}, ${ids.owner}, ${`Route ${RUN}`}, ${`Rt${RUN}, Testland`}, '2027-06-01', '2027-06-04', 'draft', 'Asia/Tokyo', 2)
    `);
    await db.execute(sql`
      INSERT INTO trip_collaborators (id, trip_id, user_id, role)
      VALUES (${crypto.randomUUID()}, ${tripId}, ${ids.owner}, 'owner')
    `);
    await db.execute(sql`
      INSERT INTO itinerary_items (id, trip_id, title, day_number, origin, latitude, longitude)
      VALUES (${id(tripId === ids.trip ? "item" : "olditem")}, ${tripId}, ${`Stop ${RUN}`}, 1, 'traveler', '35.0116', '135.7681')
    `);
  }
  await db.execute(sql`
    INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, location, description)
    VALUES (${id("arr")}, ${ids.trip}, 'flight_arrival', ${"2026-11-11 14:30:00"}::timestamp, 'KIX', 'NH 123')
  `);
  await finalizeTrip(ids.trip, ids.owner);
  await db.execute(sql`
    UPDATE trips
       SET managed_by_ea_id = ${ids.delegate}, ea_client_relationship_id = ${ids.rel}
     WHERE id = ${ids.trip}
  `);
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status)
    VALUES (${id("adv")}, ${ids.trip}, ${ids.expert}, 'accepted')
  `);
  await db.execute(sql`
    INSERT INTO trip_participants (id, trip_id, user_id, name, role)
    VALUES (${id("part")}, ${ids.trip}, ${ids.payer}, 'Payer', 'payer')
  `);
  await db.execute(sql`
    INSERT INTO trip_finals (id, trip_id, version, snapshot, content_hash, finalized_by)
    VALUES (
      ${id("pre")}, ${ids.old}, 1,
      ${JSON.stringify({ trip: { id: ids.old }, items: [], card: { days: [], builtFrom: null, photos: {} } })}::jsonb,
      ${"ab".repeat(32)},
      ${ids.owner}
    )
  `);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: req.headers["x-test-user"] } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => { cb?.(); };
    next();
  });
  app.use(plancardRoutes);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const tripId of [ids.trip, ids.old]) {
    await db.execute(sql`DELETE FROM temporal_anchors WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_finals WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_participants WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${tripId}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM ea_client_relationships WHERE id = ${ids.rel}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert}, ${ids.delegate}, ${ids.payer}, ${ids.stranger})`).catch(() => {});
});

test("R1–R3 the plancard route returns finalAirportLeg only to the owner on the card", async () => {
  const owner = await read(ids.owner, ids.trip, true);
  assert.equal(owner.status, 200, JSON.stringify(owner.body));
  assert.equal(owner.body.tripRole, "owner");
  assert.deepEqual(owner.body.finalAirportLeg, {
    flightArrival: { time: "14:30", airport: "KIX", description: "NH 123", airportLegMinutes: null },
    flightDeparture: null,
    platformCarFits: false,
  });

  const expert = await read(ids.expert, ids.trip, true);
  assert.equal(expert.status, 200, JSON.stringify(expert.body));
  assert.equal(expert.body.tripRole, "expert");
  assert.equal("finalAirportLeg" in expert.body, false);

  const delegate = await read(ids.delegate, ids.trip, true);
  assert.equal(delegate.status, 200, JSON.stringify(delegate.body));
  assert.equal(delegate.body.tripRole, "delegate");
  assert.equal("finalAirportLeg" in delegate.body, false);

  const payer = await read(ids.payer, ids.trip, true);
  assert.equal(payer.status, 200, JSON.stringify(payer.body));
  assert.equal(payer.body.tripRole, "payer");
  assert.equal("finalAirportLeg" in payer.body, false);

  const stranger = await read(ids.stranger, ids.trip, true);
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body?.finalAirportLeg, undefined);

  const live = await read(ids.owner, ids.trip, false);
  assert.equal(live.status, 200, JSON.stringify(live.body));
  assert.equal(live.body.tripRole, "owner");
  assert.equal("finalAirportLeg" in live.body, false);
});

test("R4 a pre-key final has no finalAirportLeg on the card, even for the owner", async () => {
  const card = await read(ids.owner, ids.old, true);
  assert.equal(card.status, 200, JSON.stringify(card.body));
  assert.equal(card.body.trip?.finalVersion, 1);
  assert.equal("finalAirportLeg" in card.body, false);
});
