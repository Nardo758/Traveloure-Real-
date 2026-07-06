-- Migration 105: Suspension columns for users table
--
-- Adds is_suspended (BOOLEAN NOT NULL DEFAULT FALSE), suspended_at (nullable timestamp),
-- and suspension_reason (nullable varchar 500).
--
-- Suspension is a temporary, reversible block distinct from soft-delete:
--  • PII and email are NOT anonymized — account is recoverable by admins.
--  • Triggers on: abuse reports, fraud holds, ToS violations, payment disputes.
--  • Admin action: PATCH /api/admin/users/:id/suspend  (sets is_suspended=TRUE + reason)
--                  PATCH /api/admin/users/:id/unsuspend (sets is_suspended=FALSE, clears fields)
--  • All login paths (email, Replit OIDC, Facebook) check isSuspended and return HTTP 403.
--  • isAuthenticated middleware checks isSuspended on every request so active sessions
--    are terminated immediately if an admin suspends a currently-logged-in account.
--
-- Partial index on (is_suspended=TRUE) keeps support/recovery lookups fast without
-- penalising the majority of rows that will always have is_suspended=FALSE.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended      BOOLEAN       NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(500);

CREATE INDEX IF NOT EXISTS users_is_suspended_idx
  ON users (is_suspended)
  WHERE is_suspended = TRUE;
