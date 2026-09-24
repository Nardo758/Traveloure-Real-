/**
 * MIGRATION 319 REPAIRS THE BACKGROUND-CHECK FLAGS 289 COULD NOT SET — board task #550, ledger
 * `2026-09-24-background-check-flags-repair`.
 *
 * Production was found with `requires_background_check = false` on private_transportation,
 * tour_guide, private_chef and childcare_family: migration 289 wrote `COALESCE(existing, intended)`
 * and the column's DEFAULT is `false`, so COALESCE kept it.
 *
 *   G1  Reproduced on this database (the four flags forced back to `false` inside a transaction),
 *       the migration file sets exactly those four to `true` and touches no other row or column.
 *   G2  A second run changes nothing.
 *
 * Runs inside one transaction that is ROLLED BACK, so the shared database is never changed.
 *   npx tsx --test server/__tests__/background-check-flags-repair.db.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SQL = fs.readFileSync(
  path.resolve(import.meta.dirname, "../migrations/319_background_check_flags_repair.sql"),
  "utf-8",
);
const REPAIRED = ["private_transportation", "tour_guide", "private_chef", "childcare_family"];

after(async () => {
  await pool.end();
});

test("G1–G2: the four flags become true, nothing else moves, and a re-run is a no-op", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const present = await client.query(
      `SELECT category_key FROM service_categories WHERE category_key = ANY($1)`,
      [REPAIRED],
    );
    assert.equal(present.rows.length, REPAIRED.length, "the four categories exist on this database");

    // Reproduce production's state.
    await client.query(`UPDATE service_categories SET requires_background_check = false WHERE category_key = ANY($1)`, [REPAIRED]);
    const snapshot = async () =>
      (await client.query(
        `SELECT id, category_key, requires_background_check, insurance_band, risk_profile, commission_band_key, name
           FROM service_categories ORDER BY id`,
      )).rows;
    const beforeRows = await snapshot();

    const first = await client.query(SQL);
    assert.equal((first as any).rowCount, REPAIRED.length, "exactly the four rows are repaired");

    const afterRows = await snapshot();
    for (const row of afterRows) {
      const prior = beforeRows.find((r) => r.id === row.id)!;
      if (REPAIRED.includes(row.category_key)) {
        assert.equal(row.requires_background_check, true, `${row.category_key} now requires a background check`);
        assert.deepEqual(
          { ...row, requires_background_check: prior.requires_background_check },
          prior,
          `${row.category_key}: no other column changed`,
        );
      } else {
        assert.deepEqual(row, prior, `${row.category_key ?? row.id}: an unrelated category is untouched`);
      }
    }

    const second = await client.query(SQL);
    assert.equal((second as any).rowCount, 0, "a second run matches no row");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
