-- 378 — BOT-1 Phase 1: the bot channel's two tables and its one setting
-- (decision-maker, Oct 15, 2026: scope report approved as scoped, decisions A–D; ledger `2026-10-15-bot1-phase1`).
--
-- Two NEW tables, born empty, declared in shared/schema.ts (deploy-push durability rule). NO CHECK and NO DEFAULT
-- on any status column; the value sets live once in shared/bot-proposals.ts. The UNIQUE indexes are on tables this
-- migration creates, so no existing row can violate them.
--   · bot_accounts  — one row per bot. A bot is NOT a users row. Only the SHA-256 of its token is stored.
--   · bot_proposals — what a bot files. Pending proposals live here and nowhere else; an approved one is written to
--                     place_facts by the ONE writer (recordFacts) and points at that row by fact_id.
-- One platform_settings row (decision B): bot_fact_default_expiry_days = 90, admin-editable, used only when the
-- cited source row states no refresh_interval_days. ON CONFLICT DO NOTHING: an admin's later value is never reset.
CREATE TABLE IF NOT EXISTS bot_accounts (
  id            varchar PRIMARY KEY,
  name          varchar(120) NOT NULL,
  scopes        text[] NOT NULL,
  token_hash    varchar(64) NOT NULL,
  expires_at    timestamp,
  revoked_at    timestamp,
  last_used_at  timestamp,
  created_by    varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_accounts_token_hash ON bot_accounts (token_hash);

CREATE TABLE IF NOT EXISTS bot_proposals (
  id              varchar PRIMARY KEY,
  bot_id          varchar NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  kind            varchar(40) NOT NULL,
  place_ref_kind  varchar(20) NOT NULL,
  place_ref       varchar(300) NOT NULL,
  market          varchar(64),
  value           jsonb NOT NULL,
  source_id       varchar(64) REFERENCES content_sources(id) ON DELETE SET NULL,
  source_url      text NOT NULL,
  quote           text NOT NULL,
  checked_at      timestamp NOT NULL,
  dedupe_hash     varchar(64) NOT NULL,
  status          varchar(16) NOT NULL,
  reviewed_by     varchar REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     timestamp,
  reject_reason   text,
  fact_id         varchar,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_proposals_dedupe ON bot_proposals (dedupe_hash);
CREATE INDEX IF NOT EXISTS idx_bot_proposals_status ON bot_proposals (status);
CREATE INDEX IF NOT EXISTS idx_bot_proposals_bot ON bot_proposals (bot_id);

INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES (
  'bot_fact_default_expiry_days',
  '90',
  'Days an approved bot-proposed fact stays current when its source row states no refresh_interval_days (BOT-1, decision B).',
  now()
)
ON CONFLICT (setting_key) DO NOTHING;
