-- 408 — users.payout_method_type + users.payout_handle (ledger `2026-10-23-payout-setup-server`).
--
-- HELD for "Migration 408 SQL approved — Leon".
--
-- An earner's payout method, on the users row (the provider payout source of truth, and the one
-- row an expert updates for a non-Connect method). Stripe Connect stays primary. paypal and other
-- can be recorded. The handle is a PayPal email or username — never a bank account or routing
-- number. That refusal is app-enforced; this migration does not add a CHECK.
--
-- Experts still have Connect columns on local_expert_forms. Retiring that duplicate is a
-- follow-up and is not done here.
--
-- Additive, nullable, NO DEFAULT, NO CHECK, NO index, NO backfill. NULL method = not chosen.
-- Declared in shared/models/auth.ts (deploy-push durability). IF NOT EXISTS, so a second run
-- is a no-op. 407 is claimed by open PR #1653.

ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_method_type varchar(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_handle varchar(254);
