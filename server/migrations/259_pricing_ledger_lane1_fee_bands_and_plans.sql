-- 259: Pricing ledger Lane 1 (Task 1669) — new fee_bands rows + a new minimal `plans` table.
--
-- Phase 0 findings (also recorded in docs/pricing/PRICING_LEDGER_LANE1_FINDINGS.md):
--   * docs/design/PRICING_AND_FEATURE_MAP.md does not exist anywhere in this repo (checked
--     working tree + `git log --all`). This migration is built from Task 1669's explicit
--     key/value list, not from that (missing) source file.
--   * Of the "seven" affiliate partners the source map is assumed to require, migration 033
--     already seeds NINE `affiliate:<partner>` rows (viator, getyourguide, klook, fever, 12go,
--     amadeus, tiqets, headout, musement). `affiliate:civitatis` and `affiliate:xcaret` do NOT
--     exist. Filed as missing — this migration does not invent a guessed rate for either, and
--     does not touch any existing `affiliate:<partner>` row.
--   * No `plans` table existed before this migration.
--   * No existing fee_bands row's rate_type/default_rate/min_rate/max_rate/max_amount/is_active
--     value is changed by this migration.
--
-- Units convention introduced here (so a future reader of rate_type never misreads a value):
--   * rate_type='percent'    — unchanged fraction convention (0.25 = 25%).
--   * rate_type='flat'       — unchanged USD-DOLLAR convention (49.99 = $49.99, see the
--     schema.ts header comment on fee_bands). Deliberately NOT used below — the task's given
--     values (499 / 299 / 4000) are CENTS, and inserting them as 'flat' would silently misread
--     as $499 / $299 / $4000 against that existing convention.
--   * rate_type='flat_cents' (NEW) — integer cents. Used for the three new dollar-amount rows
--     below ($4.99 / $2.99 / $40.00 respectively).
--   * rate_type='count' (NEW)      — a unitless integer (a step or an allowance count), never a
--     currency amount.
--   * rate_type='rule' (NEW)       — a non-numeric governance value. default_rate is a sentinel
--     0 (the column is NOT NULL); the actual rule string lives in `description`, which was
--     already free text and had no resolver reading it as a number.
-- requireBand() only ever accepts rate_type='percent' (server/services/fee-resolution.service.ts),
-- so none of the three new rate_types above can be silently misread by that existing fail-loud
-- path — they are only ever read via the new Lane 1 accessors added alongside it.
--
-- as_of_date / review_date: fee_bands had no date columns before this migration. Two new
-- NULLable columns are added below (additive, no CHECK, no default requirement) rather than
-- repurposing description/display_name. Existing rows get NULL in both columns — no existing
-- row's value or meaning changes.

-- ── 1. fee_bands: additive nullable date columns (Lane 1) ──────────────────────────────────
ALTER TABLE fee_bands ADD COLUMN IF NOT EXISTS as_of_date date;
ALTER TABLE fee_bands ADD COLUMN IF NOT EXISTS review_date date;

-- Widen the rate_type CHECK (000_baseline_schema.sql / 031_phase1_scaffold_fee_bands.sql
-- originally allowed only 'percent'|'flat') to admit the three new Lane 1 rate_types. Existing
-- 'percent'/'flat' rows and their meaning are untouched — this only ADMITS more values.
ALTER TABLE fee_bands DROP CONSTRAINT IF EXISTS fee_bands_rate_type_check;
ALTER TABLE fee_bands ADD CONSTRAINT fee_bands_rate_type_check
  CHECK (rate_type IN ('percent', 'flat', 'flat_cents', 'count', 'rule'));

-- ── 2. fee_bands: eight new namespaced Lane 1 rows ──────────────────────────────────────────
INSERT INTO fee_bands (band_key, rate_type, default_rate, display_name, description, is_active, as_of_date, review_date)
VALUES
  ('optimizer:run', 'flat_cents', 499, 'Optimizer run (one-time fee)',
   'Pricing ledger Lane 1 (Task 1669). CENTS ($4.99). Read by the Optimize step''s ledger-priced teaser in client/src/pages/cart.tsx. The existing tiered optimization_fees table (via getFee(), server/services/optimization-fee.service.ts) remains the sole source for the actual charged PaymentIntent amount — this band does not replace or regress that flow. See PRICING_LEDGER_LANE1_FINDINGS.md.',
   true, '2026-08-27', '2026-11-27'),
  ('concierge:ai_task', 'flat_cents', 299, 'Concierge AI task fee',
   'Pricing ledger Lane 1 (Task 1669). CENTS ($2.99). Phase 0 found no live client surface for a per-task AI Concierge price outside DeliveryOptions.tsx, whose AI-tier price already sources from optimization_fees via getFee() (not fee_bands). Left unwired pending a real consuming surface — see PRICING_LEDGER_LANE1_FINDINGS.md.',
   true, '2026-08-27', '2026-11-27'),
  ('concierge:booking_pct', 'percent', 0.05, 'Concierge booking percentage',
   'Pricing ledger Lane 1 (Task 1669). Fraction (5%). Not yet wired to a resolver call site — filed for a later lane per PRICING_LEDGER_LANE1_FINDINGS.md.',
   true, '2026-08-27', '2026-11-27'),
  ('concierge:booking_cap_cents', 'flat_cents', 4000, 'Concierge booking fee cap',
   'Pricing ledger Lane 1 (Task 1669). CENTS ($40.00), intended to pair with concierge:booking_pct as a per-booking ceiling. Not yet wired to a resolver call site — filed for a later lane.',
   true, '2026-08-27', '2026-11-27'),
  ('concierge:done_for_you_deposit_pct', 'percent', 0.20, 'Done-for-you deposit percentage',
   'Pricing ledger Lane 1 (Task 1669). Fraction (20%). Not yet wired to a resolver call site — filed for a later lane.',
   true, '2026-08-27', '2026-11-27'),
  ('ready_made:platform_band', 'rule', 0, 'Ready-made platform band (rule)',
   'inherit_expert',
   true, '2026-08-27', '2026-11-27'),
  ('provider:pro_band_step', 'count', 1, 'Provider Pro band step',
   'Pricing ledger Lane 1 (Task 1669). Unitless integer step for provider Pro-tier band progression. Not yet wired to a resolver call site — filed for a later lane.',
   true, '2026-08-27', '2026-11-27'),
  ('plans:plus_task_allowance', 'count', 4, 'Plus plan task allowance',
   'Pricing ledger Lane 1 (Task 1669). Unitless integer — count of AI tasks allotted by the plus_annual plan per period. Not yet wired to a resolver call site — filed for a later lane.',
   true, '2026-08-27', '2026-11-27')
ON CONFLICT (band_key) DO NOTHING;

-- ── 3. plans: new minimal table (Lane 1) ────────────────────────────────────────────────────
-- Stripe product creation and entitlement/gating logic are explicitly out of scope for this
-- lane (see Task 1669) — this table only creates and exposes the rows.
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
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO plans (key, name, price_cents, interval, allowances, active, effective_from)
VALUES
  ('trip_pass', 'Trip Pass', 1900, 'trip', '{}'::jsonb, true, '2026-08-27'),
  ('plus_annual', 'Plus (Annual)', 2500, 'year', '{}'::jsonb, true, '2026-08-27'),
  ('pro_monthly', 'Pro (Monthly)', 2900, 'month', '{}'::jsonb, true, '2026-08-27')
ON CONFLICT (key) DO NOTHING;
