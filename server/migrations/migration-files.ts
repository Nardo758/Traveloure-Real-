/**
 * Canonical migration chain registration — side-effect-free.
 *
 * Keep runtime and tests on this single list. Importing from here avoids
 * pulling in the DB client during chain-integrity checks.
 *
 * Notes:
 * - `052_phase5_expert_endorsements.sql` is intentionally excluded. It is a
 *   superseded duplicate schema attempt for `upsell_expert_endorsements` whose
 *   columns (service_id, offering_type_key, city_key, active) diverge from the
 *   live Drizzle schema (scope, trip_id, neighborhood_id, offering_id). The CI
 *   workflow runs drizzle-kit push before migrations, so the table already exists
 *   without an `active` column when 052 runs — its partial indexes would crash.
 *   Do NOT register or execute this file (per architecture doc).
 * - `051_affiliate_booking_trip_link.sql` was renamed 060_affiliate_booking_trip_link.sql
 *   to eliminate the duplicate 051_ prefix collision with
 *   051_schema_migrations_ledger_bootstrap.sql.
 * - `058_*` is intentionally absent — the planned migration was cancelled and its DDL
 *   was folded into `057_expert_offering_type_fk.sql`. The sequence jumps from 057 → 059.
 */
export const MIGRATION_FILES = [
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
  "067_season_tag_on_offering_types.sql",
  "068_service_demand_requests.sql",
  "069_demand_request_notified_at.sql",
  "070_content_impressions.sql",
  "071_impressions_dedup_index.sql",
  "072_itinerary_changes_source_tracking.sql",
  "073_affiliate_clicks_content_fields.sql",
  "074_seed_feed_composition_settings.sql",
  "075_seed_feed_composition_settings.sql",
] as const;
