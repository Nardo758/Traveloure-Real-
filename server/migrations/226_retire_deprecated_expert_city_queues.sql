-- Migration 226: retire the `_deprecated_expert_city_queues` table deliberately.
--
-- WHY: the table was replaced by scoring-based lead routing (expert_requests table,
-- migration confirmed 2026-06-27). It has zero active code references — no route,
-- no storage method, no client caller reads or writes it. The leading underscore and
-- scheduled_drop_deprecated_city_queues.sql note both signal intent to remove it.
--
-- The table was absent from shared/schema.ts, making it an undeclared object that
-- drizzle-kit push (the publish flow) would propose to DROP silently. This migration
-- makes the retirement explicit, recorded, and guarded — following the precedent of
-- migrations 158 (service_demand_requests), 167 (activity_comments), and
-- 168 (activity_bookings).
--
-- ARCHIVE STEP: all 10 rows are empty seed records (expert_ids = '[]', active_requests = 0,
-- no FK dependents). They are archived to legacy_archives for auditability before the drop.
--
-- GUARDED: the migration refuses to drop the table if it contains any non-empty rows
-- (active_requests > 0 OR expert_ids != '[]'), since those would indicate the table is
-- still receiving real traffic and the premise of retirement is wrong.
--
-- Idempotent: IF EXISTS on every step; safe to re-run on DBs where a publish push
-- already removed the table, or where an earlier run succeeded.

DO $$
DECLARE
  live_rows BIGINT;
  total_rows BIGINT;
BEGIN
  -- Already gone (e.g. a previous publish dropped it) — nothing to do.
  IF to_regclass('public._deprecated_expert_city_queues') IS NULL THEN
    RAISE NOTICE 'migration 226: _deprecated_expert_city_queues already absent — nothing to do.';
    RETURN;
  END IF;

  -- Count rows that look live (non-empty queues).
  SELECT count(*)
    INTO live_rows
    FROM public._deprecated_expert_city_queues
   WHERE active_requests > 0
      OR expert_ids::text != '[]';

  IF live_rows > 0 THEN
    SELECT count(*) INTO total_rows FROM public._deprecated_expert_city_queues;
    RAISE EXCEPTION
      'migration 226: REFUSED — % live row(s) found in _deprecated_expert_city_queues '
      '(active_requests > 0 or expert_ids non-empty out of % total). '
      'The table appears to still be in use. Investigate before retiring.',
      live_rows, total_rows;
  END IF;

  -- Ensure legacy_archives exists (migration 168 creates it, but guard for ordering).
  CREATE TABLE IF NOT EXISTS legacy_archives (
    id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
    source_table VARCHAR NOT NULL,
    archived_at  TIMESTAMP DEFAULT NOW(),
    reason       TEXT,
    row_data     JSONB NOT NULL
  );

  -- Archive all rows before dropping.
  INSERT INTO legacy_archives (source_table, reason, row_data)
  SELECT
    '_deprecated_expert_city_queues',
    'migration 226: retired — replaced by scoring-based lead routing (expert_requests); all rows were empty seed records',
    row_to_json(t)::jsonb
  FROM public._deprecated_expert_city_queues t
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO total_rows FROM public._deprecated_expert_city_queues;
  DROP TABLE public._deprecated_expert_city_queues;

  RAISE NOTICE
    'migration 226: archived and dropped _deprecated_expert_city_queues (% seed row(s) preserved in legacy_archives).',
    total_rows;
END $$;
