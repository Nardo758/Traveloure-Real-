-- 423 — email_suppressions (Z-21, fix-queue row 171).
--
-- Held. Do not merge, and do not run this against production, until the owner
-- has approved this SQL on the pull request.
--
-- One row per normalized address and reason. The webhook records hard bounces
-- and complaints. sendEmail reads the table and refuses a suppressed address.
-- Additive: IF NOT EXISTS. No DEFAULT, no CHECK, no backfill. A second run is
-- a no-op. Declared in shared/schema.ts.
--
-- 421 is PR #1804. 422 is PR #1803. This file is 423.

CREATE TABLE IF NOT EXISTS email_suppressions (
  id varchar PRIMARY KEY,
  email varchar NOT NULL,
  reason varchar NOT NULL,
  provider_event_id varchar,
  provider_email_id varchar,
  recorded_at timestamp,
  created_at timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_suppressions_email_reason
  ON email_suppressions (email, reason);
