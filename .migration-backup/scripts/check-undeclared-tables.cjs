#!/usr/bin/env node
/**
 * check-undeclared-tables.cjs — pre-publish safety check for silently-droppable tables.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Replit Autoscale publish flow runs `drizzle-kit push`, which is authoritative over
 * the live database: any table (or index) present in the DB but absent from shared/schema.ts
 * will be proposed for DROP — silently, and with no migration re-run to recreate it because
 * the migration chain is already stamped.
 *
 * This has happened twice in this project:
 *   • ai_cost_tracking   — absent from schema.ts; ~7 hot writers; would have been lost.
 *   • service_demand_requests — absent from schema.ts; caught, then retired deliberately
 *                               via migration 158 (guarded drop, not a push surprise).
 *
 * This script closes the discovery gap: it compares every table currently in the dev DB
 * against the tables declared in all shared/ TS files, subtracts the known system
 * tables, and exits non-zero on anything undeclared that drizzle-kit push would therefore
 * propose to drop.
 *
 * IMPORTANT: every undeclared table causes exit 1 — including tables listed in
 * RETIRED_TABLES whose retirement migration has not yet dropped them. Presence in
 * RETIRED_TABLES only changes the failure message; it never suppresses the failure.
 * The correct fix is always to either declare the table or run its retirement migration.
 *
 * USAGE
 * ─────
 *   node scripts/check-undeclared-tables.cjs
 *   node scripts/check-undeclared-tables.cjs "postgresql://..."   # explicit URL
 *   node scripts/check-undeclared-tables.cjs --self-test          # smoke-test (no DB)
 *
 * Uses DATABASE_URL env var when no positional argument is given.
 * Exit 0 = all DB tables are declared (safe to publish).
 * Exit 1 = undeclared tables found (investigate before publishing).
 *
 * NEGATIVE SPACE (what this script does NOT cover)
 * ─────────────────────────────────────────────────
 *   • Indexes — covered separately by preflight-prod-unique-indexes.cjs.
 *   • CHECK constraints — covered by preflight-prod-constraints.cjs.
 *   • Tables in schema.ts that are missing from the DB — drizzle would CREATE them (safe).
 *   • Non-public schemas.
 *
 * MAINTAINING THIS SCRIPT
 * ───────────────────────
 * SYSTEM_TABLES: add here only tables managed by third-party middleware that are never
 *   declared in shared/schema.ts by design. Keep this list short.
 *
 * RETIRED_TABLES: add here when a retirement migration has been WRITTEN AND REGISTERED
 *   (in server/migrations/migration-files.ts) but has not yet been applied to every
 *   environment. This gives a more specific error message — "retirement pending" rather
 *   than "undeclared" — while still failing loudly. Remove the entry once the migration
 *   has been applied everywhere and the table is physically gone; at that point the table
 *   no longer appears in the DB query and needs no exclusion.
 *
 *   DO NOT add a table here as a substitute for writing a retirement migration.
 *   DO NOT add a table here to suppress a failure without a corresponding migration.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// ── Tables managed by third-party middleware — intentionally absent from schema.ts. ──
// Keep this list as short as possible.
const SYSTEM_TABLES = new Set([
  "schema_migrations", // migration ledger — managed by run-migrations.ts
  "sessions",          // managed by connect-pg-simple (self-creates); see EXECUTION_MAP.md
]);

// ── Tables whose retirement migration IS registered but may not yet have run. ──
// Presence here changes the failure MESSAGE but never suppresses the failure.
// Remove an entry once the table is physically gone from all environments.
const RETIRED_TABLES = new Set([
  // Migration 013 — drop_deprecated_service_tables.sql
  "expert_selected_services",
  "expert_custom_services",

  // Migration 158 — retire_service_demand_requests.sql (guarded DROP)
  "service_demand_requests",

  // Migration 167 — drop_activity_comments.sql (guarded DROP)
  "activity_comments",

  // Migration 168 — archive_activity_bookings.sql (archive-then-guarded-DROP)
  "activity_bookings",

  // Migration 176 — retire_amadeus_flight_transfer_safety_cache.sql
  // (Amadeus decommission ruling 34, 2026-08-05)
  "flight_cache",
  "transfer_cache",
  "safety_cache",

  // Migration 226 — retire_deprecated_expert_city_queues.sql
  // (replaced by scoring-based lead routing, 2026-06)
  "_deprecated_expert_city_queues",
]);

/**
 * Recursively collect all .ts files under a directory.
 * pgTable declarations live across shared/schema.ts and sub-modules such as
 * shared/models/auth.ts, shared/models/chat.ts, shared/guest-invites-schema.ts, etc.
 */
function collectTsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

/** Parse every pgTable("table_name", …) call from all .ts files under shared/. */
function extractDeclaredTables(sharedDir) {
  const tsFiles = collectTsFiles(sharedDir);
  const declared = new Set();
  const re = /pgTable\(\s*["'`]([^"'`]+)["'`]/g;
  for (const filePath of tsFiles) {
    const src = fs.readFileSync(filePath, "utf8");
    let m;
    while ((m = re.exec(src)) !== null) {
      declared.add(m[1]);
    }
  }
  return declared;
}

/** Query all user tables in the public schema. */
async function fetchDbTables(client) {
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type   = 'BASE TABLE'
    ORDER BY table_name
  `);
  return new Set(rows.map((r) => r.table_name));
}

/**
 * Core classification logic — separated so it can be unit-tested without a DB.
 *
 * Returns { retirementPending: string[], trulyUndeclared: string[] }.
 * Any non-empty result means the check should fail.
 */
function classifyUndeclared(dbTables, declared) {
  const retirementPending = [];
  const trulyUndeclared = [];

  for (const table of [...dbTables].sort()) {
    if (declared.has(table)) continue;      // declared in schema — OK
    if (SYSTEM_TABLES.has(table)) continue; // system-managed — OK

    if (RETIRED_TABLES.has(table)) {
      retirementPending.push(table);        // known retirement, migration not yet applied
    } else {
      trulyUndeclared.push(table);          // no migration, no declaration — unknown drift
    }
  }

  return { retirementPending, trulyUndeclared };
}

// ── Self-test ──────────────────────────────────────────────────────────────────
function runSelfTest(sharedDir) {
  // 1. Schema parse: must find a large number of declared tables.
  const declared = extractDeclaredTables(sharedDir);
  if (declared.size < 50) {
    console.error(
      `SELF-TEST FAIL: only ${declared.size} tables parsed from shared/ (expected ≥50)`,
    );
    process.exit(1);
  }
  console.log(
    `  ✓ schema parse: ${declared.size} tables found across all shared/**/*.ts files`,
  );

  // 2. Fail-path — undeclared table: a table present in the DB but absent from
  //    schema.ts must always produce a non-empty result, regardless of RETIRED_TABLES.
  const fakeUndeclared = new Set(["some_new_migration_only_table"]);
  const r1 = classifyUndeclared(fakeUndeclared, declared);
  if (r1.trulyUndeclared.length !== 1 || r1.trulyUndeclared[0] !== "some_new_migration_only_table") {
    console.error("SELF-TEST FAIL: undeclared table was not flagged");
    process.exit(1);
  }
  console.log("  ✓ fail-path (undeclared): correctly flagged");

  // 3. Fail-path — retirement pending: a table in RETIRED_TABLES that still exists in
  //    the DB must produce a non-empty retirementPending result (not silently pass).
  const firstRetired = [...RETIRED_TABLES][0];
  const r2 = classifyUndeclared(new Set([firstRetired]), declared);
  if (r2.retirementPending.length !== 1) {
    console.error(
      `SELF-TEST FAIL: RETIRED_TABLES entry "${firstRetired}" still present in DB was not flagged`,
    );
    process.exit(1);
  }
  console.log(
    `  ✓ fail-path (retirement pending): "${firstRetired}" correctly flagged when still in DB`,
  );

  // 4. Pass-path — declared table and system table must be silently ignored.
  const knownDeclared = [...declared][0];
  const r3 = classifyUndeclared(
    new Set([knownDeclared, "sessions", "schema_migrations"]),
    declared,
  );
  if (r3.retirementPending.length !== 0 || r3.trulyUndeclared.length !== 0) {
    console.error("SELF-TEST FAIL: declared/system tables incorrectly flagged");
    process.exit(1);
  }
  console.log("  ✓ pass-path: declared and system tables correctly ignored");

  console.log(
    `\nSELF-TEST PASS — all 4 assertions passed`,
  );
  console.log(`  RETIRED_TABLES (${RETIRED_TABLES.size}): ${[...RETIRED_TABLES].join(", ")}`);
  console.log(`  SYSTEM_TABLES  (${SYSTEM_TABLES.size}):  ${[...SYSTEM_TABLES].join(", ")}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  const sharedDir = path.join(process.cwd(), "shared");

  if (!fs.existsSync(path.join(sharedDir, "schema.ts"))) {
    console.error("ERROR: shared/schema.ts not found — run from the project root.");
    process.exit(1);
  }

  if (arg === "--self-test") {
    console.log("Running self-test (no DB connection needed)...\n");
    runSelfTest(sharedDir);
    process.exit(0);
  }

  const connectionString = arg || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "ERROR: no database URL supplied.\n" +
        "  Usage: node scripts/check-undeclared-tables.cjs [DATABASE_URL]\n" +
        "  Or set the DATABASE_URL environment variable.",
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    console.error("ERROR: could not connect to database:", err.message);
    process.exit(1);
  }

  let dbTables, declared;
  try {
    [dbTables, declared] = await Promise.all([
      fetchDbTables(client),
      Promise.resolve(extractDeclaredTables(sharedDir)),
    ]);
  } finally {
    await client.end();
  }

  const { retirementPending, trulyUndeclared } = classifyUndeclared(dbTables, declared);

  console.log(
    `Checked ${dbTables.size} DB tables against ${declared.size} declared in shared/**/*.ts`,
  );

  const hasFailures = retirementPending.length > 0 || trulyUndeclared.length > 0;

  if (retirementPending.length > 0) {
    console.error(
      `\n🚨 ${retirementPending.length} table(s) are in RETIRED_TABLES but still present in the DB.`,
    );
    console.error(
      "   Their retirement migration is registered but has not yet been applied.\n" +
        "   Run migrations before publishing to avoid a silent DROP by drizzle-kit push.\n",
    );
    for (const table of retirementPending) {
      console.error(`  ✗  ${table}  (retirement pending — run: npx tsx scripts/run-migrations.ts)`);
    }
  }

  if (trulyUndeclared.length > 0) {
    console.error(
      `\n🚨 ${trulyUndeclared.length} table(s) exist in the DB but are absent from shared/schema.ts`,
    );
    console.error(
      "   drizzle-kit push (i.e. the publish flow) will propose to DROP these.\n",
    );
    for (const table of trulyUndeclared) {
      console.error(`  ✗  ${table}`);
    }
    console.error("\nFix options (pick one per table):");
    console.error(
      "  A) Declare the table in shared/schema.ts   — if it should be kept.",
    );
    console.error(
      "  B) Retire it via a guarded migration        — if it is dead and safe to drop.",
    );
    console.error(
      "     After writing + registering the migration, add the name to RETIRED_TABLES",
    );
    console.error(
      "     in this script so the pending-retirement message appears until migration runs.",
    );
  }

  if (!hasFailures) {
    console.log(
      "\n✓ No undeclared tables found. drizzle-kit push will not propose any unexpected DROPs.",
    );
    process.exit(0);
  }

  process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
