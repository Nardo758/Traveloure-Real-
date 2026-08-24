-- Migration 085: Content attribution fields on affiliate_clicks.
--
-- Source-branch file: 073_affiliate_clicks_content_fields.sql
--
-- Adds three content-attribution columns to affiliate_clicks so every
-- outbound affiliate link click is traceable back to the content impression
-- and content item that surfaced the link.
--
--   source_impression_id  — FK to content_impressions.id (the impression
--                           that led the user to click the affiliate link).
--   click_content_type    — content category of the surfacing item:
--                            gem | expert | provider_service | event | feed_card
--   click_content_id      — primary key of the surfacing content item.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS; safe to re-run.

ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS source_impression_id VARCHAR,
  ADD COLUMN IF NOT EXISTS click_content_type   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS click_content_id     VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_content
  ON affiliate_clicks(click_content_type, click_content_id)
  WHERE click_content_type IS NOT NULL;

COMMENT ON COLUMN affiliate_clicks.source_impression_id IS
  'FK to content_impressions.id — the impression that led to this click.';
COMMENT ON COLUMN affiliate_clicks.click_content_type IS
  'Content type of the item that surfaced this affiliate link: gem | expert | provider_service | event | feed_card';
COMMENT ON COLUMN affiliate_clicks.click_content_id IS
  'Primary key of the content item that surfaced this affiliate link.';
