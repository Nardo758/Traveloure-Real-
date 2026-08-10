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
  // Migration 119 — provider-hub Phase 2: transport_provided disclosure on provider_services
  // (yes/no/not_applicable). When a traveler meets the provider at the meeting point, the provider
  // declares whether transport is provided; surfaced on service-detail. New column with a DEFAULT so
  // existing rows are born 'not_applicable' (no CHECK violation); the CHECK lives only in the
  // migration, not schema.ts (no publish-time push trap — migration-109 pattern). Guarded/idempotent.
  "119_provider_services_transport_provided.sql",
  // Migration 120 — provider-hub Phase 3: link itinerary_items to a bookable platform service via a
  // nullable provider_service_id FK (ON DELETE SET NULL). Lets an expert drop an approved platform
  // service from the Workstation catalog onto the trip and keep it traceable/bookable. Additive
  // nullable column, no default/backfill/CHECK → no publish-time push trap. Guarded/idempotent.
  "120_itinerary_items_provider_service_link.sql",
  // Migration 121 — provider-hub Phase 4: partner-level admin approval on affiliate_partners
  // (draft/submitted/approved/rejected + review fields). Affiliate content is admin-gated ONCE per
  // partner; products inherit. Born 'submitted'; existing ACTIVE partners grandfathered 'approved'
  // (F2 pattern, no outage). Public reads gate on 'approved', admin reads ungated. CHECK lives only
  // in the migration and every existing row is set valid here → no publish-time push trap. Guarded.
  "121_affiliate_partner_approval.sql",
  // Phase 4.1 (§7/§8): seed coordination_floor ($499 flat) + coordination_percent (0.08)
  // fee_bands so the event-coordination fee constants become admin-editable. Idempotent
  // ON CONFLICT DO NOTHING; resolveCoordinationFee reads these with a code-constant fallback,
  // so behavior-neutral on apply. No schema/CHECK change → no publish-time push trap.
  "122_coordination_fee_bands.sql",
  // Traveler-submitted service requests ("request a service that doesn't exist yet").
  // New table + status CHECK created together (no legacy rows) → no publish-time push trap.
  "123_service_requests.sql",
  // Migration 124 — FEE-2 Phase 2: relocate insurance config read from booking_fee_configs
  // to platform_settings. Seeds three keys (insurance_enabled="false", insurance_rate_percent="0",
  // insurance_applies_to="[]") matching the booking_fee_configs column defaults exactly —
  // behavior-neutral on apply. ON CONFLICT DO NOTHING: idempotent on dev (where 124 was previously
  // applied then the file was deleted) and runs once on prod. booking_fee_configs is retained for
  // its other 7 readers (transport commission, startup seed, tip commission, etc.); only
  // commission.ts:resolveInsuranceFromCategory was migrated. platform_settings is the interim home
  // until FEE-2 Phase 1 ships the admin-validated insurance_tier (see CLAUDE.md §6). No schema/CHECK
  // change → no publish-time push trap. Closes the #819 / FEE-2 gate.
  "124_insurance_platform_settings.sql",
  // Migration 125 — Coordination fee CAPTURE + paid-signal ledger (CLAUDE.md §7 "Quote-only →
  // CAPTURED", ratified Jul 22, 2026). Adds coordination_fee_credits (one row per PAID Event-branch
  // optimize fee, applied once against a coordination charge) + fee-payment columns on
  // coordination_states (fee_payment_status CHECK unpaid|pending|paid, fee_payment_intent_id,
  // fee_amount_cents, fee_credit_cents, fee_paid_at). New table + new columns default 'unpaid'/0, so
  // the CHECK has no legacy rows to violate → no publish-time push trap. Enables the §14/§15-clean
  // POST /api/coordination-states/:id/pay (+ /pay/confirm).
  "125_coordination_fee_payments.sql",
  // Migration 126 — Tighten coordination_fee_credits event scoping (CLAUDE.md §7 follow-ups resolved).
  // Adds idx_coord_fee_credits_event_scoped on (user_id, event_type, created_at) WHERE consumed IS NULL
  // for the new multi-credit, event-scoped claim query. The event_type column exists from migration 125;
  // legacy credits (event_type IS NULL) remain eligible for any engagement (backward-compatible).
  // Companion code change: getAvailableCoordinationCreditCents + claimCoordinationCredit now accept
  // eventType, sum ALL eligible credits (not just the newest), and cap consumption at the gross fee.
  "126_coordination_credit_event_scoping.sql",
  // Migration 127 — Expand fee_payment_status CHECK to include 'refunded'. Migration 125 created the
  // CHECK with only ('unpaid','pending','paid'). The admin refund endpoint (POST
  // /api/coordination-states/:id/refund) sets fee_payment_status = 'refunded', which violated the
  // old constraint at runtime. Idempotent: drops and recreates the constraint by name.
  // (Originally authored as 126; renumbered to 127 after 126 was taken by coordination_credit_event_scoping.)
  "127_coordination_fee_refunded_status.sql",
  // Migration 128 — Add revenue_reversal_missing boolean flag to coordination_states. Set to true
  // when a fee refund completes (Stripe + state marked refunded + credit released) but no
  // platform_revenue row exists to reverse (reversedRevenueRows = 0 with feeCents > 0). Admins
  // see a warning badge in the concierge panel and can investigate the ledger gap. Idempotent:
  // ADD COLUMN IF NOT EXISTS.
  "128_coordination_revenue_reversal_missing.sql",
  // Migration 129 — Content location normalization, Lane A Phase 1. Adds four ADDITIVE NULLABLE
  // columns to provider_services (latitude/longitude DECIMAL(10,7), city VARCHAR, location_precision
  // VARCHAR) + a NEVER-FABRICATES backfill from city_neighborhoods centroids (109/109 rows have
  // centroid_lat/lng NOT NULL). No DB CHECK / no NOT NULL / no DEFAULT → no publish-time drizzle-push
  // trap (migration-124/125 additive posture). Backfill: provider_services.neighborhood is a SLUG
  // (soft reference into city_neighborhoods.slug — globally unique), matched slug-first then name
  // (LOWER(TRIM), the 011/012 pattern); a match sets lat/lng/city + location_precision =
  // 'neighborhood_centroid'; a miss leaves all four NULL (NULL is the honest state — the
  // location='Unknown' lesson; no city-center fallback). Coverage/upsell engine does NOT read these
  // for pricing/matching, and the ~14 free-text ilike location readers are left untouched (columns
  // ADDED, not repurposed). Guarded/idempotent.
  "129_provider_services_location_coordinates.sql",
  // 130: TripContext server persistence (Trip-Strip P2/E2) — additive new table
  // trip_contexts (user_id PK -> users, context jsonb, updated_at). No CHECK ->
  // no publish-time push trap. See CLAUDE.md migration-130 note.
  "130_trip_contexts.sql",
  // 131: Content availability tagging + CTA booking classifier (remediation P1) — four ADDITIVE
  // NULLABLE columns on affiliate_products (availability_status, available_from, available_to,
  // booking_type). No DB CHECK → no publish-time push trap; enum value sets validated at zod layer.
  // No backfill (§13 — the 9 existing products stay NULL until a real admin tagging pass).
  "131_affiliate_availability_and_cta.sql",
  // 132: DMO content in the central content system (approach A) — adds 'dmo_content' to the
  // content_type enum (idempotent ADD VALUE, migration-0009 pattern) so DMO/scraped research can be
  // registered into content_registry as the 'sourced' origin. EXPERT-WORKSPACE-ONLY: sourced content
  // is hard-excluded from the traveler resolver (content-query.service.ts) + not in any surface map.
  // Additive, no CHECK → no publish-time push trap.
  "132_content_type_dmo_content.sql",
  // 133: Ready-Made Trips (Trips by Locals) Phase 1 — trips.author_id + itinerary_items.gem_id
  // (additive nullable), four NEW tables (ready_made_trips/ready_made_purchases/boards/board_items —
  // CHECKs created WITH the tables, no legacy rows → no publish-push trap), 'ready_made_trip' fee band
  // (platform take 0.25, max 0.25 = the 75% expert floor). See spec v3 + authoring brief v1.1.
  "133_ready_made_trips.sql",
  // 134: ready_made_trips.plan_type (additive nullable, no CHECK/DEFAULT — no publish-push trap).
  // The "Type of Plan" line of the store's quality structure; required by the submit gate, vocab
  // validated in code (shared/ready-made-plan-types.ts).
  "134_ready_made_plan_type.sql",
  // 135: clone_trip_id FK → ON DELETE SET NULL (constraint swap, no data/CHECK — no publish trap).
  // Without it, revoking a refunded clone OR a buyer deleting their own cloned trip 23503'd.
  "135_ready_made_clone_fk_set_null.sql",
  // 136: users.handle (additive nullable + UNIQUE, no CHECK — no publish-push trap). The public
  // storefront identity (/p/{handle}, backoffice Phase 1a). Format + reserved words enforced in
  // storefront.routes.ts, deliberately NOT a DB CHECK.
  "136_users_handle.sql",
  // 137: expert-review tier fees → fee_bands (F3; closes §14 A1 filed follow-up). Seed-only,
  // ON CONFLICT DO NOTHING, no CHECK — no publish-push trap. Code constants remain as the
  // documented safe-failure fallback.
  "137_expert_review_fee_bands.sql",
  // 138: R1/F5 — seed the 4 fee-category bands the checkout slug mapper can emit but nothing
  // seeded (transportation/flights/car_rental/insurance); the fail-loud resolver 500'd those
  // carts. Seed-only, ON CONFLICT DO NOTHING, no CHECK — no publish-push trap.
  "138_missing_category_fee_bands.sql",
  // 139: short_links — backoffice S3 short-link + click store. New table, additive, no CHECK
  // (target_type vocabulary is app-enforced) — no publish-time push trap.
  "139_short_links.sql",
  // 140: seed platform_settings.storefront_require_verified ('false') — the V.1 admin-switchable
  // gate on public /p/{handle} storefront visibility, checked in storefront.routes.ts
  // loadStorefront(). Seed-only, ON CONFLICT DO NOTHING, no CHECK — no publish-push trap.
  // Fail-open default preserves today's behavior until an admin flips it once V.2/V.3
  // verification-flow sequencing lands.
  "140_storefront_require_verified_setting.sql",
  // 141: service_bookings.acquisition_ref (additive nullable, no CHECK/DEFAULT — no publish-push
  // trap) — S4 acquisition attribution. The existing `source` column gains its first writer at
  // checkout (server-derived vocabulary direct|link|cross_sell); ref = short_links.code (soft).
  "141_booking_acquisition_ref.sql",
  // 142: R6 — expert_review_expert_share fee band (default 0.75): the reviewing expert's share of
  // a paid expert-review fee, credited at request completion; platform keeps the remainder.
  // Seed-only, ON CONFLICT DO NOTHING, no CHECK — no publish-push trap.
  "142_expert_review_split_band.sql",
  // 143: R4 (F7) — affiliate_standard fee band (default 0.70 platform / 0.30 expert): the internal
  // platform/expert split applied to an affiliate-facilitated booking's commission at confirm-time
  // ledger write (createAffiliateEarning, server/routes/content.routes.ts). Seed-only, ON CONFLICT
  // DO NOTHING, no CHECK — no publish-push trap.
  "143_affiliate_split_fee_bands.sql",
  // 144: X1 — provider_services.cancellation_policy_type (additive nullable VARCHAR(30), no CHECK,
  // no DEFAULT, no backfill — app-enforced vocabulary). Closes the §13 hardcoded-copy arm: adds a
  // structured policy TYPE (flexible|moderate|strict|non_refundable) alongside the pre-existing
  // free-text `cancellation_policy` column (migration 011), so live surfaces can render a real
  // per-offering badge instead of the fabricated "free cancellation / instant confirmation / 24-7
  // support" trio (already removed from expert-detail.tsx by #200; service-detail.tsx never showed
  // any policy at all — NULL is the honest default, not a fabricated claim).
  "144_service_cancellation_policy.sql",
  // 145: C3 slot-aware checkout — additive nullable slot_id on cart_items + service_bookings
  // (FK -> vendor_availability_slots ON DELETE SET NULL; idempotent dup-object guard). No
  // CHECK/DEFAULT/backfill — no publish-push trap. Capacity enforcement is the atomic
  // storage.bookSlot claim (§15), not a constraint.
  "145_slot_aware_checkout.sql",
  // 146: users.stripe_customer_id (additive nullable, no CHECK — no publish-push trap) —
  // FP-1 frictionless payments: the durable Stripe Customer anchor for saved cards +
  // off-session one-click charges. Cards stay in Stripe's vault; we store only this token.
  "146_users_stripe_customer_id.sql",
  // 147: repair the phantom-column Stripe Connect chain — users.stripe_account_id/
  // stripe_account_status/can_receive_payments were read+written by storage.getUserStripeAccount/
  // updateUserStripeAccount (status, onboard, payout-readiness, admin transfer lookup, webhook)
  // but never added by any migration; every Connect path threw on a schema-true DB. Additive
  // nullable + IF NOT EXISTS (no-op where grandfathered), no CHECK → no publish-push trap.
  "147_users_stripe_connect_columns.sql",
  // 148: provider offering linkage (§17) — provider_services.service_offering_type_id FK, the
  // migration-057 mirror. Additive nullable, ON DELETE SET NULL, no CHECK/backfill → no push trap.
  // Closes the earn-trace "creatable but unlinked" gap for the ~96 in-person /earn offerings.
  "148_provider_service_offering_type_fk.sql",
  // 149: F8 launch-market CHECK on ready_made_trips.market (§12 one-wedge-Kyoto) — the write
  // paths validate against shared/launch-markets.ts; this enforces it at the DB. Guarded
  // (refuses on non-Kyoto rows rather than half-applying), idempotent. CHECK migration →
  // column added to the preflight-prod-constraints.cjs manifest (the publish-trap rule).
  "149_ready_made_market_check.sql",
  // 150: users.preferences jsonb (backoffice B6 settings persistence) — additive with default,
  // no CHECK/backfill → no publish-push trap. App layer touches only the `settings` key.
  "150_users_preferences.sql",
  // 151: Product Builder bundle shape (§17, ratified join-table decision) —
  // provider_services.product_shape (additive nullable, no CHECK/DEFAULT) + NEW
  // bundle_components join table (FKs → provider_services; CASCADE on bundle,
  // RESTRICT on component; CHECK/UNIQUE safe — new table, no legacy rows) → no push trap.
  "151_bundle_components.sql",
  // 152: itinerary_items.expert_note (Workstation audit C-1) — additive nullable TEXT,
  // no CHECK/DEFAULT → no push trap. PlanCard already renders it; the builder gains authoring.
  "152_itinerary_items_expert_note.sql",
  // 153: property shape (§17 property rung, ratified Jul 29 2026) — provider_services gains
  // additive nullable pricing_unit ('per_night' marker) + parent_service_id self-FK
  // (RESTRICT; room-child → parent property). No CHECK/DEFAULT → no push trap.
  "153_property_shape.sql",
  // 154: trip-scoped transport legs (§18 L4 "BOTH" — engine proposes, expert confirms, only
  // confirmed legs reach travelers). transport_legs.variant_id DROPs NOT NULL + additive nullable
  // trip_id FK (CASCADE), pickup_point, pickup_time, proposal_status. No cross-column CHECK (app
  // level); the proposal_status CHECK allows NULL so every grandfathered variant leg passes →
  // no publish-push trap. Column registered in the preflight CONSTRAINT_MANIFEST.
  "154_transport_legs_trip_scope.sql",
  // 155: re-assert the UNIQUE partial index on service_bookings.idempotency_key — the DB half
  // of the §15 checkout claim. 096 created it, but it lives only in migration SQL (not in
  // shared/schema.ts), so a push-canonical environment can be missing it while 096 stays
  // stamped — degrading /api/checkout dedup to check-then-insert. Index-only, guarded on
  // pre-existing duplicates (NOTICE + plain index, never a failed boot), idempotent. No
  // column/CHECK/DEFAULT change → no publish-push trap.
  "155_checkout_idempotency_key_unique.sql",
  // 156: create the `refunds` audit table — BOTH refund writers (the charge.refunded webhook
  // and refundServiceBooking, the escrow refund terminal) already INSERT into it, but the
  // table has never existed in ANY environment (to_regclass NULL in prod AND dev), so every
  // real refund moved money in Stripe and then threw on the audit insert. Shape derived from
  // the two writers (readers: none). NEW table → constraints have no legacy rows to violate;
  // and deliberately NO status CHECK / NOT NULL (Stripe's refund.status is an external
  // `string | null`) → no publish-push trap and nothing to add to the preflight manifest.
  "156_refunds_audit_table.sql",
  // 157: give `user_and_expert_contracts` an owner (`traveler_id`/`earner_id`) so its two
  // LIVE ungated readers can be gated — `GET /api/expert/contracts/recent` read `expertId`
  // off the session and never used it (20 most recent contracts platform-wide to any
  // authenticated caller), and `GET /api/contracts/:id` had no check at all. The writer
  // (/api/checkout) creates a row per cart item, so the exposure grows with volume. Backfill
  // is a deterministic join, not a heuristic: `service_bookings.contract_id` already links
  // each contract to the booking carrying both principals. Additive nullable, no CHECK/
  // NOT NULL/DEFAULT → no publish-push trap, nothing for the preflight manifest.
  "157_contract_ownership.sql",
  // 158: retire the dead `service_demand_requests` table deliberately. It was undeclared in
  // shared/schema.ts, so the publish push was going to DROP it regardless (observed verbatim in
  // a push plan) with migration 080 already stamped — i.e. the deploy tool would have made the
  // call silently. Verified 0 rows + 0 FK dependents in BOTH prod and dev, and zero code
  // references; it is redundant against the live service_demand_signals / service_requests.
  // GUARDED: refuses to drop if the table is non-empty when it actually runs.
  "158_retire_service_demand_requests.sql",
  // 159: Trip-Canon Lane 1 (Reconcile) Phase 1a — per-item `routing_status`
  // (in_planning|with_expert|ready_for_checkout|purchased, default in_planning) + the
  // `booking_id` FK → service_bookings ON DELETE SET NULL that the refund/cancel reversal edge
  // resolves through (master brief §5 item 2), + its index. Value set is TS-level
  // (`ROUTING_STATUSES` in shared/schema.ts) with deliberately NO DB CHECK — the pre-109
  // delivery-method posture; a CHECK on a brand-new all-default column buys nothing and creates a
  // publish-push remap trap. Default is set by the explicit ALTER (the Phase 1a gate proves DB
  // default == ORM default via information_schema). Existing rows take the default only — no
  // inferred `purchased` history (scope §4).
  "159_itinerary_routing_state.sql",
  // 160: Trip-Canon Lane 1 (Reconcile) Phase 1b — the cart projection's SOURCE KEY.
  // Additive nullable `cart_items.itinerary_item_id` FK → itinerary_items ON DELETE CASCADE
  // (+ index). W2 makes `cart_items` a single-writer materialized projection of items in
  // `ready_for_checkout`; the projection is not expressible without a key back to the item it
  // projects. NULL = "not a projection" (legacy / guest / direct add) and the sync module never
  // touches those rows — that is the whole compatibility story for the nine Q1 consumers.
  // CASCADE (not SET NULL) because the projection row has no independent existence: an orphaned
  // one would be uncleanable and still chargeable at checkout. No CHECK/DEFAULT/NOT NULL/backfill
  // → no publish-push trap, nothing for the preflight CONSTRAINT_MANIFEST. Column + index are
  // also declared in shared/schema.ts (deploy-push durability rule).
  // ⚠️ Schema addition flagged for decision-maker ratification in the PR — it rides the approved
  // W2 projection design, which did not name the key it requires.
  "160_cart_projection_key.sql",
  // 161: Trip-Canon Lane 6 — trip_contexts re-key. Swaps the PK from user_id-only to a
  // surrogate `id`, adds nullable trip_id (FK -> trips, ON DELETE CASCADE), and re-derives
  // the "one row" invariant via two partial unique indexes (one legacy trip_id-NULL row per
  // user; one row per (user_id, trip_id) once trip-scoped) since a user_id-only PK cannot
  // coexist with more than one row per user. Existing rows survive verbatim — they simply
  // gain a fresh surrogate id and trip_id stays NULL (their pre-migration "legacy" meaning).
  // No CHECK constraint anywhere in this migration; id/trip_id/indexes are also declared in
  // shared/schema.ts (deploy-push durability rule).
  "161_trip_contexts_rekey.sql",
  // 162: data-only re-backfill of migration 129's provider_services centroid
  // coordinate fill, for rows INSERTED AFTER 129 ran (the Kyoto/popular-cities
  // seed scripts set `neighborhood` but never set latitude/longitude/city/
  // location_precision, so those rows stayed born-NULL-coordinate and never
  // got a map pin from the Platform-services pill). Re-runs 129's exact
  // slug-first-then-name centroid match, guarded WHERE latitude IS NULL
  // (idempotent — a re-run is a no-op). NEVER FABRICATES: a row whose
  // neighborhood doesn't resolve stays all-NULL. No schema change (the four
  // columns already exist + are declared in shared/schema.ts since 129); no
  // CHECK constraint → nothing for the preflight CONSTRAINT_MANIFEST, no
  // publish-time push trap. Companion code: the three provider_services
  // seeders that set `neighborhood` (phase-d-kyoto-vendors.seed.ts,
  // phase-4-kyoto-fill.seed.ts, popular-cities-content.seed.ts) now resolve
  // the same centroid at INSERT time via server/seeds/lib/neighborhood-centroid.ts,
  // so future seeded rows are born with coords instead of relying on a future
  // re-backfill migration.
  "162_provider_services_coords_rebackfill.sql",
  // 163: W2-B — widens the migration-133 ready_made_trips_status_check to include 'withdrawn'
  // (drop-and-recreate CHECK pattern, 127_coordination_fee_refunded_status.sql). Backs the new
  // POST /api/expert/ready-made/:id/withdraw endpoint (author retracts a listing from the store;
  // existing purchases unaffected — buyers hold a snapshot clone) and the existing /submit
  // endpoint's widened allowed-from set (draft|rejected|withdrawn -> submitted), so a
  // withdrawn-then-resubmitted listing re-enters the admin queue (D1a: never straight back to
  // 'approved'). A widen never invalidates an existing row → no preflight remap needed.
  "163_ready_made_withdraw_status.sql",
  // 164: QA_PUNCH_LIST W2-A — plan-approval handshake. Three additive nullable columns on
  // trip_expert_advisors: plan_approval_status ('approved'|'changes_requested', NULL = no
  // decision yet), plan_approved_at, plan_review_note. NO DB CHECK — canonical set lives in
  // shared/schema.ts as PLAN_APPROVAL_STATUSES (the pre-109/159 posture), so no publish-push
  // remap trap. No backfill (NULL is honest — the feature has no history yet). Columns are also
  // declared on the tripExpertAdvisors pgTable in shared/schema.ts (deploy-push durability rule).
  // Companion code: POST /api/trips/:id/plan-review (booking-actions.ts) + the server-side
  // expert-direct-edit mode flip on the item create/PATCH/DELETE handlers, gated via
  // server/utils/plan-approval.ts.
  // NUMBERING NOTE: this landed as 163 on this branch; lane W2-B independently claimed 163
  // (163_ready_made_withdraw_status.sql) on its own branch first, so this was renumbered to
  // 164 before push. Registry order (162, 163, 164) reconciles at rebase/merge — W2-B's 163
  // entry is not present on this branch's migration-files.ts.
  "164_plan_approval.sql",
  // 165: QA_PUNCH_LIST W3-C (item 12) — per-item comment threads on the plan. New table
  // `trip_item_comments` (id/trip_id/item_id/author_id/body/created_at), FKs to
  // trips/itinerary_items/users all ON DELETE CASCADE (a comment has no life beyond its
  // trip/item/author). NO CHECK constraint -> nothing for the preflight CONSTRAINT_MANIFEST,
  // no publish-time push trap. Table + indexes also declared on the new tripItemComments
  // pgTable in shared/schema.ts (deploy-push durability rule). Companion code:
  // GET/POST /api/trips/:tripId/items/:itemId/comments (server/routes/booking-actions.ts),
  // gated by the same owner/advisor/author tri-predicate as the rest of this file
  // (isTripOwner, the canonical isTripAdvisor from server/utils/trip-advisor.ts, isTripAuthor
  // — never getTripRole, per CLAUDE.md L10).
  "165_trip_item_comments.sql",
  // 166: QA_PUNCH_LIST item 20 — the content-logistics envelope. Additive nullable only:
  // provider_services.drop_off_point (the one field with no existing home — meetingPoint/
  // pickupAddress cover arrival, nothing covered departure); itinerary_items gains
  // transport_provided/pickup_point/drop_off_point (durationMinutes already existed). NO CHECK,
  // NO DEFAULT, NO backfill (NULL = honest unknown, §13) -> nothing for the preflight
  // CONSTRAINT_MANIFEST, no publish-time push trap. All four columns also declared on the
  // providerServices/itineraryItems pgTables in shared/schema.ts (deploy-push durability rule).
  // Companion code: shared/content-logistics.ts (the envelope type + per-source mappers), the
  // Platform-services/My-services pickers carrying the envelope onto new itinerary items, the
  // item-PATCH pass-through (trips.routes.ts's existing strip-immutable pattern already lets the
  // new fields through — no allow-list change needed), and ServiceForm's new Drop-off point field.
  "166_content_logistics.sql",
  // 166: NOT present on this branch — lane W5-B is concurrently claiming 166 on its own
  // branch. Registry order (165, 166, 167) reconciles at merge; this branch appends 167
  // directly after 165.
  // 167: W5-D dead-code cleanup — retires `activity_comments` (zero client callers of its
  // GET/POST/DELETE endpoints ever existed; the per-item comment system is
  // `trip_item_comments`, migration 165). See 167_drop_activity_comments.sql for the full
  // rationale + the guarded DROP.
  "167_drop_activity_comments.sql",
  // 168: QA_PUNCH_LIST "activity_bookings [DM, re-framed]" / W5-D PR #377 follow-on —
  // archive-then-drop `activity_bookings`. The shared/schema.ts `activityBookings` pgTable
  // declaration existed only to stop the Replit deploy-push from proposing DROP TABLE on a
  // table with zero code consumers, but the table holds ONE real prod row (Segway Paris, user
  // 79cdafd1, a live Stripe PaymentIntent) — so the declaration could not simply be deleted.
  // Decision-maker ratified: archive queryably into a new generic `legacy_archives` table
  // (jsonb row_data, source_table-tagged; declared in shared/schema.ts in the same commit so
  // IT doesn't become the next undeclared-table drop target), then DROP TABLE
  // activity_bookings and remove its now-pointless schema.ts declaration. Guarded + idempotent
  // (skips the copy if already archived; no-ops cleanly on a fresh DB with no such table). See
  // 168_archive_activity_bookings.sql for the full guarded DO block.
  "168_archive_activity_bookings.sql",
  // 169: #877 money-verify-cluster — lets an admin mark a coordination revenue-reversal
  // "Ledger gap" warning (coordination_states.revenue_reversal_missing, migration 128)
  // reviewed instead of it warning forever in the admin concierge panel. Additive nullable
  // revenue_reversal_reviewed_at/_by columns; no CHECK, no backfill. See
  // 169_coordination_revenue_reversal_reviewed.sql for the full rationale.
  "169_coordination_revenue_reversal_reviewed.sql",
  // 170: AI booking copilot verification leg (decision-maker ratified). Additive nullable
  // `affiliate_booking_requests.verification` jsonb — the AI pre-booking verification snapshot
  // (Tavily-extract + LLM-extract, key-gated, §13 never-fabricates). See
  // 170_affiliate_booking_verification.sql for the full rationale; §16 (no affiliateUrl in the
  // snapshot) is enforced in server/services/booking-verification.service.ts, not the DB.
  "170_affiliate_booking_verification.sql",
  // 171: Lane S — item_transition_log (the slip's append-only diary; rulings 11/12/16/18).
  // New table + index, both declared in shared/schema.ts same commit; no CHECK → no push trap.
  // Numbering note (ruling 19): 171 verified free on this branch at merge time; the
  // chain-integrity test is the arbiter if a concurrent lane also claims it.
  "171_item_transition_log.sql",
  // 172: DATA-ONLY fixture purge — the 20 paid_out/NULL-payout_id earnings rows belonging to
  // @example.com seed personas, archive-then-delete via legacy_archives (migration-168 pattern).
  // Decision-maker ratified Aug 2, 2026 after invariant triage. Idempotent; no schema change.
  "172_purge_fixture_paid_out_earnings.sql",
  // 173: Console Realign Lane E5 (R-F, Trip Card delivery: Finalize) — additive nullable
  // `trips.finalized_at` TIMESTAMP. No CHECK, no DEFAULT, no backfill; NOT a revival of the dead
  // `trips.status` (Lane 3 Option B stands) — a narrow rendering-handover signal read only by the
  // primary-surface rule. See 173_trips_finalized_at.sql for the full rationale.
  "173_trips_finalized_at.sql",
  // 174: last hardcoded commission rates → fee_bands (ruling 25 / standing fee-literal follow-up).
  // Seeds experience_cart_checkout (0.30, EXPERIENCE_CART display breakdown) and idempotently
  // re-seeds expert_standard (0.25) so the 75/25 safety net lives in the single source of truth.
  // Behavior-neutral: ON CONFLICT DO NOTHING; no schema change.
  "174_seed_experience_cart_band.sql",
  // 175: one-time legacy 70/30 → 75/25 booking_fee_configs backfill (Task #1036, ruling 32).
  // Moved out of the server/routes.ts startup path, where re-running every boot could
  // clobber a deliberate admin edit back to 70/30. Create-only bootstrap remains in
  // server/services/booking-fee-bootstrap.ts. No schema change.
  "175_backfill_legacy_7030_booking_fee_default.sql",
  // 176: retire the three writerless Amadeus-era cache tables (flight_cache, transfer_cache,
  // safety_cache) — migration-158 precedent (deliberate recorded drop, idempotent IF EXISTS).
  // Their writer died with the Amadeus drop (ruling 34); the last live route reader went in
  // PR #425; the residual dead readers (scheduler no-op refresh loop, admin counters of a
  // permanently-empty table, getCatalogItem transfer branch) are deleted in the same commit,
  // as are the shared/schema.ts declarations (push-authoritative rule). hotel_offer_cache and
  // poi_cache are writerless too but have LIVE readers — kept and flagged, NOT dropped here.
  // See 176_retire_amadeus_flight_transfer_safety_cache.sql for the full per-table audit.
  "176_retire_amadeus_flight_transfer_safety_cache.sql",
  // 177: reconciliation-detection lane — reconciliation_runs + reconciliation_exceptions, the
  // ops-visible output of the daily Stripe-vs-DB drift job now that it scans the CART rail
  // (service_bookings) as well as the legacy one. Append-only exceptions deduped by a UNIQUE
  // dedupe_key; a run row is written for EVERY pass so a clean run is distinguishable from a job
  // that never ran. No CHECK (migration-159/171 posture); both tables + all four indexes declared
  // in shared/schema.ts in the same commit (deploy-push durability rule).
  "177_reconciliation_exceptions.sql",
  // Fee-ledger lane Phase 1A (D0/D1/D2/D3, ruled 2026-08-06). Structure C: the four provider
  // commission bands were VERIFIED already present at the ruled rates (limited .12 / moderate .08 /
  // commercial .06 / premium .04) so none are seeded; this adds only what was absent —
  // traveler_service_fee (0.07, capped $25 via the new fee_bands.max_amount column) and
  // provider_rails (0.08, resolved as min(category band, rails), traveler fee waived) — deactivates
  // beta_flat per D2, drops the "0.75" literal default off provider_services.revenue_share_rate and
  // backfills existing rows to NULL so fee_bands regains rate authority (audit C2/Q9; ruling 32's
  // defeated proof). No CHECK added; max_amount declared in shared/schema.ts in the same commit.
  "178_fee_ledger_bands.sql",
  // Fee-ledger lane Phase 1B: the append-only fee event log (audit C1 — the platform retained $40
  // and recorded $20 on an $80 booking because a two-sided fee was captured in one scalar column).
  // A fee EVENT log, not a general ledger. band_id is NULLABLE with a rate_source discriminator
  // because three override layers sit above the band (Phase 0 §1a), so an entity-override row has
  // no band that explains its rate. Reversals are new rows (reverses_ledger_id); no UPDATE/DELETE
  // path exists in code. New table, so no CHECK-over-legacy-rows publish trap; table + all five
  // indexes declared in shared/schema.ts in the same commit (deploy-push durability rule).
  "179_fee_ledger.sql",
  // Fee-ledger lane, rulings R1 + R2. Every category gets a commission band (mapped BY NAME, since
  // environments carry different category sets), then commission_band_key goes NOT NULL in the SAME
  // migration — backfill first, constraint second, so the constraint cannot be violated by rows
  // already on disk. The resolver stays fail-loud; R1+R2 make the missing-band state unreachable
  // rather than survivable. Categories R1 did not name take `moderate` under R1's own interim
  // principle, recorded as a delta in the migration body and in FOLLOWUPS.md.
  "180_category_band_backfill.sql",
  // D2, ratified Aug 7 2026: itinerary-item provenance. Additive nullable
  // `itinerary_items.origin` TEXT ('ai' | 'traveler' | 'expert', app-enforced, no CHECK —
  // publish-trap avoidance, migration-159/173 posture). No DEFAULT, no backfill — every existing
  // row stays NULL (legacy, ambiguous by construction). Closes the CC-1/T1-1 provenance gap: the
  // generate-itinerary REGENERATE delete now spares `origin = 'traveler'` rows in addition to
  // the pre-existing `suggestedBy = 'expert'` spare, falling back to the old heuristic only for
  // legacy `origin IS NULL` rows. Declared in shared/schema.ts in the same commit.
  "181_itinerary_items_origin.sql",
  // 182: OPTIMIZER_SOURCING_BUILD_SPEC WP-B — optimizer_gap_fills, the append-only ledger of every
  // external fill the optimizer used when no platform (provider_services) listing matched. New
  // table, market-agnostic (distinct from the Kyoto-only content_gap_alerts editorial gauge, which
  // is UPDATE-in-place); no CHECK → no publish-time push trap. Table + both indexes declared in
  // shared/schema.ts in the same commit (deploy-push durability rule). See
  // 182_optimizer_gap_fills.sql for the full rationale.
  "182_optimizer_gap_fills.sql",
  // 183: wires WP-C's dark segmentation engine (proposeSegmentation) into the paid optimize run,
  // recommendation-only (docs/briefs/TRIP_SEGMENTATION_DESIGN.md §5b Phase 1 — no materialization,
  // no trip_segments, no apply action). Additive nullable `itinerary_comparisons
  // .segmentation_proposal` JSONB; no DEFAULT/backfill (existing rows stay NULL — no engine ran
  // for them); no CHECK (recommendation-only payload, nothing money/ownership reads it). Declared
  // in shared/schema.ts in the same commit. See 183_itinerary_comparisons_segmentation_proposal.sql.
  "183_itinerary_comparisons_segmentation_proposal.sql",
  // 184: "Custom…" plan type theme label (decision-maker approved Aug 9 2026). Additive nullable
  // `ready_made_trips.plan_type_custom` VARCHAR(80) — carries free text ONLY when
  // `plan_type = 'custom'` (shared/ready-made-plan-types.ts); the closed `plan_type` column itself
  // never receives free text. No CHECK (migration-159/173/181 posture). Declared in
  // shared/schema.ts in the same commit. See 184_ready_made_plan_type_custom.sql.
  "184_ready_made_plan_type_custom.sql",
  // 185/186: CLAUDE.md §20 (decision-maker ratified Aug 9 2026). 185 promotes DMO extracted
  // places from the extracted_data.places JSON blob to child rows (additive table + idempotent
  // backfill; blob thereafter historical). 186 creates market_geography (DB-backed market
  // water/parks/roads layer for the admin "Add market" flow; no seed — code-literal fallback
  // keeps an empty table behavior-neutral). Both declared in shared/schema.ts (publish-trap).
  "185_dmo_extracted_places.sql",
  "186_market_geography.sql",
  // 187: CLAUDE.md §21 (decision-maker ratified Aug 9 2026). Traveler-facing Expert Notes:
  // itinerary_items.expert_note + trips.expert_traveler_note (additive nullable). DISTINCT from
  // trips.expert_notes (the PRIVATE build notes). Declared in shared/schema.ts (publish-trap).
  "187_expert_notes_two_level.sql",
  // 188: source-map execution (decision-maker directed Aug 9 2026; extends §20a). Additive
  // nullable dmo_extracted_places.enrichment jsonb — open-data facts (Wikidata/OSM), never
  // prose, never overwrites expert ticketing_url. Declared in shared/schema.ts (publish-trap).
  "188_extracted_place_enrichment.sql",
  // 189: schema foundations for the ratified provider back-office wave (decision-maker approved
  // Aug 9 2026). Three parts, none wire enforcement (feature builds land separately): (a)
  // users.vacation_until/vacation_message — account-level away flag, never touches
  // provider_services rows, confirmed bookings unaffected; (b) offering_type_requests — provider
  // "don't see your offering" requests, admin categories page consumes; (c)
  // demand_signal_events — append-only §13 event log, every trending/demand surface reads ONLY
  // these logged events. Also seeds the offering-fallback groundwork: service_categories."Custom
  // / Other".category_key -> 'custom_other' (idempotent, predicate-guarded) and one catch-all
  // service_offering_types row ('custom_other_offering') so the provider picker has a landing
  // option. All declared in shared/schema.ts in the same commit (publish-trap rule).
  "189_provider_backoffice_foundations.sql",
  // 190: CLAUDE.md §06d (decision-maker ratified Aug 9 2026). Reviews — provider public replies:
  // service_reviews.provider_reply/provider_replied_at (additive nullable). ONE public reply by
  // the service owner, write-gated to the listing's owner, rendered traveler-side beside the
  // review, visible to admin review-moderation. Distinct from the pre-existing legacy
  // responseText/responseAt pair, left untouched. Declared in shared/schema.ts (publish-trap).
  "190_service_reviews_provider_reply.sql",
  // 191: dmo_extraction_runs — sweep/ingest run ledger for the admin "Content Ops" page
  // (CLAUDE.md §17 lesson applied by analogy, decision-maker ratified Aug 10 2026). Every
  // YouTube ingestion call and every warmup-sweep boot pass writes ONE append-only row (kind,
  // counts jsonb, created_at) so the page's "last run" line can tell "ran and found nothing"
  // from "never ran". Additive, idempotent, no CHECK. Declared in shared/schema.ts (publish-trap).
  "191_dmo_extraction_runs.sql",
] as const;
