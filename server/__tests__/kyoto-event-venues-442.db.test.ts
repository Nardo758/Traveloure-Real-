/**
 * Migration 442 — venue points for the seven Kyoto events 439 seeded (ledger `2026-11-06-kyoto-event-venue-points`).
 *
 *   V1  The file holds exactly seven UPDATEs, one per 439 source_id, each fill-only-NULL on BOTH coordinates and keyed
 *       on (source, source_id); every statement names its OpenStreetMap source and the ODbL attribution.
 *   V2  Applied after 439, every row gets its point; a second apply changes nothing.
 *   V3  A point already stored is never moved, and the resolver lands "Plan around it" with the row's point.
 *
 * Disposable database only. Rows this file writes are removed in after() unless they were already there.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/kyoto-event-venues-442.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolvePlanItemRef } from "../services/guest-item-source.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const SEED_FILE = "server/migrations/439_kyoto_events_seed.sql";
const FILE = "server/migrations/442_kyoto_event_venue_points.sql";
const POINTS: Record<string, [number, number]> = {
  "kodaiji-autumn-night-2026": [35.000734, 135.780791],
  "toji-autumn-night-2026": [34.979589, 135.747702],
  "chionin-autumn-lightup-2026": [35.00479, 135.781812],
  "eikando-autumn-night-2026": [35.01466, 135.7939],
  "kiyomizudera-autumn-night-2026": [34.995428, 135.783338],
  "minamiza-kaomise-2026": [35.003482, 135.772379],
  "chionin-new-years-eve-bell-2026": [35.004248, 135.783966],
};
let preexisting = 0;

const statements = (file: string) =>
  fs.readFileSync(file, "utf8").split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
const applyFile = async (file: string) => {
  let changed = 0;
  for (const stmt of statements(file)) changed += Number((await db.execute(sql.raw(stmt))).rowCount ?? 0);
  return changed;
};
const pointOf = async (sourceId: string) => {
  const r = await db.execute(sql`SELECT venue_lat, venue_lng FROM city_events WHERE source = 'manual' AND source_id = ${sourceId}`);
  const row = (r as any).rows[0];
  return row ? [row.venue_lat, row.venue_lng] : null;
};

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
  preexisting = (r as any).rows[0].n;
  if (preexisting === 0) await applyFile(SEED_FILE);
});

after(async () => {
  if (preexisting === 0) await db.execute(sql`DELETE FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
});

describe("migration 442 Kyoto event venue points", () => {
  it("V1 seven fill-only-NULL updates keyed on (source, source_id), each with its OSM source and ODbL line", () => {
    const text = fs.readFileSync(FILE, "utf8");
    const updates = statements(FILE);
    assert.equal(updates.length, 7);
    for (const [id, [lat, lng]] of Object.entries(POINTS)) {
      const stmt = updates.find((s) => s.includes(`source_id = '${id}'`));
      assert.ok(stmt, `no statement for ${id}`);
      assert.match(stmt!, /^UPDATE city_events SET venue_lat = [\d.]+, venue_lng = [\d.]+\s+WHERE source = 'manual' AND source_id = '[a-z0-9-]+' AND venue_lat IS NULL AND venue_lng IS NULL$/);
      assert.ok(stmt!.includes(`venue_lat = ${lat.toFixed(6)}`) && stmt!.includes(`venue_lng = ${lng.toFixed(6)}`), `${id} point`);
    }
    assert.equal((text.match(/https:\/\/www\.openstreetmap\.org\/(node|way)\/\d+ — © OpenStreetMap contributors, ODbL 1\.0/g) ?? []).length, 7);
    assert.ok(!/google/i.test(text.replace(/never Google Places/, "")), "no Google source");
  });

  it("V2 fills every row once; a rerun changes nothing", async () => {
    await db.execute(sql`UPDATE city_events SET venue_lat = NULL, venue_lng = NULL WHERE id LIKE 'kyoto-ev-%'`);
    assert.equal(await applyFile(FILE), 7);
    for (const [id, p] of Object.entries(POINTS)) assert.deepEqual(await pointOf(id), p);
    assert.equal(await applyFile(FILE), 0);
  });

  it("V3 a stored point is never moved; Plan around it lands the event with its point", async () => {
    await db.execute(sql`UPDATE city_events SET venue_lat = 1, venue_lng = 2 WHERE source = 'manual' AND source_id = 'toji-autumn-night-2026'`);
    await db.execute(sql`UPDATE city_events SET venue_lat = NULL, venue_lng = NULL WHERE source = 'manual' AND source_id = 'kodaiji-autumn-night-2026'`);
    assert.equal(await applyFile(FILE), 1);
    assert.deepEqual(await pointOf("toji-autumn-night-2026"), [1, 2]);
    await db.execute(sql`UPDATE city_events SET venue_lat = 34.979589, venue_lng = 135.747702 WHERE source = 'manual' AND source_id = 'toji-autumn-night-2026'`);
    const r: any = await resolvePlanItemRef({ kind: "city_event", source_id: "kodaiji-autumn-night-2026", city: "Kyoto" }, { markets: new Set(["kyoto"]) });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(Number(r.source.latitude), 35.000734);
    assert.equal(Number(r.source.longitude), 135.780791);
  });
});
