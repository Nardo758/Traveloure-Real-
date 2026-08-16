-- Migration 228: message abuse-reporting and user blocking
-- Adds user_blocks and message_reports tables (schema declared in shared/schema.ts).
-- All idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS user_blocks (
  id          VARCHAR PRIMARY KEY,
  blocker_id  VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT user_blocks_pair_unique UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON user_blocks (blocked_id);

CREATE TABLE IF NOT EXISTS message_reports (
  id               VARCHAR PRIMARY KEY,
  reporter_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id       VARCHAR REFERENCES user_and_expert_chats(id) ON DELETE SET NULL,
  report_type      VARCHAR(20) NOT NULL DEFAULT 'message',
  reason           VARCHAR(50) NOT NULL,
  details          TEXT,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_note       TEXT,
  reviewed_by      VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS message_reports_reporter_idx  ON message_reports (reporter_id);
CREATE INDEX IF NOT EXISTS message_reports_reported_idx  ON message_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS message_reports_status_idx    ON message_reports (status);
