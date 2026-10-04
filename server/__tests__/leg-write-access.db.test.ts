/**
 * LD 12 / §12 on the leg writes (ledger `2026-10-04-leg-write-access`): a PENDING advisor may read a
 * trip's legs but may not confirm, re-mode, edit or delete one.
 *
 *   W1  a pending advisor is refused 403 on PATCH and DELETE `/api/trips/:tripId/transport-legs/:legId`
 *       and on the trip-scoped `PATCH /api/transport-legs/:legId/mode`; the leg is unchanged
 *   W2  an accepted advisor and the trip owner may confirm and re-mode
 *   W3  the owner may delete
 *   R1  the pending advisor still READS the legs (`GET /api/trips/:tripId/transport-legs?includeProposed=1`)
 *   G1  a pending advisor is refused 403 on `POST /api/trips/:tripId/transport-legs/generate`, which
 *       replaces the plan's proposed legs; the proposed leg survives
 *   G2  the owner and an accepted advisor may generate (200)
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/leg-write-access.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_leg_write_access";
const { db } = await import("../db");
const transportLegsRoutes = (await import("../routes/transport-legs.routes")).default;
const tripsRoutes = (await import("../routes/trips.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `lwa-${RUN}-owner`,
  pending: `lwa-${RUN}-pending`,
  accepted: `lwa-${RUN}-accepted`,
  trip: `lwa-${RUN}-trip`,
  leg: `lwa-${RUN}-leg`,
  leg2: `lwa-${RUN}-leg2`,
  leg3: `lwa-${RUN}-leg3`,
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
    throw new Error(`[leg-write-access] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function call(userId: string, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(transportLegsRoutes);
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function legRow(id: string): Promise<any> {
  return (await db.execute(sql`SELECT proposal_status, user_selected_mode FROM transport_legs WHERE id = ${id}`)).rows[0];
}

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.owner, "traveler"], [ids.pending, "local_expert"], [ids.accepted, "local_expert"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id}, ${`${id}@t.test`}, 'LWA', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.owner}, 'Leg write access', 'Kyoto, Japan', '2027-05-01', '2027-05-02', 'draft')`);
  await db.execute(sql`INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status) VALUES
    (${`${ids.trip}-p`}, ${ids.trip}, ${ids.pending}, 'pending'),
    (${`${ids.trip}-a`}, ${ids.trip}, ${ids.accepted}, 'accepted')`);
  for (const id of [ids.leg, ids.leg2, ids.leg3]) {
    await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
        to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, alternative_modes,
        estimated_duration_minutes, proposal_status)
      VALUES (${id}, ${ids.trip}, 1, 0, 'a', 'A', 35.0, 135.7, 'b', 'B', 35.01, 135.71, 900, '0.9 km', 'walk',
        ${JSON.stringify([{ mode: "bus", durationMinutes: 9, costUsd: 2, energyCost: 1, reason: "" }])}::jsonb, 12, 'proposed')`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_changes WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.pending}, ${ids.accepted})`);
});

test("W1: a pending advisor cannot confirm, re-mode or delete a leg", async () => {
  const patch = await call(ids.pending, "PATCH", `/api/trips/${ids.trip}/transport-legs/${ids.leg}`, { proposalStatus: "confirmed" });
  assert.equal(patch.status, 403);
  const mode = await call(ids.pending, "PATCH", `/api/transport-legs/${ids.leg}/mode`, { selectedMode: "bus" });
  assert.equal(mode.status, 403);
  const del = await call(ids.pending, "DELETE", `/api/trips/${ids.trip}/transport-legs/${ids.leg}`);
  assert.equal(del.status, 403);
  assert.deepEqual(await legRow(ids.leg), { proposal_status: "proposed", user_selected_mode: null });
});

test("W2: an accepted advisor and the owner may confirm and re-mode", async () => {
  const byAdvisor = await call(ids.accepted, "PATCH", `/api/trips/${ids.trip}/transport-legs/${ids.leg}`, { proposalStatus: "confirmed", userSelectedMode: "walk" });
  assert.equal(byAdvisor.status, 200, JSON.stringify(byAdvisor.body));
  const mode = await call(ids.owner, "PATCH", `/api/transport-legs/${ids.leg}/mode`, { selectedMode: "bus" });
  assert.equal(mode.status, 200, JSON.stringify(mode.body));
  assert.deepEqual(await legRow(ids.leg), { proposal_status: "confirmed", user_selected_mode: "bus" });
});

test("W3: the owner may delete a leg", async () => {
  const del = await call(ids.owner, "DELETE", `/api/trips/${ids.trip}/transport-legs/${ids.leg2}`);
  assert.equal(del.status, 200);
  assert.equal(await legRow(ids.leg2), undefined);
});

test("R1: a pending advisor still reads the legs", async () => {
  const r = await call(ids.pending, "GET", `/api/trips/${ids.trip}/transport-legs?includeProposed=1`);
  assert.equal(r.status, 200);
  assert.ok(r.body.legs.some((l: any) => l.id === ids.leg));
});

test("G1: a pending advisor cannot regenerate the plan's legs", async () => {
  const r = await call(ids.pending, "POST", `/api/trips/${ids.trip}/transport-legs/generate`);
  assert.equal(r.status, 403);
  assert.deepEqual(await legRow(ids.leg3), { proposal_status: "proposed", user_selected_mode: null });
});

test("G2: the owner and an accepted advisor may regenerate the plan's legs", async () => {
  const byOwner = await call(ids.owner, "POST", `/api/trips/${ids.trip}/transport-legs/generate`);
  assert.equal(byOwner.status, 200, JSON.stringify(byOwner.body));
  const byAdvisor = await call(ids.accepted, "POST", `/api/trips/${ids.trip}/transport-legs/generate`);
  assert.equal(byAdvisor.status, 200, JSON.stringify(byAdvisor.body));
});
