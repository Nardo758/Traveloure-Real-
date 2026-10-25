-- 411 — email_outbox.expires_at. Fix queue row 167 (outbox expiry).
-- HELD FOR LEON'S COMMENT on the PR before merge.
-- The citation form is in server/migrations/AUTHORING.md. This file is not that comment.
--
-- A held or pending row must be able to expire so a later allowlist does not
-- send it. NULL means the row has no expiry (rows written before this column,
-- and any writer that does not set it) and keeps the previous send rules.
--
-- Additive nullable timestamptz. NO DEFAULT, NO CHECK, NO index, NO backfill.
-- Declared in shared/schema.ts.

ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS expires_at timestamptz;
