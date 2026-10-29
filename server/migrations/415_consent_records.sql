-- 415 — consent_records (ledger `2026-10-29-waitlist-consent-server`).
--
-- HELD for "Migration 415 SQL approved — Leon". Do not merge until that comment is on the PR.
-- Do not run this against production until then.
--
-- Architect F1, Oct 29, 2026: launch_waitlist already has market_slug (381). This migration
-- does not ALTER, DROP, or add a column on launch_waitlist. It creates consent_records only.
--
-- One row per (waitlist row, consent key). waitlist_id references launch_waitlist(id)
-- ON DELETE CASCADE so deleting a waitlist row removes its consent rows. market_slug is
-- copied by the writer from that waitlist row. UNIQUE (waitlist_id, consent_key) is safe
-- at creation because the table is born empty by this same migration.
--
-- Additive: IF NOT EXISTS throughout. No DEFAULT, no CHECK, no backfill. No IP column
-- and no user-agent column. Declared in shared/schema.ts. A second run is a no-op.

CREATE TABLE IF NOT EXISTS consent_records (
  id                   varchar PRIMARY KEY,
  waitlist_id          varchar NOT NULL REFERENCES launch_waitlist (id) ON DELETE CASCADE,
  market_slug          varchar(64),
  consent_key          varchar(64) NOT NULL,
  consent_text_version varchar(40),
  consented_at         timestamp,
  revoked_at           timestamp,
  created_at           timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_records_waitlist_key
  ON consent_records (waitlist_id, consent_key);
