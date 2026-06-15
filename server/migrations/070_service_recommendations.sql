-- Migration 070: Demand requests (detail) — service_recommendations,
--                recommendation_conversions, service_gap_analysis tables.
--
-- Extends the Service Recommendation Engine with:
--   • service_recommendations — AI-generated opportunity cards shown to experts
--     and providers on their dashboards (fed by service_demand_signals rows).
--   • recommendation_conversions — tracks which recommendations led to a
--     service creation, booking, or template use (closes the ML feedback loop).
--   • service_gap_analysis — identifies under-served niches per city/service
--     type (used by the "Market Gap Radar" admin view and provider recommendations).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run.

CREATE TABLE IF NOT EXISTS service_recommendations (
  id                  VARCHAR PRIMARY KEY,
  target_type         VARCHAR(20) NOT NULL,                     -- user | expert | provider | general
  target_id           VARCHAR,                                   -- nullable for general recs
  demand_signal_id    VARCHAR REFERENCES service_demand_signals(id) ON DELETE CASCADE,
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  service_type        VARCHAR(100) NOT NULL,
  city                VARCHAR(100),
  country             VARCHAR(100),
  opportunity_score   INT NOT NULL DEFAULT 0,                   -- 0–100
  potential_revenue   NUMERIC(10, 2),
  competition_level   VARCHAR(20),                              -- low | medium | high
  action_items        JSONB NOT NULL DEFAULT '[]',
  supporting_data     JSONB NOT NULL DEFAULT '{}',
  status              VARCHAR(20) NOT NULL DEFAULT 'active',    -- active | dismissed | converted | expired
  dismissed_at        TIMESTAMP,
  converted_at        TIMESTAMP,
  expires_at          TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_srec_target
  ON service_recommendations(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_srec_status
  ON service_recommendations(status, opportunity_score DESC);

-- ─── recommendation_conversions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recommendation_conversions (
  id                 VARCHAR PRIMARY KEY,
  recommendation_id  VARCHAR NOT NULL REFERENCES service_recommendations(id) ON DELETE CASCADE,
  user_id            VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  conversion_type    VARCHAR(50) NOT NULL,                      -- service_created | booking_made | template_used
  result_id          VARCHAR,
  revenue_generated  NUMERIC(10, 2),
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_conv_recommendation
  ON recommendation_conversions(recommendation_id);

-- ─── service_gap_analysis ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_gap_analysis (
  id                      VARCHAR PRIMARY KEY,
  city                    VARCHAR(100) NOT NULL,
  country                 VARCHAR(100),
  service_type            VARCHAR(100) NOT NULL,
  current_supply_count    INT DEFAULT 0,
  estimated_demand        INT DEFAULT 0,
  gap_score               INT NOT NULL DEFAULT 0,               -- 0–100, higher = bigger gap
  price_range_gap         JSONB NOT NULL DEFAULT '{}',
  quality_gap             INT DEFAULT 0,
  availability_gap        INT DEFAULT 0,
  language_gaps           JSONB NOT NULL DEFAULT '[]',
  specialization_gaps     JSONB NOT NULL DEFAULT '[]',
  competitor_analysis     JSONB NOT NULL DEFAULT '{}',
  opportunity_description TEXT,
  recommended_actions     JSONB NOT NULL DEFAULT '[]',
  last_analyzed_at        TIMESTAMP DEFAULT NOW(),
  expires_at              TIMESTAMP,
  created_at              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sga_city_service
  ON service_gap_analysis(city, service_type);
