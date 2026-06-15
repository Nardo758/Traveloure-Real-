/**
 * Standalone entry point — applies pending SQL migrations then exits.
 * Usage: npx tsx server/migrations/migrate-entry.ts
 *
 * Only requires DATABASE_URL. Safe to run before seeding in CI.
 * Already-applied migrations are skipped (idempotent).
 *
 * DB reachability: probes the connection before running. If DATABASE_URL is
 * an internal-only host (e.g. Replit's helium, unreachable from GitHub Actions)
 * the probe times out in 5 s, a warning is printed, and the script exits 0.
 * The deployed app applies all pending migrations at startup — this step is a
 * pre-flight convenience, not a hard gate.
 */
import pg from "pg";
import { runMigrations } from "./run-migrations";

const DB_PROBE_TIMEOUT_MS = 5_000;

async function isDbReachable(): Promise<boolean> {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: DB_PROBE_TIMEOUT_MS,
    max: 1,
  });
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

(async () => {
  if (!(await isDbReachable())) {
    console.log("[migrate] WARNING: DATABASE_URL is not reachable from this environment.");
    console.log("[migrate] If this is GitHub Actions, the Replit-internal postgres (helium)");
    console.log("[migrate] cannot be reached externally.  The deployed app applies all");
    console.log("[migrate] pending migrations at startup — skipping CI pre-flight.");
    process.exit(0);
  }

  runMigrations()
    .then((result) => {
      console.log(
        `[migrate] Done — ${result.applied?.length ?? 0} applied, ${result.skipped?.length ?? 0} skipped.`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] Migration failed:", err);
      process.exit(1);
    });
})();
