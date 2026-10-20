/**
 * SH-1 item 11 — every expert call-to-action reads ONE answer (rulings Q11.1–Q11.3).
 *
 *   EA1 the market answer IS the in-plan hook's answer (switch off, other city, switch on with nobody to ask)
 *   EA2 GET /api/expert-availability: a known city, an unknown city, a blank city and no city all answer a bare
 *       boolean — no expert, no count, no user id — and an unconfigured or empty market answers no
 *   EA3 the path is not under /api/experts/, where `/api/experts/:id` would answer it first
 *
 * Negative space (as in fb1-expert-hook): a market that answers YES needs a routable, byline-eligible expert fixture
 * (Identity, Connect, a verified neighbourhood). That answer is the chooser's own (`chooserHasExperts`), proven by its
 * suites; the client's reading of a yes is proven in `client/src/lib/__tests__/sh1-expert-availability.test.ts`.
 *
 * DISPOSABLE DB ONLY. The setting is restored to what it was.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[sh1-expert-availability] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { expertHookForTrip, expertAvailabilityForMarket, anyMarketHasExperts } = await import("../services/expert-hook.service");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { EXPERT_HOOK_CITIES_SETTING } = await import("@shared/expert-hook");
const { default: doorRouter, resetExpertAvailabilityCache } = await import("../routes/expert-door.routes");

const RUN = crypto.randomUUID().slice(0, 8);
const OWNER = `sh1ea-${RUN}-owner`;
const TRIP = `sh1ea-${RUN}-trip`;
let prior: string | null = null;

async function setCities(value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${EXPERT_HOOK_CITIES_SETTING}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${EXPERT_HOOK_CITIES_SETTING}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(EXPERT_HOOK_CITIES_SETTING);
  resetExpertAvailabilityCache();
}

before(async () => {
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${EXPERT_HOOK_CITIES_SETTING}`);
  prior = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES (${OWNER}, ${`${OWNER}@t.test`}, 'Ea', 'One')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, start_date, end_date)
    VALUES (${TRIP}, ${OWNER}, 'Kyoto days', 'Kyoto, Japan', 'kyoto', '2027-05-01', '2027-05-03')`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM trips WHERE id = ${TRIP}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${OWNER}`);
    await setCities(prior);
  } finally {
    await pool.end();
  }
});

test("EA1: the market answer is the in-plan hook's answer", async () => {
  for (const value of [null, '["tokyo"]', '["kyoto"]']) {
    await setCities(value);
    const hook = await expertHookForTrip(TRIP, OWNER);
    const market = await expertAvailabilityForMarket("kyoto");
    assert.deepEqual(market, { switchOn: hook!.switchOn, canAsk: hook!.canAsk }, `setting ${value}`);
  }
  assert.deepEqual(await expertAvailabilityForMarket(null), { switchOn: false, canAsk: false });
  await setCities(null);
  assert.equal(await anyMarketHasExperts(), false, "no switched-on market ⇒ no");
});

test("EA2: the route answers a bare boolean, and no for an unknown, blank, unconfigured or empty market", async () => {
  const app = express();
  app.use(doorRouter);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ask = async (q: string) => {
      const res = await fetch(`${base}/api/expert-availability${q}`);
      assert.equal(res.status, 200);
      return res.json();
    };
    await setCities(null);
    assert.deepEqual(await ask("?city=Kyoto"), { available: false }, "switch off");
    await setCities('["kyoto"]');
    const kyoto = await ask("?city=Kyoto");
    assert.deepEqual(Object.keys(kyoto), ["available"], "nothing but the boolean");
    assert.equal(kyoto.available, (await expertAvailabilityForMarket("kyoto")).canAsk, "the route reads the one rule");
    assert.equal(kyoto.available, false, "the CI database has nobody in Kyoto's chooser");
    assert.deepEqual(await ask("?city=Atlantis"), { available: false }, "unknown city");
    assert.deepEqual(await ask("?city=%20%20"), { available: false }, "blank city is the any-market question, which answers no here");
    assert.deepEqual(await ask(""), { available: await anyMarketHasExperts() }, "no city = any live market");
  } finally {
    server.close();
  }
});

test("EA3: the path is not under /api/experts/", () => {
  const src = readFileSync("server/routes/expert-door.routes.ts", "utf8");
  assert.match(src, /router\.get\("\/api\/expert-availability"/);
  const client = readFileSync("client/src/lib/expert-availability.ts", "utf8");
  assert.match(client, /EXPERT_AVAILABILITY_ROUTE = "\/api\/expert-availability"/);
});
