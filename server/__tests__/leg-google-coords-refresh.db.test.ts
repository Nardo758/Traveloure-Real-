/**
 * R313 — the daily refresh-or-clear of Google coordinates on legs (ledger
 * `2026-10-04-leg-google-coords-refresh`; R311 — LD 57 extends to transport_legs).
 *
 *   J1  a plan is a candidate only when it holds a Google-sourced leg within a day of the max age (or
 *       with no fetch time); a fresh Google leg and an item-sourced leg are not
 *   J2  REFRESH: with a live Google point for the stay (the relookup recorded one), the job re-routes —
 *       both end legs are rebuilt from the new point with a new `coord_fetched_at`; nothing is cleared
 *   J3  CLEAR: with only an EXPIRED fact (and a relookup that fails), the stay has no point — an expired
 *       fact is never a pin — and every Google leg past the max age is deleted; the author's own legs
 *       are untouched
 *   J4  a second run the same day finds nothing due (idempotent)
 *   J5  a failed candidate scan is an `error` and touches nothing
 *   J6  registration: `leg-google-coords` is on the daily `JOB_CADENCE` roster, its internal route runs
 *       the job through `runJob` with the scan error as the failure test, and the cron script's daily
 *       bucket posts it
 *   J7  step 9b D10: a cleared ROUTING-ENGINE leg on a qualifying plan whose trip has not ended is
 *       queued for ONE recompute, and the engine rebuilds it after the debounce
 *   J8  step 9b D10: the same on a PAST trip — the legs go and nothing recomputes
 *
 * NEGATIVE SPACE (§18d): the relookup is injected (no Places call; `enrichPlanItems` is the place-facts
 * suite's to prove); leg durations come from the travel-time service's offline estimate, so only shape,
 * points and fetch times are asserted. J6 pins the registration by source; the route's 401 is
 * `internal-jobs-auth.http.test.ts`'s and the cron posting is `post-internal-jobs.test.sh`'s.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/leg-google-coords-refresh.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_leg_google_coords";
// The ONE travel-time service, on with no Google key: legs resolve to its labelled straight-line
// estimate, offline.
process.env.TRAVEL_TIME_SERVICE_ENABLED = "1";
// Step 9b J7/J8: the routing engine's recompute runs on the CI stub (no network, no Maps gate).
process.env.ROUTING_ADAPTER_STUB = "1";
delete process.env.GOOGLE_MAPS_API_KEY;
delete process.env.LEG_GOOGLE_COORD_MAX_AGE_DAYS;
const { db } = await import("../db");
const { rerouteCopyForStay, stayPointForPlan } = await import("../services/stay-reroute.service");
const { runLegGoogleCoordsRefresh, defaultLegGoogleCoordsDeps } = await import("../jobs/legGoogleCoordsRefresh");
const { hasPendingPlanLegRecompute } = await import("../services/routing/plan-legs-queue");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `lgc-${RUN}-owner`,
  copy: `lgc-${RUN}-copy`,
  other: `lgc-${RUN}-other`,
  hotel1: `lgc-${RUN}-hotel1`,
  hotel2: `lgc-${RUN}-hotel2`,
  a: `lgc-${RUN}-a`,
  b: `lgc-${RUN}-b`,
  stay: `lgc-${RUN}-stay`,
  legHA: `lgc-${RUN}-ha`,
  legAB: `lgc-${RUN}-ab`,
  legBH: `lgc-${RUN}-bh`,
  otherLeg: `lgc-${RUN}-otherleg`,
  live: `lgc-${RUN}-live`,
  past: `lgc-${RUN}-past`,
};
const DAY = 86_400_000;

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
    throw new Error(`[leg-google-coords] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function legs(tripId: string): Promise<any[]> {
  return (await db.execute(sql`SELECT * FROM transport_legs WHERE trip_id = ${tripId} ORDER BY day_number, leg_order`)).rows as any[];
}

async function stayFact(lat: number, lng: number, fetchedDaysAgo: number, expiresInDays: number): Promise<void> {
  await db.execute(sql`DELETE FROM place_facts WHERE itinerary_item_id = ${ids.stay}`);
  await db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, fetched_at, expires_at, plan_id, itinerary_item_id)
    VALUES (${`${ids.stay}-loc-${crypto.randomUUID().slice(0, 6)}`}, 'place_id', 'ChIJ-lgc', 'lodging', 'location', ${JSON.stringify({ lat, lng })}::jsonb,
      'places_api', now() - make_interval(secs => ${fetchedDaysAgo * 86400}), now() + make_interval(secs => ${expiresInDays * 86400}), ${ids.copy}, ${ids.stay})`);
}

const leg = (id: string, trip: string, day: number, order: number, from: string, to: string, mode: string, origin: string | null) =>
  db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status, user_selected_mode, origin)
    VALUES (${id}, ${trip}, ${day}, ${order}, ${from}, 'f', 35.0, 135.7, ${to}, 't', 35.01, 135.71, 900, '0.9 km', 'walk',
      12, 'confirmed', ${mode}, ${origin})`);

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ids.owner}, ${`${ids.owner}@t.test`}, 'LGC', 'traveler', 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status) VALUES
    (${ids.copy}, ${ids.owner}, 'LGC copy', 'Kyoto, Japan', '2026-11-04', '2026-11-05', 'draft'),
    (${ids.other}, ${ids.owner}, 'LGC other', 'Kyoto, Japan', '2026-11-04', '2026-11-05', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, origin) VALUES
    (${ids.hotel1}, ${ids.copy}, 'Author Ryokan', 'accommodation', 1, 0, 35.000, 135.770, 'expert'),
    (${ids.a}, ${ids.copy}, 'Kiyomizu-dera', 'activity', 1, 1, 34.9949, 135.7850, 'expert'),
    (${ids.b}, ${ids.copy}, 'Ginkaku-ji', 'activity', 2, 0, 35.0270, 135.7982, 'expert'),
    (${ids.hotel2}, ${ids.copy}, 'Author Ryokan', 'accommodation', 2, 1, 35.000, 135.770, 'expert'),
    (${ids.stay}, ${ids.copy}, 'Hotel Granvia Kyoto', 'accommodation', 1, 9, NULL, NULL, 'traveler')`);
  await leg(ids.legHA, ids.copy, 1, 0, ids.hotel1, ids.a, "taxi", "author_pick");
  await leg(ids.legAB, ids.copy, 1, 1, ids.a, ids.b, "walk", "author_pick");
  await leg(ids.legBH, ids.copy, 2, 0, ids.b, ids.hotel2, "train", "author_pick");
  // The stay's only point is a Google fact fetched 29.5 days ago; the re-route records it on both end legs.
  await stayFact(34.985, 135.7588, 29.5, 0.5);
  assert.deepEqual(await rerouteCopyForStay(ids.copy), { rerouted: 2, removed: 2 });
  // A second plan whose Google leg was fetched yesterday — not due.
  await leg(ids.otherLeg, ids.other, 1, 0, "x", "y", "walk", "rerouted_for_stay");
  await db.execute(sql`UPDATE transport_legs SET coord_source = 'google', coord_fetched_at = now() - interval '1 day' WHERE id = ${ids.otherLeg}`);
});

after(async () => {
  await db.execute(sql`DELETE FROM place_facts WHERE plan_id IN (${ids.copy}, ${ids.other})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${ids.live}, ${ids.past})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.copy}, ${ids.other}, ${ids.live}, ${ids.past})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.owner}`);
});

const googleLegs = async (tripId: string) => (await legs(tripId)).filter((l) => l.coord_source === "google");

test("J1: only a plan with a Google leg within a day of the max age is a candidate", async () => {
  const g = await googleLegs(ids.copy);
  assert.equal(g.length, 2, "the fixture re-route recorded both end legs as Google-sourced");
  const dueBefore = new Date(Date.now() - 29 * DAY);
  const found = await defaultLegGoogleCoordsDeps.candidates(dueBefore);
  assert.ok(found.includes(ids.copy));
  assert.ok(!found.includes(ids.other), "a Google leg fetched yesterday is not due");
});

test("J2: refresh — a live point rebuilds both end legs with a new fetch time; nothing cleared", async () => {
  const before = (await googleLegs(ids.copy)).map((l) => l.id).sort();
  const result = await runLegGoogleCoordsRefresh(new Date(), {
    ...defaultLegGoogleCoordsDeps,
    candidates: async (d) => (await defaultLegGoogleCoordsDeps.candidates(d)).filter((t) => t === ids.copy),
    relookupStay: async () => stayFact(34.9861, 135.7591, 0, 30),
  });
  assert.deepEqual(result, { checked: 1, refreshed: 1, cleared: 0, failed: 0, recomputeQueued: 0 });
  const after = await googleLegs(ids.copy);
  assert.equal(after.length, 2);
  assert.ok(after.every((l) => !before.includes(l.id)), "both Google legs were rebuilt");
  assert.ok(after.every((l) => Date.now() - new Date(l.coord_fetched_at).getTime() < 5 * 60_000), "a new fetch time");
  assert.ok(after.some((l) => Number(l.from_lat).toFixed(4) === "34.9861"), "from the refreshed point");
  assert.equal((await legs(ids.copy)).find((l) => l.id === ids.legAB)?.origin, "author_pick", "the middle leg is the author's");
});

test("J3: clear — an expired fact is never a pin, and a Google leg past the max age is deleted", async () => {
  await stayFact(34.9861, 135.7591, 31, -1);
  await db.execute(sql`UPDATE transport_legs SET coord_fetched_at = now() - interval '31 days' WHERE trip_id = ${ids.copy} AND coord_source = 'google'`);
  assert.equal(await stayPointForPlan(ids.copy), null, "the expired fact gives the stay no point");
  const result = await runLegGoogleCoordsRefresh(new Date(), {
    ...defaultLegGoogleCoordsDeps,
    candidates: async (d) => (await defaultLegGoogleCoordsDeps.candidates(d)).filter((t) => t === ids.copy),
    relookupStay: async () => {
      throw new Error("Places unavailable");
    },
  });
  assert.deepEqual(result, { checked: 1, refreshed: 0, cleared: 2, failed: 0, recomputeQueued: 0 });
  assert.equal((await googleLegs(ids.copy)).length, 0);
  assert.deepEqual((await legs(ids.copy)).map((l) => l.id), [ids.legAB], "only the author's middle leg remains");
});

test("J4: a second run finds nothing due", async () => {
  const result = await runLegGoogleCoordsRefresh(new Date(), {
    ...defaultLegGoogleCoordsDeps,
    candidates: async (d) => (await defaultLegGoogleCoordsDeps.candidates(d)).filter((t) => t === ids.copy),
  });
  assert.deepEqual(result, { checked: 0, refreshed: 0, cleared: 0, failed: 0, recomputeQueued: 0 });
});

test("J5: a failed candidate scan is an error and touches nothing", async () => {
  const before = (await legs(ids.other)).length;
  const result = await runLegGoogleCoordsRefresh(new Date(), {
    ...defaultLegGoogleCoordsDeps,
    candidates: async () => {
      throw new Error("db down");
    },
  });
  assert.deepEqual(result, { checked: 0, refreshed: 0, cleared: 0, failed: 0, recomputeQueued: 0, error: "db down" });
  assert.equal((await legs(ids.other)).length, before);
});

test("J6: the job is registered daily — roster, route and cron bucket", async () => {
  const { JOB_CADENCE } = await import("../routes/internal.routes");
  assert.deepEqual(JOB_CADENCE.filter((j) => j.job === "leg-google-coords"), [
    { job: "leg-google-coords", expectedIntervalSec: 86_400, bucket: "daily" },
  ]);
  const routes = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/internal.routes.ts"), "utf8");
  assert.match(
    routes,
    /router\.post\("\/internal\/jobs\/leg-google-coords", requireInternalSecret,[\s\S]{0,120}runJob\("leg-google-coords", \(\) => runLegGoogleCoordsRefresh\(\), \(r\) => !!r\?\.error\)/,
  );
  const cron = fs.readFileSync(path.resolve(import.meta.dirname, "../../scripts/ci/post-internal-jobs.sh"), "utf8");
  assert.match(cron, /\["daily"\]="[^"]*\bleg-google-coords\b/);
});

// ── Step 9b D10 (ledger `2026-10-07-step9b-optimizer-and-rechecks`) ──────────────────────────────────
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

/** A Trip Pass plan (it earns routed legs) with two located stops and ONE expired Google engine leg. */
async function engineFixture(tripId: string, startOffset: number, endOffset: number): Promise<void> {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${tripId}, ${ids.owner}, 'LGC engine', 'Kyoto, Japan', ${isoDay(startOffset)}, ${isoDay(endOffset)}, 'draft')`);
  await db.execute(sql`INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source) VALUES (${`${tripId}-pass`}, ${tripId}, 'trip_pass', 'active', 'manual')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, latitude, longitude, start_time, origin) VALUES
    (${`${tripId}-a`}, ${tripId}, 'Kiyomizu-dera', 'activity', 1, 0, 34.9949, 135.7850, '09:00', 'traveler'),
    (${`${tripId}-b`}, ${tripId}, 'Ginkaku-ji', 'activity', 1, 1, 35.0270, 135.7982, '12:00', 'traveler')`);
  await db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order, from_activity_id, from_name, from_lat, from_lng,
      to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display, recommended_mode,
      estimated_duration_minutes, proposal_status, source, coord_source, coord_fetched_at)
    VALUES (${`${tripId}-leg`}, ${tripId}, 1, 1, ${`${tripId}-a`}, 'Kiyomizu-dera', 34.9949, 135.7850, ${`${tripId}-b`}, 'Ginkaku-ji', 35.0270, 135.7982,
      3700, '3.7 km', 'transit', 20, 'proposed', 'stub', 'google', now() - interval '31 days')`);
}

const onlyPlan = (tripId: string) => ({
  ...defaultLegGoogleCoordsDeps,
  candidates: async () => [tripId],
  relookupStay: async () => undefined,
  reroute: async () => undefined,
});

test("J7: D10 — a cleared engine leg on a live qualifying plan is queued once and rebuilt", async () => {
  await engineFixture(ids.live, 1, 3);
  const result = await runLegGoogleCoordsRefresh(new Date(), onlyPlan(ids.live));
  assert.deepEqual(result, { checked: 1, refreshed: 0, cleared: 1, failed: 0, recomputeQueued: 1 });
  assert.equal(hasPendingPlanLegRecompute(ids.live), true, "one recompute is queued");
  await new Promise((r) => setTimeout(r, 3_000));
  const rebuilt = await legs(ids.live);
  assert.equal(rebuilt.length, 1, "the engine rebuilt the cleared pair");
  assert.equal(rebuilt[0].source, "stub");
  assert.notEqual(rebuilt[0].id, `${ids.live}-leg`);
  assert.equal(rebuilt[0].coord_source, null, "the rebuilt leg's points are the items' own, not a Google fact");
});

test("J8: D10 — on a past trip the legs go and nothing recomputes", async () => {
  await engineFixture(ids.past, -5, -2);
  const result = await runLegGoogleCoordsRefresh(new Date(), onlyPlan(ids.past));
  assert.deepEqual(result, { checked: 1, refreshed: 0, cleared: 1, failed: 0, recomputeQueued: 0 });
  assert.equal(hasPendingPlanLegRecompute(ids.past), false);
  await new Promise((r) => setTimeout(r, 2_500));
  assert.equal((await legs(ids.past)).length, 0, "nothing came back");
});
