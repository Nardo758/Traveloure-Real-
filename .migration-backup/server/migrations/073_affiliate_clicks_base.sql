-- Migration 073: Affiliate clicks — affiliate_clicks base table.
--
-- Creates the affiliate_clicks table that records every outbound affiliate
-- link click from the platform. Attribution columns (initiated_by, agent_type,
-- session_id) were added by migration 005 via ALTER TABLE IF NOT EXISTS, so
-- that migration is fully idempotent whether or not this CREATE runs first.
--
-- This table is the source of truth for:
--   • Affiliate commission reconciliation (affiliate_earnings.click_id FK)
--   • AI attribution reporting (agent_type, session_id)
--   • Transport hub click tracking (server/routes/transport-hub.routes.ts)
--   • Content route affiliate link resolution (server/routes/content.routes.ts)
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run on environments
-- where drizzle-kit push already created this table.

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        VARCHAR REFERENCES affiliate_products(id) ON DELETE SET NULL,
  partner_id        VARCHAR REFERENCES affiliate_partners(id) ON DELETE SET NULL,
  user_id           VARCHAR,
  trip_id           VARCHAR,
  itinerary_item_id VARCHAR,
  referrer          VARCHAR(500),
  user_agent        VARCHAR(500),
  ip_address        VARCHAR(50),
  initiated_by      VARCHAR(20) DEFAULT 'user',                 -- user | ai_agent | expert
  agent_type        VARCHAR(20),                                -- grok | claude | system | null
  session_id        VARCHAR(255),                               -- AI planning session trace ID
  clicked_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product
  ON affiliate_clicks(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user
  ON affiliate_clicks(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_clicked_at
  ON affiliate_clicks(clicked_at DESC);
