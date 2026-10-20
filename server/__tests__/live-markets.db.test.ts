/**
 * SH-1 item 3 (ledger `2026-10-19-sh1-banned-copy`): `GET /api/public/live-markets` answers `{ marketKeys }` from
 * `beta_market_slugs` — the ONE live-city list — and nothing else.
 *
 *   LV1 with no stored list it is the launch market alone (one city ⇒ the homepage rail stays hidden)
 *   LV2 a stored list is answered as stored
 *   LV3 the answer carries only `marketKeys`, and is cached briefly (Cache-Control) — a reset re-reads it
 *
 * DISPOSABLE DB ONLY: both settings are restored to what they were.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[live-markets] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const tickerModule = await import("../routes/ticker.routes");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { LIVE_MARKETS_ROUTE } = await import("@shared/live-markets");
const { BETA_MARKET_SLUGS_SETTING } = await import("@shared/ticker");
const { LAUNCH_MARKET_SLUG_SETTING } = await import("@shared/launch-signup");

const prior = new Map<string, string | null>();

async function setValue(key: string, value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(key);
  tickerModule.resetLiveMarketsCache();
}

async function call() {
  const layer = (tickerModule.default as any).stack.find((l: any) => l.route?.path === LIVE_MARKETS_ROUTE && l.route?.methods?.get);
  assert.ok(layer, "the route is registered");
  const res: any = {
    headers: {} as Record<string, string>,
    body: null,
    set(k: string, v: string) { this.headers[k] = v; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  await layer.route.stack.at(-1).handle({} as any, res);
  return res;
}

before(async () => {
  for (const key of [BETA_MARKET_SLUGS_SETTING, LAUNCH_MARKET_SLUG_SETTING]) {
    const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
    prior.set(key, r.rows.length ? String((r.rows[0] as any).setting_value) : null);
  }
});

after(async () => {
  try {
    for (const [key, value] of prior) await setValue(key, value);
  } finally {
    await pool.end();
  }
});

test("LV1 no stored list ⇒ the launch market alone", async () => {
  await setValue(LAUNCH_MARKET_SLUG_SETTING, "kyoto");
  await setValue(BETA_MARKET_SLUGS_SETTING, null);
  assert.deepEqual((await call()).body, { marketKeys: ["kyoto"] });
});

test("LV2 a stored list is answered as stored", async () => {
  await setValue(LAUNCH_MARKET_SLUG_SETTING, "kyoto");
  await setValue(BETA_MARKET_SLUGS_SETTING, JSON.stringify(["kyoto", "porto"]));
  assert.deepEqual((await call()).body, { marketKeys: ["kyoto", "porto"] });
});

test("LV3 only marketKeys, cached briefly, and a reset re-reads", async () => {
  await setValue(BETA_MARKET_SLUGS_SETTING, JSON.stringify(["kyoto", "goa"]));
  const first = await call();
  assert.deepEqual(Object.keys(first.body), ["marketKeys"]);
  assert.match(first.headers["Cache-Control"], /max-age=60/);
  await db.execute(sql`UPDATE platform_settings SET setting_value = ${JSON.stringify(["kyoto"])} WHERE setting_key = ${BETA_MARKET_SLUGS_SETTING}`);
  invalidatePlatformFlagCache(BETA_MARKET_SLUGS_SETTING);
  assert.deepEqual((await call()).body, { marketKeys: ["kyoto", "goa"] }, "served from the cache within the window");
  tickerModule.resetLiveMarketsCache();
  assert.deepEqual((await call()).body, { marketKeys: ["kyoto"] });
});
