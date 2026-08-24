-- Migration 072: Changes tracking — content_placement_rules table.
--
-- Admin-editable rules that control where affiliate products and content-registry
-- items are surfaced across the Discover feed and other platform surfaces. Each
-- row maps a piece of content (affiliate_product or content_registry entry) to
-- one or more SurfaceSlug values with optional pulse-score gating.
--
-- Used by:
--   • GET /api/content-placement-rules  (server/routes/content.routes.ts)
--   • The Discover feed composition layer (client/src/lib/feed-composition.ts)
--   • Admin Content Placement UI
--
-- "Changes tracking" refers to the auditable, admin-driven placement change
-- log: every rule row carries created_at/updated_at for audit purposes, and
-- the is_auto_tagged flag distinguishes human edits from auto-indexer changes.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run.

CREATE TABLE IF NOT EXISTS content_placement_rules (
  id               VARCHAR PRIMARY KEY,
  content_source   VARCHAR(30) NOT NULL,                        -- affiliate_product | content_registry
  source_id        VARCHAR(255) NOT NULL,
  content_label    VARCHAR(500),
  city_name        VARCHAR(100) NOT NULL,
  country          VARCHAR(100),
  surfaces         JSONB NOT NULL DEFAULT '[]',                 -- array of SurfaceSlug strings
  min_pulse_score  INT DEFAULT 0,
  is_pinned        BOOLEAN DEFAULT false,                       -- bypass pulse threshold
  is_auto_tagged   BOOLEAN DEFAULT false,                       -- created by auto-indexer
  is_active        BOOLEAN DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpr_city_active
  ON content_placement_rules(city_name, is_active);
CREATE INDEX IF NOT EXISTS idx_cpr_source
  ON content_placement_rules(content_source, source_id);
