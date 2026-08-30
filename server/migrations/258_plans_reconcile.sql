-- Migration 258: plans and pricing foundation reconciliation
--
-- Ledger: 2026-08-27-plans-reconcile
-- Four supersessions:
--   1. plus_annual is explicitly annual at 2500 cents and has no beta window.
--   2. pro_monthly is explicitly monthly at 2900 cents with a 2026-12-31 beta window.
--   3. trip_pass is confirmed at 1900 cents per trip.
--   4. The shared concierge/provider/plan fee-band rows converge through idempotent inserts.
--
-- This migration is intentionally self-sufficient. A clean database has the plans table
-- established here; a development database that already received the unregistered 259
-- migration no-ops the CREATE/INSERT portions and receives only the missing reconciliation.
-- No optimizer fee key is introduced or changed. Existing fee-band values are never updated.

-- ── 1. plans baseline ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(64) NOT NULL UNIQUE,
  name text NOT NULL,
  price_cents integer NOT NULL,
  interval varchar(20) NOT NULL,
  allowances jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  -- Kept last so a clean create has the same ordinal shape as an existing
  -- plans table upgraded by the ADD COLUMN below.
  beta_free_until date
);

-- Dev received the abandoned table shape without this column. A CREATE TABLE
-- no-op cannot reconcile that shape, so add the missing ratified column
-- explicitly before inserts or updates name it.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS beta_free_until date;

INSERT INTO plans (key, name, price_cents, interval, allowances, active, effective_from, beta_free_until)
VALUES
  ('trip_pass', 'Trip Pass', 1900, 'trip', '{}'::jsonb, true, DATE '2026-08-27', NULL),
  ('plus_annual', 'Plus (Annual)', 2500, 'year', '{}'::jsonb, true, DATE '2026-08-27', NULL),
  ('pro_monthly', 'Pro (Monthly)', 2900, 'month', '{}'::jsonb, true, DATE '2026-08-27', DATE '2026-12-31')
ON CONFLICT (key) DO NOTHING;

-- The INSERT is intentionally followed by explicit UPDATEs: pre-existing rows are
-- reconciled to the ratified values, while all unlisted columns remain untouched.
UPDATE plans
SET name = 'Plus (Annual)',
    price_cents = 2500,
    interval = 'year',
    beta_free_until = NULL,
    updated_at = now()
WHERE key = 'plus_annual';

UPDATE plans
SET name = 'Pro (Monthly)',
    price_cents = 2900,
    interval = 'month',
    beta_free_until = DATE '2026-12-31',
    updated_at = now()
WHERE key = 'pro_monthly';

UPDATE plans
SET name = 'Trip Pass',
    price_cents = 1900,
    interval = 'trip',
    beta_free_until = NULL,
    updated_at = now()
WHERE key = 'trip_pass';

-- ── 2. fee_bands additions ──────────────────────────────────────────────────
ALTER TABLE fee_bands ADD COLUMN IF NOT EXISTS as_of_date date;
ALTER TABLE fee_bands ADD COLUMN IF NOT EXISTS review_date date;

-- Existing deployments may already have the widened check from the abandoned
-- 259 migration; DROP + ADD is safe in either state.
ALTER TABLE fee_bands DROP CONSTRAINT IF EXISTS fee_bands_rate_type_check;
ALTER TABLE fee_bands ADD CONSTRAINT fee_bands_rate_type_check
  CHECK (rate_type IN ('percent', 'flat', 'flat_cents', 'count', 'rule'));

-- INSERT-only semantics are deliberate: do not rewrite a previously configured
-- value, especially concierge:done_for_you_deposit_pct. The current ratified
-- value is 0.20; an existing row remains untouched.
INSERT INTO fee_bands
  (band_key, rate_type, default_rate, display_name, description, is_active, as_of_date, review_date)
VALUES
  ('concierge:ai_task', 'flat_cents', 299,
   'Concierge AI task fee',
   'Cents per AI Concierge task. Pricing ledger 2026-08-27-plans-reconcile.',
   true, DATE '2026-08-27', DATE '2026-11-27'),
  ('concierge:booking_pct', 'percent', 0.05,
   'Concierge booking percentage',
   'Fraction of booking value for Concierge facilitation. Pricing ledger 2026-08-27-plans-reconcile.',
   true, DATE '2026-08-27', DATE '2026-11-27'),
  ('concierge:booking_cap_cents', 'flat_cents', 4000,
   'Concierge booking fee cap',
   'Maximum Concierge booking fee in cents. Pricing ledger 2026-08-27-plans-reconcile.',
   true, DATE '2026-08-27', DATE '2026-11-27'),
  ('concierge:done_for_you_deposit_pct', 'percent', 0.20,
   'Done-for-you deposit percentage',
   'Fraction due as the done-for-you deposit. Existing values are never updated by this reconciliation.',
   true, DATE '2026-08-27', DATE '2026-11-27'),
  ('provider:pro_band_step', 'count', 1,
   'Provider Pro band step',
   'Unitless provider Pro-tier band step. Pricing ledger 2026-08-27-plans-reconcile.',
   true, DATE '2026-08-27', DATE '2026-11-27'),
  ('plans:plus_task_allowance', 'count', 4,
   'Plus plan task allowance',
   'Unitless AI task allowance for the Plus plan. Pricing ledger 2026-08-27-plans-reconcile.',
   true, DATE '2026-08-27', DATE '2026-11-27'),
  ('ready_made:platform_band', 'rule', 0,
   'Ready-made platform band (rule)',
   'inherit_expert',
   true, DATE '2026-08-27', DATE '2026-11-27')
ON CONFLICT (band_key) DO NOTHING;