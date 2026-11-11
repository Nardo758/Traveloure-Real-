-- 444_slice0_staff_roles.sql
-- Slice 0 (Addendum A v2, architect Nov 10, 2026; Leon's GO the same day): staff roles, market scope,
-- owner sign-off, bot actors. Ledger 2026-11-10-slice0-staff-roles.
--
--   · staff_market_assignments: born empty, so the partial UNIQUE is safe. Writer: owner only, audited.
--   · staff_approved_at / staff_approved_by on service_provider_forms and provider_services: nullable,
--     no DEFAULT, no CHECK, no FK (existing-table posture). approval_status is untouched.
--   · bot_proposals.assigned_to: nullable FK users ON DELETE SET NULL (A v2).
--   · bot_audit_logs: one row per bot key call (Phase 0 F1: access_audit_logs.actor_id must be a users row).
--   · platform_settings: two rows, never overwritten.
--   · users.role: the `admin` value becomes `platform_admin` (`admin` stays accepted as an alias in code).
--
-- NOT HERE, by ruling: the statement that makes Leon's account the owner. His users.id never goes in a commit;
-- he runs that one statement by hand in each database after this applies (PR #1979).
--
-- No ALTER COLUMN, no CHECK, no DEFAULT change on an existing column, no DELETE. Idempotent: a second run
-- changes nothing.

CREATE TABLE IF NOT EXISTS staff_market_assignments (
  id varchar PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_slug varchar(64) NOT NULL,
  granted_by varchar REFERENCES users(id) ON DELETE SET NULL,
  granted_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp,
  revoked_by varchar REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_market_assignments_active
  ON staff_market_assignments (user_id, market_slug) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_market_assignments_user ON staff_market_assignments (user_id);

ALTER TABLE service_provider_forms ADD COLUMN IF NOT EXISTS staff_approved_at timestamp;
ALTER TABLE service_provider_forms ADD COLUMN IF NOT EXISTS staff_approved_by varchar;
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS staff_approved_at timestamp;
ALTER TABLE provider_services ADD COLUMN IF NOT EXISTS staff_approved_by varchar;

ALTER TABLE bot_proposals ADD COLUMN IF NOT EXISTS assigned_to varchar REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS bot_audit_logs (
  id varchar PRIMARY KEY,
  bot_id varchar NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  action varchar(30) NOT NULL,
  resource_type varchar(50),
  resource_id varchar(300),
  method varchar(10) NOT NULL,
  path text NOT NULL,
  scope varchar(40),
  status_code integer,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_audit_logs_bot_created ON bot_audit_logs (bot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bot_audit_logs_created ON bot_audit_logs (created_at);

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES
  ('provider_signoff_required_for', 'all_staff',
   'Slice 0: whose provider and listing approvals wait for the owner''s sign-off: all_staff | regional_only | none. Owner-only, audited.',
   now()),
  ('bot_audit_retention_days', '90',
   'Slice 0: days a bot_audit_logs row is kept before the daily prune deletes it.',
   now())
ON CONFLICT (setting_key) DO NOTHING;

UPDATE users SET role = 'platform_admin' WHERE role = 'admin';
