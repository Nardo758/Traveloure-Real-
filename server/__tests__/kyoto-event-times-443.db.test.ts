/**
 * Migration 443 — published times on four of the seven Kyoto events 439 seeded (ledger `2026-11-06-kyoto-event-times`).
 *
 *   T1 first apply changes exactly 4 rows; a rerun changes none.
 *   T2 the four rows carry their published wall-clock times (Asia/Tokyo) on their own dates; a blank side is untouched
 *      (Kiyomizu-dera keeps its date-only start, the Chion-in bell its date-only end); start_time_known follows the start.
 *   T3 Kodai-ji, To-ji and Kaomise are untouched (no published time).
 *   T4 a stored time is never overwritten (a row already timed is skipped).
 *   T5 "Plan around it" on Chion-in autumn resolves at 17:30 on its day (the resolver's startTime and eventDate).
 *
 * Disposable database only. Rows this file writes are removed in after() unless they were already there.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/kyoto-event-times-443.db.test.ts
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

const statements = (file: string) =>
  fs.readFileSync(file, "utf8").split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
const apply = async (file: string) => {
  let n = 0;
  for (const s of statements(file)) n += Number((await db.execute(sql.raw(s))).rowCount ?? 0);
  return n;
};
const local = async (sourceId: string) => {
  const r = await db.execute(sql`SELECT to_char(starts_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS s,
      to_char(ends_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI') AS e, start_time_known AS k
    FROM city_events WHERE source = 'manual' AND source_id = ${sourceId}`);
  return (r as any).rows[0];
};
let preexisting = 0;
const reset = async () => {
  await db.execute(sql`DELETE FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
  await apply("server/migrations/439_kyoto_events_seed.sql");
  await apply("server/migrations/442_kyoto_event_venue_points.sql");
};

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
  preexisting = (r as any).rows[0].n;
  await reset();
});

after(async () => {
  await reset();
  if (preexisting > 0) await apply("server/migrations/443_kyoto_event_times.sql");
  else await db.execute(sql`DELETE FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
});

describe("migration 443 Kyoto event times", () => {
  it("T1 four rows on first apply; none on rerun", async () => {
    const counts: number[] = [];
    for (const s of statements("server/migrations/443_kyoto_event_times.sql")) counts.push(Number((await db.execute(sql.raw(s))).rowCount ?? 0));
    assert.equal(counts.length, 6);
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE id LIKE 'kyoto-ev-%'
      AND (start_time_known = true OR to_char(ends_at AT TIME ZONE 'Asia/Tokyo', 'HH24:MI') <> '00:00')`);
    assert.equal((rows as any).rows[0].n, 4, "4 rows changed");
    assert.equal(await apply("server/migrations/443_kyoto_event_times.sql"), 0, "rerun changes nothing");
  });

  it("T2 published times on their own dates; blanks untouched", async () => {
    assert.deepEqual(await local("chionin-autumn-lightup-2026"), { s: "2026-11-17 17:30", e: "2026-12-06 21:30", k: true });
    assert.deepEqual(await local("eikando-autumn-night-2026"), { s: "2026-11-20 17:30", e: "2026-12-06 20:30", k: true });
    assert.deepEqual(await local("kiyomizudera-autumn-night-2026"), { s: "2026-11-21 00:00", e: "2026-11-30 21:30", k: false });
    assert.deepEqual(await local("chionin-new-years-eve-bell-2026"), { s: "2026-12-31 22:20", e: "2026-12-31 00:00", k: true });
  });

  it("T3 the three rows with no published time are untouched", async () => {
    assert.deepEqual(await local("kodaiji-autumn-night-2026"), { s: "2026-10-23 00:00", e: "2026-12-13 00:00", k: false });
    assert.deepEqual(await local("toji-autumn-night-2026"), { s: "2026-10-31 00:00", e: "2026-12-13 00:00", k: false });
    assert.deepEqual(await local("minamiza-kaomise-2026"), { s: "2026-12-01 00:00", e: "2026-12-24 00:00", k: false });
  });

  it("T4 a stored time is never overwritten", async () => {
    await reset();
    await db.execute(sql`UPDATE city_events SET starts_at = '2026-11-17T18:00:00+09:00', start_time_known = true
      WHERE source = 'manual' AND source_id = 'chionin-autumn-lightup-2026'`);
    await apply("server/migrations/443_kyoto_event_times.sql");
    assert.equal((await local("chionin-autumn-lightup-2026")).s, "2026-11-17 18:00");
    await reset();
    await apply("server/migrations/443_kyoto_event_times.sql");
  });

  it("T5 Plan around it on Chion-in autumn lands at 17:30 on its day", async () => {
    const r: any = await resolvePlanItemRef({ kind: "city_event", source_id: "chionin-autumn-lightup-2026", city: "Kyoto" }, { markets: new Set(["kyoto"]) });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.source.eventDate, "2026-11-17");
    assert.equal(r.source.startTime, "17:30");
  });
});
