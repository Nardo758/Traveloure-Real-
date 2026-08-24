-- Migration 069: Demand requests — service_demand_signals table.
--
-- Core demand signal store for the Service Recommendation Engine. Each row
-- represents an aggregated demand observation (city + service type) derived
-- from TravelPulse trends, user search behaviour, or booking data. Powers
-- GET /api/recommendations/demand-signals and the provider dashboard
-- "Opportunity Radar" widget.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS; safe to re-run.

CREATE TABLE IF NOT EXISTS service_demand_signals (
  id                VARCHAR PRIMARY KEY,
  city              VARCHAR(100) NOT NULL,
  country           VARCHAR(100),
  service_type      VARCHAR(100) NOT NULL,
  category_slug     VARCHAR(100),
  demand_level      VARCHAR(20)  NOT NULL,                      -- low | medium | high | critical
  demand_score      INT          NOT NULL DEFAULT 0,            -- 0–1000
  trend_direction   VARCHAR(10)           DEFAULT 'stable',     -- up | down | stable
  trend_velocity    INT                   DEFAULT 0,
  search_volume     INT                   DEFAULT 0,
  supply_gap        INT                   DEFAULT 0,
  average_price     NUMERIC(10, 2),
  price_trend       VARCHAR(10),                                -- rising | falling | stable
  seasonal_peak     JSONB        NOT NULL DEFAULT '[]',         -- months with peak demand
  trigger_events    JSONB        NOT NULL DEFAULT '[]',
  related_trends    JSONB        NOT NULL DEFAULT '[]',
  data_source       VARCHAR(50)           DEFAULT 'travelpulse',
  confidence_score  INT                   DEFAULT 80,           -- 0–100
  expires_at        TIMESTAMP,
  created_at        TIMESTAMP             DEFAULT NOW(),
  updated_at        TIMESTAMP             DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sds_city_service
  ON service_demand_signals(city, service_type);
CREATE INDEX IF NOT EXISTS idx_sds_demand_level
  ON service_demand_signals(demand_level, demand_score DESC);
