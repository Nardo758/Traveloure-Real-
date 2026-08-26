/**
 * Proves migration 258 converges a clean baseline and a dev-shaped database.
 *
 * The probes run in temporary schemas inside the development database and roll
 * back/drop those schemas on completion. No application tables or rows change.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const migration = await readFile(new URL("../server/migrations/258_plans_reconcile.sql", import.meta.url), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    updated_at timestamp NOT NULL DEFAULT now(),
    max_amount numeric(10,2),
    CONSTRAINT fee_bands_rate_type_check CHECK (rate_type IN ('percent', 'flat'))
  )
`;

async function probe(schema: string, devShaped: boolean) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await client.query(baselineFeeBands);

    if (devShaped) {
      await client.query(`
        CREATE TABLE plans (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          key varchar(64) NOT NULL UNIQUE,
          name text NOT NULL,
          price_cents integer NOT NULL,
          interval varchar(20) NOT NULL,
          allowances jsonb NOT NULL DEFAULT '{}'::jsonb,
          active boolean NOT NULL DEFAULT true,
          effective_from date NOT NULL,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        INSERT INTO plans (key, name, price_cents, interval, effective_from)
        VALUES
          ('trip_pass', 'Trip Pass', 1900, 'trip', DATE '2026-08-27'),
          ('plus_annual', 'Plus (Annual)', 2500, 'year', DATE '2026-08-27'),
          ('pro_monthly', 'Pro (Monthly)', 2900, 'month', DATE '2026-08-27')
      `);
      await client.query(`
        INSERT INTO fee_bands (band_key, rate_type, default_rate)
        VALUES
          ('concierge:done_for_you_deposit_pct', 'percent', 0.20),
          ('plans:plus_task_allowance', 'count', 4)
      `);
    }

    await client.query(migration);

    const columns = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name IN ('plans', 'fee_bands')
      ORDER BY table_name, ordinal_position
    `, [schema]);
    const plans = await client.query(`
      SELECT key, name, price_cents, interval, beta_free_until
      FROM plans ORDER BY key
    `);
    const bands = await client.query(`
      SELECT band_key, rate_type, default_rate, is_active
      FROM fee_bands
      ORDER BY band_key
    `);

    await client.query("ROLLBACK");
    return { columns: columns.rows, plans: plans.rows, bands: bands.rows };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const suffix = `${process.pid}`;
const fresh = await probe(`plans_reconcile_fresh_${suffix}`, false);
const dev = await probe(`plans_reconcile_dev_${suffix}`, true);

const normalize = (value: unknown) => JSON.stringify(value);
if (normalize(fresh.columns) !== normalize(dev.columns)) {
  throw new Error("plans reconciliation convergence failed: information_schema shapes differ");
}
if (normalize(fresh.plans) !== normalize(dev.plans)) {
  throw new Error("plans reconciliation convergence failed: plan rows differ");
}
if (normalize(fresh.bands) !== normalize(dev.bands)) {
  throw new Error("plans reconciliation convergence failed: fee-band rows differ");
}

console.log(JSON.stringify({
  ok: true,
  proof: "fresh baseline and dev-shaped baseline converge",
  tables: ["plans", "fee_bands"],
  planRows: fresh.plans.length,
  feeBandRows: fresh.bands.length,
  columns: fresh.columns.length,
}, null, 2));

await pool.end();