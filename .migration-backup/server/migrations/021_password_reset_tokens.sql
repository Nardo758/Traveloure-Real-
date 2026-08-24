-- LB-P1: Token-based password reset.
-- Single-use tokens (used_at + unique constraint), TTL via expires_at.
-- Only the sha256 hash of the token is stored; the raw token is sent via email
-- and never persisted server-side, so a DB leak cannot be used to reset accounts.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at) WHERE used_at IS NULL;
