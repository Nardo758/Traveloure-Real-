-- Migration 139: short_links — backoffice S3 (short-link + click store).
-- New table, additive, NO CHECK constraints (target_type vocabulary is app-enforced —
-- the publish-time drizzle-push CHECK-failure trap CLAUDE.md warns about). Owner is a
-- hard FK to users (ON DELETE CASCADE) so a deleted account's links are cleaned up.

CREATE TABLE IF NOT EXISTS short_links (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) UNIQUE NOT NULL,
  owner_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(30) NOT NULL,
  target_id VARCHAR,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_short_links_owner_user_id ON short_links(owner_user_id);
