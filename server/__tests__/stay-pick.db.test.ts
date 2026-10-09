/**
 * S1 "one stay on the plan" against a disposable database (ledger `2026-10-09-s1-one-stay`; brief
 * docs/planning/briefs/s1-one-stay.md; migration 359).
 *
 *   SD1  a FREE plan: the writer skips with no Maps call, and the read is the straight-line top 3
 *   SD2  a PAID plan (an active Trip Pass ⇒ `planGetsRoutedLegs`): ONE matrix request per hotel to every
 *        stop on the plan's dates, scored until 150 ELEMENTS are spent, in straight-line order; the stored
 *        pick is the routed best; scored/candidate counts recorded
 *   SD3  the pick comes ONLY from scored hotels: a hotel past the budget is never picked, however fast
 *   SD4  same stops ⇒ no re-score and no call; moved stops ⇒ re-score, a different hotel sets `changed`,
 *        and only the owner clears it (anyone else is refused)
 *   SD5  a refused / failed call stops the scoring there and the pick comes from what was scored; nothing
 *        scored leaves the earlier pick as it was
 *   SD6  the read never computes: a paid plan's where-to-stay view returns the STORED pick and counts and
 *        makes no Maps call
 *   SD7  the tier test is `planGetsRoutedLegs`, not a paid optimizer run (ruling 4)
 *   SD8  FU-S1-1: through the REAL gate, each stay-pick request writes ONE `route_matrix` row on
 *        `api_usage_logs` carrying its elements (the cap's count) AND its dollars at the Essentials list
 *        price, purpose `stay_pick`, ref = the plan; a refresh-style call without a price still records 0
 *   SD9  FU-S1-2: the free plan's list read carries ONE `stayLink` per card (Google Maps, no call) and
 *        makes NO Google call — the website is fetched only when the picked card is opened
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards. The Maps call is a fake.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { computeStayPick, markStayPickSeen, scheduleStayPick } from "../services/stay-pick.service";
import { loadWhereToStay } from "../services/where-to-stay.service";
import { readStayPick } from "@shared/stay-pick";
import type { RouteMatrixFetch } from "../services/travel-time-matrix.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `stp-${RUN}-${k}`;
const CITY = `Stayville${RUN}`;
const ids = { owner: id("owner"), other: id("other"), free: id("free"), paid: id("paid"), small: id("small") };
// Two neighbourhoods; the plan's stops sit in "east". 25 hotels in east (more than the budget can score
// against 7 stops: floor(150/7) = 21) plus 3 in "west" (not the plan's neighbourhood).
const EAST = { lat: 35.0, lng: 135.78 };
const WEST = { lat: 35.0, lng: 135.6 };
const STOPS: Array<{ day: number; lat: number; lng: number }> = [
  { day: 1, lat: 35.001, lng: 135.781 },
  { day: 1, lat: 35.002, lng: 135.782 },
  { day: 1, lat: 35.003, lng: 135.783 },
  { day: 2, lat: 34.999, lng: 135.779 },
  { day: 2, lat: 34.998, lng: 135.778 },
  { day: 3, lat: 35.004, lng: 135.784 },
  { day: 3, lat: 35.005, lng: 135.785 },
];
const eastHotel = (i: number) => ({ id: id(`e${String(i).padStart(2, "0")}`), lat: 35.0 + i * 0.0004, lng: 135.78 + i * 0.0004 });

/** A fake matrix: drive minutes per (hotel, stop), and a log of every request's elements. */
function fakeMatrix(minutesFor: (hotelLat: number, hotelLng: number, stopIndex: number) => number | null, opts: { failAfter?: number } = {}) {
  const calls: number[] = [];
  const fetch: RouteMatrixFetch = async (body: any) => {
    if (opts.failAfter !== undefined && calls.length >= opts.failAfter) throw new Error("computeRouteMatrix refused by the Maps billing gate: cap");
    const o = body.origins[0].waypoint.location.latLng;
    assert.equal(body.origins.length, 1, "one hotel per request");
    assert.equal(body.travelMode, "DRIVE");
    calls.push(body.origins.length * body.destinations.length);
    return body.destinations.map((_: unknown, j: number) => {
      const m = minutesFor(o.latitude, o.longitude, j);
      return m === null ? { originIndex: 0, destinationIndex: j, condition: "ROUTE_NOT_FOUND" } : { originIndex: 0, destinationIndex: j, duration: `${m * 60}s`, condition: "ROUTE_EXISTS" };
    });
  };
  return { fetch, calls };
}

async function storedPick(tripId: string) {
  const r: any = await db.execute(sql`SELECT stay_pick FROM trips WHERE id = ${tripId}`);
  return readStayPick((r.rows ?? r)[0]?.stay_pick);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  for (const u of [ids.owner, ids.other]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${u}, ${`${u}@t.test`}, 'SP', 'Fixture', 'user')`);
  }
  await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng)
    VALUES (${id("n-east")}, ${CITY}, 'Japan', 'East', ${id("east")}, ${EAST.lat}, ${EAST.lng}),
           (${id("n-west")}, ${CITY}, 'Japan', 'West', ${id("west")}, ${WEST.lat}, ${WEST.lng})`);
  const expires = new Date(Date.now() + 30 * 86_400_000);
  for (let i = 0; i < 25; i++) {
    const h = eastHotel(i);
    await db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, name, latitude, longitude, city, expires_at)
      VALUES (${h.id}, ${h.id}, 'SPT', ${`East Hotel ${String(i).padStart(2, "0")}`}, ${h.lat}, ${h.lng}, ${CITY}, ${expires})`);
  }
  for (let i = 0; i < 3; i++) {
    await db.execute(sql`INSERT INTO hotel_cache (id, hotel_id, city_code, name, latitude, longitude, city, expires_at)
      VALUES (${id(`w${i}`)}, ${id(`w${i}`)}, 'SPT', ${`West Hotel ${i}`}, ${WEST.lat + i * 0.0003}, ${WEST.lng}, ${CITY}, ${expires})`);
  }
  for (const t of [ids.free, ids.paid, ids.small]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
      VALUES (${t}, ${ids.owner}, 'S1 plan', ${`${CITY}, Japan`}, '2027-05-01', '2027-05-03', 'planning')`);
    let n = 0;
    for (const s of STOPS) {
      await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, item_type, latitude, longitude, origin)
        VALUES (${`${t}-i${n++}`}, ${t}, 'Stop', ${s.day}, 'activity', ${s.lat}, ${s.lng}, 'traveler')`);
    }
    // A stop OUTSIDE the plan's dates (day 9 of a 3-day plan) is never scored against (ruling 1).
    await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, item_type, latitude, longitude, origin)
      VALUES (${`${t}-out`}, ${t}, 'Out of range', 9, 'activity', 35.5, 135.5, 'traveler')`);
  }
  for (const t of [ids.paid, ids.small]) {
    await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${t}-pass`}, ${t}, 'trip_pass', 'active', 'manual')`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`stp-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM hotel_cache WHERE id LIKE ${`stp-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE id LIKE ${`stp-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`stp-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

// Drive minutes: plain distance, except the hotels named fast are made fast.
const byDistance = (fastIds: Set<string> = new Set()) => (lat: number, lng: number, j: number) => {
  const s = STOPS.slice().sort((a, b) => a.day - b.day || a.lat - b.lat || a.lng - b.lng)[j];
  const i = Array.from({ length: 25 }, (_, k) => eastHotel(k)).find((h) => Math.abs(h.lat - lat) < 1e-9 && Math.abs(h.lng - lng) < 1e-9);
  if (i && fastIds.has(i.id)) return 1;
  return 5 + Math.round(Math.hypot(lat - s.lat, lng - s.lng) * 10000);
};

test("SD1 a free plan: no Maps call, and the read is the straight-line top 3", async () => {
  const m = fakeMatrix(byDistance());
  assert.deepEqual(await computeStayPick(ids.free, { fetchMatrix: m.fetch }), { skipped: "free_plan" });
  assert.equal(m.calls.length, 0);
  const view = await loadWhereToStay(ids.free, ids.owner);
  assert.equal(view.eligible, true);
  assert.ok(view.stay && view.stay.tier === "straight_line");
  assert.equal(view.stay.hotels.length, 3);
  for (const h of view.stay.hotels) assert.match(h.id, /-e\d\d$/, "within the top neighbourhood, never the far one");
  assert.equal((view.stay.hotels[0] as any).lat, undefined, "no coordinates on the payload");
});

test("SD2+SD3 a paid plan: 150 elements, whole hotels, pick only from the scored", async () => {
  // The 23rd east hotel in straight-line order would be the fastest of all — but it is past the budget.
  const order = (await import("@shared/stay-pick")).straightLineOrder(
    Array.from({ length: 25 }, (_, k) => ({ kind: "hotel_cache" as const, ...eastHotel(k), name: `East Hotel ${String(k).padStart(2, "0")}` })),
    STOPS.map((s) => ({ dayNumber: s.day, lat: s.lat, lng: s.lng })),
  );
  const unscored = order[22].id;
  const scoredFast = order[7].id;
  const m = fakeMatrix(byDistance(new Set([unscored, scoredFast])));
  const out = await computeStayPick(ids.paid, { fetchMatrix: m.fetch });
  assert.ok("written" in out, JSON.stringify(out));
  assert.equal(m.calls.length, 21, "floor(150 / 7 stops) hotels, one request each");
  assert.ok(m.calls.every((e) => e === 7), "each request is the hotel → every stop on the plan's dates (the day-9 stop excluded)");
  assert.equal(out.elementsSpent, 147);
  const pick = await storedPick(ids.paid);
  assert.ok(pick);
  assert.equal(pick.hotelId, scoredFast, "the routed best among the SCORED hotels");
  assert.notEqual(pick.hotelId, unscored, "never a hotel past the budget");
  assert.equal(pick.scoredCount, 21);
  assert.equal(pick.candidateCount, 25, "candidates are the plan's neighbourhood only — the west hotels are not counted");
  assert.equal(pick.tier, "routed");
  assert.equal(pick.changed, false, "a first pick is not a change");
});

test("SD4 same stops: no call; moved stops: re-score, changed, and only the owner clears it", async () => {
  const again = fakeMatrix(byDistance());
  assert.deepEqual(await computeStayPick(ids.paid, { fetchMatrix: again.fetch }), { skipped: "unchanged" });
  assert.equal(again.calls.length, 0);
  // Move a stop, and make a different scored hotel the fastest.
  await db.execute(sql`UPDATE itinerary_items SET latitude = 35.0012 WHERE id = ${`${ids.paid}-i0`}`);
  const before = await storedPick(ids.paid);
  const other = Array.from({ length: 25 }, (_, k) => eastHotel(k).id).find((h) => h !== before!.hotelId && /-e0[0-3]$/.test(h))!;
  const m = fakeMatrix(byDistance(new Set([other])));
  const out = await scheduleStayPick(ids.paid, { fetchMatrix: m.fetch });
  assert.ok(out && "written" in out);
  const after = await storedPick(ids.paid);
  assert.equal(after!.hotelId, other);
  assert.equal(after!.changed, true);
  assert.equal(await markStayPickSeen(ids.paid, ids.other), false, "a stranger may not clear it");
  assert.equal((await storedPick(ids.paid))!.changed, true);
  assert.equal(await markStayPickSeen(ids.paid, ids.owner), true);
  assert.equal((await storedPick(ids.paid))!.changed, false);
});

test("SD5 a refused call stops the scoring; nothing scored keeps the earlier pick", async () => {
  const m = fakeMatrix(byDistance(), { failAfter: 2 });
  const out = await computeStayPick(ids.small, { fetchMatrix: m.fetch });
  assert.ok("written" in out);
  const pick = await storedPick(ids.small);
  assert.equal(pick!.scoredCount, 2, "two hotels scored before the gate refused");
  assert.equal(pick!.candidateCount, 25);
  await db.execute(sql`UPDATE itinerary_items SET latitude = 35.0013 WHERE id = ${`${ids.small}-i1`}`);
  const none = fakeMatrix(byDistance(), { failAfter: 0 });
  assert.deepEqual(await computeStayPick(ids.small, { fetchMatrix: none.fetch }), { skipped: "nothing_scored" });
  assert.deepEqual(await storedPick(ids.small), pick, "a paused day never erases an answer");
});

test("SD6 the read never computes: the paid view returns the stored pick and makes no Maps call", async () => {
  const usage = async () => Number(((await db.execute(sql`SELECT count(*)::int AS n FROM api_usage_logs WHERE endpoint = 'route_matrix'`)) as any).rows[0].n);
  const n0 = await usage();
  const view = await loadWhereToStay(ids.paid, ids.owner);
  assert.equal(await usage(), n0, "no Maps call on read");
  const stored = await storedPick(ids.paid);
  assert.ok(view.stay && view.stay.tier === "routed");
  assert.equal(view.stay.pick?.id, stored!.hotelId);
  assert.equal(view.stay.scoredCount, stored!.scoredCount);
  assert.equal(view.stay.candidateCount, 25);
  assert.equal(view.stay.changed, false);
  assert.equal((view.stay.pick as any).lat, undefined);
});

test("SD7 the tier test is planGetsRoutedLegs, not a paid optimizer run (ruling 4)", async () => {
  const src = fs.readFileSync(path.join(process.cwd(), "server/services/where-to-stay.service.ts"), "utf8");
  assert.doesNotMatch(src, /hasPaidOptimizerRun/);
  assert.match(src, /tripGetsRoutedLegs/);
  // The Trip Pass plan (no optimizer run at all) is routed; the free plan is not.
  const { tripGetsRoutedLegs } = await import("../services/routing/plan-routed-legs.service");
  assert.equal(await tripGetsRoutedLegs(ids.paid), true);
  assert.equal(await tripGetsRoutedLegs(ids.free), false);
});

test("SD8 FU-S1-1: each stay-pick request records its elements and its dollars on the usage log", async () => {
  const saved = {
    enabled: process.env.MAPS_ROUTE_MATRIX_ENABLED,
    key: process.env.GOOGLE_MAPS_API_KEY,
    cap: process.env.MAPS_ROUTE_MATRIX_DAILY_CAP,
    price: process.env.TRAVEL_MATRIX_ESSENTIALS_PRICE_PER_1000,
  };
  const realFetch = globalThis.fetch;
  process.env.MAPS_ROUTE_MATRIX_ENABLED = "1";
  process.env.GOOGLE_MAPS_API_KEY = "sd8-test-key";
  process.env.MAPS_ROUTE_MATRIX_DAILY_CAP = "100000000";
  process.env.TRAVEL_MATRIX_ESSENTIALS_PRICE_PER_1000 = "5";
  let requests = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    assert.match(String(url), /computeRouteMatrix/);
    requests += 1;
    const body = JSON.parse(init.body);
    const out = body.destinations.map((_: unknown, j: number) => ({ originIndex: 0, destinationIndex: j, duration: `${(10 + j) * 60}s`, condition: "ROUTE_EXISTS" }));
    return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as any;
  try {
    // The small plan holds a pick from SD5; move a stop so it re-scores. A budget of 14 = two hotels.
    await db.execute(sql`UPDATE itinerary_items SET latitude = 35.0014 WHERE id = ${`${ids.small}-i2`}`);
    const out = await computeStayPick(ids.small, { budget: 14 });
    assert.ok("written" in out, JSON.stringify(out));
    assert.equal(requests, 2);
    const r: any = await db.execute(sql`
      SELECT request_count, estimated_cost_cents, success, metadata FROM api_usage_logs
      WHERE provider = 'google_maps' AND endpoint = 'route_matrix' AND metadata->>'ref' = ${ids.small}
      ORDER BY created_at`);
    const rows = r.rows ?? r;
    assert.equal(rows.length, 2, "one gate row per request");
    for (const row of rows) {
      assert.equal(row.request_count, 7, "the elements count against MAPS_ROUTE_MATRIX_DAILY_CAP");
      assert.equal(row.estimated_cost_cents, 35, "7 elements × $5 / 1,000 = 3.5¢ = 35 tenths of a cent");
      assert.equal(row.success, true);
      assert.equal(row.metadata.purpose, "stay_pick");
      assert.equal(row.metadata.costRecordedOn, "api_usage_logs");
      assert.equal(row.metadata.sku, "compute_route_matrix_essentials", "DRIVE bills Essentials");
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of [
      ["MAPS_ROUTE_MATRIX_ENABLED", saved.enabled],
      ["GOOGLE_MAPS_API_KEY", saved.key],
      ["MAPS_ROUTE_MATRIX_DAILY_CAP", saved.cap],
      ["TRAVEL_MATRIX_ESSENTIALS_PRICE_PER_1000", saved.price],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await db.execute(sql`DELETE FROM api_usage_logs WHERE metadata->>'ref' = ${ids.small}`).catch(() => {});
  }
});

test("SD9 FU-S1-2: the list read carries one link per card and makes NO Google call", async () => {
  const keys = ["PLACE_FACTS_PLACES_ENABLED", "GOOGLE_MAPS_API_KEY"] as const;
  const saved = keys.map((k) => process.env[k]);
  const realFetch = globalThis.fetch;
  process.env.PLACE_FACTS_PLACES_ENABLED = "1";
  process.env.GOOGLE_MAPS_API_KEY = "sd9-test-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("no network on list render");
  }) as any;
  try {
    const view = await loadWhereToStay(ids.free, ids.owner);
    assert.ok(view.stay && view.stay.tier === "straight_line");
    assert.equal(view.stay.hotels.length, 3);
    for (const h of view.stay.hotels) {
      assert.equal(h.stayLink?.kind, "maps", h.name);
      assert.match(h.stayLink!.url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=East\+Hotel/);
    }
    assert.equal(calls, 0, "no Google call on list render");
  } finally {
    globalThis.fetch = realFetch;
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
  }
});
