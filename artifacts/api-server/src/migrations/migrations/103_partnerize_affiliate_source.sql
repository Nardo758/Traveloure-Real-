-- Migration 103: Partnerize affiliate network integration
--
-- Adds source-tracking columns to affiliate_partners so rows synced from the
-- Partnerize affiliate network can be distinguished from manually-created /
-- scraper-managed partners in the admin UI and in link-generation logic.
--
--   source              - "manual" (default, existing behavior) | "partnerize"
--   external_campaign_id - Partnerize's own campaign id, used as the upsert key
--                          for idempotent re-syncs
--   last_synced_at       - timestamp of the most recent successful Partnerize sync

ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual';
ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS external_campaign_id VARCHAR(100);
ALTER TABLE affiliate_partners ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS affiliate_partners_source_idx ON affiliate_partners (source);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_partners_external_campaign_id_idx
  ON affiliate_partners (external_campaign_id)
  WHERE external_campaign_id IS NOT NULL;
