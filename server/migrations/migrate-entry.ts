/**
 * Standalone entry point — applies pending SQL migrations then exits.
 * Usage: npx tsx server/migrations/migrate-entry.ts
 *
 * Only requires DATABASE_URL. Safe to run before seeding in CI.
 * Already-applied migrations are skipped (idempotent).
 */
import { runMigrations } from "./run-migrations";

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
