/**
 * FB-1 expert hook — the server half (ledger `2026-10-18-fb1-expert-hook`).
 *
 *   E1 not the owner (or signed out) ⇒ no hook at all
 *   E2 the owner of a free Kyoto plan, switch off (no row, or a list without Kyoto) ⇒ switch off, no button
 *   E3 switch on, nobody in Kyoto's chooser ⇒ switch on, no button (`canAsk` false — the server's check)
 *   E4 the admin PATCH refuses an unknown or repeated market for expert_hook_cities; a valid list is stored
 *   E5 the in-season count is empty until FB-1 step 8 — nothing to draw
 *
 * Negative space: a chooser WITH someone in it needs a routable, byline-eligible expert fixture (Identity, Connect,
 * a verified neighbourhood); `canAsk` true is proven through the pure rule and the chooser's own suites, not here.
 *
 * DISPOSABLE DB ONLY. The setting is restored to what it was. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/fb1-expert-hook.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[fb1-expert-hook] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { expertHookForTrip, inSeasonAdditionsForTrip } = await import("../services/expert-hook.service");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { EXPERT_HOOK_CITIES_SETTING, expertHookCitiesRefusal } = await import("@shared/expert-hook");

const RUN = crypto.randomUUID().slice(0, 8);
const OWNER = `fb1h-${RUN}-owner`;
const OTHER = `fb1h-${RUN}-other`;
const TRIP = `fb1h-${RUN}-trip`;
let prior: string | null = null;

async function setCities(value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${EXPERT_HOOK_CITIES_SETTING}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${EXPERT_HOOK_CITIES_SETTING}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(EXPERT_HOOK_CITIES_SETTING);
}

before(async () => {
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${EXPERT_HOOK_CITIES_SETTING}`);
  prior = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  for (const id of [OWNER, OTHER]) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${id}, ${`${id}@t.test`}, 'Fb', 'One')`);
  }
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date)
    VALUES (${TRIP}, ${OWNER}, 'Kyoto days', 'Kyoto, Japan', 'kyoto', '2027-05-01', '2027-05-03')`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${OWNER}, ${OTHER})`);
    await setCities(prior);
  } finally {
    await pool.end();
  }
});

test("E1 not the owner, or signed out: no hook", async () => {
  await setCities('["kyoto"]');
  assert.equal(await expertHookForTrip(TRIP, OTHER), null);
  assert.equal(await expertHookForTrip(TRIP, null), null);
});

test("E2 switch off: no row, or a list without Kyoto", async () => {
  await setCities(null);
  assert.deepEqual(await expertHookForTrip(TRIP, OWNER), { switchOn: false, cityName: "Kyoto", canAsk: false });
  await setCities('["tokyo"]');
  const h = await expertHookForTrip(TRIP, OWNER);
  assert.equal(h?.switchOn, false);
  assert.equal(h?.canAsk, false);
});

test("E3 switch on with nobody in the chooser: no button", async () => {
  await setCities('["kyoto"]');
  const h = await expertHookForTrip(TRIP, OWNER);
  assert.equal(h?.switchOn, true);
  assert.equal(h?.cityName, "Kyoto");
  // The CI database has no routable, byline-eligible Kyoto expert, so the chooser is empty.
  assert.equal(h?.canAsk, false);
});

test("E4 the admin PATCH validation for expert_hook_cities", async () => {
  assert.match(expertHookCitiesRefusal('["nowhere"]')!, /unknown market/);
  assert.match(expertHookCitiesRefusal('["kyoto","kyoto"]')!, /duplicate market/);
  assert.equal(expertHookCitiesRefusal('["kyoto"]'), null);
  const fs = await import("node:fs");
  const admin = fs.readFileSync("server/routes/admin.routes.ts", "utf8");
  assert.match(admin, /if \(settingKey === EXPERT_HOOK_CITIES_SETTING\) \{\s*const refusal = expertHookCitiesRefusal\(settingValue\);/);
});

test("E5 the in-season count is empty until step 8", async () => {
  assert.equal((await inSeasonAdditionsForTrip(TRIP)).size, 0);
});
