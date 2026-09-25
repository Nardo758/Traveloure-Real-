/**
 * db.ts — direct-Postgres read helper for the supply/demand e2e harness.
 *
 * Used for: DB before/after diffs (evidence), fee_bands reads (R-2: never a
 * fee/commission literal in a test), and assertions about rows the UI cannot
 * surface directly (e.g. whether a ready-made item references the live
 * provider_services row rather than a copy).
 *
 * READ-ONLY by convention in the specs; the one exception is account seeding,
 * which is itself always logged as a finding per R-1.
 */
import { Pool } from 'pg';

let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await db().query(sql, params);
  return res.rows as T[];
}

/** Read a fee_bands row by bandKey. Throws if missing — a test must never fall back to a literal. */
export async function feeBand(bandKey: string): Promise<{
  bandKey: string;
  rateType: string;
  defaultRate: string;
  maxAmount: string | null;
  isActive: boolean;
}> {
  const rows = await q(
    `SELECT band_key AS "bandKey", rate_type AS "rateType", default_rate AS "defaultRate",
            max_amount AS "maxAmount", is_active AS "isActive"
       FROM fee_bands WHERE band_key = $1`,
    [bandKey],
  );
  if (rows.length === 0) {
    throw new Error(`fee_bands row not found for band_key=${bandKey} (R-2: no literal fallback allowed)`);
  }
  return rows[0] as any;
}

export async function userByEmail(email: string): Promise<any | null> {
  const rows = await q(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] ?? null;
}

export async function serviceByTitle(titleLike: string): Promise<any | null> {
  const rows = await q(
    `SELECT * FROM provider_services WHERE service_name ILIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [`%${titleLike}%`],
  );
  return rows[0] ?? null;
}

export async function countRow(table: string, where: string, params: any[] = []): Promise<number> {
  const rows = await q(`SELECT count(*)::int AS c FROM ${table} ${where ? 'WHERE ' + where : ''}`, params);
  return rows[0]?.c ?? 0;
}
