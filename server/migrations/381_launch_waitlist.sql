-- 381 — launch waitlist + consent texts (LW-1a; ledger `2026-10-15-lw1a-launch-waitlist`; launch session brief
-- Oct 15, 2026, rulings 1 and 3). HELD until "Migration 381 SQL approved — Leon" is his own comment on the PR.
--
-- Two NEW tables, born EMPTY, plus three seeded platform_settings rows. Additive only: no ALTER of an existing
-- table, no DEFAULT, no CHECK, no FK. Every column but the primary key is nullable; the ONE writer
-- (server/services/launch-waitlist.service.ts, LW-1c) supplies id and timestamps itself. Value sets
-- (`source`) are app-enforced once in shared/launch-waitlist.ts. Tables and indexes are declared in
-- shared/schema.ts (deploy-push durability rule). IF NOT EXISTS / ON CONFLICT DO NOTHING throughout, so a
-- second run is a no-op.
--
-- The UNIQUE index is safe at creation because its table is created by this same migration (§20's born-object
-- carve-out): it is what makes a repeat sign-up an update of the one row, never a duplicate.

-- One row per (email, market). `email` is stored normalised (trimmed, lower-case) by the writer.
-- `consent_at` is an OPT-IN, not a gate (ruling 1): joining the list never requires it; NULL = the tick was
-- not given, and nothing is ever emailed to a NULL. `consent_text_id` names the consent_texts row the person
-- ticked (app-enforced, no FK). `referrer_user_id` / `short_link_code` are written only from a short_links row
-- the server resolved (LW-1d), never from a request body.
CREATE TABLE IF NOT EXISTS launch_waitlist (
  id                varchar PRIMARY KEY,
  email             varchar(255),
  market_slug       varchar(64),
  source            varchar(32),
  source_ref        varchar(200),
  referrer_user_id  varchar,
  short_link_code   varchar(12),
  consent_at        timestamp,
  consent_text_id   varchar,
  created_at        timestamp,
  updated_at        timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_launch_waitlist_email_market ON launch_waitlist (email, market_slug);
CREATE INDEX IF NOT EXISTS idx_launch_waitlist_market_created ON launch_waitlist (market_slug, created_at);

-- The exact consent wording a person ticked, versioned. A row is never edited: new wording is a new version.
CREATE TABLE IF NOT EXISTS consent_texts (
  id          varchar PRIMARY KEY,
  consent_key varchar(64),
  version     varchar(40),
  body        text,
  created_at  timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_texts_key_version ON consent_texts (consent_key, version);

-- Settings (ruling 3; Phase 0 sanction 3). ON CONFLICT DO NOTHING: an admin-set value is never overwritten.
-- traveler_signup_mode is read FAIL-CLOSED (a missing row or a read error means 'waitlist').
INSERT INTO platform_settings (setting_key, setting_value, description, updated_at)
VALUES
  (
    'traveler_signup_mode',
    'waitlist',
    'LW-1: "waitlist" refuses first-time TRAVELER sign-up on every path (403 TRAVELER_WAITLIST) and sends the person to the launch-market waitlist; "open" allows it. Supply sign-up, existing-account sign-in, QA-tagged accounts and admins are never refused. A missing row or read error is read as "waitlist".',
    NOW()
  ),
  (
    'launch_market_slug',
    'kyoto',
    'LW-1: the one launch market the waitlist page, the ticker''s planning door and waitlist-mode copy name. A market slug, read from here and never written as a literal in code.',
    NOW()
  ),
  (
    'earn_ready_made_example_enabled',
    'false',
    'LW-1: when "true", the /earn Ready-Made calculator shows its worked example line. Default "false" keeps it hidden.',
    NOW()
  )
ON CONFLICT (setting_key) DO NOTHING;
