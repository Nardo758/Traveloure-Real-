-- Migration 079: Season tag column on offering types tables.
--
-- Source-branch file: 067_season_tag_on_offering_types.sql
--
-- Adds an optional `season_tag` column to both service_offering_types and
-- expert_offering_types. The tag is a free-text hint used by the Service
-- Recommendation Engine and TravelPulse intelligence layer to surface
-- seasonally relevant offerings (e.g. "Cherry blossom season", "Ski season").
-- NULL means the offering is available year-round.
--
-- Idempotent: ALTER TABLE … ADD COLUMN IF NOT EXISTS; safe to re-run.

ALTER TABLE service_offering_types
  ADD COLUMN IF NOT EXISTS season_tag VARCHAR(100);

ALTER TABLE expert_offering_types
  ADD COLUMN IF NOT EXISTS season_tag VARCHAR(100);

COMMENT ON COLUMN service_offering_types.season_tag IS
  'Optional seasonal relevance tag (e.g. "Cherry blossom", "Ski season"). NULL = year-round.';

COMMENT ON COLUMN expert_offering_types.season_tag IS
  'Optional seasonal relevance tag (e.g. "Cherry blossom", "Ski season"). NULL = year-round.';
