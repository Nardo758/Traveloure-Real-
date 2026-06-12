-- Migration 070: content_impressions table + source_impression_id on affiliate_clicks
-- Tracks card-level impressions on the Discover feed for full-funnel analytics
-- (impression → affiliate click → itinerary add).

CREATE TABLE IF NOT EXISTS content_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  city TEXT,
  card_position INTEGER,
  session_id TEXT NOT NULL,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_impressions_session_content_idx
  ON content_impressions (session_id, content_type, content_id);

CREATE INDEX IF NOT EXISTS content_impressions_city_type_idx
  ON content_impressions (city, content_type, created_at DESC);

ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS source_impression_id TEXT;
