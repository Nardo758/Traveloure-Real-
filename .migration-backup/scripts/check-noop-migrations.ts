/**
 * CI gate: detects accidental no-op migrations before they ship.
 *
 * The no-op convention (replacing a superseded migration body with `SELECT 1`)
 * exists to preserve ledger sequence continuity without running harmful DDL.
 * Exactly one no-op is expected in the current chain: 090.
 *
 * This script reads every file registered in MIGRATION_FILES, applies the same
 * strip-and-compare logic used by the runtime runner, and exits non-zero if
 * more than the expected number of no-ops is found.
 *
 * Run standalone:  npx tsx scripts/check-noop-migrations.ts
 * Expected outcome: exits 0 when exactly one no-op exists; exits 1 otherwise.
 *
 * Relevant files:
 *  - server/migrations/migration-files.ts  (the canonical list)
 *  - server/migrations/run-migrations.ts   (isNoOpMigration — logic mirrored here)
 *  - server/migrations/AUTHORING.md        (convention documentation)
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { MIGRATION_FILES } from "../server/migrations/migration-files";

const MIGRATIONS_DIR = join(process.cwd(), "server", "migrations");

/** Mirror of the isNoOpMigration helper in run-migrations.ts (no DB import). */
function isNoOpMigration(sqlContent: string): boolean {
  const stripped = sqlContent
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--") && line.trim() !== "")
    .join(" ")
    .trim()
    .replace(/;$/, "")
    .trim();
  return stripped.toUpperCase() === "SELECT 1";
}

/**
 * The number of no-op migrations that are intentionally present.
 * Increment this constant (with a comment) whenever a new deliberate no-op is added.
 * Currently: 090_widen_destination_seasons_average_temp.sql
 */
const EXPECTED_NOOP_COUNT = 1;

function main(): void {
  console.log("[check-noop-migrations] Scanning", MIGRATION_FILES.length, "registered migration files…\n");

  const noOps: string[] = [];
  const missing: string[] = [];

  for (const filename of MIGRATION_FILES) {
    const filePath = join(MIGRATIONS_DIR, filename);

    if (!existsSync(filePath)) {
      missing.push(filename);
      continue;
    }

    const content = readFileSync(filePath, "utf-8");
    if (isNoOpMigration(content)) {
      noOps.push(filename);
    }
  }

  if (missing.length > 0) {
    console.error("[check-noop-migrations] FAIL — missing registered migration file(s):");
    for (const f of missing) {
      console.error("  ✗", f);
    }
    console.error(
      "\nFiles listed in MIGRATION_FILES must exist on disk. Either create the file,",
      "remove it from the list, or delete it from the chain per the exclusion convention."
    );
    process.exit(1);
  }

  console.log(
    noOps.length === 0
      ? "  No no-op migrations found."
      : `  No-op migration(s) detected (${noOps.length}):`
  );
  for (const f of noOps) {
    console.log("   •", f);
  }
  console.log();

  if (noOps.length > EXPECTED_NOOP_COUNT) {
    const unexpected = noOps.slice(); // all of them for context
    console.error(
      `[check-noop-migrations] FAIL — found ${noOps.length} no-op migration(s) but only ${EXPECTED_NOOP_COUNT} is/are expected.`
    );
    console.error(
      "\nA no-op (SELECT 1 body) is only valid when a migration is superseded by a later",
      "one shipping in the same release before either reaches production. Any additional",
      "no-op beyond the expected count is likely a mistake.\n"
    );
    console.error("All no-ops found:");
    for (const f of unexpected) {
      console.error("  ✗", f);
    }
    console.error(
      "\nTo fix: restore the real SQL body, or — if the no-op is intentional — increment",
      "EXPECTED_NOOP_COUNT in scripts/check-noop-migrations.ts with an explanatory comment."
    );
    process.exit(1);
  }

  console.log(
    `[check-noop-migrations] PASS — ${noOps.length} no-op migration(s) present, ${EXPECTED_NOOP_COUNT} expected. All good.`
  );
  process.exit(0);
}

main();
