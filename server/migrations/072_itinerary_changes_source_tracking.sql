-- Migration 072: Add source impression/content columns to itinerary_changes
-- Replaces metadata jsonb extraction for impression attribution with typed columns.

ALTER TABLE itinerary_changes
  ADD COLUMN IF NOT EXISTS source_impression_id TEXT,
  ADD COLUMN IF NOT EXISTS source_content_id TEXT;
