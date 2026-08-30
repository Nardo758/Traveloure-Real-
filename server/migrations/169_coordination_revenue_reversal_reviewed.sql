-- Migration 169 — #877: let an admin mark a coordination revenue-reversal ledger gap reviewed.
--
-- Migration 128 added `coordination_states.revenue_reversal_missing` (set true when a coordination
-- fee refund finds no platform_revenue row to reverse) and the admin concierge panel
-- (client/src/pages/admin/concierge-requests.tsx) renders it as a permanent "Ledger gap:" warning
-- with NO way to acknowledge it — once true, it warns forever even after an admin has manually
-- investigated and confirmed the ledger is fine (or fixed it out-of-band).
--
-- Adds TWO additive, nullable columns (mirrors the DMO intake gate's reviewed_by/reviewed_at
-- pattern) so a reviewed gap can be distinguished from an open one without deleting the
-- underlying flag or its audit trail:
--   revenue_reversal_reviewed_at  — NULL = not yet reviewed (the open-warning state)
--   revenue_reversal_reviewed_by  — the admin user id who reviewed it (nullable, ON DELETE SET NULL
--                                    so a deleted admin account never blocks this column)
--
-- No CHECK, no DEFAULT beyond NULL, no backfill (every existing row is legitimately un-reviewed —
-- there is nothing to infer) -> nothing for the preflight CONSTRAINT_MANIFEST, no publish-time
-- drizzle-push trap. Both columns are also declared on the coordinationStates pgTable in
-- shared/schema.ts in the same commit (deploy-push durability rule).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
ALTER TABLE coordination_states
  ADD COLUMN IF NOT EXISTS revenue_reversal_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS revenue_reversal_reviewed_by varchar REFERENCES users(id) ON DELETE SET NULL;
