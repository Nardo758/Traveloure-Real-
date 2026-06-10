/**
 * Production ledger bootstrap script.
 * Usage: npm run migrate:bootstrap
 *
 * Run this ONCE on a production database that was built from Drizzle snapshots
 * and has no schema_migrations history. It:
 *   1. Creates the schema_migrations table if it does not exist.
 *   2. Stamps all migration filenames 001–050 as already-applied using
 *      ON CONFLICT DO NOTHING — NO DDL from those files is executed.
 *   3. Records migration 051 (the bootstrap file itself).
 *   4. Exits cleanly.
 *
 * After this completes, the normal server startup (npm start / npm run dev)
 * will skip 001–051 (all now recorded) and only apply any future migrations.
 *
 * Safe to re-run: every INSERT uses ON CONFLICT DO NOTHING, so the script is
 * fully idempotent — running it twice is harmless.
 *
 * Audit first (read-only, never mutates):
 *   npm run migrate:dry-run
 *
 * Entry point delegates to server/migrations/bootstrap-prod-ledger.ts which
 * calls bootstrapProductionLedger() from server/migrations/run-migrations.ts.
 */

// Re-export the entry point so this path is importable if needed,
// and execute when run directly via tsx.
import "../server/migrations/bootstrap-prod-ledger";
