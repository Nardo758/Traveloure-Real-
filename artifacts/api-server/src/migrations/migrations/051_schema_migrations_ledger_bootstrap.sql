-- Migration 051: schema_migrations ledger bootstrap
--
-- PURPOSE: One-time safe bootstrap for production databases that were built from
-- Drizzle snapshots and therefore have the correct schema but no migration history.
--
-- HOW IT WORKS:
--   Every migration from 001-050 is recorded as already-applied using
--   ON CONFLICT DO NOTHING. On a prod DB with no ledger this stamps the full history
--   so that subsequent startup runs skip re-applying 001-050 (the IF NOT EXISTS guards
--   in those files make the re-run safe, but skipping is cleaner and faster).
--   On any DB that already has the ledger (dev, CI, or prod after first bootstrap)
--   every INSERT is a no-op — this file is entirely idempotent.
--
-- ORDERING: This must run after 001-050 in MIGRATION_FILES so that on a fresh
-- dev DB the real DDL migrations 001-050 actually run first, and this file's
-- ON CONFLICT DO NOTHING INSERTs are then harmless duplicates.
--
-- POST-BOOTSTRAP MIGRATIONS: Migrations 053-065 (note: 052 is intentionally
-- excluded; 058 was cancelled) are NOT stamped by this bootstrap. They are
-- applied normally on startup by runMigrations() — i.e. their SQL actually
-- executes. This includes 064_concierge_booking_fee_band.sql and
-- 065_seed_booking_concierge_offering_type.sql which seed the Booking Concierge
-- fee band and offering type respectively.

INSERT INTO schema_migrations (migration_name) VALUES
  ('001_guest_invite_system.sql'),
  ('002_transport_booking_options.sql'),
  ('003_fix_test_account_roles.sql'),
  ('004_restaurant_cache.sql'),
  ('005_affiliate_reconciliation.sql'),
  ('006_eso_canonicalization.sql'),
  ('007_eso_workflow_columns.sql'),
  ('008_content_affinity_tags.sql'),
  ('009_cross_sell_events.sql'),
  ('009b_curated_by_expert.sql'),
  ('010_expert_request_optimization_context.sql'),
  ('011_provider_services_approval_status.sql'),
  ('012_migrate_expert_custom_services.sql'),
  ('013_drop_deprecated_service_tables.sql'),
  ('014_itinerary_item_scheduled_date.sql'),
  ('015_gem_image_url.sql'),
  ('016_eso_target_roles.sql'),
  ('017_optimization_fees_event_type.sql'),
  ('018_concierge_requests.sql'),
  ('019_event_packages.sql'),
  ('020_commission_override.sql'),
  ('021_password_reset_tokens.sql'),
  ('022_email_verification_tokens.sql'),
  ('023_platform_deposit_rate.sql'),
  ('024_experience_template_hero_fields.sql'),
  ('024b_provider_commission.sql'),
  ('025_tab_control_config.sql'),
  ('025b_ai_cost_tracking.sql'),
  ('026_trip_collaborators.sql'),
  ('027_insurance_tier_fields.sql'),
  ('028_service_bookings_insurance_fee.sql'),
  ('029_review_moderation.sql'),
  ('030_restore_expert_service_categories.sql'),
  ('031_phase1_scaffold_fee_bands.sql'),
  ('032_phase1_category_key_column.sql'),
  ('033_phase1_seed_fee_bands_and_settings.sql'),
  ('034_phase1_reconcile_service_categories.sql'),
  ('035_phase1_seed_template_matrix.sql'),
  ('036_transport_commerce_fee_config.sql'),
  ('037_phase2_create_offering_types.sql'),
  ('038_phase2_seed_service_offering_types.sql'),
  ('039_phase2_seed_expert_offering_types.sql'),
  ('040_phase2_offering_types_completeness_gate.sql'),
  ('041_phase3_neighborhood_spine_scaffold.sql'),
  ('042_phase3_seed_neighborhoods.sql'),
  ('043_phase3_seed_coverage_targets.sql'),
  ('044_phase3_neighborhood_completeness_gate.sql'),
  ('045_phase1_5_tip_handling_band.sql'),
  ('046_phase1_5_enumerate_legacy_bands.sql'),
  ('047_early_adopter_commission_cutoff.sql'),
  ('048_phase8_offering_risk_override.sql'),
  ('049_phase5_upsell_engine_tables.sql'),
  ('050_service_bookings_service_id_nullable.sql')
ON CONFLICT (migration_name) DO NOTHING;
