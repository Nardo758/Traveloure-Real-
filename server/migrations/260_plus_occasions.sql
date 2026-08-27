-- Migration 260: Plus occasions — home city, occasions, occasion_drafts, plan_memberships
--
-- Ledger: 2026-08-27-plus-is-delivery
-- Lane: plus-occasions (schema + scheduler + delivery). This migration lands the SCHEMA only;
-- the scheduler/generator/notification are code.
--
-- Four additive objects, all declared in shared/schema.ts (publish-trap rule — drizzle push is
-- authoritative and drops any table/column/index not declared there):
--   1. users.home_city          — the member's home/resident city (launch/operating market).
--   2. plan_memberships         — the ONE user-level entitlement record for the recurring plans
--                                 (plan_key 'plus_annual' | 'pro_monthly'). Trip Pass stays
--                                 per-trip and is NOT here. THIS lane reads it (isActivePlus);
--                                 the checkout lane later writes source='stripe' rows.
--   3. occasions                — a member's recurring/one-off personal dates.
--   4. occasion_drafts          — the idempotency ledger (CLAIM → generate → PROMOTE; §15).
--
-- POSTURE (migration-181/195 / publish-trap): every column is additive and nullable-or-defaulted;
-- NO DB CHECK, NO NOT NULL added to an existing table, NO DEFAULT backfill over live rows — so the
-- Replit deploy-push cannot fail publish on a legacy row. Vocabulary (template_key, recurrence,
-- status, source) is validated in app/zod code, never a DB CHECK. Idempotent via IF NOT EXISTS,
-- convergence-proof like 258 (a clean DB and a dev DB that already received an abandoned shape both
-- converge). PKs are varchar generated app-side (crypto.randomUUID) — the child-row convention.

-- ── 1. users.home_city ───────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_city varchar(120);

-- ── 2. plan_memberships ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_memberships (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_key varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',
  current_period_start timestamp,
  current_period_end timestamp,
  source varchar(20) NOT NULL DEFAULT 'manual',
  stripe_subscription_id varchar(255),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_memberships_user_idx ON plan_memberships (user_id);
CREATE INDEX IF NOT EXISTS plan_memberships_user_plan_idx ON plan_memberships (user_id, plan_key);

-- ── 3. occasions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS occasions (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_key varchar(64) NOT NULL,
  occasion_date date NOT NULL,
  recurrence varchar(20) NOT NULL DEFAULT 'none',
  label varchar(200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS occasions_user_idx ON occasions (user_id);
CREATE INDEX IF NOT EXISTS occasions_active_date_idx ON occasions (active, occasion_date);

-- ── 4. occasion_drafts (idempotency ledger) ──────────────────────────────────
-- Dedupe key (occasion_id, cycle_key): cycle_key is the concrete target occurrence date
-- (YYYY-MM-DD), unique per cycle for ANY recurrence. trip_id ON DELETE SET NULL so deleting a
-- generated slip does not erase the ledger row (which still guards against a re-draft).
CREATE TABLE IF NOT EXISTS occasion_drafts (
  id varchar PRIMARY KEY,
  occasion_id varchar NOT NULL REFERENCES occasions(id) ON DELETE CASCADE,
  cycle_key varchar(32) NOT NULL,
  occasion_year integer NOT NULL,
  trip_id varchar REFERENCES trips(id) ON DELETE SET NULL,
  claimed_at timestamp DEFAULT now(),
  generated_at timestamp,
  notified_at timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT occasion_drafts_occasion_cycle_unique UNIQUE (occasion_id, cycle_key)
);
CREATE INDEX IF NOT EXISTS occasion_drafts_occasion_idx ON occasion_drafts (occasion_id);
