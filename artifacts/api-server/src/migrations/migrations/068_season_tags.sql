-- Migration 068: Season tags — seasonal_opportunities table.
--
-- Provides the seasonal opportunity calendar used by the Service Recommendation
-- Engine to surface proactive, month-aware recommendations to experts and
-- providers (e.g. "Cherry blossom season in Tokyo peaks in April — prepare
-- now"). Feeds server/routes/upsell.routes.ts and the TravelPulse intelligence
-- layer when generating demand-aware recommendations.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run.

CREATE TABLE IF NOT EXISTS seasonal_opportunities (
  id                     VARCHAR PRIMARY KEY,
  city                   VARCHAR(100) NOT NULL,
  country                VARCHAR(100),
  month                  INT NOT NULL,                          -- 1–12
  service_type           VARCHAR(100) NOT NULL,
  opportunity_type       VARCHAR(50) NOT NULL,                  -- peak_demand | event_driven | weather_optimal
  event_name             VARCHAR(255),                          -- populated for event_driven rows
  demand_multiplier      NUMERIC(4, 2) DEFAULT 1.0,             -- 1.5x, 2x demand vs baseline
  pricing_opportunity    VARCHAR(20),                           -- premium | normal | discount
  lead_time_weeks        INT DEFAULT 4,                         -- weeks before month to start prep
  preparation_tips       JSONB NOT NULL DEFAULT '[]',
  historical_performance JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasonal_opp_city_month
  ON seasonal_opportunities(city, month);
CREATE INDEX IF NOT EXISTS idx_seasonal_opp_service_type
  ON seasonal_opportunities(service_type, month);
