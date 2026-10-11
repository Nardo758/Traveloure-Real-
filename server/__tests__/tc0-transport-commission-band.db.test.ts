/**
 * TC-0 (ledger `2026-10-10-tc0-transport-commission-band`; LD 8): the transport platform commission is a
 * fee band, never a code literal.
 *   T1 absent band ⇒ the declared fallback 0 (no commission claimed); no booking_fee_configs read
 *   T2 the band's value is the rate; an inactive band reads as absent
 *   T3 migration 367 is insert-if-missing: a second run changes nothing, an admin-tuned row is kept
 *   T4 the route-search partners' margin is ONE band (6%), fallback 0 — no per-partner literal left
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/tc0-transport-commission-band.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_tc0";
const { db } = await import("../db");
const { resolveTransportCommissionRate, resolveAffiliateTransportMargin } = await import("../services/transport-booking-options.service");
const { TRANSPORT_PLATFORM_COMMISSION_BAND, AFFILIATE_TRANSPORT_MARGIN_BAND, declaredFallbackValue } = await import("../services/fee-band-requirements");

const KEY = TRANSPORT_PLATFORM_COMMISSION_BAND;
const AFF = AFFILIATE_TRANSPORT_MARGIN_BAND;
const MIGRATION = fs.readFileSync(path.join(process.cwd(), "server/migrations/367_transport_fee_bands.sql"), "utf8");
let saved: any[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
before(async () => {
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
    } catch {
      return "<none>";
    }
  })();
  if (!DISPOSABLE_HOSTS.has(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error(`[tc0] REFUSING to write fixtures to '${host}'.`);
  saved = (await db.execute(sql`SELECT * FROM fee_bands WHERE band_key IN (${KEY}, ${AFF})`)).rows as any[];
  await db.execute(sql`DELETE FROM fee_bands WHERE band_key IN (${KEY}, ${AFF})`);
});

after(async () => {
  await db.execute(sql`DELETE FROM fee_bands WHERE band_key IN (${KEY}, ${AFF})`);
  for (const r of saved) {
    await db.execute(sql`INSERT INTO fee_bands (band_key, rate_type, default_rate, display_name, description, is_active)
      VALUES (${r.band_key}, ${r.rate_type}, ${r.default_rate}, ${r.display_name}, ${r.description}, ${r.is_active})`);
  }
});

test("T1: no band ⇒ the declared fallback 0 — never the old 10% literal", async () => {
  assert.equal(declaredFallbackValue(KEY), 0);
  assert.equal(await resolveTransportCommissionRate(), 0);
  assert.equal(declaredFallbackValue(AFF), 0);
  assert.equal(await resolveAffiliateTransportMargin(), 0, "no per-partner default left");
});

test("T2: the band is the rate; inactive reads as absent", async () => {
  await db.execute(sql.raw(MIGRATION));
  assert.equal(await resolveTransportCommissionRate(), 0.1);
  await db.execute(sql`UPDATE fee_bands SET default_rate = 0.07 WHERE band_key = ${KEY}`);
  assert.equal(await resolveTransportCommissionRate(), 0.07);
  await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = ${KEY}`);
  assert.equal(await resolveTransportCommissionRate(), 0);
  await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = ${KEY}`);
});

test("T3: migration 367 is insert-if-missing — the admin-tuned 7% survives a re-run", async () => {
  await db.execute(sql.raw(MIGRATION));
  const rows = (await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS r FROM fee_bands WHERE band_key = ${KEY}`)).rows as any[];
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].r), 0.07);
});

test("T4: the route-search margin is one band — 6% from 367, admin-editable", async () => {
  assert.equal(await resolveAffiliateTransportMargin(), 0.06);
  await db.execute(sql`UPDATE fee_bands SET default_rate = 0.05 WHERE band_key = ${AFF}`);
  assert.equal(await resolveAffiliateTransportMargin(), 0.05);
});
