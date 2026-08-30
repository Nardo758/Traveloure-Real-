-- Migration 163 — W2-B: 'withdrawn' status for ready_made_trips (store listing withdraw).
--
-- The migration-133 CHECK (ready_made_trips_status_check) only allows
-- draft|submitted|approved|rejected. The new withdraw endpoint
-- (POST /api/expert/ready-made/:id/withdraw) needs a 'withdrawn' state the author can reach
-- from ANY current status, and the existing /submit endpoint now accepts 'withdrawn' back into
-- 'submitted' (a withdrawn-then-resubmitted listing re-enters the admin queue — D1a: never
-- straight to 'approved').
--
-- Drop-and-recreate CHECK pattern (127_coordination_fee_refunded_status.sql): existing rows are
-- all in the old four-value set, so WIDENING the allowed set can never violate them — no remap
-- needed, safe to apply on prod with no preflight remap required (a widen never turns a
-- previously-valid row invalid). Idempotent: the DO $$ block drops the constraint by name if
-- present, then unconditionally re-adds the widened one — re-running finds the same
-- (already-widened) constraint under the same name and repeats the no-op drop+add.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ready_made_trips_status_check'
  ) THEN
    ALTER TABLE ready_made_trips DROP CONSTRAINT ready_made_trips_status_check;
  END IF;

  ALTER TABLE ready_made_trips
    ADD CONSTRAINT ready_made_trips_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'withdrawn'));
END $$;
