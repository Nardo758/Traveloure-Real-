/**
 * Migration 439 — the Kyoto events seed (ledger `2026-11-05-kyoto-events-seed`).
 *
 *   K1  The migration holds exactly the seven factchecked rows (one INSERT each, keyed on (source, source_id), ON CONFLICT
 *       DO NOTHING), with our titles; none of the eleven held rows is in it.
 *   K2  Applied twice, it stores seven rows once: every row is in Kyoto (`venue_locality = 'Kyoto'`, never outside the
 *       city), the Higashiyama venues link the Higashiyama neighbourhood where one exists, and To-ji and Eikando link none.
 *   K3  The upcoming read lists them as in-city Kyoto events.
 *
 * Disposable database only. Rows this file writes are removed in after() unless they were already there.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/kyoto-events-439.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { listUpcomingCityEvents } from "../services/city-events.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const FILE = "server/migrations/439_kyoto_events_seed.sql";
const SEEDED: Record<string, string> = {
  "kodaiji-autumn-night-2026": "Autumn evenings at Kodai-ji",
  "toji-autumn-night-2026": "To-ji halls open after dark",
  "chionin-autumn-lightup-2026": "Chion-in lit for autumn",
  "eikando-autumn-night-2026": "Eikando open on autumn evenings",
  "kiyomizudera-autumn-night-2026": "Kiyomizu-dera open late in autumn",
  "minamiza-kaomise-2026": "Kaomise kabuki at Minamiza",
  "chionin-new-years-eve-bell-2026": "New Year's Eve bell at Chion-in",
};
let preexisting = 0;

before(async () => {
  assertDisposableDb();
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
  preexisting = (r as any).rows[0].n;
});

after(async () => {
  if (preexisting === 0) await db.execute(sql`DELETE FROM city_events WHERE id LIKE 'kyoto-ev-%'`);
});

const applyFile = async () => {
  for (const stmt of fs.readFileSync(FILE, "utf8").split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt));
  }
};

describe("migration 439 Kyoto events", () => {
  it("K1 the seven factchecked rows, idempotent inserts, our titles, no held row", () => {
    const text = fs.readFileSync(FILE, "utf8");
    assert.equal((text.match(/^INSERT INTO city_events /gm) ?? []).length, 7);
    assert.equal((text.match(/ON CONFLICT \(source, source_id\) DO NOTHING;/g) ?? []).length, 7);
    for (const [sid, title] of Object.entries(SEEDED)) {
      assert.ok(text.includes(`'manual', '${sid}', '${title.replace(/'/g, "''")}'`), sid);
    }
    for (const held of ["Arashiyama", "Shoren-in", "Miyako Odori", "Kobo", "Tenjin", "Okera", "Ebisu", "Setsubun", "plum"]) {
      assert.doesNotMatch(text.replace(/^--.*$/gm, ""), new RegExp(held, "i"), `${held} is held`);
    }
    // Sanctioned edit (R3-15, ledger `2026-11-05-r3-followups`): 439 is registered, after 438 — not pinned as the last
    // entry, which every later migration (440 first) would break.
    assert.match(fs.readFileSync("server/migrations/migration-files.ts", "utf8"), /"438_trip_occasion_slug\.sql",[\s\S]*?"439_kyoto_events_seed\.sql",/);
  });

  it("K2 applied twice, seven rows once, all in Kyoto", async () => {
    await applyFile();
    await applyFile();
    const r = await db.execute(sql`
      SELECT e.source_id, e.title, e.venue_locality, e.nights, n.slug AS hood
      FROM city_events e LEFT JOIN city_neighborhoods n ON n.id = e.neighbourhood_id
      WHERE e.id LIKE 'kyoto-ev-%' ORDER BY e.starts_at`);
    const rows = (r as any).rows as Array<{ source_id: string; title: string; venue_locality: string; nights: number; hood: string | null }>;
    assert.equal(rows.length, 7);
    for (const row of rows) {
      assert.equal(row.title, SEEDED[row.source_id]);
      assert.equal(row.venue_locality, "Kyoto");
    }
    const hood = Object.fromEntries(rows.map((x) => [x.source_id, x.hood]));
    assert.equal(hood["toji-autumn-night-2026"], null, "Minami has no Kyoto neighbourhood row");
    assert.equal(hood["eikando-autumn-night-2026"], null, "Sakyo has no Kyoto neighbourhood row");
    const higashiyama = await db.execute(sql`SELECT 1 FROM city_neighborhoods WHERE city ILIKE 'kyoto' AND slug = 'higashiyama'`);
    if ((higashiyama as any).rows.length) assert.equal(hood["kodaiji-autumn-night-2026"], "higashiyama");
    assert.equal(rows.find((x) => x.source_id === "chionin-new-years-eve-bell-2026")!.nights, 1);
    assert.equal(rows.find((x) => x.source_id === "kodaiji-autumn-night-2026")!.nights, 52);
  });

  it("K3 the upcoming read lists them as in-city Kyoto events", async () => {
    const p = await listUpcomingCityEvents(new Date("2026-11-05T03:00:00Z"));
    const ours = p.events.filter((e) => e.id.startsWith("kyoto-ev-"));
    assert.equal(ours.length, 7);
    assert.ok(ours.every((e) => e.marketKey === "kyoto" && e.outsideCity !== true));
  });
});
