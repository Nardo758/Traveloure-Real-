-- Migration 082: Content impressions table.
--
-- Source-branch file: 070_content_impressions.sql
--
-- Creates the content_impressions table for tracking when platform content
-- items (hidden gems, expert profiles, provider services, affiliate products)
-- are displayed to users. Feeds the Content Analytics dashboard, CTR
-- calculations, and the feed-composition quality loop.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run.

CREATE TABLE IF NOT EXISTS content_impressions (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type   VARCHAR(50) NOT NULL,       -- gem | expert | provider_service | affiliate_product | event
  content_id     VARCHAR(255) NOT NULL,
  city           VARCHAR(100),
  card_position  INT,                        -- slot position in the feed/grid (1-indexed)
  session_id     VARCHAR(255),
  user_id        VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ci_content
  ON content_impressions(content_type, content_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ci_user
  ON content_impressions(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ci_city
  ON content_impressions(city, created_at DESC) WHERE city IS NOT NULL;
