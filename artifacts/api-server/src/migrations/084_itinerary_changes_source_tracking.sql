-- Migration 084: Source tracking columns on itinerary_changes.
--
-- Source-branch file: 072_itinerary_changes_source_tracking.sql
--
-- Adds two source-tracking columns to itinerary_changes so the audit log
-- records which content impression triggered a change (closing the impression
-- → action attribution loop) and which specific content item was the source.
--
--   source_impression_id  — FK to the content_impressions row that led to
--                           this itinerary change (nullable; set when an
--                           expert/AI acts on a surfaced recommendation).
--   source_content_id     — denormalised content item ID for fast reporting
--                           without joining content_impressions.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; safe to re-run.

ALTER TABLE itinerary_changes
  ADD COLUMN IF NOT EXISTS source_impression_id VARCHAR,
  ADD COLUMN IF NOT EXISTS source_content_id    VARCHAR;

COMMENT ON COLUMN itinerary_changes.source_impression_id IS
  'FK to content_impressions.id — the impression that triggered this change.';
COMMENT ON COLUMN itinerary_changes.source_content_id IS
  'Denormalised content item ID for attribution reporting.';
