-- Migration 126 — Tighten coordination_fee_credits event scoping.
--
-- Background (CLAUDE.md §7 follow-ups, resolved by this migration + companion code change):
--   1. Cross-event bleeding: the credit query had no event_type filter, so a credit earned
--      for Event A could silently reduce the fee for Event B.
--   2. Single-credit cap: the claim helper used LIMIT 1, preventing a traveler who paid two
--      optimize fees for the same event from having both credited.
--
-- This migration adds the index needed for the new event-scoped, multi-credit query.
-- The event_type column itself was created in migration 125 and is already populated
-- by optimization-payments/confirm when it inserts each credit row.
--
-- Legacy credits (event_type IS NULL) are preserved as "any event" credits — NULL means
-- the row pre-dates strict scoping and is eligible for any engagement. New credits
-- always carry the event_type from the PaymentIntent metadata.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS. No schema/CHECK change → no publish-time push trap.

-- Existing partial index covers unscoped (user_id, created_at) lookups.
-- This new index covers the event-type-scoped query:
--   WHERE user_id = ? AND (event_type = ? OR event_type IS NULL) AND consumed IS NULL
-- Include created_at so the planner can also order within the partial scan.
CREATE INDEX IF NOT EXISTS idx_coord_fee_credits_event_scoped
  ON coordination_fee_credits (user_id, event_type, created_at)
  WHERE consumed_by_coordination_id IS NULL;
