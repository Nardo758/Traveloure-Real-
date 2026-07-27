-- 149: F8 launch-market CHECK on ready_made_trips.market (§12 one-wedge-Kyoto).
-- The Kyoto scope was only a server-side zod default; the write paths now validate against
-- shared/launch-markets.ts and this CHECK enforces it at the DB (the migration-109 lesson:
-- enforce the state machine / vocabulary at the DB, not just app code).
--
-- Guarded: REFUSES (raises) if any existing row carries a non-launch market rather than
-- half-applying — remap those rows first (scripts/preflight-prod-constraints.cjs lists them
-- before a prod publish). Idempotent on re-run (duplicate_object swallowed).
--
-- Growing the launch: replace this CHECK in a NEW migration (drop + re-add with the wider
-- set) and update shared/launch-markets.ts + the preflight manifest together.

DO $$
DECLARE
  bad_count integer;
  bad_values text;
BEGIN
  SELECT COUNT(*), string_agg(DISTINCT market, ', ')
    INTO bad_count, bad_values
    FROM ready_made_trips
   WHERE market NOT IN ('Kyoto');

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'ready_made_trips has % row(s) with non-launch market value(s): %. Remap them before applying the market CHECK (see scripts/preflight-prod-constraints.cjs).',
      bad_count, bad_values;
  END IF;

  BEGIN
    ALTER TABLE ready_made_trips
      ADD CONSTRAINT ready_made_trips_market_check CHECK (market IN ('Kyoto'));
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already applied
  END;
END $$;
