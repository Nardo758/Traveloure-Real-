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
  // 097: webhook_events table — durable log of every Stripe webhook received.
  // Enables deduplication (stripe_event_id UNIQUE), manual reconciliation via
  // GET /api/admin/webhooks/unprocessed, and daily gap-check vs Stripe's event API.
  "097_webhook_events.sql",
  // 098: dispute_id + dispute_reason columns on bookings for chargeback tracking.
  "098_bookings_dispute_columns.sql",
  // 099: Partial unique index on bookings(expert_id, booking_date, booking_time) WHERE all NOT NULL.
  // Prevents two travelers booking the same expert slot simultaneously. The application layer
  // wraps the slot-check + insert in a transaction; this index is the ultimate DB safety net,
  // converting a race-condition duplicate into a 23505 unique_violation → 409 response.
  "099_bookings_expert_slot_unique.sql",
  // 100: Add expert_concierge fee band to fee_bands table.
  // resolveCommissionRates({ source:'expert', category:'expert_concierge' }) is called by
  // concierge-router.service.ts on every /api/concierge/quote request.  Without this band
  // the call throws "commission band missing" → 500 → EscalationCTA availability check
  // silently fails → traveler always sees instant-confirm copy even when no expert exists.
  // Rate mirrors expert_standard (25% platform / 75% expert). ON CONFLICT DO NOTHING.
  "100_expert_concierge_fee_band.sql",
  // 101: Add metadata JSONB column to admin_notifications.
  // Stores a structured AI cost breakdown (total spend, request count, per-source breakdown)
  // on lead_unassigned notifications so admins can see how much AI spend was incurred in
  // the 5-minute window before each dead-end routing event. Column is nullable — existing
  // rows and non-cost notification types stay NULL.
  "101_admin_notifications_metadata.sql",
  // 102: Soft-delete columns on users table (is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  // deleted_at TIMESTAMP nullable). Hard deletes on users are prohibited — booking,
  // Stripe, and tax records must persist for financial/legal compliance. Soft-delete
  // anonymizes PII (email renamed to deleted_{id}@deleted) while keeping all FK refs intact.
  // Partial index on (is_deleted=TRUE) keeps support/recovery lookups fast.
  "102_user_soft_delete.sql",
  // 103: source, external_campaign_id, last_synced_at columns on affiliate_partners.
  // Lets synced Partnerize campaigns be distinguished from manual/scraper partners
  // (source='partnerize') and re-synced idempotently (unique index on external_campaign_id).
  "103_partnerize_affiliate_source.sql",
  // Flags AI-populated transport booking options generated from a synced
  // Partnerize campaign so the client can surface the "book with an expert"
  // CTA alongside the direct affiliate link for those offers.
  "104_transport_booking_partnerize_columns.sql",
  // 105: Suspension columns on users table (is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  // suspended_at TIMESTAMP nullable, suspension_reason VARCHAR(500) nullable).
  // Suspension is a temporary, recoverable block distinct from soft-delete — PII is NOT
  // anonymized. All login paths and isAuthenticated check isSuspended and return HTTP 403.
  // Admin actions: PATCH /api/admin/users/:id/suspend and /unsuspend.
  "105_user_suspended_flag.sql",
  // 106: qa_run_snapshots table — stores each nightly (or manual) QA run.
  // Enables diff reporting (new failures / newly passing) and the dashboard badge
  // showing last run timestamp and pass/fail counts on the QA Checklist page.
  // Triggered nightly at ~02:00 UTC via the NightlyQA scheduler, or on-demand
  // via POST /api/admin/qa/run-nightly.
  "106_qa_run_snapshots.sql",
  // 107: offering_type_key on local_expert_forms (FK → expert_offering_types)
  // and service_provider_forms (FK → service_offering_types) — the canonical
  // /earn selection the signup forms previously dropped (structural brief
  // Phase 1a, D5a). Also repairs the missing unique constraint on
  // service_offering_types.offering_type_key that schema.ts declares but the
  // shipped DDL lacked (guarded: refuses on duplicate keys). Two parallel
  // catalogs, two FKs — never one shared reference.
  "107_signup_offering_type_key.sql",
  // 108: has_insurance (nullable boolean) on service_provider_forms — the
  // provider application's self-attested insurance flag, previously collected
  // and silently dropped (structural brief Phase 1b, D4). Sits where the
  // FEE-2 brief's admin-validated insurance_tier evidence will live; NULL =
  // pre-108 "never asked", distinct from explicit false.
  "108_provider_has_insurance.sql",
  // 109: delivery_method row remap + CHECK, both provider_services and
  // service_templates (structural brief Phase 1d, remap table approved
  // Jul 11 2026). Remaps video-call→video, in-person→in_person,
  // document→pdf and digital→pdf (flattens; neither added to the enum —
  // 'digital' was surfaced by this migration's own refusal guard firing
  // on a single dev row in the Replit workspace DB); CHECK locks the D3a
  // canonical set (pdf, video, call, in_person, voice_notes,
  // async_messaging, hybrid; NULL allowed) atomically with the remap.
  // Guarded: REFUSES on any unmapped value rather than half-applying.
  // Companion code change: CANONICAL_TEMPLATES seeder literals
  // 'document'→'pdf' so fresh environments seed CHECK-clean rows.
  "109_delivery_method_remap_and_check.sql",
  // Migration 110 — Marketplace activation, Phase A (shared approval queue = Phase 4's
  // queue). Adds the provider_services approval column set (approval_status draft→submitted
  // →approved/rejected, submitted_at/reviewed_at/reviewed_by/rejection_reason) to
  // expert_templates so ONE admin queue gates both tables; backfills is_published=true rows
  // to 'submitted' (nothing grandfathered — see migration comment for the "published→needs
  // approval" effect). Adds a CHECK on expert_templates.approval_status and on
  // template_purchases.status (enumerated set: pending_payment, completed, refunded) and flips
  // the purchase-status default off 'completed' → 'pending_payment'. provider_services untouched
  // (already grandfathered 'approved'; Phase 4 wires its read-gate). Guarded/idempotent.
  "110_expert_template_approval_and_purchase_status.sql",
  // Migration 111 — F2 born-approved fix (approval lifecycle D1a CLOSED). Flips the
  // provider_services.approval_status DB column default 'approved' → 'submitted' so new
  // listings are born submitted (enter the existing /api/admin/provider-services admin review queue),
  // never born-approved. FUTURE-INSERTS-ONLY: no UPDATE over existing rows — the live
  // catalog is grandfathered 'approved' (zero outage). Pairs with the ORM default flip
  // (shared/schema.ts:578), the createProviderService server-side clamp (never trust the
  // client for 'approved'), and the completed public read-gate. Idempotent (SET DEFAULT is
  // naturally idempotent); guarded no-op if the column is already 'submitted'.
  "111_provider_services_born_submitted.sql",
  // Migration 112 — Escrow spine Phase 1 (docs/design/escrow-spine.md): unify the earning ledger
  // vocabulary across expert_earnings + provider_earnings to held/releasable/paid_out/reversed, add
  // dispute_state, add a status CHECK, flip the default to 'held'. PURE unification — releasability
  // stays computed from available_at in the summaries, so pre/post balances are identical (non-paid_out
  // statuses remap to 'held'; 'available'+available_at<=now stays releasable via the summary, 'pending'
  // stays non-releasable). 'releasable'/'reversed' are CHECK-allowed forward-compat for Phase 2/4.
  // Guarded/idempotent; affiliate ledger untouched.
  "112_escrow_earning_status_unify.sql",
  // Migration 113 — Escrow spine Phase 2b: unstick the held-NULL earnings that migration 112 left
  // without a clearance date. Backfills available_at = created_at + per-surface window (matching
  // config/earnings-hold.config.ts) on status='held' AND available_at IS NULL AND not disputed, so
  // the Phase-2 release job can finally clear these real, owed earnings. Makes them ELIGIBLE, not
  // paid (payout is admin-initiated). Guarded/idempotent.
  "113_escrow_backfill_stuck_held.sql",
  // Migration 114 — Kyoto Knowledge-Bar scored expertise gate (Phase 1). Adds nullable
  // knowledge_score jsonb + knowledge_scored_at to local_expert_forms to hold the AI-scored rubric
  // result over the knowledge-proof answers. ADVISORY: decision support for the admin queue, does
  // not auto-gate approval. Nullable/no-default so existing rows are simply "unscored". Idempotent.
  "114_kyoto_knowledge_score.sql",
  // Migration 115 — purge fabricated Fever MOCK events (source_type='fever' AND source_id LIKE
  // 'mock-%') from destination_events. Without API credentials the Fever refresher generated
  // fake events and wrote them born-'approved' onto the public By-Date calendar daily
  // (fabricated-content class, §13 family). Companion code guard: fever-cache.service skips
  // entirely when unconfigured (sibling-provider pattern). Real Fever rows untouched. Idempotent.
  "115_purge_fever_mock_events.sql",
  // Migration 116 — content_impressions completion for the feed-measurement endpoint.
  // The table itself was created by 082 but NEVER had a writer (the client impression
  // tracker POSTed to a nonexistent /api/tracking/impression — every card's
  // sourceImpressionId was null). Companion code change adds the endpoint; this migration
  // completes the table: session_id NOT NULL (guarded), the UNIQUE dedup index
  // (session_id, content_type, content_id) the client hook's contract promises (falls back
  // to non-unique + NOTICE if dupes pre-exist), and a created_at index. (content_type,
  // content_id) reads ride 082's idx_ci_content prefix. Analytics-only — no money
  // semantics, fire-and-forget writes. Guarded/idempotent.
  "116_content_impressions_tracking.sql",
  // Migration 117 — activate the built-but-dark DMO content layer (Expert Workspace).
  // Creates the 7 DMO tables (dmo_sources, dmo_raw_content, expert_dmo_collections,
  // expert_dmo_collection_items, expert_dmo_edits, content_gap_alerts, dmo_scrape_jobs).
  // The schema + routes + crawler already shipped in shared/schema.ts and
  // server/content/*, but this DDL lived unregistered in the legacy top-level
  // migrations/ dir (0010_add_dmo_content_layer.sql), so the tables never existed at
  // runtime and every DB-backed /api/expert-workspace endpoint errored. Relocated here
  // and registered so runMigrations() is authoritative. All CREATE TABLE IF NOT EXISTS +
  // ADD CONSTRAINT / CREATE INDEX IF NOT EXISTS — idempotent, no CHECK constraints (no
  // publish-time push trap). Born-hidden by design (discover_page_visible=false until
  // expert review — the D1a lesson). Ingestion is Kyoto-scoped per §12; the table set is
  // market-agnostic scaffolding.
  "117_add_dmo_content_layer.sql",
  // Migration 118 — DMO admin-intake gate ("B"). Aligns the dmo_raw_content
  // expert_workspace_visible DB DEFAULT with the ORM (now false): scraped content is born hidden
  // from experts until an admin approves it into the library. Default-only change, no backfill
  // (existing rows grandfathered — the F2 pattern), no CHECK (no publish-time push trap).
  "118_dmo_admin_intake_gate.sql",
] as const;
