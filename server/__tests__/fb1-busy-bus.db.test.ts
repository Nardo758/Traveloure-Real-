/**
 * FB-1 step 5d (ledger `2026-10-19-fb1-busy-bus`), on a real database.
 *
 * A Kyoto plan Sat 2027-03-20 → Tue 2027-03-23, dates confirmed: Mar 21 is a national holiday, Mar 22 its substitute.
 *   BBD1 the holidays are flagged "national holiday"; the Saturday is not, with no season window entered
 *   BBD2 with `season_windows_kyoto` covering it, the Saturday reads "peak season weekend"
 *   BBD3 the same plan with unconfirmed dates gets no flag (ruling 4); a non-Kyoto plan gets none
 *   BBD4 the plancard read carries `busyBus` on exactly the flagged days
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_fb1_busy";
const { db, pool } = await import("../db");
const { busyBusForTrip } = await import("../services/busy-bus.service");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `fb1b-${RUN}-${s}`;
const owner = id("owner");
const kyoto = id("kyoto");
const unconfirmed = id("unconf");
const goa = id("goa");
const KEY = "season_windows_kyoto";
let priorWindows: string | null = null;

async function seed(tripId: string, market: string, destination: string, confirmed: boolean) {
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date, status, timezone, dates_confirmed_at)
    VALUES (${tripId}, ${owner}, 'FB-1 busy', ${destination}, ${market}, '2027-03-20', '2027-03-23', 'draft', 'Asia/Tokyo', ${confirmed ? sql`NOW()` : null})`);
}
const reasons = async (tripId: string) => {
  const m = await busyBusForTrip(tripId);
  for (const v of m.values()) assert.equal(v.cityName, "Kyoto", "the market's city name from data");
  return Object.fromEntries([...m].map(([d, v]) => [d, v.reason]));
};

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  const prior = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${KEY}`);
  priorWindows = (prior.rows[0] as any)?.setting_value ?? null;
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${KEY}`);
  invalidatePlatformFlagCache(KEY);
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${owner}, ${`${owner}@t.test`}, 'traveler')`);
  await seed(kyoto, "kyoto", "Kyoto, Japan", true);
  await seed(unconfirmed, "kyoto", "Kyoto, Japan", false);
  await seed(goa, "goa", "Goa, India", true);
});

after(async () => {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${KEY}`).catch(() => {});
  if (priorWindows !== null) await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${KEY}, ${priorWindows})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${kyoto}, ${unconfirmed}, ${goa})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${owner}`).catch(() => {});
  await pool.end();
});

test("BBD1 holidays flagged; the Saturday is not without a window", async () => {
  assert.deepEqual(await reasons(kyoto), { 2: "national holiday", 3: "national holiday" });
});

test("BBD2 a season window makes the Saturday a peak season weekend", async () => {
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${KEY}, '[{"from":"2027-03-15","to":"2027-04-10"}]')`);
  invalidatePlatformFlagCache(KEY);
  assert.deepEqual(await reasons(kyoto), { 1: "peak season weekend", 2: "national holiday", 3: "national holiday" });
});

test("BBD3 unconfirmed dates and a non-Kyoto plan get no flag", async () => {
  assert.deepEqual(await reasons(unconfirmed), {});
  assert.deepEqual(await reasons(goa), {});
  assert.deepEqual(await reasons(id("missing")), {});
});

test("BBD4 the plancard read carries busyBus per day", () => {
  const src = fs.readFileSync(new URL("../routes/plancard.routes.ts", import.meta.url), "utf8");
  assert.match(src, /const busyBus = await busyBusForTrip\(tripId\)/);
  assert.match(src, /busyBus\.get\(d\.dayNumber\) \? \{ busyBus: busyBus\.get\(d\.dayNumber\) \} : \{\}/);
});
