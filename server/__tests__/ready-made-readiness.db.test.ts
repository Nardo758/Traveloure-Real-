/**
 * L1-9 — the ready-made readiness read (work plan docs/planning/expert-console-ready-made-work-plan.md,
 * enhancement 1; ruling R-bi). `GET /api/expert/ready-made/:id/readiness`.
 *
 *   B1  `blocking` equals the `missing` body a refused submit returns, line for line (one function)
 *   A1  `advisory` names: the unlocated stop (leg_location), each located non-lodging stop with no
 *       hours on file (itemId), each stop whose photo is not on hand (itemId), an anchor outside the
 *       build's days (anchorId) and an activity inside an anchor's buffer (anchorId, dayNumber)
 *   P2  photos, from the cache only: a cached Commons photo clears the line, a remembered miss says
 *       "no photo found", a never-looked stop says "not looked up yet"
 *   A2  advisory lines never block: once the blocking list is empty the submit succeeds
 *   S1  someone who is not the author gets 404
 *   U1  `readinessAdvisory` pure cases: an item with an hours fact and a lodging item are not flagged
 *
 * NEGATIVE SPACE (§18d): "legs not checked in 90 days" is not reported (it needs migration 346's
 * `checked_at`, not on this branch's base); the hours check reads `factsForTrip` and no fixture writes
 * a `place_facts` row here — the "has hours" branch is proven at the pure layer (U1).
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/ready-made-readiness.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_ready_made_readiness";
const { db } = await import("../db");
const readyMadeRoutes = (await import("../routes/ready-made.routes")).default;
const { readinessAdvisory } = await import("../services/ready-made-readiness");
const { photoCacheKey } = await import("../services/place-photos.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  author: `l19-${RUN}-author`,
  stranger: `l19-${RUN}-stranger`,
  trip: `l19-${RUN}-trip`,
  listing: `l19-${RUN}-listing`,
  a: `l19-${RUN}-a`,
  b: `l19-${RUN}-b`,
  c: `l19-${RUN}-c`,
  hotel: `l19-${RUN}-hotel`,
  legAB: `l19-${RUN}-ab`,
  inWindow: `l19-${RUN}-in`,
  outWindow: `l19-${RUN}-out`,
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
    throw new Error(`[ready-made-readiness] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function call(userId: string, method: "GET" | "POST", url: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(readyMadeRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.author, "local_expert"], [ids.stranger, "local_expert"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id}, ${`${id}@t.test`}, 'L19', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO trips (id, author_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.author}, 'L1-9 build', 'Kyoto, Japan', '2027-05-01', '2027-05-01', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, end_time) VALUES
    (${ids.hotel}, ${ids.trip}, 'Ryokan Yoshida', 'accommodation', 1, 0, 35.000, 135.770, NULL, NULL),
    (${ids.a}, ${ids.trip}, 'Kiyomizu-dera', 'activity', 1, 1, 34.9949, 135.7850, '09:00', '10:30'),
    (${ids.b}, ${ids.trip}, 'Yasaka Shrine', 'activity', 1, 2, 35.0037, 135.7785, '15:00', '16:00'),
    (${ids.c}, ${ids.trip}, 'Unnamed tea house', 'activity', 1, 3, NULL, NULL, NULL, NULL)`);
  // hotel→A and A→B need picked legs; only A→B exists, proposed ⇒ two blocking leg lines.
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, estimated_duration_minutes, proposal_status)
    VALUES (${ids.legAB}, ${ids.trip}, 1, 1, ${ids.a}, 'Kiyomizu-dera', 34.9949, 135.785, ${ids.b}, 'Yasaka Shrine', 35.0037, 135.7785, 1100, '1.1 km', 'walk', 15, 'proposed')`);
  await db.execute(sql`INSERT INTO temporal_anchors (id, trip_id, anchor_type, anchor_datetime, buffer_before, buffer_after, description) VALUES
    (${ids.inWindow}, ${ids.trip}, 'pre_booked_tour', '2027-05-01 15:30:00', 30, 30, 'Tea ceremony'),
    (${ids.outWindow}, ${ids.trip}, 'flight_departure', '2027-05-03 10:00:00', 0, 0, 'Fly home')`);
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days,
      plan_type, price_cents, pricing_mode, hero_image_url, hero_image_meta, status)
    VALUES (${ids.listing}, ${ids.author}, ${ids.trip}, 'Kyoto', 'A morning in Higashiyama', 1,
      'city_itinerary', 3900, 'fixed', 'https://images.unsplash.com/photo-1', ${JSON.stringify({ photographer: "A. Person" })}::jsonb, 'draft')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.listing}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.author}, ${ids.stranger})`);
});

test("B1: blocking equals a refused submit's missing list", async () => {
  const r = await call(ids.author, "GET", `/api/expert/ready-made/${ids.listing}/readiness`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const submit = await call(ids.author, "POST", `/api/expert/ready-made/${ids.listing}/submit`);
  assert.equal(submit.status, 400);
  assert.deepEqual(r.body.blocking, submit.body.missing);
  assert.deepEqual(r.body.blocking.map((l: any) => [l.requirement, l.fromItemId, l.toItemId, l.legId]), [
    ["legs", ids.hotel, ids.a, undefined],
    ["legs", ids.a, ids.b, ids.legAB],
  ]);
});

test("A1: advisory lines name what they are about", async () => {
  const r = await call(ids.author, "GET", `/api/expert/ready-made/${ids.listing}/readiness`);
  const adv = r.body.advisory as any[];
  const by = (req: string) => adv.filter((l) => l.requirement === req);
  assert.deepEqual(by("leg_location").map((l) => l.message), ["Day 1: Unnamed tea house has no location"]);
  assert.deepEqual(by("hours").map((l) => l.itemId).sort(), [ids.a, ids.b].sort(), "located non-lodging stops only");
  // Neither stop has a listing image, a cached Google reference or a cached Commons row: both are
  // "not looked up yet" — never "no photo" (§13).
  assert.deepEqual(by("photos").map((l) => [l.itemId, /looked up yet/.test(l.message)]).sort(), [[ids.a, true], [ids.b, true]].sort());
  assert.deepEqual(by("anchor_window").map((l) => l.anchorId), [ids.outWindow]);
  assert.deepEqual(by("schedule").map((l) => [l.anchorId, l.dayNumber]), [[ids.inWindow, 1]]);
  assert.match(by("schedule")[0].message, /Yasaka Shrine/);
});

test("A2: advisory lines never block a submit", async () => {
  await db.execute(sql`UPDATE transport_legs SET proposal_status = 'confirmed', user_selected_mode = 'walk' WHERE id = ${ids.legAB}`);
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode, estimated_duration_minutes, proposal_status, user_selected_mode)
    VALUES (${`${ids.legAB}-h`}, ${ids.trip}, 1, 0, ${ids.hotel}, 'Ryokan', 35.0, 135.77, ${ids.a}, 'Kiyomizu-dera', 34.9949, 135.785, 900, '0.9 km', 'walk', 12, 'confirmed', 'taxi')`);
  const r = await call(ids.author, "GET", `/api/expert/ready-made/${ids.listing}/readiness`);
  assert.deepEqual(r.body.blocking, []);
  assert.ok(r.body.advisory.length > 0);
  const submit = await call(ids.author, "POST", `/api/expert/ready-made/${ids.listing}/submit`);
  assert.equal(submit.status, 200, JSON.stringify(submit.body));
});

test("P2: the photo line reads the cache only", async () => {
  const key = (title: string, lat: number, lng: number) => photoCacheKey({ name: title, placeId: null, lat, lng })!;
  const kA = key("Kiyomizu-dera", 34.9949, 135.785);
  const kB = key("Yasaka Shrine", 35.0037, 135.7785);
  await db.execute(sql`INSERT INTO place_photos (id, place_id, source, url_or_asset, checked_at, created_at) VALUES
    (${`${ids.a}-ph`}, ${kA}, 'wikimedia', 'https://upload.wikimedia.org/x.jpg', now(), now()),
    (${`${ids.b}-ph`}, ${kB}, 'wikimedia', NULL, now(), now())`);
  try {
    const r = await call(ids.author, "GET", `/api/expert/ready-made/${ids.listing}/readiness`);
    const photos = (r.body.advisory as any[]).filter((l) => l.requirement === "photos");
    assert.deepEqual(photos.map((l) => [l.itemId, l.message]), [[ids.b, "Day 1: no photo found for Yasaka Shrine"]]);
  } finally {
    await db.execute(sql`DELETE FROM place_photos WHERE id IN (${`${ids.a}-ph`}, ${`${ids.b}-ph`})`);
  }
});

test("S1: not the author ⇒ 404", async () => {
  const r = await call(ids.stranger, "GET", `/api/expert/ready-made/${ids.listing}/readiness`);
  assert.equal(r.status, 404);
});

test("U1: an hours fact or a lodging item is not flagged", () => {
  const items = [
    { id: "x", title: "Nanzen-ji", dayNumber: 1, itemType: "activity", latitude: 35, longitude: 135 },
    { id: "y", title: "Hotel Granvia", dayNumber: 1, itemType: "activity", latitude: 35, longitude: 135 },
    { id: "z", title: "Ginkaku-ji", dayNumber: 2, itemType: "activity", latitude: 35, longitude: 135 },
  ];
  const lines = readinessAdvisory({
    items,
    legAdvisory: [],
    factTypesByItem: new Map([["x", new Set(["hours"])], ["z", new Set(["address"])]]),
    anchors: [],
    buildStartDate: null,
    durationDays: 2,
  });
  assert.deepEqual(lines.filter((l) => l.requirement === "hours").map((l) => l.itemId), ["z"]);
  assert.equal(lines.some((l) => l.requirement === "anchor_window" || l.requirement === "schedule"), false, "no build date ⇒ no date checks");
});

test("U2 (Slice A2): reachability reads the build's own leg minutes and names the leg", () => {
  const items = [
    { id: "a", title: "Fushimi Inari", dayNumber: 1, itemType: "activity", latitude: 34.96, longitude: 135.77, startTime: "09:00", endTime: "10:30" },
    { id: "b", title: "Arashiyama", dayNumber: 1, itemType: "activity", latitude: 35.01, longitude: 135.67, startTime: "10:45" },
    { id: "c", title: "Kinkaku-ji", dayNumber: 1, itemType: "activity", latitude: 35.03, longitude: 135.72, startTime: "14:00" },
  ];
  const lines = readinessAdvisory({
    items,
    legAdvisory: [],
    factTypesByItem: new Map([["a", new Set(["hours"])], ["b", new Set(["hours"])], ["c", new Set(["hours"])]]),
    anchors: [],
    buildStartDate: null,
    durationDays: 1,
    legs: [
      { id: "L1", dayNumber: 1, fromActivityId: "a", toActivityId: "b", estimatedDurationMinutes: 42 },
      { id: "L2", dayNumber: 1, fromActivityId: "b", toActivityId: "c", estimatedDurationMinutes: 20 },
    ],
  });
  const reach = lines.filter((l) => l.requirement === "reachability");
  assert.deepEqual(reach.map((l) => [l.legId, l.itemId, l.dayNumber]), [["L1", "b", 1]]);
  assert.equal(reach[0].message, "Day 1: Arashiyama can't be reached in time — the leg from Fushimi Inari takes 42 min and the plan leaves 15 min");
  assert.equal(readinessAdvisory({ items, legAdvisory: [], factTypesByItem: new Map(), anchors: [], buildStartDate: null, durationDays: 1 }).some((l) => l.requirement === "reachability"), false, "no legs ⇒ nothing checked, nothing claimed");
});
