/**
 * GET /api/concierge/availability — the old concierge's switch, read publicly (ledger
 * `2026-10-18-legacy-concierge-hidden`).
 *
 *   LA1 no row ⇒ { enabled: false }
 *   LA2 "true" ⇒ { enabled: true }
 *   LA3 "false" or any other value ⇒ { enabled: false }
 *   LA4 the body carries `enabled` and nothing else
 *
 * DISPOSABLE DB ONLY. The row is restored to what it was before the run. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/legacy-concierge-availability.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[legacy-concierge-availability] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { default: conciergeRoutes } = await import("../routes/concierge.routes");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { LEGACY_CONCIERGE_SETTING } = await import("@shared/legacy-concierge");

let prior: string | null = null;

async function setValue(value: string | null) {
  if (value === null) {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${LEGACY_CONCIERGE_SETTING}`);
  } else {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at)
      VALUES (${LEGACY_CONCIERGE_SETTING}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  }
  invalidatePlatformFlagCache(LEGACY_CONCIERGE_SETTING);
}

async function read(): Promise<any> {
  const app = express();
  app.use(conciergeRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/concierge/availability`);
    assert.equal(res.status, 200);
    return await res.json();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

before(async () => {
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${LEGACY_CONCIERGE_SETTING}`);
  prior = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
});

after(async () => {
  try {
    await setValue(prior);
  } finally {
    await pool.end();
  }
});

test("LA1 no row reads off", async () => {
  await setValue(null);
  assert.deepEqual(await read(), { enabled: false });
});

test("LA2 'true' reads on", async () => {
  await setValue("true");
  assert.deepEqual(await read(), { enabled: true });
});

test("LA3 'false' or any other value reads off", async () => {
  for (const v of ["false", "yes", "TRUE", ""]) {
    await setValue(v);
    assert.deepEqual(await read(), { enabled: false }, `'${v}' reads off`);
  }
});

test("LA4 the body carries enabled and nothing else", async () => {
  await setValue("true");
  assert.deepEqual(Object.keys(await read()), ["enabled"]);
});
