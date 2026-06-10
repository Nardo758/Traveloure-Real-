/**
 * Standalone entry point for the migration dry-run audit.
 * Usage: npm run migrate:dry-run
 *
 * Connects to the DB specified by DATABASE_URL and reports which migration files
 * would be applied without executing any SQL or modifying the database.
 * Safe to run against production.
 */
import { runMigrations } from "./run-migrations";

process.env.MIGRATION_DRY_RUN = "true";

runMigrations()
  .then((result) => {
    if (result.dryRun) {
      console.log("\nDry-run result:");
      console.log("  Would apply:", result.wouldApply.length ? result.wouldApply : "(none)");
      console.log("  Already recorded (skip):", result.skipped.length);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("[migrate:dry-run] Error:", err);
    process.exit(1);
  });
