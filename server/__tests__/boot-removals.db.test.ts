/**
 * Boot removals (ledger `2026-10-18-boot-removals`):
 *   BR1  `venueLookup: false` (the boot call) makes NO venue request, even with a resolver injected; a new
 *        row with no hand-typed point is DEFERRED (not inserted unlocated), and a hand-typed row inserts
 *   BR2  the boot path calls no Nominatim lookup, no test-account purge and no gem-photo backfill
 *        (a source pin over server/index.ts — the three ruled removals, each still runnable on purpose)
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix and deleted afterwards. No network.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { seedCityEvents } from "../services/city-events.service";
import { MANUAL_CITY_EVENTS } from "../seeds/city-events.manual";

const RUN = crypto.randomUUID().slice(0, 8);
const sid = (s: string) => `boottest-${RUN}-${s}`;

before(() => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM city_events WHERE source_id LIKE ${`boottest-${RUN}-%`}`);
  await pool.end();
});

test("BR1: no lookup at boot; an unlocated new row is deferred, a hand-typed one inserts", async () => {
  const base = MANUAL_CITY_EVENTS.find((e) => e.city === "Kyoto")!;
  let calls = 0;
  const result = await seedCityEvents(
    [
      { ...base, sourceId: sid("unlocated") },
      { ...base, sourceId: sid("typed"), venueLat: 35.0, venueLng: 135.7 },
    ],
    {
      partnerHosts: async () => [],
      sleep: async () => {},
      resolveVenue: async () => {
        calls += 1;
        return null;
      },
      venueLookup: false,
    },
  );
  assert.equal(calls, 0, "no venue request at boot");
  assert.deepEqual(result.deferred, [sid("unlocated")]);
  assert.equal(result.inserted, 1);
  assert.equal(result.nominatim, "untested");
  const rows = await db.execute(sql`SELECT source_id FROM city_events WHERE source_id LIKE ${`boottest-${RUN}-%`}`);
  assert.deepEqual(rows.rows.map((r: any) => r.source_id), [sid("typed")]);
});

test("BR2: the boot path runs no Nominatim lookup, no test-account purge and no photo backfill", () => {
  const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.ts"), "utf8");
  const code = src.replace(/\/\/.*$/gm, "");
  assert.match(code, /seedManualCityEvents\(\{ venueLookup: false \}\)/);
  assert.doesNotMatch(code, /purgeE2EAccountsFromProd/);
  assert.doesNotMatch(code, /backfillGemPhotos/);
});
