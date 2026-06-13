-- Migration 073: Add click_content_type and click_content_id to affiliate_clicks
-- Stores the content type/id of the card that was clicked for direct attribution.

ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS click_content_type TEXT,
  ADD COLUMN IF NOT EXISTS click_content_id TEXT;
