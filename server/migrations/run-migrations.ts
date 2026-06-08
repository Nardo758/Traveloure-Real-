/**
 * SQL Migration Runner
 * Applies numbered SQL migration files in order, idempotent safe (uses IF NOT EXISTS).
 * Called at startup BEFORE seeding. Throws on failure so the server never starts with
 * a partially migrated schema — this prevents silent runtime failures in ESO write/read paths.
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
  "050_service_bookings_service_id_nullable.sql",
];

export async function runMigrations(): Promise<void> {
  for (const file of MIGRATION_FILES) {
    const filePath = join(__dirname_local, file);
    const content = readFileSync(filePath, "utf-8");
    try {
      await db.execute(sql.raw(content));
      console.log(`[Migrations] Applied: ${file}`);
    } catch (err: any) {
      // IF NOT EXISTS / IF EXISTS guards in our SQL files mean the only expected
      // "error" for already-applied migrations is a silent no-op, not an exception.
      // Any real error here (missing column, syntax error, DB unreachable) must be
      // surfaced immediately — do not swallow it.
      console.error(`[Migrations] FATAL: ${file} failed:`, err?.message ?? err);
      throw err; // Fail-fast: prevents server from starting with a bad schema
    }
  }
}
