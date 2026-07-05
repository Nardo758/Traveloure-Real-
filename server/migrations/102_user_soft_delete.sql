-- Migration 102: Soft-delete columns for users table
--
-- Adds is_deleted (boolean, NOT NULL DEFAULT FALSE) and deleted_at (nullable timestamp).
-- Hard deletes on users are prohibited: bookings, Stripe records, and tax data MUST be
-- retained for financial/legal compliance. Soft-delete anonymizes PII while keeping
-- all referential keys intact.
--
-- A partial index on (is_deleted=TRUE) keeps lookups fast without penalising the
-- 99.9 %+ of rows that will always have is_deleted=FALSE.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMP;

CREATE INDEX IF NOT EXISTS users_is_deleted_idx
  ON users (is_deleted)
  WHERE is_deleted = TRUE;
