/**
 * Migration chain registration — side-effect-free.
 *
 * Lives in its own module so test/CI tooling can import the list without
 * pulling in the DB client (which throws at import time if DATABASE_URL is
 * unset). Imported by both run-migrations.ts (the runtime) and the
 * chain-integrity test.
 *
 * 047 is intentionally absent: it was registered without a backing SQL file
 * during a merge resolution and would crash readFileSync. The 046→048 gap is
 * harmless because runMigrations iterates this array, not the filesystem.
 * Do NOT renumber 048 → 047: 048 has already been applied in environments
 * that recorded it under that name, and a rename would re-apply or desync
 * the migration ledger.
 */
export const MIGRATION_FILES = [
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
  "048_phase8_offering_risk_override.sql",
  "049_phase5_upsell_engine_tables.sql",
  "050_phase5_expert_endorsements.sql",
  "058_affiliate_booking_trip_link.sql",
  "059_pnc_engine_lookup_index.sql",
] as const;
