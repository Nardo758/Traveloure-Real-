/**
 * Standalone entry point for the production ledger bootstrap.
 * Usage: npm run migrate:bootstrap
 *
 * Run this ONCE on a production database that was built from Drizzle snapshots
 * and has no schema_migrations history. It stamps all 001–051 migration names
 * as already-applied WITHOUT executing any of their DDL, then exits.
 *
 * After this completes, the normal server startup (npm run dev / start) will
 * skip 001–051 (all now recorded) and apply 052–063 (and any future migrations).
 *
 * Safe to re-run: ON CONFLICT DO NOTHING makes every insert idempotent.
 */
import { bootstrapProductionLedger } from "./run-migrations";

bootstrapProductionLedger()
  .then((result) => {
    if (result.bootstrapOnly) {
      console.log("\nBootstrap complete:");
      console.log("  Newly stamped:", result.stamped.length ? result.stamped : "(none — already up to date)");
      console.log("  Already recorded:", result.alreadyRecorded.length);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("[migrate:bootstrap] Fatal error:", err);
    process.exit(1);
  });
