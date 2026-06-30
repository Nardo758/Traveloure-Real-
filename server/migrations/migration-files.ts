/**
 * Canonical migration chain registration — side-effect-free.
 *
 * Keep runtime and tests on this single list. Importing from here avoids
 * pulling in the DB client during chain-integrity checks.
 *
 * ─── Authoring conventions ───────────────────────────────────────────────────
 *
 * See server/migrations/AUTHORING.md for the full authoring guide, including:
 *  • Idempotency requirements (IF NOT EXISTS, ON CONFLICT DO NOTHING)
 *  • How to handle superseded migrations (no-op SELECT 1 convention)
 *  • How to register, exclude, or delete a migration
 *
 * TL;DR on superseded migrations: if a migration is made redundant by a later
 * one shipping in the same release (before either has reached production),
 * replace its SQL body with `SELECT 1` and add a header comment explaining why.
 * This preserves ledger sequence continuity without running harmful DDL.
 * The runner emits a [Migrations][WARN] line for every no-op file it encounters.
 *
 * ─── Intentional gaps / exclusions ──────────────────────────────────────────
 *
 * 052  `052_phase5_expert_endorsements.sql` is excluded. It is a superseded
 *      duplicate schema attempt for `upsell_expert_endorsements` whose columns
 *      (service_id, offering_type_key, city_key, active) diverge from the live
 *      Drizzle schema (scope, trip_id, neighborhood_id, offering_id). The baseline
 *      migration (000) creates the table from the real schema, so when 052 runs
 *      the table already exists without an `active` column — its partial indexes
 *      would crash. Do NOT register or execute this file.
 *
 * 051  `051_affiliate_booking_trip_link.sql` was renamed
 *      060_affiliate_booking_trip_link.sql to eliminate the duplicate 051_
 *      prefix collision with 051_schema_migrations_ledger_bootstrap.sql.
 *
 * 058  Intentionally absent — the planned migration was cancelled and its DDL
 *      was folded into `057_expert_offering_type_fk.sql`. Sequence: 057 → 059.
 *
 * ─── 062–063 orphaned source-branch files (deleted, never registered) ────────
 *
 * 062  `062_concierge_booking_fee_band.sql` — an orphaned source-branch file
 *      that seeded the 'expert_concierge_booking' fee_band row. Its DDL is
 *      fully covered by the registered `064_concierge_booking_fee_band.sql`
 *      which contains identical idempotent DDL (ON CONFLICT DO NOTHING).
 *      Deleted from disk; was never registered here.
 *
 * 063  `063_seed_booking_concierge_offering_type.sql` — an orphaned source-
 *      branch file that seeded the 'booking_concierge' expert_offering_types
 *      row. Its DDL is fully covered by the registered
 *      `065_seed_booking_concierge_offering_type.sql`. Deleted from disk;
 *      was never registered here.
 *
 * ─── 067–074 source-branch / canonical consolidation audit ──────────────────
 *
 * During a branch merge, two files briefly existed for each number 067–074:
 * an older source-branch file and the newer canonical file now registered here.
 * Both sets had applied_at timestamps in the schema_migrations ledger (all DDL
 * used CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING — no crashes).
 * The source-branch files have been deleted from disk; the canonical files are
 * the sole authoritative versions. Per-number audit:
 *
 * 067  Retired: `067_season_tag_on_offering_types.sql`
 *      (ALTER TABLE offering_types ADD COLUMN season_tags; superseded — the
 *      seasonal data model was redesigned as a standalone seasonal_opportunities
 *      table in 068). Canonical: `067_seed_feed_composition_settings.sql`
 *      (platform_settings seed for Discover feed composition knobs).
 *
 * 068  Retired: `068_service_demand_requests.sql`
 *      (early schema draft for demand signals; superseded by the expanded
 *      service_demand_signals table in 069). Canonical: `068_season_tags.sql`
 *      (CREATE TABLE seasonal_opportunities + indexes).
 *
 * 069  Retired: `069_demand_request_notified_at.sql`
 *      (ALTER TABLE adding notified_at column; column was incorporated directly
 *      into the CREATE TABLE in 069 instead). Canonical: `069_demand_requests.sql`
 *      (CREATE TABLE service_demand_signals + market_intelligence +
 *      pricing_intelligence + demand_signals + indexes).
 *
 * 070  Retired: `070_content_impressions.sql`
 *      (early schema for provider impression counters; superseded by the
 *      richer provider_performance_metrics table in 071). Canonical:
 *      `070_service_recommendations.sql` (CREATE TABLE service_recommendations +
 *      recommendation_conversions + service_gap_analysis + indexes).
 *
 * 071  Retired: `071_impressions_dedup_index.sql`
 *      (CREATE UNIQUE INDEX IF NOT EXISTS on the early impressions table; table
 *      was superseded so index is moot). Canonical: `071_provider_impressions.sql`
 *      (CREATE TABLE provider_performance_metrics + market_intelligence +
 *      pricing_intelligence + demand_signals + indexes).
 *
 * 072  Retired: `072_itinerary_changes_source_tracking.sql`
 *      (ALTER TABLE itinerary_changes ADD COLUMN source_type; absorbed into the
 *      CREATE TABLE in a later schema iteration). Canonical:
 *      `072_changes_tracking.sql` (CREATE TABLE content_placement_rules +
 *      indexes for admin-editable affiliate/content surface placement rules).
 *
 * 073  Retired: `073_affiliate_clicks_content_fields.sql`
 *      (ALTER TABLE affiliate_clicks ADD COLUMN content_source, content_id;
 *      columns folded into the base CREATE TABLE in 073 instead). Canonical:
 *      `073_affiliate_clicks_base.sql` (CREATE TABLE affiliate_clicks +
 *      attribution columns + indexes; the ALTER in migration 005 is idempotent
 *      whether or not this CREATE ran first).
 *
 * 074  Retired: `074_seed_feed_composition_settings.sql`
 *      (a seed attempt for platform_settings; superseded by 067 which landed
 *      the same rows with the same ON CONFLICT DO NOTHING guard). Canonical:
 *      `074_affiliate_booking_requests_base.sql` (CREATE TABLE
 *      affiliate_booking_requests + indexes; migration 060 adds trip_id FK via
 *      ALTER TABLE IF NOT EXISTS idempotently).
 *
 * ─── 075 content duplicate (deleted, removed from list) ─────────────────────
 *
 * 075  `075_seed_feed_composition_settings.sql` was byte-for-byte identical to
 *      `067_seed_feed_composition_settings.sql` (same INSERT … ON CONFLICT DO
 *      NOTHING rows). Running both was harmless (idempotent) but confusing.
 *      Consolidated into 067; 075 deleted from disk and removed from this list.
 *      Any prod DB that already has 075 in schema_migrations can leave it — the
 *      runner only fails when a listed file is absent from the ledger, not vice
 *      versa. New prod deploys should stamp 075 via the bootstrap script to
 *      avoid a "file not found" error if the ledger was captured mid-conflict.
 */
export const MIGRATION_FILES = [
  // 000: Full idempotent baseline — every Drizzle-managed table with
  // CREATE TABLE IF NOT EXISTS, CREATE TYPE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
  // and FK constraints wrapped in DO $$ EXCEPTION WHEN duplicate_object THEN NULL END $$.
  // Generated from the live schema via pg_dump --schema-only. Runs first on fresh
  // databases (CI, new deploys) so that migrations 001+ can safely reference all tables.
  // On existing deployments where the schema already exists, every statement is a no-op.
  "000_baseline_schema.sql",
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
  "051_schema_migrations_ledger_bootstrap.sql",
  "053_bookings_payment_intent_unique.sql",
  "054_provider_verification_gate.sql",
  "055_category_field_schema.sql",
  "056_pricing_tiers.sql",
  "057_expert_offering_type_fk.sql",
  "059_pnc_engine_lookup_index.sql",
  "060_affiliate_booking_trip_link.sql",
  "061_affiliate_offering_types.sql",
  "062_fill_offering_gaps.sql",
  "063_local_expert_planning_sort.sql",
  "064_concierge_booking_fee_band.sql",
  "065_seed_booking_concierge_offering_type.sql",
  "066_concierge_booking_fee_percent.sql",
  "067_seed_feed_composition_settings.sql",
  "068_season_tags.sql",
  "069_demand_requests.sql",
  "070_service_recommendations.sql",
  "071_provider_impressions.sql",
  "072_changes_tracking.sql",
  "073_affiliate_clicks_base.sql",
  "074_affiliate_booking_requests_base.sql",
  "076_phase2_optimizer_prices.sql",
  "077_event_coordination_profiles.sql",
  "078_user_preferred_currency.sql",
  // Source-branch files 067–074 (original names): recovered and registered at 079–086.
  // These ran in source-branch environments under their original 06x numbers but were
  // absent from MIGRATION_FILES after the merge. All SQL is idempotent so running them
  // on environments that already applied the DDL via drizzle-kit push is a no-op.
  "079_season_tag_on_offering_types.sql",
  "080_service_demand_requests.sql",
  "081_demand_request_notified_at.sql",
  "082_content_impressions.sql",
  "083_impressions_dedup_index.sql",
  "084_itinerary_changes_source_tracking.sql",
  "085_affiliate_clicks_content_fields.sql",
  "086_seed_feed_composition_settings.sql",
  // 087: Explicit seed for the 9 service-category fee bands (activities, transport,
  // accommodation, food, dining, entertainment, shopping, sightseeing, culture).
  // These cannot be delegated to 046_phase1_5_enumerate_legacy_bands.sql because
  // 046 reads from booking_fee_configs — which is empty on a blank CI database
  // (runtime-seeded, not schema-push-seeded). Without this migration, commission.ts
  // throws on any booking whose category is one of these names, crashing the
  // server on a fresh DB and silently billing at the wrong rate otherwise.
  "087_seed_category_fee_bands.sql",
  // 088: Seed the 'dining' fee_band for existing deployments where 087 is already
  // applied. The verify-fee-config-parity CI gate calls resolveCommissionRates with
  // category='dining'; without this row the resolver throws "commission band missing".
  // Idempotent (ON CONFLICT DO NOTHING) — safe on both fresh and existing DBs.
  "088_seed_dining_fee_band.sql",
  // 089: funnel_events — append-only audit table spanning T0 (anonymous) → T7 (viral).
  // Single source of truth for conversion funnel analytics. Fire-and-forget writes;
  // never block the request path. userId nullable for pre-registration T0 events.
  "089_funnel_events.sql",
  // 090: No-op — originally widened destination_seasons.average_temp to varchar(60),
  // but migration 091 supersedes this by converting the column to TEXT entirely.
  // Kept in sequence to preserve ledger continuity; SQL body is a harmless SELECT 1.
  "090_widen_destination_seasons_average_temp.sql",
  // 091: Change destination_seasons.average_temp from varchar(60) to text.
  // Removes the length cap entirely so any future temperature description fits without hitting a limit.
  "091_average_temp_to_text.sql",
  // 092: admin_notifications table for dead-end lead alerts + fallback_message on expert_requests.
  "092_admin_notifications.sql",
  // 093: Add stripe_connect_status to local_expert_forms (not_started|pending|complete).
  "093_expert_stripe_connect_status.sql",
  // 094: Add missing indexes — local_expert_forms(status), bookings(created_at),
  //      lead_routing_logs(trip_id), expert_requests(destination_city, status), users(role).
  "094_missing_indexes.sql",
  // 095: Restore service_provider category rows in service_offering_types that were
  // deleted/deactivated by a prior task. Uses ON CONFLICT DO UPDATE SET is_active = true
  // so deactivated rows are re-activated and missing rows are inserted fresh. Covers all
  // ten service_provider categories from migration 038 plus the 12 market-scoped variants.
  "095_restore_service_provider_offering_types.sql",
  // 096: Add idempotency_key column (nullable, unique partial index) to service_bookings
  // and bookings. Prevents double-charges when the same checkout fires twice (double-click,
  // network retry). Backend checks for an existing row before inserting; Stripe receives the
  // same key so it deduplicates the PaymentIntent on its side too.
  "096_idempotency_key_bookings.sql",
] as const;
