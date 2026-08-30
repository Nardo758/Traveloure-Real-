/**
 * Proves migration 259 restores all provider commission bands on a database
 * where the original seed migration was recorded but the rows are absent.
 *
 * The probes use temporary schemas in the development database and roll back,
 * so application tables and rows are never modified.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const migration = await readFile(
  new URL("../server/migrations/259_provider_fee_bands_reconcile.sql", import.meta.url),
  "utf8",
);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const expectedBands = [
  { key: "limited", rate: 0.12 },
  { key: "moderate", rate: 0.08 },
  { key: "commercial", rate: 0.06 },
  { key: "premium", rate: 0.04 },
] as const;

const baselineFeeBands = `
  CREATE TABLE fee_bands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    band_key varchar(100) NOT NULL UNIQUE,
    rate_type varchar(10) NOT NULL,
    default_rate numeric(10,4) NOT NULL,
    min_rate numeric(10,4),
    max_rate numeric(10,4),
    display_name text,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    updated_by varchar(255),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )
`;

type BandRow = {
  band_key: string;
  rate_type: string;
  default_rate: string;
  is_active: boolean;
};

async function probe(schema: string, withExistingModerate: boolean) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(baselineFeeBands);

    if (withExistingModerate) {
      await client.query(`
        INSERT INTO fee_bands (band_key, rate_type, default_rate, display_name, description, is_active)
        VALUES ('moderate', 'percent', 0.0550, 'Custom moderate', 'Admin-configured value', false)
      `);
    }

    await client.query(migration);
    await client.query(migration);

    const { rows } = await client.query<BandRow>(`
      SELECT band_key, rate_type, default_rate, is_active
      FROM fee_bands
      WHERE band_key IN ('limited', 'moderate', 'commercial', 'premium')
      ORDER BY band_key
    `);
    await client.query("ROLLBACK");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function assertRatifiedRows(rows: BandRow[]) {
  assert.equal(rows.length, expectedBands.length, "all four provider bands must exist");
  for (const expected of expectedBands) {
    const row = rows.find((candidate) => candidate.band_key === expected.key);
    assert.ok(row, `missing provider band: ${expected.key}`);
    assert.equal(row.rate_type, "percent", `${expected.key} must resolve as a percent band`);
    assert.equal(Number(row.default_rate), expected.rate, `${expected.key} has the wrong ratified rate`);
    assert.equal(row.is_active, true, `${expected.key} must be active when seeded`);
  }
}

const suffix = `${process.pid}`;
const fresh = await probe(`provider_band_reconcile_fresh_${suffix}`, false);
assertRatifiedRows(fresh);

const preservingExisting = await probe(`provider_band_reconcile_existing_${suffix}`, true);
const existingModerate = preservingExisting.find((row) => row.band_key === "moderate");
assert.ok(existingModerate, "existing moderate row must remain present");
assert.equal(Number(existingModerate.default_rate), 0.055, "reconciliation must not overwrite an admin-set rate");
assert.equal(existingModerate.is_active, false, "reconciliation must not reactivate an admin-disabled band");

console.log(JSON.stringify({
  ok: true,
  proof: "missing provider bands seed at ratified rates and existing rows remain untouched",
  bands: fresh.length,
}, null, 2));

await pool.end();