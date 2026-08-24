-- Migration 126 — Expand fee_payment_status CHECK to include 'refunded'.
--
-- Migration 125 created the CHECK with only ('unpaid','pending','paid').
-- The admin coordination refund endpoint sets fee_payment_status = 'refunded',
-- which violates the constraint at runtime. This migration drops the old CHECK
-- and recreates it with the four valid terminal/transit states.
--
-- Idempotent: the DO $$ block checks pg_constraint by name before acting, so
-- re-running on a DB where the wider constraint already exists is a no-op.

DO $$
BEGIN
  -- Drop the old constraint if it exists (regardless of which values it allows).
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coordination_states_fee_payment_status_check'
  ) THEN
    ALTER TABLE coordination_states
      DROP CONSTRAINT coordination_states_fee_payment_status_check;
  END IF;

  -- Add the expanded constraint.
  ALTER TABLE coordination_states
    ADD CONSTRAINT coordination_states_fee_payment_status_check
    CHECK (fee_payment_status IN ('unpaid', 'pending', 'paid', 'refunded'));
END $$;
