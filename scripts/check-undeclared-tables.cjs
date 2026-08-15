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
 * against the tables declared in shared/schema.ts, subtracts the known-retired list, and
 * fails loudly on anything undeclared that drizzle-kit push would therefore propose to drop.
 *
 * USAGE
 * ─────
 *   node scripts/check-undeclared-tables.cjs
 *   node scripts/check-undeclared-tables.cjs "postgresql://..."   # explicit URL
 *   node scripts/check-undeclared-tables.cjs --self-test          # smoke-test without DB
 *
 * Uses DATABASE_URL env var when no positional argument is given.
 * Exit 0 = all DB tables are declared (safe to publish).
 * Exit 1 = undeclared tables found (investigate before publishing).
 *
 * NEGATIVE SPACE (what this script does NOT cover)
 * ─────────────────────────────────────────────────
 *   • Indexes — covered separately by preflight-prod-unique-indexes.cjs.
 *   • CHECK constraints — covered by preflight-prod-constraints.cjs.
 *   • Tables in schema.ts that are missing from the DB — that is the opposite direction
 *     (drizzle would CREATE them, which is safe).
 *   • Non-public schemas.
 *
 * UPDATING THE RETIRED LIST
 * ─────────────────────────
 * When a table is deliberately retired via a guarded migration (following the migration-158
 * pattern), add its name to RETIRED_TABLES below with a comment citing the migration number.
 * Do NOT add tables here as a substitute for either declaring them in schema.ts or retiring
 * them via migration — this list is for tables the migration chain has already physically
 * removed.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// ── Tables that drizzle-kit push will never see because they were explicitly
//    dropped by a recorded migration. Adding a table here without a matching
//    guarded migration is the wrong fix — declare it in shared/schema.ts instead.
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
]);

// ── Tables that are intentionally absent from shared/schema.ts because they
//    are managed by third-party middleware or the migration runner itself.
const SYSTEM_TABLES = new Set([
  "schema_migrations", // migration ledger — managed by run-migrations.ts
  "sessions",          // managed by connect-pg-simple (self-creates); excluded per EXECUTION_MAP.md §"Housekeeping"
]);

/**
 * Recursively collect all .ts files under a directory.
 * We need this because pgTable declarations live in shared/schema.ts AND in
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

/** Parse every pgTable("table_name", …) call from all TS files under shared/. */
function extractDeclaredTables(sharedDir) {
  const tsFiles = collectTsFiles(sharedDir);
  const declared = new Set();
  // Match pgTable("name", pgTable('name', or pgTable(`name`,
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

async function main() {
  const arg = process.argv[2];

  // ── Self-test mode ─────────────────────────────────────────────────────────
  if (arg === "--self-test") {
    const sharedDir = path.join(process.cwd(), "shared");
    if (!fs.existsSync(path.join(sharedDir, "schema.ts"))) {
      console.error("SELF-TEST FAIL: shared/schema.ts not found");
      process.exit(1);
    }
    const declared = extractDeclaredTables(sharedDir);
    if (declared.size < 50) {
      console.error(
        `SELF-TEST FAIL: only ${declared.size} tables parsed from shared/ (expected ≥50)`,
      );
      process.exit(1);
    }
    console.log(
      `SELF-TEST PASS: parsed ${declared.size} declared tables from shared/ (all .ts files)`,
    );
    console.log(`  RETIRED_TABLES list: ${[...RETIRED_TABLES].join(", ")}`);
    console.log(`  SYSTEM_TABLES list:  ${[...SYSTEM_TABLES].join(", ")}`);
    process.exit(0);
  }

  // ── Normal mode ────────────────────────────────────────────────────────────
  const connectionString = arg || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "ERROR: no database URL supplied.\n" +
        "  Usage: node scripts/check-undeclared-tables.cjs [DATABASE_URL]\n" +
        "  Or set the DATABASE_URL environment variable.",
    );
    process.exit(1);
  }

  const sharedDir = path.join(process.cwd(), "shared");
  if (!fs.existsSync(path.join(sharedDir, "schema.ts"))) {
    console.error("ERROR: shared/schema.ts not found — run from the project root.");
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

  console.log(
    `Checked ${dbTables.size} DB tables against ${declared.size} declared in shared/schema.ts`,
  );

  const undeclared = [];
  const excluded = [];

  for (const table of [...dbTables].sort()) {
    if (declared.has(table)) continue; // ✓ declared — safe

    if (RETIRED_TABLES.has(table)) {
      // Exists in DB even though migration should have dropped it — warn but don't fail.
      // (Guarded migrations refuse to drop non-empty tables; this is normal in dev.)
      excluded.push({ table, reason: "retired by migration (expected absent, but still present)" });
      continue;
    }

    if (SYSTEM_TABLES.has(table)) {
      excluded.push({ table, reason: "system/middleware-managed (intentionally undeclared)" });
      continue;
    }

    undeclared.push(table);
  }

  if (excluded.length > 0) {
    console.log("\nExcluded (known — no action needed):");
    for (const { table, reason } of excluded) {
      console.log(`  ⚠  ${table}  — ${reason}`);
    }
  }

  if (undeclared.length === 0) {
    console.log(
      "\n✓ No undeclared tables found. drizzle-kit push will not propose any unexpected DROPs.",
    );
    process.exit(0);
  }

  console.error(
    `\n🚨 ${undeclared.length} table(s) exist in the DB but are absent from shared/schema.ts`,
  );
  console.error(
    "   drizzle-kit push (i.e. the publish flow) will propose to DROP these.\n",
  );
  for (const table of undeclared) {
    console.error(`  ✗  ${table}`);
  }
  console.error(
    "\nFix options (pick one per table):",
  );
  console.error(
    "  A) Declare the table in shared/schema.ts  — if it should be kept.",
  );
  console.error(
    "  B) Retire it via a guarded migration      — if it is dead and safe to drop.",
  );
  console.error(
    "  C) Add it to RETIRED_TABLES in this script — ONLY after the guarded DROP migration",
  );
  console.error(
    "     has been written and the table has been physically removed from every environment.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
