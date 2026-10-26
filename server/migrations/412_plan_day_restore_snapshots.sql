-- 412 — plan_day_restore_snapshots (ledger `2026-10-25-d3-restore-day`).
--
-- Renumbered from 411 on 2026-10-25: 411 stays with PR #1696 (email_outbox expires_at).
-- HELD for "Migration 412 SQL approved — Leon". Do not merge until approved.
--
-- One row per day an apply-days call replaces. Written in that same transaction.
-- A dry run writes nothing. The row never alters itinerary_items columns.
--
-- Retention (Architect, 2026-10-25 20:35 ET): expires_at is applied_at plus 14 days;
-- only the newest snapshot per day is live (a newer apply sets superseded_at on the
-- older); expired rows are purged lazily at the next apply on that trip. No new job.
--
-- Additive table. No ALTER. No column constraint. No backfill.
-- Declared in shared/schema.ts (deploy-push durability). IF NOT EXISTS, so a second run is a no-op.
-- The index is DESC NULLS FIRST, which is PostgreSQL's default for DESC and what
-- shared/schema.ts declares, so the publish push does not plan a drop and recreate.

CREATE TABLE IF NOT EXISTS plan_day_restore_snapshots (
  id varchar PRIMARY KEY,
  trip_id varchar NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  apply_id varchar NOT NULL,
  day_number integer NOT NULL,
  run_id varchar,
  variant_id varchar,
  applied_by varchar NOT NULL,
  applied_at timestamp NOT NULL,
  expires_at timestamp NOT NULL,
  before_items jsonb NOT NULL,
  before_comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  inserted_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_signature text NOT NULL,
  restored_at timestamp,
  restored_by varchar,
  superseded_at timestamp
);

CREATE INDEX IF NOT EXISTS plan_day_restore_snapshots_trip_day_idx
  ON plan_day_restore_snapshots (trip_id, day_number, applied_at DESC NULLS FIRST);
