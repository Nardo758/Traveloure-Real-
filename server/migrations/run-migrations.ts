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
 *                                   and stamps all 001–050 as already-applied (ON CONFLICT DO NOTHING)
 *                                   WITHOUT executing any of their DDL. Use on a prod DB that was
 *                                   built from Drizzle snapshots and has no migration history.
 *
 *  (neither)                      — Normal startup mode: applies each pending file once, records it.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { db } from "../db";
import { sql } from "drizzle-orm";

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

const MIGRATION_FILES = [
  "001_guest_invite_system.sql",
  "002_transport_booking_options.sql",
  "003_fix_test_account_roles.sql",
  "004_restaurant_cache.sql",
  "005_affiliate_reconciliation.sql",
  "006_eso_canonicalization.sql",
  "007_eso_workflow_columns.sql",
  "008_content_affinity_tags.sql",
  "009_cross_sell_events.sql",
  "009b_curated_by_expert.sql",
  "010_expert_request_optimization_context.sql",
  "011_provider_services_approval_status.sql",
  "012_migrate_expert_custom_services.sql",
  "013_drop_deprecated_service_tables.sql",
  "014_itinerary_item_scheduled_date.sql",
  "015_gem_image_url.sql",
  "016_eso_target_roles.sql",
  "017_optimization_fees_event_type.sql",
  "018_concierge_requests.sql",
  "019_event_packages.sql",
  "020_commission_override.sql",
  "021_password_reset_tokens.sql",
  "022_email_verification_tokens.sql",
  "023_platform_deposit_rate.sql",
  "024_experience_template_hero_fields.sql",
  "024b_provider_commission.sql",
  "025_tab_control_config.sql",
  "025b_ai_cost_tracking.sql",
  "026_trip_collaborators.sql",
  "027_insurance_tier_fields.sql",
  "028_service_bookings_insurance_fee.sql",
  "029_review_moderation.sql",
  "030_restore_expert_service_categories.sql",
  "031_phase1_scaffold_fee_bands.sql",
  "032_phase1_category_key_column.sql",
  "033_phase1_seed_fee_bands_and_settings.sql",
  "034_phase1_reconcile_service_categories.sql",
  "035_phase1_seed_template_matrix.sql",
  "036_transport_commerce_fee_config.sql",
  "037_phase2_create_offering_types.sql",
  "038_phase2_seed_service_offering_types.sql",
  "039_phase2_seed_expert_offering_types.sql",
  "040_phase2_offering_types_completeness_gate.sql",
  "041_phase3_neighborhood_spine_scaffold.sql",
  "042_phase3_seed_neighborhoods.sql",
  "043_phase3_seed_coverage_targets.sql",
  "044_phase3_neighborhood_completeness_gate.sql",
  "045_phase1_5_tip_handling_band.sql",
  "046_phase1_5_enumerate_legacy_bands.sql",
  "047_early_adopter_commission_cutoff.sql",
  "048_phase8_offering_risk_override.sql",
  "049_phase5_upsell_engine_tables.sql",
  "050_service_bookings_service_id_nullable.sql",
  // 051 must be last among the pre-ledger migrations: it marks every prior file
  // as applied (ON CONFLICT DO NOTHING), which is a no-op on a normal dev/CI DB
  // (all already recorded) and acts as a ledger bootstrap on a prod DB that was
  // seeded from Drizzle snapshots with no migration history.
  "051_schema_migrations_ledger_bootstrap.sql",
  "052_phase5_expert_endorsements.sql",
  "053_bookings_payment_intent_unique.sql",
  "054_provider_verification_gate.sql",
  "055_category_field_schema.sql",
  "056_pricing_tiers.sql",
  "057_expert_offering_type_fk.sql",
  "058_pnc_engine_lookup_index.sql",
];

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
  // Ensure the ledger table exists (idempotent DDL).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const already = await readLedger();
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
      await db.execute(sql.raw(content));
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
      // A real error here (missing column, syntax error, DB unreachable) must be
      // surfaced immediately — do not swallow it.
      console.error(`[Migrations] FATAL: ${file} failed:`, err?.message ?? err);
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
  await db.execute(sql.raw(bootstrapSql));

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
