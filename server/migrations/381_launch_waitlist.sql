-- 381 — launch waitlist + consent texts (LW-1a; ledger `2026-10-15-lw1a-launch-waitlist`; launch session brief
-- Oct 15, 2026, rulings 1 and 3). HELD until "Migration 381 SQL approved — Leon" is his own comment on the PR.
--
-- Two NEW tables, born EMPTY, one additive nullable column on `users`, and three seeded platform_settings rows.
-- Additive only: no DEFAULT, no CHECK, no FK, nothing altered but the one ADD COLUMN. Every column but the
-- primary key is nullable; the ONE writer (server/services/launch-waitlist.service.ts, LW-1c) supplies id and
-- timestamps itself. Value sets (`role`, `trip_type`, `service_type`, `source`) are app-enforced once in
-- shared/launch-waitlist.ts. Tables and indexes are declared in
-- shared/schema.ts (deploy-push durability rule). IF NOT EXISTS / ON CONFLICT DO NOTHING throughout, so a
-- second run is a no-op.
--
-- The UNIQUE index is safe at creation because its table is created by this same migration (§20's born-object
-- carve-out): it is what makes a repeat sign-up an update of the one row, never a duplicate.

-- One row per (email, market), for BOTH forms (hand-off Part B "Field names"). `email` is stored normalised
-- (trimmed, lower-case) by the writer, which is how "unique per market" holds without the citext extension.
-- `role` is 'traveler' | 'provider' (app-enforced). Traveler answers: `trip_type` (proposal | wedding | foliage |
-- other), `rough_month` ('YYYY-MM'), `worry` (<= 500). Provider answers: `contact_name`, `business_name`,
-- `service_type` (the provider sign-up category list), `website`, `area` (<= 120), `languages`. Each half is
-- NULL on the other role's rows. `source` is `kyoto_waitlist_page` or `kyoto_blog_cta:<post-slug>` (allowlist
-- pattern, app-enforced); the FIRST source is kept on a repeat sign-up.
-- `consent_at` is an OPT-IN, not a gate (ruling 1): joining the list never requires it; NULL = the tick was
-- not given, and nothing is ever emailed to a NULL. `consent_text_version` names the consent_texts version the
-- person ticked (app-enforced, no FK). `unsubscribed_at` is written by a later unsubscribe rail; NULL = never
-- unsubscribed. `referrer_user_id` / `short_link_code` are written only from a short_links row the server
-- resolved (LW-1d), never from a request body.
CREATE TABLE IF NOT EXISTS launch_waitlist (
  id                   varchar PRIMARY KEY,
  email                varchar(255),
  market_slug          varchar(64),
  role                 varchar(16),
  source               varchar(200),
  trip_type            varchar(32),
  rough_month          varchar(7),
  worry                text,
  contact_name         varchar(120),
  business_name        varchar(160),
  service_type         varchar(64),
  website              varchar(500),
  area                 varchar(120),
  languages            text[],
  referrer_user_id     varchar,
  short_link_code      varchar(12),
  consent_at           timestamp,
  consent_text_version varchar(40),
  created_at           timestamp,
  updated_at           timestamp,
  unsubscribed_at      timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_launch_waitlist_email_market ON launch_waitlist (email, market_slug);
CREATE INDEX IF NOT EXISTS idx_launch_waitlist_market_created ON launch_waitlist (market_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_launch_waitlist_market_role ON launch_waitlist (market_slug, role);

-- The exact consent wording a person ticked, versioned. A row is never edited: new wording is a new version.
CREATE TABLE IF NOT EXISTS consent_texts (
  id          varchar PRIMARY KEY,
  consent_key varchar(64),
  version     varchar(40),
  body        text,
  created_at  timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_texts_key_version ON consent_texts (consent_key, version);

-- Supply sign-up source (LW-1d; Launch brief answer 3, Oct 15, 2026): one additive nullable TEXT column on an
-- EXISTING table — no DEFAULT, CHECK, index, FK or backfill (NULL = not recorded, never "other"). Written once,
-- server-side, at a SUPPLY sign-up from an allowlisted value (anything else is stored as 'other'); never by a
-- request body on any user-update rail (§19).
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source text;

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
