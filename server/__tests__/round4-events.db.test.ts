/**
 * Round 4 R4-1 (ledger `2026-11-06-round4-fixes`): the city page's Events read lists the market's own city_events rows
 * with no partner key, and a listed row resolves as a `city_event` save with its date and pin.
 *
 *   E1 the seven seeded Kyoto events (migration 439, points from 442) are listed, soonest first, each `planKind:
 *      "city_event"` with its `sourceId`, located once 442 has given it a point.
 *   E2 a listed row resolves through the ONE resolver as `city_event` / its source id, with its market day and point;
 *      no time is invented for a row with no published time (Kodai-ji, start_time_known false).
 *   E3 a withdrawn row is not listed.
 *
 * Disposable database only. Rows this file writes are removed in after() unless they were already there.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/round4-events.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { listCityEventsForLocation } from "../services/city-events.service";
import { resolvePlanItemRef } from "../services/guest-item-source.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const SEEDED = [
  "kodaiji-autumn-night-2026",
  "toji-autumn-night-2026",
  "chionin-autumn-lightup-2026",
  "eikando-autumn-night-2026",
  "kiyomizudera-autumn-night-2026",
  "minamiza-kaomise-2026",
  "chionin-new-years-eve-bell-2026",
];
const NOW = new Date("2026-11-06T03:00:00Z");
let preexisting = 0;

const applyFile = async (file: string) => {
  for (const stmt of fs.readFileSync(file, "utf8").split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt));
  }
};

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
  preexisting = (r as any).rows[0].n;
  await applyFile("server/migrations/439_kyoto_events_seed.sql");
  await applyFile("server/migrations/442_kyoto_event_venue_points.sql");
  await db.execute(sql`UPDATE city_events SET withdrawn_at = NULL WHERE id LIKE 'kyoto-ev-%'`);
});

after(async () => {
  await db.execute(sql`UPDATE city_events SET withdrawn_at = NULL WHERE id LIKE 'kyoto-ev-%'`);
  if (preexisting === 0) await db.execute(sql`DELETE FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
});

describe("R4-1 city events on the city page", () => {
  it("E1 the seven seeded Kyoto events are listed as city_event cards", async () => {
    const list = await listCityEventsForLocation("Kyoto", NOW, 50);
    const ids = list.map((e) => e.sourceId);
    for (const id of SEEDED) assert.ok(ids.includes(id), `${id} listed`);
    for (const e of list.filter((x) => SEEDED.includes(String(x.sourceId)))) {
      assert.equal(e.planKind, "city_event");
      assert.equal(e.id, `ce-${e.sourceId}`);
      assert.equal(e.located, true, `${e.sourceId} has its 442 point`);
    }
    const dates = list.map((e) => String(e.date));
    assert.deepEqual(dates, [...dates].sort(), "soonest first");
    assert.equal(list.find((e) => e.sourceId === "kodaiji-autumn-night-2026")?.startTime, null, "no published time ⇒ none");
  });

  it("E2 a listed row resolves as city_event with its day and point", async () => {
    const r: any = await resolvePlanItemRef({ kind: "city_event", source_id: "kodaiji-autumn-night-2026", city: "Kyoto" }, { markets: new Set(["kyoto"]) });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.source.contentType, "city_event");
    assert.equal(r.source.contentId, "kodaiji-autumn-night-2026");
    assert.equal(r.source.eventDate, "2026-10-23");
    assert.equal(Number(r.source.latitude), 35.000734);
    assert.equal(Number(r.source.longitude), 135.780791);
    assert.ok(!r.source.startTime, "no time invented");
  });

  it("E3 a withdrawn row is not listed", async () => {
    await db.execute(sql`UPDATE city_events SET withdrawn_at = now() WHERE source = 'manual' AND source_id = 'toji-autumn-night-2026'`);
    const ids = (await listCityEventsForLocation("Kyoto", NOW, 50)).map((e) => e.sourceId);
    assert.ok(!ids.includes("toji-autumn-night-2026"));
  });
});
