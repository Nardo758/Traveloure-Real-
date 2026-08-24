-- Migration 128 — Add revenue_reversal_missing flag to coordination_states.
-- When a coordination fee refund is processed but no platform_revenue row is found
-- to reverse (reversedRevenueRows = 0 with feeCents > 0), this flag is set to true.
-- Admins can see the alert in the concierge panel and investigate the ledger gap manually.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
ALTER TABLE coordination_states
  ADD COLUMN IF NOT EXISTS revenue_reversal_missing boolean NOT NULL DEFAULT false;
