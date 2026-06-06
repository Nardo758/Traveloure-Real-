-- Email verification tokens — same shape as password_reset_tokens but for
-- the signup verification flow. Single-use (used_at), time-limited (expires_at),
-- only the sha256 hash of the token is stored.

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_tokens(expires_at) WHERE used_at IS NULL;
