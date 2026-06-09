/**
 * CI verification for the migration ledger (#28 Part A).
 *
 * Runs runMigrations() twice against the configured DATABASE_URL:
 *   - run 1 applies (or, on a fresh CI DB after drizzle-kit push, re-applies the
 *     idempotent files) and records each in schema_migrations,
 *   - run 2 MUST apply nothing — every file is now recorded → skipped.
 *
 * Exits non-zero if run 2 applies anything or either run throws. This is the
 * "re-running applies nothing new and throws no errors" gate. Importing the
 * runner pulls in server/db (needs DATABASE_URL) but NOT Stripe/Amadeus, so no
 * service stubs are required.
 */
import { runMigrations } from "../server/migrations/run-migrations";
import { pool } from "../server/db";

async function main() {
  console.log("[verify-ledger] run 1…");
  const r1 = await runMigrations();
  console.log(`[verify-ledger] run 1: applied=${r1.applied.length} skipped=${r1.skipped.length}`);

  console.log("[verify-ledger] run 2 (must apply nothing)…");
  const r2 = await runMigrations();
  console.log(`[verify-ledger] run 2: applied=${r2.applied.length} skipped=${r2.skipped.length}`);

  const total = r2.applied.length + r2.skipped.length;
  if (r2.applied.length !== 0) {
    throw new Error(
      `ledger NOT idempotent: run 2 applied ${r2.applied.length} migration(s) (expected 0): ${r2.applied.join(", ")}`,
    );
  }
  if (total === 0) {
    throw new Error("no migrations were tracked — schema_migrations is empty after a full run (ledger not recording)");
  }
  console.log(`[verify-ledger] PASS — ledger idempotent; ${total} migrations tracked, run 2 applied nothing.`);
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => {
    console.error("[verify-ledger] FAIL:", err?.message ?? err);
    try { await pool.end(); } catch {}
    process.exit(1);
  });
