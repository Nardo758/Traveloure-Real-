-- Migration 168: archive-then-drop `activity_bookings` (QA_PUNCH_LIST "activity_bookings [DM,
-- re-framed]" / W5-D PR #377 follow-on lane).
--
-- WHY: the shared/schema.ts `activityBookings` pgTable declaration exists ONLY to stop the
-- Replit Autoscale deploy-push from proposing `DROP TABLE activity_bookings` (the table has zero
-- code consumers -- no route, no storage method, no client caller -- see the schema.ts comment
-- it replaces). But `activity_bookings` holds ONE real production row (Segway Paris, user
-- 79cdafd1, a live Stripe PaymentIntent), so the declaration could not simply be deleted --
-- doing so would let the very next publish drop the table and lose that row. Decision-maker
-- ratified: ARCHIVE the row(s) queryably, THEN drop the table AND its now-pointless schema.ts
-- declaration, ending the publish prompt for good.
--
-- Step 1: a generic, durable archive for exactly this class of problem (a retired table that
-- still holds real rows) -- `legacy_archives`. Declared in shared/schema.ts in the same commit
-- (the deploy-push-durability rule: an undeclared archive table is itself a drop candidate on
-- the next publish, which would defeat the entire point of this migration). NO CHECK
-- constraint -> nothing for the preflight CONSTRAINT_MANIFEST, no publish-time push trap.
CREATE TABLE IF NOT EXISTS legacy_archives (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  source_table VARCHAR NOT NULL,
  archived_at TIMESTAMP DEFAULT NOW(),
  reason TEXT,
  row_data JSONB NOT NULL
);

-- Step 2 + 3: guarded copy-then-drop, idempotent, never fails.
DO $$
DECLARE
  already_archived BIGINT;
  row_count BIGINT;
BEGIN
  -- Fresh/dev DBs that never had this table: nothing to archive or drop, just confirm the
  -- archive table exists (done above) and exit cleanly.
  IF to_regclass('public.activity_bookings') IS NULL THEN
    RAISE NOTICE 'migration 168: activity_bookings already absent -- legacy_archives ensured, nothing to archive/drop.';
    RETURN;
  END IF;

  -- Idempotency guard: if a prior run already archived this table's rows, do not re-copy
  -- (a re-run must not duplicate archive rows). This is checked BEFORE the drop below, so a
  -- run that archives-then-drops cleanly, followed by any re-run (table now absent), simply
  -- hits the to_regclass branch above and no-ops -- this branch only matters for a re-run that
  -- somehow sees the table again (e.g. a restored backup).
  SELECT count(*) INTO already_archived
    FROM legacy_archives WHERE source_table = 'activity_bookings';

  IF already_archived > 0 THEN
    RAISE NOTICE 'migration 168: legacy_archives already holds % row(s) for activity_bookings -- skipping copy (idempotent).', already_archived;
  ELSE
    INSERT INTO legacy_archives (source_table, reason, row_data)
    SELECT
      'activity_bookings',
      'Retired activity_bookings (Viator/external provider bookings, superseded by service_bookings; zero code consumers beyond the schema.ts DROP-guard declaration) -- archived then dropped per decision-maker ratification, QA_PUNCH_LIST activity_bookings [DM, re-framed] / W5-D PR #377 follow-on.',
      to_jsonb(t.*)
    FROM public.activity_bookings t;

    GET DIAGNOSTICS row_count = ROW_COUNT;
    RAISE NOTICE 'migration 168: archived % row(s) from activity_bookings into legacy_archives.', row_count;
  END IF;

  DROP TABLE public.activity_bookings;
  RAISE NOTICE 'migration 168: activity_bookings dropped (data preserved in legacy_archives).';
END $$;
