#!/usr/bin/env node
/**
 * preview-ai-cost-tracking-shape.cjs — the READ-ONLY pre-publish go/no-go for migration 310.
 * Ledger `2026-09-17-ai-cost-actor-id`; CLAUDE.md §20, the "Replit deploy-push vs. our migrations"
 * CRITICAL block, LD 44 (f), §13, `docs/RELEASE.md`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ai_cost_tracking` is the table CLAUDE.md names BY NAME as the deploy-push casualty: it was created
 * by `025b_ai_cost_tracking.sql`, that migration is already stamped, and Replit's publish runs an
 * automatic `drizzle-kit push` from `shared/schema.ts` which is AUTHORITATIVE over every table and
 * index it does not find declared there. A publish that drops it would be permanent and silent —
 * `runMigrations()` would never recreate it, and the platform's AI spend would stop being recorded.
 *
 * The table IS declared now. What no file can tell you is whether the declaration matches the shape
 * PRODUCTION actually carries — that is a fact about that database. So this script is run against the
 * real database BEFORE publishing 310, and a human reads its output.
 *
 * THE ANSWER YOU ARE LOOKING FOR: the deploy push must offer EXACTLY ONE statement,
 *
 *     ALTER TABLE ai_cost_tracking ADD COLUMN actor_id varchar(255);
 *
 * and nothing else. Any OTHER difference this script reports means the declaration disagrees with
 * production on something 310 did not change — which is the §20 DECLINE case: decline the deploy
 * prompt, fix the declaration (or the checkout), and never approve the diff.
 *
 * IT NEVER WRITES. `SET TRANSACTION READ ONLY` is issued before any query, and there is no INSERT,
 * UPDATE, DELETE or ALTER in this file. Node built-ins plus `pg`, nothing else.
 *
 * EXIT CODES. 0 = the only difference is the expected missing `actor_id` (or nothing at all, on a
 *                 database where 310 has already applied). Publishable as far as this can tell.
 *             1 = at least one UNEXPECTED difference. Do not publish; do not approve the deploy SQL.
 *             2 = could not connect, could not query, or the table is ABSENT. Never treat 2 as a pass
 *                 — an absent table here means the push would CREATE it, and the rows are already gone.
 *
 * NEGATIVE SPACE (§18d) — what this preview does NOT tell you
 * -----------------------------------------------------------
 *   • It does not run `drizzle-kit push` and therefore cannot PROMISE the push plan. It reports what
 *     the push would find to disagree about: column names, data types, lengths/precision, nullability
 *     and defaults, plus index names and their definitions. A drizzle-internal difference outside
 *     those (a generated constraint name, say) is invisible here.
 *   • It compares columns BY NAME, never by ordinal position. `ADD COLUMN` appends, so after 310 the
 *     live column order differs from the declaration's order on every database — that is expected and
 *     is not a difference the push acts on.
 *   • ONE table. It says nothing about any other object in the same release; the table-existence
 *     sweep (`check-undeclared-tables.cjs`) and `preflight-prod-constraints.cjs` are those instruments.
 *   • It checks the SHAPE, never the DATA. It does not count rows, does not look at attribution, and
 *     cannot tell you whether any spend was lost before 310 — a row that was never written leaves
 *     nothing to find (§13), which is the whole reason the writer now logs its own failures.
 *   • `--self-test` runs NO database query at all. It only proves this script's expectation table has
 *     not drifted from `shared/schema.ts`; a green self-test says nothing about production.
 *
 * USAGE
 * -----
 *   node scripts/preview-ai-cost-tracking-shape.cjs "<PROD_DATABASE_URL>"
 *   DATABASE_URL=... node scripts/preview-ai-cost-tracking-shape.cjs
 *   node scripts/preview-ai-cost-tracking-shape.cjs --json        # machine-readable, same findings
 *   node scripts/preview-ai-cost-tracking-shape.cjs --self-test   # no DB; checks against schema.ts
 */

"use strict";

const fs = require("fs");
const path = require("path");

const TABLE = "ai_cost_tracking";
/** The one column migration 310 adds — the only difference that is allowed to be present. */
const EXPECTED_MISSING_COLUMN = "actor_id";

/**
 * THE DECLARED SHAPE, as `shared/schema.ts` states it and `025b_ai_cost_tracking.sql` + migration 310
 * create it. `--self-test` re-derives the column and index NAME SETS from `shared/schema.ts` and fails
 * if this table has drifted from the declaration, so the two cannot silently disagree.
 *
 * `default` is a PATTERN (substring, lowercased) because Postgres renders the same default several
 * ways across versions; `null` means "no default is expected".
 */
const EXPECTED_COLUMNS = {
  id: { type: "uuid", nullable: false, default: "gen_random_uuid()" },
  source_type: { type: "character varying", maxLength: 50, nullable: false, default: null },
  model_used: { type: "character varying", maxLength: 100, nullable: true, default: null },
  request_id: { type: "character varying", maxLength: 255, nullable: true, default: null },
  actor_id: { type: "character varying", maxLength: 255, nullable: true, default: null },
  user_id: { type: "uuid", nullable: true, default: null },
  cost: { type: "numeric", precision: 10, scale: 6, nullable: false, default: null },
  tokens_in: { type: "integer", nullable: true, default: null },
  tokens_out: { type: "integer", nullable: true, default: null },
  created_at: { type: "timestamp without time zone", nullable: false, default: "now()" },
  updated_at: { type: "timestamp without time zone", nullable: false, default: "now()" },
};

/**
 * Index names the declaration carries, plus the primary key's implicit index. Migration 310 adds NO
 * index, deliberately — see its header: the one actor-filtering reader filters on the EXPRESSION
 * `COALESCE(actor_id, user_id::text)`, which a plain btree on `actor_id` could not serve.
 */
const EXPECTED_INDEXES = {
  ai_cost_tracking_pkey: { primary: true },
  idx_ai_cost_tracking_source_type_created: { primary: false },
  idx_ai_cost_tracking_user_id_created: { primary: false },
};

const COLUMNS_SQL = `
  SELECT column_name, data_type, is_nullable, column_default,
         character_maximum_length, numeric_precision, numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = '${TABLE}'
  ORDER BY column_name
`;

const INDEXES_SQL = `
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = '${TABLE}'
  ORDER BY indexname
`;

// ────────────────────────────────────────────────────────────────────────────────
// --self-test: the expectation table above vs. the declaration in shared/schema.ts
// ────────────────────────────────────────────────────────────────────────────────

/** Pull the `aiCostTracking` pgTable block out of shared/schema.ts. Returns its source text. */
function readDeclarationBlock() {
  const file = path.join(__dirname, "..", "shared", "schema.ts");
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf('export const aiCostTracking = pgTable("ai_cost_tracking"');
  if (start === -1) {
    throw new Error(
      "shared/schema.ts no longer declares aiCostTracking. That table is CLAUDE.md's named " +
        "deploy-push casualty — an undeclared table is DROPPED at publish and never recreated.",
    );
  }
  // The declaration ends at the first `}));` at column 0 after the start.
  const end = src.indexOf("\n}));", start);
  if (end === -1) throw new Error("could not find the end of the aiCostTracking declaration");
  return src.slice(start, end + 5);
}

function selfTest() {
  const block = readDeclarationBlock();

  // Column names: `name: type("db_column"` — the second string argument of each drizzle builder.
  const declaredColumns = new Set();
  for (const m of block.matchAll(/^\s{2}(?:\w+): (\w+)\("([a-z0-9_]+)"/gm)) {
    // The index entries in the second pgTable argument share this shape; they are not columns.
    if (m[1] === "index" || m[1] === "uniqueIndex") continue;
    declaredColumns.add(m[2]);
  }
  // Index names: `index("idx_name")`. The primary key's index is implicit and is not written here.
  const declaredIndexes = new Set();
  for (const m of block.matchAll(/index\("([a-z0-9_]+)"\)/g)) declaredIndexes.add(m[1]);

  const problems = [];
  const expectedColumns = new Set(Object.keys(EXPECTED_COLUMNS));
  for (const c of expectedColumns) {
    if (!declaredColumns.has(c)) problems.push(`this script expects column "${c}", schema.ts does not declare it`);
  }
  for (const c of declaredColumns) {
    if (!expectedColumns.has(c)) problems.push(`schema.ts declares column "${c}", this script does not expect it`);
  }
  const expectedIndexes = new Set(Object.keys(EXPECTED_INDEXES).filter((n) => !EXPECTED_INDEXES[n].primary));
  for (const i of expectedIndexes) {
    if (!declaredIndexes.has(i)) problems.push(`this script expects index "${i}", schema.ts does not declare it`);
  }
  for (const i of declaredIndexes) {
    if (!expectedIndexes.has(i)) problems.push(`schema.ts declares index "${i}", this script does not expect it`);
  }
  if (!declaredColumns.has(EXPECTED_MISSING_COLUMN)) {
    problems.push(`schema.ts does not declare "${EXPECTED_MISSING_COLUMN}" — migration 310's column must be declared`);
  }

  if (problems.length) {
    console.error("[ai-cost-shape] SELF-TEST FAILED — this script has drifted from shared/schema.ts:");
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
  console.log(
    `[ai-cost-shape] self-test OK — ${declaredColumns.size} columns and ${declaredIndexes.size} named ` +
      "indexes, matching shared/schema.ts exactly. No database was contacted.",
  );
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────────
// The live comparison
// ────────────────────────────────────────────────────────────────────────────────

function normalizeDefault(d) {
  return (d ?? "").toLowerCase();
}

function compareColumns(rows) {
  const live = new Map(rows.map((r) => [r.column_name, r]));
  const differences = [];

  for (const [name, exp] of Object.entries(EXPECTED_COLUMNS)) {
    const got = live.get(name);
    if (!got) {
      differences.push({
        column: name,
        kind: "missing_in_db",
        detail: `declared but ABSENT in this database — the push would ADD it`,
      });
      continue;
    }
    if (got.data_type !== exp.type) {
      differences.push({ column: name, kind: "type", detail: `declared ${exp.type}, database has ${got.data_type}` });
    }
    if (exp.maxLength !== undefined && Number(got.character_maximum_length) !== exp.maxLength) {
      differences.push({
        column: name,
        kind: "length",
        detail: `declared varchar(${exp.maxLength}), database has ${got.character_maximum_length ?? "no length"}`,
      });
    }
    if (exp.precision !== undefined && (Number(got.numeric_precision) !== exp.precision || Number(got.numeric_scale) !== exp.scale)) {
      differences.push({
        column: name,
        kind: "numeric",
        detail: `declared numeric(${exp.precision},${exp.scale}), database has numeric(${got.numeric_precision},${got.numeric_scale})`,
      });
    }
    const dbNullable = got.is_nullable === "YES";
    if (dbNullable !== exp.nullable) {
      differences.push({
        column: name,
        kind: "nullability",
        detail: `declared ${exp.nullable ? "NULLABLE" : "NOT NULL"}, database has ${dbNullable ? "NULLABLE" : "NOT NULL"}`,
      });
    }
    const dbDefault = normalizeDefault(got.column_default);
    if (exp.default === null) {
      if (dbDefault) differences.push({ column: name, kind: "default", detail: `declared no default, database has ${got.column_default}` });
    } else if (!dbDefault.includes(exp.default)) {
      differences.push({ column: name, kind: "default", detail: `declared default ${exp.default}, database has ${got.column_default ?? "none"}` });
    }
  }

  for (const name of live.keys()) {
    if (!(name in EXPECTED_COLUMNS)) {
      differences.push({
        column: name,
        kind: "undeclared_in_schema",
        detail: "present in the database and NOT declared in shared/schema.ts — the push would DROP it",
      });
    }
  }
  return differences;
}

function compareIndexes(rows) {
  const live = new Map(rows.map((r) => [r.indexname, r.indexdef]));
  const differences = [];
  for (const name of Object.keys(EXPECTED_INDEXES)) {
    if (!live.has(name)) differences.push({ index: name, kind: "missing_in_db", detail: "declared but ABSENT in this database" });
  }
  for (const [name, def] of live.entries()) {
    if (!(name in EXPECTED_INDEXES)) {
      differences.push({ index: name, kind: "undeclared_in_schema", detail: `present and undeclared — the push would DROP it: ${def}` });
    }
  }
  return differences;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();

  const json = argv.includes("--json");
  const url = argv.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;
  if (!url) {
    console.error('No database URL. Usage: node scripts/preview-ai-cost-tracking-shape.cjs "<DATABASE_URL>"');
    process.exit(2);
  }

  const { Client } = require("pg");
  const client = new Client({ connectionString: url });
  let columnRows;
  let indexRows;
  try {
    await client.connect();
    // Belt and braces: this session may not write, whatever a future edit above says.
    await client.query("SET TRANSACTION READ ONLY");
    columnRows = (await client.query(COLUMNS_SQL)).rows;
    indexRows = (await client.query(INDEXES_SQL)).rows;
  } catch (err) {
    console.error(`[ai-cost-shape] query failed: ${err.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }

  if (columnRows.length === 0) {
    console.error(
      `[ai-cost-shape] TABLE ${TABLE} IS ABSENT from this database. This is the loss CLAUDE.md warns ` +
        "about, not a clean slate: migration 025b is already stamped, so runMigrations() will NEVER " +
        "recreate it and every cost row it held is gone. Escalate — do not publish.",
    );
    process.exit(2);
  }

  const columnDiffs = compareColumns(columnRows);
  const indexDiffs = compareIndexes(indexRows);

  const expectedOnly =
    columnDiffs.length === 1 &&
    columnDiffs[0].column === EXPECTED_MISSING_COLUMN &&
    columnDiffs[0].kind === "missing_in_db" &&
    indexDiffs.length === 0;
  const clean = columnDiffs.length === 0 && indexDiffs.length === 0;
  const ok = clean || expectedOnly;

  if (json) {
    console.log(JSON.stringify({ table: TABLE, columnDiffs, indexDiffs, expectedOnly, clean, ok }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  console.log(
    `[ai-cost-shape] READ-ONLY shape preview of ${TABLE} for migration 310 ` +
      "(ledger 2026-09-17-ai-cost-actor-id). Nothing was written.\n",
  );
  console.log(`Columns in this database: ${columnRows.length}. Indexes: ${indexRows.length}.\n`);

  if (clean) {
    console.log(
      "NO DIFFERENCES. Migration 310 has already applied here and the declaration matches it exactly.\n" +
        "The deploy push should propose NOTHING for this table.",
    );
    process.exit(0);
  }

  console.log("DIFFERENCES between shared/schema.ts and this database:");
  for (const d of columnDiffs) console.log(`  column ${d.column.padEnd(14)} [${d.kind}] ${d.detail}`);
  for (const d of indexDiffs) console.log(`  index  ${d.index.padEnd(14)} [${d.kind}] ${d.detail}`);
  console.log("");

  if (expectedOnly) {
    console.log(
      `EXPECTED. The single difference is the missing "${EXPECTED_MISSING_COLUMN}", which migration 310 adds.\n` +
        "The deploy push must offer EXACTLY:\n" +
        `    ALTER TABLE ${TABLE} ADD COLUMN actor_id varchar(255);\n` +
        "and nothing else. If it offers anything more — any DROP, any ALTER COLUMN TYPE, any index\n" +
        "statement — DECLINE it (CLAUDE.md §20) and escalate: the declaration is wrong, not production.",
    );
    process.exit(0);
  }

  console.error(
    "UNEXPECTED. At least one difference above is NOT the actor_id column migration 310 adds.\n" +
      "Do NOT publish and do NOT approve the deploy-time SQL (CLAUDE.md §20 — the deploy diff is not a\n" +
      "schema authority). A column or index the database has and shared/schema.ts does not declare is\n" +
      "one the publish-time push will DROP, permanently, with no migration left to recreate it.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`[ai-cost-shape] ${err.message}`);
  process.exit(2);
});
