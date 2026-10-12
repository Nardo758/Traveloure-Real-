/**
 * ST-1 — the plancard marks a catalog ride, so the slip offers no time edit on it (ledger
 * `2026-10-12-st1-stop-time-edit`).
 *
 *   RF1 an item on a listing with a `service_transport_facts` row carries `ride: true`
 *   RF2 an item on an ordinary listing, and an item with no listing, carry no `ride` key (§13)
 *
 * TRANSPORT: the REAL plancard router in a bare express app (the p0c-plancard-legs-skipped shape).
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/st1-ride-flag.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_st1";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[st1-ride-flag] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const plancardRoutes = (await import("../routes/plancard.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const owner = `st1-${RUN}-owner`;
const op = `st1-${RUN}-op`;
const TRIP = `st1-${RUN}-trip`;
const RIDE_SVC = `st1-${RUN}-ride`;
const PLAIN_SVC = `st1-${RUN}-plain`;

async function plancard(): Promise<any> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: owner } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(plancardRoutes);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${TRIP}/plancard`);
    assert.equal(res.status, 200);
    return res.json();
  } finally {
    server.close();
  }
}

before(async () => {
  for (const id of [owner, op]) await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${id}, ${`${id}@t.test`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status, dates_confirmed_at)
    VALUES (${TRIP}, ${owner}, 'ST-1', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2027-11-08', '2027-11-08', 'draft', now())`);
  await db.execute(sql`INSERT INTO trip_collaborators (trip_id, user_id, role) VALUES (${TRIP}, ${owner}, 'owner') ON CONFLICT DO NOTHING`).catch(() => undefined);
  for (const [sid, name] of [[RIDE_SVC, "Test river boat"], [PLAIN_SVC, "Tea ceremony"]]) {
    await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, status, approval_status) VALUES (${sid}, ${op}, ${name}, 'active', 'approved')`);
  }
  await db.execute(sql`INSERT INTO service_transport_facts (service_id, official_source) VALUES (${RIDE_SVC}, 'https://example.test/official')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, start_time, item_type, provider_service_id, locked_at) VALUES
    (${`${TRIP}-ride`}, ${TRIP}, 'River boat', 1, 0, '10:30', 'transport', ${RIDE_SVC}, now()),
    (${`${TRIP}-plain`}, ${TRIP}, 'Tea ceremony', 1, 1, '13:00', 'activity', ${PLAIN_SVC}, null),
    (${`${TRIP}-none`}, ${TRIP}, 'Walk', 1, 2, '15:00', 'activity', null, null)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${TRIP}`);
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${TRIP}`).catch(() => undefined);
    await db.execute(sql`DELETE FROM service_transport_facts WHERE service_id = ${RIDE_SVC}`);
    await db.execute(sql`DELETE FROM provider_services WHERE id IN (${RIDE_SVC}, ${PLAIN_SVC})`);
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${owner}, ${op})`);
  } finally {
    await pool.end();
  }
});

test("RF1/RF2 only the catalog ride is marked", async () => {
  const body = await plancard();
  const acts = (body.days ?? []).flatMap((d: any) => d.activities ?? []);
  const by = (id: string) => acts.find((a: any) => a.id === `${TRIP}-${id}`);
  assert.equal(by("ride")?.ride, true);
  assert.equal("ride" in (by("plain") ?? {}), false);
  assert.equal("ride" in (by("none") ?? {}), false);
});
