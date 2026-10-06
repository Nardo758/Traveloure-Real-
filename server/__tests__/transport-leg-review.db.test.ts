/**
 * L1-10 — the leg-review read (work plan docs/planning/expert-console-ready-made-work-plan.md,
 * enhancement 2). `GET /api/trips/:tripId/transport-legs/review`.
 *
 *   V1  legs in review order (day, then leg_order), proposed included, each with coordinates and
 *       candidate modes; `firstUnpickedIndex` points at the first leg not confirmed-with-a-mode
 *   V2  candidate modes equal the Workstation picker's rule — the client now IMPORTS the same
 *       `legModeOptions` (source pin), and its output matches the pre-move algorithm on a sample leg
 *   V3  all picked ⇒ `firstUnpickedIndex: null`; a confirmed host-pickup leg counts as picked
 *   V4  a caller with no access gets the same 404 as the Workstation read; `checked_by` is never
 *       returned
 *   V5  smoke 12 S12-1: the leg PATCH accepts exactly the modes the read serves — a leg whose
 *       engine default is "driving" can be switched to Taxi and picked back to Driving; a mode the
 *       leg does not offer is refused 400 with the served list
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/transport-leg-review.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import transportLegsRoutes from "../routes/transport-legs.routes";
import { CHAUFFEURED_MODES, legModeOptions } from "@shared/trip-plan";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  author: `l110-${RUN}-author`,
  stranger: `l110-${RUN}-stranger`,
  trip: `l110-${RUN}-trip`,
  d2: `l110-${RUN}-d2`,
  d1b: `l110-${RUN}-d1b`,
  d1a: `l110-${RUN}-d1a`,
  drv: `l110-${RUN}-drv`,
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
    throw new Error(`[transport-leg-review] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function patchAs(userId: string, legId: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(transportLegsRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${ids.trip}/transport-legs/${legId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function reviewAs(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(transportLegsRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/trips/${ids.trip}/transport-legs/review`);
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const leg = (id: string, day: number, order: number, status: string, mode: string | null, alts: unknown[]) =>
  db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, alternative_modes,
      estimated_duration_minutes, proposal_status, user_selected_mode, checked_by)
    VALUES (${id}, ${ids.trip}, ${day}, ${order}, ${`${id}-f`}, ${`From ${id}`}, 35.0, 135.7, ${`${id}-t`}, ${`To ${id}`}, 35.01, 135.71,
      900, '0.9 km', 'walk', ${JSON.stringify(alts)}::jsonb, 12, ${status}, ${mode}, ${ids.author})`);

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.author, "local_expert"], [ids.stranger, "traveler"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id}, ${`${id}@t.test`}, 'L110', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, author_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.author}, 'L1-10 build', 'Kyoto, Japan', '2027-05-01', '2027-05-02', 'draft')`);
  await leg(ids.d2, 2, 0, "proposed", null, []);
  await leg(ids.d1b, 1, 1, "proposed", null, [{ mode: "bus", durationMinutes: 9, costUsd: 2, energyCost: 1, reason: "" }]);
  await leg(ids.d1a, 1, 0, "confirmed", "walk", []);
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.author}, ${ids.stranger})`);
});

test("V1: review order, coordinates, candidates and the first unpicked leg", async () => {
  const r = await reviewAs(ids.author);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.legs.map((l: any) => [l.id, l.dayNumber, l.legOrder, l.picked]), [
    [ids.d1a, 1, 0, true],
    [ids.d1b, 1, 1, false],
    [ids.d2, 2, 0, false],
  ]);
  assert.equal(r.body.firstUnpickedIndex, 1);
  const b = r.body.legs[1];
  assert.deepEqual([b.from, b.to, b.fromName], [{ lat: 35.0, lng: 135.7 }, { lat: 35.01, lng: 135.71 }, `From ${ids.d1b}`]);
  assert.ok(b.candidateModes.includes("bus") && b.candidateModes.includes("walk") && b.candidateModes.includes("taxi"));
});

test("V2: candidates are the Workstation picker's own rule", () => {
  const sample = { recommendedMode: "walk", alternativeModes: [{ mode: "train" }, { mode: "bus" }], userSelectedMode: "ferry" };
  const preMove = (() => {
    const set = new Set<string>([sample.recommendedMode, ...sample.alternativeModes.map((a) => a.mode), ...CHAUFFEURED_MODES, sample.userSelectedMode]);
    return Array.from(set).sort();
  })();
  assert.deepEqual(legModeOptions(sample), preMove);
  // R322 (step 7a): the Workstation's mode picker is the shared LegRow (role expert) now.
  const legRow = fs.readFileSync(path.resolve(import.meta.dirname, "../../client/src/components/plan/LegRow.tsx"), "utf8");
  assert.match(legRow, /import \{[^}]*\blegModeOptions\b[^}]*\} from "@shared\/trip-plan";/);
  assert.match(legRow, /legModeOptions\(leg\)/, "the picker's options are the shared rule");
  const ws = fs.readFileSync(path.resolve(import.meta.dirname, "../../client/src/pages/expert/workspace.tsx"), "utf8");
  for (const src of [ws, legRow]) assert.doesNotMatch(src, /function legModeOptions\(/, "no second copy of the rule");
});

test("V3: all picked ⇒ null; a confirmed host pickup counts as picked", async () => {
  await db.execute(sql`UPDATE transport_legs SET proposal_status = 'confirmed', user_selected_mode = 'bus' WHERE id = ${ids.d1b}`);
  await db.execute(sql`UPDATE transport_legs SET proposal_status = 'confirmed', pickup_provider_service_id = 'svc-1' WHERE id = ${ids.d2}`);
  const r = await reviewAs(ids.author);
  assert.equal(r.body.firstUnpickedIndex, null);
  assert.ok(r.body.legs.every((l: any) => l.picked));
});

test("V4: no access ⇒ 404; checked_by is never returned", async () => {
  const r = await reviewAs(ids.stranger);
  assert.equal(r.status, 404);
  const ok = await reviewAs(ids.author);
  assert.equal(JSON.stringify(ok.body).includes(ids.author), false);
  assert.equal("checkedBy" in ok.body.legs[0], false);
});

test("V5 (S12-1): the PATCH accepts what the read serves — Taxi, then Driving back", async () => {
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, alternative_modes,
      estimated_duration_minutes, proposal_status)
    VALUES (${ids.drv}, ${ids.trip}, 3, 0, 'drv-f', 'From drv', 35.0, 135.7, 'drv-t', 'To drv', 35.05, 135.75,
      6000, '6 km', 'driving', '[]'::jsonb, 14, 'proposed')`);
  const served = (await reviewAs(ids.author)).body.legs.find((l: any) => l.id === ids.drv).candidateModes as string[];
  assert.ok(served.includes("driving") && served.includes("taxi"), JSON.stringify(served));

  const taxi = await patchAs(ids.author, ids.drv, { userSelectedMode: "taxi" });
  assert.equal(taxi.status, 200, JSON.stringify(taxi.body));
  assert.equal(taxi.body.leg.userSelectedMode, "taxi");
  assert.ok(taxi.body.leg.candidateModes.includes("driving"), "the write's own response serves the list too");

  const back = await patchAs(ids.author, ids.drv, { userSelectedMode: "driving" });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.leg.userSelectedMode, "driving");

  const bogus = await patchAs(ids.author, ids.drv, { userSelectedMode: "hovercraft" });
  assert.equal(bogus.status, 400);
  assert.ok(Array.isArray(bogus.body.candidateModes) && bogus.body.candidateModes.includes("driving"));
});
