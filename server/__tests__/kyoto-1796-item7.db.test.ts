/**
 * MIGRATION 426: #1796 follow-up, item 7 (ledger `2026-10-31-kyoto-1796-item7`).
 *
 *   K1 each Kyoto row holding a prior (421's output or the pre-421 text) takes the new value; the
 *      dawn tunnel's why line is cleared to NULL.
 *   K2 a Kyoto row holding some other text, and another city's row holding a prior, are untouched.
 *   K3 a second run changes 0 rows.
 *
 * Runs inside one transaction that is ROLLED BACK.
 *   npx tsx --test server/__tests__/kyoto-1796-item7.db.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { KYOTO_ITEM7_FIXES } from "../../shared/kyoto-1796-item7";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SQL = fs.readFileSync(path.resolve(import.meta.dirname, "../migrations/426_kyoto_1796_item7_copy.sql"), "utf-8");

after(async () => {
  await pool.end();
});

function rowCounts(result: unknown): number[] {
  const list = Array.isArray(result) ? result : [result];
  return list.map((r: any) => r.rowCount ?? 0);
}

test("K1–K3: priors take the new value, others are untouched, a second run is a no-op", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const names = [...new Set(KYOTO_ITEM7_FIXES.map((f) => f.placeName))];
    // Move the real rows aside inside this transaction, so the counts are this fixture's alone.
    await client.query(
      `UPDATE travel_pulse_hidden_gems SET city = 'kyoto-moved-' || id WHERE city ILIKE 'kyoto' AND place_name = ANY($1)`,
      [names],
    );
    const ins = async (city: string, place: string, description: string | null, why: string | null) =>
      (
        await client.query(
          `INSERT INTO travel_pulse_hidden_gems (id, city, place_name, description, why_locals_love_it)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id`,
          [city, place, description, why],
        )
      ).rows[0].id as string;
    const read = async (id: string) =>
      (await client.query(`SELECT description, why_locals_love_it FROM travel_pulse_hidden_gems WHERE id = $1`, [id])).rows[0];

    // One Kyoto row per place, holding the first prior of each of its fixes (421's output where 421 wrote one).
    const kyotoIds = new Map<string, string>();
    for (const place of names) {
      const desc = KYOTO_ITEM7_FIXES.find((f) => f.placeName === place && f.column === "description");
      const why = KYOTO_ITEM7_FIXES.find((f) => f.placeName === place && f.column === "why_locals_love_it");
      kyotoIds.set(place, await ins("Kyoto", place, desc?.priors[0] ?? "kept description", why?.priors[0] ?? "kept why"));
    }
    // The pre-421 text is also matched.
    const preDawn = KYOTO_ITEM7_FIXES.find((f) => f.placeName === "Fushimi Inari Pre-Dawn Hike")!;
    const preDawnOld = await ins("kyoto", preDawn.placeName, preDawn.priors[1], null);
    // Not matched: different text in Kyoto, and a prior in another city.
    const edited = await ins("Kyoto", "Philosopher's Path Canal in Autumn", "An editor's own words.", null);
    const osaka = await ins("Osaka", "Yoshida Sanso Ryokan", KYOTO_ITEM7_FIXES[0].priors[0], null);

    const first = rowCounts(await client.query(SQL));
    assert.deepEqual(first, [1, 1, 1, 2, 1], "one write per fix, two for the pre-dawn description");

    for (const fix of KYOTO_ITEM7_FIXES) {
      const row = await read(kyotoIds.get(fix.placeName)!);
      const value = fix.column === "description" ? row.description : row.why_locals_love_it;
      assert.equal(value, fix.next, `${fix.placeName} ${fix.column}`);
    }
    assert.equal((await read(preDawnOld)).description, preDawn.next);
    assert.equal((await read(edited)).description, "An editor's own words.");
    assert.equal((await read(osaka)).description, KYOTO_ITEM7_FIXES[0].priors[0]);

    const second = rowCounts(await client.query(SQL));
    assert.deepEqual(second, [0, 0, 0, 0, 0], "a second run changes 0 rows");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
