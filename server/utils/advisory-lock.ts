/**
 * One instance at a time (ledger `2026-10-18-boot-reference-seeding`): a Postgres transaction-scoped
 * advisory lock held on ONE dedicated connection for the whole of `fn`.
 *
 * `fn` runs its own statements on the pool as before — the lock connection only holds an open transaction
 * that took `pg_advisory_xact_lock`. A second instance blocks on its own lock until the first COMMITs, then
 * runs `fn` and finds the work already done (every caller is idempotent). The lock is released by COMMIT, or
 * by ROLLBACK on error, or by the server ending the transaction if this process dies — never left behind.
 */
import { pool } from "../db";

export async function withAdvisoryXactLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [name]);
    try {
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } finally {
    client.release();
  }
}

/** The lock names, stated once. */
export const MIGRATIONS_LOCK = "traveloure:migrations";
export const BOOT_SEED_LOCK = "traveloure:boot-seed";
