-- 318_reconciliation_runs_checked_subscriptions.sql
-- Ledger `2026-09-21-membership-reconciliation` (memberships increment 3).
--
-- §17 rule 2: every per-rail tally a pass computes is written onto its `reconciliation_runs` row,
-- so a SCHEDULED pass leaves a durable record of that rail's work and silence stays
-- distinguishable from a dead job. The MEMBERSHIP rail added by this lane needs its own column,
-- exactly as the ready-made rail got one in migration 301 (D-42).
--
-- NULLABLE, NO DEFAULT, NO CHECK, NO BACKFILL — the migration-301 posture. NULL on a row means
-- THAT PASS NEVER TALLIED THIS RAIL, which is the only honest reading for every run recorded
-- before this column existed. A `0` default would assert those passes examined zero subscriptions,
-- which is a different claim and a false one (§13).
--
-- COLUMN-ONLY and idempotent, so the Replit deploy push may offer exactly this as §20's one
-- approvable prompt; declining it is equally safe, since boot applies this file a minute later.

ALTER TABLE reconciliation_runs
  ADD COLUMN IF NOT EXISTS checked_subscriptions integer;
