/**
 * SQL Migration Runner
 * Applies numbered SQL migration files in order, idempotent safe (uses IF NOT EXISTS).
 * Called at startup BEFORE seeding. Throws on failure so the server never starts with
 * a partially migrated schema — this prevents silent runtime failures in ESO write/read paths.
 *
 * Three operational modes (set via env vars before invoking):
 *
 *  MIGRATION_DRY_RUN=true        — Read-only audit: reports which files would apply without
 *                                   mutating the database at all (not even the ledger table).
 *                                   Safe to run against prod to audit before a live run.
 *
 *  MIGRATION_BOOTSTRAP_ONLY=true — Prod ledger bootstrap: creates the schema_migrations table
 *                                   and stamps migrations 001–051 as already-applied (ON CONFLICT DO NOTHING)
 *                                   WITHOUT executing any of their DDL. Migrations 053–066 are NOT
 *                                   stamped — they apply normally on first `npm start` after bootstrap.
 *                                   Use on a prod DB that was built from Drizzle snapshots with no
 *                                   migration history.
 *
 *  (neither)                      — Normal startup mode: applies each pending file once, records it.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { MIGRATION_FILES } from "./migration-files";

// CJS-safe dirname: never use import.meta.url — it is undefined in the
// production CJS bundle (dist/index.cjs) and the try/catch does not
// reliably intercept it after esbuild's transform. Instead probe __dirname
// (always defined in CJS) then fall back to process.cwd().
const __dirname_local = (() => {
  // In the production bundle __dirname === "dist/" — go up one level to reach
  // "server/migrations". In development tsx sets __dirname per-file correctly.
  if (typeof __dirname !== "undefined") {
    const candidate = join(__dirname, "..", "server", "migrations");
    if (existsSync(candidate)) return candidate;
    // __dirname already points at server/migrations/ (tsx dev)
    if (existsSync(join(__dirname, "006_eso_canonicalization.sql")))
      return __dirname;
  }
  // Ultimate fallback: workspace root + server/migrations
  return join(process.cwd(), "server", "migrations");
})()

export type MigrationResult =
  | { dryRun: false; bootstrapOnly: false; applied: string[]; skipped: string[] }
  | { dryRun: true; bootstrapOnly: false; wouldApply: string[]; skipped: string[] }
  | { dryRun: false; bootstrapOnly: true; stamped: string[]; alreadyRecorded: string[] };

/**
 * Check (non-mutating) whether the schema_migrations ledger table exists.
 */
async function ledgerExists(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'schema_migrations'
    ) AS "exists"
  `);
  return Boolean((result.rows?.[0] as { exists: boolean } | undefined)?.exists);
}

/**
 * Detects a pre-ledger production database: one that was built from Drizzle
 * snapshots (schema already applied) but has never had the bootstrap run.
 * Probe: if expert_service_offerings exists, the Drizzle schema is present.
 */
async function isPreLedgerProdDb(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'expert_service_offerings'
    ) AS "exists"
  `);
  return Boolean((result.rows?.[0] as { exists: boolean } | undefined)?.exists);
}

/**
 * Read the set of already-recorded migration names from the ledger.
 * Caller must ensure the ledger exists first.
 */
async function readLedger(): Promise<Set<string>> {
  const recorded = await db.execute(sql`SELECT migration_name FROM schema_migrations`);
  return new Set<string>((recorded.rows ?? []).map((r: any) => r.migration_name));
}

/**
 * Applies each file in MIGRATION_FILES exactly once per database, tracked in a
 * `schema_migrations` ledger (migration_name PK + applied_at). On every startup:
 *   - ensure the ledger table exists,
 *   - for each file NOT yet recorded: run it, then record it,
 *   - skip files already recorded.
 *
 * The IF NOT EXISTS / ON CONFLICT guards in the SQL files are retained as a
 * TRANSITION SAFETY NET: on a pre-ledger database the first run re-applies every
 * file harmlessly (each is idempotent — verified) and records it; from then on
 * recorded files are skipped. This needs zero knowledge of the DB's prior state.
 *
 * Returns a summary so callers / CI can assert idempotency (a second run must
 * apply nothing). Still fail-fast: a real SQL error aborts startup.
 */
export async function runMigrations(): Promise<MigrationResult> {
  const isDryRun = process.env.MIGRATION_DRY_RUN === "true";
  const isBootstrapOnly = process.env.MIGRATION_BOOTSTRAP_ONLY === "true";

  // ── DRY-RUN MODE: purely read-only, zero mutations ──────────────────────────
  if (isDryRun) {
    const hasLedger = await ledgerExists();
    const already = hasLedger ? await readLedger() : new Set<string>();

    const wouldApply: string[] = [];
    const skipped: string[] = [];

    if (!hasLedger) {
      console.log("[Migrations][DRY-RUN] schema_migrations table does not exist — all files would apply.");
    }

    for (const file of MIGRATION_FILES) {
      if (already.has(file)) {
        skipped.push(file);
      } else {
        wouldApply.push(file);
        console.log(`[Migrations][DRY-RUN] Would apply: ${file}`);
      }
    }

    console.log(
      `[Migrations][DRY-RUN] Summary — would apply ${wouldApply.length}, ` +
      `already recorded (skip) ${skipped.length}.`
    );
    return { dryRun: true, bootstrapOnly: false, wouldApply, skipped };
  }

  // ── BOOTSTRAP-ONLY MODE: stamp ledger without running 001-050 DDL ───────────
  if (isBootstrapOnly) {
    return bootstrapProductionLedger();
  }

  // ── NORMAL STARTUP MODE ──────────────────────────────────────────────────────

  // ── AUTO-BOOTSTRAP: detect a prod DB that needs ledger gap-filling ──────────
  //
  // Two cases that both require the bootstrap to run:
  //   A. No ledger at all + schema tables exist → Drizzle-push prod, bootstrap never ran.
  //   B. Ledger exists but is missing any migration 001-051 + schema tables exist →
  //      A previous deploy partially built the ledger (e.g. stamped 001-006, crashed on
  //      007 because the table hit the 1600-column limit) and needs the gaps filled.
  //
  // On a fresh dev DB there are no tables, so isPreLedgerProdDb() returns false and
  // this block is skipped — all migrations run from scratch as normal.

  // Ensure ledger table exists before we read it (handles case A where it's absent).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const already = await readLedger();

  // Migrations 001–051 that are absent from the ledger.
  const earlyMigrations = MIGRATION_FILES.filter((f) => {
    const num = parseInt(f.split("_")[0], 10);
    return num >= 1 && num <= 51;
  });
  const missingEarly = earlyMigrations.filter((f) => !already.has(f));

  if (missingEarly.length > 0 && await isPreLedgerProdDb()) {
    console.log(
      `[Migrations] Ledger is missing ${missingEarly.length} early migration(s) ` +
      `(${missingEarly.slice(0, 3).join(", ")}${missingEarly.length > 3 ? "…" : ""}) ` +
      `but schema tables exist — auto-bootstrapping to fill gaps...`
    );
    await bootstrapProductionLedger();
    console.log("[Migrations] Auto-bootstrap complete. Continuing with pending migrations.");
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of MIGRATION_FILES) {
    if (already.has(file)) {
      skipped.push(file);
      continue;
    }
    const filePath = join(__dirname_local, file);
    const content = readFileSync(filePath, "utf-8");
    try {
      // Use pool.query() directly so multi-statement SQL files execute correctly.
      // Drizzle's db.execute() wraps single statements and can mishandle files
      // that contain multiple statements (ALTER TABLE + CREATE INDEX etc.).
      await pool.query(content);
      // Record only after the file applied cleanly. If the process dies between
      // apply and record, the next run re-applies (idempotent) — never skips a
      // half-applied file.
      await db.execute(sql`
        INSERT INTO schema_migrations (migration_name) VALUES (${file})
        ON CONFLICT (migration_name) DO NOTHING
      `);
      applied.push(file);
      console.log(`[Migrations] Applied + recorded: ${file}`);
    } catch (err: any) {
      // Surface the full PostgreSQL error chain so production logs show the
      // real reason (relation does not exist, constraint violation, etc.)
      // rather than just Drizzle's "Failed query: <sql>" wrapper.
      console.error(`[Migrations] FATAL: ${file} failed — PostgreSQL error:`, {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        hint: err?.hint,
        position: err?.position,
        where: err?.where,
        causeMessage: err?.cause?.message,
        causeCode: err?.cause?.code,
      });
      throw err; // Fail-fast: prevents server from starting with a bad schema
    }
  }

  // Ledger gate: after the loop every file must be recorded. A missing entry
  // means either the INSERT was skipped or a concurrent truncation occurred.
  // Fail loudly before the caller considers migrations done.
  const ledgerCheck = await db.execute(sql`SELECT migration_name FROM schema_migrations`);
  const recorded2 = new Set<string>((ledgerCheck.rows ?? []).map((r: any) => r.migration_name));
  const missing = MIGRATION_FILES.filter(f => !recorded2.has(f));
  if (missing.length > 0) {
    const missingList = missing.join(", ");
    console.error(`[Migrations] LEDGER GATE FAILED — ${missing.length} file(s) not in schema_migrations: ${missingList}`);
    throw new Error(
      `Migration ledger incomplete — ${missing.length}/${MIGRATION_FILES.length} missing: ${missingList}`
    );
  }

  console.log(
    `[Migrations] Done — ${applied.length} newly applied, ${skipped.length} already recorded, ` +
    `${recorded2.size}/${MIGRATION_FILES.length} total in ledger.`
  );
  return { dryRun: false, bootstrapOnly: false, applied, skipped };
}

/**
 * Production ledger bootstrap — call ONCE on a prod DB that was built from
 * Drizzle snapshots and has no migration history.
 *
 * Creates schema_migrations (if absent) then INSERTs all 001–050 filenames
 * using ON CONFLICT DO NOTHING. The actual DDL from 001–050 is NEVER executed —
 * it assumes the prod DB already has the correct schema from Drizzle. After this
 * runs, the normal startup can begin: it will skip 001–051 (already recorded)
 * and only apply any future migrations.
 *
 * Also invoked internally when MIGRATION_BOOTSTRAP_ONLY=true is set.
 */
export async function bootstrapProductionLedger(): Promise<MigrationResult> {
  // Create ledger if absent (this single DDL call is intentionally mutating — it's the bootstrap).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Read existing entries so we can report what we actually stamped vs what was already there.
  const before = await readLedger();

  // Execute 051 bootstrap SQL: INSERT all 001–050 with ON CONFLICT DO NOTHING.
  const bootstrapPath = join(__dirname_local, "051_schema_migrations_ledger_bootstrap.sql");
  const bootstrapSql = readFileSync(bootstrapPath, "utf-8");
  await pool.query(bootstrapSql);

  // Also record 051 itself.
  await db.execute(sql`
    INSERT INTO schema_migrations (migration_name) VALUES ('051_schema_migrations_ledger_bootstrap.sql')
    ON CONFLICT (migration_name) DO NOTHING
  `);

  const after = await readLedger();
  const stamped = [...after].filter((f) => !before.has(f));
  const alreadyRecorded = [...before];

  console.log(
    `[Migrations][Bootstrap] Stamped ${stamped.length} new entries, ` +
    `${alreadyRecorded.length} were already recorded.`
  );
  return { dryRun: false, bootstrapOnly: true, stamped, alreadyRecorded };
}
