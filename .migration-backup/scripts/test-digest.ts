/**
 * One-shot digest test — run with:
 *   npx tsx scripts/test-digest.ts
 *
 * Triggers runDailyAdminDigest() and logs the result.
 * Safe to run against the live database (read-only queries + email send).
 */
import { runDailyAdminDigest } from "../server/jobs/dailyAdminDigest";

console.log("[test-digest] Starting...");
runDailyAdminDigest()
  .then(() => {
    console.log("[test-digest] Completed. Check ADMIN_EMAIL inbox or server log above.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[test-digest] Fatal:", err);
    process.exit(1);
  });
