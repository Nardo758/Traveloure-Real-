/**
 * Row 306 (CS-3 brief 10, E): the selection profile, server half, against a real database.
 *
 *   D1 while `selection_profile` is off nothing is written and nothing is read
 *   D2 on: a row carries the action and four coarse fields only (no title, note, point or trip)
 *   D3 a Google point gives no neighbourhood; a non-Google point in a neighbourhood gives its slug
 *   D4 traits are counted from the traveler's own rows; another traveler's rows never count
 *   D5 reset clears the traveler's own rows, and only theirs
 *   D6 the hooks log the plan owner's own actions only; the readers are the planner and paid Optimize
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit server/services/__tests__/selection-profile.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { sql } from "drizzle-orm";

const R = crypto.randomUUID().slice(0, 8);
const ALICE = `sp-alice-${R}`;
const BOB = `sp-bob-${R}`;
const TRIP = `sp-trip-${R}`;
const HOOD = `sp-hood-${R}`;
const CITY = `Sptown${R}`;

let db: any;
let svc: typeof import("../selection-profile.service");
let flags: typeof import("../platform-flags");

async function setFlag(value: string | null) {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'selection_profile'`);
  if (value !== null) {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('selection_profile', ${value})`);
  }
  flags.invalidatePlatformFlagCache("selection_profile");
}
async function rowsFor(userId: string) {
  const r = await db.execute(sql`SELECT * FROM selection_events WHERE user_id = ${userId} ORDER BY created_at`);
  return r.rows as any[];
}

before(async () => {
  db = (await import("../../db")).db;
  svc = await import("../selection-profile.service");
  flags = await import("../platform-flags");
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ALICE}, ${`${ALICE}@example.com`}, 'traveler'), (${BOB}, ${`${BOB}@example.com`}, 'traveler')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${TRIP}, ${ALICE}, 'Selection', ${`${CITY}, Japan`}, '2027-05-01', '2027-05-02', 'draft')`);
  await db.execute(sql`INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng, radius_km)
    VALUES (${HOOD}, ${CITY}, 'Japan', 'Gion', 'gion', 35.0037, 135.7788, 1.5)`);
});

after(async () => {
  if (!db) return;
  await setFlag(null);
  await db.execute(sql`DELETE FROM selection_events WHERE user_id IN (${ALICE}, ${BOB})`);
  await db.execute(sql`DELETE FROM city_neighborhoods WHERE id = ${HOOD}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ALICE}, ${BOB})`);
});

const dinner = { itemType: "meal", startTime: "19:00", estimatedCost: "45.00", currency: "USD", latitude: "35.0040", longitude: "135.7790", coordSource: "osm", title: "SECRET-TITLE" };

test("D1 off: nothing written, nothing read", async () => {
  for (const value of [null, "false", "TRUE", "yes"]) {
    await setFlag(value);
    assert.equal(await svc.selectionProfileOn(), false, String(value));
    assert.equal(await svc.recordSelection({ userId: ALICE, action: "add", tripId: TRIP, item: dinner }), false);
  }
  assert.deepEqual(await rowsFor(ALICE), []);
  await db.execute(sql`INSERT INTO selection_events (id, user_id, action, neighbourhood) VALUES (${`sp-x-${R}`}, ${ALICE}, 'add', 'gion')`);
  assert.deepEqual(await svc.readSelectionTraits(ALICE), [], "off reads nothing even with rows present");
  await db.execute(sql`DELETE FROM selection_events WHERE user_id = ${ALICE}`);
});

test("D2 on: the row is the action and four coarse fields", async () => {
  await setFlag("true");
  assert.equal(await svc.recordSelection({ userId: ALICE, action: "add", tripId: TRIP, item: dinner }), true);
  const [row] = await rowsFor(ALICE);
  assert.deepEqual(
    { action: row.action, stop_type: row.stop_type, neighbourhood: row.neighbourhood, time_of_day: row.time_of_day, price_band: row.price_band },
    { action: "add", stop_type: "meal", neighbourhood: "gion", time_of_day: "evening", price_band: "mid" },
  );
  assert.deepEqual(Object.keys(row).sort(), ["action", "created_at", "id", "neighbourhood", "price_band", "stop_type", "time_of_day", "user_id"]);
  assert.doesNotMatch(JSON.stringify(row), /SECRET-TITLE|35\.004|135\.779/);
});

test("D3 a Google point gives no neighbourhood", async () => {
  await setFlag("true");
  for (const coordSource of [null, "places", "geocode_google"]) {
    await svc.recordSelection({ userId: BOB, action: "add", tripId: TRIP, item: { ...dinner, coordSource } });
  }
  const rows = await rowsFor(BOB);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.neighbourhood === null));
});

test("D4 traits count the traveler's own rows only", async () => {
  await setFlag("true");
  await svc.recordSelection({ userId: ALICE, action: "add", tripId: TRIP, item: dinner });
  await svc.recordSelection({ userId: ALICE, action: "add", tripId: TRIP, item: dinner });
  const traits = await svc.readSelectionTraits(ALICE);
  assert.ok(traits.some((t) => t.field === "neighbourhood" && t.value === "gion" && t.count === 3));
  assert.ok(traits.some((t) => t.field === "timeOfDay" && t.value === "evening"));
  const bobTraits = await svc.readSelectionTraits(BOB);
  assert.equal(bobTraits.some((t) => t.field === "neighbourhood"), false, "Bob's Google points gave no neighbourhood");
});

test("D5 reset clears the traveler's own rows only", async () => {
  await setFlag("true");
  const removed = await svc.resetSelectionProfile(ALICE);
  assert.equal(removed, 3);
  assert.deepEqual(await rowsFor(ALICE), []);
  assert.deepEqual(await svc.readSelectionTraits(ALICE), []);
  assert.equal((await rowsFor(BOB)).length, 3, "another traveler's rows stay");
});

test("D6 the hooks log the owner's own actions; the planner and paid Optimize read the traits", () => {
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  assert.match(routes, /if \(owned && \(!gemWrite \|\| gemWrite\.created\)\) \{\s*const \{ recordSelection \}[^]*?action: "add"/);
  assert.match(routes, /if \(owned\) \{\s*const \{ recordSelection \}[^]*?action: "move"/);
  const trips = fs.readFileSync("server/routes/trips.routes.ts", "utf8");
  assert.match(trips, /if \(await verifyTripOwnership\(tripId, userId\)\) \{\s*const \{ recordSelection \}[^]*?action: "remove"/);
  assert.match(trips, /status === "skipped"[^\n]*verifyTripOwnership\(tripId, userId\)[^]*?action: "skip"/);
  const plancard = fs.readFileSync("server/routes/plancard.routes.ts", "utf8");
  assert.match(plancard, /verifyTripOwnership\(tripId, userId\)\) \{\s*const \{ recordSelection \}[^]*?action: "version_kept"/);
  const content = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  assert.match(content, /void recordSelection\(\{ userId: getUserId\(req\), action: "search" \}\)/);
  assert.match(content, /\+ selectionProfileLine;/, "the planner's prompt reads it");
  const optimizer = fs.readFileSync("server/itinerary-optimizer.ts", "utf8");
  assert.match(optimizer, /\$\{travelerProfileSection\}\$\{selectionProfileSection\}/, "paid Optimize's prompt reads it");
  assert.match(content, /router\.post\("\/api\/me\/selection-profile\/reset", isAuthenticated/);
  assert.match(content, /resetSelectionProfile\(getUserId\(req\)!\)/, "the owner is the session");
});
